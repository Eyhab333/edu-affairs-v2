const admin = require("firebase-admin");

const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * عدّل هذه القيم حسب الفصل الذي تريد ربط الطلاب به.
 *
 * مهم جدًا:
 * classId لازم يكون فصل ظاهر في actor.visibleClasses
 * حتى تظهر الطلاب داخل /staff/classes/[classId]
 */
const CONFIG = {
  orgId: "takween",

  schoolId: "mrb-boys-sayh",
  academicYearId: "ay-1448",
  gradeId: "g1",
  streamId: "stream-general",
  classId: "g1-general-1",

  dryRun: false,
};

function nowMs() {
  return Date.now();
}

async function main() {
  const {
    orgId,
    schoolId,
    academicYearId,
    gradeId,
    streamId,
    classId,
    dryRun,
  } = CONFIG;

  console.log("بدء إنشاء تسجيلات الطلاب...");
  console.log("CONFIG:", CONFIG);

  const studentsRef = db.collection("orgs").doc(orgId).collection("students");
  const studentsSnap = await studentsRef.where("isArchived", "==", false).get();

  if (studentsSnap.empty) {
    console.log("لا يوجد طلاب غير مؤرشفين.");
    return;
  }

  const enrollmentsRef = db
    .collection("orgs")
    .doc(orgId)
    .collection("studentEnrollments");

  const timestamp = nowMs();

  let createdCount = 0;
  let skippedCount = 0;

  for (const studentDoc of studentsSnap.docs) {
    const studentId = studentDoc.id;
    const studentData = studentDoc.data();

    const enrollmentId = `${academicYearId}_${classId}_${studentId}`;

    const enrollmentRef = enrollmentsRef.doc(enrollmentId);
    const existingEnrollmentSnap = await enrollmentRef.get();

    if (existingEnrollmentSnap.exists) {
      console.log(`تخطي: يوجد تسجيل مسبق للطالب ${studentId}`);
      skippedCount += 1;
      continue;
    }

    const enrollmentData = {
      id: enrollmentId,
      orgId,
      schoolId,
      academicYearId,
      studentId,
      gradeId,
      streamId,
      classId,
      status: "ACTIVE",
      startAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,

      /**
       * حقول مساعدة للتتبع فقط
       */
      seededBy: "seed-student-enrollments.cjs",
      studentPersonId: studentData.personId || "",
    };

    if (dryRun) {
      console.log("DRY RUN - سيتم إنشاء:", enrollmentId, enrollmentData);
    } else {
      await enrollmentRef.set(enrollmentData, { merge: true });
      console.log(`تم إنشاء تسجيل للطالب: ${studentId}`);
    }

    createdCount += 1;
  }

  console.log("انتهى السكريبت.");
  console.log(`تم الإنشاء: ${createdCount}`);
  console.log(`تم التخطي: ${skippedCount}`);
}

main().catch((error) => {
  console.error("حدث خطأ:", error);
  process.exit(1);
});