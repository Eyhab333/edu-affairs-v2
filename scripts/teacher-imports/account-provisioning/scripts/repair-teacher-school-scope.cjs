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

const APPLY_CONFIRMATION =
  "REPAIR_TEACHER_SCHOOL_SCOPE";

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
  "teacher-school-scope-repair.json",
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function arraysEqual(first, second) {
  const a = normalizeStringArray(first);
  const b = normalizeStringArray(second);

  return (
    a.length === b.length &&
    a.every((item, index) => item === b[index])
  );
}

function hasDetailedScopes(scopes) {
  if (!scopes || typeof scopes !== "object") {
    return false;
  }

  return [
    scopes.gradeIds,
    scopes.classIds,
    scopes.subjectKeys,
  ].some(
    (value) =>
      Array.isArray(value) &&
      value.filter(Boolean).length > 0,
  );
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

async function findUserByEmail(db, email) {
  const snapshot = await db
    .collection("users")
    .where("email", "==", email)
    .limit(2)
    .get();

  return {
    matchesCount: snapshot.size,
    userDoc: snapshot.empty
      ? null
      : snapshot.docs[0],
  };
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
  const seenEmails = new Map();

  for (
    let rowNumber = 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);

    const displayName = readCellText(
      row.getCell(1),
    );

    const email = readCellText(
      row.getCell(2),
    ).toLowerCase();

    const schoolId = readCellText(
      row.getCell(5),
    );

    const roleKey = readCellText(
      row.getCell(6),
    );

    const isEmpty = [
      displayName,
      email,
      schoolId,
      roleKey,
    ].every((value) => !value);

    if (isEmpty) continue;

    const errors = [];

    if (!email) {
      errors.push("البريد الإلكتروني مطلوب.");
    }

    if (!schoolId) {
      errors.push("معرّف المدرسة مطلوب.");
    }

    if (!roleKey) {
      errors.push("الدور مطلوب.");
    }

    if (seenEmails.has(email)) {
      errors.push(
        `البريد مكرر مع الصف ${seenEmails.get(email)}.`,
      );
    } else {
      seenEmails.set(email, rowNumber);
    }

    rows.push({
      rowNumber,
      displayName,
      email,
      schoolId,
      roleKey,
      errors,
    });
  }

  return rows;
}

function buildUpdatedScopes(
  currentScopes,
  schoolId,
) {
  const scopes =
    currentScopes &&
    typeof currentScopes === "object"
      ? currentScopes
      : {};

  return {
    schoolIds: [schoolId],

    gradeIds: normalizeStringArray(
      scopes.gradeIds,
    ),

    classIds: normalizeStringArray(
      scopes.classIds,
    ),

    subjectKeys: normalizeStringArray(
      scopes.subjectKeys,
    ),

    routeIds: normalizeStringArray(
      scopes.routeIds,
    ),

    canAccessAllSchools: false,
  };
}

async function inspectTeacher({
  auth,
  db,
  teacher,
}) {
  const errors = [...teacher.errors];

  if (errors.length > 0) {
    return {
      ...teacher,
      action: "BLOCKED",
      errors,
    };
  }

  const [
    authUser,
    userLookup,
    schoolSnap,
  ] = await Promise.all([
    getAuthUserByEmail(
      auth,
      teacher.email,
    ),

    findUserByEmail(
      db,
      teacher.email,
    ),

    db
      .doc(
        `orgs/${ORG_ID}/schools/${teacher.schoolId}`,
      )
      .get(),
  ]);

  if (!authUser) {
    errors.push(
      "حساب Firebase Auth غير موجود.",
    );
  }

  if (!userLookup.userDoc) {
    errors.push(
      "مستند users غير موجود.",
    );
  }

  if (userLookup.matchesCount > 1) {
    errors.push(
      "يوجد أكثر من مستند users بنفس البريد.",
    );
  }

  if (!schoolSnap.exists) {
    errors.push(
      `المدرسة غير موجودة: ${teacher.schoolId}`,
    );
  }

  if (
    authUser &&
    userLookup.userDoc &&
    authUser.uid !== userLookup.userDoc.id
  ) {
    errors.push(
      "uid في Auth لا يطابق مستند users.",
    );
  }

  const uid =
    authUser?.uid ||
    userLookup.userDoc?.id ||
    "";

  const userData =
    userLookup.userDoc?.data() || {};

  const personId =
    userData.personId || "";

  if (!personId) {
    errors.push(
      "مستند users لا يحتوي على personId.",
    );
  }

  if (errors.length > 0) {
    return {
      ...teacher,
      uid,
      personId,
      action: "BLOCKED",
      errors,
    };
  }

  const [
    userMembershipSnap,
    orgMembershipSnap,
    personSnap,
    teacherAssignmentsSnap,
  ] = await Promise.all([
    db
      .doc(
        `users/${uid}/orgMemberships/${ORG_ID}`,
      )
      .get(),

    db
      .doc(
        `orgs/${ORG_ID}/memberships/${uid}`,
      )
      .get(),

    db
      .doc(
        `orgs/${ORG_ID}/people/${personId}`,
      )
      .get(),

    db
      .collection(
        `orgs/${ORG_ID}/teacherAssignments`,
      )
      .where(
        "teacherPersonId",
        "==",
        personId,
      )
      .get(),
  ]);

  if (!userMembershipSnap.exists) {
    errors.push(
      "عضوية المستخدم داخل users غير موجودة.",
    );
  }

  if (!orgMembershipSnap.exists) {
    errors.push(
      "عضوية المؤسسة غير موجودة.",
    );
  }

  if (!personSnap.exists) {
    errors.push(
      `مستند person غير موجود: ${personId}`,
    );
  }

  const userMembership =
    userMembershipSnap.exists
      ? userMembershipSnap.data()
      : {};

  const orgMembership =
    orgMembershipSnap.exists
      ? orgMembershipSnap.data()
      : {};

  const customClaims =
    authUser.customClaims || {};

  const wrongActiveAssignments =
    teacherAssignmentsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((assignment) => {
        const isActive =
          assignment.active === true ||
          assignment.status === "ACTIVE";

        return (
          isActive &&
          assignment.schoolId &&
          assignment.schoolId !==
            teacher.schoolId
        );
      });

  const currentSchoolIds = {
    user: normalizeStringArray(
      userData.schoolIds,
    ),

    userMembership: normalizeStringArray(
      userMembership.scopes?.schoolIds,
    ),

    orgMembership: normalizeStringArray(
      orgMembership.scopes?.schoolIds,
    ),

    claims: normalizeStringArray(
      customClaims.schoolIds,
    ),
  };

  const currentRoleKeys = {
    user: userData.roleKey || "",

    userMembership:
      userMembership.roleKey || "",

    orgMembership:
      orgMembership.roleKey || "",

    claims:
      customClaims.roleKey || "",
  };

  const schoolNeedsRepair =
    !arraysEqual(
      currentSchoolIds.user,
      [teacher.schoolId],
    ) ||
    !arraysEqual(
      currentSchoolIds.userMembership,
      [teacher.schoolId],
    ) ||
    !arraysEqual(
      currentSchoolIds.orgMembership,
      [teacher.schoolId],
    ) ||
    !arraysEqual(
      currentSchoolIds.claims,
      [teacher.schoolId],
    ) ||
    userMembership.scopeId !==
      teacher.schoolId ||
    orgMembership.scopeId !==
      teacher.schoolId;

  const roleNeedsRepair =
    currentRoleKeys.user !==
      teacher.roleKey ||
    currentRoleKeys.userMembership !==
      teacher.roleKey ||
    currentRoleKeys.orgMembership !==
      teacher.roleKey ||
    currentRoleKeys.claims !==
      teacher.roleKey;

  if (
    (schoolNeedsRepair || roleNeedsRepair) &&
    (
      hasDetailedScopes(
        userMembership.scopes,
      ) ||
      hasDetailedScopes(
        orgMembership.scopes,
      )
    )
  ) {
    errors.push(
      "الحساب لديه نطاقات صفوف أو فصول أو مواد؛ يلزم مراجعتها قبل تغيير المدرسة.",
    );
  }

  if (
    wrongActiveAssignments.length > 0
  ) {
    errors.push(
      `يوجد ${wrongActiveAssignments.length} إسناد تدريس نشط تابع لمدرسة أخرى.`,
    );
  }

  let action = "NO_CHANGE";

  if (errors.length > 0) {
    action = "BLOCKED";
  } else if (
    schoolNeedsRepair ||
    roleNeedsRepair
  ) {
    action = "REPAIR";
  }

  return {
    ...teacher,

    uid,
    personId,

    action,

    schoolNeedsRepair,
    roleNeedsRepair,

    currentSchoolIds,
    currentRoleKeys,

    errors,
  };
}

async function repairTeacher({
  auth,
  db,
  teacher,
}) {
  const now = Date.now();

  const authUser =
    await auth.getUser(teacher.uid);

  const oldClaims =
    authUser.customClaims || {};

  const newClaims = {
    ...oldClaims,

    orgId: ORG_ID,
    personId: teacher.personId,

    role: "teacher",
    roleKey: teacher.roleKey,

    schoolIds: [
      teacher.schoolId,
    ],
  };

  const userRef = db.doc(
    `users/${teacher.uid}`,
  );

  const userMembershipRef = db.doc(
    `users/${teacher.uid}/orgMemberships/${ORG_ID}`,
  );

  const orgMembershipRef = db.doc(
    `orgs/${ORG_ID}/memberships/${teacher.uid}`,
  );

  const [
    userMembershipSnap,
    orgMembershipSnap,
  ] = await Promise.all([
    userMembershipRef.get(),
    orgMembershipRef.get(),
  ]);

  const userMembership =
    userMembershipSnap.data() || {};

  const orgMembership =
    orgMembershipSnap.data() || {};

  const batch = db.batch();

  batch.set(
    userRef,
    {
      schoolIds: [
        teacher.schoolId,
      ],

      roleKey:
        teacher.roleKey,

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  batch.set(
    userMembershipRef,
    {
      role: "teacher",

      roleKey:
        teacher.roleKey,

      scopeType: "SCHOOL",

      scopeId:
        teacher.schoolId,

      scopes:
        buildUpdatedScopes(
          userMembership.scopes,
          teacher.schoolId,
        ),

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  batch.set(
    orgMembershipRef,
    {
      role: "teacher",

      roleKey:
        teacher.roleKey,

      scopeType: "SCHOOL",

      scopeId:
        teacher.schoolId,

      scopes:
        buildUpdatedScopes(
          orgMembership.scopes,
          teacher.schoolId,
        ),

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  await auth.setCustomUserClaims(
    teacher.uid,
    newClaims,
  );

  try {
    await batch.commit();
  } catch (error) {
    try {
      await auth.setCustomUserClaims(
        teacher.uid,
        oldClaims,
      );
    } catch (rollbackError) {
      console.error(
        `تعذر استرجاع Custom Claims للحساب ${teacher.email}`,
      );

      console.error(rollbackError);
    }

    throw error;
  }

  return {
    email: teacher.email,
    uid: teacher.uid,
    personId: teacher.personId,

    schoolId:
      teacher.schoolId,

    roleKey:
      teacher.roleKey,
  };
}

async function main() {
  const args = parseArgs();

  const applyMode =
    args.apply ===
    APPLY_CONFIRMATION;

  console.log(
    "Teacher school scope repair",
  );

  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,

    mode: applyMode
      ? "APPLY"
      : "DRY_RUN_NO_WRITES",
  });

  await initializeFirebase();

  const auth = getAuth();
  const db = getFirestore();

  const teachers =
    await readExcelRows();

  if (teachers.length === 0) {
    throw new Error(
      "ملف Excel لا يحتوي على معلمين.",
    );
  }

  const results = [];

  for (const teacher of teachers) {
    console.log(
      `Checking ${teacher.email}...`,
    );

    results.push(
      await inspectTeacher({
        auth,
        db,
        teacher,
      }),
    );
  }

  console.log(
    "\n==============================",
  );

  console.log("Repair plan");

  console.log(
    "==============================",
  );

  console.table(
    results.map((item) => ({
      row: item.rowNumber,
      name: item.displayName,
      email: item.email,

      targetSchool:
        item.schoolId,

      targetRole:
        item.roleKey,

      action: item.action,

      errors:
        item.errors.length,
    })),
  );

  const blocked = results.filter(
    (item) =>
      item.action === "BLOCKED",
  );

  const repairs = results.filter(
    (item) =>
      item.action === "REPAIR",
  );

  const unchanged = results.filter(
    (item) =>
      item.action === "NO_CHANGE",
  );

  console.log(
    "\n==============================",
  );

  console.log("Summary");

  console.log(
    "==============================",
  );

  console.log({
    totalRows: results.length,
    repairs: repairs.length,
    noChange: unchanged.length,
    blocked: blocked.length,
  });

  for (const item of blocked) {
    console.error(
      `\nRow ${item.rowNumber} — ${item.email}`,
    );

    for (const error of item.errors) {
      console.error(`- ${error}`);
    }
  }

  if (blocked.length > 0) {
    console.error(
      "\nلم يتم تنفيذ أي تعديل بسبب وجود حسابات محظورة.",
    );

    process.exitCode = 1;
    return;
  }

  if (!applyMode) {
    console.log(
      "\nDRY_RUN completed successfully.",
    );

    console.log(
      "No Firebase documents or Custom Claims were changed.",
    );

    console.log(
      `To apply later, use --apply=${APPLY_CONFIRMATION}`,
    );

    return;
  }

  const repaired = [];
  const failures = [];

  for (const teacher of repairs) {
    console.log(
      `\nRepairing ${teacher.email}...`,
    );

    try {
      repaired.push(
        await repairTeacher({
          auth,
          db,
          teacher,
        }),
      );

      console.log(
        `Repaired successfully: ${teacher.email}`,
      );
    } catch (error) {
      failures.push({
        email: teacher.email,

        message:
          error instanceof Error
            ? error.message
            : String(error),
      });

      console.error(
        `Failed: ${teacher.email}`,
      );

      console.error(error);

      break;
    }
  }

  const report = {
    generatedAt:
      new Date().toISOString(),

    orgId: ORG_ID,

    summary: {
      totalRows:
        results.length,

      requestedRepairs:
        repairs.length,

      repaired:
        repaired.length,

      unchanged:
        unchanged.length,

      failed:
        failures.length,
    },

    repaired,
    failures,
  };

  fs.mkdirSync(
    path.dirname(REPORT_FILE),
    {
      recursive: true,
    },
  );

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      report,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    "\n==============================",
  );

  console.log("Apply summary");

  console.log(
    "==============================",
  );

  console.log(report.summary);

  console.log(
    `Report: ${REPORT_FILE}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "\nTeacher school scopes repaired successfully.",
  );

  console.log(
    "Affected users must sign out and sign in again.",
  );
}

main().catch((error) => {
  console.error(
    "\nTeacher school scope repair failed:",
  );

  console.error(error);

  process.exitCode = 1;
});