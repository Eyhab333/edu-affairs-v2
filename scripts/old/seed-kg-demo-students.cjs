const admin = require("firebase-admin");

const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CONFIG = {
  orgId: "takween",
  schoolId: "kg-01",
  academicYearId: "ay-1448",
  streamId: "",

  /**
   * true = تجربة بدون كتابة
   * false = تنفيذ فعلي
   */
  dryRun: false,
};

const CLASS_GROUPS = [
  {
    gradeId: "kg1",
    classId: "kg1-a",
    classCode: "KG1-A",
    studentPrefix: "kg1",
    names: [
      "تالا أحمد السبيعي",
      "لين محمد القحطاني",
      "جود عبدالله العنزي",
      "ريماس خالد العتيبي",
      "نورة فهد الحربي",
    ],
  },
  {
    gradeId: "kg2",
    classId: "kg2-a",
    classCode: "KG2-A",
    studentPrefix: "kg2",
    names: [
      "سارة ناصر المطيري",
      "لمار سعد الدوسري",
      "غلا عبدالعزيز الشمري",
      "رند ماجد الغامدي",
      "جوري صالح الزهراني",
    ],
  },
  {
    gradeId: "kg3",
    classId: "kg3-a",
    classCode: "KG3-A",
    studentPrefix: "kg3",
    names: [
      "مها يوسف الشهراني",
      "ليان تركي المالكي",
      "دانة إبراهيم الحربي",
      "هيا راشد القحطاني",
      "رهف بندر العتيبي",
    ],
  },
];

function nowMs() {
  return Date.now();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeNationalId(groupIndex, studentIndex) {
  /**
   * أرقام وهمية للتجربة فقط.
   */
  return `30${pad2(groupIndex + 1)}000${pad2(studentIndex + 1)}`;
}

async function main() {
  const now = nowMs();

  console.log("بدء Seed طلاب تجربة الروضة...");
  console.log("CONFIG:", CONFIG);

  const peopleRef = db.collection("orgs").doc(CONFIG.orgId).collection("people");
  const studentsRef = db
    .collection("orgs")
    .doc(CONFIG.orgId)
    .collection("students");
  const enrollmentsRef = db
    .collection("orgs")
    .doc(CONFIG.orgId)
    .collection("studentEnrollments");

  const batch = db.batch();

  let peopleCount = 0;
  let studentsCount = 0;
  let enrollmentsCount = 0;

  for (let groupIndex = 0; groupIndex < CLASS_GROUPS.length; groupIndex++) {
    const group = CLASS_GROUPS[groupIndex];

    for (let index = 0; index < group.names.length; index++) {
      const serial = pad2(index + 1);

      const personId = `person-demo-${group.studentPrefix}-${serial}`;
      const studentId = `student-demo-${group.studentPrefix}-${serial}`;
      const enrollmentId = `${CONFIG.academicYearId}_${group.classId}_${studentId}`;

      const displayName = group.names[index];
      const nationalId = makeNationalId(groupIndex, index);

      const personData = {
        id: personId,
        displayName,
        nationalId,
        phone: "",
        email: "",
        createdAt: now,
        updatedAt: now,
        seededBy: "seed-kg-demo-students.cjs",
      };

      const studentData = {
        id: studentId,
        personId,
        orgId: CONFIG.orgId,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        seededBy: "seed-kg-demo-students.cjs",
      };

      const enrollmentData = {
        id: enrollmentId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId,
        studentId,
        gradeId: group.gradeId,
        streamId: CONFIG.streamId,
        classId: group.classId,
        status: "ACTIVE",
        startAt: now,
        createdAt: now,
        updatedAt: now,

        seededBy: "seed-kg-demo-students.cjs",
        classCode: group.classCode,
        studentPersonId: personId,
      };

      console.log("----------------------------------------");
      console.log("الطالب:", displayName);
      console.log("personId:", personId);
      console.log("studentId:", studentId);
      console.log("classId:", group.classId);
      console.log("gradeId:", group.gradeId);
      console.log("enrollmentId:", enrollmentId);

      if (!CONFIG.dryRun) {
        batch.set(peopleRef.doc(personId), personData, { merge: true });
        batch.set(studentsRef.doc(studentId), studentData, { merge: true });
        batch.set(enrollmentsRef.doc(enrollmentId), enrollmentData, {
          merge: true,
        });
      }

      peopleCount += 1;
      studentsCount += 1;
      enrollmentsCount += 1;
    }
  }

  if (CONFIG.dryRun) {
    console.log("----------------------------------------");
    console.log("DRY RUN فقط — لم يتم تعديل Firestore.");
  } else {
    await batch.commit();
    console.log("----------------------------------------");
    console.log("تم Seed طلاب تجربة الروضة بنجاح.");
  }

  console.log("people:", peopleCount);
  console.log("students:", studentsCount);
  console.log("studentEnrollments:", enrollmentsCount);
}

main().catch((error) => {
  console.error("حدث خطأ:", error);
  process.exit(1);
});