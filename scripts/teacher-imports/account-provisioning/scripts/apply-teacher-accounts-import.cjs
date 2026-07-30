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
const APPLY_CONFIRMATION = "CREATE_TEACHERS";
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
  "teacher-accounts-apply-5.json",
);

const EMPTY_PERMISSIONS = {
  manageOrg: false,
  manageSchools: false,
  manageAcademicYears: false,
  manageGrades: false,
  manageClasses: false,
  manageSubjects: false,
  manageUsers: false,
  manageDirectory: false,
  manageAssignments: false,
  manageCases: false,
  manageEvaluations: false,
  manageDisplay: false,
  sendNotifications: false,

  viewGuardianFinance: false,
  manageGuardianFinance: false,
  recordGuardianPayments: false,
  applyGuardianFinanceAdjustments: false,
  voidGuardianPayments: false,
  viewGuardianFinanceReports: false,
  manageGuardianFinanceSettings: false,
};

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

  if (typeof value === "string") {
    return value.trim();
  }

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

function buildPersonId(email) {
  const emailPrefix = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!emailPrefix) {
    throw new Error(`Cannot generate personId from email: ${email}`);
  }

  return `p-${emailPrefix}`;
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

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    const displayName = readCellText(row.getCell(1));
    const email = readCellText(row.getCell(2)).toLowerCase();
    const temporaryPassword = readCellText(row.getCell(3));
    const employeeNumber = readCellText(row.getCell(4));
    const schoolId = readCellText(row.getCell(5));
    const roleKey = readCellText(row.getCell(6));
    const accountStatus = readCellText(row.getCell(7));
    const notes = readCellText(row.getCell(8));

    const isEmpty = [
      displayName,
      email,
      temporaryPassword,
      employeeNumber,
      schoolId,
      roleKey,
      accountStatus,
      notes,
    ].every((value) => !value);

    if (isEmpty) continue;

    rows.push({
      rowNumber,
      displayName,
      email,
      temporaryPassword,
      employeeNumber,
      schoolId,
      roleKey,
      accountStatus,
      notes,
      isActive: accountStatus === "نشط",
      personId: buildPersonId(email),
    });
  }

  return rows;
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

async function inspectTeacher({ auth, db, teacher }) {
  const authUser = await getAuthUserByEmail(auth, teacher.email);

  const [schoolSnap, personSnap, peopleByEmailSnap, usersByEmailSnap] =
    await Promise.all([
      db.doc(`orgs/${ORG_ID}/schools/${teacher.schoolId}`).get(),

      db.doc(`orgs/${ORG_ID}/people/${teacher.personId}`).get(),

      db
        .collection(`orgs/${ORG_ID}/people`)
        .where("email", "==", teacher.email)
        .limit(2)
        .get(),

      db.collection("users").where("email", "==", teacher.email).limit(2).get(),
    ]);

  const errors = [];

  if (!schoolSnap.exists) {
    errors.push(`المدرسة غير موجودة: ${teacher.schoolId}`);
  }

  if (authUser) {
    errors.push("يوجد حساب Firebase Auth بهذا البريد.");
  }

  if (personSnap.exists) {
    errors.push(`personId مستخدم مسبقًا: ${teacher.personId}`);
  }

  if (!peopleByEmailSnap.empty) {
    errors.push("يوجد person مسبقًا بنفس البريد.");
  }

  if (!usersByEmailSnap.empty) {
    errors.push("يوجد users document مسبقًا بنفس البريد.");
  }

  return {
    ...teacher,
    errors,
  };
}

function buildMembershipData({ teacher, uid, now }) {
  return {
    id: uid,
    uid,
    personId: teacher.personId,
    orgId: ORG_ID,

    role: "teacher",
    roleKey: teacher.roleKey,

    title:
      teacher.roleKey === "KG_TEACHER"
        ? "معلمة روضة"
        : teacher.roleKey === "GIRLS_TEACHER"
          ? "معلمة"
          : "معلم",
    department: "التعليم",

    scopeType: "SCHOOL",
    scopeId: teacher.schoolId,

    scopes: {
      schoolIds: [teacher.schoolId],
      gradeIds: [],
      classIds: [],
      subjectKeys: [],
      routeIds: [],
      canAccessAllSchools: false,
    },

    permissions: EMPTY_PERMISSIONS,

    isActive: teacher.isActive,

    provisioningStatus: "PENDING_ASSIGNMENT",
    assignmentStatus: "PENDING",

    createdAt: now,
    updatedAt: now,
  };
}

async function createTeacher({ auth, db, teacher }) {
  const now = Date.now();

  const authUser = await auth.createUser({
    email: teacher.email,
    password: teacher.temporaryPassword,
    displayName: teacher.displayName,
    disabled: !teacher.isActive,
  });

  const uid = authUser.uid;

  const userRef = db.doc(`users/${uid}`);

  const userMembershipRef = db.doc(`users/${uid}/orgMemberships/${ORG_ID}`);

  const personRef = db.doc(`orgs/${ORG_ID}/people/${teacher.personId}`);

  const orgMembershipRef = db.doc(`orgs/${ORG_ID}/memberships/${uid}`);

  const membershipData = buildMembershipData({
    teacher,
    uid,
    now,
  });

  const batch = db.batch();

  batch.create(userRef, {
    uid,
    orgId: ORG_ID,

    email: teacher.email,
    displayName: teacher.displayName,
    photoUrl: "",

    personId: teacher.personId,

    roles: ["teacher"],
    schoolIds: [teacher.schoolId],

    isOrgAdmin: false,
    mustChangePassword: true,
    isDisabled: !teacher.isActive,

    provisioningStatus: "PENDING_ASSIGNMENT",

    createdAt: now,
    updatedAt: now,
  });

  batch.create(personRef, {
    id: teacher.personId,

    displayName: teacher.displayName,
    email: teacher.email,
    phone: "",

    employeeNumber: teacher.employeeNumber,
    nationalId: "",

    provisioningStatus: "PENDING_ASSIGNMENT",
    notes: teacher.notes,

    createdAt: now,
    updatedAt: now,
  });

  batch.create(userMembershipRef, {
    ...membershipData,
    id: ORG_ID,
  });

  batch.create(orgMembershipRef, membershipData);

  try {
    await batch.commit();

    await auth.setCustomUserClaims(uid, {
      orgId: ORG_ID,
      personId: teacher.personId,
      role: "teacher",
      roleKey: teacher.roleKey,
      schoolIds: [teacher.schoolId],
    });
  } catch (error) {
    try {
      await auth.deleteUser(uid);
    } catch (rollbackError) {
      console.error(`تعذر حذف حساب Auth بعد فشل Firestore: ${teacher.email}`);
      console.error(rollbackError);
    }

    throw error;
  }

  return {
    uid,
    personId: teacher.personId,
    email: teacher.email,
    displayName: teacher.displayName,
    schoolId: teacher.schoolId,
    roleKey: teacher.roleKey,

    paths: [
      `users/${uid}`,
      `users/${uid}/orgMemberships/${ORG_ID}`,
      `orgs/${ORG_ID}/people/${teacher.personId}`,
      `orgs/${ORG_ID}/memberships/${uid}`,
    ],
  };
}

async function main() {
  const args = parseArgs();

  const applyMode = args.apply === APPLY_CONFIRMATION;

  console.log("Teacher account provisioning import");

  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,
    mode: applyMode ? "APPLY" : "DRY_RUN_NO_WRITES",
  });

  await initializeFirebase();

  const auth = getAuth();
  const db = getFirestore();

  const teachers = await readExcelRows();

  const inspectedTeachers = [];

  for (const teacher of teachers) {
    console.log(`Checking ${teacher.email}...`);

    inspectedTeachers.push(
      await inspectTeacher({
        auth,
        db,
        teacher,
      }),
    );
  }

  const invalidTeachers = inspectedTeachers.filter(
    (teacher) => teacher.errors.length > 0,
  );

  console.log("\n==============================");
  console.log("Execution plan");
  console.log("==============================");

  console.table(
    inspectedTeachers.map((teacher) => ({
      row: teacher.rowNumber,
      name: teacher.displayName,
      email: teacher.email,
      personId: teacher.personId,
      schoolId: teacher.schoolId,
      roleKey: teacher.roleKey,
      status: teacher.isActive ? "ACTIVE" : "DISABLED",
      provisioning: "PENDING_ASSIGNMENT",
      errors: teacher.errors.length,
    })),
  );

  if (invalidTeachers.length > 0) {
    console.error("\nValidation errors:");

    for (const teacher of invalidTeachers) {
      console.error(`\nRow ${teacher.rowNumber} — ${teacher.email}`);

      for (const error of teacher.errors) {
        console.error(`- ${error}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  if (!applyMode) {
    console.log("\nDRY_RUN completed successfully.");
    console.log(
      "No Firebase Auth accounts or Firestore documents were created.",
    );
    console.log(`To apply later, use --apply=${APPLY_CONFIRMATION}`);
    return;
  }

  const results = [];
  const failures = [];

  for (const teacher of inspectedTeachers) {
    console.log(`\nCreating ${teacher.email}...`);

    try {
      const result = await createTeacher({
        auth,
        db,
        teacher,
      });

      results.push(result);

      console.log(`Created successfully: ${teacher.email}`);
    } catch (error) {
      failures.push({
        rowNumber: teacher.rowNumber,
        email: teacher.email,
        message: error instanceof Error ? error.message : String(error),
      });

      console.error(`Failed to create: ${teacher.email}`);

      console.error(error);

      break;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    orgId: ORG_ID,

    summary: {
      requested: inspectedTeachers.length,
      created: results.length,
      failed: failures.length,
    },

    results,
    failures,
  };

  fs.mkdirSync(path.dirname(REPORT_FILE), {
    recursive: true,
  });

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("\n==============================");
  console.log("Apply summary");
  console.log("==============================");

  console.log(report.summary);
  console.log(`Report: ${REPORT_FILE}`);

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("\nAll teacher accounts were created successfully.");
}

main().catch((error) => {
  console.error("\nProvisioning failed:");
  console.error(error);
  process.exitCode = 1;
});
