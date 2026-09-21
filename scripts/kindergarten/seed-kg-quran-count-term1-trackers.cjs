/*
 * New first-semester Quran and Count and Calculate tracker templates for KG.
 *
 * Default: DRY RUN (no Firestore writes)
 * Apply: node scripts/kindergarten/seed-kg-quran-count-term1-trackers.cjs --apply --confirm=KG_QURAN_COUNT_TERM1_TRACKERS
 *
 * This script only creates the six IDs declared below. It never updates an
 * existing template: an existing target ID aborts APPLY before any write.
 */

const admin = require("firebase-admin");
const path = require("node:path");

const ORG_ID = process.env.ORG_ID || "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const CONFIRMATION = "KG_QURAN_COUNT_TERM1_TRACKERS";
const ITEM_MAX_SCORE = 3;
const LEARNING_LOSS_THRESHOLD_PERCENTAGE = 60;

const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(`--confirm=${CONFIRMATION}`);
const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;
const now = Date.now();

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "service-account.json"),
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function makeItems(templateId, category, titles) {
  return titles.map((itemTitle, index) => {
    const order = index + 1;
    const itemId = `${templateId}-item-${order}`;

    return {
      itemKey: itemId,
      itemId,
      itemTitle,
      title: itemTitle,
      category,
      valueType: "NUMERIC",
      maxScore: ITEM_MAX_SCORE,
      weight: 1,
      affectsTotal: true,
      required: false,
      order,
    };
  });
}

function buildTrackerTemplate({
  id,
  code,
  title,
  gradeId,
  subjectKey,
  subjectId,
  subjectTitle,
  kind,
  category,
  defaultLessonTitle,
  itemTitles,
}) {
  const templateItems = makeItems(id, category, itemTitles);
  const maxScore = templateItems.reduce((sum, item) => sum + item.maxScore, 0);

  return {
    id,
    code,
    title,
    orgId: ORG_ID,
    schoolType: "KG",
    schoolId: "",
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId,
    subjectKey,
    subjectId,
    subjectTitle,
    kind,
    evaluatorRoleKey: "KG_TEACHER",
    defaultLessonTitle,
    isContinuous: true,
    maxScore,
    itemMaxScore: ITEM_MAX_SCORE,
    scoreScaleLabel: "الدرجة العظمى لكل بند: 3",
    totalScoreLabel: `المجموع: ${maxScore}`,
    templateItems,
    requiresLearningLossFollowUp: true,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
    isActive: true,
    status: "ACTIVE",
    order: 120,
    source: "seed-kg-quran-count-term1-trackers",
    createdAt: now,
    updatedAt: now,
  };
}

const COUNT_KG1_ITEMS = [
  "العدد 1 — الأسبوع الرابع",
  "العدد 2 — الأسبوع الرابع",
  "العدد 3 — الأسبوع الخامس والسادس",
  "العدد 4 — الأسبوع السابع والثامن",
  "العدد 5 — الأسبوع التاسع والعاشر",
  "العدد 6 — الأسبوع الحادي عشر والثاني عشر",
  "العدد 7 — الأسبوع الثالث عشر والرابع عشر",
];

const COUNT_KG2_ITEMS = [
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

const COUNT_KG3_ITEMS = [
  "العدد 1 — الأسبوع الثاني",
  "العدد 2 — الأسبوع الثاني",
  "العدد 3 — الأسبوع الثالث",
  "العدد 4 — الأسبوع الرابع",
  "العدد 5 — الأسبوع الخامس",
  "العدد 6 — الأسبوع السادس",
  "العدد 7 — الأسبوع السابع",
  "العدد 8 — الأسبوع الثامن",
  "العدد 9 — الأسبوع التاسع",
  "العدد 10 — الأسبوع العاشر",
  "العدد 11 — الأسبوع الحادي عشر",
  "العدد 12 — الأسبوع الثاني عشر",
  "العدد 13 — الأسبوع الثالث عشر",
  "العدد 14 — الأسبوع الرابع عشر",
  "العدد 15 — الأسبوع الخامس عشر",
];

const QURAN_KG1_ITEMS = [
  "الفاتحة — الأسبوع الرابع والخامس",
  "الإخلاص — الأسبوع الرابع والخامس",
  "الفلق — الأسبوع السادس والسابع",
  "الناس — الأسبوع الثامن والتاسع",
  "المسد — الأسبوع العاشر والحادي عشر",
  "النصر — الأسبوع الثاني عشر والثالث عشر",
  "الكافرون — الأسبوع الرابع عشر والخامس عشر",
];

const QURAN_KG2_AND_KG3_ITEMS = [
  "الفاتحة — الأسبوع الرابع",
  "الناس — الأسبوع الرابع",
  "الفلق — الأسبوع الخامس",
  "الإخلاص — الأسبوع الخامس",
  "المسد — الأسبوع السادس",
  "النصر — الأسبوع السابع",
  "الكافرون — الأسبوع الثامن",
  "الكوثر — الأسبوع التاسع",
  "الماعون — الأسبوع العاشر",
  "الماعون — الأسبوع الحادي عشر",
  "قريش — الأسبوع الثاني عشر",
  "الفيل — الأسبوع الثالث عشر",
  "الفيل — الأسبوع الرابع عشر",
  "الفاتحة — الأسبوع الخامس عشر — مراجعة وتحسين مستوى",
  "الناس — الأسبوع الخامس عشر — مراجعة وتحسين مستوى",
  "الفلق — الأسبوع الخامس عشر — مراجعة وتحسين مستوى",
  "الإخلاص — الأسبوع الخامس عشر — مراجعة وتحسين مستوى",
  "المسد — الأسبوع الخامس عشر — مراجعة وتحسين مستوى",
  "النصر — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
  "الكافرون — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
  "الكوثر — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
  "الماعون — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
  "قريش — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
  "الفيل — الأسبوع السادس عشر — مراجعة وتحسين مستوى",
];

const trackerTemplates = [
  buildTrackerTemplate({
    id: "kg1-count-and-calculate-ay1448-term1-tracker",
    code: "KG1_COUNT_AND_CALCULATE_AY1448_TERM1_TRACKER",
    title: "نعد ونحسب — المستوى الأول — متابعة الفصل الدراسي الأول",
    gradeId: "kg1",
    subjectKey: "COUNT_AND_CALCULATE",
    subjectId: "count-and-calculate",
    subjectTitle: "نعد ونحسب",
    kind: "KG_NUMBERS_TRACKER",
    category: "NUMBERS",
    defaultLessonTitle: "متابعة نعد ونحسب — الفصل الدراسي الأول",
    itemTitles: COUNT_KG1_ITEMS,
  }),
  buildTrackerTemplate({
    id: "kg2-count-and-calculate-ay1448-term1-tracker",
    code: "KG2_COUNT_AND_CALCULATE_AY1448_TERM1_TRACKER",
    title: "نعد ونحسب — المستوى الثاني — متابعة الفصل الدراسي الأول",
    gradeId: "kg2",
    subjectKey: "COUNT_AND_CALCULATE",
    subjectId: "count-and-calculate",
    subjectTitle: "نعد ونحسب",
    kind: "KG_NUMBERS_TRACKER",
    category: "NUMBERS",
    defaultLessonTitle: "متابعة نعد ونحسب — الفصل الدراسي الأول",
    itemTitles: COUNT_KG2_ITEMS,
  }),
  buildTrackerTemplate({
    id: "kg3-count-and-calculate-ay1448-term1-tracker",
    code: "KG3_COUNT_AND_CALCULATE_AY1448_TERM1_TRACKER",
    title: "نعد ونحسب — المستوى الثالث — متابعة الفصل الدراسي الأول",
    gradeId: "kg3",
    subjectKey: "COUNT_AND_CALCULATE",
    subjectId: "count-and-calculate",
    subjectTitle: "نعد ونحسب",
    kind: "KG_NUMBERS_TRACKER",
    category: "NUMBERS",
    defaultLessonTitle: "متابعة نعد ونحسب — الفصل الدراسي الأول",
    itemTitles: COUNT_KG3_ITEMS,
  }),
  buildTrackerTemplate({
    id: "kg1-quran-ay1448-term1-tracker",
    code: "KG1_QURAN_AY1448_TERM1_TRACKER",
    title: "القرآن الكريم — المستوى الأول — متابعة الفصل الدراسي الأول",
    gradeId: "kg1",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    kind: "KG_QURAN_TRACKER",
    category: "QURAN",
    defaultLessonTitle: "متابعة القرآن — الفصل الدراسي الأول",
    itemTitles: QURAN_KG1_ITEMS,
  }),
  buildTrackerTemplate({
    id: "kg2-quran-ay1448-term1-tracker",
    code: "KG2_QURAN_AY1448_TERM1_TRACKER",
    title: "القرآن الكريم — المستوى الثاني — متابعة الفصل الدراسي الأول",
    gradeId: "kg2",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    kind: "KG_QURAN_TRACKER",
    category: "QURAN",
    defaultLessonTitle: "متابعة القرآن — الفصل الدراسي الأول",
    itemTitles: QURAN_KG2_AND_KG3_ITEMS,
  }),
  buildTrackerTemplate({
    id: "kg3-quran-ay1448-term1-tracker",
    code: "KG3_QURAN_AY1448_TERM1_TRACKER",
    title: "القرآن الكريم — المستوى الثالث — متابعة الفصل الدراسي الأول",
    gradeId: "kg3",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    kind: "KG_QURAN_TRACKER",
    category: "QURAN",
    defaultLessonTitle: "متابعة القرآن — الفصل الدراسي الأول",
    itemTitles: QURAN_KG2_AND_KG3_ITEMS,
  }),
];

const EXPECTED_BY_SUBJECT_AND_GRADE = {
  "COUNT_AND_CALCULATE:kg1": { items: 7, maxScore: 21 },
  "COUNT_AND_CALCULATE:kg2": { items: 20, maxScore: 60 },
  "COUNT_AND_CALCULATE:kg3": { items: 15, maxScore: 45 },
  "QURAN:kg1": { items: 7, maxScore: 21 },
  "QURAN:kg2": { items: 24, maxScore: 72 },
  "QURAN:kg3": { items: 24, maxScore: 72 },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateTemplates(templates) {
  assert(templates.length === 6, "Expected exactly 6 templates.");

  const ids = new Set();
  const codes = new Set();
  const subjectGrades = new Set();
  const subjectCounts = new Map();

  for (const template of templates) {
    const key = `${template.subjectKey}:${template.gradeId}`;
    const expected = EXPECTED_BY_SUBJECT_AND_GRADE[key];

    assert(expected, `Unexpected subject/grade: ${key}`);
    assert(!ids.has(template.id), `Duplicate ID: ${template.id}`);
    assert(!codes.has(template.code), `Duplicate code: ${template.code}`);
    assert(!subjectGrades.has(key), `Duplicate subject/grade: ${key}`);
    assert(template.schoolType === "KG", `${template.id}: schoolType must be KG.`);
    assert(template.schoolId === "", `${template.id}: schoolId must be empty.`);
    assert(
      template.academicYearId === ACADEMIC_YEAR_ID,
      `${template.id}: incorrect academicYearId.`,
    );
    assert(template.isActive === true, `${template.id}: must be active.`);
    assert(template.status === "ACTIVE", `${template.id}: status must be ACTIVE.`);
    assert(
      template.templateItems.length === expected.items,
      `${template.id}: expected ${expected.items} items.`,
    );
    assert(
      template.maxScore === expected.maxScore,
      `${template.id}: expected maxScore ${expected.maxScore}.`,
    );
    assert(
      template.templateItems.every((item) => item.maxScore === ITEM_MAX_SCORE),
      `${template.id}: every item must have maxScore ${ITEM_MAX_SCORE}.`,
    );
    assert(
      template.templateItems.reduce((sum, item) => sum + item.maxScore, 0) ===
        template.maxScore,
      `${template.id}: maxScore does not equal item total.`,
    );

    ids.add(template.id);
    codes.add(template.code);
    subjectGrades.add(key);
    subjectCounts.set(
      template.subjectKey,
      (subjectCounts.get(template.subjectKey) || 0) + 1,
    );
  }

  assert(
    subjectCounts.get("COUNT_AND_CALCULATE") === 3,
    "Expected exactly 3 Count and Calculate templates.",
  );
  assert(subjectCounts.get("QURAN") === 3, "Expected exactly 3 Quran templates.");
}

function templateReference(db, templateId) {
  return db
    .collection("orgs")
    .doc(ORG_ID)
    .collection("studentTrackerTemplates")
    .doc(templateId);
}

function printTemplate(action, ref, template) {
  console.log("----------------------------------------------");
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} ${action}`);
  console.log(ref.path);
  console.log({
    id: template.id,
    title: template.title,
    gradeId: template.gradeId,
    subjectKey: template.subjectKey,
    academicYearId: template.academicYearId,
    itemsCount: template.templateItems.length,
    maxScore: template.maxScore,
    items: template.templateItems.map((item) => ({
      order: item.order,
      itemKey: item.itemKey,
      title: item.itemTitle,
    })),
  });
}

async function main() {
  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    throw new Error(
      `Apply requested without confirmation. Use --confirm=${CONFIRMATION}`,
    );
  }

  validateTemplates(trackerTemplates);
  initAdmin();

  const db = admin.firestore();
  const inspections = await Promise.all(
    trackerTemplates.map(async (template) => {
      const ref = templateReference(db, template.id);
      const snap = await ref.get();
      return { template, ref, exists: snap.exists };
    }),
  );

  const created = inspections.filter((item) => !item.exists);
  const existing = inspections.filter((item) => item.exists);

  console.log("");
  console.log("==============================================");
  console.log("KG Quran and Count and Calculate term-1 trackers");
  console.log("==============================================");
  console.log({
    orgId: ORG_ID,
    mode: APPLY ? "APPLY" : "DRY_RUN",
    academicYearId: ACADEMIC_YEAR_ID,
    targetSchools: ["kg-01", "kg-02", "kg-03", "kg-04"],
    targetTemplateIds: trackerTemplates.map((template) => template.id),
  });

  for (const item of inspections) {
    printTemplate(item.exists ? "UPDATE" : "CREATE", item.ref, item.template);
  }

  if (existing.length > 0) {
    console.warn("");
    console.warn("WARNING: target IDs already exist. APPLY will abort without writes.");
    for (const item of existing) console.warn(`- ${item.ref.path}`);
  }

  console.log("");
  console.log("Result");
  console.log({
    mode: APPLY ? "APPLY" : "DRY_RUN",
    created: created.length,
    updated: existing.length,
    writesPerformed: 0,
  });

  if (!APPLY) {
    console.log("No Firestore writes were made.");
    console.log("To apply:");
    console.log(
      "node scripts/kindergarten/seed-kg-quran-count-term1-trackers.cjs --apply --confirm=KG_QURAN_COUNT_TERM1_TRACKERS",
    );
    return;
  }

  if (existing.length > 0) {
    throw new Error("APPLY aborted because one or more target IDs already exist.");
  }

  const batch = db.batch();
  for (const item of created) {
    batch.create(item.ref, item.template);
  }
  await batch.commit();

  console.log("Applied 6 new tracker templates using create-only writes.");
}

main().catch((error) => {
  console.error("");
  console.error("Failed to seed KG Quran and Count and Calculate term-1 trackers.");
  console.error(error);
  process.exit(1);
});
