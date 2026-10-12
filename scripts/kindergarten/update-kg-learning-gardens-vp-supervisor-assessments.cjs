"use strict";

/**
 * Updates the existing ay-1448 / term-1 Learning Gardens leadership
 * assessment templates in place.
 *
 * Safety rules:
 * - Dry run is the default.
 * - Writes require BOTH --apply and the exact --confirm token below.
 * - All six existing template documents are validated before any write.
 * - Active/editable linked measurement batches block apply.
 * - The only write target is the six existing template documents under:
 *   orgs/takween/studentAssessmentTemplates/{templateId}
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const TEMPLATE_COLLECTION_NAME = "studentAssessmentTemplates";
const BATCH_COLLECTION_NAME = "studentMeasurementBatches";
const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";
const SUBJECT_KEY = "LEARNING_GARDENS";
const CONFIRMATION_TOKEN = "KG_LEARNING_GARDENS_VP_SUPERVISOR_UPDATE";
const BLOCKING_BATCH_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "IN_PROGRESS",
  "REVIEWED",
  "LOCKED",
]);

const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(
  `--confirm=${CONFIRMATION_TOKEN}`,
);
const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;

const TARGETS = ["kg1", "kg2", "kg3"].flatMap((gradeId) => [
  {
    templateId: `${gradeId}-learning-gardens-ay1448-term1-vp-assessment`,
    gradeId,
    evaluatorRoleKey: "KG_VP",
  },
  {
    templateId: `${gradeId}-learning-gardens-ay1448-term1-supervisor-assessment`,
    gradeId,
    evaluatorRoleKey: "EDU_SUPERVISOR",
  },
]);

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "service-account.json"),
  );

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Service account file was not found: ${serviceAccountPath}`,
    );
  }

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Validation failed: ${message}`);
  }
}

function itemDefinitionsForGrade(gradeId) {
  if (gradeId === "kg1") {
    return [{ title: "حروف", maxScore: 15 }];
  }

  assert(
    gradeId === "kg2" || gradeId === "kg3",
    `unsupported target grade: ${gradeId}`,
  );

  return [
    { title: "حروف", maxScore: 4 },
    { title: "كلمات", maxScore: 8 },
    { title: "كتابة", maxScore: 3 },
  ];
}

function buildTemplateItems(templateId, gradeId) {
  return itemDefinitionsForGrade(gradeId).map((item, index) => {
    const order = index + 1;
    const itemId = `${templateId}-${order}`;

    return {
      itemKey: itemId,
      itemId,
      itemTitle: item.title,
      title: item.title,
      category: SUBJECT_KEY,
      valueType: "NUMERIC",
      maxScore: item.maxScore,
      weight: 1,
      affectsTotal: true,
      required: true,
      order,
    };
  });
}

function formatItems(items) {
  if (!Array.isArray(items) || items.length === 0) return "—";

  return items
    .map((item) => {
      const title = item?.itemTitle || item?.title || "غير محدد";
      const maxScore = Number.isFinite(item?.maxScore)
        ? item.maxScore
        : "؟";

      return `${title}:${maxScore}`;
    })
    .join(", ");
}

function validateTemplate(snapshot, target) {
  const failures = [];

  if (!snapshot.exists) {
    return [`${target.templateId}: template document does not exist`];
  }

  const data = snapshot.data() || {};

  if (data.orgId !== ORG_ID) {
    failures.push(`orgId=${String(data.orgId)}`);
  }

  if (data.academicYearId !== ACADEMIC_YEAR_ID) {
    failures.push(`academicYearId=${String(data.academicYearId)}`);
  }

  if (
    !Array.isArray(data.applicableTermIds) ||
    !data.applicableTermIds.includes(TERM_ID)
  ) {
    failures.push(`applicableTermIds=${JSON.stringify(data.applicableTermIds)}`);
  }

  if (data.subjectKey !== SUBJECT_KEY) {
    failures.push(`subjectKey=${String(data.subjectKey)}`);
  }

  if (data.gradeId !== target.gradeId) {
    failures.push(`gradeId=${String(data.gradeId)}`);
  }

  if (data.evaluatorRoleKey !== target.evaluatorRoleKey) {
    failures.push(`evaluatorRoleKey=${String(data.evaluatorRoleKey)}`);
  }

  return failures.length > 0
    ? [`${target.templateId}: ${failures.join(", ")}`]
    : [];
}

async function getTargetTemplates(templateCollectionRef) {
  const snapshots = await Promise.all(
    TARGETS.map((target) =>
      templateCollectionRef.doc(target.templateId).get(),
    ),
  );

  const validationFailures = snapshots.flatMap((snapshot, index) =>
    validateTemplate(snapshot, TARGETS[index]),
  );

  if (validationFailures.length > 0) {
    throw new Error(
      `Refusing to continue because target template validation failed:\n${validationFailures
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
  }

  return snapshots;
}

async function assertNoBlockingBatches(db) {
  const targetTemplateIds = TARGETS.map((target) => target.templateId);
  const snapshot = await db
    .collection(`orgs/${ORG_ID}/${BATCH_COLLECTION_NAME}`)
    .where("templateId", "in", targetTemplateIds)
    .get();

  const blockingBatches = snapshot.docs
    .map((document) => ({ id: document.id, ...(document.data() || {}) }))
    .filter((batch) => BLOCKING_BATCH_STATUSES.has(batch.status));

  if (blockingBatches.length > 0) {
    const batchDetails = blockingBatches
      .map(
        (batch) =>
          `${batch.id} (templateId=${String(batch.templateId)}, status=${String(batch.status)})`,
      )
      .join("\n");

    throw new Error(
      `Refusing to update because linked active/editable measurement batches exist:\n${batchDetails}`,
    );
  }
}

function printPreview(snapshots) {
  const rows = snapshots.map((snapshot, index) => {
    const target = TARGETS[index];
    const current = snapshot.data() || {};
    const newItems = buildTemplateItems(
      target.templateId,
      target.gradeId,
    );

    return {
      templateId: target.templateId,
      gradeId: target.gradeId,
      evaluatorRoleKey: target.evaluatorRoleKey,
      currentMaxScore: current.maxScore ?? "—",
      newMaxScore: 15,
      currentItems: formatItems(current.templateItems),
      newItems: formatItems(newItems),
      action: APPLY ? "UPDATE" : "DRY RUN — would update",
    };
  });

  console.table(rows);
}

async function main() {
  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    throw new Error(
      `Refusing to apply without --confirm=${CONFIRMATION_TOKEN}.`,
    );
  }

  initAdmin();

  const db = admin.firestore();
  const templateCollectionRef = db.collection(
    `orgs/${ORG_ID}/${TEMPLATE_COLLECTION_NAME}`,
  );

  const snapshots = await getTargetTemplates(templateCollectionRef);
  await assertNoBlockingBatches(db);

  printPreview(snapshots);

  if (!APPLY) {
    console.log(
      `\nDry run only. To apply:\nnode scripts/kindergarten/update-kg-learning-gardens-vp-supervisor-assessments.cjs --apply --confirm=${CONFIRMATION_TOKEN}`,
    );
    return;
  }

  const now = Date.now();
  const writeBatch = db.batch();

  for (let index = 0; index < snapshots.length; index += 1) {
    const target = TARGETS[index];

    writeBatch.update(snapshots[index].ref, {
      templateItems: buildTemplateItems(
        target.templateId,
        target.gradeId,
      ),
      maxScore: 15,
      totalScoreLabel: "المجموع: 15",
      updatedAt: now,
    });
  }

  await writeBatch.commit();

  console.log(`\nUpdated ${TARGETS.length} existing template documents.`);
}

main().catch((error) => {
  console.error(
    "KG Learning Gardens VP/supervisor template update failed.",
  );
  console.error(error);
  process.exitCode = 1;
});