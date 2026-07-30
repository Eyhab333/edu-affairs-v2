const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "takween";
const SHEET_NAME = "المعلمين";

const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "account-provisioning",
  "inputs",
  "teacher-accounts-import-5.xlsx",
);

const REPORT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "account-provisioning",
  "reports",
  "teacher-accounts-preview-5.json",
);

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

async function initializeFirebase() {
  if (getApps().length > 0) return;

  const args = parseArgs();

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(path.resolve(serviceAccountPath));

    initializeApp({
      credential: cert(serviceAccount),
    });

    return;
  }

  initializeApp({
    credential: applicationDefault(),
  });
}

async function readExcelRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Excel file not found: ${INPUT_FILE}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(INPUT_FILE);

  const worksheet = workbook.getWorksheet(SHEET_NAME);

  if (!worksheet) {
    throw new Error(`Worksheet not found: ${SHEET_NAME}`);
  }

  const rows = [];

  for (
    let rowNumber = 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);

    const displayName = readCellText(row.getCell(1));
    const email = readCellText(row.getCell(2)).toLowerCase();
    const employeeNumber = readCellText(row.getCell(4));
    const schoolId = readCellText(row.getCell(5));
    const roleKey = readCellText(row.getCell(6));
    const accountStatus = readCellText(row.getCell(7));

    if (
      !displayName &&
      !email &&
      !employeeNumber &&
      !schoolId &&
      !roleKey
    ) {
      continue;
    }

    rows.push({
      rowNumber,
      displayName,
      email,
      employeeNumber,
      schoolId,
      roleKey,
      accountStatus,
    });
  }

  return rows;
}

async function findAuthUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return null;
    }

    throw error;
  }
}

async function inspectTeacher({ auth, db, teacher }) {
  const authUser = await findAuthUser(auth, teacher.email);

  const [peopleSnap, usersSnap, schoolSnap] = await Promise.all([
    db
      .collection(`orgs/${ORG_ID}/people`)
      .where("email", "==", teacher.email)
      .limit(5)
      .get(),

    db
      .collection("users")
      .where("email", "==", teacher.email)
      .limit(5)
      .get(),

    db.doc(`orgs/${ORG_ID}/schools/${teacher.schoolId}`).get(),
  ]);

  const peopleMatches = peopleSnap.docs.map((doc) => ({
    id: doc.id,
    personId: doc.data().id || doc.id,
    displayName: doc.data().displayName || "",
  }));

  const userMatches = usersSnap.docs.map((doc) => ({
    uid: doc.id,
    personId: doc.data().personId || "",
    displayName: doc.data().displayName || "",
  }));

  let userMembershipExists = false;
  let orgMembershipExists = false;

  if (authUser) {
    const [userMembershipSnap, orgMembershipSnap] =
      await Promise.all([
        db
          .doc(
            `users/${authUser.uid}/orgMemberships/${ORG_ID}`,
          )
          .get(),

        db
          .doc(
            `orgs/${ORG_ID}/memberships/${authUser.uid}`,
          )
          .get(),
      ]);

    userMembershipExists = userMembershipSnap.exists;
    orgMembershipExists = orgMembershipSnap.exists;
  }

  let previewStatus = "NEW";

  if (
    authUser &&
    peopleMatches.length > 0 &&
    userMatches.length > 0 &&
    userMembershipExists &&
    orgMembershipExists
  ) {
    previewStatus = "EXISTING_COMPLETE";
  } else if (
    authUser ||
    peopleMatches.length > 0 ||
    userMatches.length > 0 ||
    userMembershipExists ||
    orgMembershipExists
  ) {
    previewStatus = "EXISTING_INCOMPLETE";
  }

  const conflicts = [];

  if (!schoolSnap.exists) {
    conflicts.push(
      `المدرسة غير موجودة: ${teacher.schoolId}`,
    );
  }

  if (peopleMatches.length > 1) {
    conflicts.push(
      `يوجد أكثر من person بنفس البريد: ${peopleMatches.length}`,
    );
  }

  if (userMatches.length > 1) {
    conflicts.push(
      `يوجد أكثر من user بنفس البريد: ${userMatches.length}`,
    );
  }

  if (
    authUser &&
    userMatches.length === 1 &&
    userMatches[0].uid !== authUser.uid
  ) {
    conflicts.push(
      "معرّف Firebase Auth لا يطابق مستند users.",
    );
  }

  return {
    rowNumber: teacher.rowNumber,
    displayName: teacher.displayName,
    email: teacher.email,
    employeeNumber: teacher.employeeNumber,
    schoolId: teacher.schoolId,
    roleKey: teacher.roleKey,
    previewStatus,
    schoolExists: schoolSnap.exists,
    authExists: Boolean(authUser),
    uid: authUser?.uid || "",
    peopleMatches,
    userMatches,
    userMembershipExists,
    orgMembershipExists,
    conflicts,
  };
}

async function main() {
  console.log("Previewing teacher accounts import...");
  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,
  });

  await initializeFirebase();

  const auth = getAuth();
  const db = getFirestore();

  const teachers = await readExcelRows();
  const results = [];

  for (const teacher of teachers) {
    console.log(`Checking: ${teacher.email}`);

    results.push(
      await inspectTeacher({
        auth,
        db,
        teacher,
      }),
    );
  }

  const summary = {
    totalRows: results.length,
    newAccounts: results.filter(
      (item) => item.previewStatus === "NEW",
    ).length,
    existingComplete: results.filter(
      (item) =>
        item.previewStatus === "EXISTING_COMPLETE",
    ).length,
    existingIncomplete: results.filter(
      (item) =>
        item.previewStatus === "EXISTING_INCOMPLETE",
    ).length,
    conflicts: results.filter(
      (item) => item.conflicts.length > 0,
    ).length,
  };

  console.log("\n==============================");
  console.log("Firebase preview");
  console.log("==============================");

  console.table(
    results.map((item) => ({
      row: item.rowNumber,
      name: item.displayName,
      email: item.email,
      status: item.previewStatus,
      school: item.schoolExists,
      auth: item.authExists,
      person: item.peopleMatches.length,
      user: item.userMatches.length,
      membership:
        item.userMembershipExists &&
        item.orgMembershipExists,
      conflicts: item.conflicts.length,
    })),
  );

  console.log("\n==============================");
  console.log("Summary");
  console.log("==============================");
  console.log(summary);

  fs.mkdirSync(path.dirname(REPORT_FILE), {
    recursive: true,
  });

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        orgId: ORG_ID,
        summary,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log("No Firebase data was created or updated.");
}

main().catch((error) => {
  console.error("\nPreview failed:");
  console.error(error);
  process.exitCode = 1;
});