/*
 * Single-teacher KG pilot reconciliation.
 *
 * Default: read-only DRY_RUN.
 * Apply:  node scripts/kindergarten/seed-kg-single-teacher-pilot.cjs --apply --confirm=KG_SINGLE_TEACHER_PILOT
 *
 * This follows the existing Teacher Provisioning Engine conventions. It only
 * targets one teacher, one class, and the four canonical KG3 offerings.
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const SCHOOL_ID = "kg-01";
const ACADEMIC_YEAR_ID = "ay-1448";
const GRADE_ID = "kg3";
const CLASS_ID = "kg3-a";
const CLASS_NAME = "فصل الكادي";
const LEVEL_NAME = "المستوى الثالث";
const UID = "4BWT8kWKCCe0ipQBNOxTPnMbn902";
const PERSON_ID = "p-s-s-alaues";
const TEACHER_EMAIL = "s.s.alaues@qz.org.sa";
const DISPLAY_NAME = "سمية سعود حمد العويس";
const ROLE_KEY = "KG_TEACHER";
const CONFIRMATION = "KG_SINGLE_TEACHER_PILOT";
const SOURCE = "TEACHER_PROVISIONING_ENGINE";
const VERSION = 1;
const INCORRECT_CLASS_ASSIGNMENT_ID = "ta-kg1-class";
const INCORRECT_CLASS_LINK_ID = "tal-kg1-class";

const TARGET_MODULE_KEYS = [
  "ASSESSMENTS",
  "LEARNING_LOSS",
  "HOMEWORK",
  "LESSON_PREP",
  "QUESTION_BANK",
  "CURRICULUM_PLAN",
  "RESOURCES",
  "GAMIFICATION",
  "NOTES",
];

const ALLOWED_TEACHER_OPERATION_KINDS = new Set([
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

const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(`--confirm=${CONFIRMATION}`);
const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;

const SOURCE_REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "inspections",
  "inspect-kindergarten-setup-report.json",
);
const OUTPUT_REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "kindergarten",
  "seed-kg-single-teacher-pilot-report.json",
);

const SUBJECTS = [
  { key: "QURAN", suffix: "quran", title: "القرآن الكريم" },
  {
    key: "ADHKAR_IDENTITY_ANTHEMS",
    suffix: "adhkar-identity-anthems",
    title: "الأذكار والهوية الوطنية والأناشيد",
  },
  { key: "LEARNING_GARDENS", suffix: "learning-gardens", title: "بساتين المعرفة" },
  { key: "COUNT_AND_CALCULATE", suffix: "count-and-calculate", title: "نعد ونحسب" },
];

const MODULE_OPERATION_MAP = new Map([
  ["ASSESSMENTS", "STUDENT_MEASUREMENT"],
  ["LEARNING_LOSS", "LEARNING_LOSS_FOLLOWUP"],
  ["HOMEWORK", "STUDENT_HOMEWORK"],
  ["LESSON_PREP", "LESSON_PREP"],
  ["GAMIFICATION", "STUDENT_GAMIFICATION"],
  ["VIRTUAL_CLASSES", "VIRTUAL_CLASS"],
  ["NOTES", "STUDENT_NOTES"],
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

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "service-account.json"),
  );
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function active(data) {
  const status = text(data.status).toUpperCase();
  return data.isArchived !== true &&
    data.isActive !== false &&
    data.active !== false &&
    !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status);
}

function dataOf(snapshot) {
  return { id: snapshot.id, path: snapshot.ref.path, ...(snapshot.data() || {}) };
}

function subjectKeyOf(data) {
  return text(data.subjectKey || data.key || data.code).toUpperCase();
}

function stableId(parts) {
  return parts
    .map((part) => text(part).replaceAll("/", "-").replace(/\s+/g, "-"))
    .filter(Boolean)
    .join("__");
}

function arraysEqual(left, right) {
  return Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function loadSourceReport() {
  if (!fs.existsSync(SOURCE_REPORT_PATH)) {
    return { exists: false, warnings: ["Inspection report not found."] };
  }
  const report = JSON.parse(fs.readFileSync(SOURCE_REPORT_PATH, "utf8"));
  const target = (report.kgTeacherMemberships || []).find((item) => item.uid === UID);
  const warnings = [];
  if (report.metadata?.orgId !== ORG_ID) warnings.push("Inspection report org does not match target org.");
  if (!target) warnings.push("Target teacher is missing from the inspection report.");
  return {
    exists: true,
    generatedAt: report.metadata?.generatedAt || "",
    targetTeacherListed: Boolean(target),
    warnings,
  };
}

async function collection(db, collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map(dataOf);
}

function directOfferingReference(doc, offeringId) {
  const scalarFields = ["classSubjectOfferingId", "offeringId", "subjectOfferingId"];
  const arrayFields = ["classSubjectOfferingIds", "offeringIds", "subjectOfferingIds"];
  return scalarFields.some((field) => text(doc[field]) === offeringId) ||
    arrayFields.some((field) => Array.isArray(doc[field]) && doc[field].map(text).includes(offeringId));
}

function referenceSummary(documents, offeringId) {
  return documents.filter((doc) => directOfferingReference(doc, offeringId)).map((doc) => ({
    id: doc.id,
    path: doc.path,
  }));
}

function expectedOperationKinds(offering) {
  const candidates = new Set();
  for (const moduleKey of Array.isArray(offering.enabledModuleKeys) ? offering.enabledModuleKeys : []) {
    const operationKind = MODULE_OPERATION_MAP.get(moduleKey);
    if (operationKind) candidates.add(operationKind);
  }
  if (
    Array.isArray(offering.enabledModuleKeys) &&
    offering.enabledModuleKeys.includes("ASSESSMENTS") &&
    offering.assessmentPolicy?.trackerTemplateIds?.length > 0
  ) candidates.add("STUDENT_TRACKER");
  if (offering.assessmentPolicy?.allowLearningLoss !== true) candidates.delete("LEARNING_LOSS_FOLLOWUP");
  if (offering.curriculumPolicy?.homeworkEnabled !== true) candidates.delete("STUDENT_HOMEWORK");
  return Array.from(candidates).filter((kind) =>
    kind !== "STUDENT_ATTENDANCE" &&
    kind !== "TRANSPORT_ATTENDANCE" &&
    ALLOWED_TEACHER_OPERATION_KINDS.has(kind),
  );
}

function assignmentPayload({ offering, termId, id, now }) {
  return {
    id,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    teacherPersonId: PERSON_ID,
    supervisorPersonId: "",
    assignmentKind: "SUBJECT_TEACHER",
    targetScopeType: "CLASS",
    targetScopeId: CLASS_ID,
    coverageMode: "EXPLICIT_CLASSES",
    subjectKey: offering.subjectKey,
    subjectId: "",
    classSubjectOfferingId: offering.id,
    gradeId: GRADE_ID,
    streamId: text(offering.streamId),
    isHomeroom: false,
    roleInAssignment: "MAIN",
    status: "ACTIVE",
    startAt: now,
    note: "تم إنشاؤه بواسطة Teacher Provisioning Engine",
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: "TEACHER_PROVISIONING",
  };
}

function classLinkPayload({ offering, termId, assignmentId }) {
  return {
    id: `${assignmentId}__class-link__${CLASS_ID}`,
    assignmentId,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    classId: CLASS_ID,
    gradeId: GRADE_ID,
    streamId: text(offering.streamId),
    classSubjectOfferingId: offering.id,
    order: 0,
    isPrimaryClass: true,
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: "TEACHER_PROVISIONING",
  };
}

function operationalPayload({ offering, termId, assignmentId, operationKind, id }) {
  return {
    id,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId,
    gradeId: GRADE_ID,
    classId: CLASS_ID,
    subjectKey: offering.subjectKey,
    classSubjectOfferingId: offering.id,
    title: OPERATION_TITLES[operationKind] || operationKind,
    description: "إسناد تشغيلي مرتبط بفصل ومادة محددين",
    status: "ACTIVE",
    isActive: true,
    startAt: Date.now(),
    actorPersonId: PERSON_ID,
    actorMembershipId: "",
    actorRoleKey: ROLE_KEY,
    operationKind,
    scopeType: "CLASS",
    scopeId: CLASS_ID,
    scopeLabel: offering.id,
    coverageMode: "SINGLE_SCOPE",
    targetKind: "CLASS",
    targetPersonIds: [],
    targetStudentIds: [],
    targetClassIds: [CLASS_ID],
    targetGradeIds: [GRADE_ID],
    targetRouteIds: [],
    targetRoleKeys: [],
    permissions: ["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"],
    sourceTeacherAssignmentId: assignmentId,
    sourceMembershipId: "",
    note: "تم إنشاؤه بواسطة Teacher Provisioning Engine",
    provisioningSource: SOURCE,
    provisioningVersion: VERSION,
    managedBy: "TEACHER_PROVISIONING",
  };
}

function compatibleAssignment(existing, expected) {
  return existing && active(existing) &&
    existing.teacherPersonId === expected.teacherPersonId &&
    existing.schoolId === expected.schoolId &&
    existing.academicYearId === expected.academicYearId &&
    existing.termId === expected.termId &&
    existing.assignmentKind === "SUBJECT_TEACHER" &&
    existing.targetScopeType === "CLASS" &&
    existing.targetScopeId === CLASS_ID &&
    existing.classSubjectOfferingId === expected.classSubjectOfferingId &&
    existing.subjectKey === expected.subjectKey &&
    existing.gradeId === GRADE_ID &&
    existing.isHomeroom !== true;
}

function compatibleLink(existing, expected) {
  return existing && active(existing) &&
    existing.assignmentId === expected.assignmentId &&
    existing.schoolId === SCHOOL_ID &&
    existing.academicYearId === ACADEMIC_YEAR_ID &&
    existing.termId === expected.termId &&
    existing.classId === CLASS_ID &&
    existing.gradeId === GRADE_ID &&
    existing.classSubjectOfferingId === expected.classSubjectOfferingId;
}

function compatibleOperational(existing, expected) {
  return existing && active(existing) &&
    existing.actorPersonId === PERSON_ID &&
    existing.actorRoleKey === ROLE_KEY &&
    existing.schoolId === SCHOOL_ID &&
    existing.academicYearId === ACADEMIC_YEAR_ID &&
    existing.termId === expected.termId &&
    existing.classId === CLASS_ID &&
    existing.subjectKey === expected.subjectKey &&
    existing.classSubjectOfferingId === expected.classSubjectOfferingId &&
    existing.operationKind === expected.operationKind &&
    existing.sourceTeacherAssignmentId === expected.sourceTeacherAssignmentId;
}

function pushPlan(plans, collectionName, document, exists, compatible, actionOverride = "") {
  plans.push({
    collection: collectionName,
    id: document.id,
    path: `orgs/${ORG_ID}/${collectionName}/${document.id}`,
    action: actionOverride || (compatible ? "REUSE" : exists ? "UPDATE_ACTIVE_IDEMPOTENT" : "CREATE"),
    payload: document,
  });
}

function endedAssignmentPayload(existing, now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function endedVisibilityAssignmentPayload(now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function endedVisibilityLinkPayload(now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    endedAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function endedLinkPayload(now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    endedAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function endedOperationalPayload(now) {
  return {
    status: "ENDED",
    isActive: false,
    endAt: now,
    endedAt: now,
    updatedAt: now,
    endedByProvisioningSource: SOURCE,
  };
}

function reportConflict(item) {
  return {
    id: item.id,
    path: item.path,
    teacherPersonId: text(item.teacherPersonId || item.personId),
    schoolId: text(item.schoolId),
    academicYearId: text(item.academicYearId),
    termId: text(item.termId),
    gradeId: text(item.gradeId),
    classId: text(item.classId || item.targetScopeId),
    subjectKey: subjectKeyOf(item),
    classSubjectOfferingId: text(item.classSubjectOfferingId),
    status: text(item.status),
  };
}

async function main() {
  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}; no writes were performed.`);
  }

  initAdmin();
  const db = admin.firestore();
  const now = Date.now();
  const sourceReport = loadSourceReport();
  const blockers = [...sourceReport.warnings];

  const schoolRef = db.doc(`orgs/${ORG_ID}/schools/${SCHOOL_ID}`);
  const yearRef = db.doc(`orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}`);
  const gradeRef = db.doc(`${yearRef.path}/grades/${GRADE_ID}`);
  const classRef = db.doc(`${yearRef.path}/classes/${CLASS_ID}`);
  const termsCollectionPath = `orgs/${ORG_ID}/academicYears/${ACADEMIC_YEAR_ID}/terms`;
  const nestedMembershipRef = db.doc(`users/${UID}/orgMemberships/${ORG_ID}`);
  const rootMembershipRef = db.doc(`orgs/${ORG_ID}/memberships/${UID}`);

  const [schoolSnapshot, yearSnapshot, gradeSnapshot, classSnapshot, nestedMembershipSnapshot, rootMembershipSnapshot, authSnapshot] = await Promise.all([
    schoolRef.get(),
    yearRef.get(),
    gradeRef.get(),
    classRef.get(),
    nestedMembershipRef.get(),
    rootMembershipRef.get(),
    admin.auth().getUser(UID).catch(() => null),
  ]);

  const school = schoolSnapshot.exists ? dataOf(schoolSnapshot) : null;
  const year = yearSnapshot.exists ? dataOf(yearSnapshot) : null;
  const grade = gradeSnapshot.exists ? dataOf(gradeSnapshot) : null;
  const klass = classSnapshot.exists ? dataOf(classSnapshot) : null;
  const memberships = [
    nestedMembershipSnapshot.exists ? dataOf(nestedMembershipSnapshot) : null,
    rootMembershipSnapshot.exists ? dataOf(rootMembershipSnapshot) : null,
  ].filter(Boolean);
  const matchingMemberships = memberships.filter((item) =>
    active(item) &&
    text(item.uid || item.id) === UID &&
    text(item.personId) === PERSON_ID &&
    text(item.roleKey) === ROLE_KEY &&
    (Array.isArray(item.scopes?.schoolIds) ? item.scopes.schoolIds : []).includes(SCHOOL_ID),
  );
  const nestedMembership = nestedMembershipSnapshot.exists ? dataOf(nestedMembershipSnapshot) : null;
  const nestedMembershipMatches = nestedMembership && active(nestedMembership) &&
    text(nestedMembership.uid || nestedMembership.id) === UID &&
    text(nestedMembership.personId) === PERSON_ID &&
    text(nestedMembership.roleKey) === ROLE_KEY &&
    (Array.isArray(nestedMembership.scopes?.schoolIds) ? nestedMembership.scopes.schoolIds : []).includes(SCHOOL_ID);

  if (!schoolSnapshot.exists) blockers.push(`Missing school: ${schoolRef.path}`);
  if (!yearSnapshot.exists) blockers.push(`Missing academic year: ${yearRef.path}`);
  if (!gradeSnapshot.exists) blockers.push(`Missing grade: ${gradeRef.path}`);
  if (!classSnapshot.exists) blockers.push(`Missing class: ${classRef.path}`);
  if (school && text(school.id) !== SCHOOL_ID) blockers.push("School document ID mismatch.");
  if (year && (text(year.id) !== ACADEMIC_YEAR_ID || text(year.schoolId) !== SCHOOL_ID)) blockers.push("Academic year relationship mismatch.");
  if (grade && (text(grade.id) !== GRADE_ID || text(grade.schoolId) !== SCHOOL_ID || text(grade.academicYearId) !== ACADEMIC_YEAR_ID)) blockers.push("Grade relationship mismatch.");
  const actualClassName = text(klass?.name || klass?.title || klass?.displayName);
  if (klass && (text(klass.id) !== CLASS_ID || text(klass.schoolId) !== SCHOOL_ID || text(klass.academicYearId) !== ACADEMIC_YEAR_ID || text(klass.gradeId) !== GRADE_ID || actualClassName !== CLASS_NAME)) blockers.push("Class relationship/name mismatch.");
  if (klass && !active(klass)) blockers.push("Target class is not active.");
  if (!nestedMembershipMatches) blockers.push("No active matching nested KG_TEACHER membership with kg-01 scope.");
  if (authSnapshot && authSnapshot.disabled) blockers.push("Teacher Firebase Auth user is disabled.");

  const classesCollectionPath = `${yearRef.path}/classes`;
  const [allOfferings, allAssignments, allLinks, allOperationalAssignments, terms, allClasses] = await Promise.all([
    collection(db, `orgs/${ORG_ID}/classSubjectOfferings`),
    collection(db, `orgs/${ORG_ID}/teacherAssignments`),
    collection(db, `orgs/${ORG_ID}/teacherAssignmentClassLinks`),
    collection(db, `orgs/${ORG_ID}/operationalAssignments`),
    collection(db, termsCollectionPath),
    collection(db, classesCollectionPath),
  ]);

  const activeTerms = terms.filter((item) => text(item.status).toUpperCase() === "ACTIVE" || item.isCurrent === true);
  const targetTerms = new Set(allAssignments
    .filter((item) => active(item) && text(item.schoolId) === SCHOOL_ID && text(item.academicYearId) === ACADEMIC_YEAR_ID && (text(item.classId) === CLASS_ID || text(item.targetScopeId) === CLASS_ID))
    .map((item) => text(item.termId)).filter(Boolean));
  let termId = activeTerms.length === 1 ? text(activeTerms[0].id) : "";
  if (!termId && targetTerms.size === 1) termId = Array.from(targetTerms)[0];
  if (!termId) blockers.push(`Could not resolve exactly one active term for ${termsCollectionPath}.`);
  if (activeTerms.length > 1 && targetTerms.size !== 1) blockers.push(`Multiple active terms found: ${activeTerms.map((item) => item.id).join(", ")}.`);

  const canonicalOfferings = [];
  const legacyOfferings = allOfferings
    .filter((item) =>
      text(item.schoolId) === SCHOOL_ID &&
      text(item.academicYearId) === ACADEMIC_YEAR_ID &&
      (text(item.classId) === CLASS_ID || text(item.id).startsWith(`${CLASS_ID}-`)) &&
      ["CLASS", "NUMBERS"].includes(subjectKeyOf(item)),
    )
    .map((item) => ({
      id: item.id,
      path: item.path,
      subjectKey: subjectKeyOf(item),
      status: text(item.status),
      active: active(item),
      references: {
        teacherAssignments: referenceSummary(allAssignments, item.id),
        teacherAssignmentClassLinks: referenceSummary(allLinks, item.id),
        operationalAssignments: referenceSummary(allOperationalAssignments, item.id),
      },
    }));

  for (const subject of SUBJECTS) {
    const matches = allOfferings.filter((item) =>
      text(item.orgId) === ORG_ID &&
      text(item.schoolId) === SCHOOL_ID &&
      text(item.academicYearId) === ACADEMIC_YEAR_ID &&
      text(item.gradeId) === GRADE_ID &&
      text(item.classId) === CLASS_ID &&
      subjectKeyOf(item) === subject.key &&
      active(item),
    );
    if (matches.length === 0) {
      blockers.push(`No active classSubjectOffering matches ${subject.key} for ${SCHOOL_ID}/${ACADEMIC_YEAR_ID}/${GRADE_ID}/${CLASS_ID}.`);
      canonicalOfferings.push({ subjectKey: subject.key, subjectTitle: subject.title, found: false, active: false, matchingOfferingIds: [] });
      continue;
    }
    if (matches.length > 1) {
      blockers.push(`Multiple active classSubjectOfferings match ${subject.key}: ${matches.map((item) => item.id).join(", ")}.`);
      canonicalOfferings.push({
        subjectKey: subject.key,
        subjectTitle: subject.title,
        found: false,
        active: false,
        matchingOfferingIds: matches.map((item) => item.id),
      });
      continue;
    }
    const offering = matches[0];
    canonicalOfferings.push({
      subjectKey: subject.key,
      subjectTitle: subject.title,
      id: offering.id,
      path: offering.path,
      found: true,
      active: true,
      matchingOfferingIds: [offering.id],
      offering,
    });
  }

  const offeringModulePlans = [];
  const effectiveOfferingById = new Map();
  for (const entry of canonicalOfferings.filter((item) => item.found && item.active)) {
    const offering = entry.offering;
    const effectiveOffering = {
      ...offering,
      enabledModuleKeys: [...TARGET_MODULE_KEYS],
    };
    effectiveOfferingById.set(offering.id, effectiveOffering);
    const modulesMatch = arraysEqual(offering.enabledModuleKeys, TARGET_MODULE_KEYS);
    offeringModulePlans.push({
      collection: "classSubjectOfferings",
      id: offering.id,
      path: offering.path,
      subjectKey: offering.subjectKey,
      before: Array.isArray(offering.enabledModuleKeys) ? offering.enabledModuleKeys : [],
      after: [...TARGET_MODULE_KEYS],
      action: modulesMatch ? "REUSE" : "UPDATE_MODULES",
      payload: modulesMatch ? {} : {
        enabledModuleKeys: [...TARGET_MODULE_KEYS],
        updatedAt: now,
      },
    });
  }

  const assignmentsPlans = [];
  const linksPlans = [];
  const operationsPlans = [];
  const legacyAssignmentEndPlans = [];
  const legacyLinkEndPlans = [];
  const legacyOperationalEndPlans = [];
  const visibilityAssignmentEndPlans = [];
  const visibilityLinkEndPlans = [];
  const canonicalAssignmentBySubject = new Map();

  const isTargetTeacher = (item) => text(item.teacherPersonId || item.personId) === PERSON_ID;
  const isTargetYearSchool = (item) => text(item.schoolId) === SCHOOL_ID && text(item.academicYearId) === ACADEMIC_YEAR_ID;

  for (const item of canonicalOfferings.filter((entry) => entry.found && entry.active)) {
    const offering = effectiveOfferingById.get(item.id) || item.offering;
    const matchingAssignments = allAssignments.filter((entry) =>
      active(entry) &&
      isTargetTeacher(entry) &&
      isTargetYearSchool(entry) &&
      text(entry.gradeId) === GRADE_ID &&
      subjectKeyOf(entry) === offering.subjectKey &&
      text(entry.classSubjectOfferingId) === offering.id,
    );
    if (matchingAssignments.length > 1) {
      blockers.push(`Multiple active Sumaya assignments match ${offering.subjectKey}: ${matchingAssignments.map((entry) => entry.id).join(", ")}.`);
      continue;
    }

    const existingAssignment = matchingAssignments[0];
    const assignmentId = existingAssignment?.id || stableId(["teacher-provisioning", PERSON_ID, SCHOOL_ID, ACADEMIC_YEAR_ID, termId, offering.id]);
    const expectedAssignment = assignmentPayload({ offering, termId, id: assignmentId, now });
    const assignment = existingAssignment
      ? {
          ...expectedAssignment,
          subjectId: existingAssignment.subjectId ?? expectedAssignment.subjectId,
          supervisorPersonId: existingAssignment.supervisorPersonId ?? expectedAssignment.supervisorPersonId,
          note: existingAssignment.note || expectedAssignment.note,
        }
      : expectedAssignment;
    pushPlan(
      assignmentsPlans,
      "teacherAssignments",
      assignment,
      Boolean(existingAssignment),
      compatibleAssignment(existingAssignment, assignment),
      existingAssignment && !compatibleAssignment(existingAssignment, assignment) ? "REUSE_NORMALIZE" : "",
    );
    canonicalAssignmentBySubject.set(offering.subjectKey, { offering, assignmentId, existingAssignment });

    const matchingLinks = allLinks.filter((entry) =>
      active(entry) &&
      (text(entry.assignmentId || entry.teacherAssignmentId) === assignmentId || text(entry.classSubjectOfferingId) === offering.id) &&
      text(entry.classId) === CLASS_ID,
    );
    if (matchingLinks.length > 1) {
      blockers.push(`Multiple active class links match Sumaya ${offering.subjectKey}: ${matchingLinks.map((entry) => entry.id).join(", ")}.`);
    } else {
      const existingLink = matchingLinks[0];
      const link = classLinkPayload({ offering, termId, assignmentId });
      if (existingLink) link.id = existingLink.id;
      pushPlan(
        linksPlans,
        "teacherAssignmentClassLinks",
        link,
        Boolean(existingLink),
        compatibleLink(existingLink, link),
        existingLink && !compatibleLink(existingLink, link) ? "REUSE_NORMALIZE" : "",
      );
    }

    for (const operationKind of expectedOperationKinds(offering)) {
      const matchingOperations = allOperationalAssignments.filter((entry) =>
        active(entry) &&
        text(entry.actorPersonId) === PERSON_ID &&
        isTargetYearSchool(entry) &&
        text(entry.classId) === CLASS_ID &&
        text(entry.classSubjectOfferingId) === offering.id &&
        text(entry.operationKind) === operationKind,
      );
      if (matchingOperations.length > 1) {
        blockers.push(`Multiple active operational assignments match Sumaya ${offering.subjectKey}/${operationKind}: ${matchingOperations.map((entry) => entry.id).join(", ")}.`);
        continue;
      }
      const existingOperation = matchingOperations[0];
      const operationId = existingOperation?.id || stableId(["teacher-provisioning", PERSON_ID, SCHOOL_ID, ACADEMIC_YEAR_ID, termId, offering.id, operationKind]);
      const operation = operationalPayload({ offering, termId, assignmentId, operationKind, id: operationId });
      pushPlan(
        operationsPlans,
        "operationalAssignments",
        operation,
        Boolean(existingOperation),
        compatibleOperational(existingOperation, operation),
        existingOperation && !compatibleOperational(existingOperation, operation) ? "REUSE_NORMALIZE" : "",
      );
    }
  }

  const incorrectVisibilityAssignment = allAssignments.find((item) => item.id === INCORRECT_CLASS_ASSIGNMENT_ID);
  if (!incorrectVisibilityAssignment) {
    blockers.push(`Missing required visibility assignment: orgs/${ORG_ID}/teacherAssignments/${INCORRECT_CLASS_ASSIGNMENT_ID}.`);
  } else if (
    text(incorrectVisibilityAssignment.teacherPersonId) !== PERSON_ID ||
    text(incorrectVisibilityAssignment.orgId) !== ORG_ID ||
    text(incorrectVisibilityAssignment.schoolId) !== SCHOOL_ID ||
    text(incorrectVisibilityAssignment.academicYearId) !== ACADEMIC_YEAR_ID ||
    text(incorrectVisibilityAssignment.targetScopeType) !== "CLASS" ||
    text(incorrectVisibilityAssignment.targetScopeId) !== "kg2-a"
  ) {
    blockers.push(`Visibility assignment ${INCORRECT_CLASS_ASSIGNMENT_ID} does not match the expected Sumaya/kg2-a target.`);
  } else {
    visibilityAssignmentEndPlans.push({
      collection: "teacherAssignments",
      id: incorrectVisibilityAssignment.id,
      path: incorrectVisibilityAssignment.path,
      action: active(incorrectVisibilityAssignment) ? "END_VISIBILITY_ASSIGNMENT" : "REUSE_ENDED",
      payload: active(incorrectVisibilityAssignment) ? endedVisibilityAssignmentPayload(now) : {},
    });
  }

  const incorrectVisibilityLink = allLinks.find((item) => item.id === INCORRECT_CLASS_LINK_ID);
  if (!incorrectVisibilityLink) {
    blockers.push(`Missing required visibility link: orgs/${ORG_ID}/teacherAssignmentClassLinks/${INCORRECT_CLASS_LINK_ID}.`);
  } else if (
    text(incorrectVisibilityLink.assignmentId || incorrectVisibilityLink.teacherAssignmentId) !== INCORRECT_CLASS_ASSIGNMENT_ID ||
    text(incorrectVisibilityLink.orgId) !== ORG_ID ||
    text(incorrectVisibilityLink.schoolId) !== SCHOOL_ID ||
    text(incorrectVisibilityLink.academicYearId) !== ACADEMIC_YEAR_ID ||
    text(incorrectVisibilityLink.classId) !== "kg2-a"
  ) {
    blockers.push(`Visibility link ${INCORRECT_CLASS_LINK_ID} does not match the expected ta-kg1-class/kg2-a target.`);
  } else {
    visibilityLinkEndPlans.push({
      collection: "teacherAssignmentClassLinks",
      id: incorrectVisibilityLink.id,
      path: incorrectVisibilityLink.path,
      action: active(incorrectVisibilityLink) ? "END_VISIBILITY_LINK" : "REUSE_ENDED",
      payload: active(incorrectVisibilityLink) ? endedVisibilityLinkPayload(now) : {},
    });
  }

  const legacyNumberAssignments = allAssignments.filter((entry) =>
    active(entry) &&
    isTargetTeacher(entry) &&
    isTargetYearSchool(entry) &&
    subjectKeyOf(entry) === "NUMBERS" &&
    (text(entry.gradeId) === GRADE_ID || text(entry.classId) === CLASS_ID || text(entry.classSubjectOfferingId).startsWith(`${CLASS_ID}-`)),
  );
  for (const assignment of legacyNumberAssignments) {
    legacyAssignmentEndPlans.push({
      collection: "teacherAssignments",
      id: assignment.id,
      path: assignment.path,
      action: "END_LEGACY",
      payload: { id: assignment.id, ...endedAssignmentPayload(assignment, now) },
    });

    const links = allLinks.filter((entry) =>
      active(entry) &&
      (text(entry.assignmentId || entry.teacherAssignmentId) === assignment.id || text(entry.classSubjectOfferingId) === text(assignment.classSubjectOfferingId)),
    );
    for (const link of links) {
      legacyLinkEndPlans.push({
        collection: "teacherAssignmentClassLinks",
        id: link.id,
        path: link.path,
        action: "END_LEGACY",
        payload: { id: link.id, ...endedLinkPayload(now) },
      });
    }

    const operations = allOperationalAssignments.filter((entry) =>
      active(entry) &&
      text(entry.actorPersonId) === PERSON_ID &&
      (text(entry.sourceTeacherAssignmentId) === assignment.id || text(entry.classSubjectOfferingId) === text(assignment.classSubjectOfferingId)),
    );
    for (const operation of operations) {
      legacyOperationalEndPlans.push({
        collection: "operationalAssignments",
        id: operation.id,
        path: operation.path,
        action: "END_LEGACY",
        payload: { id: operation.id, ...endedOperationalPayload(now) },
      });
    }
  }

  const resolvedOfferingIds = new Set(canonicalOfferings.filter((entry) => entry.found).map((entry) => entry.id));
  const activeTargetAssignments = allAssignments.filter((item) => active(item) && text(item.schoolId) === SCHOOL_ID && text(item.academicYearId) === ACADEMIC_YEAR_ID && (text(item.classId) === CLASS_ID || text(item.targetScopeId) === CLASS_ID || resolvedOfferingIds.has(text(item.classSubjectOfferingId)) || text(item.classSubjectOfferingId).startsWith(`${CLASS_ID}-`)));
  const legacyOrConflictingAssignments = activeTargetAssignments
    .filter((item) => isTargetTeacher(item) ? (!resolvedOfferingIds.has(text(item.classSubjectOfferingId)) && subjectKeyOf(item) !== "NUMBERS") : true)
    .map(reportConflict);
  const classAssignmentsExcluded = allAssignments
    .filter((item) => active(item) && isTargetTeacher(item) && isTargetYearSchool(item) && subjectKeyOf(item) === "CLASS")
    .map(reportConflict);

  const desiredMembershipScopes = {
    schoolIds: [SCHOOL_ID],
    gradeIds: [GRADE_ID],
    classIds: [CLASS_ID],
    subjectKeys: SUBJECTS.map((subject) => subject.key),
    canAccessAllSchools: false,
  };
  const currentNested = nestedMembershipSnapshot.exists ? dataOf(nestedMembershipSnapshot) : {};
  const currentScopes = currentNested.scopes || {};
  const missingScopeFields = Object.keys(desiredMembershipScopes).filter((field) => {
    if (field === "canAccessAllSchools") return currentScopes[field] !== false;
    return !arraysEqual(currentScopes[field], desiredMembershipScopes[field]);
  });
  const scopesNeedUpdate = missingScopeFields.length > 0;
  const membershipPath = nestedMembershipRef.path;
  const membershipPayload = scopesNeedUpdate
    ? {
        scopes: {
          ...currentScopes,
          ...desiredMembershipScopes,
          routeIds: Array.isArray(currentScopes.routeIds) ? currentScopes.routeIds : [],
        },
        updatedAt: now,
      }
    : {};
  const membershipPlan = {
    path: membershipPath,
    action: scopesNeedUpdate ? "UPDATE_SCOPE" : "REUSE",
    missingScopeFields,
    requiredByElementaryProvisioningFlow: false,
    payload: membershipPayload,
  };

  const writes = [];
  if (membershipPlan.action !== "REUSE") writes.push({ operation: "set-merge", path: membershipPath, payload: membershipPayload, category: "membershipScope" });
  for (const plan of offeringModulePlans) {
    if (plan.action !== "REUSE") writes.push({ operation: "set-merge", path: plan.path, payload: plan.payload, category: plan.collection });
  }
  for (const plan of [...assignmentsPlans, ...linksPlans, ...operationsPlans, ...legacyAssignmentEndPlans, ...legacyLinkEndPlans, ...legacyOperationalEndPlans, ...visibilityAssignmentEndPlans, ...visibilityLinkEndPlans]) {
    if (plan.action !== "REUSE") writes.push({ operation: "set-merge", path: plan.path, payload: plan.payload, category: plan.collection });
  }

  const endedAssignmentIds = new Set([
    ...legacyAssignmentEndPlans,
    ...visibilityAssignmentEndPlans,
  ].filter((plan) => plan.action !== "REUSE_ENDED").map((plan) => plan.id));
  const futureAssignments = new Map(
    allAssignments
      .filter((item) => active(item) && !endedAssignmentIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const plan of assignmentsPlans.filter((item) => item.action !== "REUSE")) {
    futureAssignments.set(plan.id, { ...futureAssignments.get(plan.id), ...plan.payload });
  }

  const endedOperationalIds = new Set(legacyOperationalEndPlans.map((plan) => plan.id));
  const futureOperationalAssignments = new Map(
    allOperationalAssignments
      .filter((item) => active(item) && !endedOperationalIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const plan of operationsPlans.filter((item) => item.action !== "REUSE")) {
    futureOperationalAssignments.set(plan.id, { ...futureOperationalAssignments.get(plan.id), ...plan.payload });
  }

  const endedLinkIds = new Set([
    ...legacyLinkEndPlans,
    ...visibilityLinkEndPlans,
  ].filter((plan) => plan.action !== "REUSE_ENDED").map((plan) => plan.id));
  const futureLinks = allLinks.filter((item) => active(item) && !endedLinkIds.has(item.id));
  const futureVisibleClasses = allClasses
    .filter((item) => active(item) && text(item.schoolId) === SCHOOL_ID && text(item.academicYearId) === ACADEMIC_YEAR_ID)
    .filter((classItem) => {
      const assignmentAllows = Array.from(futureAssignments.values()).some((assignment) =>
        isTargetTeacher(assignment) &&
        isTargetYearSchool(assignment) &&
        (
          (text(assignment.targetScopeType) === "CLASS" && text(assignment.targetScopeId) === classItem.id) ||
          futureLinks.some((link) =>
            text(link.assignmentId || link.teacherAssignmentId) === assignment.id &&
            text(link.orgId) === ORG_ID &&
            text(link.schoolId) === SCHOOL_ID &&
            text(link.academicYearId) === ACADEMIC_YEAR_ID &&
            text(link.classId) === classItem.id,
          )
        ),
      );
      const operationAllows = Array.from(futureOperationalAssignments.values()).some((operation) =>
        text(operation.actorPersonId) === PERSON_ID &&
        isTargetYearSchool(operation) &&
        text(operation.scopeType) === "CLASS" &&
        text(operation.scopeId || operation.classId) === classItem.id,
      );
      return assignmentAllows || operationAllows;
    })
    .map((item) => ({ id: item.id, name: text(item.name || item.title || item.displayName) }));

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      projectId: admin.app().options.projectId,
      orgId: ORG_ID,
      dryRun: !APPLY,
      firestoreWritesPerformed: false,
      sourceReportPath: SOURCE_REPORT_PATH,
      elementaryConventions: {
        provisioningSource: SOURCE,
        provisioningVersion: VERSION,
        teacherAssignmentKind: "SUBJECT_TEACHER",
        classLinkCreated: true,
        operationalAssignmentsDerivedFromOfferingModules: true,
      },
    },
    teacher: {
      found: matchingMemberships.length > 0,
      uid: UID,
      personId: PERSON_ID,
      email: TEACHER_EMAIL,
      displayName: DISPLAY_NAME,
      roleKey: ROLE_KEY,
      authFound: Boolean(authSnapshot),
      membershipPaths: memberships.map((item) => item.path),
    },
    school: { path: schoolRef.path, found: schoolSnapshot.exists, id: SCHOOL_ID },
    academicYear: { path: yearRef.path, found: yearSnapshot.exists, id: ACADEMIC_YEAR_ID },
    class: { path: classRef.path, found: classSnapshot.exists, id: CLASS_ID, name: CLASS_NAME, level: LEVEL_NAME },
    term: { id: termId, activeTerms: activeTerms.map((item) => ({ id: item.id, path: item.path })) },
    canonicalOfferings: canonicalOfferings.map((item) => ({ id: item.id, path: item.path, subjectKey: item.subjectKey, found: item.found, active: item.active })),
    offeringModules: offeringModulePlans.map(({ payload, ...item }) => item),
    teacherAssignments: assignmentsPlans.map(({ payload, ...item }) => item),
    teacherAssignmentClassLinks: linksPlans.map(({ payload, ...item }) => item),
    operationalAssignments: operationsPlans.map(({ payload, ...item }) => ({ ...item, operationKind: payload.operationKind })),
    existingTeacherAssignmentsReused: assignmentsPlans.filter((item) => item.action === "REUSE" || item.action === "REUSE_NORMALIZE").map(({ payload, ...item }) => item),
    teacherAssignmentsToCreate: assignmentsPlans.filter((item) => item.action === "CREATE").map(({ payload, ...item }) => item),
    legacyAssignmentsToEnd: legacyAssignmentEndPlans.map(({ payload, ...item }) => item),
    classLinksReused: linksPlans.filter((item) => item.action === "REUSE" || item.action === "REUSE_NORMALIZE").map(({ payload, ...item }) => item),
    classLinksToCreate: linksPlans.filter((item) => item.action === "CREATE").map(({ payload, ...item }) => item),
    classLinksToEnd: legacyLinkEndPlans.map(({ payload, ...item }) => item),
    visibilityAssignmentsToEnd: visibilityAssignmentEndPlans.map(({ payload, ...item }) => item),
    visibilityLinksToEnd: visibilityLinkEndPlans.map(({ payload, ...item }) => item),
    operationalAssignmentsReused: operationsPlans.filter((item) => item.action === "REUSE" || item.action === "REUSE_NORMALIZE").map(({ payload, ...item }) => ({ ...item, operationKind: payload.operationKind })),
    operationalAssignmentsToCreate: operationsPlans.filter((item) => item.action === "CREATE").map(({ payload, ...item }) => ({ ...item, operationKind: payload.operationKind })),
    operationalAssignmentsToEnd: legacyOperationalEndPlans.map(({ payload, ...item }) => item),
    membershipScopeChanges: membershipPlan,
    finalExpectedVisibleClasses: futureVisibleClasses,
    legacyOrConflictingAssignments,
    classAssignmentsExcluded,
    legacyOfferings,
    finalExpectedActiveSubjects: SUBJECTS.map((subject) => subject.key),
    exactFirestoreWritesPlanned: writes.map((item) => ({ operation: item.operation, path: item.path, category: item.category })),
    plannedFirestoreWriteCount: writes.length,
    blockers: Array.from(new Set(blockers)),
  };

  if (APPLY) {
    if (report.blockers.length > 0) throw new Error(`Apply blocked: ${report.blockers.join(" | ")}`);
    const batch = db.batch();
    for (const write of writes) batch.set(db.doc(write.path), write.payload, { merge: true });
    await batch.commit();
    report.metadata.firestoreWritesPerformed = true;
  }

  fs.mkdirSync(path.dirname(OUTPUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "DRY_RUN",
    teacherFound: report.teacher.found,
    canonicalOfferingsResolved: canonicalOfferings.filter((item) => item.found && item.active).length,
    resolvedOfferings: report.canonicalOfferings,
    offeringModules: report.offeringModules,
    teacherAssignments: report.teacherAssignments,
    teacherAssignmentClassLinks: report.teacherAssignmentClassLinks,
    operationalAssignments: report.operationalAssignments,
    existingTeacherAssignmentsReused: report.existingTeacherAssignmentsReused,
    teacherAssignmentsToCreate: report.teacherAssignmentsToCreate,
    legacyAssignmentsToEnd: report.legacyAssignmentsToEnd,
    classLinksReused: report.classLinksReused,
    classLinksToCreate: report.classLinksToCreate,
    classLinksToEnd: report.classLinksToEnd,
    visibilityAssignmentsToEnd: report.visibilityAssignmentsToEnd,
    visibilityLinksToEnd: report.visibilityLinksToEnd,
    operationalAssignmentsReused: report.operationalAssignmentsReused,
    operationalAssignmentsToCreate: report.operationalAssignmentsToCreate,
    operationalAssignmentsToEnd: report.operationalAssignmentsToEnd,
    membershipScopeChanges: report.membershipScopeChanges,
    finalExpectedVisibleClasses: report.finalExpectedVisibleClasses,
    legacyOrConflictingAssignments: report.legacyOrConflictingAssignments,
    classAssignmentsExcluded: report.classAssignmentsExcluded,
    legacyOfferings: report.legacyOfferings,
    finalExpectedActiveSubjects: report.finalExpectedActiveSubjects,
    exactFirestoreWritesPlanned: report.exactFirestoreWritesPlanned,
    plannedFirestoreWriteCount: report.plannedFirestoreWriteCount,
    blockers: report.blockers,
    reportPath: OUTPUT_REPORT_PATH,
    firestoreWritesPerformed: report.metadata.firestoreWritesPerformed,
  }, null, 2));
}

main().catch((error) => {
  console.error("KG single-teacher pilot failed:", error.stack || error);
  process.exitCode = 1;
});
