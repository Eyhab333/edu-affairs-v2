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

const {
  getFirestore,
} = require("firebase-admin/firestore");

const ORG_ID = "takween";
const SHEET_NAME = "التوزيع";

const APPLY_CONFIRMATION =
  "APPLY_5_TEACHER_ASSIGNMENTS";

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
  "teacher-assignments-apply-5.json",
);

const OPERATION_DEFINITIONS = [
  {
    operationKind: "STUDENT_MEASUREMENT",
    title: "قياسات الطلاب",
  },
  {
    operationKind: "LEARNING_LOSS_FOLLOWUP",
    title: "متابعة الفاقد التعليمي",
  },
  {
    operationKind: "LESSON_PREP",
    title: "تحضير الدروس",
  },
  {
    operationKind: "STUDENT_GAMIFICATION",
    title: "تحفيز الطلاب",
  },
  {
    operationKind: "STUDENT_NOTES",
    title: "ملاحظات الطلاب",
  },
  {
    operationKind: "VIRTUAL_CLASS",
    title: "الفصول الافتراضية",
  },
];

const OPERATION_PERMISSIONS = [
  "VIEW",
  "CREATE",
  "UPDATE_DRAFT",
  "SUBMIT",
];

const RECONCILE_MODES = new Set([
  "TEACHER_SCOPE",
  "FULL_SCOPE",
]);

const DEFAULT_RECONCILE_MODE =
  "TEACHER_SCOPE";

const MANAGED_ASSIGNMENT_ID_PREFIX =
  "teacher-provisioning__";

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

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .filter(
          (value) =>
            typeof value === "string",
        )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
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

function valuesEqual(left, right) {
  return JSON.stringify(left) ===
    JSON.stringify(right);
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

function buildClassLinkId({
  assignmentId,
  classId,
}) {
  return safeDocumentId(
    [
      assignmentId,
      "class-link",
      classId,
    ].join("__"),
  );
}

function buildOperationalAssignmentId({
  assignmentId,
  operationKind,
}) {
  return safeDocumentId(
    [
      assignmentId,
      operationKind,
    ].join("__"),
  );
}

async function initializeFirebase() {
  if (getApps().length > 0) return;

  const args = parseArgs();

  const serviceAccountPath =
    args.serviceAccount ||
    process.env
      .GOOGLE_APPLICATION_CREDENTIALS ||
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

async function getAuthUserByEmail(
  auth,
  email,
) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (
      error?.code ===
      "auth/user-not-found"
    ) {
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

  const workbook =
    new ExcelJS.Workbook();

  await workbook.xlsx.readFile(
    INPUT_FILE,
  );

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
    const row =
      worksheet.getRow(rowNumber);

    const email = readCellText(
      row.getCell(1),
    ).toLowerCase();

    const schoolId = readCellText(
      row.getCell(2),
    );

    const academicYearId =
      readCellText(row.getCell(3));

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

    const assignmentStatus =
      readCellText(
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

async function findUserByEmail(
  db,
  email,
) {
  const snapshot = await db
    .collection("users")
    .where("email", "==", email)
    .limit(2)
    .get();

  if (snapshot.empty) {
    return {
      userDoc: null,
      matchesCount: 0,
    };
  }

  return {
    userDoc: snapshot.docs[0],
    matchesCount: snapshot.size,
  };
}

function validateRequiredFields(row) {
  const errors = [];

  if (!row.email) {
    errors.push(
      "بريد المعلم مطلوب.",
    );
  }

  if (!row.schoolId) {
    errors.push(
      "معرّف المدرسة مطلوب.",
    );
  }

  if (!row.academicYearId) {
    errors.push(
      "معرّف السنة الدراسية مطلوب.",
    );
  }

  if (!row.termId) {
    errors.push(
      "معرّف الفصل الدراسي مطلوب.",
    );
  }

  if (!row.classId) {
    errors.push(
      "معرّف الفصل مطلوب.",
    );
  }

  if (!row.classSubjectOfferingId) {
    errors.push(
      "معرّف إسناد المادة مطلوب.",
    );
  }

  if (!row.subjectKey) {
    errors.push(
      "رمز المادة مطلوب.",
    );
  }

  if (
    !["ACTIVE", "INACTIVE"].includes(
      row.assignmentStatus,
    )
  ) {
    errors.push(
      `حالة الإسناد غير صحيحة: ${
        row.assignmentStatus || "فارغ"
      }.`,
    );
  }

  return errors;
}

async function inspectRow({
  auth,
  db,
  row,
}) {
  const errors =
    validateRequiredFields(row);

  if (errors.length > 0) {
    return {
      ...row,
      errors,
    };
  }

  const authUser =
    await getAuthUserByEmail(
      auth,
      row.email,
    );

  const userLookup =
    await findUserByEmail(
      db,
      row.email,
    );

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

  if (
    userLookup.matchesCount > 1
  ) {
    errors.push(
      "يوجد أكثر من مستند users بنفس البريد.",
    );
  }

  if (
    authUser &&
    userLookup.userDoc &&
    authUser.uid !==
      userLookup.userDoc.id
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
      "مستند users لا يحتوي personId.",
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
  ] = await Promise.all([
    db
      .doc(
        `orgs/${ORG_ID}/schools/${row.schoolId}`,
      )
      .get(),

    db
      .doc(
        `orgs/${ORG_ID}/academicYears/${row.academicYearId}/terms/${row.termId}`,
      )
      .get(),

    db
      .doc(
        `orgs/${ORG_ID}/schools/${row.schoolId}/academicYears/${row.academicYearId}/classes/${row.classId}`,
      )
      .get(),

    db
      .doc(
        `orgs/${ORG_ID}/classSubjectOfferings/${row.classSubjectOfferingId}`,
      )
      .get(),

    personId
      ? db
          .doc(
            `orgs/${ORG_ID}/people/${personId}`,
          )
          .get()
      : Promise.resolve(null),

    uid
      ? db
          .doc(
            `users/${uid}/orgMemberships/${ORG_ID}`,
          )
          .get()
      : Promise.resolve(null),

    uid
      ? db
          .doc(
            `orgs/${ORG_ID}/memberships/${uid}`,
          )
          .get()
      : Promise.resolve(null),
  ]);

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
  }

  if (
    personId &&
    !personSnap?.exists
  ) {
    errors.push(
      `مستند person غير موجود: ${personId}`,
    );
  }

  if (
    uid &&
    !userMembershipSnap?.exists
  ) {
    errors.push(
      "عضوية المستخدم داخل users غير موجودة.",
    );
  }

  if (
    uid &&
    !orgMembershipSnap?.exists
  ) {
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

  if (offeringSnap.exists) {
    if (offeringData.orgId !== ORG_ID) {
      errors.push(
        "إسناد المادة تابع لمؤسسة أخرى.",
      );
    }

    if (
      offeringData.schoolId !==
      row.schoolId
    ) {
      errors.push(
        "مدرسة إسناد المادة لا تطابق Excel.",
      );
    }

    if (
      offeringData.academicYearId !==
      row.academicYearId
    ) {
      errors.push(
        "السنة الدراسية في إسناد المادة لا تطابق Excel.",
      );
    }

    if (
      offeringData.classId !==
      row.classId
    ) {
      errors.push(
        "الفصل داخل إسناد المادة لا يطابق Excel.",
      );
    }

    const offeringSubjectKey =
      String(
        offeringData.subjectKey || "",
      ).toUpperCase();

    if (
      offeringSubjectKey !==
      row.subjectKey
    ) {
      errors.push(
        "رمز المادة داخل إسناد المادة لا يطابق Excel.",
      );
    }

    if (
      offeringData.isArchived === true
    ) {
      errors.push(
        "إسناد المادة مؤرشف.",
      );
    }
  }

  const userMembershipData =
    userMembershipSnap?.exists
      ? userMembershipSnap.data()
      : {};

  const orgMembershipData =
    orgMembershipSnap?.exists
      ? orgMembershipSnap.data()
      : {};

  const roleKey =
    userMembershipData.roleKey ||
    orgMembershipData.roleKey ||
    "BOYS_TEACHER";

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
    roleKey,

    gradeId,
    streamId,

    resolvedClassTitle,
    resolvedSubjectTitle,

    userMembershipData,
    orgMembershipData,

    errors,
  };
}

function groupRowsByTeacher(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.email;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return Array.from(
    groups.entries(),
  ).map(([email, teacherRows]) => ({
    email,
    rows: teacherRows,
  }));
}

function buildUpdatedScopes({
  currentScopes,
  rows,
}) {
  const scopes =
    currentScopes &&
    typeof currentScopes === "object"
      ? currentScopes
      : {};

  return {
    ...scopes,

    schoolIds: uniqueStrings([
      ...(scopes.schoolIds || []),
      ...rows.map(
        (row) => row.schoolId,
      ),
    ]),

    gradeIds: uniqueStrings([
      ...(scopes.gradeIds || []),
      ...rows.map(
        (row) => row.gradeId,
      ),
    ]),

    classIds: uniqueStrings([
      ...(scopes.classIds || []),
      ...rows.map(
        (row) => row.classId,
      ),
    ]),

    subjectKeys: uniqueStrings([
      ...(scopes.subjectKeys || []),
      ...rows.map(
        (row) => row.subjectKey,
      ),
    ]),

    routeIds: uniqueStrings(
      scopes.routeIds || [],
    ),

    canAccessAllSchools:
      scopes.canAccessAllSchools === true,
  };
}

function buildTeacherAssignment({
  row,
  assignmentId,
  now,
}) {
  const isActive =
    row.assignmentStatus === "ACTIVE";

  return {
    id: assignmentId,

    orgId: ORG_ID,
    schoolId: row.schoolId,
    academicYearId:
      row.academicYearId,
    termId: row.termId,

    teacherPersonId: row.personId,
    teacherEmail: row.email,

    assignmentKind:
      "SUBJECT_TEACHER",

    targetScopeType: "CLASS",
    targetScopeId: row.classId,

    coverageMode:
      "EXPLICIT_CLASSES",

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

    startAt: now,

    note:
      "تم إنشاؤه بواسطة استيراد توزيع المعلمين",

    operationKinds:
      OPERATION_DEFINITIONS.map(
        (item) =>
          item.operationKind,
      ),

    active: isActive,

    managedBy:
      "TEACHER_PROVISIONING",

    assignmentSource:
      "OFFICIAL_IMPORT",

    createdAt: now,
    updatedAt: now,
  };
}

function buildClassLink({
  row,
  assignmentId,
  classLinkId,
  now,
}) {
  const isActive =
    row.assignmentStatus === "ACTIVE";

  return {
    id: classLinkId,

    assignmentId,

    // للتوافق مع أي أكواد قديمة تستخدم الاسم الآخر.
    teacherAssignmentId:
      assignmentId,

    orgId: ORG_ID,
    schoolId: row.schoolId,
    academicYearId:
      row.academicYearId,
    termId: row.termId,

    classId: row.classId,
    gradeId: row.gradeId,
    streamId: row.streamId,

    subjectKey: row.subjectKey,

    classSubjectOfferingId:
      row.classSubjectOfferingId,

    order: 0,
    isPrimaryClass: true,

    active: isActive,

    managedBy:
      "TEACHER_PROVISIONING",

    createdAt: now,
    updatedAt: now,
  };
}

function buildOperationalAssignment({
  row,
  assignmentId,
  definition,
  now,
}) {
  const isActive =
    row.assignmentStatus === "ACTIVE";

  const operationalAssignmentId =
    buildOperationalAssignmentId({
      assignmentId,
      operationKind:
        definition.operationKind,
    });

  return {
    id: operationalAssignmentId,

    orgId: ORG_ID,
    schoolId: row.schoolId,
    academicYearId:
      row.academicYearId,
    termId: row.termId,

    gradeId: row.gradeId,
    classId: row.classId,
    streamId: row.streamId,

    subjectKey: row.subjectKey,

    classSubjectOfferingId:
      row.classSubjectOfferingId,

    title: definition.title,

    description:
      "إسناد تشغيل مرتبط بفصل ومادة محددين",

    status: isActive
      ? "ACTIVE"
      : "ENDED",

    isActive,

    startAt: now,

    actorPersonId: row.personId,
    actorMembershipId: "",
    actorRoleKey: row.roleKey,

    operationKind:
      definition.operationKind,

    scopeType: "CLASS",
    scopeId: row.classId,

    scopeLabel:
      row.classSubjectOfferingId,

    coverageMode:
      "SINGLE_SCOPE",

    targetKind: "CLASS",

    targetPersonIds: [],
    targetStudentIds: [],

    targetClassIds: [
      row.classId,
    ],

    targetGradeIds:
      row.gradeId
        ? [row.gradeId]
        : [],

    targetRouteIds: [],
    targetRoleKeys: [],

    permissions:
      OPERATION_PERMISSIONS,

    sourceTeacherAssignmentId:
      assignmentId,

    sourceMembershipId: "",

    note:
      "تم إنشاؤه بواسطة Teacher Provisioning Engine",

    active: isActive,

    managedBy:
      "TEACHER_PROVISIONING",

    createdAt: now,
    updatedAt: now,
  };
}

function buildDesiredAssignmentForComparison({
  row,
  assignmentId,
}) {
  const payload = buildTeacherAssignment({
    row,
    assignmentId,
    now: 0,
  });

  delete payload.startAt;
  delete payload.createdAt;
  delete payload.updatedAt;

  return payload;
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
      buildDesiredAssignmentForComparison({
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
      action: "END_OBSOLETE",
      email:
        assignment.teacherEmail ||
        emailByPersonId.get(
          assignment.teacherPersonId,
        ) ||
        "",
      personId: assignment.teacherPersonId || "",
      assignmentId: assignment.id,
      existingAssignmentId: assignment.id,
      schoolId: assignment.schoolId || "",
      academicYearId: assignment.academicYearId || "",
      termId: assignment.termId || "",
      classId: assignment.classId || "",
      classSubjectOfferingId:
        assignment.classSubjectOfferingId || "",
      subjectKey: assignment.subjectKey || "",
      existingAssignment: assignment,
      pathsWritten: [],
    });
  }

  return {
    obsoleteAssignments,
    suppressedReconcileScopes,
  };
}

async function applyTeacherGroup({
  db,
  group,
}) {
  const rows = group.rows;
  const firstRow = rows[0];

  const now = Date.now();

  const userRef = db.doc(
    `users/${firstRow.uid}`,
  );

  const personRef = db.doc(
    `orgs/${ORG_ID}/people/${firstRow.personId}`,
  );

  const userMembershipRef = db.doc(
    `users/${firstRow.uid}/orgMemberships/${ORG_ID}`,
  );

  const orgMembershipRef = db.doc(
    `orgs/${ORG_ID}/memberships/${firstRow.uid}`,
  );

  const [
    currentUserMembershipSnap,
    currentOrgMembershipSnap,
  ] = await Promise.all([
    userMembershipRef.get(),
    orgMembershipRef.get(),
  ]);

  const currentUserMembership =
    currentUserMembershipSnap.exists
      ? currentUserMembershipSnap.data()
      : {};

  const currentOrgMembership =
    currentOrgMembershipSnap.exists
      ? currentOrgMembershipSnap.data()
      : {};

  const activeRows = rows.filter(
    (row) =>
      row.assignmentStatus ===
      "ACTIVE",
  );

  const updatedUserScopes =
    buildUpdatedScopes({
      currentScopes:
        currentUserMembership.scopes,
      rows: activeRows,
    });

  const updatedOrgScopes =
    buildUpdatedScopes({
      currentScopes:
        currentOrgMembership.scopes,
      rows: activeRows,
    });

  const batch = db.batch();

  batch.set(
    userRef,
    {
      provisioningStatus:
        "ASSIGNED",

      assignmentStatus:
        "ACTIVE",

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  batch.set(
    personRef,
    {
      provisioningStatus:
        "ASSIGNED",

      assignmentStatus:
        "ACTIVE",

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  batch.set(
    userMembershipRef,
    {
      provisioningStatus:
        "ASSIGNED",

      assignmentStatus:
        "ACTIVE",

      scopes: updatedUserScopes,

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  batch.set(
    orgMembershipRef,
    {
      provisioningStatus:
        "ASSIGNED",

      assignmentStatus:
        "ACTIVE",

      scopes: updatedOrgScopes,

      updatedAt: now,
    },
    {
      merge: true,
    },
  );

  const writtenPaths = [];

  for (const row of rows) {
    const assignmentId =
      buildTeacherAssignmentId({
        personId: row.personId,
        schoolId: row.schoolId,
        academicYearId:
          row.academicYearId,
        termId: row.termId,
        classSubjectOfferingId:
          row.classSubjectOfferingId,
      });

    const classLinkId =
      buildClassLinkId({
        assignmentId,
        classId: row.classId,
      });

    const teacherAssignment =
      buildTeacherAssignment({
        row,
        assignmentId,
        now,
      });

    const classLink =
      buildClassLink({
        row,
        assignmentId,
        classLinkId,
        now,
      });

    const teacherAssignmentRef =
      db.doc(
        `orgs/${ORG_ID}/teacherAssignments/${assignmentId}`,
      );

    const classLinkRef =
      db.doc(
        `orgs/${ORG_ID}/teacherAssignmentClassLinks/${classLinkId}`,
      );

    batch.set(
      teacherAssignmentRef,
      teacherAssignment,
      {
        merge: true,
      },
    );

    batch.set(
      classLinkRef,
      classLink,
      {
        merge: true,
      },
    );

    writtenPaths.push(
      teacherAssignmentRef.path,
      classLinkRef.path,
    );

    for (
      const definition of
      OPERATION_DEFINITIONS
    ) {
      const operationalAssignment =
        buildOperationalAssignment({
          row,
          assignmentId,
          definition,
          now,
        });

      const operationalRef =
        db.doc(
          `orgs/${ORG_ID}/operationalAssignments/${operationalAssignment.id}`,
        );

      batch.set(
        operationalRef,
        operationalAssignment,
        {
          merge: true,
        },
      );

      writtenPaths.push(
        operationalRef.path,
      );
    }
  }

  await batch.commit();

  return {
    email: group.email,
    uid: firstRow.uid,
    personId: firstRow.personId,
    assignmentRows: rows.length,
    pathsWritten:
      writtenPaths.length + 4,
    writtenPaths,
  };
}

function groupActionsByTeacher(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = [
      row.uid,
      row.personId,
      row.email,
    ].join("\u001f");

    if (!groups.has(key)) {
      groups.set(key, {
        email: row.email,
        uid: row.uid,
        personId: row.personId,
        rows: [],
      });
    }

    groups.get(key).rows.push(row);
  }

  return Array.from(groups.values());
}

function buildAssignmentGraph({
  db,
  row,
  assignmentId,
  now,
}) {
  const classLinkId = buildClassLinkId({
    assignmentId,
    classId: row.classId,
  });

  const teacherAssignment =
    buildTeacherAssignment({
      row,
      assignmentId,
      now,
    });

  const classLink = buildClassLink({
    row,
    assignmentId,
    classLinkId,
    now,
  });

  const operationalAssignments =
    OPERATION_DEFINITIONS.map((definition) =>
      buildOperationalAssignment({
        row,
        assignmentId,
        definition,
        now,
      }),
    );

  return {
    teacherAssignment: {
      ref: db.doc(
        `orgs/${ORG_ID}/teacherAssignments/${assignmentId}`,
      ),
      payload: teacherAssignment,
      generatedTimestampFields: [
        "createdAt",
        "startAt",
      ],
    },
    classLink: {
      ref: db.doc(
        `orgs/${ORG_ID}/teacherAssignmentClassLinks/${classLinkId}`,
      ),
      payload: classLink,
      generatedTimestampFields: [
        "createdAt",
      ],
    },
    operationalAssignments:
      operationalAssignments.map((payload) => ({
        ref: db.doc(
          `orgs/${ORG_ID}/operationalAssignments/${payload.id}`,
        ),
        payload,
        generatedTimestampFields: [
          "createdAt",
          "startAt",
        ],
      })),
  };
}

function buildExistingAssignmentGraphRefs({
  db,
  assignment,
}) {
  const assignmentId = assignment.id;
  const classLinkId = buildClassLinkId({
    assignmentId,
    classId: assignment.classId,
  });

  return {
    teacherAssignmentRef: db.doc(
      `orgs/${ORG_ID}/teacherAssignments/${assignmentId}`,
    ),
    classLinkRef: db.doc(
      `orgs/${ORG_ID}/teacherAssignmentClassLinks/${classLinkId}`,
    ),
    operationalRefs: OPERATION_DEFINITIONS.map(
      (definition) =>
        db.doc(
          `orgs/${ORG_ID}/operationalAssignments/${buildOperationalAssignmentId({
            assignmentId,
            operationKind: definition.operationKind,
          })}`,
        ),
    ),
  };
}

function preserveExistingGeneratedTimestamps({
  payload,
  existing,
  generatedTimestampFields,
}) {
  if (!existing) {
    return payload;
  }

  const updatePayload = {
    ...payload,
  };

  for (const field of generatedTimestampFields) {
    delete updatePayload[field];
  }

  return updatePayload;
}

function buildActionReport({
  row,
  pathsWritten,
}) {
  return {
    action: row.action,
    email: row.email,
    personId: row.personId,
    assignmentId: row.assignmentId,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    termId: row.termId,
    classId: row.classId,
    classSubjectOfferingId:
      row.classSubjectOfferingId,
    subjectKey: row.subjectKey,
    existingAssignmentId:
      row.existingAssignmentId || "",
    changedFields: row.changedFields || [],
    pathsWritten,
  };
}

async function applyTeacherReconcileGroup({
  db,
  group,
}) {
  const now = Date.now();
  const rows = group.rows;
  const firstRow = rows[0];

  const userRef = db.doc(
    `users/${firstRow.uid}`,
  );

  const personRef = db.doc(
    `orgs/${ORG_ID}/people/${firstRow.personId}`,
  );

  const userMembershipRef = db.doc(
    `users/${firstRow.uid}/orgMemberships/${ORG_ID}`,
  );

  const orgMembershipRef = db.doc(
    `orgs/${ORG_ID}/memberships/${firstRow.uid}`,
  );

  const graphs = rows.map((row) => ({
    row,
    graph: buildAssignmentGraph({
      db,
      row,
      assignmentId: row.assignmentId,
      now,
    }),
  }));

  const existingGraphRefs = [];

  for (const item of graphs) {
    if (item.row.action !== "UPDATE") {
      continue;
    }

    existingGraphRefs.push(
      item.graph.teacherAssignment.ref,
      item.graph.classLink.ref,
      ...item.graph.operationalAssignments.map(
        (operation) => operation.ref,
      ),
    );
  }

  const [
    currentUserMembershipSnap,
    currentOrgMembershipSnap,
    ...existingGraphSnaps
  ] = await Promise.all([
    userMembershipRef.get(),
    orgMembershipRef.get(),
    ...existingGraphRefs.map((ref) => ref.get()),
  ]);

  const existingGraphByPath = new Map(
    existingGraphSnaps.map((snap) => [
      snap.ref.path,
      snap.exists,
    ]),
  );

  const currentUserMembership =
    currentUserMembershipSnap.exists
      ? currentUserMembershipSnap.data()
      : {};

  const currentOrgMembership =
    currentOrgMembershipSnap.exists
      ? currentOrgMembershipSnap.data()
      : {};

  const activeRows = rows.filter(
    (row) =>
      row.assignmentStatus === "ACTIVE",
  );

  const updatedUserScopes =
    buildUpdatedScopes({
      currentScopes:
        currentUserMembership.scopes,
      rows: activeRows,
    });

  const updatedOrgScopes =
    buildUpdatedScopes({
      currentScopes:
        currentOrgMembership.scopes,
      rows: activeRows,
    });

  const batch = db.batch();
  const membershipProfilePaths = [
    userRef.path,
    personRef.path,
    userMembershipRef.path,
    orgMembershipRef.path,
  ];

  batch.set(
    userRef,
    {
      provisioningStatus: "ASSIGNED",
      assignmentStatus: "ACTIVE",
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    personRef,
    {
      provisioningStatus: "ASSIGNED",
      assignmentStatus: "ACTIVE",
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    userMembershipRef,
    {
      provisioningStatus: "ASSIGNED",
      assignmentStatus: "ACTIVE",
      scopes: updatedUserScopes,
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    orgMembershipRef,
    {
      provisioningStatus: "ASSIGNED",
      assignmentStatus: "ACTIVE",
      scopes: updatedOrgScopes,
      updatedAt: now,
    },
    { merge: true },
  );

  const actionReports = [];

  for (const item of graphs) {
    const isCreate = item.row.action === "CREATE";
    const pathsWritten = [];

    const teacherAssignmentPayload =
      preserveExistingGeneratedTimestamps({
        payload: item.graph.teacherAssignment.payload,
        existing:
          !isCreate &&
          existingGraphByPath.get(
            item.graph.teacherAssignment.ref.path,
          ) === true,
        generatedTimestampFields:
          item.graph.teacherAssignment
            .generatedTimestampFields,
      });

    batch.set(
      item.graph.teacherAssignment.ref,
      teacherAssignmentPayload,
      { merge: true },
    );

    pathsWritten.push(
      item.graph.teacherAssignment.ref.path,
    );

    const classLinkPayload =
      preserveExistingGeneratedTimestamps({
        payload: item.graph.classLink.payload,
        existing:
          !isCreate &&
          existingGraphByPath.get(
            item.graph.classLink.ref.path,
          ) === true,
        generatedTimestampFields:
          item.graph.classLink
            .generatedTimestampFields,
      });

    batch.set(
      item.graph.classLink.ref,
      classLinkPayload,
      { merge: true },
    );

    pathsWritten.push(item.graph.classLink.ref.path);

    for (
      const operation of item.graph
        .operationalAssignments
    ) {
      const operationPayload =
        preserveExistingGeneratedTimestamps({
          payload: operation.payload,
          existing:
            !isCreate &&
            existingGraphByPath.get(
              operation.ref.path,
            ) === true,
          generatedTimestampFields:
            operation.generatedTimestampFields,
        });

      batch.set(
        operation.ref,
        operationPayload,
        { merge: true },
      );

      pathsWritten.push(operation.ref.path);
    }

    actionReports.push(
      buildActionReport({
        row: item.row,
        pathsWritten,
      }),
    );
  }

  await batch.commit();

  return {
    email: group.email,
    uid: group.uid,
    personId: group.personId,
    actions: actionReports,
    membershipProfilePaths,
    scopeRemovalPolicy:
      "PRESERVE_EXISTING_BROADER_SCOPES",
  };
}

function buildEndUpdate({
  existingData,
  now,
  operational,
}) {
  const update = operational
    ? {
        status: "ENDED",
        isActive: false,
        active: false,
        updatedAt: now,
      }
    : {
        status: "ENDED",
        active: false,
        updatedAt: now,
      };

  if (!existingData.endedAt) {
    update.endedAt = now;
  }

  return update;
}

async function applyEndObsoleteAssignment({
  db,
  action,
}) {
  const graph = buildExistingAssignmentGraphRefs({
    db,
    assignment: action.existingAssignment,
  });

  const [
    assignmentSnap,
    classLinkSnap,
    ...operationalSnaps
  ] = await Promise.all([
    graph.teacherAssignmentRef.get(),
    graph.classLinkRef.get(),
    ...graph.operationalRefs.map((ref) => ref.get()),
  ]);

  const requiredSnaps = [
    assignmentSnap,
    classLinkSnap,
    ...operationalSnaps,
  ];

  const missingPaths = requiredSnaps
    .filter((snap) => !snap.exists)
    .map((snap) => snap.ref.path);

  if (missingPaths.length > 0) {
    throw new Error(
      `Cannot END_OBSOLETE ${action.existingAssignmentId}; missing managed graph documents: ${missingPaths.join(", ")}`,
    );
  }

  const now = Date.now();
  const batch = db.batch();

  batch.update(
    graph.teacherAssignmentRef,
    buildEndUpdate({
      existingData: assignmentSnap.data(),
      now,
      operational: false,
    }),
  );

  batch.update(
    graph.classLinkRef,
    {
      active: false,
      updatedAt: now,
    },
  );

  for (
    let index = 0;
    index < graph.operationalRefs.length;
    index += 1
  ) {
    batch.update(
      graph.operationalRefs[index],
      buildEndUpdate({
        existingData: operationalSnaps[index].data(),
        now,
        operational: true,
      }),
    );
  }

  await batch.commit();

  const pathsWritten = [
    graph.teacherAssignmentRef.path,
    graph.classLinkRef.path,
    ...graph.operationalRefs.map((ref) => ref.path),
  ];

  return {
    action: action.action,
    email: action.email,
    personId: action.personId,
    assignmentId: action.assignmentId,
    existingAssignmentId:
      action.existingAssignmentId,
    schoolId: action.schoolId,
    academicYearId: action.academicYearId,
    termId: action.termId,
    classId: action.classId,
    classSubjectOfferingId:
      action.classSubjectOfferingId,
    subjectKey: action.subjectKey,
    changedFields: [
      "status",
      "active",
      "endedAt",
    ],
    pathsWritten,
  };
}

async function validateEndObsoleteGraphs({
  db,
  actions,
}) {
  for (const action of actions) {
    const graph = buildExistingAssignmentGraphRefs({
      db,
      assignment: action.existingAssignment,
    });

    const snapshots = await Promise.all([
      graph.teacherAssignmentRef.get(),
      graph.classLinkRef.get(),
      ...graph.operationalRefs.map((ref) => ref.get()),
    ]);

    const missingPaths = snapshots
      .filter((snap) => !snap.exists)
      .map((snap) => snap.ref.path);

    if (missingPaths.length > 0) {
      throw new Error(
        `Cannot END_OBSOLETE ${action.existingAssignmentId}; missing managed graph documents: ${missingPaths.join(", ")}`,
      );
    }
  }
}

function buildWritePlan({
  desiredRows,
  obsoleteAssignments,
}) {
  const createRows = desiredRows.filter(
    (row) => row.action === "CREATE",
  );

  const updateRows = desiredRows.filter(
    (row) => row.action === "UPDATE",
  );

  const actionGroups = groupActionsByTeacher([
    ...createRows,
    ...updateRows,
  ]);

  const assignmentGraphDocuments =
    2 + OPERATION_DEFINITIONS.length;

  const writeCounts = {
    create:
      createRows.length *
      assignmentGraphDocuments,
    update:
      updateRows.length *
      assignmentGraphDocuments,
    endObsolete:
      obsoleteAssignments.length *
      assignmentGraphDocuments,
    membershipProfile:
      actionGroups.length * 4,
  };

  return {
    actionGroups,
    assignmentGraphDocuments,
    writeCounts,
    documentsCreatedOrUpdated:
      writeCounts.create +
      writeCounts.update +
      writeCounts.endObsolete +
      writeCounts.membershipProfile,
  };
}

function writeReport(report) {
  fs.mkdirSync(
    path.dirname(REPORT_FILE),
    { recursive: true },
  );

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(report, null, 2),
    "utf8",
  );
}

async function legacyApplyMain() {
  const args = parseArgs();

  const applyMode =
    args.apply ===
    APPLY_CONFIRMATION;

  console.log(
    "Teacher assignments import",
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

  const inputRows =
    await readExcelRows();

  if (inputRows.length === 0) {
    throw new Error(
      "ملف التوزيع لا يحتوي على أي إسنادات مكتملة.",
    );
  }

  const inspectedRows = [];

  for (const row of inputRows) {
    console.log(
      `Checking row ${row.rowNumber}: ${row.email}`,
    );

    inspectedRows.push(
      await inspectRow({
        auth,
        db,
        row,
      }),
    );
  }

  const invalidRows =
    inspectedRows.filter(
      (row) =>
        row.errors.length > 0,
    );

  const duplicateKeys = new Map();

  for (const row of inspectedRows) {
    const key = [
      row.email,
      row.schoolId,
      row.academicYearId,
      row.termId,
      row.classId,
      row.classSubjectOfferingId,
    ].join("|");

    if (
      duplicateKeys.has(key)
    ) {
      row.errors.push(
        `الإسناد مكرر مع الصف ${duplicateKeys.get(
          key,
        )}.`,
      );
    } else {
      duplicateKeys.set(
        key,
        row.rowNumber,
      );
    }
  }

  console.log("\n==============================");
  console.log("Execution plan");
  console.log("==============================");

  console.table(
    inspectedRows.map((row) => ({
      row: row.rowNumber,
      email: row.email,
      personId: row.personId,
      classId: row.classId,
      offeringId:
        row.classSubjectOfferingId,
      subjectKey: row.subjectKey,
      gradeId: row.gradeId,
      status:
        row.assignmentStatus,
      documents:
        2 +
        OPERATION_DEFINITIONS.length,
      errors: row.errors.length,
    })),
  );

  const rowsWithErrors =
    inspectedRows.filter(
      (row) =>
        row.errors.length > 0,
    );

  if (rowsWithErrors.length > 0) {
    console.error(
      "\nValidation errors",
    );

    for (const row of rowsWithErrors) {
      console.error(
        `\nRow ${row.rowNumber} — ${row.email}`,
      );

      for (const error of row.errors) {
        console.error(`- ${error}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  const groups =
    groupRowsByTeacher(
      inspectedRows,
    );

  const totalDocuments =
    inspectedRows.length *
      (2 +
        OPERATION_DEFINITIONS.length) +
    groups.length * 4;

  console.log("\n==============================");
  console.log("Summary");
  console.log("==============================");

  console.log({
    assignmentRows:
      inspectedRows.length,

    distinctTeachers:
      groups.length,

    teacherAssignments:
      inspectedRows.length,

    classLinks:
      inspectedRows.length,

    operationalAssignments:
      inspectedRows.length *
      OPERATION_DEFINITIONS.length,

    membershipAndProfileUpdates:
      groups.length * 4,

    totalDocuments,
  });

  if (!applyMode) {
    console.log(
      "\nDRY_RUN completed successfully.",
    );

    console.log(
      "No teacher assignments or Firebase documents were created.",
    );

    console.log(
      `To apply later, use --apply=${APPLY_CONFIRMATION}`,
    );

    return;
  }

  const results = [];
  const failures = [];

  for (const group of groups) {
    console.log(
      `\nApplying assignments for ${group.email}...`,
    );

    try {
      const result =
        await applyTeacherGroup({
          db,
          group,
        });

      results.push(result);

      console.log(
        `Applied successfully: ${group.email}`,
      );
    } catch (error) {
      failures.push({
        email: group.email,

        message:
          error instanceof Error
            ? error.message
            : String(error),
      });

      console.error(
        `Failed: ${group.email}`,
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
      requestedTeachers:
        groups.length,

      completedTeachers:
        results.length,

      failedTeachers:
        failures.length,

      assignmentRows:
        inspectedRows.length,
    },

    results,
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

  console.log("\n==============================");
  console.log("Apply summary");
  console.log("==============================");

  console.log(report.summary);

  console.log(
    `Report written to: ${REPORT_FILE}`,
  );

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "\nAll teacher assignments were applied successfully.",
  );
}

async function main() {
  const args = parseArgs();
  const reconcileMode = resolveReconcileMode(args);
  const applyMode =
    args.apply === APPLY_CONFIRMATION;

  if (
    args.apply &&
    args.apply !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Invalid apply confirmation. Expected --apply=${APPLY_CONFIRMATION}.`,
    );
  }

  console.log(
    "Teacher assignments full reconcile",
  );

  console.log({
    orgId: ORG_ID,
    inputFile: INPUT_FILE,
    reconcileMode,
    mode: applyMode
      ? "APPLY"
      : "DRY_RUN_NO_WRITES",
  });

  await initializeFirebase();

  const auth = getAuth();
  const db = getFirestore();

  const inputRows = await readExcelRows();

  if (inputRows.length === 0) {
    throw new Error(
      "ملف التوزيع لا يحتوي على أي إسنادات مكتملة.",
    );
  }

  const inspectedRows = [];

  for (const row of inputRows) {
    console.log(
      `Checking row ${row.rowNumber}: ${row.email}`,
    );

    inspectedRows.push(
      await inspectRow({
        auth,
        db,
        row,
      }),
    );
  }

  const duplicateKeys = new Map();

  for (const row of inspectedRows) {
    const key = [
      row.email,
      row.schoolId,
      row.academicYearId,
      row.termId,
      row.classId,
      row.classSubjectOfferingId,
    ].join("|");

    if (duplicateKeys.has(key)) {
      row.errors.push(
        `الإسناد مكرر مع الصف ${duplicateKeys.get(key)}.`,
      );
      continue;
    }

    duplicateKeys.set(key, row.rowNumber);
  }

  const existingAssignments =
    await loadExistingTeacherAssignments(db);

  const desiredRows = planDesiredRows({
    inspectedRows,
    existingAssignments,
  });

  const {
    obsoleteAssignments,
    suppressedReconcileScopes,
  } = buildReconcilePlan({
    desiredRows,
    existingAssignments,
    reconcileMode,
  });

  const writePlan = buildWritePlan({
    desiredRows,
    obsoleteAssignments,
  });

  const distinctTeachers = new Set(
    desiredRows
      .map(
        (row) => row.personId || row.email,
      )
      .filter(Boolean),
  ).size;

  const summary = {
    desiredRows: desiredRows.length,
    distinctTeachers,
    createCount: desiredRows.filter(
      (row) => row.action === "CREATE",
    ).length,
    keepExistingCount: desiredRows.filter(
      (row) => row.action === "KEEP_EXISTING",
    ).length,
    updateCount: desiredRows.filter(
      (row) => row.action === "UPDATE",
    ).length,
    endObsoleteCount:
      obsoleteAssignments.length,
    blockedCount: desiredRows.filter(
      (row) => row.action === "BLOCKED",
    ).length,
    documentsCreatedOrUpdated: applyMode
      ? 0
      : writePlan.documentsCreatedOrUpdated,
    failedTeachers: 0,
  };

  const obsoleteReportRows =
    obsoleteAssignments.map(
      ({ existingAssignment, ...item }) => item,
    );

  console.log("\n==============================");
  console.log("Desired rows");
  console.log("==============================");

  console.table(
    desiredRows.map((row) => ({
      row: row.rowNumber,
      email: row.email,
      personId: row.personId,
      classId: row.classId,
      offeringId: row.classSubjectOfferingId,
      subjectKey: row.subjectKey,
      existingAssignmentId:
        row.existingAssignmentId || "—",
      action: row.action,
      changedFields:
        row.changedFields.join(", ") || "—",
      errors: row.errors.length,
    })),
  );

  console.log("\n==============================");
  console.log("Obsolete assignments");
  console.log("==============================");

  console.table(obsoleteReportRows);

  if (suppressedReconcileScopes.length > 0) {
    console.log("\n==============================");
    console.log("Suppressed reconciliation scopes");
    console.log("==============================");

    console.table(suppressedReconcileScopes);

    console.warn(
      "END_OBSOLETE was suppressed for the scopes above because their desired rows are not fully valid.",
    );
  }

  for (const row of desiredRows) {
    if (row.errors.length === 0) continue;

    console.error(
      `\nRow ${row.rowNumber} — ${row.email}`,
    );

    for (const error of row.errors) {
      console.error(`- ${error}`);
    }
  }

  console.log("\n==============================");
  console.log("Reconcile summary");
  console.log("==============================");

  console.log({
    reconcileMode,
    ...summary,
    plannedWriteCounts: writePlan.writeCounts,
    scopeRemovalPolicy:
      "PRESERVE_EXISTING_BROADER_SCOPES",
  });

  const report = {
    generatedAt: new Date().toISOString(),
    orgId: ORG_ID,
    reconcileMode,
    mode: applyMode ? "APPLY" : "DRY_RUN",
    summary,
    plannedWriteCounts: writePlan.writeCounts,
    scopeRemovalPolicy:
      "PRESERVE_EXISTING_BROADER_SCOPES",
    scopeRemovalNote:
      "Membership scopes are additive only. END_OBSOLETE does not shrink scopes because current provenance cannot safely distinguish assignment-derived scope values from other legitimate access.",
    desiredRows,
    obsoleteAssignments: obsoleteReportRows,
    suppressedReconcileScopes,
    executedActions: [],
    membershipProfileChanges: [],
    failures: [],
  };

  if (!applyMode) {
    writeReport(report);

    console.log(
      `\nDRY_RUN completed. Report written to: ${REPORT_FILE}`,
    );
    console.log(
      "No teacher assignments or Firebase documents were created or updated.",
    );
    console.log(
      `To apply later, use --apply=${APPLY_CONFIRMATION}`,
    );
    return;
  }

  if (summary.blockedCount > 0) {
    report.failures.push({
      message:
        "Blocked desired rows were found. Apply was stopped before all Firestore writes.",
    });
    summary.failedTeachers = new Set(
      desiredRows
        .filter((row) => row.action === "BLOCKED")
        .map((row) => row.personId || row.email)
        .filter(Boolean),
    ).size;

    writeReport(report);
    console.error(
      "Apply blocked before writes because the desired state is not fully valid.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await validateEndObsoleteGraphs({
      db,
      actions: obsoleteAssignments,
    });
  } catch (error) {
    report.failures.push({
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });
    summary.failedTeachers = 1;
    writeReport(report);
    throw error;
  }

  for (const group of writePlan.actionGroups) {
    try {
      const result =
        await applyTeacherReconcileGroup({
          db,
          group,
        });

      report.executedActions.push(
        ...result.actions,
      );

      report.membershipProfileChanges.push({
        email: result.email,
        personId: result.personId,
        pathsWritten: result.membershipProfilePaths,
        scopeRemovalPolicy:
          result.scopeRemovalPolicy,
      });
    } catch (error) {
      report.failures.push({
        email: group.email,
        personId: group.personId,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      });
      break;
    }
  }

  if (report.failures.length === 0) {
    for (const action of obsoleteAssignments) {
      try {
        report.executedActions.push(
          await applyEndObsoleteAssignment({
            db,
            action,
          }),
        );
      } catch (error) {
        report.failures.push({
          email: action.email,
          personId: action.personId,
          existingAssignmentId:
            action.existingAssignmentId,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
        break;
      }
    }
  }

  const actualWriteCounts = {
    create: report.executedActions
      .filter((action) => action.action === "CREATE")
      .reduce(
        (total, action) =>
          total + action.pathsWritten.length,
        0,
      ),
    update: report.executedActions
      .filter((action) => action.action === "UPDATE")
      .reduce(
        (total, action) =>
          total + action.pathsWritten.length,
        0,
      ),
    endObsolete: report.executedActions
      .filter(
        (action) =>
          action.action === "END_OBSOLETE",
      )
      .reduce(
        (total, action) =>
          total + action.pathsWritten.length,
        0,
      ),
    membershipProfile:
      report.membershipProfileChanges.reduce(
        (total, item) =>
          total + item.pathsWritten.length,
        0,
      ),
  };

  summary.documentsCreatedOrUpdated =
    actualWriteCounts.create +
    actualWriteCounts.update +
    actualWriteCounts.endObsolete +
    actualWriteCounts.membershipProfile;

  summary.failedTeachers = new Set(
    report.failures
      .map((failure) =>
        failure.personId || failure.email || "unknown",
      )
      .filter(Boolean),
  ).size;

  report.actualWriteCounts = actualWriteCounts;

  writeReport(report);

  console.log("\n==============================");
  console.log("Apply summary");
  console.log("==============================");
  console.log({
    reconcileMode,
    ...summary,
    actualWriteCounts,
  });
  console.log(`Report written to: ${REPORT_FILE}`);

  if (report.failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    "Teacher assignment reconcile applied successfully.",
  );
}

main().catch((error) => {
  console.error(
    "\nTeacher assignments import failed:",
  );

  console.error(error);

  process.exitCode = 1;
});
