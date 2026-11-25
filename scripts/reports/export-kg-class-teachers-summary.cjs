const path = require("node:path");
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");

const serviceAccount = require("../service-account.json");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
  outputFileName: "kg-class-teachers-summary-ay-1448.xlsx",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function text(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value).trim();
  }

  return "";
}

function isActive(data) {
  const status = text(data?.status).toUpperCase();

  return (
    data?.isArchived !== true &&
    data?.isActive !== false &&
    data?.active !== false &&
    !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status)
  );
}

function label(data, fallback) {
  return (
    text(data?.displayName) ||
    text(data?.nameAr) ||
    text(data?.title) ||
    text(data?.name) ||
    text(data?.shortName) ||
    text(data?.nameEn) ||
    fallback
  );
}

function classKey(schoolId, classId) {
  return `${schoolId}::${classId}`;
}

function teacherClassKey(schoolId, classId, teacherPersonId) {
  return `${schoolId}::${classId}::${teacherPersonId}`;
}

function isKgGrade(gradeId) {
  return ["kg1", "kg2", "kg3"].includes(text(gradeId).toLowerCase());
}

function levelFallback(gradeId) {
  switch (text(gradeId).toLowerCase()) {
    case "kg1":
      return "المستوى الأول";
    case "kg2":
      return "المستوى الثاني";
    case "kg3":
      return "المستوى الثالث";
    default:
      return gradeId || "غير محدد";
  }
}

function isSpecialKgSubject(assignment) {
  const subjectKey = text(assignment.subjectKey).toUpperCase();

  return subjectKey === "VALUES" || subjectKey === "CORNERS";
}

function looksLikeClassTeacherAssignment(assignment) {
  if (!isActive(assignment)) {
    return false;
  }

  if (text(assignment.academicYearId) !== CONFIG.academicYearId) {
    return false;
  }

  if (!CONFIG.schoolIds.includes(text(assignment.schoolId))) {
    return false;
  }

  const gradeId = text(assignment.gradeId);

  if (!isKgGrade(gradeId)) {
    return false;
  }

  const scopeType = text(assignment.targetScopeType).toUpperCase();

  if (scopeType && scopeType !== "CLASS") {
    return false;
  }

  const classId = text(assignment.targetScopeId) || text(assignment.classId);

  if (!classId) {
    return false;
  }

  if (!text(assignment.teacherPersonId)) {
    return false;
  }

  /*
   * التوزيع الحالي للروضات يضع وصف الدور داخل note مثل:
   * KG bulk assignment role: معلمة الصف - المستوى الأول
   *
   * نعطي هذا الدليل الأولوية.
   */
  const note = text(assignment.note);

  if (note.includes("معلمة الصف")) {
    return true;
  }

  /*
   * توافق مع بعض السجلات الأقدم:
   * معلمة الصف ترتبط بمواد الفصل الأساسية،
   * بينما نستبعد معلمة القيم ومعلمة الأركان.
   */
  if (
    text(assignment.assignmentKind).toUpperCase() === "SUBJECT_TEACHER" &&
    !isSpecialKgSubject(assignment)
  ) {
    return true;
  }

  return false;
}

async function loadSchools() {
  const schools = new Map();

  const snapshots = await db.getAll(
    ...CONFIG.schoolIds.map((schoolId) =>
      db.doc(`orgs/${CONFIG.orgId}/schools/${schoolId}`),
    ),
  );

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    schools.set(snapshot.id, {
      id: snapshot.id,
      name: label(snapshot.data(), snapshot.id),
    });
  }

  return schools;
}

async function loadSchoolStructures() {
  const structures = new Map();

  for (const schoolId of CONFIG.schoolIds) {
    const yearPath =
      `orgs/${CONFIG.orgId}/schools/${schoolId}` +
      `/academicYears/${CONFIG.academicYearId}`;

    const [gradesSnapshot, classesSnapshot] = await Promise.all([
      db.collection(`${yearPath}/grades`).get(),
      db.collection(`${yearPath}/classes`).get(),
    ]);

    const grades = new Map();
    const classes = new Map();

    for (const doc of gradesSnapshot.docs) {
      const data = doc.data();

      grades.set(doc.id, {
        id: doc.id,
        title: label(data, levelFallback(doc.id)),
      });
    }

    for (const doc of classesSnapshot.docs) {
      const data = doc.data();

      if (
        data.isArchived === true ||
        data.isActive === false ||
        text(data.status).toUpperCase() === "ARCHIVED"
      ) {
        continue;
      }

      classes.set(doc.id, {
        id: doc.id,
        gradeId: text(data.gradeId),
        title:
          text(data.title) ||
          text(data.name) ||
          text(data.sectionLabel) ||
          text(data.code) ||
          doc.id,
      });
    }

    structures.set(schoolId, {
      grades,
      classes,
    });
  }

  return structures;
}

async function loadStudentCounts() {
  const snapshot = await db
    .collection(`orgs/${CONFIG.orgId}/studentEnrollments`)
    .where("academicYearId", "==", CONFIG.academicYearId)
    .where("status", "==", "ACTIVE")
    .get();

  const studentsByClass = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const schoolId = text(data.schoolId);
    const classId = text(data.classId);
    const studentId = text(data.studentId);

    if (!CONFIG.schoolIds.includes(schoolId) || !classId || !studentId) {
      continue;
    }

    const key = classKey(schoolId, classId);

    if (!studentsByClass.has(key)) {
      studentsByClass.set(key, new Set());
    }

    studentsByClass.get(key).add(studentId);
  }

  return studentsByClass;
}

async function loadClassTeachers() {
  const snapshot = await db
    .collection(`orgs/${CONFIG.orgId}/teacherAssignments`)
    .get();

  const teachersByClass = new Map();
  const referencedPersonIds = new Set();

  for (const doc of snapshot.docs) {
    const assignment = {
      id: doc.id,
      ...doc.data(),
    };

    if (!looksLikeClassTeacherAssignment(assignment)) {
      continue;
    }

    const schoolId = text(assignment.schoolId);
    const classId = text(assignment.targetScopeId) || text(assignment.classId);

    const gradeId = text(assignment.gradeId);
    const teacherPersonId = text(assignment.teacherPersonId);

    const uniqueKey = teacherClassKey(schoolId, classId, teacherPersonId);

    if (!teachersByClass.has(uniqueKey)) {
      teachersByClass.set(uniqueKey, {
        schoolId,
        classId,
        gradeId,
        teacherPersonId,
      });

      referencedPersonIds.add(teacherPersonId);
    }
  }

  const people = new Map();

  if (referencedPersonIds.size > 0) {
    const snapshots = await db.getAll(
      ...Array.from(referencedPersonIds).map((personId) =>
        db.doc(`orgs/${CONFIG.orgId}/people/${personId}`),
      ),
    );

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }

      people.set(snapshot.id, label(snapshot.data(), snapshot.id));
    }
  }

  return {
    assignments: Array.from(teachersByClass.values()),
    people,
  };
}

async function main() {
  const [schools, structures, studentsByClass, teacherData] = await Promise.all(
    [
      loadSchools(),
      loadSchoolStructures(),
      loadStudentCounts(),
      loadClassTeachers(),
    ],
  );

  const rows = [];

  for (const assignment of teacherData.assignments) {
    const structure = structures.get(assignment.schoolId);

    if (!structure) {
      continue;
    }

    const classInfo = structure.classes.get(assignment.classId);

    if (!classInfo) {
      continue;
    }

    const gradeId = assignment.gradeId || classInfo.gradeId;

    const gradeInfo = structure.grades.get(gradeId);

    const count =
      studentsByClass.get(classKey(assignment.schoolId, assignment.classId))
        ?.size ?? 0;

    rows.push({
      schoolId: assignment.schoolId,

      schoolName: schools.get(assignment.schoolId)?.name || assignment.schoolId,

      teacherName:
        teacherData.people.get(assignment.teacherPersonId) ||
        assignment.teacherPersonId,

      levelTitle: gradeInfo?.title || levelFallback(gradeId),

      classTitle: classInfo.title || assignment.classId,

      studentCount: count,
    });
  }

  rows.sort((left, right) => {
    const schoolOrder =
      CONFIG.schoolIds.indexOf(left.schoolId) -
      CONFIG.schoolIds.indexOf(right.schoolId);

    if (schoolOrder !== 0) {
      return schoolOrder;
    }

    const levelCompare = left.levelTitle.localeCompare(right.levelTitle, "ar");

    if (levelCompare !== 0) {
      return levelCompare;
    }

    return left.classTitle.localeCompare(right.classTitle, "ar");
  });

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Takween";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("معلمات الروضات", {
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
      header: "الروضة",
      key: "schoolName",
      width: 34,
    },
    {
      header: "اسم المعلمة",
      key: "teacherName",
      width: 32,
    },
    {
      header: "المستوى",
      key: "levelTitle",
      width: 22,
    },
    {
      header: "الفصل",
      key: "classTitle",
      width: 28,
    },
    {
      header: "عدد الطلاب",
      key: "studentCount",
      width: 16,
    },
  ];

  for (const row of rows) {
    sheet.addRow(row);
  }

  const headerRow = sheet.getRow(1);

  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  headerRow.height = 26;

  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      vertical: "middle",
    };

    if (rowNumber > 1) {
      row.getCell(5).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }
  });

  sheet.autoFilter = {
    from: "A1",
    to: "E1",
  };

  const outputPath = path.join(__dirname, CONFIG.outputFileName);

  await workbook.xlsx.writeFile(outputPath);

  console.log(outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
