#!/usr/bin/env node
/*
 * Read-only diagnostic for KG measurement draft auto-reopen context.
 *
 * Usage:
 *   node scripts/kindergarten/inspect-kg-draft-reopen-context.cjs
 *   node scripts/kindergarten/inspect-kg-draft-reopen-context.cjs --serviceAccount=path/to/service-account.json
 *
 * Firestore is never written. The only optional local write is the JSON report
 * alongside this script.
 */

/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";
const PERSON_IDS = ["p-a-s-alfrhood", "p-n-alkhunini"];
const REPORT_PATH = path.resolve(
  __dirname,
  "inspect-kg-draft-reopen-context-report.json",
);
const READ_CHUNK_SIZE = 10;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value) {
  return text(value).toUpperCase();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function timestamp(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function pick(data, fields) {
  return Object.fromEntries(fields.map((field) => [field, data[field]]));
}

function reportValue(value) {
  if (Array.isArray(value)) return value.map(reportValue);
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return timestamp(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reportValue(item)]),
    );
  }
  return value;
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function resolveServiceAccountPath() {
  const repoRoot = path.resolve(__dirname, "../..");
  const candidates = [
    arg("serviceAccount"),
    process.env.SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(repoRoot, "scripts/service-account.json"),
    path.resolve(repoRoot, "service-account.json"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(path.resolve(candidate))) || "";
}

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = resolveServiceAccountPath();
  if (!serviceAccountPath) {
    throw new Error(
      "No service account found. Provide --serviceAccount=... or set SERVICE_ACCOUNT_PATH; scripts/service-account.json is also supported.",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(path.resolve(serviceAccountPath), "utf8"),
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function isCurrentActive(data) {
  const status = normalized(data.status);
  if (["INACTIVE", "ARCHIVED", "CANCELLED", "ENDED"].includes(status)) {
    return false;
  }
  if (data.isActive === false || data.active === false) return false;
  if (text(data.academicYearId) !== ACADEMIC_YEAR_ID) return false;

  const now = Date.now();
  const startAt = typeof data.startAt === "number" ? data.startAt : null;
  const endAt = typeof data.endAt === "number" ? data.endAt : null;
  return !(startAt !== null && startAt > now) && !(endAt !== null && endAt < now);
}

function subjectMatches(left, right) {
  const first = normalized(left);
  const second = normalized(right);
  return !first || !second || first === second;
}

function uiContextForClass(classId, schoolId) {
  // apps/web-staff/app/staff/classes/[classId]/measurements/page.tsx currently
  // calls buildClassQuery(), which contains only schoolId and academicYearId.
  return {
    classId,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    classSubjectOfferingId: "",
    teacherAssignmentId: "",
    subjectKey: "",
  };
}

async function queryCollection(collectionName, field, value) {
  const snapshot = await admin
    .firestore()
    .collection(`orgs/${ORG_ID}/${collectionName}`)
    .where(field, "==", value)
    .get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

async function queryLinks(assignmentIds) {
  if (!assignmentIds.length) return [];
  const links = [];
  for (const assignmentIdChunk of chunks(assignmentIds, READ_CHUNK_SIZE)) {
    const snapshot = await admin
      .firestore()
      .collection(`orgs/${ORG_ID}/teacherAssignmentClassLinks`)
      .where("assignmentId", "in", assignmentIdChunk)
      .get();
    snapshot.docs.forEach((document) => {
      links.push({ id: document.id, ...document.data() });
    });
  }
  return links;
}

async function queryOfferings(schoolIds) {
  const offerings = [];
  for (const schoolId of schoolIds) {
    const snapshot = await admin
      .firestore()
      .collection(`orgs/${ORG_ID}/classSubjectOfferings`)
      .where("schoolId", "==", schoolId)
      .get();
    snapshot.docs.forEach((document) => {
      offerings.push({ id: document.id, ...document.data() });
    });
  }
  return offerings;
}

async function queryRelatedBatches(personId, assignmentIds) {
  const batchById = new Map();
  const add = (signal, rows) => {
    rows.forEach((row) => {
      const existing = batchById.get(row.id) || { ...row, matchedSignals: [] };
      existing.matchedSignals = unique([...existing.matchedSignals, signal]);
      batchById.set(row.id, existing);
    });
  };

  for (const assignmentIdChunk of chunks(assignmentIds, READ_CHUNK_SIZE)) {
    add(
      "teacherAssignmentId",
      await (async () => {
        const snapshot = await admin
          .firestore()
          .collection(`orgs/${ORG_ID}/studentMeasurementBatches`)
          .where("teacherAssignmentId", "in", assignmentIdChunk)
          .get();
        return snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));
      })(),
    );
  }

  for (const field of ["createdByPersonId", "recordedByPersonId"]) {
    add(field, await queryCollection("studentMeasurementBatches", field, personId));
  }

  return [...batchById.values()].filter(
    (batch) =>
      text(batch.academicYearId) === ACADEMIC_YEAR_ID &&
      text(batch.termId) === TERM_ID,
  );
}

async function findLinkedUids(personId) {
  const snapshot = await admin
    .firestore()
    .collectionGroup("orgMemberships")
    .where("orgId", "==", ORG_ID)
    .where("personId", "==", personId)
    .get();

  return unique(
    snapshot.docs.map((document) => document.ref.parent.parent?.id || ""),
  );
}

function assignmentRow(assignment) {
  return {
    assignmentId: assignment.id,
    schoolId: text(assignment.schoolId),
    academicYearId: text(assignment.academicYearId),
    subjectKey: text(assignment.subjectKey),
    subjectId: text(assignment.subjectId),
    classId: text(assignment.classId),
    classSubjectOfferingId: text(assignment.classSubjectOfferingId),
    status: text(assignment.status),
    isActive: assignment.isActive ?? assignment.active ?? null,
    startAt: timestamp(assignment.startAt),
    endAt: timestamp(assignment.endAt),
    currentActive: isCurrentActive(assignment) ? "YES" : "NO",
  };
}

function linkRow(link) {
  return {
    linkId: link.id,
    assignmentId: text(link.assignmentId),
    schoolId: text(link.schoolId),
    academicYearId: text(link.academicYearId),
    classId: text(link.classId),
    classSubjectOfferingId: text(link.classSubjectOfferingId),
    subjectKey: text(link.subjectKey),
    subjectId: text(link.subjectId),
    status: text(link.status),
    isActive: link.isActive ?? link.active ?? null,
    startAt: timestamp(link.startAt),
    endAt: timestamp(link.endAt),
  };
}

function offeringRow(offering) {
  return {
    offeringId: offering.id,
    schoolId: text(offering.schoolId),
    academicYearId: text(offering.academicYearId),
    classId: text(offering.classId),
    subjectKey: text(offering.subjectKey),
    subjectId: text(offering.subjectId),
    subjectTitle:
      text(offering.displayName) ||
      text(offering.subjectTitle) ||
      text(offering.subjectTitleSnapshot) ||
      text(offering.shortLabel),
    status: text(offering.status),
    isArchived: offering.isArchived === true,
  };
}

function draftRow(batch) {
  return {
    batchId: batch.id,
    status: text(batch.status),
    schoolId: text(batch.schoolId),
    academicYearId: text(batch.academicYearId),
    termId: text(batch.termId),
    classId: text(batch.classId),
    subjectKey: text(batch.subjectKey),
    templateId: text(batch.templateId),
    templateTitle: text(batch.templateTitle),
    classSubjectOfferingId: text(batch.classSubjectOfferingId),
    teacherAssignmentId: text(batch.teacherAssignmentId),
    createdByPersonId: text(batch.createdByPersonId),
    recordedByPersonId: text(batch.recordedByPersonId),
    createdAt: timestamp(batch.createdAt),
    updatedAt: timestamp(batch.updatedAt),
    matchedSignals: (batch.matchedSignals || []).join(", "),
  };
}

function currentContextForDraft({ draft, currentAssignments, currentLinks, offerings }) {
  const matchingAssignments = currentAssignments.filter((assignment) => {
    if (text(assignment.schoolId) !== text(draft.schoolId)) return false;
    if (text(assignment.academicYearId) !== ACADEMIC_YEAR_ID) return false;
    if (text(assignment.classId) && text(assignment.classId) !== text(draft.classId)) {
      return false;
    }
    return subjectMatches(draft.subjectKey, assignment.subjectKey || assignment.subjectId);
  });
  const matchingLinks = currentLinks.filter((link) => {
    const assignment = currentAssignments.find(
      (item) => item.id === text(link.assignmentId),
    );
    return (
      !!assignment &&
      text(link.schoolId) === text(draft.schoolId) &&
      text(link.academicYearId) === ACADEMIC_YEAR_ID &&
      text(link.classId) === text(draft.classId) &&
      subjectMatches(
        draft.subjectKey,
        text(link.subjectKey) || text(link.subjectId) || assignment.subjectKey || assignment.subjectId,
      )
    );
  });
  const currentTeacherAssignmentIds = unique([
    ...matchingAssignments.map((item) => item.id),
    ...matchingLinks.map((item) => text(item.assignmentId)),
  ]);
  const currentClassSubjectOfferingIds = unique([
    ...matchingAssignments.map((item) => text(item.classSubjectOfferingId)),
    ...matchingLinks.map((item) => text(item.classSubjectOfferingId)),
    ...offerings
      .filter(
        (offering) =>
          text(offering.schoolId) === text(draft.schoolId) &&
          text(offering.academicYearId) === ACADEMIC_YEAR_ID &&
          text(offering.classId) === text(draft.classId) &&
          offering.isArchived !== true &&
          subjectMatches(draft.subjectKey, offering.subjectKey || offering.subjectId),
      )
      .map((item) => item.id),
  ]);
  const currentSchoolIds = unique([
    ...matchingAssignments.map((item) => text(item.schoolId)),
    ...matchingLinks.map((item) => text(item.schoolId)),
  ]);

  return {
    currentTeacherAssignmentIds,
    currentClassSubjectOfferingIds,
    currentSchoolIds,
  };
}

function likelyReason(comparison) {
  if (!comparison.academicYearMatch) return "ACADEMIC_YEAR_MISMATCH";
  if (!comparison.termMatch) return "TERM_MISMATCH";
  if (
    !comparison.teacherAssignmentMatch &&
    !comparison.classSubjectOfferingMatch
  ) {
    return "BOTH_ASSIGNMENT_AND_OFFERING_CHANGED";
  }
  if (!comparison.teacherAssignmentMatch) {
    return "TEACHER_ASSIGNMENT_ID_CHANGED";
  }
  if (!comparison.classSubjectOfferingMatch) {
    return "CLASS_SUBJECT_OFFERING_ID_CHANGED";
  }
  if (
    !comparison.currentUiTeacherAssignmentMatch ||
    !comparison.currentUiClassSubjectOfferingMatch
  ) {
    return "CURRENT_UI_OMITS_REQUIRED_CONTEXT_IDS";
  }
  if (comparison.currentTeacherAssignmentIds.length > 1) {
    return "AMBIGUOUS_MULTIPLE_CURRENT_ASSIGNMENTS";
  }
  return "UNKNOWN";
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log("(none)");
    return;
  }
  console.table(rows);
}

async function inspectTeacher(personId) {
  const db = admin.firestore();
  const [personSnapshot, linkedUids, assignments] = await Promise.all([
    db.doc(`orgs/${ORG_ID}/people/${personId}`).get(),
    findLinkedUids(personId),
    queryCollection("teacherAssignments", "teacherPersonId", personId),
  ]);
  const person = personSnapshot.exists ? personSnapshot.data() || {} : {};
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const links = await queryLinks(assignmentIds);
  const currentAssignments = assignments.filter(isCurrentActive);
  const currentLinks = links.filter(
    (link) =>
      currentAssignments.some((assignment) => assignment.id === text(link.assignmentId)) &&
      text(link.academicYearId) === ACADEMIC_YEAR_ID &&
      link.isActive !== false &&
      normalized(link.status) !== "INACTIVE" &&
      normalized(link.status) !== "ARCHIVED",
  );
  const schoolIds = unique([
    ...assignments.map((assignment) => text(assignment.schoolId)),
    ...links.map((link) => text(link.schoolId)),
  ]);
  const [offerings, relatedBatches] = await Promise.all([
    queryOfferings(schoolIds),
    queryRelatedBatches(personId, assignmentIds),
  ]);
  const relevantClassIds = new Set(
    [
      ...currentAssignments.map((assignment) => text(assignment.classId)),
      ...currentLinks.map((link) => text(link.classId)),
    ].filter(Boolean),
  );
  const currentOfferings = offerings.filter(
    (offering) =>
      text(offering.academicYearId) === ACADEMIC_YEAR_ID &&
      (relevantClassIds.size === 0 || relevantClassIds.has(text(offering.classId))),
  );
  const drafts = relatedBatches
    .filter((batch) => normalized(batch.status) === "DRAFT")
    .sort((left, right) => {
      const leftAt = left.updatedAt?.toMillis?.() || left.createdAt?.toMillis?.() || 0;
      const rightAt = right.updatedAt?.toMillis?.() || right.createdAt?.toMillis?.() || 0;
      return rightAt - leftAt;
    });
  const comparisons = drafts.map((draft) => {
    const context = currentContextForDraft({
      draft,
      currentAssignments,
      currentLinks,
      offerings: currentOfferings,
    });
    const ui = uiContextForClass(text(draft.classId), text(draft.schoolId));
    const comparison = {
      personId,
      batchId: draft.id,
      classId: text(draft.classId),
      templateId: text(draft.templateId),
      storedTeacherAssignmentId: text(draft.teacherAssignmentId),
      currentTeacherAssignmentIds: context.currentTeacherAssignmentIds,
      teacherAssignmentMatch:
        context.currentTeacherAssignmentIds.includes(text(draft.teacherAssignmentId))
          ? "YES"
          : "NO",
      storedClassSubjectOfferingId: text(draft.classSubjectOfferingId),
      currentClassSubjectOfferingIds: context.currentClassSubjectOfferingIds,
      classSubjectOfferingMatch:
        context.currentClassSubjectOfferingIds.includes(
          text(draft.classSubjectOfferingId),
        )
          ? "YES"
          : "NO",
      storedSchoolId: text(draft.schoolId),
      currentSchoolIds: context.currentSchoolIds,
      schoolMatch: context.currentSchoolIds.includes(text(draft.schoolId)) ? "YES" : "NO",
      storedAcademicYearId: text(draft.academicYearId),
      expectedAcademicYearId: ACADEMIC_YEAR_ID,
      academicYearMatch:
        text(draft.academicYearId) === ACADEMIC_YEAR_ID ? "YES" : "NO",
      storedTermId: text(draft.termId),
      expectedTermId: TERM_ID,
      termMatch: text(draft.termId) === TERM_ID ? "YES" : "NO",
      currentUiTeacherAssignmentId: ui.teacherAssignmentId || "(omitted)",
      currentUiClassSubjectOfferingId:
        ui.classSubjectOfferingId || "(omitted)",
      currentUiSubjectKey: ui.subjectKey || "(omitted)",
      currentUiTeacherAssignmentMatch:
        text(draft.teacherAssignmentId) === ui.teacherAssignmentId ? "YES" : "NO",
      currentUiClassSubjectOfferingMatch:
        text(draft.classSubjectOfferingId) === ui.classSubjectOfferingId
          ? "YES"
          : "NO",
    };
    return {
      ...comparison,
      likelyAutoReopenFailureReason: likelyReason({
        ...comparison,
        academicYearMatch: comparison.academicYearMatch === "YES",
        termMatch: comparison.termMatch === "YES",
        teacherAssignmentMatch: comparison.teacherAssignmentMatch === "YES",
        classSubjectOfferingMatch:
          comparison.classSubjectOfferingMatch === "YES",
        currentUiTeacherAssignmentMatch:
          comparison.currentUiTeacherAssignmentMatch === "YES",
        currentUiClassSubjectOfferingMatch:
          comparison.currentUiClassSubjectOfferingMatch === "YES",
      }),
    };
  });
  const nonDraftRelated = relatedBatches.filter(
    (batch) => normalized(batch.status) !== "DRAFT",
  );
  const rootCause = comparisons.length
    ? unique(comparisons.map((item) => item.likelyAutoReopenFailureReason))
    : nonDraftRelated.length
      ? ["DRAFT_IS_NOT_DRAFT_ANYMORE"]
      : ["NO_RELEVANT_DRAFT_FOUND"];

  console.log("\n========================================");
  console.log(`Teacher: ${personId}`);
  console.log("========================================");
  console.table([
    {
      personId,
      displayName: text(person.displayName) || "(not found)",
      linkedUid: linkedUids.join(", ") || "(not discovered)",
    },
  ]);
  printTable("CURRENT ASSIGNMENTS", assignments.map(assignmentRow));
  printTable("TEACHER ASSIGNMENT CLASS LINKS", links.map(linkRow));
  printTable("CURRENT CLASS/OFFERING CONTEXT", currentOfferings.map(offeringRow));
  printTable("DRAFT BATCHES", drafts.map(draftRow));
  printTable(
    "COMPARISON",
    comparisons.map((comparison) => ({
      ...comparison,
      currentTeacherAssignmentIds: comparison.currentTeacherAssignmentIds.join(", ") || "(none)",
      currentClassSubjectOfferingIds:
        comparison.currentClassSubjectOfferingIds.join(", ") || "(none)",
      currentSchoolIds: comparison.currentSchoolIds.join(", ") || "(none)",
    })),
  );
  console.log(`\nLIKELY ROOT CAUSE: ${rootCause.join(", ")}`);

  return {
    person: {
      personId,
      displayName: text(person.displayName) || null,
      linkedUids,
    },
    currentAssignments: assignments.map(assignmentRow),
    currentLinks: links.map(linkRow),
    currentOfferings: currentOfferings.map(offeringRow),
    draftBatches: drafts.map(draftRow),
    comparisons,
    likelyRootCause: rootCause,
  };
}

async function main() {
  initAdmin();
  console.log("READ-ONLY diagnostic: no Firestore writes are performed.");
  console.log(
    `UI link context today: schoolId + academicYearId only; classSubjectOfferingId, teacherAssignmentId, and subjectKey are omitted by the class measurements page.`,
  );

  const teachers = [];
  for (const personId of PERSON_IDS) {
    teachers.push(await inspectTeacher(personId));
  }

  const report = reportValue({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    orgId: ORG_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    currentUiQueryParamSource: {
      file: "apps/web-staff/app/staff/classes/[classId]/measurements/page.tsx",
      function: "buildBatchNewHref -> buildClassQuery",
      sent: ["schoolId", "academicYearId"],
      omitted: ["classSubjectOfferingId", "teacherAssignmentId", "subjectKey"],
    },
    teachers,
  });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nWrote local diagnostic report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error("Diagnostic failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});