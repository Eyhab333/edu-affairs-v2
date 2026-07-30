/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";

/**
 * الطالب المستهدف افتراضيًا.
 * يمكن تغيير studentId من الأمر:
 * node scripts/link-parent-to-existing-student.js --email=parent@test.com --studentId=student-xxx
 */
const TARGET = {
  schoolId: "mrb-boys-sayh",
  academicYearId: "ay-1448",
  gradeId: "g1",
  classId: "g1-general-1",
  streamId: "stream-general",

  studentId: "student-1777289315910",

  /**
   * لو تركناه فارغًا سنقرأه من مستند الطالب.
   */
  studentPersonId: "person-1777289315910",

  /**
   * لو تركناه فارغًا سنبحث عن القيد النشط للطالب.
   */
  enrollmentId: "ay-1448_g1-general-1_student-1777289315910",
};

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length).trim();
}

function required(value, message) {
  if (!value) {
    console.error(message);
    process.exit(1);
  }

  return value;
}

function nowMs() {
  return Date.now();
}

function pickString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    console.error(`لم يتم العثور على مستخدم في Firebase Auth بهذا البريد: ${email}`);
    throw error;
  }
}

async function readDoc(docPath) {
  const snap = await db.doc(docPath).get();

  if (!snap.exists) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function setDoc(docPath, data) {
  await db.doc(docPath).set(data, { merge: true });
  console.log(`✓ ${docPath}`);
}

async function setDocWithCreatedAt(docPath, data, timestamp) {
  const existing = await readDoc(docPath);

  await setDoc(docPath, {
    ...data,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
}

async function findGuardianByPersonId(personId) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/guardians`)
    .where("personId", "==", personId)
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data.isArchived !== true) {
      return {
        id: data.id || doc.id,
        ...data,
      };
    }
  }

  return null;
}

async function findActiveEnrollmentForStudent(target) {
  if (target.enrollmentId) {
    const enrollmentPath = `orgs/${ORG_ID}/studentEnrollments/${target.enrollmentId}`;
    const enrollmentData = await readDoc(enrollmentPath);

    if (!enrollmentData) {
      console.error(`القيد الدراسي غير موجود: ${enrollmentPath}`);
      process.exit(1);
    }

    return {
      id: target.enrollmentId,
      ...enrollmentData,
    };
  }

  const snap = await db
    .collection(`orgs/${ORG_ID}/studentEnrollments`)
    .where("studentId", "==", target.studentId)
    .where("status", "==", "ACTIVE")
    .limit(10)
    .get();

  const matches = [];

  for (const doc of snap.docs) {
    const data = doc.data();

    if (
      data.schoolId === target.schoolId &&
      data.academicYearId === target.academicYearId &&
      data.gradeId === target.gradeId &&
      data.classId === target.classId
    ) {
      matches.push({
        id: data.id || doc.id,
        ...data,
      });
    }
  }

  if (matches.length === 0) {
    console.error("لم يتم العثور على قيد دراسي نشط مطابق للطالب.");
    console.error({
      expected: {
        studentId: target.studentId,
        schoolId: target.schoolId,
        academicYearId: target.academicYearId,
        gradeId: target.gradeId,
        classId: target.classId,
      },
    });
    process.exit(1);
  }

  if (matches.length > 1) {
    console.warn("تنبيه: تم العثور على أكثر من قيد مطابق، سيتم استخدام الأول.");
    console.warn(matches.map((item) => item.id));
  }

  return matches[0];
}

function buildTargetFromArgs() {
  return {
    schoolId: getArg("schoolId", TARGET.schoolId),
    academicYearId: getArg("academicYearId", TARGET.academicYearId),
    gradeId: getArg("gradeId", TARGET.gradeId),
    classId: getArg("classId", TARGET.classId),
    streamId: getArg("streamId", TARGET.streamId),
    studentId: getArg("studentId", TARGET.studentId),
    studentPersonId: getArg("studentPersonId", TARGET.studentPersonId),
    enrollmentId: getArg("enrollmentId", TARGET.enrollmentId),
  };
}

async function main() {
  const email = required(
    getArg("email"),
    "استخدم الأمر هكذا: node scripts/link-parent-to-existing-student.js --email=parent@test.com"
  );

  const relationType = getArg("relationType", "FATHER");
  const target = buildTargetFromArgs();
  const timestamp = nowMs();

  console.log("بدء ربط ولي الأمر بطالب موجود...");
  console.log({
    orgId: ORG_ID,
    email,
    targetStudentId: target.studentId,
    targetEnrollmentId: target.enrollmentId || "(سيتم البحث تلقائيًا)",
    relationType,
  });
  console.log("");

  const authUser = await getUserByEmail(email);

  const userPath = `users/${authUser.uid}`;
  const userData = await readDoc(userPath);

  if (!userData) {
    console.error(`لا يوجد مستند مستخدم: ${userPath}`);
    process.exit(1);
  }

  const parentPersonId = pickString(userData.personId);

  if (!parentPersonId) {
    console.error(`مستند المستخدم لا يحتوي على personId: ${userPath}`);
    process.exit(1);
  }

  let guardian = await findGuardianByPersonId(parentPersonId);

  if (!guardian) {
    const guardianId = `g-parent-${authUser.uid}`;

    console.log("لم يتم العثور على Guardian، سيتم إنشاؤه...");

    await setDocWithCreatedAt(
      `orgs/${ORG_ID}/guardians/${guardianId}`,
      {
        id: guardianId,
        orgId: ORG_ID,
        personId: parentPersonId,

        /**
         * مهم للحصص الافتراضية وقواعد Firestore.
         */
        uid: authUser.uid,
        authUid: authUser.uid,
        userUid: authUser.uid,

        isArchived: false,
      },
      timestamp
    );

    guardian = {
      id: guardianId,
      orgId: ORG_ID,
      personId: parentPersonId,
      uid: authUser.uid,
      authUid: authUser.uid,
      userUid: authUser.uid,
      isArchived: false,
    };
  } else {
    /**
     * حتى لو كان Guardian موجودًا قديمًا، نحدّثه بـ Firebase Auth UID.
     * هذا هو الجزء المهم الذي يجعل guardianUids لا تكون فاضية.
     */
    await setDocWithCreatedAt(
      `orgs/${ORG_ID}/guardians/${guardian.id}`,
      {
        id: guardian.id,
        orgId: ORG_ID,
        personId: parentPersonId,

        uid: authUser.uid,
        authUid: authUser.uid,
        userUid: authUser.uid,

        isArchived: false,
      },
      timestamp
    );

    guardian = {
      ...guardian,
      uid: authUser.uid,
      authUid: authUser.uid,
      userUid: authUser.uid,
      isArchived: false,
    };
  }

  await setDocWithCreatedAt(
    `users/${authUser.uid}/orgMemberships/${ORG_ID}`,
    {
      id: ORG_ID,
      uid: authUser.uid,
      personId: parentPersonId,
      orgId: ORG_ID,
      role: "GUARDIAN",
      roleKey: "GUARDIAN",
      title: "ولي أمر",
      isActive: true,
      active: true,
    },
    timestamp
  );

  const studentPath = `orgs/${ORG_ID}/students/${target.studentId}`;
  const studentData = await readDoc(studentPath);

  if (!studentData) {
    console.error(`الطالب غير موجود: ${studentPath}`);
    process.exit(1);
  }

  if (studentData.isArchived === true) {
    console.error(`الطالب مؤرشف ولا يمكن ربطه: ${target.studentId}`);
    process.exit(1);
  }

  const studentPersonId = target.studentPersonId || pickString(studentData.personId);

  if (!studentPersonId) {
    console.warn("تنبيه: لم نستطع تحديد personId الخاص بالطالب من TARGET ولا من مستند الطالب.");
  }

  const enrollmentData = await findActiveEnrollmentForStudent(target);

  const enrollmentChecks = [
    ["studentId", target.studentId],
    ["schoolId", target.schoolId],
    ["academicYearId", target.academicYearId],
    ["gradeId", target.gradeId],
    ["classId", target.classId],
    ["status", "ACTIVE"],
  ];

  for (const [key, expected] of enrollmentChecks) {
    if (enrollmentData[key] !== expected) {
      console.error(`القيد الدراسي غير مطابق في الحقل ${key}`);
      console.error({
        expected,
        actual: enrollmentData[key],
      });
      process.exit(1);
    }
  }

  if (target.streamId && enrollmentData.streamId !== target.streamId) {
    console.error("القيد الدراسي غير مطابق في الحقل streamId");
    console.error({
      expected: target.streamId,
      actual: enrollmentData.streamId,
    });
    process.exit(1);
  }

  if (studentPersonId) {
    const studentPersonPath = `orgs/${ORG_ID}/people/${studentPersonId}`;
    const studentPersonData = await readDoc(studentPersonPath);

    if (!studentPersonData) {
      console.warn(`تنبيه: لم يتم العثور على سجل شخص الطالب: ${studentPersonPath}`);
    }
  }

  /**
   * ID ثابت يمنع التكرار عند تشغيل السكريبت أكثر من مرة.
   * لا يحذف أي روابط قديمة.
   */
  const guardianLinkId = `gl-${guardian.id}-${target.studentId}`;

  await setDocWithCreatedAt(
    `orgs/${ORG_ID}/guardianLinks/${guardianLinkId}`,
    {
      id: guardianLinkId,
      orgId: ORG_ID,

      studentId: target.studentId,

      guardianId: guardian.id,

      /**
       * مهم للحصص الافتراضية:
       * عند إنشاء VirtualClassParticipant سنقرأ guardianUid من هنا.
       */
      guardianUid: authUser.uid,

      relationType,
      active: true,
      startAt: timestamp,
    },
    timestamp
  );

  console.log("");
  console.log("تم ربط ولي الأمر بالطالب بنجاح ✅");
  console.log("لم يتم حذف أي روابط قديمة.");
  console.log({
    uid: authUser.uid,
    email,
    parentPersonId,
    guardianId: guardian.id,
    guardianUid: authUser.uid,
    guardianLinkId,
    studentId: target.studentId,
    studentPersonId: studentPersonId || "",
    enrollmentId: enrollmentData.id,
    schoolId: target.schoolId,
    academicYearId: target.academicYearId,
    gradeId: target.gradeId,
    classId: target.classId,
    streamId: target.streamId,
  });
}

main().catch((error) => {
  console.error("فشل ربط ولي الأمر بالطالب:");
  console.error(error);
  process.exit(1);
});