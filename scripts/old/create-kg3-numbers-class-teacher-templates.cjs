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

const NUMBER_ITEMS = [
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
];

function makeItems(prefix) {
  return NUMBER_ITEMS.map((title, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: title,
      title,
      category: "NUMBERS",
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
  const id = "kg3-numbers-class-teacher-assessment-1";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG3_NUMBERS_CLASS_TEACHER_ASSESSMENT_1",
    title: "الأرقام — المستوى الثالث — معلمة الصف — القياس الأول",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg3",

    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",

    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
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

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg3-numbers-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate() {
  const id = "kg3-numbers-class-teacher-tracker";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG3_NUMBERS_CLASS_TEACHER_TRACKER",
    title: "الأرقام — المستوى الثالث — معلمة الصف — المتابعة",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg3",

    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",

    kind: "KG_NUMBERS_TRACKER",
    evaluatorRoleKey: "KG_TEACHER",

    defaultLessonTitle: "متابعة الأرقام",
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

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg3-numbers-class-teacher-templates",
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
    gradeId: template.gradeId,
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

  console.log("Creating KG3 Numbers class-teacher templates...");
  console.log({
    orgId,
    dryRun,
    itemMaxScore: ITEM_MAX_SCORE,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
    numbers: NUMBER_ITEMS,
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
  console.error("Failed to create KG3 Numbers class-teacher templates.");
  console.error(error);
  process.exit(1);
});