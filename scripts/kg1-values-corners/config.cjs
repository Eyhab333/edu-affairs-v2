"use strict";

const admin = require("firebase-admin");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(__dirname, "reports");
const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const SOURCE = "KG1_VALUES_CORNERS_PROVISIONING";
const VERSION = 2;
const CONFIRMATION = "KG1_VALUES_CORNERS_AY1448";
const SUBJECTS = {
  VALUES: { key: "VALUES", id: "subject-values", suffix: "values", title: "القيم", order: 50 },
  CORNERS: { key: "CORNERS", id: "subject-corners", suffix: "corners", title: "الأركان", order: 60 },
};
const TARGETS = [
  { schoolId: "kg-01", gradeId: "kg1", classId: "kg1-a", className: "فصل النجوم", subjectKey: "VALUES", teacherPersonId: "p-ma-alfarhod" },
  { schoolId: "kg-01", gradeId: "kg1", classId: "kg1-a", className: "فصل النجوم", subjectKey: "CORNERS", teacherPersonId: "p-h-alarajh" },
  { schoolId: "kg-02", gradeId: "kg1", classId: "kg1-a", className: "فصل الكادي", subjectKey: "VALUES", teacherPersonId: "p-alanoodf" },
  { schoolId: "kg-02", gradeId: "kg1", classId: "kg1-a", className: "فصل الكادي", subjectKey: "CORNERS", teacherPersonId: "p-h-almadallah" },
  { schoolId: "kg-03", gradeId: "kg1", classId: "kg1-a", className: "فصل المرح", subjectKey: "VALUES", teacherPersonId: "p-ss-alfaleh" },
  { schoolId: "kg-03", gradeId: "kg1", classId: "kg1-a", className: "فصل المرح", subjectKey: "CORNERS", teacherPersonId: "p-r-alfayez" },
  { schoolId: "kg-04", gradeId: "kg1", classId: "kg1-a", className: "فصل الوهج", subjectKey: "VALUES", teacherPersonId: "p-s-bader" },
  { schoolId: "kg-04", gradeId: "kg1", classId: "kg1-a", className: "فصل الوهج", subjectKey: "CORNERS", teacherPersonId: "p-r-a-atyar" },
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
  LEARNING_LOSS_FOLLOWUP: "متابعة الفاقد التعليمي",
  STUDENT_HOMEWORK: "واجبات الطلاب",
  LESSON_PREP: "تحضير الدروس",
  STUDENT_GAMIFICATION: "تحفيز الطلاب",
  VIRTUAL_CLASS: "الفصول الافتراضية",
  STUDENT_NOTES: "ملاحظات الطلاب",
};

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function active(data = {}) {
  const status = text(data.status).toUpperCase();
  return data.isArchived !== true && data.isActive !== false && data.active !== false && !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status);
}
function subjectKeyOf(data = {}) { return text(data.subjectKey || data.key || data.code).toUpperCase(); }
function stableId(parts) { return parts.map((part) => text(part).replaceAll("/", "-").replace(/\s+/g, "-")).filter(Boolean).join("__"); }
function dataOf(snapshot) { return { id: snapshot.id, path: snapshot.ref.path, ...(snapshot.data() || {}) }; }
function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
function targetId(target) { return [target.schoolId, target.gradeId, target.classId, target.subjectKey, target.teacherPersonId].join("|"); }
function offeringId(target) { return `${target.schoolId}-${target.classId}-${SUBJECTS[target.subjectKey].suffix}`; }
function assignmentId(target, termId, canonicalOfferingId) { return stableId(["teacher-provisioning", target.teacherPersonId, target.schoolId, ACADEMIC_YEAR_ID, termId, canonicalOfferingId]); }
function linkId(teacherAssignmentId, target) { return `${teacherAssignmentId}__class-link__${target.classId}`; }
function operationId(teacherAssignmentId, operationKind) { return `${teacherAssignmentId}__${operationKind}`; }
function classPath(target) { return `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes/${target.classId}`; }
function subjectPath(target) { return `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}/subjects/${SUBJECTS[target.subjectKey].id}`; }
function schoolPath(target) { return `orgs/${ORG_ID}/schools/${target.schoolId}`; }
function yearPath(target) { return `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}`; }
function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(process.env.SERVICE_ACCOUNT_PATH || path.join(REPOSITORY_ROOT, "scripts", "service-account.json"));
  if (!fs.existsSync(serviceAccountPath)) throw new Error("Service account file was not found at scripts/service-account.json.");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}
function reportFileName(kind) { return `kg1-values-corners-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; }
function writeReport(kind, report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, reportFileName(kind));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}
function countsByAction(items) {
  return items.reduce((counts, item) => {
    const action = typeof item === "string" ? item : item.action;
    return { ...counts, [action]: (counts[action] || 0) + 1 };
  }, {});
}
function writeSummary(writes) { return writes.reduce((summary, write) => ({ ...summary, [write.category]: (summary[write.category] || 0) + 1 }), {}); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => !["startAt", "createdAt", "updatedAt", "provisionedAt"].includes(key)).map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
function planFingerprint(writes) {
  const entries = writes.map((write) => ({ action: write.action, category: write.category, path: write.path, payload: canonicalize(write.payload) }));
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
function isCorrectAssignment(item, target, termId, canonicalOfferingId) {
  return active(item) && text(item.orgId) === ORG_ID && text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.termId) === termId && text(item.teacherPersonId || item.personId) === target.teacherPersonId && text(item.assignmentKind) === "SUBJECT_TEACHER" && text(item.targetScopeType) === "CLASS" && text(item.targetScopeId) === target.classId && text(item.coverageMode) === "EXPLICIT_CLASSES" && subjectKeyOf(item) === target.subjectKey && text(item.classSubjectOfferingId) === canonicalOfferingId && text(item.gradeId) === target.gradeId && item.isHomeroom !== true && text(item.status).toUpperCase() === "ACTIVE";
}
function isCorrectLink(item, target, termId, teacherAssignmentId, canonicalOfferingId) {
  return active(item) && text(item.assignmentId || item.teacherAssignmentId) === teacherAssignmentId && text(item.orgId) === ORG_ID && text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.termId) === termId && text(item.classId) === target.classId && text(item.gradeId) === target.gradeId && text(item.classSubjectOfferingId) === canonicalOfferingId;
}
function expectedOperationKinds(offering) {
  const operationKinds = new Set();
  for (const moduleKey of Array.isArray(offering.enabledModuleKeys) ? offering.enabledModuleKeys : []) {
    const operationKind = MODULE_OPERATION_MAP.get(moduleKey);
    if (operationKind) operationKinds.add(operationKind);
  }
  if (Array.isArray(offering.assessmentPolicy?.trackerTemplateIds) && offering.assessmentPolicy.trackerTemplateIds.length > 0 && Array.isArray(offering.enabledModuleKeys) && offering.enabledModuleKeys.includes("ASSESSMENTS")) operationKinds.add("STUDENT_TRACKER");
  if (offering.assessmentPolicy?.allowLearningLoss !== true) operationKinds.delete("LEARNING_LOSS_FOLLOWUP");
  if (offering.curriculumPolicy?.homeworkEnabled !== true) operationKinds.delete("STUDENT_HOMEWORK");
  return Array.from(operationKinds).sort();
}
function assignmentPayload({ target, termId, offering, id, now }) {
  return { id, orgId: ORG_ID, schoolId: target.schoolId, academicYearId: ACADEMIC_YEAR_ID, termId, teacherPersonId: target.teacherPersonId, supervisorPersonId: "", assignmentKind: "SUBJECT_TEACHER", targetScopeType: "CLASS", targetScopeId: target.classId, coverageMode: "EXPLICIT_CLASSES", subjectKey: offering.subjectKey, subjectId: offering.subjectId, classSubjectOfferingId: offering.id, gradeId: target.gradeId, streamId: text(offering.streamId), isHomeroom: false, roleInAssignment: "MAIN", status: "ACTIVE", startAt: now, note: "KG1 VALUES/CORNERS policy enablement", provisioningSource: SOURCE, provisioningVersion: VERSION, managedBy: SOURCE };
}
function linkPayload({ target, termId, offering, teacherAssignmentId }) {
  return { id: linkId(teacherAssignmentId, target), assignmentId: teacherAssignmentId, orgId: ORG_ID, schoolId: target.schoolId, academicYearId: ACADEMIC_YEAR_ID, termId, classId: target.classId, gradeId: target.gradeId, streamId: text(offering.streamId), classSubjectOfferingId: offering.id, order: 0, isPrimaryClass: true, provisioningSource: SOURCE, provisioningVersion: VERSION, managedBy: SOURCE };
}
function operationPayload({ target, termId, offering, teacherAssignmentId, operationKind, now }) {
  return { id: operationId(teacherAssignmentId, operationKind), orgId: ORG_ID, schoolId: target.schoolId, academicYearId: ACADEMIC_YEAR_ID, termId, gradeId: target.gradeId, classId: target.classId, subjectKey: offering.subjectKey, classSubjectOfferingId: offering.id, title: OPERATION_TITLES[operationKind] || operationKind, description: "KG1 VALUES/CORNERS policy enablement linked to a class subject offering", status: "ACTIVE", isActive: true, startAt: now, actorPersonId: target.teacherPersonId, actorMembershipId: "", actorRoleKey: "KG_TEACHER", operationKind, scopeType: "CLASS", scopeId: target.classId, scopeLabel: offering.id, coverageMode: "SINGLE_SCOPE", targetKind: "CLASS", targetPersonIds: [], targetStudentIds: [], targetClassIds: [target.classId], targetGradeIds: [target.gradeId], targetRouteIds: [], targetRoleKeys: [], permissions: ["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"], sourceTeacherAssignmentId: teacherAssignmentId, sourceMembershipId: "", note: "Created by KG1 VALUES/CORNERS provisioning", provisioningSource: SOURCE, provisioningVersion: VERSION, managedBy: SOURCE };
}
function offeringPayload({ target, exemplar, now }) {
  const subject = SUBJECTS[target.subjectKey];
  const copiedConfiguration = {};
  for (const field of ["enabledModuleKeys", "assessmentPolicy", "curriculumPolicy", "gradingPolicy"]) {
    if (Object.prototype.hasOwnProperty.call(exemplar, field)) copiedConfiguration[field] = exemplar[field];
  }
  return { id: offeringId(target), orgId: ORG_ID, schoolId: target.schoolId, academicYearId: ACADEMIC_YEAR_ID, classId: target.classId, gradeId: target.gradeId, streamId: text(exemplar.streamId), subjectId: subject.id, subjectKey: subject.key, subjectTitleSnapshot: subject.title, displayName: subject.title, shortLabel: subject.key, status: "ACTIVE", isActive: true, isArchived: false, order: subject.order, offeringKind: "KG_SUBJECT", ...copiedConfiguration, note: "KG1 VALUES/CORNERS policy enablement; canonical offering.", metadata: { provisionedBy: SOURCE, provisionedAt: now }, createdAt: now, updatedAt: now };
}
async function loadState(db) {
  const teacherIds = unique(TARGETS.map((target) => target.teacherPersonId));
  const [offeringsSnap, assignmentsSnap, linksSnap, operationalSnap, membershipsSnap, schools, years, classes, subjects, terms, people] = await Promise.all([
    db.collection(`orgs/${ORG_ID}/classSubjectOfferings`).get(),
    db.collection(`orgs/${ORG_ID}/teacherAssignments`).get(),
    db.collection(`orgs/${ORG_ID}/teacherAssignmentClassLinks`).get(),
    db.collection(`orgs/${ORG_ID}/operationalAssignments`).get(),
    db.collection(`orgs/${ORG_ID}/memberships`).get(),
    db.getAll(...TARGETS.map((target) => db.doc(schoolPath(target)))),
    db.getAll(...TARGETS.map((target) => db.doc(yearPath(target)))),
    db.getAll(...TARGETS.map((target) => db.doc(classPath(target)))),
    db.getAll(...TARGETS.map((target) => db.doc(subjectPath(target)))),
    db.collection(`orgs/${ORG_ID}/academicYears/${ACADEMIC_YEAR_ID}/terms`).get(),
    db.getAll(...teacherIds.map((personId) => db.doc(`orgs/${ORG_ID}/people/${personId}`))),
  ]);
  const memberships = membershipsSnap.docs.map(dataOf).filter((item) => teacherIds.includes(text(item.personId)));
  const nestedMembershipRefs = unique(memberships.map((item) => text(item.uid)).filter(Boolean)).map((uid) => db.doc(`users/${uid}/orgMemberships/${ORG_ID}`));
  const nestedMemberships = (await db.getAll(...nestedMembershipRefs)).map((snapshot) => snapshot.exists ? dataOf(snapshot) : { id: snapshot.id, path: snapshot.ref.path, missing: true });
  return { offerings: offeringsSnap.docs.map(dataOf), assignments: assignmentsSnap.docs.map(dataOf), links: linksSnap.docs.map(dataOf), operations: operationalSnap.docs.map(dataOf), memberships, nestedMemberships, schools: schools.map((snapshot) => snapshot.exists ? dataOf(snapshot) : { path: snapshot.ref.path, missing: true }), years: years.map((snapshot) => snapshot.exists ? dataOf(snapshot) : { path: snapshot.ref.path, missing: true }), classes: classes.map((snapshot) => snapshot.exists ? dataOf(snapshot) : { path: snapshot.ref.path, missing: true }), subjects: subjects.map((snapshot) => snapshot.exists ? dataOf(snapshot) : { path: snapshot.ref.path, missing: true }), terms: terms.docs.map(dataOf), people: people.map((snapshot) => snapshot.exists ? dataOf(snapshot) : { path: snapshot.ref.path, missing: true }) };
}
function findByPath(items, expectedPath) { return items.find((item) => item.path === expectedPath); }
function finalizeTarget(result) {
  const createdActions = result.operations.map((item) => item.action);
  result.status = result.conflicts.length ? "CONFLICT" : result.reviewRequired.length || result.blockers.length ? "REVIEW_REQUIRED" : createdActions.length ? createdActions : ["ALREADY_CORRECT"];
  return result;
}
function membershipCoversSchool(membership, schoolId) {
  const scopeSchools = Array.isArray(membership.scopes?.schoolIds) ? membership.scopes.schoolIds.map(text) : [];
  return membership.scopes?.canAccessAllSchools === true || scopeSchools.includes(schoolId) || (text(membership.scopeType) === "SCHOOL" && text(membership.scopeId) === schoolId) || text(membership.schoolId) === schoolId || (Array.isArray(membership.schoolIds) && membership.schoolIds.map(text).includes(schoolId));
}
function buildTargetPlan(target, state, now) {
  const subject = SUBJECTS[target.subjectKey];
  const result = { targetId: targetId(target), target, operations: [], blockers: [], reviewRequired: [], archivedLegacyOfferings: [], conflicts: [], references: {} };
  const school = findByPath(state.schools, schoolPath(target));
  const year = findByPath(state.years, yearPath(target));
  const klass = findByPath(state.classes, classPath(target));
  const subjectDoc = findByPath(state.subjects, subjectPath(target));
  const person = state.people.find((item) => item.id === target.teacherPersonId);
  if (!school || school.missing) result.blockers.push("School document is missing.");
  if (!year || year.missing || text(year.schoolId) !== target.schoolId) result.blockers.push("Academic-year document is missing or mismatched.");
  if (!klass || klass.missing || text(klass.schoolId) !== target.schoolId || text(klass.academicYearId) !== ACADEMIC_YEAR_ID || text(klass.gradeId) !== target.gradeId || !active(klass)) result.blockers.push("Target KG1 class is missing, mismatched, or inactive.");
  if (!subjectDoc || subjectDoc.missing || subjectKeyOf(subjectDoc) !== subject.key || text(subjectDoc.id) !== subject.id || subjectDoc.isArchived === true) result.blockers.push("Canonical subject catalog entry is missing, mismatched, or archived.");
  if (!person || person.missing || person.isArchived === true || person.isActive === false) result.blockers.push("Specified teacher person record is missing or inactive.");
  const rootMemberships = state.memberships.filter((item) => text(item.personId) === target.teacherPersonId && active(item) && text(item.roleKey || item.role).toUpperCase().includes("KG_TEACHER") && membershipCoversSchool(item, target.schoolId));
  const nestedMemberships = state.nestedMemberships.filter((item) => rootMemberships.some((root) => text(root.uid) && text(root.uid) === text(item.uid) && item.path === `users/${root.uid}/orgMemberships/${ORG_ID}` && text(item.personId) === target.teacherPersonId && text(item.orgId) === ORG_ID) && !item.missing && active(item) && text(item.roleKey || item.role).toUpperCase().includes("KG_TEACHER") && membershipCoversSchool(item, target.schoolId));
  result.references.memberships = { root: rootMemberships.map((item) => item.path), nested: nestedMemberships.map((item) => item.path) };
  if (rootMemberships.length !== 1 || nestedMemberships.length !== 1) result.reviewRequired.push("Expected one active KG_TEACHER root and nested membership scoped to the target school.");
  const activeTerms = state.terms.filter((term) => active(term) && (text(term.status).toUpperCase() === "ACTIVE" || term.isCurrent === true));
  if (activeTerms.length !== 1) result.reviewRequired.push(`Expected exactly one active/current term; found ${activeTerms.length}.`);
  const termId = activeTerms.length === 1 ? activeTerms[0].id : "";
  result.references.term = activeTerms.map((term) => ({ id: term.id, path: term.path }));
  const allSubjectOfferings = state.offerings.filter((item) => text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.gradeId) === target.gradeId && text(item.classId) === target.classId && subjectKeyOf(item) === subject.key);
  const activeOfferings = allSubjectOfferings.filter(active);
  result.archivedLegacyOfferings = allSubjectOfferings.filter((item) => !active(item)).map((item) => ({ id: item.id, path: item.path, subjectId: text(item.subjectId), status: text(item.status), note: text(item.note), metadata: item.metadata || {} }));
  const canonicalExisting = activeOfferings.filter((item) => item.id === offeringId(target) && text(item.subjectId) === subject.id && item.isArchived !== true);
  if (activeOfferings.length > 1) result.conflicts.push(`Multiple active ${subject.key} offerings exist for this class: ${activeOfferings.map((item) => item.id).join(", ")}.`);
  if (activeOfferings.length === 1 && canonicalExisting.length !== 1) result.conflicts.push(`The active ${subject.key} offering is not the canonical ${offeringId(target)} / ${subject.id} record.`);
  const exemplars = state.offerings.filter((item) => active(item) && text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && ["kg2", "kg3"].includes(text(item.gradeId)) && subjectKeyOf(item) === subject.key && text(item.subjectId) === subject.id && text(item.status).toUpperCase() === "ACTIVE" && item.isArchived !== true);
  if (activeOfferings.length === 0 && exemplars.length === 0) result.reviewRequired.push(`No active KG2/KG3 canonical ${subject.key} offering is available as a configuration exemplar.`);
  let offering = canonicalExisting[0] || null;
  if (!offering && activeOfferings.length === 0 && exemplars.length > 0) {
    offering = offeringPayload({ target, exemplar: exemplars[0], now });
    result.operations.push({ action: "CREATE_OFFERING", category: "offerings", path: `orgs/${ORG_ID}/classSubjectOfferings/${offering.id}`, payload: offering });
  }
  if (!offering || result.conflicts.length || result.blockers.length) return finalizeTarget(result);
  const activeAssignments = state.assignments.filter((item) => active(item) && text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && (text(item.classSubjectOfferingId) === offering.id || (text(item.targetScopeId) === target.classId && subjectKeyOf(item) === target.subjectKey)));
  const correctAssignments = activeAssignments.filter((item) => isCorrectAssignment(item, target, termId, offering.id));
  const conflictingAssignments = activeAssignments.filter((item) => !correctAssignments.includes(item));
  if (correctAssignments.length > 1) result.conflicts.push(`Multiple active correct-looking teacher assignments exist: ${correctAssignments.map((item) => item.id).join(", ")}.`);
  if (conflictingAssignments.length > 0) result.conflicts.push(`Active teacher assignment conflicts with the designated teacher or canonical scope: ${conflictingAssignments.map((item) => item.id).join(", ")}.`);
  let teacherAssignment = correctAssignments[0] || null;
  if (!teacherAssignment && !result.conflicts.length) {
    const id = assignmentId(target, termId, offering.id);
    teacherAssignment = assignmentPayload({ target, termId, offering, id, now });
    result.operations.push({ action: "CREATE_ASSIGNMENT", category: "assignments", path: `orgs/${ORG_ID}/teacherAssignments/${id}`, payload: teacherAssignment });
  }
  if (!teacherAssignment || result.conflicts.length) return finalizeTarget(result);
  const activeLinks = state.links.filter((item) => active(item) && (text(item.assignmentId || item.teacherAssignmentId) === teacherAssignment.id || text(item.classSubjectOfferingId) === offering.id));
  const correctLinks = activeLinks.filter((item) => isCorrectLink(item, target, termId, teacherAssignment.id, offering.id));
  if (correctLinks.length > 1) result.conflicts.push(`Multiple active class links exist: ${correctLinks.map((item) => item.id).join(", ")}.`);
  if (activeLinks.some((item) => !correctLinks.includes(item))) result.conflicts.push(`An active class link does not match the target assignment/context: ${activeLinks.filter((item) => !correctLinks.includes(item)).map((item) => item.id).join(", ")}.`);
  if (correctLinks.length === 0 && !result.conflicts.length) {
    const payload = linkPayload({ target, termId, offering, teacherAssignmentId: teacherAssignment.id });
    result.operations.push({ action: "CREATE_CLASS_LINK", category: "classLinks", path: `orgs/${ORG_ID}/teacherAssignmentClassLinks/${payload.id}`, payload });
  }
  for (const operationKind of expectedOperationKinds(offering)) {
    const matchingOperations = state.operations.filter((item) => active(item) && text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.actorPersonId) === target.teacherPersonId && text(item.classSubjectOfferingId) === offering.id && text(item.operationKind) === operationKind);
    if (matchingOperations.length > 1) result.conflicts.push(`Multiple active ${operationKind} operational assignments exist: ${matchingOperations.map((item) => item.id).join(", ")}.`);
    if (matchingOperations.length === 0) {
      const payload = operationPayload({ target, termId, offering, teacherAssignmentId: teacherAssignment.id, operationKind, now });
      result.operations.push({ action: "CREATE_OPERATIONAL_ASSIGNMENT", category: "operationalAssignments", path: `orgs/${ORG_ID}/operationalAssignments/${payload.id}`, payload });
    }
  }
  return finalizeTarget(result);
}
async function buildPlan() {
  initAdmin();
  const db = admin.firestore();
  const state = await loadState(db);
  const now = Date.now();
  const targets = TARGETS.map((target) => buildTargetPlan(target, state, now));
  const writes = targets.flatMap((target) => target.operations);
  const blockers = targets.flatMap((target) => target.blockers.map((message) => `${target.targetId}: ${message}`));
  const reviewRequired = targets.flatMap((target) => target.reviewRequired.map((message) => `${target.targetId}: ${message}`));
  const conflicts = targets.flatMap((target) => target.conflicts.map((message) => `${target.targetId}: ${message}`));
  const report = {
    metadata: { reportType: "KG1_VALUES_CORNERS_PREVIEW", generatedAt: new Date().toISOString(), projectId: admin.app().options.projectId, orgId: ORG_ID, academicYearId: ACADEMIC_YEAR_ID, readOnly: true, firestoreWritesPerformed: false, confirmationRequired: CONFIRMATION, source: SOURCE, version: VERSION },
    targets,
    summary: { targetCount: TARGETS.length, targetActions: countsByAction(targets.flatMap((target) => Array.isArray(target.status) ? target.status : [target.status || "REVIEW_REQUIRED"])), writeCounts: writeSummary(writes), blockersCount: blockers.length, reviewRequiredCount: reviewRequired.length, conflictsCount: conflicts.length, safeToApply: blockers.length === 0 && reviewRequired.length === 0 && conflicts.length === 0 },
    blockers,
    reviewRequired,
    conflicts,
    applicationCompatibility: { visibleClasses: "Active SUBJECT_TEACHER assignments with CLASS scope and matching class links follow the current staff-actor visibility model.", classPages: "The class detail page filters only legacy KG subject keys CLASS and NUMBERS; VALUES and CORNERS are allowed.", subjectWorkspaces: "VALUES and CORNERS have normal workspace groups and measurement handling.", membershipDataConcern: "Memberships are checked using users/{uid}/orgMemberships/{orgId}, nested uid and personId, not the nested document ID (which is the organization ID).", codeChangesRequired: false, knownHistoricalRestriction: "scripts/reconciliation/reconcile-kindergarten-phase-a.cjs contains the old KG1 prohibition; this dedicated script does not invoke it or alter archived history." },
    plannedWrites: writes.map(({ payload, ...write }) => write),
    planFingerprint: planFingerprint(writes),
  };
  return { db, report, writes };
}

module.exports = { ACADEMIC_YEAR_ID, CONFIRMATION, ORG_ID, REPORTS_DIR, SOURCE, TARGETS, buildPlan, planFingerprint, writeReport };
