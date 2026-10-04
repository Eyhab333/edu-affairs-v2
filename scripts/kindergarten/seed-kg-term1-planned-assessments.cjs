"use strict";

/**
 * Adds the NEW 1448 / term-1 KG planned assessment templates:
 *
 * Learning Gardens:
 * - 3 vice-principal assessments
 * - 3 supervisor assessments
 *
 * Quran:
 * - 5 teacher assessments
 * - 3 vice-principal assessments
 *
 * Count & Calculate:
 * - 4 teacher assessments
 * - 3 vice-principal assessments
 *
 * Total: 21 templates.
 *
 * Safety rules:
 * - Dry run is the default.
 * - Writes require BOTH --apply and the exact --confirm token below.
 * - An existing target document aborts apply; this script never overwrites it.
 * - The only write target is:
 *   orgs/takween/studentAssessmentTemplates/{targetId}
 */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = "takween";
const COLLECTION_NAME = "studentAssessmentTemplates";

const CONFIRMATION_TOKEN = "KG_TERM1_PLANNED_ASSESSMENTS";

const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(
  `--confirm=${CONFIRMATION_TOKEN}`,
);

const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;

const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";

const LEARNING_LOSS_THRESHOLD_PERCENTAGE = 60;

const LEVEL_TITLES = {
  kg1: "المستوى الأول",
  kg2: "المستوى الثاني",
  kg3: "المستوى الثالث",
};

const WEEK_TITLES = {
  10: "العاشر",
  11: "الحادي عشر",
  15: "الخامس عشر",
  17: "السابع عشر",
};

/*
 * ==========================================================
 * Subjects
 * ==========================================================
 */

const SUBJECTS = {
  LEARNING_GARDENS: {
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
  },

  QURAN: {
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن الكريم",
  },

  COUNT_AND_CALCULATE: {
    subjectKey: "COUNT_AND_CALCULATE",
    subjectId: "count-and-calculate",
    subjectTitle: "نعد ونحسب",
  },
};

/*
 * ==========================================================
 * Quran curricula
 * ==========================================================
 */

const QURAN_FIRST_GROUP = [
  "الفاتحة",
  "الناس",
  "الفلق",
  "الإخلاص",
  "المسد",
  "النصر",
  "الكافرون",
];

const QURAN_SECOND_GROUP = [
  "الكوثر",
  "الماعون",
  "قريش",
  "الفيل",
];

const QURAN_FULL_GROUP = [
  ...QURAN_FIRST_GROUP,
  ...QURAN_SECOND_GROUP,
];

/*
 * ==========================================================
 * Helpers
 * ==========================================================
 */

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Validation failed: ${message}`);
  }
}

function sumItemMaxScores(items) {
  return items.reduce((sum, item) => sum + item.maxScore, 0);
}

function scoreItems(titles) {
  return titles.map((title) => ({
    title,
    maxScore: 3,
  }));
}

function numberItems(from, to) {
  const items = [];

  for (let number = from; number <= to; number += 1) {
    items.push({
      title: `العدد ${number}`,
      maxScore: 3,
    });
  }

  return items;
}

function buildTemplateItems(templateId, subjectKey, definitions) {
  return definitions.map((item, index) => {
    const order = index + 1;
    const itemId = `${templateId}-${order}`;

    return {
      itemKey: itemId,
      itemId,

      itemTitle: item.title,
      title: item.title,

      category: subjectKey,

      valueType: "NUMERIC",
      maxScore: item.maxScore,

      weight: 1,
      affectsTotal: true,
      required: true,

      order,
    };
  });
}

function buildTemplate({
  id,
  code,
  title,

  gradeId,

  subject,
  evaluatorRoleKey,

  scheduledWeek,

  itemDefinitions,

  order,
}) {
  const templateItems = buildTemplateItems(
    id,
    subject.subjectKey,
    itemDefinitions,
  );

  const maxScore = sumItemMaxScores(templateItems);

  return {
    id,
    code,
    title,

    orgId: ORG_ID,

    schoolType: "KG",
    schoolId: "",

    academicYearId: ACADEMIC_YEAR_ID,
    applicableTermIds: [TERM_ID],

    gradeId,

    subjectKey: subject.subjectKey,
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,

    /*
     * These are additional assessments, not the existing KG_MEASUREMENT_1/2/3
     * slots.
     */
    kind: "CUSTOM_ASSESSMENT",
    assessmentSlot: "CUSTOM",

    evaluatorRoleKey,

    maxScore,
    scoreType: "NUMERIC",
    totalScoreLabel: `المجموع: ${maxScore}`,

    templateItems,

    /*
     * Keep the planned week as metadata even when it is intentionally
     * omitted from the visible title, e.g. vice-principal assessments.
     */
    scheduledWeek,

    requiresLearningLossFollowUp: true,
    learningLossThresholdPercentage:
      LEARNING_LOSS_THRESHOLD_PERCENTAGE,

    isActive: true,
    status: "ACTIVE",

    order,

    source: "seed-kg-term1-planned-assessments",
  };
}

/*
 * ==========================================================
 * Learning Gardens
 * ==========================================================
 *
 * Existing teacher assessments are NOT recreated here.
 *
 * New:
 * - Vice principal: week 10
 * - Supervisor: week 17
 *
 * Each assessment:
 * حروف 3
 * كلمات 3
 * Total = 6
 */

function buildLearningGardensTemplates() {
  const subject = SUBJECTS.LEARNING_GARDENS;

  return ["kg1", "kg2", "kg3"].flatMap((gradeId, levelIndex) => {
    const levelTitle = LEVEL_TITLES[gradeId];

    const vicePrincipalId =
      `${gradeId}-learning-gardens-ay1448-term1-vp-assessment`;

    const supervisorId =
      `${gradeId}-learning-gardens-ay1448-term1-supervisor-assessment`;

    return [
      buildTemplate({
        id: vicePrincipalId,

        code:
          `${gradeId.toUpperCase()}_LEARNING_GARDENS_AY1448_TERM1_VP_ASSESSMENT`,

        title:
          `بساتين المعرفة — ${levelTitle} — قياس الوكيلة`,

        gradeId,

        subject,

        evaluatorRoleKey: "KG_VP",

        scheduledWeek: 10,

        itemDefinitions: scoreItems([
          "حروف",
          "كلمات",
        ]),

        order: 301 + levelIndex * 2,
      }),

      buildTemplate({
        id: supervisorId,

        code:
          `${gradeId.toUpperCase()}_LEARNING_GARDENS_AY1448_TERM1_SUPERVISOR_ASSESSMENT`,

        title:
          `بساتين المعرفة — ${levelTitle} — قياس المشرفة`,

        gradeId,

        subject,

        evaluatorRoleKey: "EDU_SUPERVISOR",

        scheduledWeek: 17,

        itemDefinitions: scoreItems([
          "حروف",
          "كلمات",
        ]),

        order: 302 + levelIndex * 2,
      }),
    ];
  });
}

/*
 * ==========================================================
 * Quran
 * ==========================================================
 *
 * Every Surah = 3 points.
 *
 * KG1:
 * - Teacher week 17: Al-Fatiha -> Al-Kafirun = 7 items = 21
 * - VP week 15: same 7 items = 21
 *
 * KG2:
 * - Teacher 1 week 10: first 7 = 21
 * - Teacher 2 week 17: second 4 = 12
 * - VP week 15: full 11 = 33
 *
 * KG3:
 * - Teacher 1 week 10: first 7 = 21
 * - Teacher 2 week 17: second 4 = 12
 * - VP week 15: full 11 = 33
 */

function buildQuranTemplates() {
  const subject = SUBJECTS.QURAN;

  return [
    /*
     * KG1
     */
    buildTemplate({
      id:
        "kg1-quran-ay1448-term1-teacher-week17-assessment",

      code:
        "KG1_QURAN_AY1448_TERM1_TEACHER_WEEK17_ASSESSMENT",

      title:
        "القرآن الكريم — المستوى الأول — قياس المعلمة — الفصل الدراسي الأول — الأسبوع السابع عشر",

      gradeId: "kg1",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 17,

      itemDefinitions: scoreItems(QURAN_FIRST_GROUP),

      order: 401,
    }),

    buildTemplate({
      id:
        "kg1-quran-ay1448-term1-vp-assessment",

      code:
        "KG1_QURAN_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "القرآن الكريم — المستوى الأول — قياس الوكيلة",

      gradeId: "kg1",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: scoreItems(QURAN_FIRST_GROUP),

      order: 402,
    }),

    /*
     * KG2
     */
    buildTemplate({
      id:
        "kg2-quran-ay1448-term1-teacher-week10-assessment-1",

      code:
        "KG2_QURAN_AY1448_TERM1_TEACHER_WEEK10_ASSESSMENT_1",

      title:
        "القرآن الكريم — المستوى الثاني — قياس المعلمة الأول — الفصل الدراسي الأول — الأسبوع العاشر",

      gradeId: "kg2",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 10,

      itemDefinitions: scoreItems(QURAN_FIRST_GROUP),

      order: 403,
    }),

    buildTemplate({
      id:
        "kg2-quran-ay1448-term1-teacher-week17-assessment-2",

      code:
        "KG2_QURAN_AY1448_TERM1_TEACHER_WEEK17_ASSESSMENT_2",

      title:
        "القرآن الكريم — المستوى الثاني — قياس المعلمة الثاني — الفصل الدراسي الأول — الأسبوع السابع عشر",

      gradeId: "kg2",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 17,

      itemDefinitions: scoreItems(QURAN_SECOND_GROUP),

      order: 404,
    }),

    buildTemplate({
      id:
        "kg2-quran-ay1448-term1-vp-assessment",

      code:
        "KG2_QURAN_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "القرآن الكريم — المستوى الثاني — قياس الوكيلة",

      gradeId: "kg2",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: scoreItems(QURAN_FULL_GROUP),

      order: 405,
    }),

    /*
     * KG3
     */
    buildTemplate({
      id:
        "kg3-quran-ay1448-term1-teacher-week10-assessment-1",

      code:
        "KG3_QURAN_AY1448_TERM1_TEACHER_WEEK10_ASSESSMENT_1",

      title:
        "القرآن الكريم — المستوى الثالث — قياس المعلمة الأول — الفصل الدراسي الأول — الأسبوع العاشر",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 10,

      itemDefinitions: scoreItems(QURAN_FIRST_GROUP),

      order: 406,
    }),

    buildTemplate({
      id:
        "kg3-quran-ay1448-term1-teacher-week17-assessment-2",

      code:
        "KG3_QURAN_AY1448_TERM1_TEACHER_WEEK17_ASSESSMENT_2",

      title:
        "القرآن الكريم — المستوى الثالث — قياس المعلمة الثاني — الفصل الدراسي الأول — الأسبوع السابع عشر",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 17,

      itemDefinitions: scoreItems(QURAN_SECOND_GROUP),

      order: 407,
    }),

    buildTemplate({
      id:
        "kg3-quran-ay1448-term1-vp-assessment",

      code:
        "KG3_QURAN_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "القرآن الكريم — المستوى الثالث — قياس الوكيلة",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: scoreItems(QURAN_FULL_GROUP),

      order: 408,
    }),
  ];
}

/*
 * ==========================================================
 * Count & Calculate
 * ==========================================================
 *
 * Every number = 3 points.
 *
 * KG1:
 * - Teacher week 17: numbers 1-7 = 21
 * - VP week 15: numbers 1-7 = 21
 *
 * KG2:
 * - Teacher week 17: numbers 1-10 = 30
 * - VP week 15: numbers 1-10 = 30
 *
 * KG3:
 * - Teacher 1 week 11: numbers 1-8 = 24
 * - Teacher 2 week 15: numbers 9-15 = 21
 * - VP week 15: numbers 1-15 = 45
 */

function buildCountTemplates() {
  const subject = SUBJECTS.COUNT_AND_CALCULATE;

  return [
    /*
     * KG1
     */
    buildTemplate({
      id:
        "kg1-count-and-calculate-ay1448-term1-teacher-week17-assessment",

      code:
        "KG1_COUNT_AND_CALCULATE_AY1448_TERM1_TEACHER_WEEK17_ASSESSMENT",

      title:
        "نعد ونحسب — المستوى الأول — قياس المعلمة — الفصل الدراسي الأول — الأسبوع السابع عشر",

      gradeId: "kg1",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 17,

      itemDefinitions: numberItems(1, 7),

      order: 501,
    }),

    buildTemplate({
      id:
        "kg1-count-and-calculate-ay1448-term1-vp-assessment",

      code:
        "KG1_COUNT_AND_CALCULATE_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "نعد ونحسب — المستوى الأول — قياس الوكيلة",

      gradeId: "kg1",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: numberItems(1, 7),

      order: 502,
    }),

    /*
     * KG2
     */
    buildTemplate({
      id:
        "kg2-count-and-calculate-ay1448-term1-teacher-week17-assessment",

      code:
        "KG2_COUNT_AND_CALCULATE_AY1448_TERM1_TEACHER_WEEK17_ASSESSMENT",

      title:
        "نعد ونحسب — المستوى الثاني — قياس المعلمة — الفصل الدراسي الأول — الأسبوع السابع عشر",

      gradeId: "kg2",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 17,

      itemDefinitions: numberItems(1, 10),

      order: 503,
    }),

    buildTemplate({
      id:
        "kg2-count-and-calculate-ay1448-term1-vp-assessment",

      code:
        "KG2_COUNT_AND_CALCULATE_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "نعد ونحسب — المستوى الثاني — قياس الوكيلة",

      gradeId: "kg2",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: numberItems(1, 10),

      order: 504,
    }),

    /*
     * KG3
     */
    buildTemplate({
      id:
        "kg3-count-and-calculate-ay1448-term1-teacher-week11-assessment-1",

      code:
        "KG3_COUNT_AND_CALCULATE_AY1448_TERM1_TEACHER_WEEK11_ASSESSMENT_1",

      title:
        "نعد ونحسب — المستوى الثالث — قياس المعلمة الأول — الفصل الدراسي الأول — الأسبوع الحادي عشر",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 11,

      itemDefinitions: numberItems(1, 8),

      order: 505,
    }),

    buildTemplate({
      id:
        "kg3-count-and-calculate-ay1448-term1-teacher-week15-assessment-2",

      code:
        "KG3_COUNT_AND_CALCULATE_AY1448_TERM1_TEACHER_WEEK15_ASSESSMENT_2",

      title:
        "نعد ونحسب — المستوى الثالث — قياس المعلمة الثاني — الفصل الدراسي الأول — الأسبوع الخامس عشر",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_TEACHER",

      scheduledWeek: 15,

      itemDefinitions: numberItems(9, 15),

      order: 506,
    }),

    buildTemplate({
      id:
        "kg3-count-and-calculate-ay1448-term1-vp-assessment",

      code:
        "KG3_COUNT_AND_CALCULATE_AY1448_TERM1_VP_ASSESSMENT",

      title:
        "نعد ونحسب — المستوى الثالث — قياس الوكيلة",

      gradeId: "kg3",

      subject,

      evaluatorRoleKey: "KG_VP",

      scheduledWeek: 15,

      itemDefinitions: numberItems(1, 15),

      order: 507,
    }),
  ];
}

/*
 * ==========================================================
 * Build all templates
 * ==========================================================
 */

function buildTemplates() {
  return [
    ...buildLearningGardensTemplates(),
    ...buildQuranTemplates(),
    ...buildCountTemplates(),
  ];
}

/*
 * ==========================================================
 * Validation
 * ==========================================================
 */

function validateTemplates(templates) {
  assert(
    templates.length === 21,
    "exactly 21 templates are required",
  );

  const uniqueIds = new Set(
    templates.map((template) => template.id),
  );

  const uniqueCodes = new Set(
    templates.map((template) => template.code),
  );

  assert(
    uniqueIds.size === templates.length,
    "template IDs must be unique",
  );

  assert(
    uniqueCodes.size === templates.length,
    "template codes must be unique",
  );

  const learningGardens = templates.filter(
    (template) =>
      template.subjectKey === "LEARNING_GARDENS",
  );

  const quran = templates.filter(
    (template) =>
      template.subjectKey === "QURAN",
  );

  const count = templates.filter(
    (template) =>
      template.subjectKey === "COUNT_AND_CALCULATE",
  );

  assert(
    learningGardens.length === 6,
    "Learning Gardens must have 6 templates",
  );

  assert(
    quran.length === 8,
    "Quran must have 8 templates",
  );

  assert(
    count.length === 7,
    "Count & Calculate must have 7 templates",
  );

  for (const template of templates) {
    const calculatedMaxScore =
      sumItemMaxScores(template.templateItems);

    assert(
      template.schoolType === "KG",
      `${template.id}: schoolType must be KG`,
    );

    assert(
      template.schoolId === "",
      `${template.id}: must be generic schoolId`,
    );

    assert(
      template.academicYearId === ACADEMIC_YEAR_ID,
      `${template.id}: academicYearId`,
    );

    assert(
      Array.isArray(template.applicableTermIds) &&
        template.applicableTermIds.length === 1 &&
        template.applicableTermIds[0] === TERM_ID,
      `${template.id}: applicableTermIds`,
    );

    assert(
      ["kg1", "kg2", "kg3"].includes(template.gradeId),
      `${template.id}: invalid gradeId`,
    );

    assert(
      [
        "KG_TEACHER",
        "KG_VP",
        "EDU_SUPERVISOR",
      ].includes(template.evaluatorRoleKey),
      `${template.id}: invalid evaluatorRoleKey`,
    );

    assert(
      template.kind === "CUSTOM_ASSESSMENT",
      `${template.id}: kind`,
    );

    assert(
      template.assessmentSlot === "CUSTOM",
      `${template.id}: assessmentSlot`,
    );

    assert(
      Number.isInteger(template.scheduledWeek) &&
        template.scheduledWeek > 0,
      `${template.id}: scheduledWeek`,
    );

    assert(
      template.templateItems.length > 0,
      `${template.id}: must contain items`,
    );

    assert(
      template.templateItems.every(
        (item) => item.maxScore === 3,
      ),
      `${template.id}: every item must have maxScore 3`,
    );

    assert(
      calculatedMaxScore === template.maxScore,
      `${template.id}: item sum must equal template maxScore`,
    );

    assert(
      template.totalScoreLabel ===
        `المجموع: ${template.maxScore}`,
      `${template.id}: totalScoreLabel`,
    );

    assert(
      template.requiresLearningLossFollowUp === true,
      `${template.id}: learning loss follow-up`,
    );

    assert(
      template.learningLossThresholdPercentage === 60,
      `${template.id}: learning loss threshold`,
    );

    /*
     * Vice-principal template titles must intentionally
     * NOT contain week wording.
     */
    if (template.evaluatorRoleKey === "KG_VP") {
      assert(
        !template.title.includes("الأسبوع"),
        `${template.id}: VP title must not contain week`,
      );

      assert(
        template.title.endsWith("قياس الوكيلة"),
        `${template.id}: VP title`,
      );
    }

    /*
     * Supervisor titles are also kept simple.
     */
    if (template.evaluatorRoleKey === "EDU_SUPERVISOR") {
      assert(
        !template.title.includes("الأسبوع"),
        `${template.id}: supervisor title must not contain week`,
      );

      assert(
        template.title.endsWith("قياس المشرفة"),
        `${template.id}: supervisor title`,
      );
    }
  }
}

/*
 * ==========================================================
 * Preview
 * ==========================================================
 */

function printTemplate(action, template) {
  console.log(
    `\n${action} ${COLLECTION_NAME}/${template.id}`,
  );

  console.log({
    title: template.title,

    gradeId: template.gradeId,

    academicYearId: template.academicYearId,

    termId: template.applicableTermIds[0],

    subjectKey: template.subjectKey,

    evaluatorRoleKey: template.evaluatorRoleKey,

    scheduledWeek: template.scheduledWeek,

    kind: template.kind,

    itemCount: template.templateItems.length,

    items: template.templateItems.map((item) => ({
      title: item.itemTitle,
      maxScore: item.maxScore,
    })),

    calculatedItemMaxScoreSum:
      sumItemMaxScores(template.templateItems),

    templateMaxScore: template.maxScore,
  });
}

/*
 * ==========================================================
 * Main
 * ==========================================================
 */

async function main() {
  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    throw new Error(
      `Refusing to apply without --confirm=${CONFIRMATION_TOKEN}.`,
    );
  }

  const templates = buildTemplates();

  validateTemplates(templates);

  initAdmin();

  const db = admin.firestore();

  const collectionRef = db.collection(
    `orgs/${ORG_ID}/${COLLECTION_NAME}`,
  );

  const targetSnapshots = await Promise.all(
    templates.map((template) =>
      collectionRef.doc(template.id).get(),
    ),
  );

  const existingIds = [];

  let created = 0;
  let updated = 0;

  for (
    let index = 0;
    index < templates.length;
    index += 1
  ) {
    const template = templates[index];
    const exists = targetSnapshots[index].exists;

    const action = exists ? "UPDATE" : "CREATE";

    if (exists) {
      updated += 1;
      existingIds.push(template.id);
    } else {
      created += 1;
    }

    printTemplate(action, template);
  }

  console.log("\nSummary");

  console.log({
    mode: APPLY ? "APPLY" : "DRY RUN",

    targetCollection:
      `orgs/${ORG_ID}/${COLLECTION_NAME}`,

    targetTemplates: templates.length,

    learningGardensTemplates:
      templates.filter(
        (item) =>
          item.subjectKey === "LEARNING_GARDENS",
      ).length,

    quranTemplates:
      templates.filter(
        (item) =>
          item.subjectKey === "QURAN",
      ).length,

    countTemplates:
      templates.filter(
        (item) =>
          item.subjectKey === "COUNT_AND_CALCULATE",
      ).length,

    created,
    updated,
  });

  if (existingIds.length > 0) {
    console.warn(
      `WARNING: ${existingIds.length} target ID(s) already exist. No existing document will be overwritten.`,
    );

    console.warn(existingIds);
  }

  if (!APPLY) {
    console.log(
      `\nDry run only.\nTo apply:\nnode scripts/kindergarten/seed-kg-term1-planned-assessments.cjs --apply --confirm=${CONFIRMATION_TOKEN}`,
    );

    return;
  }

  assert(
    existingIds.length === 0,
    "apply aborted because one or more target template IDs already exist",
  );

  const now = Date.now();

  const batch = db.batch();

  for (const template of templates) {
    batch.create(
      collectionRef.doc(template.id),
      {
        ...template,

        createdAt: now,
        updatedAt: now,
      },
    );
  }

  await batch.commit();

  console.log(
    `\nCreated ${templates.length} new assessment templates.`,
  );
}

main().catch((error) => {
  console.error(
    "KG term-1 planned assessments seed failed.",
  );

  console.error(error);

  process.exitCode = 1;
});