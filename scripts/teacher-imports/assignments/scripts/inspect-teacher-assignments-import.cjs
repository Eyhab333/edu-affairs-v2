const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "assignments",
  "inputs",
  "teacher-assignments-import-5.xlsx",
);

const SHEET_NAME = "التوزيع";

const EXPECTED_HEADERS = [
  "بريد المعلم",
  "معرّف المدرسة",
  "معرّف السنة الدراسية",
  "معرّف الفصل الدراسي",
  "معرّف الفصل",
  "اسم الفصل للتوضيح",
  "معرّف إسناد المادة",
  "رمز المادة",
  "اسم المادة للتوضيح",
  "حالة الإسناد",
];

const ALLOWED_STATUSES = new Set([
  "ACTIVE",
  "INACTIVE",
]);

function readCellText(cell) {
  const value = cell.value;

  if (value == null) return "";

  if (typeof value === "string") {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") {
      return value.text.trim();
    }

    if (value.result != null) {
      return String(value.result).trim();
    }

    if (Array.isArray(value.richText)) {
      return value.richText
        .map((item) => item.text || "")
        .join("")
        .trim();
    }
  }

  return String(value).trim();
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeSubjectKey(value) {
  return value.trim().toUpperCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  console.log(
    "Inspecting teacher assignments Excel import...",
  );

  console.log({
    inputFile: INPUT_FILE,
  });

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(
      `Excel file not found: ${INPUT_FILE}`,
    );
  }

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(INPUT_FILE);

  const worksheet = workbook.getWorksheet(
    SHEET_NAME,
  );

  if (!worksheet) {
    throw new Error(
      `Worksheet "${SHEET_NAME}" was not found.`,
    );
  }

  const actualHeaders = EXPECTED_HEADERS.map(
    (_, index) =>
      readCellText(
        worksheet.getRow(1).getCell(index + 1),
      ),
  );

  const headerErrors = [];

  EXPECTED_HEADERS.forEach(
    (expectedHeader, index) => {
      const actualHeader = actualHeaders[index];

      if (actualHeader !== expectedHeader) {
        headerErrors.push(
          `Column ${index + 1}: expected "${expectedHeader}", found "${actualHeader}".`,
        );
      }
    },
  );

  if (headerErrors.length > 0) {
    console.error("\nHeader errors:");

    headerErrors.forEach((error) => {
      console.error(`- ${error}`);
    });

    process.exitCode = 1;
    return;
  }

  const rows = [];
  const errors = [];

  const distinctTeacherEmails = new Set();
  const seenAssignmentKeys = new Map();

  for (
    let rowNumber = 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);

    const values = EXPECTED_HEADERS.map(
      (_, index) =>
        readCellText(row.getCell(index + 1)),
    );

    const isEmptyRow = values.every(
      (value) => value === "",
    );

    if (isEmptyRow) continue;

    const [
      rawEmail,
      schoolId,
      academicYearId,
      termId,
      classId,
      classTitle,
      classSubjectOfferingId,
      rawSubjectKey,
      subjectTitle,
      assignmentStatus,
    ] = values;

    const email = normalizeEmail(rawEmail);

    const subjectKey =
      normalizeSubjectKey(rawSubjectKey);

    const rowErrors = [];

    if (!email) {
      rowErrors.push(
        "بريد المعلم مطلوب.",
      );
    } else if (!isValidEmail(email)) {
      rowErrors.push(
        "صيغة بريد المعلم غير صحيحة.",
      );
    }

    if (!schoolId) {
      rowErrors.push(
        "معرّف المدرسة مطلوب.",
      );
    }

    if (!academicYearId) {
      rowErrors.push(
        "معرّف السنة الدراسية مطلوب.",
      );
    }

    if (!termId) {
      rowErrors.push(
        "معرّف الفصل الدراسي مطلوب.",
      );
    }

    if (!classId) {
      rowErrors.push(
        "معرّف الفصل مطلوب.",
      );
    }

    if (!classSubjectOfferingId) {
      rowErrors.push(
        "معرّف إسناد المادة مطلوب.",
      );
    }

    if (!subjectKey) {
      rowErrors.push(
        "رمز المادة مطلوب.",
      );
    }

    if (
      !ALLOWED_STATUSES.has(
        assignmentStatus,
      )
    ) {
      rowErrors.push(
        `حالة الإسناد غير مسموحة: ${
          assignmentStatus || "فارغ"
        }.`,
      );
    }

    if (email) {
      distinctTeacherEmails.add(email);
    }

    const assignmentKey = [
      email,
      schoolId,
      academicYearId,
      termId,
      classId,
      classSubjectOfferingId,
    ].join("|");

    const previousRow =
      seenAssignmentKeys.get(assignmentKey);

    if (previousRow) {
      rowErrors.push(
        `الإسناد مكرر مع الصف ${previousRow}.`,
      );
    } else {
      seenAssignmentKeys.set(
        assignmentKey,
        rowNumber,
      );
    }

    rows.push({
      rowNumber,
      email,
      schoolId,
      academicYearId,
      termId,
      classId,
      classTitle,
      classSubjectOfferingId,
      subjectKey,
      subjectTitle,
      assignmentStatus,
    });

    if (rowErrors.length > 0) {
      errors.push({
        rowNumber,
        email,
        errors: rowErrors,
      });
    }
  }

  // if (distinctTeacherEmails.size !== 5) {
  //   errors.push({
  //     rowNumber: 0,
  //     email: "",
  //     errors: [
  //       `التجربة الحالية تتوقع توزيع 5 معلمين مختلفين، لكن الملف يحتوي على ${distinctTeacherEmails.size}.`,
  //     ],
  //   });
  // }

  console.log("\n==============================");
  console.log("Assignment preview");
  console.log("==============================");

  console.table(
    rows.map((row) => ({
      row: row.rowNumber,
      email: row.email,
      schoolId: row.schoolId,
      year: row.academicYearId,
      term: row.termId,
      classId: row.classId,
      offeringId:
        row.classSubjectOfferingId,
      subjectKey: row.subjectKey,
      status: row.assignmentStatus,
    })),
  );

  console.log("\n==============================");
  console.log("Summary");
  console.log("==============================");

  console.log({
    totalAssignmentRows: rows.length,
    distinctTeachers:
      distinctTeacherEmails.size,
    validRows:
      rows.length -
      errors.filter(
        (item) => item.rowNumber > 0,
      ).length,
    invalidRows:
      errors.filter(
        (item) => item.rowNumber > 0,
      ).length,
  });

  if (errors.length > 0) {
    console.error("\n==============================");
    console.error("Validation errors");
    console.error("==============================");

    for (const item of errors) {
      const label =
        item.rowNumber > 0
          ? `Row ${item.rowNumber}${
              item.email
                ? ` (${item.email})`
                : ""
            }`
          : "File";

      console.error(`\n${label}`);

      for (const error of item.errors) {
        console.error(`- ${error}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    "\nExcel assignment file is valid.",
  );

  console.log(
    "No teacher assignments or Firebase documents were created.",
  );
}

main().catch((error) => {
  console.error(
    "\nAssignment inspection failed:",
  );

  console.error(error);

  process.exitCode = 1;
});