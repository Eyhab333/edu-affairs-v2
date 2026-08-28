const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const WORKFLOW_ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT_FILE = path.join(WORKFLOW_ROOT, "inputs", "guardian-links.xlsx");
const EXPECTED_HEADERS = ["guardianNationalId", "studentNationalId", "relationType", "active"];
const RELATION_TYPES = new Set(["FATHER", "MOTHER", "OTHER"]);
const APPLY_TOKEN = "APPLY_GUARDIAN_LINKS";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...valueParts] = arg.slice(2).split("=");
    args[key] = valueParts.join("=");
  }
  return args;
}

function readCellText(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text.trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || "").join("").trim();
  }
  return String(value).trim();
}

function readString(data, key) {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRow(row) {
  return { ...row, errors: Array.isArray(row?.errors) ? row.errors : [] };
}

function parseActive(value) {
  if (!value) return { value: true, error: "" };
  const normalized = value.toLowerCase();
  if (normalized === "true") return { value: true, error: "" };
  if (normalized === "false") return { value: false, error: "" };
  return { value: true, error: "active must be true or false when supplied." };
}

function getConfig(args = parseArgs()) {
  return {
    args,
    orgId: (args.orgId || process.env.ORG_ID || "takween").trim(),
    inputFile: args.input ? path.resolve(process.cwd(), args.input) : DEFAULT_INPUT_FILE,
    sheetName: (args.sheet || "").trim(),
  };
}

async function initializeFirebase(args) {
  if (getApps().length > 0) return;
  const serviceAccountPath = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(process.cwd(), "service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    initializeApp({ credential: cert(require(path.resolve(serviceAccountPath))) });
    return;
  }
  initializeApp({ credential: applicationDefault() });
}

async function readExcelRows(config) {
  if (!fs.existsSync(config.inputFile)) throw new Error(`Excel file not found: ${config.inputFile}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.inputFile);
  const worksheet = config.sheetName ? workbook.getWorksheet(config.sheetName) : workbook.worksheets[0];
  if (!worksheet) throw new Error(config.sheetName ? `Worksheet not found: ${config.sheetName}` : "The workbook has no worksheet.");

  const headerErrors = [];
  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    const actual = readCellText(worksheet.getRow(1).getCell(index + 1));
    const expected = EXPECTED_HEADERS[index];
    if (actual !== expected) headerErrors.push(`Column ${index + 1}: expected "${expected}", found "${actual}".`);
  }
  for (let index = EXPECTED_HEADERS.length + 1; index <= worksheet.columnCount; index += 1) {
    const header = readCellText(worksheet.getRow(1).getCell(index));
    if (header) headerErrors.push(`Unexpected column ${index}: "${header}".`);
  }
  if (headerErrors.length > 0) return { worksheetName: worksheet.name, rows: [], headerErrors };

  const rows = [];
  const linkRows = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = EXPECTED_HEADERS.map((_, index) => readCellText(worksheet.getRow(rowNumber).getCell(index + 1)));
    if (values.every((value) => !value)) continue;
    const [guardianNationalId, studentNationalId, rawRelationType, rawActive] = values;
    const relationType = rawRelationType.toUpperCase();
    const active = parseActive(rawActive);
    const errors = [];
    if (!guardianNationalId) errors.push("guardianNationalId is required for safe matching.");
    if (!studentNationalId) errors.push("studentNationalId is required for safe matching.");
    if (!RELATION_TYPES.has(relationType)) errors.push(`relationType "${rawRelationType}" is not valid.`);
    if (active.error) errors.push(active.error);
    const row = normalizeRow({ rowNumber, guardianNationalId, studentNationalId, relationType, active: active.value, errors });
    rows.push(row);
    if (guardianNationalId && studentNationalId) {
      const key = `${guardianNationalId}\u0000${studentNationalId}`;
      const matches = linkRows.get(key) || [];
      matches.push(row);
      linkRows.set(key, matches);
    }
  }
  for (const [key, matches] of linkRows) {
    if (matches.length <= 1) continue;
    matches.forEach((row) => row.errors.push(`Guardian/student pair is duplicated in rows ${matches.map((item) => item.rowNumber).join(", ")}.`));
  }
  return { worksheetName: worksheet.name, rows, headerErrors: [] };
}

function record(snapshot) {
  return { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() || {} };
}

function linkIdFor(guardianId, studentId) {
  return `gl-${guardianId}-${studentId}`;
}

function baseResult(row) {
  return {
    rowNumber: row.rowNumber,
    guardianNationalId: row.guardianNationalId,
    studentNationalId: row.studentNationalId,
    relationType: row.relationType,
    active: row.active,
    action: "BLOCKED",
    guardianId: "",
    studentId: "",
    guardianLinkId: "",
    guardian: "NONE",
    student: "NONE",
    guardianLink: "NONE",
    conflicts: [...(Array.isArray(row?.errors) ? row.errors : [])],
    notes: [],
    internal: {},
  };
}

function existingActive(data) {
  return data?.active !== false;
}

async function resolveGuardianLinkRow({ db, orgId, row }) {
  const result = baseResult(row);
  if (result.conflicts.length > 0) return result;
  const [guardianPeopleSnapshot, studentPeopleSnapshot] = await Promise.all([
    db.collection(`orgs/${orgId}/people`).where("nationalId", "==", row.guardianNationalId).limit(3).get(),
    db.collection(`orgs/${orgId}/people`).where("nationalId", "==", row.studentNationalId).limit(3).get(),
  ]);
  const guardianPeople = guardianPeopleSnapshot.docs.map(record);
  const studentPeople = studentPeopleSnapshot.docs.map(record);
  if (guardianPeople.length !== 1) result.conflicts.push(guardianPeople.length === 0 ? "No Person matches guardianNationalId." : `Multiple People match guardianNationalId (${guardianPeople.length}).`);
  if (studentPeople.length !== 1) result.conflicts.push(studentPeople.length === 0 ? "No Person matches studentNationalId." : `Multiple People match studentNationalId (${studentPeople.length}).`);
  if (result.conflicts.length > 0) return result;

  const guardianPerson = guardianPeople[0];
  const studentPerson = studentPeople[0];
  const [guardiansSnapshot, studentsSnapshot] = await Promise.all([
    db.collection(`orgs/${orgId}/guardians`).where("personId", "==", guardianPerson.id).limit(3).get(),
    db.collection(`orgs/${orgId}/students`).where("personId", "==", studentPerson.id).limit(3).get(),
  ]);
  const guardians = guardiansSnapshot.docs.map(record);
  const students = studentsSnapshot.docs.map(record);
  if (guardians.length !== 1) result.conflicts.push(guardians.length === 0 ? `No Guardian references Person ${guardianPerson.id}.` : `Multiple Guardians reference Person ${guardianPerson.id}.`);
  if (students.length !== 1) result.conflicts.push(students.length === 0 ? `No Student references Person ${studentPerson.id}.` : `Multiple Students reference Person ${studentPerson.id}.`);
  if (result.conflicts.length > 0) return result;
  const guardian = guardians[0];
  const student = students[0];
  if (guardian.data.isArchived === true) result.conflicts.push(`Guardian ${guardian.id} is archived.`);
  if (student.data.isArchived === true) result.conflicts.push(`Student ${student.id} is archived.`);
  if (result.conflicts.length > 0) return result;

  const guardianLinkId = linkIdFor(guardian.id, student.id);
  const [canonicalLinkSnapshot, guardianLinksSnapshot] = await Promise.all([
    db.doc(`orgs/${orgId}/guardianLinks/${guardianLinkId}`).get(),
    db.collection(`orgs/${orgId}/guardianLinks`).where("guardianId", "==", guardian.id).get(),
  ]);
  const matchingLinks = guardianLinksSnapshot.docs
    .map(record)
    .filter((link) => readString(link.data, "studentId") === student.id);
  if (matchingLinks.length > 1) {
    result.conflicts.push(`Multiple GuardianLinks match Guardian ${guardian.id} and Student ${student.id}.`);
    return result;
  }
  if (matchingLinks.length === 1 && matchingLinks[0].id !== guardianLinkId) {
    result.conflicts.push(`Existing GuardianLink ${matchingLinks[0].id} does not use the required ID convention.`);
    return result;
  }
  if (canonicalLinkSnapshot.exists && matchingLinks.length === 0) {
    result.conflicts.push(`GuardianLink ${guardianLinkId} does not match its guardianId/studentId fields.`);
    return result;
  }

  const link = matchingLinks[0] || null;
  const linkNeedsUpdate = link && (readString(link.data, "relationType") !== row.relationType || existingActive(link.data) !== row.active);
  result.guardianId = guardian.id;
  result.studentId = student.id;
  result.guardianLinkId = guardianLinkId;
  result.guardian = "KEEP_EXISTING";
  result.student = "KEEP_EXISTING";
  result.guardianLink = !link ? "CREATE" : linkNeedsUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.action = !link ? "CREATE" : linkNeedsUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.internal = { guardian, student, link, linkNeedsUpdate };
  return result;
}

async function resolveRows({ config, rows }) {
  await initializeFirebase(config.args);
  const db = getFirestore();
  const results = [];
  for (const row of rows) results.push(await resolveGuardianLinkRow({ db, orgId: config.orgId, row: normalizeRow(row) }));
  return { db, results };
}

function guardianLinkPayload(result, orgId, now) {
  return {
    id: result.guardianLinkId,
    orgId,
    studentId: result.studentId,
    guardianId: result.guardianId,
    relationType: result.relationType,
    active: result.active,
    startAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function applyGuardianLinkResult({ db, orgId, result }) {
  if (result.action === "BLOCKED") return { rowNumber: result.rowNumber, action: "BLOCKED", detail: result.conflicts.join(" | ") };
  if (result.action === "KEEP_EXISTING") return { rowNumber: result.rowNumber, action: "KEEP_EXISTING", detail: "No writes required." };
  const row = normalizeRow(result);
  const now = Date.now();
  const guardianRef = db.doc(row.internal.guardian.path);
  const studentRef = db.doc(row.internal.student.path);
  const linkRef = db.doc(`orgs/${orgId}/guardianLinks/${row.guardianLinkId}`);
  const guardianLinksQuery = db.collection(`orgs/${orgId}/guardianLinks`).where("guardianId", "==", row.guardianId);
  await db.runTransaction(async (transaction) => {
    const [guardianSnapshot, studentSnapshot, linkSnapshot, guardianLinksSnapshot] = await Promise.all([
      transaction.get(guardianRef),
      transaction.get(studentRef),
      transaction.get(linkRef),
      transaction.get(guardianLinksQuery),
    ]);
    if (!guardianSnapshot.exists || guardianSnapshot.data()?.isArchived === true) throw new Error("Guardian changed after preview; rerun preview.");
    if (!studentSnapshot.exists || studentSnapshot.data()?.isArchived === true) throw new Error("Student changed after preview; rerun preview.");
    const matchingLinks = guardianLinksSnapshot.docs.filter((snapshot) => readString(snapshot.data(), "studentId") === row.studentId);
    if (matchingLinks.length !== 1 || matchingLinks[0].id !== row.guardianLinkId) {
      if (row.action === "CREATE" && matchingLinks.length === 0) {
        // The required canonical link is still absent and can be created below.
      } else {
        throw new Error("GuardianLink set changed after preview; rerun preview.");
      }
    }
    if (row.action === "CREATE") {
      if (linkSnapshot.exists) throw new Error("GuardianLink changed after preview; rerun preview.");
      transaction.create(linkRef, guardianLinkPayload(row, orgId, now));
      return;
    }
    if (!linkSnapshot.exists) throw new Error("GuardianLink changed after preview; rerun preview.");
    transaction.update(linkRef, { relationType: row.relationType, active: row.active, updatedAt: now });
  });
  return { rowNumber: row.rowNumber, action: row.action, guardianId: row.guardianId, studentId: row.studentId, guardianLinkId: row.guardianLinkId };
}

function printResults(title, results) {
  console.log(title);
  console.table(results.map((result) => ({
    row: result.rowNumber,
    action: result.action,
    guardian: result.guardian,
    student: result.student,
    guardianLink: result.guardianLink,
    guardianId: result.guardianId,
    studentId: result.studentId,
    guardianLinkId: result.guardianLinkId,
    conflicts: result.conflicts?.join(" | ") || "",
  })));
}

module.exports = {
  APPLY_TOKEN,
  EXPECTED_HEADERS,
  applyGuardianLinkResult,
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
};
