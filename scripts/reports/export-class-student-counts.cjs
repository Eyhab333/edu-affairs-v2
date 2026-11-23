const path = require("node:path");
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");

const serviceAccount = require("../service-account.json");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  outputFileName: "class-student-counts-ay-1448.xlsx",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortArabic(left, right) {
  return left.localeCompare(right, "ar");
}

async function loadSchools(orgId) {
  const snapshot = await db
    .collection("orgs")
    .doc(orgId)
    .collection("schools")
    .get();

  const schools = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (
      data.isArchived === true ||
      data.archived === true ||
      text(data.status).toUpperCase() === "ARCHIVED"
    ) {
      continue;
    }

    schools.set(doc.id, {
      id: doc.id,
      name:
        text(data.nameAr) || text(data.name) || text(data.shortName) || doc.id,
    });
  }

  return schools;
}

async function loadSchoolStructure({ orgId, schoolId, academicYearId }) {
  const yearRef = db
    .collection("orgs")
    .doc(orgId)
    .collection("schools")
    .doc(schoolId)
    .collection("academicYears")
    .doc(academicYearId);

  const [gradesSnapshot, classesSnapshot] = await Promise.all([
    yearRef.collection("grades").get(),
    yearRef.collection("classes").get(),
  ]);

  const grades = new Map();
  const classes = new Map();

  for (const doc of gradesSnapshot.docs) {
    const data = doc.data();

    grades.set(doc.id, {
      id: doc.id,
      title:
        text(data.title) ||
        text(data.name) ||
        text(data.displayName) ||
        text(data.shortTitle) ||
        doc.id,
    });
  }

  for (const doc of classesSnapshot.docs) {
    const data = doc.data();

    if (
      data.isArchived === true ||
      data.archived === true ||
      text(data.status).toUpperCase() === "ARCHIVED"
    ) {
      continue;
    }

    classes.set(doc.id, {
      id: doc.id,
      gradeId: text(data.gradeId),
      title:
        text(data.title) ||
        text(data.displayName) ||
        text(data.sectionLabel) ||
        text(data.code) ||
        doc.id,
    });
  }

  return {
    grades,
    classes,
  };
}

async function loadActiveEnrollments({ orgId, academicYearId }) {
  const snapshot = await db
    .collection("orgs")
    .doc(orgId)
    .collection("studentEnrollments")
    .where("academicYearId", "==", academicYearId)
    .where("status", "==", "ACTIVE")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function main() {
  const { orgId, academicYearId, outputFileName } = CONFIG;

  const [schools, enrollments] = await Promise.all([
    loadSchools(orgId),
    loadActiveEnrollments({
      orgId,
      academicYearId,
    }),
  ]);

  const schoolIds = [
    ...new Set(enrollments.map((item) => text(item.schoolId)).filter(Boolean)),
  ];

  const structures = new Map();

  for (const schoolId of schoolIds) {
    structures.set(
      schoolId,
      await loadSchoolStructure({
        orgId,
        schoolId,
        academicYearId,
      }),
    );
  }

  const grouped = new Map();

  for (const enrollment of enrollments) {
    const schoolId = text(enrollment.schoolId);
    const classId = text(enrollment.classId);
    const gradeId = text(enrollment.gradeId);
    const studentId = text(enrollment.studentId);

    if (!schoolId || !classId || !studentId) {
      continue;
    }

    const key = `${schoolId}::${classId}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        schoolId,
        gradeId,
        classId,
        studentIds: new Set(),
      });
    }

    grouped.get(key).studentIds.add(studentId);
  }

  const rows = [];

  for (const group of grouped.values()) {
    const school = schools.get(group.schoolId);
    const structure = structures.get(group.schoolId);

    const classInfo = structure?.classes.get(group.classId);
    const effectiveGradeId = group.gradeId || classInfo?.gradeId || "";

    const gradeInfo = structure?.grades.get(effectiveGradeId);

    rows.push({
      schoolId: group.schoolId,
      schoolName: school?.name || group.schoolId,
      gradeId: effectiveGradeId,
      gradeTitle: gradeInfo?.title || effectiveGradeId || "غير محدد",
      classId: group.classId,
      classTitle: classInfo?.title || group.classId,
      studentCount: group.studentIds.size,
    });
  }

  rows.sort((a, b) => {
    const schoolCompare = sortArabic(a.schoolName, b.schoolName);

    if (schoolCompare !== 0) {
      return schoolCompare;
    }

    const gradeCompare = sortArabic(a.gradeTitle, b.gradeTitle);

    if (gradeCompare !== 0) {
      return gradeCompare;
    }

    return sortArabic(a.classTitle, b.classTitle);
  });

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Takween";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("إحصائية الفصول", {
    views: [
      {
        rightToLeft: true,
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  sheet.columns = [
    {
      header: "المدرسة",
      key: "schoolName",
      width: 30,
    },
    {
      header: "الصف",
      key: "gradeTitle",
      width: 22,
    },
    {
      header: "الفصل",
      key: "classTitle",
      width: 25,
    },
    {
      header: "عدد الطلاب",
      key: "studentCount",
      width: 16,
    },
  ];

  const headerRow = sheet.getRow(1);

  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  headerRow.height = 24;

  let currentSchoolId = null;
  let schoolTotal = 0;
  let grandTotal = 0;

  function addSchoolTotal() {
    if (!currentSchoolId) {
      return;
    }

    const row = sheet.addRow({
      schoolName: "إجمالي المدرسة",
      gradeTitle: "",
      classTitle: "",
      studentCount: schoolTotal,
    });

    row.font = {
      bold: true,
    };

    row.alignment = {
      vertical: "middle",
    };
  }

  for (const item of rows) {
    if (currentSchoolId && currentSchoolId !== item.schoolId) {
      addSchoolTotal();

      sheet.addRow([]);

      schoolTotal = 0;
    }

    currentSchoolId = item.schoolId;

    sheet.addRow({
      schoolName: item.schoolName,
      gradeTitle: item.gradeTitle,
      classTitle: item.classTitle,
      studentCount: item.studentCount,
    });

    schoolTotal += item.studentCount;
    grandTotal += item.studentCount;
  }

  addSchoolTotal();

  sheet.addRow([]);

  const grandTotalRow = sheet.addRow({
    schoolName: "الإجمالي العام",
    gradeTitle: "",
    classTitle: "",
    studentCount: grandTotal,
  });

  grandTotalRow.font = {
    bold: true,
    size: 13,
  };

  sheet.eachRow((row) => {
    row.alignment = {
      ...row.alignment,
      vertical: "middle",
    };

    row.getCell(4).alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  });

  sheet.autoFilter = {
    from: "A1",
    to: "D1",
  };

  const outputPath = path.join(__dirname, outputFileName);

  await workbook.xlsx.writeFile(outputPath);

  console.log(outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
