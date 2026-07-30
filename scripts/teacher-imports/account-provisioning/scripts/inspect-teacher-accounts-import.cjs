const path = require("node:path");
const fs = require("node:fs");
const ExcelJS = require("exceljs");

const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "account-provisioning",
  "inputs",
  "teacher-accounts-import-5.xlsx",
);

const SHEET_NAME = "المعلمين";

const EXPECTED_HEADERS = [
  "الاسم الكامل",
  "البريد الإلكتروني",
  "كلمة المرور المؤقتة",
  "الرقم الوظيفي",
  "معرّف المدرسة",
  "الدور",
  "حالة الحساب",
  "ملاحظات",
];

const ALLOWED_ROLES = new Set([
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

const ALLOWED_STATUSES = new Set([
  "نشط",
  "غير نشط",
]);

function readCellText(cell) {
  const value = cell.value;

  if (value == null) return "";

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("result" in value && value.result != null) {
      return String(value.result).trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskPassword(value) {
  if (!value) return "";
  return "*".repeat(Math.min(value.length, 12));
}

async function main() {
  console.log("Inspecting teacher accounts Excel import...");
  console.log({ inputFile: INPUT_FILE });

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Excel file not found: ${INPUT_FILE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(INPUT_FILE);

  const worksheet = workbook.getWorksheet(SHEET_NAME);

  if (!worksheet) {
    throw new Error(
      `Worksheet "${SHEET_NAME}" was not found.`,
    );
  }

  const actualHeaders = EXPECTED_HEADERS.map((_, index) =>
    readCellText(worksheet.getRow(1).getCell(index + 1)),
  );

  const headerErrors = [];

  EXPECTED_HEADERS.forEach((expectedHeader, index) => {
    const actualHeader = actualHeaders[index];

    if (actualHeader !== expectedHeader) {
      headerErrors.push(
        `Column ${index + 1}: expected "${expectedHeader}", found "${actualHeader}".`,
      );
    }
  });

  if (headerErrors.length > 0) {
    console.error("\nHeader errors:");
    headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const rows = [];
  const errors = [];
  const seenEmails = new Map();

  for (
    let rowNumber = 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);

    const values = EXPECTED_HEADERS.map((_, index) =>
      readCellText(row.getCell(index + 1)),
    );

    const isEmptyRow = values.every((value) => value === "");

    if (isEmptyRow) continue;

    const [
      displayName,
      rawEmail,
      temporaryPassword,
      employeeNumber,
      schoolId,
      roleKey,
      accountStatus,
      notes,
    ] = values;

    const email = normalizeEmail(rawEmail);
    const rowErrors = [];

    if (!displayName) {
      rowErrors.push("الاسم الكامل مطلوب.");
    }

    if (!email) {
      rowErrors.push("البريد الإلكتروني مطلوب.");
    } else if (!isValidEmail(email)) {
      rowErrors.push("صيغة البريد الإلكتروني غير صحيحة.");
    }

    if (!temporaryPassword) {
      rowErrors.push("كلمة المرور المؤقتة مطلوبة.");
    } else if (temporaryPassword.length < 8) {
      rowErrors.push(
        "كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف.",
      );
    }

    if (!schoolId) {
      rowErrors.push("معرّف المدرسة مطلوب.");
    }

    if (!ALLOWED_ROLES.has(roleKey)) {
      rowErrors.push(
        `الدور غير مسموح: ${roleKey || "فارغ"}.`,
      );
    }

    if (!ALLOWED_STATUSES.has(accountStatus)) {
      rowErrors.push(
        `حالة الحساب غير مسموحة: ${accountStatus || "فارغ"}.`,
      );
    }

    if (email) {
      const previousRow = seenEmails.get(email);

      if (previousRow) {
        rowErrors.push(
          `البريد مكرر مع الصف ${previousRow}.`,
        );
      } else {
        seenEmails.set(email, rowNumber);
      }
    }

    const normalizedRow = {
      rowNumber,
      displayName,
      email,
      temporaryPassword,
      employeeNumber,
      schoolId,
      roleKey,
      accountStatus,
      isActive: accountStatus === "نشط",
      notes,
      provisioningStatus: "PENDING_ASSIGNMENT",
    };

    rows.push(normalizedRow);

    if (rowErrors.length > 0) {
      errors.push({
        rowNumber,
        email,
        errors: rowErrors,
      });
    }
  }

  console.log("\n==============================");
  console.log("Import preview");
  console.log("==============================");

  console.table(
    rows.map((row) => ({
      row: row.rowNumber,
      name: row.displayName,
      email: row.email,
      password: maskPassword(row.temporaryPassword),
      employeeNumber: row.employeeNumber || "-",
      schoolId: row.schoolId,
      roleKey: row.roleKey,
      active: row.isActive,
      provisioningStatus: row.provisioningStatus,
    })),
  );

  console.log("\n==============================");
  console.log("Summary");
  console.log("==============================");
  console.log({
    totalRows: rows.length,
    validRows: rows.length - errors.length,
    invalidRows: errors.length,
  });

  

  if (errors.length > 0) {
    console.error("\n==============================");
    console.error("Validation errors");
    console.error("==============================");

    for (const item of errors) {
      const label =
        item.rowNumber > 0
          ? `Row ${item.rowNumber}${item.email ? ` (${item.email})` : ""}`
          : "File";

      console.error(`\n${label}`);

      for (const error of item.errors) {
        console.error(`- ${error}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log("\nExcel file is valid.");
  console.log("No Firebase accounts or documents were created.");
}

main().catch((error) => {
  console.error("\nInspection failed:");
  console.error(error);
  process.exitCode = 1;
});