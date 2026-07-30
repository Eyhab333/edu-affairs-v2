const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const now = Date.now();

const ITEM_MAX_SCORE = 3;
const LEARNING_LOSS_THRESHOLD_PERCENTAGE = 60;

const VALUES_ITEMS = [
  "المشاركة بالإثراءات",
  "حفظ الحديث",
  "حفظ الآية",
  "معرفة الاسم والصفة",
];

function makeItems(prefix) {
  return VALUES_ITEMS.map((title, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: title,
      title,
      category: "VALUES",
      valueType: "NUMERIC",
      maxScore: ITEM_MAX_SCORE,
      weight: 1,
      affectsTotal: true,
      order,
    };
  });
}

function sumMaxScore(items) {
  return items.reduce((sum, item) => sum + item.maxScore, 0);
}

function buildAssessmentTemplate() {
  const id = "kg-values-teacher-assessment-1";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG_VALUES_TEACHER_ASSESSMENT_1",
    title: "القيم وأسماء الله الحسنى — معلمة القيم — القياس الأول",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "",
    applicableGradeIds: ["kg1", "kg2", "kg3"],

    subjectKey: "VALUES",
    subjectId: "values",
    subjectTitle: "القيم / أسماء الله الحسنى",

    kind: "KG_VALUES_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    evaluatorRoleKey: "KG_TEACHER",

    maxScore,
    itemMaxScore: ITEM_MAX_SCORE,
    scoreScaleLabel: "الدرجة العظمى لكل بند: 3",
    totalScoreLabel: `المجموع: ${maxScore}`,

    templateItems,

    requiresLearningLossFollowUp: true,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,

    isActive: true,
    status: "ACTIVE",
    order: 1,

    ownerRoleKey: "KG_VALUES_TEACHER",
    ownerRoleLabel: "معلمة القيم",

    source: "create-kg-values-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate() {
  const id = "kg-values-teacher-tracker";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG_VALUES_TEACHER_TRACKER",
    title: "القيم وأسماء الله الحسنى — معلمة القيم — المتابعة",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "",
    applicableGradeIds: ["kg1", "kg2", "kg3"],

    subjectKey: "VALUES",
    subjectId: "values",
    subjectTitle: "القيم / أسماء الله الحسنى",

    kind: "KG_VALUES_TRACKER",
    evaluatorRoleKey: "KG_TEACHER",

    defaultLessonTitle: "متابعة القيم وأسماء الله الحسنى",
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
    order: 100,

    ownerRoleKey: "KG_VALUES_TEACHER",
    ownerRoleLabel: "معلمة القيم",

    source: "create-kg-values-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

const assessmentTemplates = [buildAssessmentTemplate()];
const trackerTemplates = [buildTrackerTemplate()];

async function upsertTemplate(collectionName, template, result) {
  const ref = db
    .collection("orgs")
    .doc(orgId)
    .collection(collectionName)
    .doc(template.id);

  const snap = await ref.get();

  if (!dryRun) {
    await ref.set(template, { merge: false });
  }

  const action = snap.exists ? "updated" : "created";
  result[action] += 1;

  console.log(
    `${dryRun ? "DRY RUN" : "OK"} ${action.toUpperCase()} ${collectionName}/${template.id}`,
  );

  console.log({
    title: template.title,
    subjectKey: template.subjectKey,
    gradeId: template.gradeId || "ALL_KG",
    applicableGradeIds: template.applicableGradeIds,
    kind: template.kind,
    maxScore: template.maxScore,
    itemMaxScore: template.itemMaxScore,
    items: template.templateItems.length,
    opensLoss: template.requiresLearningLossFollowUp,
    threshold: template.learningLossThresholdPercentage,
  });
}

async function main() {
  const result = {
    orgId,
    dryRun,
    created: 0,
    updated: 0,
    assessmentTemplates: assessmentTemplates.length,
    trackerTemplates: trackerTemplates.length,
  };

  console.log("Creating KG Values teacher templates...");
  console.log({
    orgId,
    dryRun,
    itemMaxScore: ITEM_MAX_SCORE,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
    applicableGradeIds: ["kg1", "kg2", "kg3"],
  });

  for (const template of assessmentTemplates) {
    await upsertTemplate("studentAssessmentTemplates", template, result);
  }

  for (const template of trackerTemplates) {
    await upsertTemplate("studentTrackerTemplates", template, result);
  }

  console.log("Done.");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to create KG Values teacher templates.");
  console.error(error);
  process.exit(1);
});