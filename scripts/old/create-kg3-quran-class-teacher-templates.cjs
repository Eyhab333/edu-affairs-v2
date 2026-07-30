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

function makeItem(prefix, title, order) {
  return {
    itemKey: `${prefix}-${order}`,
    itemId: `${prefix}-${order}`,
    itemTitle: title,
    title,
    category: "QURAN",
    valueType: "NUMERIC",
    maxScore: ITEM_MAX_SCORE,
    weight: 1,
    affectsTotal: true,
    order,
  };
}

function makeItems(prefix, titles) {
  return titles.map((title, index) => makeItem(prefix, title, index + 1));
}

function sumMaxScore(items) {
  return items.reduce((sum, item) => sum + item.maxScore, 0);
}

function buildAssessmentTemplate({
  id,
  code,
  title,
  kind,
  assessmentSlot,
  itemTitles,
}) {
  const templateItems = makeItems(id, itemTitles);
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

    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",

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

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg3-quran-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate({ id, code, title, itemTitles }) {
  const templateItems = makeItems(id, itemTitles);
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

    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",

    kind: "KG_QURAN_TRACKER",
    evaluatorRoleKey: "KG_TEACHER",

    defaultLessonTitle: "متابعة القرآن",
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

    ownerRoleKey: "KG_CLASS_TEACHER",
    ownerRoleLabel: "معلمة الصف",

    source: "create-kg3-quran-class-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

const assessmentTemplates = [
  buildAssessmentTemplate({
    id: "kg3-quran-class-teacher-assessment-1",
    code: "KG3_QURAN_CLASS_TEACHER_ASSESSMENT_1",
    title: "القرآن — المستوى الثالث — معلمة الصف — القياس الأول",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    itemTitles: [
      "الهمزة",
      "العصر",
      "التكاثر",
      "القارعة",
      "العاديات",
      "الزلزلة",
    ],
  }),

  buildAssessmentTemplate({
    id: "kg3-quran-class-teacher-assessment-2",
    code: "KG3_QURAN_CLASS_TEACHER_ASSESSMENT_2",
    title: "القرآن — المستوى الثالث — معلمة الصف — القياس الثاني",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    itemTitles: ["البينة", "آية الكرسي", "خواتيم سورة البقرة"],
  }),
];

const trackerTemplates = [
  buildTrackerTemplate({
    id: "kg3-quran-class-teacher-tracker",
    code: "KG3_QURAN_CLASS_TEACHER_TRACKER",
    title: "القرآن — المستوى الثالث — معلمة الصف — المتابعة",
    itemTitles: [
      "الهمزة",
      "العصر",
      "التكاثر",
      "القارعة",
      "العاديات",
      "الزلزلة",
      "البينة",
      "آية الكرسي",
      "خواتيم سورة البقرة",
    ],
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

  console.log("Creating KG3 Quran class-teacher templates...");
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
  console.error("Failed to create KG3 Quran class-teacher templates.");
  console.error(error);
  process.exit(1);
});