"use strict";

/*
 * Read-only inspection of KG-04 Learning Centers class visibility.
 * No Firestore, Auth, Storage, Rules, or Functions state is modified.
 *
 * Usage:
 *   node scripts/inspections/inspect-kg04-corners-class-visibility.cjs
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");
const { getVisibleClassesForActor } = require("../../packages/domain/dist/index.js");

const ORG_ID = "takween";
const SCHOOL_ID = "kg-04";
const ACADEMIC_YEAR_ID = "ay-1448";
const TEACHER_PERSON_ID = "p-r-a-atyar";
const VICE_PRINCIPAL_PERSON_ID = "p-h-alshaya";
const CORNERS = "CORNERS";
const EXPECTED_CLASS_IDS = ["kg1-a", "kg2-a", "kg2-b", "kg3-a", "kg3-b", "kg3-c", "kg3-d"];
const NOW = Date.now();
const brief = process.argv.includes("--brief");

function initAdmin() {
  const serviceAccountPath = path.resolve(process.cwd(), "scripts", "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) throw new Error(`Service account not found: ${serviceAccountPath}`);
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function normalize(value) { return text(value).replace(/[\s-]+/g, "_").toUpperCase(); }
function plain(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value.toMillis === "function" && typeof value.toDate === "function") {
    return { __type: "Timestamp", millis: value.toMillis(), iso: value.toDate().toISOString() };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
}
function active(item) {
  if (item.isActive === false) return false;
  if (["ENDED", "SUSPENDED", "CANCELLED"].includes(text(item.status).toUpperCase())) return false;
  if (typeof item.startAt === "number" && item.startAt > NOW) return false;
  if (typeof item.endAt === "number" && item.endAt < NOW) return false;
  return true;
}
function uidFromMembership(doc) { return doc.ref.parent.parent ? doc.ref.parent.parent.id : ""; }
function isCorners(item) {
  return [item.subjectKey, item.subjectId, item.subjectTitle, item.title]
    .map(normalize).some((value) => value === CORNERS || value.includes(CORNERS));
}
function compactAssignment(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id, path: doc.ref.path, activeAtNow: active(data),
    status: text(data.status), isActive: data.isActive ?? null, startAt: data.startAt ?? null, endAt: data.endAt ?? null,
    orgId: text(data.orgId), schoolId: text(data.schoolId), academicYearId: text(data.academicYearId), termId: text(data.termId),
    teacherPersonId: text(data.teacherPersonId), assignmentKind: text(data.assignmentKind),
    targetScopeType: text(data.targetScopeType), targetScopeId: text(data.targetScopeId), coverageMode: text(data.coverageMode),
    gradeId: text(data.gradeId), streamId: text(data.streamId), subjectKey: text(data.subjectKey), subjectId: text(data.subjectId),
    classSubjectOfferingId: text(data.classSubjectOfferingId), raw: plain(data),
  };
}
function compactLink(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id, path: doc.ref.path, assignmentId: text(data.assignmentId), classId: text(data.classId),
    schoolId: text(data.schoolId), academicYearId: text(data.academicYearId), gradeId: text(data.gradeId),
    classSubjectOfferingId: text(data.classSubjectOfferingId), raw: plain(data),
  };
}
function compactOffering(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id, path: doc.ref.path, schoolId: text(data.schoolId), academicYearId: text(data.academicYearId),
    gradeId: text(data.gradeId), classId: text(data.classId), subjectKey: text(data.subjectKey), subjectId: text(data.subjectId),
    status: text(data.status), isActive: data.isActive ?? null, isArchived: data.isArchived ?? null, raw: plain(data),
  };
}
function compactClass(doc) {
  const data = doc.data() || {};
  return { id: doc.id, path: doc.ref.path, orgId: text(data.orgId), schoolId: text(data.schoolId), academicYearId: text(data.academicYearId), gradeId: text(data.gradeId), name: text(data.name || data.title || data.displayName), isArchived: data.isArchived ?? null, raw: plain(data) };
}
function membershipForActor(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id, uid: uidFromMembership(doc), orgId: text(data.orgId) || ORG_ID,
    personId: text(data.personId), role: text(data.role), roleKey: text(data.roleKey), isActive: data.isActive !== false,
    scopeType: text(data.scopeType), scopeId: text(data.scopeId), scopes: plain(data.scopes || {}), permissions: plain(data.permissions || {}), raw: plain(data),
  };
}
function teacherClassReason(assignment, classItem, links) {
  if (!assignment.activeAtNow) return "inactive";
  if (assignment.orgId !== classItem.orgId || assignment.schoolId !== classItem.schoolId || assignment.academicYearId !== classItem.academicYearId) return "context mismatch";
  if (assignment.targetScopeType === "CLASS" && assignment.targetScopeId === classItem.id) return "direct CLASS scope";
  if (assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" && assignment.targetScopeType === "SCHOOL" && assignment.targetScopeId === classItem.schoolId) return "all school classes";
  if (assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" && assignment.targetScopeType === "GRADE" && assignment.targetScopeId === classItem.gradeId) return "all grade classes";
  if (assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" && assignment.targetScopeType === "STREAM" && classItem.streamId && assignment.targetScopeId === classItem.streamId) return "all stream classes";
  const link = links.find((item) => item.assignmentId === assignment.id && item.classId === classItem.id && item.schoolId === classItem.schoolId && item.academicYearId === classItem.academicYearId && item.orgId === classItem.orgId);
  return link ? `class link ${link.id}` : "does not cover class";
}

async function membershipsByPerson(db, personId) {
  const snapshot = await db.collectionGroup("orgMemberships").where("personId", "==", personId).get();
  return snapshot.docs.filter((doc) => doc.id === ORG_ID).map(membershipForActor);
}
async function main() {
  initAdmin();
  const db = admin.firestore();
  const [teacherMemberships, vpMemberships, assignmentsSnap, operationsSnap, offeringsSnap] = await Promise.all([
    membershipsByPerson(db, TEACHER_PERSON_ID),
    membershipsByPerson(db, VICE_PRINCIPAL_PERSON_ID),
    db.collection(`orgs/${ORG_ID}/teacherAssignments`).where("teacherPersonId", "==", TEACHER_PERSON_ID).get(),
    db.collection(`orgs/${ORG_ID}/operationalAssignments`).where("actorPersonId", "==", TEACHER_PERSON_ID).get(),
    db.collection(`orgs/${ORG_ID}/classSubjectOfferings`).where("schoolId", "==", SCHOOL_ID).get(),
  ]);
  const classes = [];
  for (const classId of EXPECTED_CLASS_IDS) {
    const doc = await db.doc(`orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}/classes/${classId}`).get();
    classes.push(doc.exists ? compactClass(doc) : { id: classId, exists: false, path: doc.ref.path });
  }
  const assignments = assignmentsSnap.docs.map(compactAssignment);
  const assignmentIds = assignments.map((item) => item.id);
  const links = [];
  for (let index = 0; index < assignmentIds.length; index += 10) {
    const chunk = assignmentIds.slice(index, index + 10);
    const snapshot = await db.collection(`orgs/${ORG_ID}/teacherAssignmentClassLinks`).where("assignmentId", "in", chunk).get();
    links.push(...snapshot.docs.map(compactLink));
  }
  const relevantAssignments = assignments.filter((item) => item.schoolId === SCHOOL_ID && item.academicYearId === ACADEMIC_YEAR_ID && isCorners(item));
  const relevantLinks = links.filter((item) => relevantAssignments.some((assignment) => assignment.id === item.assignmentId));
  const cornersOfferings = offeringsSnap.docs.map(compactOffering).filter((item) => item.academicYearId === ACADEMIC_YEAR_ID && isCorners(item));
  const teacherMembership = teacherMemberships.find((item) => item.isActive) || null;
  const visibleClassIds = teacherMembership
    ? getVisibleClassesForActor({
      context: { actorPersonId: TEACHER_PERSON_ID, orgId: ORG_ID, memberships: [teacherMembership], teacherAssignments: assignments.map(({ raw, ...item }) => ({ ...raw, id: item.id })), teacherAssignmentClassLinks: links.map(({ raw, ...item }) => ({ ...raw, id: item.id })), operationalAssignments: operationsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })) },
      classes: classes.filter((item) => item.exists !== false).map(({ raw, ...item }) => ({ ...raw, id: item.id })),
      nowMs: NOW,
    }).map((item) => item.id)
    : [];
  const classCoverage = classes.map((classItem) => ({
    classId: classItem.id, exists: classItem.exists !== false, name: classItem.name || "", gradeId: classItem.gradeId || "",
    predictedVisibleByActorRule: visibleClassIds.includes(classItem.id),
    cornersOffering: cornersOfferings.find((offering) => offering.classId === classItem.id) || null,
    cornersAssignmentCoverage: relevantAssignments.map((assignment) => ({ assignmentId: assignment.id, activeAtNow: assignment.activeAtNow, reason: teacherClassReason(assignment, classItem, relevantLinks) })),
  }));
  const report = {
    generatedAt: new Date(NOW).toISOString(), readOnly: true,
    teacher: { personId: TEACHER_PERSON_ID, memberships: teacherMemberships, teacherAssignments: assignments, teacherAssignmentClassLinks: links, operationalAssignments: operationsSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, raw: plain(doc.data() || {}) })) },
    vicePrincipal: { personId: VICE_PRINCIPAL_PERSON_ID, memberships: vpMemberships },
    classCoverage,
    cornersOfferings,
  };
  if (!brief) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const withoutRaw = ({ raw, ...item }) => item;
  const activeCorners = assignments.filter((item) =>
    item.activeAtNow && item.schoolId === SCHOOL_ID && item.academicYearId === ACADEMIC_YEAR_ID && isCorners(item),
  ).map(withoutRaw);
  const compactMembership = (item) => ({ uid: item.uid, personId: item.personId, role: item.role, roleKey: item.roleKey, isActive: item.isActive, scopeType: item.scopeType, scopeId: item.scopeId, scopes: item.scopes, permissions: item.permissions });
  console.log(JSON.stringify({
    generatedAt: report.generatedAt, readOnly: true,
    teacher: {
      personId: TEACHER_PERSON_ID, memberships: teacherMemberships.map(compactMembership),
      activeCornersAssignments: activeCorners,
      activeCornersClassLinks: relevantLinks.map(withoutRaw),
      activeOperationalAssignmentCount: operationsSnap.docs.filter((doc) => active(doc.data() || {})).length,
    },
    vicePrincipal: { personId: VICE_PRINCIPAL_PERSON_ID, memberships: vpMemberships.map(compactMembership) },
    classCoverage: classCoverage.map((item) => ({
      classId: item.classId, exists: item.exists, name: item.name, gradeId: item.gradeId,
      predictedVisibleByActorRule: item.predictedVisibleByActorRule,
      cornersOffering: item.cornersOffering ? withoutRaw(item.cornersOffering) : null,
      cornersAssignmentCoverage: item.cornersAssignmentCoverage,
    })),
  }, null, 2));
}

main().catch((error) => { console.error(JSON.stringify({ readOnly: true, error: error.message || String(error), stack: error.stack || "" }, null, 2)); process.exitCode = 1; });
