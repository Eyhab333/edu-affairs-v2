#!/usr/bin/env node
"use strict";

/**
 * Read-only diagnostic for Quran visibility in the primary central summary.
 * It uses Firestore reads only and has no apply or write path.
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";
const SCHOOL_IDS = ["mrb-boys-sayh", "mrb-boys-faleh"];
const CENTRAL_1 = "PRIMARY_CENTRAL_MEASUREMENT_1";
const CENTRAL_2 = "PRIMARY_CENTRAL_MEASUREMENT_2";
const CENTRAL_KINDS = new Set([CENTRAL_1, CENTRAL_2]);
const EXPECTED_TEMPLATE_IDS = [
  "primary-quran-central-1",
  "primary-quran-central-2",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return text(value).toLowerCase();
}

function formatTimestamp(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value ? String(value) : "-";
}

function resolveServiceAccountPath() {
  const candidate = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "service-account.json"),
  );
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Service account not found: ${candidate}. Set SERVICE_ACCOUNT_PATH or add service-account.json at the repository root.`,
    );
  }
  return candidate;
}

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccount = JSON.parse(
    fs.readFileSync(resolveServiceAccountPath(), "utf8"),
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function subjectIsQuran(value) {
  const normalized = lower(value);
  return (
    normalized.includes("quran") ||
    normalized.includes("tajweed") ||
    normalized.includes("islamic") ||
    /قرآن|القران|تجويد|إسلام/.test(text(value))
  );
}

function isQuranCandidate(batch, quranOfferingIds) {
  return (
    subjectIsQuran(batch.subjectKey) ||
    lower(batch.templateId).includes("quran") ||
    subjectIsQuran(batch.templateTitle) ||
    quranOfferingIds.has(text(batch.classSubjectOfferingId))
  );
}

function isActiveClass(classInfo) {
  const status = text(classInfo.status).toUpperCase();
  return classInfo.isArchived !== true && status !== "ARCHIVED" && status !== "INACTIVE";
}

function centralEligibility(batch) {
  const passesStatus = batch.status === "SUBMITTED";
  const passesAcademicYear = batch.academicYearId === ACADEMIC_YEAR_ID;
  const passesTerm = batch.termId === TERM_ID;
  const passesAssessmentKind = CENTRAL_KINDS.has(batch.assessmentKind);
  const passesCompensation = batch.isCompensationBatch !== true;
  const passesCentralSummary =
    passesStatus &&
    passesAcademicYear &&
    passesTerm &&
    passesAssessmentKind &&
    passesCompensation;
  let exclusionReason = "ELIGIBLE";
  if (!passesStatus) exclusionReason = "NOT_SUBMITTED";
  else if (!passesAcademicYear) exclusionReason = "WRONG_YEAR";
  else if (!passesTerm) exclusionReason = "WRONG_TERM";
  else if (!batch.assessmentKind) exclusionReason = "MISSING_ASSESSMENT_KIND";
  else if (!passesAssessmentKind) exclusionReason = "WRONG_ASSESSMENT_KIND";
  else if (!passesCompensation) exclusionReason = "COMPENSATION_ONLY";

  return {
    passesStatus,
    passesAcademicYear,
    passesTerm,
    passesAssessmentKind,
    passesCompensation,
    passesCentralSummary,
    exclusionReason,
  };
}

function batchDetails(batch, eligibility) {
  return {
    batchId: batch.id,
    schoolId: batch.schoolId ?? "-",
    academicYearId: batch.academicYearId ?? "-",
    termId: batch.termId ?? "-",
    gradeId: batch.gradeId ?? "-",
    classId: batch.classId ?? "-",
    classSubjectOfferingId: batch.classSubjectOfferingId ?? "-",
    subjectKey: batch.subjectKey ?? "-",
    templateId: batch.templateId ?? "-",
    templateTitle: batch.templateTitle ?? "-",
    batchKind: batch.batchKind ?? batch.kind ?? "-",
    status: batch.status ?? "-",
    assessmentKind: batch.assessmentKind ?? "-",
    assessmentSlot: batch.assessmentSlot ?? "-",
    teacherAssignmentId: batch.teacherAssignmentId ?? "-",
    createdByPersonId: batch.createdByPersonId ?? "-",
    createdByRoleKey: batch.createdByRoleKey ?? "-",
    targetCount: batch.targetCount ?? "-",
    completedCount: batch.completedCount ?? "-",
    missingCount: batch.missingCount ?? "-",
    isCompensationBatch: batch.isCompensationBatch ?? "-",
    originalBatchId: batch.originalBatchId ?? "-",
    createdAt: formatTimestamp(batch.createdAt),
    updatedAt: formatTimestamp(batch.updatedAt),
    submittedAt: formatTimestamp(batch.submittedAt),
    ...(eligibility || {}),
  };
}

function classCoverage(schoolId, classes, quranBatches) {
  const activeClasses = classes.filter(isActiveClass);
  const classIds = activeClasses.map((classInfo) => classInfo.id);
  const idsFor = (predicate) =>
    [...new Set(quranBatches.filter(predicate).map((batch) => batch.classId))]
      .filter((classId) => classIds.includes(classId))
      .sort();

  return {
    schoolId,
    activePrimaryClasses: classIds.join(", ") || "-",
    classesWithAnyQuranBatch: idsFor(() => true).join(", ") || "-",
    classesWithQuranCentral1: idsFor(
      (batch) => batch.assessmentKind === CENTRAL_1,
    ).join(", ") || "-",
    classesWithQuranCentral2: idsFor(
      (batch) => batch.assessmentKind === CENTRAL_2,
    ).join(", ") || "-",
    classesWithEligibleSubmittedQuranCentral: idsFor(
      (batch) => centralEligibility(batch).passesCentralSummary,
    ).join(", ") || "-",
    classesWithNoQuranBatch: classIds
      .filter((classId) => !quranBatches.some((batch) => batch.classId === classId))
      .join(", ") || "-",
  };
}

async function fetchClasses(db, schoolId) {
  const snapshot = await db
    .collection(`orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes`)
    .get();
  return snapshot.docs.map((document) => ({ id: document.id, ...(document.data() || {}) }));
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const batchesBySchool = await Promise.all(
    SCHOOL_IDS.map(async (schoolId) => {
      const snapshot = await db
        .collection(`orgs/${ORG_ID}/studentMeasurementBatches`)
        .where("schoolId", "==", schoolId)
        .get();
      return snapshot.docs.map((document) => ({ id: document.id, ...(document.data() || {}) }));
    }),
  );
  const offeringsBySchool = await Promise.all(
    SCHOOL_IDS.map(async (schoolId) => {
      const snapshot = await db
        .collection(`orgs/${ORG_ID}/classSubjectOfferings`)
        .where("schoolId", "==", schoolId)
        .get();
      return snapshot.docs
        .map((document) => ({ id: document.id, ...(document.data() || {}) }))
        .filter((offering) => offering.academicYearId === ACADEMIC_YEAR_ID);
    }),
  );
  const classesBySchool = await Promise.all(SCHOOL_IDS.map((schoolId) => fetchClasses(db, schoolId)));
  const [templateSnapshots] = await Promise.all([
    db.getAll(
      ...EXPECTED_TEMPLATE_IDS.map((templateId) =>
        db.doc(`orgs/${ORG_ID}/studentAssessmentTemplates/${templateId}`),
      ),
    ),
  ]);

  const quranOfferings = offeringsBySchool.flat().filter((offering) =>
    subjectIsQuran(offering.subjectKey) ||
    subjectIsQuran(offering.subjectTitle) ||
    subjectIsQuran(offering.displayName),
  );
  const quranOfferingIds = new Set(quranOfferings.map((offering) => offering.id));
  const allBatches = batchesBySchool.flat();
  const quranBatches = allBatches.filter((batch) =>
    isQuranCandidate(batch, quranOfferingIds),
  );
  const quranOfferingById = new Map(quranOfferings.map((offering) => [offering.id, offering]));
  const assignmentIds = [...new Set(quranBatches.map((batch) => text(batch.teacherAssignmentId)).filter(Boolean))];
  const assignmentSnapshots = assignmentIds.length
    ? await db.getAll(
        ...assignmentIds.map((assignmentId) =>
          db.doc(`orgs/${ORG_ID}/teacherAssignments/${assignmentId}`),
        ),
      )
    : [];
  const assignments = assignmentSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }));
  const personIds = [...new Set(assignments.map((assignment) => text(assignment.teacherPersonId)).filter(Boolean))];
  const personSnapshots = personIds.length
    ? await db.getAll(
        ...personIds.map((personId) => db.doc(`orgs/${ORG_ID}/people/${personId}`)),
      )
    : [];
  const peopleById = new Map(
    personSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, snapshot.data() || {}]),
  );

  console.log("\nQURAN-RELATED BATCHES");
  for (const schoolId of SCHOOL_IDS) {
    const schoolQuranBatches = quranBatches.filter((batch) => batch.schoolId === schoolId);
    console.log(`\n${schoolId}: ${schoolQuranBatches.length} Quran-related batches`);
    console.table(schoolQuranBatches.map((batch) => batchDetails(batch, centralEligibility(batch))));
  }

  console.log("\nCENTRAL-SUMMARY ELIGIBILITY");
  console.table(
    quranBatches.map((batch) => ({
      batchId: batch.id,
      schoolId: batch.schoolId,
      classId: batch.classId,
      subjectKey: batch.subjectKey ?? "-",
      status: batch.status ?? "-",
      termId: batch.termId ?? "-",
      assessmentKind: batch.assessmentKind ?? "-",
      assessmentSlot: batch.assessmentSlot ?? "-",
      templateId: batch.templateId ?? "-",
      centralSummaryEligible: centralEligibility(batch).passesCentralSummary ? "YES" : "NO",
      exclusionReason: centralEligibility(batch).exclusionReason,
    })),
  );

  console.log("\nEXPECTED QURAN TEMPLATES");
  console.table(
    templateSnapshots.map((snapshot, index) => {
      const template = snapshot.exists ? snapshot.data() || {} : {};
      return {
        id: EXPECTED_TEMPLATE_IDS[index],
        exists: snapshot.exists ? "YES" : "NO",
        title: template.title ?? "-",
        subjectKey: template.subjectKey ?? "-",
        schoolType: template.schoolType ?? "-",
        schoolId: template.schoolId ?? "-",
        academicYearId: template.academicYearId ?? "-",
        kind: template.kind ?? "-",
        assessmentSlot: template.assessmentSlot ?? "-",
        evaluatorRoleKey: template.evaluatorRoleKey ?? "-",
        applicableGradeIds: asArray(template.applicableGradeIds).join(", ") || "-",
        applicableTermIds: asArray(template.applicableTermIds).join(", ") || "-",
        isActive: template.isActive ?? "-",
        status: template.status ?? "-",
        maxScore: template.maxScore ?? "-",
      };
    }),
  );

  console.log("\nQURAN CLASS SUBJECT OFFERINGS");
  console.table(
    quranOfferings.map((offering) => ({
      offeringId: offering.id,
      schoolId: offering.schoolId ?? "-",
      academicYearId: offering.academicYearId ?? "-",
      classId: offering.classId ?? "-",
      subjectKey: offering.subjectKey ?? "-",
      displayName: offering.displayName ?? offering.subjectTitle ?? "-",
    })),
  );

  console.log("\nQURAN BATCH OFFERING REFERENCES");
  console.table(
    quranBatches.map((batch) => {
      const offering = quranOfferingById.get(text(batch.classSubjectOfferingId));
      return {
        batchId: batch.id,
        offeringId: batch.classSubjectOfferingId ?? "-",
        offeringExists: offering ? "YES" : "NO",
        contextMatches:
          offering &&
          offering.schoolId === batch.schoolId &&
          offering.academicYearId === batch.academicYearId &&
          offering.classId === batch.classId
            ? "YES"
            : "NO",
      };
    }),
  );

  console.log("\nQURAN TEACHER ASSIGNMENTS");
  console.table(
    assignments.map((assignment) => ({
      assignmentId: assignment.id,
      teacherPersonId: assignment.teacherPersonId ?? "-",
      teacherName: peopleById.get(text(assignment.teacherPersonId))?.displayName ?? "-",
      schoolId: assignment.schoolId ?? "-",
      academicYearId: assignment.academicYearId ?? "-",
      classId: assignment.classId ?? "-",
      subjectKey: assignment.subjectKey ?? "-",
      status: assignment.status ?? "-",
      isActive: assignment.isActive ?? "-",
    })),
  );

  console.log("\nWORKING ARABIC / MATH CENTRAL BATCH SAMPLES");
  console.table(
    SCHOOL_IDS.flatMap((schoolId) =>
      ["ARABIC", "MATH"].flatMap((subjectKey) => {
        const sample = allBatches.find(
          (batch) =>
            batch.schoolId === schoolId &&
            batch.subjectKey === subjectKey &&
            centralEligibility(batch).passesCentralSummary,
        );
        return sample
          ? [{
              schoolId,
              batchId: sample.id,
              subjectKey: sample.subjectKey,
              templateId: sample.templateId ?? "-",
              status: sample.status,
              academicYearId: sample.academicYearId ?? "-",
              termId: sample.termId ?? "-",
              assessmentKind: sample.assessmentKind ?? "-",
              assessmentSlot: sample.assessmentSlot ?? "-",
              classId: sample.classId ?? "-",
              classSubjectOfferingId: sample.classSubjectOfferingId ?? "-",
              teacherAssignmentId: sample.teacherAssignmentId ?? "-",
            }]
          : [{ schoolId, subjectKey, note: "NO_ELIGIBLE_SAMPLE" }];
      }),
    ),
  );

  console.log("\nCLASS COVERAGE");
  console.table(
    SCHOOL_IDS.map((schoolId, index) =>
      classCoverage(
        schoolId,
        classesBySchool[index],
        quranBatches.filter((batch) => batch.schoolId === schoolId),
      ),
    ),
  );

  console.log("\nSUBJECT KEY ALIASES FOUND IN QURAN CANDIDATES");
  console.table(
    [...new Set(quranBatches.map((batch) => batch.subjectKey ?? "-"))]
      .sort()
      .map((subjectKey) => ({ subjectKey })),
  );
}

main().catch((error) => {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
});
