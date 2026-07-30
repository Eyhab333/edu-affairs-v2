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

function makeItems(prefix, titles, category) {
  return titles.map((title, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: title,
      title,
      category,
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

function buildAssessmentTemplate({
  id,
  code,
  title,
  subjectKey,
  subjectId,
  subjectTitle,
  category,
  kind,
  assessmentSlot,
  itemTitles,
  order,
}) {
  const templateItems = makeItems(id, itemTitles, category);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code,
    title,

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg1",

    subjectKey,
    subjectId,
    subjectTitle,

    kind,
    assessmentSlot,
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
    order,

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg1-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate({
  id,
  code,
  title,
  subjectKey,
  subjectId,
  subjectTitle,
  category,
  kind,
  defaultLessonTitle,
  itemTitles,
  order,
}) {
  const templateItems = makeItems(id, itemTitles, category);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code,
    title,

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "kg1",

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
    order,

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg1-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

const QURAN_ASSESSMENT_1_ITEMS = ["الكوثر", "الماعون", "قريش"];
const QURAN_ASSESSMENT_2_ITEMS = ["الفيل", "آية الكرسي"];
const QURAN_TRACKER_ITEMS = [
  "الكوثر",
  "الماعون",
  "قريش",
  "الفيل",
  "آية الكرسي",
];

const LEARNING_GARDENS_ASSESSMENT_1_ITEMS = ["ا", "ب", "ت", "ث", "ج", "ح"];
const LEARNING_GARDENS_ASSESSMENT_2_ITEMS = [
  "خ",
  "د",
  "ذ",
  "ر",
  "ز",
  "س",
  "ش",
];
const LEARNING_GARDENS_TRACKER_ITEMS = [
  "ا",
  "ب",
  "ت",
  "ث",
  "ج",
  "ح",
  "خ",
  "د",
  "ذ",
  "ر",
  "ز",
  "س",
  "ش",
];

const NUMBERS_ITEMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const assessmentTemplates = [
  buildAssessmentTemplate({
    id: "kg1-quran-class-teacher-assessment-1",
    code: "KG1_QURAN_CLASS_TEACHER_ASSESSMENT_1",
    title: "القرآن — المستوى الأول — معلمة الصف — القياس الأول",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    category: "QURAN",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    itemTitles: QURAN_ASSESSMENT_1_ITEMS,
    order: 1,
  }),

  buildAssessmentTemplate({
    id: "kg1-quran-class-teacher-assessment-2",
    code: "KG1_QURAN_CLASS_TEACHER_ASSESSMENT_2",
    title: "القرآن — المستوى الأول — معلمة الصف — القياس الثاني",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    category: "QURAN",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    itemTitles: QURAN_ASSESSMENT_2_ITEMS,
    order: 2,
  }),

  buildAssessmentTemplate({
    id: "kg1-learning-gardens-class-teacher-assessment-1",
    code: "KG1_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_1",
    title: "بساتين المعرفة — المستوى الأول — معلمة الصف — القياس الأول",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    category: "LEARNING_GARDENS",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    itemTitles: LEARNING_GARDENS_ASSESSMENT_1_ITEMS,
    order: 1,
  }),

  buildAssessmentTemplate({
    id: "kg1-learning-gardens-class-teacher-assessment-2",
    code: "KG1_LEARNING_GARDENS_CLASS_TEACHER_ASSESSMENT_2",
    title: "بساتين المعرفة — المستوى الأول — معلمة الصف — القياس الثاني",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    category: "LEARNING_GARDENS",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    itemTitles: LEARNING_GARDENS_ASSESSMENT_2_ITEMS,
    order: 2,
  }),

  buildAssessmentTemplate({
    id: "kg1-numbers-class-teacher-assessment-1",
    code: "KG1_NUMBERS_CLASS_TEACHER_ASSESSMENT_1",
    title: "الأرقام — المستوى الأول — معلمة الصف — القياس الأول",
    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",
    category: "NUMBERS",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    itemTitles: NUMBERS_ITEMS,
    order: 1,
  }),
];

const trackerTemplates = [
  buildTrackerTemplate({
    id: "kg1-quran-class-teacher-tracker",
    code: "KG1_QURAN_CLASS_TEACHER_TRACKER",
    title: "القرآن — المستوى الأول — معلمة الصف — المتابعة",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    category: "QURAN",
    kind: "KG_QURAN_TRACKER",
    defaultLessonTitle: "متابعة القرآن",
    itemTitles: QURAN_TRACKER_ITEMS,
    order: 100,
  }),

  buildTrackerTemplate({
    id: "kg1-learning-gardens-class-teacher-tracker",
    code: "KG1_LEARNING_GARDENS_CLASS_TEACHER_TRACKER",
    title: "بساتين المعرفة — المستوى الأول — معلمة الصف — المتابعة",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    category: "LEARNING_GARDENS",
    kind: "KG_LEARNING_GARDENS_TRACKER",
    defaultLessonTitle: "متابعة بساتين المعرفة",
    itemTitles: LEARNING_GARDENS_TRACKER_ITEMS,
    order: 100,
  }),

  buildTrackerTemplate({
    id: "kg1-numbers-class-teacher-tracker",
    code: "KG1_NUMBERS_CLASS_TEACHER_TRACKER",
    title: "الأرقام — المستوى الأول — معلمة الصف — المتابعة",
    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",
    category: "NUMBERS",
    kind: "KG_NUMBERS_TRACKER",
    defaultLessonTitle: "متابعة الأرقام",
    itemTitles: NUMBERS_ITEMS,
    order: 100,
  }),
];

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
    assessmentSlot: template.assessmentSlot,
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

  console.log("Creating KG1 class-teacher templates...");
  console.log({
    orgId,
    dryRun,
    itemMaxScore: ITEM_MAX_SCORE,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
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
  console.error("Failed to create KG1 class-teacher templates.");
  console.error(error);
  process.exit(1);
});