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

const MAX_SCORE = 20;
const LEARNING_LOSS_THRESHOLD_SCORE = 11;

const APPLICABLE_GRADE_IDS = ["g1", "g2", "g3", "g4", "g5", "g6"];
const APPLICABLE_TERM_IDS = ["term-1", "term-2"];

const SUBJECTS = [
  {
    key: "ARABIC",
    slug: "arabic",
    subjectId: "subject-arabic",
    title: "لغتي",
  },
  {
    key: "ENGLISH",
    slug: "english",
    subjectId: "subject-english",
    title: "إنجليزي",
  },
  {
    key: "MATH",
    slug: "math",
    subjectId: "subject-math",
    title: "رياضيات",
  },
  {
    key: "SCIENCE",
    slug: "science",
    subjectId: "subject-science",
    title: "علوم",
  },
  {
    key: "QURAN",
    slug: "quran",
    subjectId: "subject-quran",
    title: "قرآن",
  },
  {
    key: "ISLAMIC_STUDIES",
    slug: "islamic-studies",
    subjectId: "subject-islamic-studies",
    title: "دراسات",
  },
  {
    key: "QURAN_AND_ISLAMIC_STUDIES",
    slug: "quran-and-islamic-studies",
    subjectId: "subject-quran-and-islamic-studies",
    title: "قرآن ودراسات",
  },
  {
    key: "LIFE_SKILLS",
    slug: "life-skills",
    subjectId: "subject-life-skills",
    title: "حياتية",
  },
  {
    key: "ART",
    slug: "art",
    subjectId: "subject-art",
    title: "فنية",
  },
  {
    key: "PE",
    slug: "pe",
    subjectId: "subject-pe",
    title: "بدنية",
  },
  {
    key: "SOCIAL_STUDIES",
    slug: "social-studies",
    subjectId: "subject-social-studies",
    title: "اجتماعيات",
  },
  {
    key: "DIGITAL",
    slug: "digital",
    subjectId: "subject-digital",
    title: "رقمية",
  },
  {
    key: "TAJWEED",
    slug: "tajweed",
    subjectId: "subject-tajweed",
    title: "تجويد",
  },
];

const ASSESSMENT_TYPES = [
  {
    slug: "diagnostic",
    codeSuffix: "DIAGNOSTIC",
    title: "اختبار تشخيصي",
    kind: "PRIMARY_DIAGNOSTIC_TEST",
    assessmentSlot: "PRIMARY_DIAGNOSTIC",
    order: 1,
  },
  {
    slug: "periodic-1",
    codeSuffix: "PERIODIC_1",
    title: "الاختبار الفتري الأول",
    kind: "PRIMARY_PERIODIC_TEST_1",
    assessmentSlot: "PRIMARY_PERIODIC_1",
    order: 2,
  },
  {
    slug: "periodic-2",
    codeSuffix: "PERIODIC_2",
    title: "الاختبار الفتري الثاني",
    kind: "PRIMARY_PERIODIC_TEST_2",
    assessmentSlot: "PRIMARY_PERIODIC_2",
    order: 3,
  },
  {
    slug: "central-1",
    codeSuffix: "CENTRAL_1",
    title: "القياس المركزي الأول",
    kind: "PRIMARY_CENTRAL_MEASUREMENT_1",
    assessmentSlot: "PRIMARY_CENTRAL_1",
    order: 4,
  },
  {
    slug: "central-2",
    codeSuffix: "CENTRAL_2",
    title: "القياس المركزي الثاني",
    kind: "PRIMARY_CENTRAL_MEASUREMENT_2",
    assessmentSlot: "PRIMARY_CENTRAL_2",
    order: 5,
  },
];

function makeTemplateId(subject, assessmentType) {
  return `primary-${subject.slug}-${assessmentType.slug}`;
}

function makeTemplateCode(subject, assessmentType) {
  return `PRIMARY_${subject.key}_${assessmentType.codeSuffix}`;
}

function makeTemplateItem(templateId) {
  return {
    itemKey: `${templateId}-score`,
    itemId: `${templateId}-score`,
    itemTitle: "الدرجة",
    title: "الدرجة",
    category: "SCORE",
    valueType: "NUMERIC",
    maxScore: MAX_SCORE,
    weight: 1,
    affectsTotal: true,
    required: true,
    description: "درجة الطالب في الاختبار من 20.",
    helpText: "أدخل درجة من 0 إلى 20.",
    order: 1,
  };
}

function buildTemplate(subject, assessmentType) {
  const id = makeTemplateId(subject, assessmentType);

  return {
    id,
    code: makeTemplateCode(subject, assessmentType),
    title: `${subject.title} — ${assessmentType.title}`,

    orgId,
    schoolId: "",
    schoolType: "PRIMARY",

    subjectKey: subject.key,
    subjectId: subject.subjectId,
    subjectTitle: subject.title,

    kind: assessmentType.kind,
    assessmentSlot: assessmentType.assessmentSlot,
    evaluatorRoleKey: "teacher",

    description:
      "قالب قياس ابتدائي عام: اسم الطالب/ة، ID، الدرجة. صالح للفصل الدراسي الأول والثاني.",

    scoreType: "NUMERIC",
    maxScore: MAX_SCORE,
    itemMaxScore: MAX_SCORE,
    passingScore: LEARNING_LOSS_THRESHOLD_SCORE,

    scoreScaleLabel: "الدرجة العظمى: 20",
    totalScoreLabel: "المجموع: 20",

    templateItems: [makeTemplateItem(id)],

    applicableGradeIds: APPLICABLE_GRADE_IDS,
    applicableGradeCodes: [],
    applicableClassIds: [],
    applicableStreamIds: [],
    applicableTermIds: APPLICABLE_TERM_IDS,

    requiresLearningLossFollowUp: true,
    learningLossThresholdScore: LEARNING_LOSS_THRESHOLD_SCORE,

    isActive: true,
    status: "ACTIVE",
    order: assessmentType.order,

    source: "create-primary-subject-assessment-templates",
    createdAt: now,
    updatedAt: now,
  };
}

function buildAllTemplates() {
  const templates = [];

  for (const subject of SUBJECTS) {
    for (const assessmentType of ASSESSMENT_TYPES) {
      templates.push(buildTemplate(subject, assessmentType));
    }
  }

  return templates;
}

async function upsertTemplate(template, result) {
  const ref = db
    .collection("orgs")
    .doc(orgId)
    .collection("studentAssessmentTemplates")
    .doc(template.id);

  const snap = await ref.get();

  if (!dryRun) {
    await ref.set(
      {
        ...template,
        createdAt: snap.exists ? snap.data()?.createdAt ?? now : now,
        updatedAt: now,
      },
      { merge: false },
    );
  }

  const action = snap.exists ? "updated" : "created";
  result[action] += 1;

  console.log(
    `${dryRun ? "DRY RUN" : "OK"} ${action.toUpperCase()} studentAssessmentTemplates/${template.id}`,
  );

  console.log({
    title: template.title,
    subjectKey: template.subjectKey,
    kind: template.kind,
    assessmentSlot: template.assessmentSlot,
    maxScore: template.maxScore,
    items: template.templateItems.length,
    opensLoss: template.requiresLearningLossFollowUp,
    thresholdScore: template.learningLossThresholdScore,
    applicableTermIds: template.applicableTermIds,
  });
}

async function main() {
  const templates = buildAllTemplates();

  const result = {
    orgId,
    dryRun,
    subjects: SUBJECTS.length,
    assessmentTypes: ASSESSMENT_TYPES.length,
    templates: templates.length,
    created: 0,
    updated: 0,
  };

  console.log("Creating PRIMARY subject assessment templates...");
  console.log({
    orgId,
    dryRun,
    subjects: SUBJECTS.length,
    assessmentTypes: ASSESSMENT_TYPES.length,
    templates: templates.length,
    maxScore: MAX_SCORE,
    learningLossThresholdScore: LEARNING_LOSS_THRESHOLD_SCORE,
    applicableGradeIds: APPLICABLE_GRADE_IDS,
    applicableTermIds: APPLICABLE_TERM_IDS,
  });

  for (const template of templates) {
    await upsertTemplate(template, result);
  }

  console.log("Done.");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to create PRIMARY subject assessment templates.");
  console.error(error);
  process.exit(1);
});