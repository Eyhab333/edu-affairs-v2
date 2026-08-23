const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "password-reset",
  "inputs",
  "teacher-password-updates.xlsx",
);

const SHEET_NAME = "تحديث كلمات المرور";
const EXPECTED_HEADERS = [
  "البريد الإلكتروني",
  "كلمة المرور الجديدة",
];

function readCellText(cell) {
  const value = cell.value;

  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text.trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || "").join("").trim();
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

async function readAndValidateRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Excel file not found: ${INPUT_FILE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(INPUT_FILE);

  const worksheet = workbook.getWorksheet(SHEET_NAME);
  if (!worksheet) {
    throw new Error(`Worksheet "${SHEET_NAME}" was not found.`);
  }

  const headerErrors = [];
  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    const actualHeader = readCellText(worksheet.getRow(1).getCell(index + 1));
    if (actualHeader !== EXPECTED_HEADERS[index]) {
      headerErrors.push(`Column ${index + 1} header does not match the required format.`);
    }
  }

  if (headerErrors.length > 0) {
    throw new Error(`Invalid Excel headers: ${headerErrors.join(" ")}`);
  }

  const rows = [];
  const rowsByEmail = new Map();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const email = normalizeEmail(readCellText(row.getCell(1)));
    const password = readCellText(row.getCell(2));

    if (!email && !password) continue;

    const item = { rowNumber, email, password, errors: [] };

    if (!email) {
      item.errors.push("البريد الإلكتروني مطلوب.");
    } else if (!isValidEmail(email)) {
      item.errors.push("صيغة البريد الإلكتروني غير صحيحة.");
    }

    if (!password) {
      item.errors.push("كلمة المرور الجديدة مطلوبة.");
    } else if (password.length < 8) {
      item.errors.push("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
    }

    rows.push(item);

    if (email) {
      const matches = rowsByEmail.get(email) || [];
      matches.push(item);
      rowsByEmail.set(email, matches);
    }
  }

  for (const [email, matches] of rowsByEmail) {
    if (matches.length < 2) continue;

    const rowNumbers = matches.map((item) => item.rowNumber).join(", ");
    for (const item of matches) {
      item.errors.push(`البريد الإلكتروني مكرر في الصفوف: ${rowNumbers}.`);
    }
  }

  return rows;
}

async function main() {
  console.log("Inspecting teacher password updates Excel import...");
  console.log({ inputFile: INPUT_FILE });

  const rows = await readAndValidateRows();
  const blocked = rows.filter((item) => item.errors.length > 0);
  const summary = {
    totalRows: rows.length,
    validRows: rows.length - blocked.length,
    updatedPasswords: 0,
    blocked: blocked.length,
    errors: blocked.reduce((total, item) => total + item.errors.length, 0),
  };

  console.table(
    rows.map((item) => ({
      row: item.rowNumber,
      email: item.email || "-",
      status: item.errors.length > 0 ? "BLOCKED" : "VALID",
      errors: item.errors.length,
    })),
  );
  console.log(summary);

  if (blocked.length > 0) {
    for (const item of blocked) {
      console.error(`Row ${item.rowNumber}${item.email ? ` (${item.email})` : ""}:`);
      for (const error of item.errors) console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Excel file is valid. No Firebase access or writes were performed.");
}

main().catch((error) => {
  console.error("Password update inspection failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
