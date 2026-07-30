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

const LEARNING_LOSS_THRESHOLD_PERCENTAGE = 60;

const ASSESSMENT_ITEMS = [
  {
    title: "حرفان",
    maxScore: 7,
  },
  {
    title: "كلمات",
    maxScore: 8,
  },
];

const TRACKER_ITEM_MAX_SCORE = 3;

const TRACKER_ITEMS = [
  "السكون المجموعة (1) حرفين",
  "السكون المجموعة (1) كلمات",
  "السكون المجموعة (2) حرفين",
  "السكون المجموعة (2) كلمات",
  "مد الألف المجموعة (1)",
  "مد الألف المجموعة (2)",
  "مد الياء المجموعة (1)",
  "مد الياء المجموعة (2)",
  "مد الواو المجموعة (1)",
  "مد الواو المجموعة (2)",
  "تنوين الضم المجموعة (1)",
  "تنوين الضم المجموعة (2)",
  "تنوين الكسر المجموعة (1)",
  "تنوين الكسر المجموعة (2)",
  "تنوين الفتح المجموعة (1)",
  "تنوين الفتح المجموعة (2)",
  "اللام القمرية بحركة الفتح",
  "اللام القمرية بحركة الضم",
  "اللام القمرية بحركة الكسر",
  "اللام الشمسية بحركة الفتح",
  "اللام الشمسية بحركة الضم",
  "اللام الشمسية بحركة الكسر",
  "الحرف المشدد مع حرفين",
  "الحرف المشدد مع كلمات",
  "الحرف المشدد مع التنوين حرفين",
  "الحرف المشدد مع التنوين كلمات",
  "التاء المفتوحة والمربوطة",
];

function sumMaxScore(items) {
  return items.reduce((sum, item) => sum + item.maxScore, 0);
}

function makeAssessmentItems(prefix) {
  return ASSESSMENT_ITEMS.map((item, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: item.title,
      title: item.title,
      category: "LEARNING_GARDENS",
      valueType: "NUMERIC",
      maxScore: item.maxScore,
      weight: 1,
      affectsTotal: true,
      order,
    };
  });
}

function makeTrackerItems(prefix) {
  return TRACKER_ITEMS.map((title, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: title,
      title,
      category: "LEARNING_GARDENS",
      valueType: "NUMERIC",
      maxScore: TRACKER_ITEM_MAX_SCORE,
      weight: 1,
      affectsTotal: true,
      order,
    };
  });
}

function buildAssessmentTemplate({
  id,
  code,
  title,
  kind,
  assessmentSlot,
  order,
}) {
  const templateItems = makeAssessmentItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code,
    title,

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg3",

    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",

    kind,
    assessmentSlot,
    evaluatorRoleKey: "KG_TEACHER",

    maxScore,
    scoreScaleLabel: "بند حرفان من 7، وبند كلمات من 8",
    totalScoreLabel: `المجموع: ${maxScore}`,

    templateItems,

    requiresLearningLossFollowUp: true,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,

    isActive: true,
    status: "ACTIVE",
    order,

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg3-learning-gardens-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate() {
  const id = "kg3-learning-gardens-class-teacher-tracker";
  const templateItems = makeTrackerItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_TRACKER",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — المتابعة",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg3",

    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",

    kind: "KG_LEARNING_GARDENS_TRACKER",
    evaluatorRoleKey: "KG_TEACHER",

    defaultLessonTitle: "متابعة بساتين المعرفة",
    isContinuous: true,

    maxScore,
    itemMaxScore: TRACKER_ITEM_MAX_SCORE,
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

    source: "create-kg3-learning-gardens-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

const assessmentTemplates = [
  buildAssessmentTemplate({
    id: "kg3-learning-gardens-class-teacher-assessment-1",
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_1",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — القياس الأول",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    order: 1,
  }),
  buildAssessmentTemplate({
    id: "kg3-learning-gardens-class-teacher-assessment-2",
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_2",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — القياس الثاني",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    order: 2,
  }),
  buildAssessmentTemplate({
    id: "kg3-learning-gardens-class-teacher-assessment-3",
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_3",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — القياس الثالث",
    kind: "KG_MEASUREMENT_3",
    assessmentSlot: "KG_MEASUREMENT_3",
    order: 3,
  }),
  buildAssessmentTemplate({
    id: "kg3-learning-gardens-class-teacher-assessment-4",
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_4",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — القياس الرابع",
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    order: 4,
  }),
  buildAssessmentTemplate({
    id: "kg3-learning-gardens-class-teacher-assessment-5",
    code: "KG3_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_5",
    title: "بساتين المعرفة — المستوى الثالث — معلمة الصف — القياس الخامس",
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    order: 5,
  }),
];

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

  console.log("Creating KG3 Learning Gardens class-teacher templates...");
  console.log({
    orgId,
    dryRun,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
    assessmentItems: ASSESSMENT_ITEMS,
    trackerItemMaxScore: TRACKER_ITEM_MAX_SCORE,
    trackerItemsCount: TRACKER_ITEMS.length,
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
  console.error("Failed to create KG3 Learning Gardens class-teacher templates.");
  console.error(error);
  process.exit(1);
});