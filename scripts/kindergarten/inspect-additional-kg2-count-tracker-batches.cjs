#!/usr/bin/env node
"use strict";

/**
 * Read-only inspection of batches other than the three known KG2 Count &
 * Calculate tracker repair targets. This script uses Firestore reads only.
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const TEMPLATE_ID = "kg2-count-and-calculate-ay1448-term1-tracker";
const BATCH_COLLECTION = "studentMeasurementBatches";
const TRACKER_ENTRY_COLLECTION = "studentTrackerEntries";
const KNOWN_BATCH_IDS = new Set([
  "vfmqmS5dA6sBq0OWnDz0",
  "PB9TMZv35LXr7TNmGDGP",
  "HVQD5AbgMsdjXL25fNOu",
]);

const CORRECT_15_TITLES = [
  "العدد 1 — الأسبوع الثالث",
  "العدد 2 — الأسبوع الرابع",
  "العدد 3 — الأسبوع الخامس",
  "العدد 4 — الأسبوع السادس",
  "العدد 5 — الأسبوع السابع",
  "العدد 6 — الأسبوع الثامن",
  "العدد 7 — الأسبوع التاسع",
  "العدد 8 — الأسبوع العاشر",
  "العدد 9 — الأسبوع الحادي عشر",
  "العدد 10 — الأسبوع الثاني عشر",
  "العدد 11 — الأسبوع الثالث عشر",
  "العدد 12 — الأسبوع الرابع عشر",
  "العدد 13 — الأسبوع الخامس عشر",
  "العدد 14 — الأسبوع السادس عشر",
  "العدد 15 — الأسبوع السابع عشر",
];

const OLD_20_TITLES = [
  "العدد 1 — الأسبوع الثالث",
  "العدد 2 — الأسبوع الرابع",
  "العدد 3 — الأسبوع الخامس",
  "العدد 1 — الأسبوع السادس",
  "العدد 2 — الأسبوع السادس",
  "العدد 3 — الأسبوع السادس",
  "العدد 4 — الأسبوع السابع",
  "العدد 5 — الأسبوع الثامن",
  "العدد 6 — الأسبوع التاسع",
  "العدد 7 — الأسبوع العاشر",
  "العدد 4 — الأسبوع الحادي عشر",
  "العدد 5 — الأسبوع الحادي عشر",
  "العدد 6 — الأسبوع الحادي عشر",
  "العدد 7 — الأسبوع الحادي عشر",
  "العدد 8 — الأسبوع الثاني عشر",
  "العدد 9 — الأسبوع الثالث عشر",
  "العدد 10 — الأسبوع الرابع عشر",
  "العدد 8 — الأسبوع الخامس عشر",
  "العدد 9 — الأسبوع الخامس عشر",
  "العدد 10 — الأسبوع الخامس عشر",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function itemTitle(item) {
  return text(item?.itemTitle) || text(item?.title);
}

function expectedItemId(position) {
  return `${TEMPLATE_ID}-item-${position}`;
}

function formatTimestamp(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
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

function isExactShape(items, expectedTitles) {
  return (
    items.length === expectedTitles.length &&
    items.every((item, index) => {
      const position = index + 1;
      const expectedId = expectedItemId(position);
      return (
        text(item?.itemKey) === expectedId &&
        text(item?.itemId) === expectedId &&
        itemTitle(item) === expectedTitles[index]
      );
    })
  );
}

function classifyRowItems(items) {
  if (items.length === 0) return "EMPTY";
  if (isExactShape(items, OLD_20_TITLES)) return "OLD_20";
  if (isExactShape(items, CORRECT_15_TITLES)) return "CORRECT_15";
  return "UNEXPECTED";
}

function classifyBatch(batch) {
  const rowShapes = asArray(batch.studentRows).map((row) =>
    classifyRowItems(asArray(row?.itemScores)),
  );
  const usefulShapes = rowShapes.filter((shape) => shape !== "EMPTY");

  if (usefulShapes.length === 0) return "EMPTY";
  if (new Set(usefulShapes).size > 1) return "MIXED";
  return usefulShapes[0];
}

function scoreTotalForRetainedPositions(row) {
  return asArray(row?.itemScores)
    .slice(0, CORRECT_15_TITLES.length)
    .reduce((total, item) => total + (finiteNumber(item?.score) ?? 0), 0);
}

function rowScoreConsistentWithRetainedItems(row) {
  const score = finiteNumber(row?.score);
  if (score === undefined) return true;
  return score === scoreTotalForRetainedPositions(row);
}

function positionsWithScores(rows, start, end) {
  const positions = [];
  for (let position = start; position <= end; position += 1) {
    if (
      rows.some(
        (row) => finiteNumber(asArray(row?.itemScores)[position - 1]?.score) !== undefined,
      )
    ) {
      positions.push(position);
    }
  }
  return positions;
}

function positionUsage(rows, maxPositions) {
  return Array.from({ length: maxPositions }, (_, index) => {
    const position = index + 1;
    const items = rows
      .map((row) => asArray(row?.itemScores)[index])
      .filter(Boolean);
    const firstItem = items[0] || {};
    const scores = items
      .map((item) => finiteNumber(item.score))
      .filter((score) => score !== undefined);

    return {
      position,
      itemKey: text(firstItem.itemKey) || "-",
      itemTitle: itemTitle(firstItem) || "-",
      maxScore: finiteNumber(firstItem.maxScore) ?? "-",
      studentsWithFiniteNumericScore: scores.length,
      studentsWithoutScore: rows.length - scores.length,
      minScore: scores.length ? Math.min(...scores) : "-",
      maxScoreObserved: scores.length ? Math.max(...scores) : "-",
    };
  });
}

function scoreMatrix(rows, maxPositions) {
  return rows
    .filter((row) =>
      asArray(row?.itemScores).some(
        (item) => finiteNumber(item?.score) !== undefined,
      ),
    )
    .map((row) => {
      const result = {
        studentId: text(row.studentId) || "-",
        studentDisplayName: text(row.studentDisplayName) || "-",
      };

      for (let index = 0; index < maxPositions; index += 1) {
        const score = finiteNumber(asArray(row.itemScores)[index]?.score);
        result[`item-${index + 1}`] = score === undefined ? "-" : score;
      }

      return result;
    });
}

function normalizeItemScores(items) {
  return asArray(items).map((item) => ({
    itemKey: text(item?.itemKey),
    itemId: text(item?.itemId),
    itemTitle: itemTitle(item),
    maxScore: finiteNumber(item?.maxScore),
    score: finiteNumber(item?.score),
  }));
}

function repeatedNumberUsage(rows) {
  const positionsByNumber = new Map();

  OLD_20_TITLES.forEach((title, index) => {
    const match = title.match(/العدد\s+(\d+)/);
    if (!match) return;
    const number = match[1];
    const positions = positionsByNumber.get(number) || [];
    positions.push(index + 1);
    positionsByNumber.set(number, positions);
  });

  return [...positionsByNumber.entries()]
    .filter(([, positions]) => positions.length > 1)
    .map(([number, positions]) => ({
      number,
      positions: positions.join(", "),
      positionsWithScores: positions
        .filter((position) =>
          rows.some(
            (row) =>
              finiteNumber(asArray(row?.itemScores)[position - 1]?.score) !==
              undefined,
          ),
        )
        .join(", ") || "-",
    }));
}

function collectRecordIds(rows) {
  return [...new Set(rows.map((row) => text(row?.recordId)).filter(Boolean))];
}

async function inspectRecords(db, batch, entriesLinkedByBatchId) {
  const rows = asArray(batch.studentRows);
  const recordIds = collectRecordIds(rows);
  const refs = recordIds.map((recordId) =>
    db.doc(`orgs/${ORG_ID}/${TRACKER_ENTRY_COLLECTION}/${recordId}`),
  );
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const checks = [];
  let existingEntries = 0;

  for (const row of rows) {
    const recordId = text(row?.recordId);
    const base = {
      studentId: text(row?.studentId) || "-",
      studentDisplayName: text(row?.studentDisplayName) || "-",
      rowStatus: row?.status ?? "-",
      recordId: recordId || "-",
      recordExists: "NO",
      studentIdMatch: "-",
      batchIdMatch: "-",
      templateIdMatch: "-",
      entryItemScores: "-",
      entryScore: "-",
      entryMaxScore: "-",
      rowMatchesEntry: "-",
      issue: "-",
    };

    if (!recordId) {
      checks.push({
        ...base,
        issue: row?.status === "COMPLETED" ? "COMPLETED_MISSING_RECORD_ID" : "-",
      });
      continue;
    }

    const snapshot = byId.get(recordId);
    if (!snapshot?.exists) {
      checks.push({ ...base, issue: "RECORD_MISSING" });
      continue;
    }

    existingEntries += 1;
    const entry = snapshot.data() || {};
    const itemScoresMatch =
      JSON.stringify(normalizeItemScores(row.itemScores)) ===
      JSON.stringify(normalizeItemScores(entry.itemScores));
    const scoreMatch = finiteNumber(row.score) === finiteNumber(entry.score);
    const maxScoreMatch = finiteNumber(row.maxScore) === finiteNumber(entry.maxScore);
    const matches = itemScoresMatch && scoreMatch && maxScoreMatch;
    const issues = [];
    if (text(entry.studentId) !== text(row.studentId)) issues.push("STUDENT_ID_MISMATCH");
    if (text(entry.batchId) !== batch.id) issues.push("BATCH_ID_MISMATCH");
    if (text(entry.templateId) !== batch.templateId) issues.push("TEMPLATE_ID_MISMATCH");
    if (!matches) issues.push("ROW_ENTRY_SNAPSHOT_MISMATCH");

    checks.push({
      ...base,
      recordExists: "YES",
      studentIdMatch: text(entry.studentId) === text(row.studentId) ? "YES" : "NO",
      batchIdMatch: text(entry.batchId) === batch.id ? "YES" : "NO",
      templateIdMatch: text(entry.templateId) === batch.templateId ? "YES" : "NO",
      entryItemScores: asArray(entry.itemScores).length,
      entryScore: finiteNumber(entry.score) ?? "-",
      entryMaxScore: finiteNumber(entry.maxScore) ?? "-",
      rowMatchesEntry: matches ? "YES" : "NO",
      issue: issues.join(", ") || "-",
    });
  }

  return {
    checks,
    existingEntries: entriesLinkedByBatchId.length,
    entriesLinkedByBatchId,
  };
}

function batchMetadata(batch) {
  return {
    batchId: batch.id,
    schoolId: batch.schoolId ?? "-",
    academicYearId: batch.academicYearId ?? "-",
    gradeId: batch.gradeId ?? "-",
    classId: batch.classId ?? "-",
    status: batch.status ?? "-",
    subjectKey: batch.subjectKey ?? "-",
    templateId: batch.templateId ?? "-",
    batchKind: batch.batchKind ?? batch.kind ?? "-",
    createdByPersonId: batch.createdByPersonId ?? "-",
    teacherAssignmentId: batch.teacherAssignmentId ?? "-",
    createdAt: formatTimestamp(batch.createdAt),
    updatedAt: formatTimestamp(batch.updatedAt),
    targetCount: batch.targetCount ?? "-",
    completedCount: batch.completedCount ?? "-",
    missingCount: batch.missingCount ?? "-",
    studentRows: asArray(batch.studentRows).length,
    recordRefs: Array.isArray(batch.recordRefs)
      ? batch.recordRefs.length
      : "-",
    isCompensationBatch: batch.isCompensationBatch ?? "-",
    originalBatchId: batch.originalBatchId ?? "-",
  };
}

function migrationAssessment(batch, shape, linkedTrackerEntries) {
  const rows = asArray(batch.studentRows);
  const position16To20HaveScores = positionsWithScores(rows, 16, 20).length > 0;
  const rowScoreConsistent = rows.every(rowScoreConsistentWithRetainedItems);
  const rowsWithUnexpectedItems = rows.some((row) => {
    const items = asArray(row?.itemScores);
    return items.length > 0 && classifyRowItems(items) !== "OLD_20";
  });
  const preservesAllNumericScores =
    shape === "OLD_20" &&
    !position16To20HaveScores &&
    rowScoreConsistent &&
    !rowsWithUnexpectedItems;

  if (!preservesAllNumericScores) {
    return {
      safe: "NO",
      preservesAllNumericScores: "NO",
      reason:
        shape === "CORRECT_15"
          ? "ALREADY_CORRECT_15"
          : shape !== "OLD_20"
            ? `SNAPSHOT_${shape}`
            : "POSITIONS_16_TO_20_OR_ROW_SCORE_MISMATCH",
      position16To20HaveScores,
      rowScoreConsistent,
    };
  }
  if (batch.status !== "DRAFT") {
    return {
      safe: "NO",
      preservesAllNumericScores: "YES",
      reason: `STATUS_${batch.status || "UNKNOWN"}_REQUIRES_SEPARATE_HANDLING`,
      position16To20HaveScores,
      rowScoreConsistent,
    };
  }
  if (linkedTrackerEntries > 0) {
    return {
      safe: "NO",
      preservesAllNumericScores: "YES",
      reason: "LINKED_TRACKER_ENTRIES_EXIST",
      position16To20HaveScores,
      rowScoreConsistent,
    };
  }

  return {
    safe: "YES",
    preservesAllNumericScores: "YES",
    reason: "OLD_20_DRAFT_SCORE_PRESERVING_POSITION_MIGRATION",
    position16To20HaveScores,
    rowScoreConsistent,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const batchSnapshot = await db
    .collection(`orgs/${ORG_ID}/${BATCH_COLLECTION}`)
    .where("templateId", "==", TEMPLATE_ID)
    .get();
  const batches = batchSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
    .filter((batch) => !KNOWN_BATCH_IDS.has(batch.id));
  const additionalBatchIds = batches.map((batch) => batch.id);
  const linkedEntriesSnapshot = additionalBatchIds.length
    ? await db
        .collection(`orgs/${ORG_ID}/${TRACKER_ENTRY_COLLECTION}`)
        .where("batchId", "in", additionalBatchIds)
        .get()
    : null;
  const entriesByBatchId = new Map();
  for (const snapshot of linkedEntriesSnapshot?.docs || []) {
    const entry = { id: snapshot.id, ...(snapshot.data() || {}) };
    const batchId = text(entry.batchId);
    const entries = entriesByBatchId.get(batchId) || [];
    entries.push(entry);
    entriesByBatchId.set(batchId, entries);
  }

  console.log(`Additional batches found: ${batches.length}`);
  console.log("Excluded known repair targets:", [...KNOWN_BATCH_IDS].join(", "));

  const summary = [];
  for (const batch of batches) {
    const rows = asArray(batch.studentRows);
    const shape = classifyBatch(batch);
    const maxPositions = Math.max(
      0,
      ...rows.map((row) => asArray(row?.itemScores).length),
    );
    const records = await inspectRecords(
      db,
      batch,
      entriesByBatchId.get(batch.id) || [],
    );
    const assessment = migrationAssessment(batch, shape, records.existingEntries);
    const usedPositions = positionsWithScores(rows, 1, maxPositions);
    const rowsWithAnyScore = rows.filter((row) =>
      asArray(row?.itemScores).some(
        (item) => finiteNumber(item?.score) !== undefined,
      ),
    ).length;

    console.log("\n========================================");
    console.log(`BATCH: ${batch.id}`);
    console.log("========================================");
    console.table([batchMetadata(batch)]);
    console.log(`Snapshot shape: ${shape}`);
    console.log(`Used positions: ${usedPositions.join(", ") || "none"}`);
    console.log(
      `Positions 16–20 have finite scores: ${assessment.position16To20HaveScores ? "YES" : "NO"}`,
    );
    console.log(
      `row.score consistent with retained positions 1–15: ${assessment.rowScoreConsistent ? "YES" : "NO"}`,
    );
    console.log(
      `Position-based 20 -> 15 preserves every numeric score: ${assessment.preservesAllNumericScores}`,
    );
    console.log(`Safe for existing DRAFT migration: ${assessment.safe} (${assessment.reason})`);

    if (maxPositions > 0) {
      console.log("ITEM POSITION USAGE");
      console.table(positionUsage(rows, maxPositions));
    }
    if (shape === "OLD_20") {
      console.log("REPEATED-NUMBER POSITIONS (OLD_20)");
      console.table(repeatedNumberUsage(rows));
    }
    if (rowsWithAnyScore > 0) {
      console.log("PER-STUDENT SCORE MATRIX");
      console.table(scoreMatrix(rows, maxPositions));
    }
    if (records.checks.length > 0) {
      console.log("TRACKER ENTRY CHECKS");
      console.table(records.checks);
    }

    summary.push({
      batchId: batch.id,
      schoolId: batch.schoolId ?? "-",
      classId: batch.classId ?? "-",
      status: batch.status ?? "-",
      snapshotShape: shape,
      students: rows.length,
      rowsWithAnyScore,
      usedPositions: usedPositions.join(", ") || "-",
      positions16to20HaveScores: assessment.position16To20HaveScores ? "YES" : "NO",
      rowScoreConsistent: assessment.rowScoreConsistent ? "YES" : "NO",
      positionMigrationPreservesNumericScores:
        assessment.preservesAllNumericScores,
      linkedTrackerEntries: records.existingEntries,
      safeForPositionMigration: assessment.safe,
      reason: assessment.reason,
    });
  }

  console.log("\n========================================");
  console.log("ADDITIONAL BATCHES SUMMARY");
  console.log("========================================");
  console.table(summary);
}

main().catch((error) => {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
});
