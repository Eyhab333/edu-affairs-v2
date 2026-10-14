#!/usr/bin/env node
"use strict";

/** Read-only Quran central-measurement coverage preview for two primary schools. */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";
const SUBJECT_KEY = "QURAN";
const SCHOOL_IDS = ["mrb-boys-sayh", "mrb-boys-faleh"];
const CENTRAL_DEFINITIONS = {
  central1: {
    templateId: "primary-quran-central-1",
    assessmentKind: "PRIMARY_CENTRAL_MEASUREMENT_1",
    assessmentSlot: "PRIMARY_CENTRAL_1",
  },
  central2: {
    templateId: "primary-quran-central-2",
    assessmentKind: "PRIMARY_CENTRAL_MEASUREMENT_2",
    assessmentSlot: "PRIMARY_CENTRAL_2",
  },
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function timestamp(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value ? String(value) : "-";
}
function isActive(value) {
  const status = text(value?.status).toUpperCase();
  return value?.isArchived !== true && value?.isActive !== false && status !== "ARCHIVED" && status !== "INACTIVE" && status !== "ENDED";
}
function resolveServiceAccountPath() {
  const candidate = path.resolve(process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "service-account.json"));
  if (!fs.existsSync(candidate)) throw new Error(`Service account not found: ${candidate}`);
  return candidate;
}
function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = JSON.parse(fs.readFileSync(resolveServiceAccountPath(), "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}
function matchesCentral(batch, definition) {
  return batch.assessmentKind === definition.assessmentKind ||
    batch.assessmentSlot === definition.assessmentSlot ||
    batch.templateId === definition.templateId;
}
function stateFor(batches) {
  if (!batches.length) return "MISSING";
  if (batches.length > 1) return "MULTIPLE";
  const status = batches[0].status;
  return ["DRAFT", "IN_PROGRESS", "SUBMITTED"].includes(status) ? status : "UNEXPECTED";
}
function actionFor(state) {
  if (state === "MISSING") return "CREATE";
  if (state === "DRAFT") return "CONTINUE_EXISTING_DRAFT";
  if (state === "IN_PROGRESS") return "CONTINUE_EXISTING_BATCH";
  if (state === "SUBMITTED") return "NO_ACTION";
  return "MANUAL_REVIEW_BEFORE_ANY_WRITE";
}
function classTitle(classInfo) {
  return text(classInfo?.title) || text(classInfo?.displayName) || text(classInfo?.code) || classInfo?.id || "-";
}
function sortContexts(left, right) {
  return left.schoolId.localeCompare(right.schoolId) || text(left.gradeId).localeCompare(text(right.gradeId)) || left.classId.localeCompare(right.classId);
}

async function schoolData(db, schoolId) {
  const [classesSnapshot, offeringsSnapshot, assignmentsSnapshot, linksSnapshot, batchesSnapshot] = await Promise.all([
    db.collection(`orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes`).get(),
    db.collection(`orgs/${ORG_ID}/classSubjectOfferings`).where("schoolId", "==", schoolId).get(),
    db.collection(`orgs/${ORG_ID}/teacherAssignments`).where("schoolId", "==", schoolId).get(),
    db.collection(`orgs/${ORG_ID}/teacherAssignmentClassLinks`).where("schoolId", "==", schoolId).get(),
    db.collection(`orgs/${ORG_ID}/studentMeasurementBatches`).where("schoolId", "==", schoolId).get(),
  ]);
  return {
    schoolId,
    classes: classesSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter(isActive),
    offerings: offeringsSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => item.academicYearId === ACADEMIC_YEAR_ID && item.subjectKey === SUBJECT_KEY && isActive(item)),
    assignments: assignmentsSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => item.academicYearId === ACADEMIC_YEAR_ID && item.subjectKey === SUBJECT_KEY && isActive(item)),
    links: linksSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => item.academicYearId === ACADEMIC_YEAR_ID && isActive(item)),
    batches: batchesSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((item) => item.subjectKey === SUBJECT_KEY && item.academicYearId === ACADEMIC_YEAR_ID && item.termId === TERM_ID),
  };
}

function contextsForSchool(data) {
  const classById = new Map(data.classes.map((item) => [item.id, item]));
  const classIdsByAssignment = new Map();
  for (const assignment of data.assignments) {
    const ids = new Set();
    if (text(assignment.classId)) ids.add(assignment.classId);
    for (const link of data.links.filter((item) => item.teacherAssignmentId === assignment.id)) {
      if (text(link.classId)) ids.add(link.classId);
    }
    classIdsByAssignment.set(assignment.id, [...ids]);
  }
  const relevantClassIds = unique([
    ...data.offerings.map((offering) => text(offering.classId)),
    ...[...classIdsByAssignment.values()].flat(),
  ]).filter((classId) => classById.has(classId));

  return relevantClassIds.map((classId) => {
    const offerings = data.offerings.filter((item) => item.classId === classId);
    const assignments = data.assignments.filter((item) => classIdsByAssignment.get(item.id)?.includes(classId));
    const classInfo = classById.get(classId) || { id: classId };
    return {
      schoolId: data.schoolId,
      classId,
      classInfo,
      gradeId: text(classInfo.gradeId) || text(classInfo.grade) || "-",
      offerings,
      assignments,
    };
  });
}

function contextCheck(batch, context) {
  const assignmentIds = context.assignments.map((item) => item.id);
  const offeringIds = context.offerings.map((item) => item.id);
  const assignmentCheck = !text(batch.teacherAssignmentId)
    ? "MISSING_ASSIGNMENT"
    : assignmentIds.length > 1
      ? "AMBIGUOUS"
      : assignmentIds.includes(batch.teacherAssignmentId) ? "MATCH" : "MISMATCH";
  const offeringCheck = !text(batch.classSubjectOfferingId)
    ? "MISSING_OFFERING"
    : offeringIds.includes(batch.classSubjectOfferingId) ? "MATCH" : "MISMATCH";
  return { assignmentCheck, offeringCheck };
}

function batchRow(batch, context) {
  const check = contextCheck(batch, context);
  return {
    batchId: batch.id,
    status: batch.status ?? "-",
    templateId: batch.templateId ?? "-",
    assessmentKind: batch.assessmentKind ?? "-",
    assessmentSlot: batch.assessmentSlot ?? "-",
    teacherAssignmentId: batch.teacherAssignmentId ?? "-",
    classSubjectOfferingId: batch.classSubjectOfferingId ?? "-",
    assignmentContext: check.assignmentCheck,
    offeringContext: check.offeringCheck,
    createdByPersonId: batch.createdByPersonId ?? "-",
    createdAt: timestamp(batch.createdAt),
    updatedAt: timestamp(batch.updatedAt),
    submittedAt: timestamp(batch.submittedAt),
    targetCount: batch.targetCount ?? "-",
    completedCount: batch.completedCount ?? "-",
    studentRows: asArray(batch.studentRows).length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const schools = await Promise.all(SCHOOL_IDS.map((schoolId) => schoolData(db, schoolId)));
  const contexts = schools.flatMap(contextsForSchool).sort(sortContexts);
  const personIds = unique(contexts.flatMap((context) => context.assignments.map((item) => text(item.teacherPersonId))));
  const personSnapshots = personIds.length ? await db.getAll(...personIds.map((id) => db.doc(`orgs/${ORG_ID}/people/${id}`))) : [];
  const people = new Map(personSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() || {}]));

  const matrix = [];
  for (const context of contexts) {
    const school = schools.find((item) => item.schoolId === context.schoolId);
    const classBatches = school.batches.filter((batch) => batch.classId === context.classId);
    const central1 = classBatches.filter((batch) => matchesCentral(batch, CENTRAL_DEFINITIONS.central1));
    const central2 = classBatches.filter((batch) => matchesCentral(batch, CENTRAL_DEFINITIONS.central2));
    const central1State = stateFor(central1);
    const central2State = stateFor(central2);
    const assignmentNames = context.assignments.map((assignment) => people.get(text(assignment.teacherPersonId))?.displayName || "-");
    const ambiguity = context.assignments.length > 1 ? "AMBIGUOUS_ASSIGNMENTS" : context.offerings.length > 1 ? "AMBIGUOUS_OFFERINGS" : "OK";
    const centralBatches = [...central1, ...central2];
    const checks = centralBatches.map((batch) => contextCheck(batch, context));
    const notes = [
      context.assignments.length ? "" : "MISSING_ACTIVE_QURAN_ASSIGNMENT",
      context.offerings.length ? "" : "MISSING_ACTIVE_QURAN_OFFERING",
      checks.some((item) => item.assignmentCheck !== "MATCH") ? "CENTRAL_ASSIGNMENT_CONTEXT_ISSUE" : "",
      checks.some((item) => item.offeringCheck !== "MATCH") ? "CENTRAL_OFFERING_CONTEXT_ISSUE" : "",
    ].filter(Boolean).join(", ") || "-";
    matrix.push({
      schoolId: context.schoolId,
      classId: context.classId,
      classTitle: classTitle(context.classInfo),
      gradeId: context.gradeId,
      teacherName: assignmentNames.join(" | ") || "-",
      teacherPersonId: context.assignments.map((item) => item.teacherPersonId).join(" | ") || "-",
      teacherAssignmentId: context.assignments.map((item) => item.id).join(" | ") || "-",
      classSubjectOfferingId: context.offerings.map((item) => item.id).join(" | ") || "-",
      central1State,
      central1BatchId: central1.map((item) => item.id).join(" | ") || "-",
      central1Action: actionFor(central1State),
      central2State,
      central2BatchId: central2.map((item) => item.id).join(" | ") || "-",
      central2Action: actionFor(central2State),
      contextStatus: ambiguity,
      notes,
    });
    console.log(`\n${context.schoolId} / ${context.classId} — Quran context`);
    console.table(context.assignments.map((assignment) => ({
      teacherAssignmentId: assignment.id,
      teacherPersonId: assignment.teacherPersonId ?? "-",
      teacherDisplayName: people.get(text(assignment.teacherPersonId))?.displayName ?? "-",
      assignmentSubjectKey: assignment.subjectKey ?? "-",
      status: assignment.status ?? "-",
      isActive: assignment.isActive ?? "-",
    })));
    console.table(context.offerings.map((offering) => ({
      classSubjectOfferingId: offering.id,
      offeringSubjectKey: offering.subjectKey ?? "-",
      displayName: offering.displayName ?? offering.subjectTitle ?? "-",
    })));
    console.log("CENTRAL 1"); console.table(central1.map((batch) => batchRow(batch, context)));
    console.log("CENTRAL 2"); console.table(central2.map((batch) => batchRow(batch, context)));
  }

  console.log("\nQURAN CENTRAL COVERAGE MATRIX");
  console.table(matrix);
  console.log("\nSCHOOL SUMMARY");
  console.table(SCHOOL_IDS.map((schoolId) => {
    const rows = matrix.filter((row) => row.schoolId === schoolId);
    const count = (field, values) => rows.filter((row) => values.includes(row[field])).length;
    return {
      schoolId,
      relevantQuranClasses: rows.length,
      central1Submitted: count("central1State", ["SUBMITTED"]),
      central1Missing: count("central1State", ["MISSING"]),
      central1DraftOrInProgress: count("central1State", ["DRAFT", "IN_PROGRESS"]),
      central2Submitted: count("central2State", ["SUBMITTED"]),
      central2Missing: count("central2State", ["MISSING"]),
      central2DraftOrInProgress: count("central2State", ["DRAFT", "IN_PROGRESS"]),
      duplicateOrAmbiguousClasses: rows.filter((row) => ["MULTIPLE", "UNEXPECTED"].includes(row.central1State) || ["MULTIPLE", "UNEXPECTED"].includes(row.central2State) || row.contextStatus !== "OK").length,
    };
  }));
}

main().catch((error) => {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
});
