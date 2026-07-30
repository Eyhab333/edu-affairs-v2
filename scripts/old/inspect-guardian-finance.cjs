const {
  applicationDefault,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID =
  process.env.GCLOUD_PROJECT || "edu-affairs-dev";

const ORG_ID = process.env.ORG_ID || "takween";

const studentArg = process.argv.find((value) =>
  value.startsWith("--student="),
);

const STUDENT_ID = studentArg
  ? studentArg.slice("--student=".length).trim()
  : "";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const db = getFirestore();

function normalize(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalize(item),
      ]),
    );
  }

  return value;
}

function printTitle(title) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(title);
  console.log("=".repeat(72));
}

function printDocs(snapshot) {
  if (snapshot.empty) {
    console.log("لا توجد مستندات.");
    return;
  }

  for (const document of snapshot.docs) {
    console.log(`\n[${document.ref.path}]`);

    console.dir(normalize(document.data()), {
      depth: null,
      colors: true,
    });
  }
}

async function inspectStudent(orgRef, studentId) {
  printTitle(`تفاصيل الطالب: ${studentId}`);

  const candidateStudentPaths = [
    orgRef.collection("students").doc(studentId),
    orgRef.collection("studentProfiles").doc(studentId),
  ];

  let foundStudent = false;

  for (const reference of candidateStudentPaths) {
    const snapshot = await reference.get();

    if (!snapshot.exists) {
      continue;
    }

    foundStudent = true;

    console.log(`\n[${reference.path}]`);

    console.dir(normalize(snapshot.data()), {
      depth: null,
      colors: true,
    });
  }

  if (!foundStudent) {
    console.log(
      "لم يُعثر على مستند الطالب في المسارات المباشرة المتوقعة.",
    );
  }

  const relatedCollections = [
    "guardianLinks",
    "studentEnrollments",
    "enrollments",
    "studentSchoolEnrollments",
    "studentAcademicEnrollments",
  ];

  for (const collectionName of relatedCollections) {
    printTitle(`${collectionName} المرتبطة بالطالب`);

    try {
      const snapshot = await orgRef
        .collection(collectionName)
        .where("studentId", "==", studentId)
        .limit(50)
        .get();

      printDocs(snapshot);
    } catch (error) {
      console.log(
        `تعذر فحص ${collectionName}:`,
        error.message,
      );
    }
  }
}

async function main() {
  console.log({
    projectId: PROJECT_ID,
    orgId: ORG_ID,
    studentId: STUDENT_ID || "غير محدد",
  });

  const orgRef = db.collection("orgs").doc(ORG_ID);

  printTitle("المؤسسة");

  const orgSnapshot = await orgRef.get();

  if (!orgSnapshot.exists) {
    throw new Error(
      `المؤسسة غير موجودة: ${orgRef.path}`,
    );
  }

  console.dir(normalize(orgSnapshot.data()), {
    depth: null,
    colors: true,
  });

  printTitle("تعريفات الرسوم الحالية");

  const feeDefinitionsSnapshot = await orgRef
    .collection("feeDefinitions")
    .get();

  printDocs(feeDefinitionsSnapshot);

  printTitle(
    "المدارس والسنوات النشطة والصفوف والفصول",
  );

  const schoolsSnapshot = await orgRef
    .collection("schools")
    .get();

  if (schoolsSnapshot.empty) {
    console.log("لا توجد مدارس.");
  }

  for (const schoolDocument of schoolsSnapshot.docs) {
    const school = normalize(schoolDocument.data());

    console.log(
      `\nالمدرسة: ${
        school.name ||
        school.title ||
        schoolDocument.id
      }`,
    );

    console.log(`schoolId: ${schoolDocument.id}`);

    const yearsSnapshot = await schoolDocument.ref
      .collection("academicYears")
      .get();

    for (const yearDocument of yearsSnapshot.docs) {
      const year = normalize(yearDocument.data());

      console.log(
        `  السنة: ${
          year.title || yearDocument.id
        } | academicYearId: ${
          yearDocument.id
        } | isActive: ${year.isActive}`,
      );

      const [gradesSnapshot, classesSnapshot] =
        await Promise.all([
          yearDocument.ref.collection("grades").get(),
          yearDocument.ref.collection("classes").get(),
        ]);

      const grades = gradesSnapshot.docs.map(
        (document) => {
          const data = normalize(document.data());

          return {
            id: document.id,
            title:
              data.title ||
              data.name ||
              data.code ||
              "",
            archived: data.isArchived === true,
          };
        },
      );

      const classes = classesSnapshot.docs.map(
        (document) => {
          const data = normalize(document.data());

          return {
            id: document.id,
            title:
              data.title ||
              data.name ||
              data.code ||
              "",
            gradeId: data.gradeId || "",
            archived: data.isArchived === true,
          };
        },
      );

      console.log("  الصفوف:");
      console.table(grades);

      console.log("  الفصول:");
      console.table(classes);
    }
  }

  printTitle("ملخص مجموعات خدمات ولي الأمر");

  const collectionNames = [
    "students",
    "guardians",
    "guardianLinks",
    "feeDefinitions",
    "studentFeeCharges",
    "studentFeeInstallments",
    "guardianPayments",
    "guardianFinanceReceipts",
  ];

  for (const collectionName of collectionNames) {
    const snapshot = await orgRef
      .collection(collectionName)
      .limit(10)
      .get();

    console.log(
      `${collectionName}: sample=${snapshot.size}${
        snapshot.size === 10 ? "+" : ""
      }`,
    );
  }

  if (STUDENT_ID) {
    await inspectStudent(orgRef, STUDENT_ID);
  } else {
    printTitle("فحص طالب محدد");

    console.log(
      "لتضمين بيانات طالب وتشخيص سبب عدم مطابقة الرسم شغّل:\n" +
        "node scripts/inspect-guardian-finance.cjs --student=STUDENT_ID",
    );
  }

  printTitle("انتهى الفحص بدون أي كتابة");
}

main().catch((error) => {
  console.error("\nفشل الفحص:");
  console.error(error);
  process.exitCode = 1;
});