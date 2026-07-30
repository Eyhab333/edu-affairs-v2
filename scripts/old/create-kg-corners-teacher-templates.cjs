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

const CORNERS_ITEMS = [
  "تعرف على الأعداد وأشكالها",
  "يعد الأشياء بشكل صحيح",
  "ينفذ تمارين إدراكية منوعة",
  "يطابق الأشياء حسب خاصية معينة",
  "يميز بين الأشكال الهندسية",
  "يرتب الأشياء بتسلسل حسب خاصية معينة",
  "يوزع الأدوار في الركن الدرامي",
  "يوظف أدوات الركن بشكل يناسب الأدوار",
  "يتقمص أدوار مختلفة",
  "يشارك بالحوار مع زملائه في الموقف التمثيلي",
  "يحترم دور الآخرين باللعب",
  "يظهر سلوكيات إيجابية (مساعدة - مشاركة - احترام)",
  "يقرأ ويكتب الحروف",
  "يرسم الحروف بشكل صحيح",
  "يتتبع الحروف باستخدام النقاط",
  "يلون الحروف والأرقام بشكل صحيح",
  "يقبل على مراكز التعليم برغبة واستماع",
  "يمسك الأدوات بطريقة صحيحة (فرشاة - قلم - مقص - ألوان - وغيرها)",
  "يستخدم بطريقة صحيحة الرمل الملون أو الصلصال أو الألوان السائلة",
  "يعبر عن أفكاره بالرسم أو التشكيل",
  "يعمل بشكل مستقل",
  "يلون نماذج منوعة",
  "يتعاون مع زملائه",
  "يحافظ على ترتيب ونظافة الركن",
  "يشارك زملائه في الأعمال الجماعية",
  "يعيد المواد والأدوات إلى أماكنها بعد استخدامها",
  "يظهر مشاعر الفرح والإنجاز عند اكتمال عمله",
  "يتقبل التوجيه من المعلمة",
  "يطلب المساعدة من المعلمة أو من أصدقائه",
  "يظهر فضولاً للتجربة والاكتشاف",
  "يستخدم حواسه في الاكتشاف",
  "يصنف الأشياء حسب خاصية معينة",
  "يقوم بعمليات البناء ويضع خطط لذلك",
  "يتصفح القصص ويعبر عن الصور",
];

function makeItems(prefix) {
  return CORNERS_ITEMS.map((title, index) => {
    const order = index + 1;

    return {
      itemKey: `${prefix}-${order}`,
      itemId: `${prefix}-${order}`,
      itemTitle: title,
      title,
      category: "CORNERS",
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
  const id = "kg-corners-teacher-assessment-1";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG_CORNERS_TEACHER_ASSESSMENT_1",
    title: "الأركان والأنشطة — معلمة الأركان — القياس الأول",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "",
    applicableGradeIds: ["kg1", "kg2", "kg3"],

    subjectKey: "CORNERS",
    subjectId: "corners",
    subjectTitle: "الأركان / الأنشطة",

    kind: "KG_CORNERS_ASSESSMENT",
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

    ownerRoleKey: "KG_CORNERS_TEACHER",
    ownerRoleLabel: "معلمة الأركان",

    source: "create-kg-corners-teacher-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerTemplate() {
  const id = "kg-corners-teacher-tracker";
  const templateItems = makeItems(id);
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    code: "KG_CORNERS_TEACHER_TRACKER",
    title: "الأركان والأنشطة — معلمة الأركان — المتابعة",

    orgId,
    schoolType: "KG",
    schoolId: "",
    academicYearId: "",
    gradeId: "",
    applicableGradeIds: ["kg1", "kg2", "kg3"],

    subjectKey: "CORNERS",
    subjectId: "corners",
    subjectTitle: "الأركان / الأنشطة",

    kind: "KG_CORNERS_TRACKER",
    evaluatorRoleKey: "KG_TEACHER",

    defaultLessonTitle: "متابعة الأركان والأنشطة",
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

    ownerRoleKey: "KG_CORNERS_TEACHER",
    ownerRoleLabel: "معلمة الأركان",

    source: "create-kg-corners-teacher-templates",
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

  console.log("Creating KG Corners teacher templates...");
  console.log({
    orgId,
    dryRun,
    itemMaxScore: ITEM_MAX_SCORE,
    learningLossThresholdPercentage: LEARNING_LOSS_THRESHOLD_PERCENTAGE,
    applicableGradeIds: ["kg1", "kg2", "kg3"],
    itemsCount: CORNERS_ITEMS.length,
    totalMaxScore: CORNERS_ITEMS.length * ITEM_MAX_SCORE,
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
  console.error("Failed to create KG Corners teacher templates.");
  console.error(error);
  process.exit(1);
});