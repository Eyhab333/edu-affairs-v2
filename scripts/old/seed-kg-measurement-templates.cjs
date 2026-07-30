const admin = require("firebase-admin");

const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CONFIG = {
  orgId: "takween",
  dryRun: false,

  /**
   * حد الفاقد للروضات بالنسبة المئوية.
   * إذا حصل الطالب على نسبة أقل من أو تساوي هذا الحد، يفتح له فاقد.
   */
  kgLearningLossThresholdPercentage: 60,

  /**
   * درجة البنود التي ليس لها درجة خاصة مكتوبة.
   * اتفقنا مؤقتًا أن الحروف والسور والأرقام في المتابعات = 3 لكل بند.
   */
  defaultItemMaxScore: 3,
};

function nowMs() {
  return Date.now();
}

function slugifyArabicSafe(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9-_]/g, "")
    .toLowerCase();
}

function makeItem(itemKey, itemTitle, maxScore, order, extra = {}) {
  return {
    itemKey,
    itemId: itemKey,
    itemTitle,
    category: extra.category || "",
    valueType: extra.valueType || "NUMERIC",
    maxScore,
    weight: typeof extra.weight === "number" ? extra.weight : 1,
    affectsTotal:
      typeof extra.affectsTotal === "boolean" ? extra.affectsTotal : true,
    required: typeof extra.required === "boolean" ? extra.required : true,
    description: extra.description || "",
    helpText: extra.helpText || "",
    order,
  };
}

function itemsFromTitles(titles, prefix, maxScore) {
  return titles.map((title, index) =>
    makeItem(`${prefix}-${index + 1}-${slugifyArabicSafe(title)}`, title, maxScore, index + 1)
  );
}

function sumMaxScore(templateItems) {
  return templateItems.reduce((sum, item) => {
    if (item.affectsTotal === false) return sum;
    return sum + (typeof item.maxScore === "number" ? item.maxScore : 0);
  }, 0);
}

function assessmentTemplate({
  id,
  title,
  code,
  kind,
  assessmentSlot,
  gradeIds,
  templateItems,
  order,
  description = "",
  subjectKey = "",
}) {
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    orgId: CONFIG.orgId,
    schoolId: "",
    schoolType: "KG",

    title,
    kind,
    assessmentSlot,

    evaluatorRoleKey: "KG_TEACHER",
    code,
    description,
    subjectKey,
    order,

    maxScore,
    scoreType: "NUMERIC",
    passingScore: undefined,

    templateItems,

    applicableGradeIds: gradeIds,
    applicableGradeCodes: [],
    applicableClassIds: [],
    applicableStreamIds: [],

    requiresLearningLossFollowUp: true,
    learningLossThresholdScore: admin.firestore.FieldValue.delete(),
    learningLossThresholdPercentage: CONFIG.kgLearningLossThresholdPercentage,

    isActive: true,
  };
}

function trackerTemplate({
  id,
  title,
  code,
  kind,
  gradeIds,
  templateItems,
  order,
  description = "",
  subjectKey = "",
  defaultLessonTitle = "",
}) {
  const maxScore = sumMaxScore(templateItems);

  return {
    id,
    orgId: CONFIG.orgId,
    schoolId: "",
    schoolType: "KG",

    title,
    kind,

    evaluatorRoleKey: "KG_TEACHER",
    code,
    description,
    subjectKey,

    scoreType: "NUMERIC",
    maxScore,
    defaultLessonTitle,
    isContinuous: true,

    templateItems,

    /**
     * هذه حقول ليست في السكيمة القديمة لقوالب المتابعة، لكنها مفيدة للفلترة لاحقًا.
     * الواجهة الحالية لن تعتمد عليها إلا بعد تعديل hook لاحقًا.
     */
    applicableGradeIds: gradeIds,
    applicableGradeCodes: [],
    applicableClassIds: [],
    applicableStreamIds: [],

    isActive: true,
    order,
  };
}

const basateenPairItems = [
  makeItem("letters-two", "حرفان", 7, 1, { category: "BASATEEN" }),
  makeItem("words", "كلمات", 8, 2, { category: "BASATEEN" }),
];

const KG1_BASATEEN_ASSESSMENT_1_ITEMS = itemsFromTitles(
  ["ا", "ب", "ت", "ث", "ج", "ح"],
  "kg1-basateen-assessment-1",
  CONFIG.defaultItemMaxScore
);

const KG1_BASATEEN_ASSESSMENT_2_ITEMS = itemsFromTitles(
  ["خ", "د", "ذ", "ر", "ز", "س", "ش"],
  "kg1-basateen-assessment-2",
  CONFIG.defaultItemMaxScore
);

const KG1_QURAN_ASSESSMENT_1_ITEMS = itemsFromTitles(
  ["الكوثر", "الماعون", "قريش"],
  "kg1-quran-assessment-1",
  CONFIG.defaultItemMaxScore
);

const KG1_QURAN_ASSESSMENT_2_ITEMS = itemsFromTitles(
  ["الفيل", "آية الكرسي"],
  "kg1-quran-assessment-2",
  CONFIG.defaultItemMaxScore
);

const KG2_QURAN_ITEMS_TEMP = itemsFromTitles(
  ["الهمزة", "العصر", "التكاثر", "القارعة", "آية الكرسي"],
  "kg2-quran-assessment",
  CONFIG.defaultItemMaxScore
);

const KG3_QURAN_ASSESSMENT_1_ITEMS = itemsFromTitles(
  ["الهمزة", "العصر", "التكاثر", "القارعة", "العاديات", "الزلزلة"],
  "kg3-quran-assessment-1",
  CONFIG.defaultItemMaxScore
);

const KG3_QURAN_ASSESSMENT_2_ITEMS = itemsFromTitles(
  ["البينة", "آية الكرسي", "خواتيم سورة البقرة"],
  "kg3-quran-assessment-2",
  CONFIG.defaultItemMaxScore
);

const KG1_QURAN_TRACKER_ITEMS = itemsFromTitles(
  ["الكوثر", "الماعون", "قريش", "الفيل", "آية الكرسي"],
  "kg1-quran-tracker",
  CONFIG.defaultItemMaxScore
);

const KG1_BASATEEN_TRACKER_ITEMS = itemsFromTitles(
  ["ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش"],
  "kg1-basateen-tracker",
  CONFIG.defaultItemMaxScore
);

const KG1_NUMBERS_TRACKER_ITEMS = itemsFromTitles(
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  "kg1-numbers-tracker",
  CONFIG.defaultItemMaxScore
);

const assessmentTemplates = [
  assessmentTemplate({
    id: "kg-basateen-kg1-assessment-1",
    title: "بساتين المعرفة — المستوى الأول — القياس الأول",
    code: "KG1_BASATEEN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg1"],
    templateItems: KG1_BASATEEN_ASSESSMENT_1_ITEMS,
    order: 101,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg1-assessment-2",
    title: "بساتين المعرفة — المستوى الأول — القياس الثاني",
    code: "KG1_BASATEEN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg1"],
    templateItems: KG1_BASATEEN_ASSESSMENT_2_ITEMS,
    order: 102,
    subjectKey: "KG_BASATEEN",
  }),

  assessmentTemplate({
    id: "kg-basateen-kg2-pre",
    title: "بساتين المعرفة — المستوى الثاني — القياس القبلي",
    code: "KG2_BASATEEN_PRE",
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    gradeIds: ["kg2"],
    templateItems: basateenPairItems,
    order: 201,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg2-assessment-1",
    title: "بساتين المعرفة — المستوى الثاني — القياس الأول",
    code: "KG2_BASATEEN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg2"],
    templateItems: basateenPairItems,
    order: 202,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg2-assessment-2",
    title: "بساتين المعرفة — المستوى الثاني — القياس الثاني",
    code: "KG2_BASATEEN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg2"],
    templateItems: basateenPairItems,
    order: 203,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg2-assessment-3",
    title: "بساتين المعرفة — المستوى الثاني — القياس الثالث",
    code: "KG2_BASATEEN_ASSESSMENT_3",
    kind: "KG_MEASUREMENT_3",
    assessmentSlot: "KG_MEASUREMENT_3",
    gradeIds: ["kg2"],
    templateItems: basateenPairItems,
    order: 204,
    subjectKey: "KG_BASATEEN",
  }),

  assessmentTemplate({
    id: "kg-basateen-kg3-assessment-1",
    title: "بساتين المعرفة — المستوى الثالث — القياس الأول",
    code: "KG3_BASATEEN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg3"],
    templateItems: basateenPairItems,
    order: 301,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg3-assessment-2",
    title: "بساتين المعرفة — المستوى الثالث — القياس الثاني",
    code: "KG3_BASATEEN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg3"],
    templateItems: basateenPairItems,
    order: 302,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg3-assessment-3",
    title: "بساتين المعرفة — المستوى الثالث — القياس الثالث",
    code: "KG3_BASATEEN_ASSESSMENT_3",
    kind: "KG_MEASUREMENT_3",
    assessmentSlot: "KG_MEASUREMENT_3",
    gradeIds: ["kg3"],
    templateItems: basateenPairItems,
    order: 303,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg3-assessment-4",
    title: "بساتين المعرفة — المستوى الثالث — القياس الرابع",
    code: "KG3_BASATEEN_ASSESSMENT_4",
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    gradeIds: ["kg3"],
    templateItems: basateenPairItems,
    order: 304,
    subjectKey: "KG_BASATEEN",
  }),
  assessmentTemplate({
    id: "kg-basateen-kg3-assessment-5",
    title: "بساتين المعرفة — المستوى الثالث — القياس الخامس",
    code: "KG3_BASATEEN_ASSESSMENT_5",
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",
    gradeIds: ["kg3"],
    templateItems: basateenPairItems,
    order: 305,
    subjectKey: "KG_BASATEEN",
  }),

  assessmentTemplate({
    id: "kg-quran-kg1-assessment-1",
    title: "القرآن — المستوى الأول — القياس الأول",
    code: "KG1_QURAN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg1"],
    templateItems: KG1_QURAN_ASSESSMENT_1_ITEMS,
    order: 401,
    subjectKey: "KG_QURAN",
  }),
  assessmentTemplate({
    id: "kg-quran-kg1-assessment-2",
    title: "القرآن — المستوى الأول — القياس الثاني",
    code: "KG1_QURAN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg1"],
    templateItems: KG1_QURAN_ASSESSMENT_2_ITEMS,
    order: 402,
    subjectKey: "KG_QURAN",
  }),

  assessmentTemplate({
    id: "kg-quran-kg2-assessment-1",
    title: "القرآن — المستوى الثاني — القياس الأول",
    code: "KG2_QURAN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg2"],
    templateItems: KG2_QURAN_ITEMS_TEMP,
    order: 501,
    subjectKey: "KG_QURAN",
  }),
  assessmentTemplate({
    id: "kg-quran-kg2-assessment-2",
    title: "القرآن — المستوى الثاني — القياس الثاني",
    code: "KG2_QURAN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg2"],
    templateItems: KG2_QURAN_ITEMS_TEMP,
    order: 502,
    subjectKey: "KG_QURAN",
  }),

  assessmentTemplate({
    id: "kg-quran-kg3-assessment-1",
    title: "القرآن — المستوى الثالث — القياس الأول",
    code: "KG3_QURAN_ASSESSMENT_1",
    kind: "KG_MEASUREMENT_1",
    assessmentSlot: "KG_MEASUREMENT_1",
    gradeIds: ["kg3"],
    templateItems: KG3_QURAN_ASSESSMENT_1_ITEMS,
    order: 601,
    subjectKey: "KG_QURAN",
  }),
  assessmentTemplate({
    id: "kg-quran-kg3-assessment-2",
    title: "القرآن — المستوى الثالث — القياس الثاني",
    code: "KG3_QURAN_ASSESSMENT_2",
    kind: "KG_MEASUREMENT_2",
    assessmentSlot: "KG_MEASUREMENT_2",
    gradeIds: ["kg3"],
    templateItems: KG3_QURAN_ASSESSMENT_2_ITEMS,
    order: 602,
    subjectKey: "KG_QURAN",
  }),
];

const trackerTemplates = [
  trackerTemplate({
    id: "kg1-quran-tracker",
    title: "متابعة القرآن — المستوى الأول",
    code: "KG1_QURAN_TRACKER",
    kind: "KG_QURAN_TRACKER",
    gradeIds: ["kg1"],
    templateItems: KG1_QURAN_TRACKER_ITEMS,
    order: 701,
    subjectKey: "KG_QURAN",
  }),
  trackerTemplate({
    id: "kg1-basateen-tracker",
    title: "متابعة بساتين المعرفة — المستوى الأول",
    code: "KG1_BASATEEN_TRACKER",
    kind: "KG_LEARNING_GARDENS_TRACKER",
    gradeIds: ["kg1"],
    templateItems: KG1_BASATEEN_TRACKER_ITEMS,
    order: 702,
    subjectKey: "KG_BASATEEN",
  }),
  trackerTemplate({
    id: "kg1-numbers-tracker",
    title: "متابعة الأرقام — المستوى الأول",
    code: "KG1_NUMBERS_TRACKER",
    kind: "KG_NUMBERS_TRACKER",
    gradeIds: ["kg1"],
    templateItems: KG1_NUMBERS_TRACKER_ITEMS,
    order: 703,
    subjectKey: "KG_NUMBERS",
  }),
];

async function upsertDocs(collectionName, templates) {
  const now = nowMs();
  const batch = db.batch();

  for (const template of templates) {
    const ref = db
      .collection("orgs")
      .doc(CONFIG.orgId)
      .collection(collectionName)
      .doc(template.id);

    const cleanTemplate = Object.fromEntries(
      Object.entries({
        ...template,
        createdAt: now,
        updatedAt: now,
      }).filter(([, value]) => value !== undefined)
    );

    console.log("----------------------------------------");
    console.log("collection:", collectionName);
    console.log("id:", template.id);
    console.log("title:", template.title);
    console.log("items:", template.templateItems.length);
    console.log("maxScore:", template.maxScore);

    if (!CONFIG.dryRun) {
      batch.set(ref, cleanTemplate, { merge: true });
    }
  }

  if (!CONFIG.dryRun) {
    await batch.commit();
  }
}

async function main() {
  console.log("بدء Seed قوالب الروضات المرنة...");
  console.log("CONFIG:", CONFIG);

  await upsertDocs("studentAssessmentTemplates", assessmentTemplates);
  await upsertDocs("studentTrackerTemplates", trackerTemplates);

  console.log("----------------------------------------");
  if (CONFIG.dryRun) {
    console.log("DRY RUN فقط — لم يتم تعديل Firestore.");
  } else {
    console.log("تم Seed قوالب الروضات بنجاح.");
  }

  console.log("Assessment templates:", assessmentTemplates.length);
  console.log("Tracker templates:", trackerTemplates.length);
}

main().catch((error) => {
  console.error("حدث خطأ:", error);
  process.exit(1);
});