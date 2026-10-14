#!/usr/bin/env node
"use strict";

/**
 * Repairs only the KG2 Count & Calculate tracker template and the three
 * explicitly approved DRAFT batch snapshots which copied its old 20-item
 * structure. The positional order is the authoritative mapping.
 *
 * Default: dry run (read-only).
 * Apply: node scripts/kindergarten/repair-kg2-count-tracker-template-and-drafts.cjs --apply --confirm=KG2_COUNT_TRACKER_TEMPLATE_AND_DRAFTS_REPAIR
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const TEMPLATE_ID = "kg2-count-and-calculate-ay1448-term1-tracker";
const TEMPLATE_COLLECTION = "studentTrackerTemplates";
const BATCH_COLLECTION = "studentMeasurementBatches";
const TRACKER_ENTRY_COLLECTION = "studentTrackerEntries";
const ACADEMIC_YEAR_ID = "ay-1448";
const GRADE_ID = "kg2";
const SUBJECT_KEY = "COUNT_AND_CALCULATE";
const ITEM_MAX_SCORE = 3;
const TOTAL_MAX_SCORE = 45;
const CONFIRMATION_TOKEN =
  "KG2_COUNT_TRACKER_TEMPLATE_AND_OPEN_BATCHES_REPAIR";
const REPAIRABLE_STATUSES = new Set(["DRAFT", "IN_PROGRESS"]);
const BATCH_IDS = [
  "vfmqmS5dA6sBq0OWnDz0",
  "PB9TMZv35LXr7TNmGDGP",
  "HVQD5AbgMsdjXL25fNOu",
  "0FVf1tCtHLoY8jU4C2HI",
  "COjLQaCoHfGulFbQiFLy",
  "IU7AEBviE1uvO1EjSMmt",
  "NFPTD7V9NX313Z5jloUS",
  "PkCFIu3Gia4lPEV8kFEK",
  "T9k1e31ztIcbELs4ahvN",
  "hxRoOP16vSthAS3KyEjW",
  "wai19vft3qYNtqHvNMjL",
];

const ITEM_TITLES = [
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

const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(
  `--confirm=${CONFIRMATION_TOKEN}`,
);
const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Validation failed: ${message}`);
  }
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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function expectedItemId(position) {
  return `${TEMPLATE_ID}-item-${position}`;
}

function itemTitle(item) {
  return text(item?.itemTitle) || text(item?.title);
}

function isExactItemShape(items, expectedTitles) {
  return (
    items.length === expectedTitles.length &&
    items.every((item, index) => {
      const expectedId = expectedItemId(index + 1);
      return (
        text(item?.itemKey) === expectedId &&
        text(item?.itemId) === expectedId &&
        itemTitle(item) === expectedTitles[index]
      );
    })
  );
}

function classifyRowSnapshot(items) {
  if (items.length === 0) return "EMPTY";
  if (isExactItemShape(items, OLD_20_TITLES)) return "OLD_20";
  if (isExactItemShape(items, ITEM_TITLES)) return "CORRECT_15";
  return "UNEXPECTED";
}

function classifyBatchSnapshot(rows) {
  const usefulShapes = rows
    .map((row) => classifyRowSnapshot(asArray(row?.itemScores)))
    .filter((shape) => shape !== "EMPTY");

  if (usefulShapes.length === 0) return "EMPTY";
  return new Set(usefulShapes).size === 1 ? usefulShapes[0] : "MIXED";
}

function canonicalSubjectKey(value) {
  const normalized = text(value).toUpperCase();

  if (
    normalized === "COUNT_AND_CALCULATE" ||
    normalized === "NUMBERS" ||
    normalized === "KG_NUMBERS"
  ) {
    return SUBJECT_KEY;
  }

  return normalized;
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

  const serviceAccountPath = resolveServiceAccountPath();
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function validateTemplate(template) {
  assert(template, `${TEMPLATE_ID}: document is missing`);
  assert(template.id === TEMPLATE_ID, `${TEMPLATE_ID}: data.id must match`);
  assert(template.orgId === ORG_ID, `${TEMPLATE_ID}: orgId must be ${ORG_ID}`);
  assert(
    template.gradeId === GRADE_ID,
    `${TEMPLATE_ID}: gradeId must be ${GRADE_ID}`,
  );
  assert(
    canonicalSubjectKey(template.subjectKey) === SUBJECT_KEY,
    `${TEMPLATE_ID}: subjectKey must canonicalize to ${SUBJECT_KEY}`,
  );
  assert(
    template.academicYearId === ACADEMIC_YEAR_ID,
    `${TEMPLATE_ID}: academicYearId must be ${ACADEMIC_YEAR_ID}`,
  );

  const items = asArray(template.templateItems);
  assert(
    items.length === 20 || items.length === ITEM_TITLES.length,
    `${TEMPLATE_ID}: expected 20 malformed or 15 corrected template items, got ${items.length}`,
  );

  for (let index = 0; index < items.length; index += 1) {
    const position = index + 1;
    const item = items[index] || {};
    const expectedId = expectedItemId(position);

    assert(
      text(item.itemKey) === expectedId,
      `${TEMPLATE_ID}: template item ${position} itemKey must be ${expectedId}`,
    );
    assert(
      text(item.itemId) === expectedId,
      `${TEMPLATE_ID}: template item ${position} itemId must be ${expectedId}`,
    );
  }
}

function isCorrectTemplate(template) {
  const items = asArray(template.templateItems);

  return (
    isExactItemShape(items, ITEM_TITLES) &&
    finiteNumber(template.maxScore) === TOTAL_MAX_SCORE &&
    finiteNumber(template.itemMaxScore) === ITEM_MAX_SCORE &&
    text(template.totalScoreLabel) === `المجموع: ${TOTAL_MAX_SCORE}`
  );
}

function validateBatch(batchId, batch) {
  assert(batch, `${batchId}: document is missing`);
  assert(
    REPAIRABLE_STATUSES.has(batch.status),
    `${batchId}: status must be DRAFT or IN_PROGRESS`,
  );
  assert(
    batch.templateId === TEMPLATE_ID,
    `${batchId}: templateId must be ${TEMPLATE_ID}`,
  );
  assert(
    canonicalSubjectKey(batch.subjectKey) === SUBJECT_KEY,
    `${batchId}: subjectKey must canonicalize to ${SUBJECT_KEY}`,
  );
  assert(
    batch.academicYearId === ACADEMIC_YEAR_ID,
    `${batchId}: academicYearId must be ${ACADEMIC_YEAR_ID}`,
  );

  if (text(batch.gradeId)) {
    assert(
      text(batch.gradeId) === GRADE_ID,
      `${batchId}: gradeId must be ${GRADE_ID} when present`,
    );
  }

  const rows = asArray(batch.studentRows);
  assert(rows.length > 0, `${batchId}: studentRows must be present`);
  const snapshotShape = classifyBatchSnapshot(rows);
  assert(
    snapshotShape === "OLD_20" || snapshotShape === "CORRECT_15",
    `${batchId}: snapshot must be OLD_20 or CORRECT_15, got ${snapshotShape}`,
  );

  for (const [rowIndex, row] of rows.entries()) {
    assert(row && typeof row === "object", `${batchId}: invalid row ${rowIndex + 1}`);

    const items = asArray(row.itemScores);
    const rowScore = finiteNumber(row.score);

    if (items.length === 0) {
      assert(
        rowScore === undefined || rowScore === 0,
        `${batchId}: unscored row ${rowIndex + 1} has a non-zero numeric score ${rowScore}`,
      );
      continue;
    }

    const expectedItemCount =
      snapshotShape === "OLD_20" ? OLD_20_TITLES.length : ITEM_TITLES.length;
    assert(
      items.length === expectedItemCount,
      `${batchId}: row ${rowIndex + 1} itemScores count must be ${expectedItemCount}, got ${items.length}`,
    );

    let retainedScoreTotal = 0;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const position = itemIndex + 1;
      const item = items[itemIndex] || {};
      const expectedId = expectedItemId(position);

      assert(
        text(item.itemKey) === expectedId,
        `${batchId}: row ${rowIndex + 1}, position ${position} itemKey must be ${expectedId}`,
      );
      assert(
        text(item.itemId) === expectedId,
        `${batchId}: row ${rowIndex + 1}, position ${position} itemId must be ${expectedId}`,
      );

      const score = finiteNumber(item.score);
      if (position <= ITEM_TITLES.length) {
        if (score !== undefined) retainedScoreTotal += score;
      } else if (snapshotShape === "OLD_20") {
        assert(
          score === undefined,
          `${batchId}: row ${rowIndex + 1}, removed position ${position} has a numeric score`,
        );
      }
    }

    if (rowScore !== undefined) {
      assert(
        rowScore === retainedScoreTotal,
        `${batchId}: row ${rowIndex + 1} score ${rowScore} does not equal retained positions 1-15 total ${retainedScoreTotal}`,
      );
    }
  }

  return snapshotShape;
}

function buildRepairedTemplateItems(templateItems) {
  return templateItems.slice(0, ITEM_TITLES.length).map((item, index) => {
    const position = index + 1;
    const itemTitle = ITEM_TITLES[index];

    return {
      ...item,
      itemTitle,
      title: itemTitle,
      category: text(item.category) || "NUMBERS",
      valueType: text(item.valueType) || "NUMERIC",
      maxScore: ITEM_MAX_SCORE,
      weight: finiteNumber(item.weight) ?? 1,
      order: position,
    };
  });
}

function buildRepairedStudentRows(studentRows) {
  return studentRows.map((row) => {
    const currentItemScores = asArray(row.itemScores);
    const itemScores = currentItemScores.length
      ? currentItemScores.slice(0, ITEM_TITLES.length).map((item, index) => {
        const position = index + 1;
        const itemTitle = ITEM_TITLES[index];
        const repaired = {
          ...item,
          itemTitle,
          category: text(item.category) || "NUMBERS",
          valueType: text(item.valueType) || "NUMERIC",
          maxScore: ITEM_MAX_SCORE,
          weight: finiteNumber(item.weight) ?? 1,
          order: position,
        };

        if (hasOwn(item, "title")) {
          repaired.title = itemTitle;
        }

        return repaired;
      })
      : [];

    return {
      ...row,
      maxScore: TOTAL_MAX_SCORE,
      itemScores,
    };
  });
}

function assertRepairPreservesScores(batchId, beforeRows, afterRows) {
  assert(
    beforeRows.length === afterRows.length,
    `${batchId}: repaired row count changed unexpectedly`,
  );

  for (let rowIndex = 0; rowIndex < beforeRows.length; rowIndex += 1) {
    const beforeRow = beforeRows[rowIndex];
    const afterRow = afterRows[rowIndex];
    assert(
      beforeRow.score === afterRow.score,
      `${batchId}: row ${rowIndex + 1} score changed unexpectedly`,
    );
    assert(
      afterRow.maxScore === TOTAL_MAX_SCORE,
      `${batchId}: row ${rowIndex + 1} maxScore is not ${TOTAL_MAX_SCORE}`,
    );

    const beforeItems = asArray(beforeRow.itemScores);
    const afterItems = asArray(afterRow.itemScores);
    const expectedItemCount = beforeItems.length === 0 ? 0 : ITEM_TITLES.length;
    assert(
      afterItems.length === expectedItemCount,
      `${batchId}: row ${rowIndex + 1} did not retain its expected items`,
    );

    if (beforeItems.length === 0) continue;

    for (let index = 0; index < ITEM_TITLES.length; index += 1) {
      const beforeItem = beforeItems[index] || {};
      const afterItem = afterItems[index] || {};
      const position = index + 1;

      assert(
        beforeItem.itemKey === afterItem.itemKey,
        `${batchId}: row ${rowIndex + 1}, position ${position} itemKey changed`,
      );
      assert(
        beforeItem.itemId === afterItem.itemId,
        `${batchId}: row ${rowIndex + 1}, position ${position} itemId changed`,
      );
      assert(
        beforeItem.score === afterItem.score,
        `${batchId}: row ${rowIndex + 1}, position ${position} score changed`,
      );
      assert(
        afterItem.itemTitle === ITEM_TITLES[index],
        `${batchId}: row ${rowIndex + 1}, position ${position} itemTitle is incorrect`,
      );
      assert(
        afterItem.maxScore === ITEM_MAX_SCORE,
        `${batchId}: row ${rowIndex + 1}, position ${position} maxScore is incorrect`,
      );
    }
  }
}

function countNumericScores(rows, positions) {
  let count = 0;

  for (const row of rows) {
    const items = asArray(row.itemScores);
    for (const position of positions) {
      if (finiteNumber(items[position - 1]?.score) !== undefined) count += 1;
    }
  }

  return count;
}

function hasFiniteRemovedScores(rows) {
  return asArray(rows).some((row) =>
    asArray(row.itemScores)
      .slice(ITEM_TITLES.length)
      .some((item) => finiteNumber(item?.score) !== undefined),
  );
}

function countFiniteRemovedScores(rows) {
  return asArray(rows).reduce(
    (count, row) =>
      count +
      asArray(row.itemScores)
        .slice(ITEM_TITLES.length)
        .filter((item) => finiteNumber(item?.score) !== undefined).length,
    0,
  );
}

function countRowsWithNumericScores(rows) {
  return asArray(rows).filter((row) =>
    asArray(row.itemScores).some(
      (item) => finiteNumber(item?.score) !== undefined,
    ),
  ).length;
}

function maximumItemCount(rows) {
  return Math.max(0, ...asArray(rows).map((row) => asArray(row.itemScores).length));
}

function templatePreviewRows(template) {
  const currentItems = asArray(template.templateItems);

  return ITEM_TITLES.map((newTitle, index) => {
    const position = index + 1;
    const currentItem = currentItems[index] || {};

    return {
      position,
      itemKey: currentItem.itemKey,
      oldTitle: currentItem.itemTitle || currentItem.title || "-",
      newTitle,
      maxScore: `${currentItem.maxScore ?? "-"} -> ${ITEM_MAX_SCORE}`,
    };
  });
}

function batchPreviewRows(batch) {
  const firstRow =
    asArray(batch.studentRows).find((row) => asArray(row.itemScores).length) ||
    {};
  const items = asArray(firstRow.itemScores);

  return ITEM_TITLES.map((newTitle, index) => {
    const position = index + 1;
    const currentItem = items[index] || {};

    return {
      position,
      itemKey: currentItem.itemKey,
      oldTitle: currentItem.itemTitle || currentItem.title || "-",
      newTitle,
      maxScore: `${currentItem.maxScore ?? "-"} -> ${ITEM_MAX_SCORE}`,
    };
  });
}

async function readAndPreflight(db) {
  const templateRef = db.doc(`orgs/${ORG_ID}/${TEMPLATE_COLLECTION}/${TEMPLATE_ID}`);
  const batchRefs = BATCH_IDS.map((batchId) =>
    db.doc(`orgs/${ORG_ID}/${BATCH_COLLECTION}/${batchId}`),
  );
  const [templateSnapshot, ...batchSnapshots] = await db.getAll(
    templateRef,
    ...batchRefs,
  );

  assert(templateSnapshot.exists, `${TEMPLATE_ID}: document is missing`);
  const template = templateSnapshot.data() || {};
  validateTemplate(template);

  const batches = batchSnapshots.map((snapshot, index) => {
    assert(snapshot.exists, `${BATCH_IDS[index]}: document is missing`);
    const batch = snapshot.data() || {};
    const snapshotShape = validateBatch(BATCH_IDS[index], batch);
    const action = snapshotShape === "OLD_20" ? "WOULD_UPDATE" : "NO_CHANGE";
    const repairedStudentRows =
      action === "WOULD_UPDATE"
        ? buildRepairedStudentRows(batch.studentRows)
        : batch.studentRows;

    if (action === "WOULD_UPDATE") {
      assertRepairPreservesScores(
        BATCH_IDS[index],
        batch.studentRows,
        repairedStudentRows,
      );
    }

    return {
      id: BATCH_IDS[index],
      ref: snapshot.ref,
      data: batch,
      repairedStudentRows,
      snapshotShape,
      action,
    };
  });

  const [trackerEntriesSnapshot, allTemplateBatchesSnapshot] = await Promise.all([
    db
      .collection(`orgs/${ORG_ID}/${TRACKER_ENTRY_COLLECTION}`)
      .where("batchId", "in", BATCH_IDS)
      .get(),
    db
      .collection(`orgs/${ORG_ID}/${BATCH_COLLECTION}`)
      .where("templateId", "==", TEMPLATE_ID)
      .get(),
  ]);

  const linkedTrackerEntries = trackerEntriesSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    ...(snapshot.data() || {}),
  }));
  assert(
    linkedTrackerEntries.length === 0,
    `studentTrackerEntries already exist for target batches: ${linkedTrackerEntries
      .map((entry) => entry.id)
      .join(", ")}`,
  );

  const otherTemplateBatches = allTemplateBatchesSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
    .filter((batch) => !BATCH_IDS.includes(batch.id));

  return {
    template: { ref: templateSnapshot.ref, data: template },
    repairedTemplateItems: buildRepairedTemplateItems(template.templateItems),
    templateAction: isCorrectTemplate(template) ? "NO_CHANGE" : "WOULD_UPDATE",
    batches,
    otherTemplateBatches,
  };
}

function printPreview(preflight) {
  const { template, templateAction, batches, otherTemplateBatches } = preflight;
  const draftCount = batches.filter((batch) => batch.data.status === "DRAFT").length;
  const inProgressCount = batches.filter(
    (batch) => batch.data.status === "IN_PROGRESS",
  ).length;
  const wouldUpdateCount = batches.filter(
    (batch) => batch.action === "WOULD_UPDATE",
  ).length;
  const noChangeCount = batches.filter(
    (batch) => batch.action === "NO_CHANGE",
  ).length;

  console.log("\n========================================");
  console.log("KG2 COUNT & CALCULATE TRACKER REPAIR PREVIEW");
  console.log("========================================");
  console.table([
    {
      templateId: TEMPLATE_ID,
      currentItemCount: asArray(template.data.templateItems).length,
      repairedItemCount: ITEM_TITLES.length,
      currentMaxScore: template.data.maxScore ?? "-",
      repairedMaxScore: TOTAL_MAX_SCORE,
      currentItemMaxScore: template.data.itemMaxScore ?? "-",
      repairedItemMaxScore: ITEM_MAX_SCORE,
      currentTotalScoreLabel: template.data.totalScoreLabel ?? "-",
      repairedTotalScoreLabel: `المجموع: ${TOTAL_MAX_SCORE}`,
      action: templateAction,
    },
  ]);
  console.log("\nTEMPLATE POSITIONAL MAPPING (1–15)");
  console.table(templatePreviewRows(template.data));

  for (const batch of batches) {
    const rows = asArray(batch.data.studentRows);
    const retainedNumericBefore = countNumericScores(
      rows,
      ITEM_TITLES.map((_, index) => index + 1),
    );
    const retainedNumericAfter = countNumericScores(
      batch.repairedStudentRows,
      ITEM_TITLES.map((_, index) => index + 1),
    );

    console.log(`\nBATCH: ${batch.id}`);
    console.table([
      {
        batchId: batch.id,
        schoolId: batch.data.schoolId ?? "-",
        classId: batch.data.classId ?? "-",
        status: batch.data.status,
        templateId: batch.data.templateId,
        snapshotShape: batch.snapshotShape,
        oldItemCount: maximumItemCount(rows),
        newItemCount: maximumItemCount(batch.repairedStudentRows),
        students: rows.length,
        rowsWithNumericScores: countRowsWithNumericScores(rows),
        batchMaxScore: hasOwn(batch.data, "maxScore")
          ? `${batch.data.maxScore ?? "-"} -> ${TOTAL_MAX_SCORE}`
          : "absent (preserved absent)",
        rowMaxScore: `all -> ${TOTAL_MAX_SCORE}`,
        numericScoresPositions1To15: `${retainedNumericBefore} -> ${retainedNumericAfter}`,
        removedPositionsWithScores: countFiniteRemovedScores(rows),
        numericScoresChanged: 0,
        rowScoresChanged: 0,
        linkedTrackerEntries: 0,
        action: batch.action,
      },
    ]);
    if (batch.action === "WOULD_UPDATE") {
      console.log("POSITIONAL MAPPING (first student row; applies to every row)");
      console.table(batchPreviewRows(batch.data));
    }
  }

  console.log("\nOTHER BATCHES USING THIS TEMPLATE (READ-ONLY; NEVER MODIFIED)");
  if (otherTemplateBatches.length === 0) {
    console.log("None found.");
  } else {
    console.table(
      otherTemplateBatches.map((batch) => ({
        batchId: batch.id,
        status: batch.status ?? "-",
        schoolId: batch.schoolId ?? "-",
        classId: batch.classId ?? "-",
        academicYearId: batch.academicYearId ?? "-",
        subjectKey: batch.subjectKey ?? "-",
      })),
    );
  }

  console.log("\nPREVIEW SUMMARY");
  console.table([
    {
      totalTargets: BATCH_IDS.length,
      draftCount,
      inProgressCount,
      wouldUpdateCount,
      noChangeCount,
      blockedCount: 0,
      writesPerformed: 0,
    },
  ]);
}

async function applyRepair(db, preflight) {
  const now = Date.now();
  const writeBatch = db.batch();
  let writeCount = 0;

  if (preflight.templateAction === "WOULD_UPDATE") {
    writeBatch.update(preflight.template.ref, {
      templateItems: preflight.repairedTemplateItems,
      maxScore: TOTAL_MAX_SCORE,
      itemMaxScore: ITEM_MAX_SCORE,
      totalScoreLabel: `المجموع: ${TOTAL_MAX_SCORE}`,
      updatedAt: now,
    });
    writeCount += 1;
  }

  for (const batch of preflight.batches) {
    if (batch.action !== "WOULD_UPDATE") continue;

    const patch = {
      studentRows: batch.repairedStudentRows,
      updatedAt: now,
    };

    if (hasOwn(batch.data, "maxScore")) {
      patch.maxScore = TOTAL_MAX_SCORE;
    }

    writeBatch.update(batch.ref, patch);
    writeCount += 1;
  }

  if (writeCount === 0) {
    console.log("\nNo documents required repair.");
    return;
  }

  await writeBatch.commit();
  console.log(
    `\nApplied one Firestore batch containing ${writeCount} document updates.`,
  );
}

async function main() {
  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    throw new Error(
      `Refusing to apply without --confirm=${CONFIRMATION_TOKEN}.`,
    );
  }
  if (!APPLY_REQUESTED && APPLY_CONFIRMED) {
    throw new Error("Refusing confirmation without --apply.");
  }

  initAdmin();
  const db = admin.firestore();
  const preflight = await readAndPreflight(db);

  printPreview(preflight);

  if (!APPLY) {
    console.log(
      `\nDry run only. To apply:\nnode scripts/kindergarten/repair-kg2-count-tracker-template-and-drafts.cjs --apply --confirm=${CONFIRMATION_TOKEN}`,
    );
    return;
  }

  await applyRepair(db, preflight);
}

main().catch((error) => {
  console.error(`\n${error.message || error}`);
  process.exitCode = 1;
});
