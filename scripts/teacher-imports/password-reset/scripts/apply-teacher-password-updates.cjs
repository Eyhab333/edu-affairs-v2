const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const APPLY_CONFIRMATION = "UPDATE_PASSWORDS";
const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "password-reset",
  "inputs",
  "teacher-password-updates.xlsx",
);
const REPORT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "password-reset",
  "reports",
  "teacher-password-updates-report.json",
);
const SHEET_NAME = "تحديث كلمات المرور";
const EXPECTED_HEADERS = [
  "البريد الإلكتروني",
  "كلمة المرور الجديدة",
];

function parseArgs() {
  const result = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...valueParts] = arg.slice(2).split("=");
    result[key] = valueParts.join("=");
  }
  return result;
}

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

async function initializeFirebase(args) {
  if (getApps().length > 0) return;

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    initializeApp({ credential: cert(require(path.resolve(serviceAccountPath))) });
    return;
  }

  initializeApp({ credential: applicationDefault() });
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

  for (const matches of rowsByEmail.values()) {
    if (matches.length < 2) continue;

    const rowNumbers = matches.map((item) => item.rowNumber).join(", ");
    for (const item of matches) {
      item.errors.push(`البريد الإلكتروني مكرر في الصفوف: ${rowNumbers}.`);
    }
  }

  return rows;
}

async function findAuthUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

function buildSummary(results) {
  const blockedRows = results.filter((item) => item.status === "BLOCKED");
  return {
    totalRows: results.length,
    validRows: results.filter((item) => item.status !== "BLOCKED").length,
    updatedPasswords: results.filter((item) => item.status === "UPDATED").length,
    blocked: blockedRows.length,
    errors: blockedRows.reduce((total, item) => total + item.errors.length, 0),
  };
}

function toReportRow(result) {
  return {
    rowNumber: result.rowNumber,
    email: result.email,
    uid: result.uid || "",
    action: result.action,
    status: result.status,
    errors: result.errors,
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  const args = parseArgs();
  if (args.apply && args.apply !== APPLY_CONFIRMATION) {
    throw new Error(`Invalid apply confirmation. Expected --apply=${APPLY_CONFIRMATION}.`);
  }

  const applyMode = args.apply === APPLY_CONFIRMATION;
  console.log("Teacher password reset import");
  console.log({
    inputFile: INPUT_FILE,
    mode: applyMode ? "APPLY" : "DRY_RUN_NO_FIREBASE_WRITES",
  });

  const rows = await readAndValidateRows();
  await initializeFirebase(args);
  const auth = getAuth();
  const results = [];

  for (const row of rows) {
    const result = {
      rowNumber: row.rowNumber,
      email: row.email,
      uid: "",
      action: "UPDATE_PASSWORD",
      status: "BLOCKED",
      errors: [...row.errors],
    };

    if (result.errors.length === 0) {
      try {
        const authUser = await findAuthUser(auth, row.email);
        if (!authUser) {
          result.errors.push("Firebase Auth user was not found.");
        } else {
          result.uid = authUser.uid;
          if (applyMode) {
            await auth.updateUser(authUser.uid, { password: row.password });
            result.status = "UPDATED";
          } else {
            result.status = "PLANNED";
          }
        }
      } catch (error) {
        result.errors.push(
          applyMode
            ? "Firebase Auth password update failed."
            : "Firebase Auth user lookup failed.",
        );
      }
    }

    results.push(result);
  }

  const summary = buildSummary(results);
  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: INPUT_FILE,
    mode: applyMode ? "APPLY" : "DRY_RUN",
    summary,
    rows: results.map(toReportRow),
  };

  writeReport(report);

  console.table(
    results.map((item) => ({
      row: item.rowNumber,
      email: item.email || "-",
      action: item.action,
      status: item.status,
      errors: item.errors.length,
    })),
  );
  console.log(summary);
  console.log(`Report written to: ${REPORT_FILE}`);

  if (summary.blocked > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Teacher password reset import failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
