#!/usr/bin/env node
"use strict";

/**
 * Read-only inspection for the KG2 Count & Calculate tracker template and its
 * three explicitly named batch snapshots. This script performs Firestore reads
 * only; it intentionally contains no write or apply path.
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const TEMPLATE_ID = "kg2-count-and-calculate-ay1448-term1-tracker";
const BATCH_IDS = [
  "vfmqmS5dA6sBq0OWnDz0",
  "PB9TMZv35LXr7TNmGDGP",
  "HVQD5AbgMsdjXL25fNOu",
];

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

  const serviceAccountPath = resolveServiceAccountPath();
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

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

function effectiveOrder(item, index) {
  return finiteNumber(item?.order) ?? index + 1;
}

function itemIdentity(item, index) {
  return [
    effectiveOrder(item, index),
    text(item?.itemKey),
    text(item?.itemId),
    text(item?.itemTitle),
  ].join("|");
}

function displayItem(item, index) {
  return {
    order: effectiveOrder(item, index),
    itemKey: text(item?.itemKey) || "-",
    itemId: text(item?.itemId) || "-",
    itemTitle: text(item?.itemTitle) || "-",
    maxScore: finiteNumber(item?.maxScore) ?? "-",
  };
}

function getItemCatalog(rows) {
  const byIdentity = {};

  for (const row of rows) {
    for (const [index, item] of asArray(row?.itemScores).entries()) {
      const identity = itemIdentity(item, index);

      if (!byIdentity[identity]) {
        byIdentity[identity] = {
          identity,
          ...displayItem(item, index),
        };
      }
    }
  }

  return Object.values(byIdentity).sort((left, right) => {
    return (
      left.order - right.order ||
      left.itemKey.localeCompare(right.itemKey, "ar") ||
      left.itemId.localeCompare(right.itemId, "ar") ||
      left.itemTitle.localeCompare(right.itemTitle, "ar")
    );
  });
}

function findRowItemByIdentity(row, identity) {
  return asArray(row?.itemScores).find(
    (item, index) => itemIdentity(item, index) === identity,
  );
}

function buildItemUsage(rows, catalog) {
  return catalog.map((catalogItem) => {
    const scores = [];
    let withoutScore = 0;

    for (const row of rows) {
      const item = findRowItemByIdentity(row, catalogItem.identity);
      const score = finiteNumber(item?.score);

      if (score === undefined) {
        withoutScore += 1;
      } else {
        scores.push(score);
      }
    }

    return {
      order: catalogItem.order,
      itemKey: catalogItem.itemKey,
      itemId: catalogItem.itemId,
      itemTitle: catalogItem.itemTitle,
      maxScore: catalogItem.maxScore,
      studentsWithNumericScore: scores.length,
      studentsWithNoScore: withoutScore,
      minNumericScore: scores.length ? Math.min(...scores) : "-",
      maxNumericScore: scores.length ? Math.max(...scores) : "-",
    };
  });
}

function buildScoreMatrix(rows, catalog) {
  return rows
    .filter((row) =>
      asArray(row?.itemScores).some(
        (item) => finiteNumber(item?.score) !== undefined,
      ),
    )
    .map((row) => {
      const matrixRow = {
        studentId: text(row?.studentId) || "-",
        studentDisplayName: text(row?.studentDisplayName) || "-",
      };

      for (const catalogItem of catalog) {
        const item = findRowItemByIdentity(row, catalogItem.identity);
        const score = finiteNumber(item?.score);
        matrixRow[`item-${catalogItem.order}`] =
          score === undefined ? "-" : score;
      }

      return matrixRow;
    });
}

function normalizeItemScores(items) {
  return asArray(items)
    .map((item, index) => ({
      order: effectiveOrder(item, index),
      itemKey: text(item?.itemKey),
      itemId: text(item?.itemId),
      itemTitle: text(item?.itemTitle),
      maxScore: finiteNumber(item?.maxScore),
      score: finiteNumber(item?.score),
    }))
    .sort((left, right) => {
      return (
        left.order - right.order ||
        left.itemKey.localeCompare(right.itemKey, "ar") ||
        left.itemId.localeCompare(right.itemId, "ar") ||
        left.itemTitle.localeCompare(right.itemTitle, "ar")
      );
    });
}

function itemScoresMatch(left, right) {
  return JSON.stringify(normalizeItemScores(left)) === JSON.stringify(normalizeItemScores(right));
}

function normalizeArabicDigits(value) {
  return String(value || "").replace(/[٠-٩]/g, (digit) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
  );
}

function getNumberLabel(itemTitle) {
  const normalized = normalizeArabicDigits(itemTitle);
  const match = normalized.match(/(?:العدد\s*)?(\d+)/);
  return match ? match[1] : null;
}

function getDuplicateScoreSummary(rows, catalog) {
  const positionsByNumber = {};

  for (const item of catalog) {
    const numberLabel = getNumberLabel(item.itemTitle);
    if (!numberLabel) continue;

    if (!positionsByNumber[numberLabel]) positionsByNumber[numberLabel] = [];
    positionsByNumber[numberLabel].push(item);
  }

  const duplicates = [];

  for (const numberLabel of Object.keys(positionsByNumber).sort(
    (left, right) => Number(left) - Number(right),
  )) {
    const positions = positionsByNumber[numberLabel];
    if (positions.length < 2) continue;

    const positionsWithScores = positions
      .filter((position) =>
        rows.some(
          (row) =>
            finiteNumber(findRowItemByIdentity(row, position.identity)?.score) !==
            undefined,
        ),
      )
      .map((position) => position.order);
    const studentsWithBothOccurrences = rows.filter((row) =>
      positions.every(
        (position) =>
          finiteNumber(findRowItemByIdentity(row, position.identity)?.score) !==
          undefined,
      ),
    ).length;

    duplicates.push({
      numberLabel,
      allPositions: positions.map((position) => position.order).join(", "),
      positionsWithScores: positionsWithScores.join(", ") || "-",
      studentsWithBothOccurrences,
    });
  }

  return duplicates;
}

async function inspectTrackerEntries(db, batch) {
  const rows = asArray(batch.studentRows);
  const completedRows = rows.filter((row) => row?.status === "COMPLETED");
  const recordIds = {};

  for (const row of completedRows) {
    const recordId = text(row?.recordId);
    if (recordId) recordIds[recordId] = true;
  }

  const recordIdList = Object.keys(recordIds);
  const recordRefs = recordIdList.map((recordId) =>
    db.doc(`orgs/${ORG_ID}/studentTrackerEntries/${recordId}`),
  );
  const recordSnapshots = recordRefs.length ? await db.getAll(...recordRefs) : [];
  const recordsById = {};

  for (const snapshot of recordSnapshots) {
    recordsById[snapshot.id] = snapshot;
  }

  const issues = [];
  const checks = [];

  for (const row of completedRows) {
    const recordId = text(row?.recordId);
    const baseCheck = {
      studentId: text(row?.studentId) || "-",
      studentDisplayName: text(row?.studentDisplayName) || "-",
      recordId: recordId || "-",
      recordExists: false,
      batchIdMatch: "-",
      studentIdMatch: "-",
      templateIdMatch: "-",
      scoreMatch: "-",
      maxScoreMatch: "-",
      itemScoresMatch: "-",
    };

    if (!recordId) {
      issues.push(`COMPLETED row for ${baseCheck.studentId} has no recordId`);
      checks.push({ ...baseCheck, issue: "COMPLETED_MISSING_RECORD_ID" });
      continue;
    }

    const recordSnapshot = recordsById[recordId];
    if (!recordSnapshot || !recordSnapshot.exists) {
      issues.push(`recordId ${recordId} is missing for ${baseCheck.studentId}`);
      checks.push({ ...baseCheck, issue: "RECORD_MISSING" });
      continue;
    }

    const record = recordSnapshot.data() || {};
    const batchIdMatch = text(record.batchId) === text(batch.id);
    const studentIdMatch = text(record.studentId) === text(row.studentId);
    const templateIdMatch = text(record.templateId) === text(batch.templateId);
    const scoreMatch = finiteNumber(record.score) === finiteNumber(row.score);
    const maxScoreMatch =
      finiteNumber(record.maxScore) === finiteNumber(row.maxScore);
    const scoresMatch = itemScoresMatch(record.itemScores, row.itemScores);
    const issueParts = [];

    if (!batchIdMatch) issueParts.push("BATCH_ID_MISMATCH");
    if (!studentIdMatch) issueParts.push("STUDENT_ID_MISMATCH");
    if (!templateIdMatch) issueParts.push("TEMPLATE_ID_MISMATCH");
    if (!scoreMatch) issueParts.push("SCORE_MISMATCH");
    if (!maxScoreMatch) issueParts.push("MAX_SCORE_MISMATCH");
    if (!scoresMatch) issueParts.push("ITEM_SCORES_MISMATCH");

    if (issueParts.length) {
      issues.push(
        `recordId ${recordId} for ${baseCheck.studentId}: ${issueParts.join(", ")}`,
      );
    }

    checks.push({
      ...baseCheck,
      recordExists: true,
      batchIdMatch: batchIdMatch ? "YES" : "NO",
      studentIdMatch: studentIdMatch ? "YES" : "NO",
      templateIdMatch: templateIdMatch ? "YES" : "NO",
      scoreMatch: scoreMatch ? "YES" : "NO",
      maxScoreMatch: maxScoreMatch ? "YES" : "NO",
      itemScoresMatch: scoresMatch ? "YES" : "NO",
      issue: issueParts.join(", ") || "-",
    });
  }

  return { checks, issues };
}

function printTemplate(template) {
  console.log("\n========================================");
  console.log(`TEMPLATE: ${TEMPLATE_ID}`);
  console.log("========================================");

  if (!template) {
    console.log("Template document does not exist.");
    return;
  }

  const items = asArray(template.templateItems);
  const state =
    items.length === 20 && finiteNumber(template.maxScore) === 60
      ? "OLD_20_ITEMS_MAX_60"
      : items.length === 15 && finiteNumber(template.maxScore) === 45
        ? "CORRECTED_15_ITEMS_MAX_45"
        : "OTHER";

  console.table([
    {
      state,
      templateId: TEMPLATE_ID,
      maxScore: finiteNumber(template.maxScore) ?? "-",
      totalScoreLabel: text(template.totalScoreLabel) || "-",
      itemCount: items.length,
    },
  ]);
  console.table(items.map((item, index) => displayItem(item, index)));
}

async function printBatch(db, batchId, batch) {
  console.log("\n========================================");
  console.log(`BATCH: ${batchId}`);
  console.log("========================================");

  if (!batch) {
    console.log("Batch document does not exist.");
    return { batchId, exists: false, catalog: [] };
  }

  const rows = asArray(batch.studentRows);
  const catalog = getItemCatalog(rows);
  const usage = buildItemUsage(rows, catalog);
  const matrix = buildScoreMatrix(rows, catalog);
  const entryInspection = await inspectTrackerEntries(db, batch);
  const positionsWithScores = usage
    .filter((item) => item.studentsWithNumericScore > 0)
    .map((item) => item.order);
  const emptyPositions = usage
    .filter((item) => item.studentsWithNumericScore === 0)
    .map((item) => item.order);
  const lastFive = usage.filter((item) => item.order >= 16 && item.order <= 20);
  const duplicateSummary = getDuplicateScoreSummary(rows, catalog);

  console.table([
    {
      batchId,
      status: text(batch.status) || "-",
      schoolId: text(batch.schoolId) || "-",
      academicYearId: text(batch.academicYearId) || "-",
      classId: text(batch.classId) || "-",
      subjectKey: text(batch.subjectKey) || "-",
      templateId: text(batch.templateId) || "-",
      batchKind: text(batch.batchKind) || "-",
      createdByPersonId: text(batch.createdByPersonId) || "-",
      teacherAssignmentId: text(batch.teacherAssignmentId) || "-",
      targetCount: finiteNumber(batch.targetCount) ?? "-",
      completedCount: finiteNumber(batch.completedCount) ?? "-",
      studentRowsLength: rows.length,
      recordRefsLength: asArray(batch.recordRefs).length,
    },
  ]);

  console.log("\nITEM USAGE");
  console.table(usage);

  console.log("\nPER-STUDENT SCORE MATRIX (students with any numeric item score)");
  if (matrix.length) console.table(matrix);
  else console.log("No student has a numeric item score.");

  console.log("\nTRACKER ENTRY VERIFICATION");
  if (entryInspection.checks.length) console.table(entryInspection.checks);
  else console.log("No COMPLETED student rows require tracker-entry verification.");

  console.log("\nSNAPSHOT SUMMARY");
  console.table([
    {
      catalogItemCount: catalog.length,
      positionsWithAnyScore: positionsWithScores.join(", ") || "-",
      scoredPositionUsage: usage
        .filter((item) => item.studentsWithNumericScore > 0)
        .map(
          (item) =>
            `${item.order}[${item.studentsWithNumericScore}:${item.minNumericScore}-${item.maxNumericScore}]`,
        )
        .join(", ") || "-",
      positionsCompletelyEmpty: emptyPositions.join(", ") || "-",
      lastFivePositionsWithAnyScore: lastFive
        .filter((item) => item.studentsWithNumericScore > 0)
        .map((item) => item.order)
        .join(", ") || "-",
      trackerEntriesConsistent: entryInspection.issues.length === 0 ? "YES" : "NO",
    },
  ]);

  console.log("\nDUPLICATED NUMBER POSITIONS");
  if (duplicateSummary.length) console.table(duplicateSummary);
  else console.log("No duplicated number labels were detected from the actual snapshot titles.");

  if (entryInspection.issues.length) {
    console.log("\nTRACKER ENTRY ISSUES");
    for (const issue of entryInspection.issues) console.log(`- ${issue}`);
  }

  return {
    batchId,
    exists: true,
    catalog: catalog.map((item) => ({
      order: item.order,
      itemKey: item.itemKey,
      itemId: item.itemId,
      itemTitle: item.itemTitle,
      maxScore: item.maxScore,
    })),
  };
}

function printBatchSnapshotComparison(batchReports) {
  console.log("\n========================================");
  console.log("BATCH SNAPSHOT KEY/ORDER COMPARISON");
  console.log("========================================");

  const existingReports = batchReports.filter((report) => report.exists);
  const baseline = existingReports[0];

  if (!baseline) {
    console.log("No target batches exist for comparison.");
    return;
  }

  const baselineSnapshot = JSON.stringify(baseline.catalog);
  console.table(
    batchReports.map((report) => ({
      batchId: report.batchId,
      batchExists: report.exists ? "YES" : "NO",
      itemCount: report.catalog.length,
      sameItemKeysOrderAndTitlesAsFirstExistingBatch:
        report.exists && JSON.stringify(report.catalog) === baselineSnapshot
          ? "YES"
          : "NO",
    })),
  );
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const templateRef = db.doc(`orgs/${ORG_ID}/studentTrackerTemplates/${TEMPLATE_ID}`);
  const batchRefs = BATCH_IDS.map((batchId) =>
    db.doc(`orgs/${ORG_ID}/studentMeasurementBatches/${batchId}`),
  );
  const [templateSnapshot, ...batchSnapshots] = await db.getAll(
    templateRef,
    ...batchRefs,
  );

  printTemplate(templateSnapshot.exists ? templateSnapshot.data() || {} : null);

  const batchReports = [];

  for (const [index, batchId] of BATCH_IDS.entries()) {
    const batchSnapshot = batchSnapshots[index];
    batchReports.push(await printBatch(
      db,
      batchId,
      batchSnapshot?.exists ? { id: batchId, ...(batchSnapshot.data() || {}) } : null,
    ));
  }

  printBatchSnapshotComparison(batchReports);

  console.log("\nREAD-ONLY INSPECTION COMPLETE");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
