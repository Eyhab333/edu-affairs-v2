"use strict";

const admin = require("firebase-admin");
const ExcelJS = require("exceljs");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = process.env.KG_ORG_ID || "takween";
const ACADEMIC_YEAR_ID = process.env.KG_ACADEMIC_YEAR_ID || "ay-1448";
const SOURCE = "KG_TEACHER_ASSIGNMENT_RECONCILER";
const VERSION = 1;
const MANAGED_BY = "KG_TEACHER_ASSIGNMENT_RECONCILER";
const HISTORICAL_MANAGED_BY = new Set([
  "TEACHER_PROVISIONING",
  MANAGED_BY,
]);
const HISTORICAL_SOURCES = new Set([
  "TEACHER_PROVISIONING_ENGINE",
  SOURCE,
]);

const INPUT_PATH = path.resolve(
  __dirname,
  "inputs",
  "kg-teacher-assignment-map.xlsx",
);

const DISTRIBUTION_HEADERS = [
  "schoolId",
  "schoolName",
  "assignmentRole",
  "gradeId",
  "classId",
  "teacherEmail",
  "personId",
  "teacherDisplayName",
];

const ALLOWED_ROLES = new Set([
  "معلمة الصف - المستوى الأول",
  "معلمة الصف - المستوى الثاني",
  "معلمة الصف - المستوى الثالث",
  "معلمة القيم",
  "معلمة الأركان",
]);

const MODULE_OPERATION_MAP = new Map([
  ["ASSESSMENTS", "STUDENT_MEASUREMENT"],
  ["LEARNING_LOSS", "LEARNING_LOSS_FOLLOWUP"],
  ["HOMEWORK", "STUDENT_HOMEWORK"],
  ["LESSON_PREP", "LESSON_PREP"],
  ["GAMIFICATION", "STUDENT_GAMIFICATION"],
  ["VIRTUAL_CLASSES", "VIRTUAL_CLASS"],
  ["NOTES", "STUDENT_NOTES"],
]);

const ALLOWED_OPERATION_KINDS = new Set([
  "STUDENT_MEASUREMENT",
  "STUDENT_TRACKER",
  "LEARNING_LOSS_FOLLOWUP",
  "STUDENT_HOMEWORK",
  "LESSON_PREP",
  "STUDENT_NOTES",
  "STUDENT_GAMIFICATION",
  "STUDENT_CASE_REFERRAL",
  "VIRTUAL_CLASS",
]);

const OPERATION_TITLES = {
  STUDENT_MEASUREMENT: "قياسات الطلاب",
  STUDENT_TRACKER: "متابعة الطلاب",
  LEARNING_LOSS_FOLLOWUP: "متابعة الفاقد التعليمي",
  STUDENT_HOMEWORK: "واجبات الطلاب",
  LESSON_PREP: "تحضير الدروس",
  STUDENT_NOTES: "ملاحظات الطلاب",
  STUDENT_GAMIFICATION: "تحفيز الطلاب",
  VIRTUAL_CLASS: "الفصول الافتراضية",
};

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && typeof value.text === "string") {
    return value.text.trim();
  }
  return "";
}

function email(value) {
  return text(value).toLowerCase();
}

function active(data) {
  const status = text(data.status).toUpperCase();
  return data.isArchived !== true &&
    data.isActive !== false &&
    data.active !== false &&
    !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status);
}

function activeOffering(data) {
  return text(data.status).toUpperCase() === "ACTIVE" &&
    data.isArchived !== true &&
    data.active !== false;
}

function dataOf(snapshot) {
  return { id: snapshot.id, path: snapshot.ref.path, ...(snapshot.data() || {}) };
}

function stableId(parts) {
  return parts
    .map((part) => text(part).replaceAll("/", "-").replace(/\s+/g, "-"))
    .filter(Boolean)
    .join("__");
}

function isManaged(data) {
  return HISTORICAL_MANAGED_BY.has(text(data.managedBy)) ||
    HISTORICAL_SOURCES.has(text(data.provisioningSource));
}

function scopeMatches(data, schoolId, termId) {
  return text(data.orgId) === ORG_ID &&
    text(data.schoolId) === schoolId &&
    text(data.academicYearId) === ACADEMIC_YEAR_ID &&
    text(data.termId) === termId;
}

function isKgId(value) {
  return /^kg(?:1|2|3)(?:-|$)/i.test(text(value));
}

function operationKey(personId, classId, offeringId, operationKind) {
  return [personId, classId, offeringId, operationKind].join("|");
}

function assignmentKey(personId, classId, offeringId) {
  return [personId, classId, offeringId].join("|");
}

function classKey(schoolId, classId) {
  return [schoolId, classId].join("|");
}

function getInputPath() {
  const argument = process.argv.find((item) => item.startsWith("--input="));
  return argument ? path.resolve(process.cwd(), argument.slice("--input=".length)) : INPUT_PATH;
}

async function readDistribution(inputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`Input workbook not found: ${inputPath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const worksheet = workbook.getWorksheet("التوزيع");
  if (!worksheet) throw new Error('Worksheet "التوزيع" not found.');

  const headerMap = new Map();
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    const header = text(cell.value);
    if (header) headerMap.set(header, columnNumber);
  });
  const missingHeaders = DISTRIBUTION_HEADERS.filter((header) => !headerMap.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing distribution columns: ${missingHeaders.join(", ")}`);
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Object.fromEntries(
      DISTRIBUTION_HEADERS.map((header) => [header, text(row.getCell(headerMap.get(header)).value)]),
    );
    if (Object.values(values).every((value) => !value)) continue;

    const gradeIds = values.gradeId.split(",").map(text).filter(Boolean);
    const classIds = values.classId.split(",").map(text).filter(Boolean);
    rows.push({ rowNumber, ...values, gradeIds, classIds });
  }
  if (rows.length === 0) throw new Error("Worksheet التوزيع has no populated assignment rows.");
  return rows;
}

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "service-account.json"),
  );
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account not found: ${serviceAccountPath}`);
  }
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function collection(db, collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map(dataOf);
}

async function resolveTeacher({ db, row, people, memberships, nestedMembershipCache }) {
  const rowPersonId = text(row.personId);
  const rowEmail = email(row.teacherEmail);
  const idMatches = rowPersonId ? people.filter((person) => person.id === rowPersonId) : [];
  const emailMatches = rowEmail
    ? people.filter((person) => email(person.email) === rowEmail)
    : [];

  let matches;
  if (rowPersonId && rowEmail) {
    matches = idMatches.filter((person) => email(person.email) === rowEmail);
  } else if (rowPersonId) {
    matches = idMatches;
  } else {
    matches = emailMatches;
  }

  if (matches.length !== 1) {
    throw new Error(`teacher identity is ${matches.length === 0 ? "not found" : "ambiguous"}`);
  }

  const person = matches[0];
  const canonicalEmail = email(person.email);
  if (rowEmail && canonicalEmail !== rowEmail) throw new Error("teacherEmail does not match canonical Person email");
  if (text(row.teacherDisplayName) && text(row.teacherDisplayName) !== text(person.displayName)) {
    throw new Error("teacherDisplayName does not match canonical Person displayName");
  }

  const scopedMemberships = memberships.filter((membership) => {
    const roleKey = text(membership.roleKey || membership.role);
    const schools = Array.isArray(membership.scopes?.schoolIds) ? membership.scopes.schoolIds.map(text) : [];
    return active(membership) &&
      roleKey === "KG_TEACHER" &&
      (text(membership.personId) === person.id || text(membership.uid) === text(person.uid)) &&
      (schools.includes(row.schoolId) || text(membership.scopeId) === row.schoolId || text(membership.schoolId) === row.schoolId);
  });

  if (scopedMemberships.length > 1) throw new Error("multiple active KG_TEACHER memberships match this school");
  if (scopedMemberships.length === 1) {
    return {
      personId: person.id,
      email: canonicalEmail,
      displayName: text(person.displayName),
      uid: text(scopedMemberships[0].uid),
      membershipPath: scopedMemberships[0].path,
    };
  }

  let authUser = null;
  if (canonicalEmail) {
    try {
      authUser = await admin.auth().getUserByEmail(canonicalEmail);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }
  if (!authUser) throw new Error("no active KG_TEACHER membership validates this school");

  const uid = authUser.uid;
  let nested = nestedMembershipCache.get(uid);
  if (!nested) {
    const snapshot = await db.doc(`users/${uid}/orgMemberships/${ORG_ID}`).get();
    nested = snapshot.exists ? dataOf(snapshot) : null;
    nestedMembershipCache.set(uid, nested);
  }
  const nestedSchools = Array.isArray(nested?.scopes?.schoolIds) ? nested.scopes.schoolIds.map(text) : [];
  if (!nested || !active(nested) || text(nested.personId) !== person.id ||
      text(nested.roleKey || nested.role) !== "KG_TEACHER" ||
      (!nestedSchools.includes(row.schoolId) && text(nested.scopeId) !== row.schoolId)) {
    throw new Error("no active KG_TEACHER membership validates this school");
  }
  return {
    personId: person.id,
    email: canonicalEmail,
    displayName: text(person.displayName),
    uid,
    membershipPath: nested.path,
  };
}

function expectedOperationKinds(offering) {
  const candidates = new Set();
  for (const moduleKey of Array.isArray(offering.enabledModuleKeys) ? offering.enabledModuleKeys : []) {
    const operationKind = MODULE_OPERATION_MAP.get(text(moduleKey));
    if (operationKind) candidates.add(operationKind);
  }
  if (Array.isArray(offering.enabledModuleKeys) &&
      offering.enabledModuleKeys.includes("ASSESSMENTS") &&
      offering.assessmentPolicy?.trackerTemplateIds?.length > 0) {
    candidates.add("STUDENT_TRACKER");
  }
  if (offering.assessmentPolicy?.allowLearningLoss !== true) candidates.delete("LEARNING_LOSS_FOLLOWUP");
  if (offering.curriculumPolicy?.homeworkEnabled !== true) candidates.delete("STUDENT_HOMEWORK");
  return Array.from(candidates).filter((kind) => ALLOWED_OPERATION_KINDS.has(kind));
}

function assignmentPayload({ id, teacher, schoolId, termId, classTarget, offering, now, role }) {
  return {
    id,
    orgId: ORG_ID,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    teacherPersonId: teacher.personId,
    supervisorPersonId: "",
    assignmentKind: "SUBJECT_TEACHER",
    targetScopeType: "CLASS",
    targetScopeId: classTarget.classId,
    coverageMode: "EXPLICIT_CLASSES",
    subjectKey: text(offering.subjectKey),
    subjectId: text(offering.subjectId),
    classSubjectOfferingId: offering.id,
    gradeId: classTarget.gradeId,
    streamId: text(offering.streamId),
    isHomeroom: false,
    roleInAssignment: "MAIN",
    status: "ACTIVE",
    startAt: now,
    note: `KG bulk assignment role: ${role}`,
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: MANAGED_BY,
  };
}

function linkPayload({ id, assignmentId, schoolId, termId, classTarget, offering }) {
  return {
    id,
    assignmentId,
    orgId: ORG_ID,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    classId: classTarget.classId,
    gradeId: classTarget.gradeId,
    streamId: text(offering.streamId),
    classSubjectOfferingId: offering.id,
    order: 0,
    isPrimaryClass: true,
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: MANAGED_BY,
  };
}

function operationPayload({ id, teacher, schoolId, termId, classTarget, offering, assignmentId, operationKind, now }) {
  return {
    id,
    orgId: ORG_ID,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    gradeId: classTarget.gradeId,
    classId: classTarget.classId,
    subjectKey: text(offering.subjectKey),
    classSubjectOfferingId: offering.id,
    title: OPERATION_TITLES[operationKind] || operationKind,
    description: "KG bulk operational assignment linked to a class subject offering",
    status: "ACTIVE",
    isActive: true,
    startAt: now,
    actorPersonId: teacher.personId,
    actorMembershipId: "",
    actorRoleKey: "KG_TEACHER",
    operationKind,
    scopeType: "CLASS",
    scopeId: classTarget.classId,
    scopeLabel: offering.id,
    coverageMode: "SINGLE_SCOPE",
    targetKind: "CLASS",
    targetPersonIds: [],
    targetStudentIds: [],
    targetClassIds: [classTarget.classId],
    targetGradeIds: [classTarget.gradeId],
    targetRouteIds: [],
    targetRoleKeys: [],
    permissions: ["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"],
    sourceTeacherAssignmentId: assignmentId,
    sourceMembershipId: "",
    note: "Created by KG teacher assignment reconciler",
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: MANAGED_BY,
  };
}

function endedPayload(now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function pushAction(actions, collectionName, document, action, reason = "") {
  actions.push({
    collection: collectionName,
    id: document.id,
    path: document.path || `orgs/${ORG_ID}/${collectionName}/${document.id}`,
    action,
    ...(reason ? { reason } : {}),
    payload: document.payload,
  });
}

function addEndAction(actions, collectionName, item, now, reason) {
  pushAction(actions, collectionName, {
    id: item.id,
    path: item.path,
    payload: endedPayload(now),
  }, "END", reason);
}

function expectedAssignmentMatches(existing, expected) {
  return active(existing) &&
    text(existing.orgId) === ORG_ID &&
    text(existing.schoolId) === expected.schoolId &&
    text(existing.academicYearId) === ACADEMIC_YEAR_ID &&
    text(existing.termId) === expected.termId &&
    text(existing.teacherPersonId) === expected.teacherPersonId &&
    text(existing.assignmentKind) === "SUBJECT_TEACHER" &&
    text(existing.targetScopeType) === "CLASS" &&
    text(existing.targetScopeId) === expected.targetScopeId &&
    text(existing.subjectKey) === expected.subjectKey &&
    text(existing.classSubjectOfferingId) === expected.classSubjectOfferingId &&
    text(existing.gradeId) === expected.gradeId &&
    existing.isHomeroom !== true;
}

function expectedLinkMatches(existing, expected) {
  return active(existing) &&
    text(existing.assignmentId || existing.teacherAssignmentId) === expected.assignmentId &&
    text(existing.orgId) === ORG_ID &&
    text(existing.schoolId) === expected.schoolId &&
    text(existing.academicYearId) === ACADEMIC_YEAR_ID &&
    text(existing.termId) === expected.termId &&
    text(existing.classId) === expected.classId &&
    text(existing.gradeId) === expected.gradeId &&
    text(existing.classSubjectOfferingId) === expected.classSubjectOfferingId;
}

function expectedOperationMatches(existing, expected) {
  return active(existing) &&
    text(existing.orgId) === ORG_ID &&
    text(existing.schoolId) === expected.schoolId &&
    text(existing.academicYearId) === ACADEMIC_YEAR_ID &&
    text(existing.termId) === expected.termId &&
    text(existing.actorPersonId) === expected.actorPersonId &&
    text(existing.classId) === expected.classId &&
    text(existing.subjectKey) === expected.subjectKey &&
    text(existing.classSubjectOfferingId) === expected.classSubjectOfferingId &&
    text(existing.operationKind) === expected.operationKind &&
    text(existing.scopeType) === "CLASS" &&
    text(existing.scopeId || existing.classId) === expected.classId &&
    (!text(existing.sourceTeacherAssignmentId) || text(existing.sourceTeacherAssignmentId) === expected.sourceTeacherAssignmentId);
}

function findById(documents, id) {
  return documents.find((item) => item.id === id) || null;
}

async function loadState(db, rows) {
  const requestedClasses = new Map();
  for (const row of rows) {
    for (let index = 0; index < Math.max(row.gradeIds.length, row.classIds.length); index += 1) {
      const gradeId = row.gradeIds.length === 1 ? row.gradeIds[0] : row.gradeIds[index];
      const classId = row.classIds[index];
      if (gradeId && classId) requestedClasses.set(classKey(row.schoolId, classId), { schoolId: row.schoolId, classId, gradeId });
    }
  }

  const classRefs = Array.from(requestedClasses.values()).map((target) => db.doc(
    `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes/${target.classId}`,
  ));
  const [terms, people, memberships, offerings, assignments, links, operations, classSnapshots] = await Promise.all([
    collection(db, `orgs/${ORG_ID}/academicYears/${ACADEMIC_YEAR_ID}/terms`),
    collection(db, `orgs/${ORG_ID}/people`),
    collection(db, `orgs/${ORG_ID}/memberships`),
    collection(db, `orgs/${ORG_ID}/classSubjectOfferings`),
    collection(db, `orgs/${ORG_ID}/teacherAssignments`),
    collection(db, `orgs/${ORG_ID}/teacherAssignmentClassLinks`),
    collection(db, `orgs/${ORG_ID}/operationalAssignments`),
    classRefs.length > 0 ? db.getAll(...classRefs) : Promise.resolve([]),
  ]);

  return {
    terms,
    people,
    memberships,
    offerings,
    assignments,
    links,
    operations,
    classes: classSnapshots.map(dataOf),
    requestedClasses,
  };
}

function validateClass({ target, klass }) {
  if (!klass) throw new Error(`class not found: ${target.schoolId}/${target.classId}`);
  if (text(klass.orgId) !== ORG_ID || text(klass.schoolId) !== target.schoolId ||
      text(klass.academicYearId) !== ACADEMIC_YEAR_ID || text(klass.id) !== target.classId) {
    throw new Error("class relationship does not match the row scope");
  }
  if (text(klass.gradeId) !== target.gradeId || !isKgId(klass.gradeId) || klass.isArchived === true) {
    throw new Error("class grade/scope is not an active KG class");
  }
}

function buildPlanReport({ inputPath, termId, rows, actions, blockers, teachers, offeringsByClass }) {
  const cleanActions = actions.map(({ payload, ...action }) => action);
  const counts = cleanActions.reduce((result, action) => {
    result[action.action] = (result[action.action] || 0) + 1;
    return result;
  }, {});
  return {
    metadata: {
      mode: "DRY_RUN",
      orgId: ORG_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId,
      inputPath,
      source: SOURCE,
      version: VERSION,
      offeringsModified: false,
      offeringModulesModified: false,
    },
    excelColumnsConsumed: [
      "schoolId",
      "assignmentRole",
      "gradeId",
      "classId",
      "teacherEmail",
      "personId",
      "teacherDisplayName",
    ],
    inputRows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      schoolId: row.schoolId,
      assignmentRole: row.assignmentRole,
      gradeId: row.gradeId,
      classId: row.classId,
      teacherEmail: row.teacherEmail,
      personId: row.personId,
      teacherDisplayName: row.teacherDisplayName,
    })),
    resolvedTeachers: teachers,
    offeringsByClass,
    actions: cleanActions,
    summary: {
      create: counts.CREATE || 0,
      keep: counts.KEEP || 0,
      end: counts.END || 0,
      blocked: blockers.length,
    },
    blockers: Array.from(new Set(blockers)),
    _writes: actions.filter((action) => action.action === "CREATE" || action.action === "END"),
  };
}

async function buildPlan({ inputPath = getInputPath(), now = Date.now() } = {}) {
  const rows = await readDistribution(inputPath);
  const db = admin.firestore();
  const state = await loadState(db, rows);
  const blockers = [];
  const actions = [];
  const teachers = [];
  const offeringsByClass = [];
  const nestedMembershipCache = new Map();
  const termCandidates = state.terms.filter((term) => text(term.status).toUpperCase() === "ACTIVE" || term.isCurrent === true);
  const termId = termCandidates.length === 1 ? text(termCandidates[0].id) : "";
  if (termCandidates.length !== 1) {
    blockers.push(`expected exactly one active/current term; found ${termCandidates.length}`);
  }

  const classTargets = new Map();
  for (const row of rows) {
    if (!row.schoolId || !/^kg-/i.test(row.schoolId)) blockers.push(`row ${row.rowNumber}: schoolId is not a KG school`);
    if (!ALLOWED_ROLES.has(row.assignmentRole)) blockers.push(`row ${row.rowNumber}: unknown assignmentRole`);
    if (row.gradeIds.length === 0 || row.classIds.length === 0 || row.gradeIds.length !== row.classIds.length && row.gradeIds.length !== 1) {
      blockers.push(`row ${row.rowNumber}: gradeId/classId lists do not resolve one-to-one`);
      continue;
    }
    for (let index = 0; index < row.classIds.length; index += 1) {
      const target = {
        schoolId: row.schoolId,
        gradeId: row.gradeIds.length === 1 ? row.gradeIds[0] : row.gradeIds[index],
        classId: row.classIds[index],
      };
      classTargets.set(classKey(target.schoolId, target.classId), target);
    }
  }

  for (const target of classTargets.values()) {
    const klass = state.classes.find((item) => item.id === target.classId && item.schoolId === target.schoolId);
    try {
      validateClass({ target, klass });
    } catch (error) {
      blockers.push(`${target.schoolId}/${target.classId}: ${error.message}`);
    }
  }

  const resolvedRows = [];
  const teacherClassRoles = new Map();
  for (const row of rows) {
    if (!row.schoolId || !row.assignmentRole || row.classIds.length === 0 || row.gradeIds.length === 0) continue;
    let teacher;
    try {
      teacher = await resolveTeacher({ db, row, people: state.people, memberships: state.memberships, nestedMembershipCache });
    } catch (error) {
      blockers.push(`row ${row.rowNumber}: ${error.message}`);
      continue;
    }
    teachers.push({ rowNumber: row.rowNumber, schoolId: row.schoolId, personId: teacher.personId, email: teacher.email, displayName: teacher.displayName, membershipPath: teacher.membershipPath });
    for (let index = 0; index < row.classIds.length; index += 1) {
      const target = {
        schoolId: row.schoolId,
        gradeId: row.gradeIds.length === 1 ? row.gradeIds[0] : row.gradeIds[index],
        classId: row.classIds[index],
      };
      const roleKey = `${teacher.personId}|${target.schoolId}|${target.classId}`;
      const priorRole = teacherClassRoles.get(roleKey);
      if (priorRole && priorRole !== row.assignmentRole) {
        blockers.push(`row ${row.rowNumber}: teacher has multiple assignment roles for ${target.schoolId}/${target.classId}`);
      } else if (priorRole) {
        blockers.push(`row ${row.rowNumber}: duplicate teacher/class assignment`);
      } else {
        teacherClassRoles.set(roleKey, row.assignmentRole);
      }
      if (!state.requestedClasses.has(classKey(target.schoolId, target.classId))) continue;
      resolvedRows.push({ row, teacher, target });
    }
  }

  const desiredAssignmentKeys = new Set();
  const desiredOperationKeys = new Set();
  const targetTeacherSchools = new Set();

  // Never create or end anything when the term is not uniquely resolved.
  if (!termId) {
    return buildPlanReport({ inputPath, termId, rows, actions, blockers, teachers, offeringsByClass });
  }

  for (const resolved of resolvedRows) {
    const { row, teacher, target } = resolved;
    const klass = state.classes.find((item) => item.id === target.classId && item.schoolId === target.schoolId);
    if (!klass || text(klass.gradeId) !== target.gradeId) continue;
    targetTeacherSchools.add(`${teacher.personId}|${target.schoolId}`);
    const matches = state.offerings.filter((offering) =>
      activeOffering(offering) &&
      text(offering.orgId) === ORG_ID &&
      text(offering.schoolId) === target.schoolId &&
      text(offering.academicYearId) === ACADEMIC_YEAR_ID &&
      text(offering.classId) === target.classId &&
      text(offering.gradeId) === target.gradeId &&
      Boolean(text(offering.subjectKey)),
    );
    const bySubject = new Map();
    for (const offering of matches) {
      const subjectKey = text(offering.subjectKey);
      if (bySubject.has(subjectKey)) blockers.push(`row ${row.rowNumber}: multiple active offerings for ${target.schoolId}/${target.classId}/${subjectKey}`);
      bySubject.set(subjectKey, offering);
    }
    if (matches.length === 0) {
      blockers.push(`row ${row.rowNumber}: no active offerings for ${target.schoolId}/${target.classId}`);
      continue;
    }
    const offerings = Array.from(bySubject.values());
    offeringsByClass.push({ rowNumber: row.rowNumber, schoolId: target.schoolId, gradeId: target.gradeId, classId: target.classId, offeringIds: offerings.map((offering) => offering.id) });
    for (const offering of offerings) {
      const aKey = assignmentKey(teacher.personId, target.classId, offering.id);
      if (desiredAssignmentKeys.has(aKey)) {
        blockers.push(`row ${row.rowNumber}: duplicate teacher/class/offering assignment`);
        continue;
      }
      desiredAssignmentKeys.add(aKey);
      const deterministicAssignmentId = stableId(["teacher-provisioning", teacher.personId, target.schoolId, ACADEMIC_YEAR_ID, termId, offering.id]);
      const existingOfferingAssignments = state.assignments.filter((assignment) =>
        active(assignment) && scopeMatches(assignment, target.schoolId, termId) &&
        text(assignment.teacherPersonId) === teacher.personId && text(assignment.classSubjectOfferingId) === offering.id,
      );
      if (existingOfferingAssignments.length > 1) {
        blockers.push(`row ${row.rowNumber}: multiple active teacher assignments for offering ${offering.id}`);
        continue;
      }
      const existingAssignment = existingOfferingAssignments[0] || null;
      const assignmentId = existingAssignment?.id || deterministicAssignmentId;
      const expectedAssignment = assignmentPayload({
        id: assignmentId,
        teacher,
        schoolId: target.schoolId,
        termId,
        classTarget: target,
        offering,
        now,
        role: row.assignmentRole,
      });
      if (existingAssignment) {
        if (!expectedAssignmentMatches(existingAssignment, expectedAssignment)) {
          blockers.push(`row ${row.rowNumber}: active assignment does not exactly match ${offering.id}`);
          continue;
        }
        pushAction(actions, "teacherAssignments", { id: existingAssignment.id, path: existingAssignment.path }, "KEEP");
      } else {
        const occupied = findById(state.assignments, deterministicAssignmentId);
        if (occupied) {
          blockers.push(`row ${row.rowNumber}: deterministic assignment ID is already occupied: ${deterministicAssignmentId}`);
          continue;
        }
        pushAction(actions, "teacherAssignments", { id: deterministicAssignmentId, payload: expectedAssignment }, "CREATE");
      }
      const deterministicLinkId = stableId([assignmentId, "class-link", target.classId]);
      const matchingLinks = state.links.filter((link) => active(link) && text(link.assignmentId || link.teacherAssignmentId) === assignmentId);
      if (matchingLinks.length > 1) {
        blockers.push(`row ${row.rowNumber}: multiple active class links for ${assignmentId}`);
      } else if (matchingLinks.length === 1) {
        const expectedLink = linkPayload({ id: matchingLinks[0].id, assignmentId, schoolId: target.schoolId, termId, classTarget: target, offering });
        if (!expectedLinkMatches(matchingLinks[0], expectedLink)) blockers.push(`row ${row.rowNumber}: active class link does not exactly match ${assignmentId}`);
        else pushAction(actions, "teacherAssignmentClassLinks", { id: matchingLinks[0].id, path: matchingLinks[0].path }, "KEEP");
      } else {
        const occupied = findById(state.links, deterministicLinkId);
        if (occupied) blockers.push(`row ${row.rowNumber}: deterministic class-link ID is already occupied: ${deterministicLinkId}`);
        else pushAction(actions, "teacherAssignmentClassLinks", { id: deterministicLinkId, payload: linkPayload({ id: deterministicLinkId, assignmentId, schoolId: target.schoolId, termId, classTarget: target, offering }) }, "CREATE");
      }

      for (const operationKind of expectedOperationKinds(offering)) {
        const oKey = operationKey(teacher.personId, target.classId, offering.id, operationKind);
        desiredOperationKeys.add(oKey);
        const deterministicOperationId = stableId(["teacher-provisioning", teacher.personId, target.schoolId, ACADEMIC_YEAR_ID, termId, offering.id, operationKind]);
        const existingOperations = state.operations.filter((operation) =>
          active(operation) && scopeMatches(operation, target.schoolId, termId) &&
          text(operation.actorPersonId) === teacher.personId && text(operation.classSubjectOfferingId) === offering.id &&
          text(operation.classId) === target.classId && text(operation.operationKind) === operationKind,
        );
        if (existingOperations.length > 1) {
          blockers.push(`row ${row.rowNumber}: multiple active operational assignments for ${offering.id}/${operationKind}`);
          continue;
        }
        const existingOperation = existingOperations[0] || null;
        const operationId = existingOperation?.id || deterministicOperationId;
        const expectedOperation = operationPayload({ id: operationId, teacher, schoolId: target.schoolId, termId, classTarget: target, offering, assignmentId, operationKind, now });
        if (existingOperation) {
          if (!expectedOperationMatches(existingOperation, expectedOperation)) blockers.push(`row ${row.rowNumber}: operational assignment does not exactly match ${offering.id}/${operationKind}`);
          else pushAction(actions, "operationalAssignments", { id: existingOperation.id, path: existingOperation.path }, "KEEP");
        } else {
          const occupied = findById(state.operations, deterministicOperationId);
          if (occupied) blockers.push(`row ${row.rowNumber}: deterministic operational ID is already occupied: ${deterministicOperationId}`);
          else pushAction(actions, "operationalAssignments", { id: deterministicOperationId, payload: expectedOperation }, "CREATE");
        }
      }
    }
  }

  const kgOfferingById = new Map(state.offerings.filter((offering) => isKgId(offering.gradeId)).map((offering) => [offering.id, offering]));
  const endedAssignmentIds = new Set();
  for (const assignment of state.assignments) {
    const personId = text(assignment.teacherPersonId);
    const schoolId = text(assignment.schoolId);
    if (!active(assignment) || !isManaged(assignment) || !scopeMatches(assignment, schoolId, termId) ||
        !targetTeacherSchools.has(`${personId}|${schoolId}`) || text(assignment.targetScopeType) !== "CLASS" ||
        !text(assignment.classSubjectOfferingId) || (!isKgId(assignment.gradeId) && !kgOfferingById.has(text(assignment.classSubjectOfferingId)))) continue;
    const key = assignmentKey(personId, text(assignment.targetScopeId), text(assignment.classSubjectOfferingId));
    if (!desiredAssignmentKeys.has(key)) {
      endedAssignmentIds.add(assignment.id);
      addEndAction(actions, "teacherAssignments", assignment, now, "managed assignment is absent from the Excel map");
    }
  }

  for (const link of state.links) {
    if (!active(link) || !scopeMatches(link, text(link.schoolId), termId)) continue;
    const parent = state.assignments.find((assignment) => assignment.id === text(link.assignmentId || link.teacherAssignmentId));
    if (!parent || !scopeMatches(parent, text(link.schoolId), termId) || !isManaged(parent) ||
        !targetTeacherSchools.has(`${text(parent.teacherPersonId)}|${text(link.schoolId)}`)) continue;
    if (!text(link.classId) || (!isKgId(link.gradeId) && !kgOfferingById.has(text(link.classSubjectOfferingId)))) continue;
    const key = assignmentKey(text(parent.teacherPersonId), text(link.classId), text(link.classSubjectOfferingId));
    if (endedAssignmentIds.has(parent.id) || !desiredAssignmentKeys.has(key)) {
      addEndAction(actions, "teacherAssignmentClassLinks", link, now, "managed class link is absent from the Excel map");
    }
  }

  for (const operation of state.operations) {
    const personId = text(operation.actorPersonId);
    const schoolId = text(operation.schoolId);
    if (!active(operation) || !isManaged(operation) || !scopeMatches(operation, schoolId, termId) ||
        !targetTeacherSchools.has(`${personId}|${schoolId}`) || text(operation.scopeType) !== "CLASS" ||
        (!isKgId(operation.gradeId) && !kgOfferingById.has(text(operation.classSubjectOfferingId)))) continue;
    const key = operationKey(personId, text(operation.classId), text(operation.classSubjectOfferingId), text(operation.operationKind));
    if (endedAssignmentIds.has(text(operation.sourceTeacherAssignmentId)) || !desiredOperationKeys.has(key)) {
      addEndAction(actions, "operationalAssignments", operation, now, "managed operational assignment is absent from the Excel map or source assignment ended");
    }
  }

  const report = buildPlanReport({ inputPath, termId, rows, actions, blockers, teachers, offeringsByClass });
  return report;
}

async function applyPlan(report) {
  if (report.blockers.length > 0) throw new Error(`Apply blocked: ${report.blockers.join(" | ")}`);
  const db = admin.firestore();
  const writes = report._writes || [];
  const uniqueWrites = new Map();
  for (const write of writes) uniqueWrites.set(`${write.collection}/${write.id}`, write);
  const entries = Array.from(uniqueWrites.values());
  for (let offset = 0; offset < entries.length; offset += 450) {
    const batch = db.batch();
    for (const write of entries.slice(offset, offset + 450)) {
      batch.set(db.doc(write.path || `orgs/${ORG_ID}/${write.collection}/${write.id}`), write.payload, { merge: true });
    }
    await batch.commit();
  }
  return entries.length;
}

function publicReport(report) {
  const { _writes, ...visible } = report;
  return visible;
}

module.exports = {
  ACADEMIC_YEAR_ID,
  INPUT_PATH,
  SOURCE,
  applyPlan,
  buildPlan,
  initAdmin,
  publicReport,
};
