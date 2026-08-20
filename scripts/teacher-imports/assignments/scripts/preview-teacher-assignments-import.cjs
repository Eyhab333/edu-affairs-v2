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

const RECONCILE_MODES = new Set([
  "TEACHER_SCOPE",
  "FULL_SCOPE",
]);

const DEFAULT_RECONCILE_MODE =
  "TEACHER_SCOPE";

const MANAGED_ASSIGNMENT_ID_PREFIX =
  "teacher-provisioning__";

const OPERATION_KINDS = [
  "STUDENT_MEASUREMENT",
  "LEARNING_LOSS_FOLLOWUP",
  "LESSON_PREP",
  "STUDENT_GAMIFICATION",
  "STUDENT_NOTES",
  "VIRTUAL_CLASS",
];

const DESIRED_ASSIGNMENT_FIELDS = [
  "id",
  "orgId",
  "schoolId",
  "academicYearId",
  "termId",
  "teacherPersonId",
  "teacherEmail",
  "assignmentKind",
  "targetScopeType",
  "targetScopeId",
  "coverageMode",
  "subjectId",
  "subjectKey",
  "classId",
  "classSubjectOfferingId",
  "gradeId",
  "streamId",
  "isHomeroom",
  "roleInAssignment",
  "status",
  "note",
  "operationKinds",
  "active",
  "managedBy",
  "assignmentSource",
];

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

function resolveReconcileMode(args) {
  const reconcileMode =
    args.reconcileMode ||
    DEFAULT_RECONCILE_MODE;

  if (!RECONCILE_MODES.has(reconcileMode)) {
    throw new Error(
      `Invalid reconcileMode: ${reconcileMode}. ` +
        "Use TEACHER_SCOPE or FULL_SCOPE.",
    );
  }

  return reconcileMode;
}

function safeDocumentId(value) {
  return String(value)
    .replaceAll("/", "-")
    .replace(/\s+/g, "-");
}

function buildTeacherAssignmentId({
  personId,
  schoolId,
  academicYearId,
  termId,
  classSubjectOfferingId,
}) {
  return safeDocumentId(
    [
      "teacher-provisioning",
      personId,
      schoolId,
      academicYearId,
      termId,
      classSubjectOfferingId,
    ].join("__"),
  );
}

function assignmentIdentityKey({
  teacherPersonId,
  schoolId,
  academicYearId,
  termId,
  classSubjectOfferingId,
}) {
  return [
    teacherPersonId,
    schoolId,
    academicYearId,
    termId,
    classSubjectOfferingId,
  ].join("\u001f");
}

function reconcileScopeKey({
  schoolId,
  academicYearId,
  termId,
}) {
  return [
    schoolId,
    academicYearId,
    termId,
  ].join("\u001f");
}

function getReconcileScope(item) {
  if (
    !item.schoolId ||
    !item.academicYearId ||
    !item.termId
  ) {
    return null;
  }

  return {
    schoolId: item.schoolId,
    academicYearId: item.academicYearId,
    termId: item.termId,
  };
}

function buildDesiredTeacherAssignment({
  row,
  assignmentId,
}) {
  const isActive =
    row.assignmentStatus === "ACTIVE";

  return {
    id: assignmentId,

    orgId: ORG_ID,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    termId: row.termId,

    teacherPersonId: row.personId,
    teacherEmail: row.email,

    assignmentKind: "SUBJECT_TEACHER",

    targetScopeType: "CLASS",
    targetScopeId: row.classId,

    coverageMode: "EXPLICIT_CLASSES",

    subjectId: "",
    subjectKey: row.subjectKey,

    classId: row.classId,
    classSubjectOfferingId:
      row.classSubjectOfferingId,

    gradeId: row.gradeId,
    streamId: row.streamId,

    isHomeroom: false,
    roleInAssignment: "MAIN",

    status: isActive
      ? "ACTIVE"
      : "ENDED",

    note: "تم إنشاؤه بواسطة استيراد توزيع المعلمين",

    operationKinds: OPERATION_KINDS,

    active: isActive,

    managedBy: "TEACHER_PROVISIONING",
    assignmentSource: "OFFICIAL_IMPORT",
  };
}

function valuesEqual(left, right) {
  return JSON.stringify(left) ===
    JSON.stringify(right);
}

function buildChangedValues({
  currentAssignment,
  desiredAssignment,
}) {
  const changedFields = [];
  const currentValues = {};
  const desiredValues = {};

  for (const field of DESIRED_ASSIGNMENT_FIELDS) {
    const currentValue = currentAssignment[field];
    const desiredValue = desiredAssignment[field];

    if (valuesEqual(currentValue, desiredValue)) {
      continue;
    }

    changedFields.push(field);
    currentValues[field] = currentValue;
    desiredValues[field] = desiredValue;
  }

  return {
    changedFields,
    currentValues,
    desiredValues,
  };
}

function isImporterManagedAssignment(assignment) {
  return String(assignment.id || "").startsWith(
    MANAGED_ASSIGNMENT_ID_PREFIX,
  );
}

function isActiveNonEndedAssignment(assignment) {
  return assignment.status !== "ENDED" &&
    assignment.active !== false;
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

  const classData =
    classSnap.exists
      ? classSnap.data()
      : {};

  const offeringData =
    offeringSnap.exists
      ? offeringSnap.data()
      : {};

  const gradeId =
    classData.gradeId ||
    offeringData.gradeId ||
    "";

  const streamId =
    classData.streamId ||
    offeringData.streamId ||
    "";

  const resolvedClassTitle =
    classData.title ||
    classData.name ||
    row.classTitle ||
    row.classId;

  const resolvedSubjectTitle =
    offeringData.subjectTitleSnapshot ||
    offeringData.subjectTitle ||
    offeringData.displayName ||
    row.subjectTitle ||
    row.subjectKey;

  return {
    ...row,

    uid,
    personId,

    gradeId,
    streamId,
    classTitle: resolvedClassTitle,
    subjectTitle: resolvedSubjectTitle,

    errors,
  };
}

async function loadExistingTeacherAssignments(db) {
  const snapshot = await db
    .collection(
      `orgs/${ORG_ID}/teacherAssignments`,
    )
    .get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));
}

function planDesiredRows({
  inspectedRows,
  existingAssignments,
}) {
  const existingById = new Map(
    existingAssignments.map((assignment) => [
      assignment.id,
      assignment,
    ]),
  );

  const managedAssignmentsByIdentity = new Map();

  for (const assignment of existingAssignments) {
    if (!isImporterManagedAssignment(assignment)) {
      continue;
    }

    const identity = assignmentIdentityKey(assignment);

    if (!managedAssignmentsByIdentity.has(identity)) {
      managedAssignmentsByIdentity.set(
        identity,
        [],
      );
    }

    managedAssignmentsByIdentity
      .get(identity)
      .push(assignment);
  }

  return inspectedRows.map((row) => {
    const errors = [...row.errors];

    if (errors.length > 0) {
      return {
        ...row,
        action: "BLOCKED",
        errors,
        assignmentId: "",
        assignmentIdentity: "",
        existingAssignmentId: "",
        existingAssignmentIds: [],
        changedFields: [],
        currentValues: {},
        desiredValues: {},
      };
    }

    const assignmentId = buildTeacherAssignmentId({
      personId: row.personId,
      schoolId: row.schoolId,
      academicYearId: row.academicYearId,
      termId: row.termId,
      classSubjectOfferingId:
        row.classSubjectOfferingId,
    });

    const desiredAssignment =
      buildDesiredTeacherAssignment({
        row,
        assignmentId,
      });

    const assignmentIdentity =
      assignmentIdentityKey(desiredAssignment);

    const existingAssignment =
      existingById.get(assignmentId) || null;

    const sameIdentityManagedAssignments =
      managedAssignmentsByIdentity.get(
        assignmentIdentity,
      ) || [];

    if (
      !existingAssignment &&
      sameIdentityManagedAssignments.length > 0
    ) {
      errors.push(
        "يوجد إسناد مستورد بنفس الهوية لكن بمعرّف مستند غير متوافق؛ تمت حماية الصف من الإنشاء المكرر.",
      );
    }

    if (
      existingAssignment &&
      assignmentIdentityKey(existingAssignment) !==
        assignmentIdentity
    ) {
      errors.push(
        "معرّف الإسناد الموجود لا يطابق هوية الإسناد المخزنة؛ لن يتم اقتراح UPDATE أو إنشاء بديل تلقائياً.",
      );
    }

    if (errors.length > 0) {
      return {
        ...row,
        action: "BLOCKED",
        errors,
        assignmentId,
        assignmentIdentity,
        existingAssignmentId:
          existingAssignment?.id || "",
        existingAssignmentIds:
          sameIdentityManagedAssignments.map(
            (assignment) => assignment.id,
          ),
        changedFields: [],
        currentValues: {},
        desiredValues: {},
        desiredAssignment,
      };
    }

    if (!existingAssignment) {
      return {
        ...row,
        action: "CREATE",
        errors,
        assignmentId,
        assignmentIdentity,
        existingAssignmentId: "",
        existingAssignmentIds: [],
        changedFields: [],
        currentValues: {},
        desiredValues: {},
        desiredAssignment,
      };
    }

    const changed = buildChangedValues({
      currentAssignment: existingAssignment,
      desiredAssignment,
    });

    return {
      ...row,
      action:
        changed.changedFields.length > 0
          ? "UPDATE"
          : "KEEP_EXISTING",
      errors,
      assignmentId,
      assignmentIdentity,
      existingAssignmentId: existingAssignment.id,
      existingAssignmentIds: [existingAssignment.id],
      ...changed,
      desiredAssignment,
    };
  });
}

function buildReconcilePlan({
  desiredRows,
  existingAssignments,
  reconcileMode,
}) {
  const scopes = new Map();
  const emailByPersonId = new Map();

  for (const row of desiredRows) {
    const scope = getReconcileScope(row);

    if (!scope) {
      continue;
    }

    const key = reconcileScopeKey(scope);

    if (!scopes.has(key)) {
      scopes.set(key, {
        ...scope,
        blocked: false,
        blockedRowNumbers: [],
        desiredIdentityKeys: new Set(),
        teacherPersonIds: new Set(),
      });
    }

    const scopeState = scopes.get(key);

    if (row.personId) {
      scopeState.teacherPersonIds.add(row.personId);

      if (row.email) {
        emailByPersonId.set(row.personId, row.email);
      }
    }

    if (row.action === "BLOCKED") {
      scopeState.blocked = true;
      scopeState.blockedRowNumbers.push(
        row.rowNumber,
      );
      continue;
    }

    scopeState.desiredIdentityKeys.add(
      row.assignmentIdentity,
    );
  }

  const suppressedReconcileScopes = Array.from(
    scopes.values(),
  )
    .filter((scope) => scope.blocked)
    .map((scope) => ({
      schoolId: scope.schoolId,
      academicYearId: scope.academicYearId,
      termId: scope.termId,
      blockedRowNumbers: scope.blockedRowNumbers,
      reason: "BLOCKED_DESIRED_ROWS",
    }));

  const obsoleteAssignments = [];

  for (const assignment of existingAssignments) {
    if (
      !isImporterManagedAssignment(assignment) ||
      !isActiveNonEndedAssignment(assignment)
    ) {
      continue;
    }

    const scope = getReconcileScope(assignment);

    if (!scope) {
      continue;
    }

    const scopeState = scopes.get(
      reconcileScopeKey(scope),
    );

    if (!scopeState || scopeState.blocked) {
      continue;
    }

    if (
      reconcileMode === "TEACHER_SCOPE" &&
      !scopeState.teacherPersonIds.has(
        assignment.teacherPersonId,
      )
    ) {
      continue;
    }

    if (
      scopeState.desiredIdentityKeys.has(
        assignmentIdentityKey(assignment),
      )
    ) {
      continue;
    }

    obsoleteAssignments.push({
      email:
        assignment.teacherEmail ||
        emailByPersonId.get(
          assignment.teacherPersonId,
        ) ||
        "",
      personId: assignment.teacherPersonId || "",
      existingAssignmentId: assignment.id,
      schoolId: assignment.schoolId || "",
      academicYearId: assignment.academicYearId || "",
      termId: assignment.termId || "",
      classId: assignment.classId || "",
      classSubjectOfferingId:
        assignment.classSubjectOfferingId || "",
      subjectKey: assignment.subjectKey || "",
      action: "END_OBSOLETE",
    });
  }

  return {
    obsoleteAssignments,
    suppressedReconcileScopes,
  };
}

async function main() {
  const args = parseArgs();
  const reconcileMode = resolveReconcileMode(args);

  console.log(
    "Previewing teacher assignments full reconcile...",
  );

  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,
    reconcileMode,
    mode: "DRY_RUN_NO_FIRESTORE_WRITES",
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

  const inspectedRows = [];

  for (const row of rows) {
    console.log(
      `Checking row ${row.rowNumber}: ${row.email}`,
    );

    inspectedRows.push(
      await inspectAssignmentRow({
        auth,
        db,
        row,
      }),
    );
  }

  const existingAssignments =
    await loadExistingTeacherAssignments(db);

  const results = planDesiredRows({
    inspectedRows,
    existingAssignments,
  });

  const {
    obsoleteAssignments,
    suppressedReconcileScopes,
  } = buildReconcilePlan({
    desiredRows: results,
    existingAssignments,
    reconcileMode,
  });

  const distinctTeachers = new Set(
    results
      .map(
        (item) =>
          item.personId || item.email,
      )
      .filter(Boolean),
  ).size;

  const summary = {
    totalDesiredRows: results.length,
    distinctTeachers,

    createCount: results.filter(
      (item) => item.action === "CREATE",
    ).length,

    keepExistingCount: results.filter(
      (item) =>
        item.action === "KEEP_EXISTING",
    ).length,

    updateCount: results.filter(
      (item) => item.action === "UPDATE",
    ).length,

    endObsoleteCount:
      obsoleteAssignments.length,

    blockedCount: results.filter(
      (item) => item.action === "BLOCKED",
    ).length,

    reconcileMode,
  };

  console.log("\n==============================");
  console.log("Desired rows");
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
      existingAssignmentId:
        item.existingAssignmentId || "—",
      action: item.action,
      changedFields:
        item.changedFields.join(", ") || "—",
      errors: item.errors.length,
    })),
  );

  console.log("\n==============================");
  console.log("Obsolete assignments");
  console.log("==============================");

  console.table(obsoleteAssignments);

  if (suppressedReconcileScopes.length > 0) {
    console.log("\n==============================");
    console.log("Suppressed reconciliation scopes");
    console.log("==============================");

    console.table(suppressedReconcileScopes);

    console.warn(
      "END_OBSOLETE was suppressed for the scopes above because their desired rows are not fully valid.",
    );
  }

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
         reconcileMode,
         summary,
         results,
         obsoleteAssignments,
         suppressedReconcileScopes,
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

  if (summary.blockedCount > 0) {
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
