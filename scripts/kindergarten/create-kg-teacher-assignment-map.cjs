const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_PATH = path.join(
  ROOT,
  "scripts",
  "inspections",
  "inspect-kindergarten-setup-report.json",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "scripts",
  "kindergarten",
  "inputs",
  "kg-teacher-assignment-map.xlsx",
);

const SCHOOL_ORDER = ["kg-01", "kg-02", "kg-03", "kg-04"];

const ASSIGNMENT_ROWS = [
  {
    assignmentRole: "معلمة الصف - المستوى الأول",
    gradeId: "kg1",
    classId: "kg1-a",
  },
  {
    assignmentRole: "معلمة الصف - المستوى الثاني",
    gradeId: "kg2",
    classId: "kg2-a",
  },
  {
    assignmentRole: "معلمة الصف - المستوى الثالث",
    gradeId: "kg3",
    classId: "kg3-a",
  },
  {
    assignmentRole: "معلمة القيم",
    gradeId: "kg2,kg3",
    classId: "kg2-a,kg3-a",
  },
  {
    assignmentRole: "معلمة الأركان",
    gradeId: "kg2,kg3",
    classId: "kg2-a,kg3-a",
  },
];

const ASSIGNMENT_HEADERS = [
  "schoolId",
  "schoolName",
  "assignmentRole",
  "gradeId",
  "classId",
  "teacherEmail",
  "personId",
  "teacherDisplayName",
];

const TEACHER_HEADERS = [
  "schoolId",
  "schoolName",
  "teacherEmail",
  "personId",
  "displayName",
  "uid",
];

function loadReport() {
  if (!fs.existsSync(REPORT_PATH)) {
    throw new Error(`Inspection report not found: ${REPORT_PATH}`);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

  if (report.metadata?.orgId !== "takween") {
    throw new Error(`Expected org takween in inspection report.`);
  }

  return report;
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: "FFFFFFFF" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: "FF163A5B" },
    };
  });
}

function styleBody(worksheet, startRow, endRow, columnCount) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 24;
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        bottom: { style: "hair", color: "FFD9E2F3" },
      };
    }
  }
}

function setColumnWidths(worksheet, widths) {
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
}

function buildAssignmentRows(report) {
  const schoolNames = new Map(
    (report.schools || []).map((school) => [school.id, school.name || school.id]),
  );

  return SCHOOL_ORDER.flatMap((schoolId) =>
    ASSIGNMENT_ROWS.map((assignment) => [
      schoolId,
      schoolNames.get(schoolId) || schoolId,
      assignment.assignmentRole,
      assignment.gradeId,
      assignment.classId,
      "",
      "",
      "",
    ]),
  );
}

function buildTeacherRows(report) {
  const schoolNames = new Map(
    (report.schools || []).map((school) => [school.id, school.name || school.id]),
  );

  const teachers = (report.kgTeacherMemberships || [])
    .flatMap((teacher) => {
      const schoolIds = Array.isArray(teacher.schoolIds) ? teacher.schoolIds : [];
      return schoolIds
        .filter((schoolId) => SCHOOL_ORDER.includes(schoolId))
        .map((schoolId) => ({
          schoolId,
          schoolName: schoolNames.get(schoolId) || schoolId,
          teacherEmail: "",
          personId: teacher.personId || "",
          displayName: teacher.displayName || "",
          uid: teacher.uid || "",
        }));
    })
    .sort((left, right) => {
      const schoolCompare = SCHOOL_ORDER.indexOf(left.schoolId) - SCHOOL_ORDER.indexOf(right.schoolId);
      if (schoolCompare !== 0) return schoolCompare;
      return left.displayName.localeCompare(right.displayName, "ar");
    });

  return teachers.map((teacher) => [
    teacher.schoolId,
    teacher.schoolName,
    teacher.teacherEmail,
    teacher.personId,
    teacher.displayName,
    teacher.uid,
  ]);
}

async function main() {
  const report = loadReport();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.subject = "Phase B kindergarten teacher assignment input";
  workbook.properties.title = "KG Teacher Assignment Map";

  const distributionSheet = workbook.addWorksheet("التوزيع", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  distributionSheet.addRow(ASSIGNMENT_HEADERS);
  styleHeader(distributionSheet.getRow(1));
  const assignmentRows = buildAssignmentRows(report);
  assignmentRows.forEach((row) => distributionSheet.addRow(row));
  styleBody(distributionSheet, 2, assignmentRows.length + 1, ASSIGNMENT_HEADERS.length);
  distributionSheet.autoFilter = {
    from: "A1",
    to: `H${assignmentRows.length + 1}`,
  };
  distributionSheet.getRow(1).commit();
  setColumnWidths(distributionSheet, [14, 30, 34, 14, 18, 28, 24, 30]);

  const teachersSheet = workbook.addWorksheet("المعلمات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }],
  });
  teachersSheet.mergeCells("A1:F1");
  const noteCell = teachersSheet.getCell("A1");
  noteCell.value = "ملاحظة: Only select teachers from the same school.";
  noteCell.font = { bold: true, color: "FF7F6000" };
  noteCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF2CC" },
  };
  noteCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  teachersSheet.getRow(1).height = 30;
  teachersSheet.mergeCells("A2:F2");
  const sourceCell = teachersSheet.getCell("A2");
  sourceCell.value = "Source: scripts/inspections/inspect-kindergarten-setup-report.json";
  sourceCell.font = { italic: true, color: "FF666666" };
  sourceCell.alignment = { horizontal: "left", vertical: "middle" };
  teachersSheet.getRow(2).height = 22;
  teachersSheet.addRow(TEACHER_HEADERS);
  styleHeader(teachersSheet.getRow(3));
  const teacherRows = buildTeacherRows(report);
  teacherRows.forEach((row) => teachersSheet.addRow(row));
  styleBody(teachersSheet, 4, teacherRows.length + 3, TEACHER_HEADERS.length);
  teachersSheet.autoFilter = {
    from: "A3",
    to: `F${teacherRows.length + 3}`,
  };
  setColumnWidths(teachersSheet, [14, 30, 28, 24, 34, 34]);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  await workbook.xlsx.writeFile(OUTPUT_PATH);

  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    distributionRows: assignmentRows.length,
    teacherRows: teacherRows.length,
    sheetNames: workbook.worksheets.map((sheet) => sheet.name),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
