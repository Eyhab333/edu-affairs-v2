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
const SHEET_NAME = "التوزيع";

const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "assignments",
  "inputs",
  "teacher-assignments-import-5.xlsx",
);

const REPORT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "assignments",
  "reports",
  "teacher-assignments-preview-5.json",
);

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg
      .slice(2)
      .split("=");

    result[key] = valueParts.join("=");
  }

  return result;
}

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

async function initializeFirebase() {
  if (getApps().length > 0) return;

  const args = parseArgs();

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(
      process.cwd(),
      "service-account.json",
    );

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(
      path.resolve(serviceAccountPath),
    );

    initializeApp({
      credential: cert(serviceAccount),
    });

    return;
  }

  initializeApp({
    credential: applicationDefault(),
  });
}

async function getAuthUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return null;
    }

    throw error;
  }
}

async function readExcelRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(
      `Excel file not found: ${INPUT_FILE}`,
    );
  }

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(INPUT_FILE);

  const worksheet =
    workbook.getWorksheet(SHEET_NAME);

  if (!worksheet) {
    throw new Error(
      `Worksheet not found: ${SHEET_NAME}`,
    );
  }

  const rows = [];

  for (
    let rowNumber = 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);

    const email = readCellText(
      row.getCell(1),
    ).toLowerCase();

    const schoolId = readCellText(
      row.getCell(2),
    );

    const academicYearId = readCellText(
      row.getCell(3),
    );

    const termId = readCellText(
      row.getCell(4),
    );

    const classId = readCellText(
      row.getCell(5),
    );

    const classTitle = readCellText(
      row.getCell(6),
    );

    const classSubjectOfferingId =
      readCellText(row.getCell(7));

    const subjectKey = readCellText(
      row.getCell(8),
    ).toUpperCase();

    const subjectTitle = readCellText(
      row.getCell(9),
    );

    const assignmentStatus = readCellText(
      row.getCell(10),
    ).toUpperCase();

    const isEmptyRow = [
      email,
      schoolId,
      academicYearId,
      termId,
      classId,
      classSubjectOfferingId,
      subjectKey,
    ].every((value) => !value);

    if (isEmptyRow) continue;

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
  }

  return rows;
}

async function findUserDocument(db, email) {
  const snapshot = await db
    .collection("users")
    .where("email", "==", email)
    .limit(2)
    .get();

  if (snapshot.empty) {
    return {
      document: null,
      matchesCount: 0,
    };
  }

  return {
    document: snapshot.docs[0],
    matchesCount: snapshot.size,
  };
}

function validateOffering({
  offering,
  row,
}) {
  const errors = [];

  if (offering.orgId !== ORG_ID) {
    errors.push(
      "إسناد المادة تابع لمؤسسة أخرى.",
    );
  }

  if (offering.schoolId !== row.schoolId) {
    errors.push(
      "مدرسة إسناد المادة لا تطابق المدرسة الموجودة في Excel.",
    );
  }

  if (
    offering.academicYearId !==
    row.academicYearId
  ) {
    errors.push(
      "السنة الدراسية في إسناد المادة لا تطابق Excel.",
    );
  }

  if (offering.classId !== row.classId) {
    errors.push(
      "الفصل داخل إسناد المادة لا يطابق الفصل الموجود في Excel.",
    );
  }

  if (
    String(offering.subjectKey || "")
      .toUpperCase() !== row.subjectKey
  ) {
    errors.push(
      "رمز المادة داخل إسناد المادة لا يطابق Excel.",
    );
  }

  if (offering.isArchived === true) {
    errors.push(
      "إسناد المادة مؤرشف.",
    );
  }

  return errors;
}

async function inspectAssignmentRow({
  auth,
  db,
  row,
}) {
  const errors = [];

  const authUser = await getAuthUserByEmail(
    auth,
    row.email,
  );

  const userLookup = await findUserDocument(
    db,
    row.email,
  );

  if (!authUser) {
    errors.push(
      "حساب Firebase Auth للمعلم غير موجود.",
    );
  }

  if (!userLookup.document) {
    errors.push(
      "مستند users للمعلم غير موجود.",
    );
  }

  if (userLookup.matchesCount > 1) {
    errors.push(
      "يوجد أكثر من مستند users بنفس البريد.",
    );
  }

  const userData =
    userLookup.document?.data() || {};

  const uid =
    authUser?.uid ||
    userLookup.document?.id ||
    "";

  const personId =
    userData.personId || "";

  if (!personId) {
    errors.push(
      "مستند المستخدم لا يحتوي على personId.",
    );
  }

  if (
    authUser &&
    userLookup.document &&
    authUser.uid !== userLookup.document.id
  ) {
    errors.push(
      "uid في Firebase Auth لا يطابق مستند users.",
    );
  }

  const documentReads = [];

  documentReads.push(
    db
      .doc(
        `orgs/${ORG_ID}/schools/${row.schoolId}`,
      )
      .get(),
  );

  documentReads.push(
    db
      .doc(
        `orgs/${ORG_ID}/academicYears/${row.academicYearId}`,
      )
      .get(),
  );

  documentReads.push(
    db
      .doc(
        `orgs/${ORG_ID}/academicYears/${row.academicYearId}/terms/${row.termId}`,
      )
      .get(),
  );

  documentReads.push(
    db
      .doc(
        `orgs/${ORG_ID}/schools/${row.schoolId}/academicYears/${row.academicYearId}/classes/${row.classId}`,
      )
      .get(),
  );

  documentReads.push(
    db
      .doc(
        `orgs/${ORG_ID}/classSubjectOfferings/${row.classSubjectOfferingId}`,
      )
      .get(),
  );

  if (personId) {
    documentReads.push(
      db
        .doc(
          `orgs/${ORG_ID}/people/${personId}`,
        )
        .get(),
    );
  } else {
    documentReads.push(
      Promise.resolve(null),
    );
  }

  if (uid) {
    documentReads.push(
      db
        .doc(
          `users/${uid}/orgMemberships/${ORG_ID}`,
        )
        .get(),
    );

    documentReads.push(
      db
        .doc(
          `orgs/${ORG_ID}/memberships/${uid}`,
        )
        .get(),
    );
  } else {
    documentReads.push(
      Promise.resolve(null),
    );

    documentReads.push(
      Promise.resolve(null),
    );
  }

  const [
    schoolSnap,
    academicYearSnap,
    termSnap,
    classSnap,
    offeringSnap,
    personSnap,
    userMembershipSnap,
    orgMembershipSnap,
  ] = await Promise.all(documentReads);

  if (!schoolSnap.exists) {
    errors.push(
      `المدرسة غير موجودة: ${row.schoolId}`,
    );
  }

  if (!academicYearSnap.exists) {
    errors.push(
      `السنة الدراسية غير موجودة: ${row.academicYearId}`,
    );
  }

  if (!termSnap.exists) {
    errors.push(
      `الفصل الدراسي غير موجود: ${row.termId}`,
    );
  }

  if (!classSnap.exists) {
    errors.push(
      `الفصل غير موجود: ${row.classId}`,
    );
  }

  if (!offeringSnap.exists) {
    errors.push(
      `إسناد المادة غير موجود: ${row.classSubjectOfferingId}`,
    );
  } else {
    errors.push(
      ...validateOffering({
        offering: offeringSnap.data(),
        row,
      }),
    );
  }

  if (personId && !personSnap?.exists) {
    errors.push(
      `مستند person غير موجود: ${personId}`,
    );
  }

  if (uid && !userMembershipSnap?.exists) {
    errors.push(
      "عضوية المستخدم داخل users غير موجودة.",
    );
  }

  if (uid && !orgMembershipSnap?.exists) {
    errors.push(
      "عضوية المستخدم داخل المؤسسة غير موجودة.",
    );
  }

  let existingAssignments = [];

  if (personId) {
    const assignmentsSnap = await db
      .collection(
        `orgs/${ORG_ID}/teacherAssignments`,
      )
      .where(
        "teacherPersonId",
        "==",
        personId,
      )
      .get();

    existingAssignments =
      assignmentsSnap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((assignment) => {
          return (
            assignment.schoolId ===
              row.schoolId &&
            assignment.academicYearId ===
              row.academicYearId &&
            assignment.classSubjectOfferingId ===
              row.classSubjectOfferingId &&
            assignment.status !== "ENDED"
          );
        });
  }

  let action = "CREATE";

  if (errors.length > 0) {
    action = "BLOCKED";
  } else if (
    existingAssignments.length > 0
  ) {
    action = "KEEP_EXISTING";
  }

  return {
    rowNumber: row.rowNumber,

    email: row.email,
    uid,
    personId,

    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    termId: row.termId,

    classId: row.classId,
    classTitle:
      classSnap.exists
        ? classSnap.data().title || row.classTitle
        : row.classTitle,

    classSubjectOfferingId:
      row.classSubjectOfferingId,

    subjectKey: row.subjectKey,
    subjectTitle:
      offeringSnap.exists
        ? offeringSnap.data()
            .subjectTitleSnapshot ||
          offeringSnap.data().displayName ||
          row.subjectTitle
        : row.subjectTitle,

    assignmentStatus:
      row.assignmentStatus,

    existingAssignmentIds:
      existingAssignments.map(
        (assignment) => assignment.id,
      ),

    action,
    errors,
  };
}

async function main() {
  console.log(
    "Previewing teacher assignments import...",
  );

  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,
  });

  await initializeFirebase();

  const auth = getAuth();
  const db = getFirestore();

  const rows = await readExcelRows();

  if (rows.length === 0) {
    throw new Error(
      "ملف التوزيع لا يحتوي على إسنادات مكتملة.",
    );
  }

  const results = [];

  for (const row of rows) {
    console.log(
      `Checking row ${row.rowNumber}: ${row.email}`,
    );

    results.push(
      await inspectAssignmentRow({
        auth,
        db,
        row,
      }),
    );
  }

  const distinctTeachers = new Set(
    results.map((item) => item.email),
  ).size;

  const summary = {
    totalRows: results.length,
    distinctTeachers,

    readyToCreate: results.filter(
      (item) => item.action === "CREATE",
    ).length,

    existingAssignments: results.filter(
      (item) =>
        item.action === "KEEP_EXISTING",
    ).length,

    blockedRows: results.filter(
      (item) => item.action === "BLOCKED",
    ).length,
  };

  console.log("\n==============================");
  console.log("Firebase assignment preview");
  console.log("==============================");

  console.table(
    results.map((item) => ({
      row: item.rowNumber,
      email: item.email,
      personId: item.personId,
      classId: item.classId,
      offeringId:
        item.classSubjectOfferingId,
      subjectKey: item.subjectKey,
      action: item.action,
      errors: item.errors.length,
    })),
  );

  for (const item of results) {
    if (item.errors.length === 0) continue;

    console.error(
      `\nRow ${item.rowNumber} — ${item.email}`,
    );

    for (const error of item.errors) {
      console.error(`- ${error}`);
    }
  }

  console.log("\n==============================");
  console.log("Summary");
  console.log("==============================");

  console.log(summary);

  fs.mkdirSync(
    path.dirname(REPORT_FILE),
    {
      recursive: true,
    },
  );

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        orgId: ORG_ID,
        summary,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `\nReport written to: ${REPORT_FILE}`,
  );

  console.log(
    "No teacher assignments or Firebase documents were created.",
  );

  if (summary.blockedRows > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "\nAssignment preview failed:",
  );

  console.error(error);

  process.exitCode = 1;
});