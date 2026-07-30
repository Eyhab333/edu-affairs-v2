const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const academicYearId = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const dryRun = process.argv.includes("--dry-run");

const now = Date.now();

const SCHOOLS = [
  {
    schoolId: "mrb-boys-sayh",
    title: "منار بنين السيح",
  },
  {
    schoolId: "mrb-boys-faleh",
    title: "منار بنين الفالح",
  },
  {
    schoolId: "mrb-girls",
    title: "منار بنات",
  },
];

const ENABLED_MODULE_KEYS = [
  "ASSESSMENTS",
  "LEARNING_LOSS",
  "HOMEWORK",
  "LESSON_PREP",
  "QUESTION_BANK",
  "CURRICULUM_PLAN",
  "RESOURCES",
  "GAMIFICATION",
  "NOTES",
];

const SUBJECTS = {
  ENGLISH: {
    subjectKey: "ENGLISH",
    subjectId: "subject-english",
    subjectTitle: "إنجليزي",
    order: 10,
  },
  MATH: {
    subjectKey: "MATH",
    subjectId: "subject-math",
    subjectTitle: "رياضيات",
    order: 20,
  },
  SCIENCE: {
    subjectKey: "SCIENCE",
    subjectId: "subject-science",
    subjectTitle: "علوم",
    order: 30,
  },
  ART: {
    subjectKey: "ART",
    subjectId: "subject-art",
    subjectTitle: "فنية",
    order: 40,
  },
  QURAN: {
    subjectKey: "QURAN",
    subjectId: "subject-quran",
    subjectTitle: "قرآن",
    order: 50,
  },
  ARABIC: {
    subjectKey: "ARABIC",
    subjectId: "subject-arabic",
    subjectTitle: "لغتي",
    order: 60,
  },
  LIFE_SKILLS: {
    subjectKey: "LIFE_SKILLS",
    subjectId: "subject-life-skills",
    subjectTitle: "حياتية",
    order: 70,
  },
  ISLAMIC_STUDIES: {
    subjectKey: "ISLAMIC_STUDIES",
    subjectId: "subject-islamic-studies",
    subjectTitle: "دراسات",
    order: 80,
  },
  QURAN_AND_ISLAMIC_STUDIES: {
    subjectKey: "QURAN_AND_ISLAMIC_STUDIES",
    subjectId: "subject-quran-and-islamic-studies",
    subjectTitle: "قرآن ودراسات",
    order: 90,
  },
  PE: {
    subjectKey: "PE",
    subjectId: "subject-pe",
    subjectTitle: "بدنية",
    order: 100,
  },
  SOCIAL_STUDIES: {
    subjectKey: "SOCIAL_STUDIES",
    subjectId: "subject-social-studies",
    subjectTitle: "اجتماعيات",
    order: 110,
  },
  DIGITAL: {
    subjectKey: "DIGITAL",
    subjectId: "subject-digital",
    subjectTitle: "رقمية",
    order: 120,
  },
  TAJWEED: {
    subjectKey: "TAJWEED",
    subjectId: "subject-tajweed",
    subjectTitle: "تجويد",
    order: 130,
  },
};

const CLASS_PLANS = [
  {
    classId: "g1-international-1",
    subjects: ["ENGLISH", "MATH", "SCIENCE", "ART", "QURAN", "ARABIC"],
  },
  {
    classId: "g2-international-1",
    subjects: ["ENGLISH", "MATH", "SCIENCE", "ART", "QURAN", "ARABIC"],
  },

  {
    classId: "g1-general-1",
    subjects: ["ENGLISH", "QURAN", "ARABIC", "SCIENCE", "MATH", "LIFE_SKILLS"],
  },
  {
    classId: "g1-general-2",
    subjects: ["ENGLISH", "SCIENCE", "MATH", "ARABIC", "LIFE_SKILLS", "ART", "QURAN"],
  },
  {
    classId: "g1-general-3",
    subjects: ["ENGLISH", "SCIENCE", "MATH", "ARABIC", "LIFE_SKILLS", "ART", "QURAN"],
  },
  {
    classId: "g1-quran-1",
    subjects: ["ENGLISH", "MATH", "ART", "QURAN_AND_ISLAMIC_STUDIES", "ARABIC"],
  },

  {
    classId: "g2-general-1",
    subjects: ["ENGLISH", "MATH", "QURAN_AND_ISLAMIC_STUDIES", "ARABIC", "SCIENCE"],
  },
  {
    classId: "g2-general-2",
    subjects: ["ENGLISH", "QURAN", "ISLAMIC_STUDIES", "MATH", "SCIENCE", "LIFE_SKILLS", "ARABIC"],
  },
  {
    classId: "g2-general-3",
    subjects: ["ENGLISH", "LIFE_SKILLS", "ART", "MATH", "ARABIC", "QURAN", "ISLAMIC_STUDIES"],
  },
  {
    classId: "g2-quran-1",
    subjects: ["ENGLISH", "QURAN", "LIFE_SKILLS", "SCIENCE", "MATH", "ART", "ARABIC"],
  },
  {
    classId: "g2-quran-2",
    subjects: ["MATH", "ARABIC", "QURAN", "SCIENCE", "ENGLISH"],
    createIfMissing: true,
  },

  {
    classId: "g3-general-1",
    subjects: ["MATH", "QURAN", "SCIENCE", "ENGLISH", "ART", "LIFE_SKILLS", "ARABIC"],
  },
  {
    classId: "g3-general-2",
    subjects: ["MATH", "ISLAMIC_STUDIES", "QURAN", "SCIENCE", "ENGLISH", "ART", "LIFE_SKILLS", "ARABIC"],
  },
  {
    classId: "g3-general-3",
    subjects: ["MATH", "ISLAMIC_STUDIES", "QURAN", "SCIENCE", "ENGLISH", "ART", "LIFE_SKILLS", "ARABIC"],
  },
  {
    classId: "g3-quran-1",
    subjects: ["MATH", "LIFE_SKILLS", "ARABIC", "SCIENCE", "PE", "ENGLISH"],
  },

  {
    classId: "g4-general-1",
    subjects: [
      "PE",
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "LIFE_SKILLS",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "MATH",
    ],
  },
  {
    classId: "g4-general-2",
    subjects: [
      "PE",
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "LIFE_SKILLS",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "MATH",
    ],
  },
  {
    classId: "g4-general-3",
    subjects: [
      "PE",
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "LIFE_SKILLS",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "MATH",
    ],
  },
  {
    classId: "g4-quran-1",
    subjects: [
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "LIFE_SKILLS",
      "PE",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "MATH",
    ],
  },

  {
    classId: "g5-general-1",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g5-general-2",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g5-general-3",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g5-quran-1",
    subjects: [
      "DIGITAL",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "TAJWEED",
      "MATH",
    ],
  },

  {
    classId: "g6-general-1",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g6-general-2",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g6-general-3",
    subjects: [
      "DIGITAL",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SOCIAL_STUDIES",
      "ARABIC",
      "PE",
      "ENGLISH",
      "SCIENCE",
      "MATH",
    ],
  },
  {
    classId: "g6-quran-1",
    subjects: [
      "DIGITAL",
      "ART",
      "SOCIAL_STUDIES",
      "ARABIC",
      "ENGLISH",
      "QURAN_AND_ISLAMIC_STUDIES",
      "SCIENCE",
      "TAJWEED",
      "MATH",
    ],
  },
];

function getClassMeta(classId) {
  const [gradePart, streamPart, sectionPart] = classId.split("-");

  const gradeId = gradePart;
  const streamId =
    streamPart === "general"
      ? "stream-general"
      : streamPart === "quran"
        ? "stream-quran"
        : streamPart === "international"
          ? "stream-international"
          : "";

  const gradeLabelById = {
    g1: "أول ابتدائي",
    g2: "ثاني ابتدائي",
    g3: "ثالث ابتدائي",
    g4: "رابع ابتدائي",
    g5: "خامس ابتدائي",
    g6: "سادس ابتدائي",
  };

  const streamLabelById = {
    general: "العام",
    quran: "التحفيظ",
    international: "العالمي",
  };

  const sectionLabelByNumber = {
    "1": "أ",
    "2": "ب",
    "3": "ج",
    "4": "د",
  };

  const gradeLabel = gradeLabelById[gradePart] || gradePart;
  const streamLabel = streamLabelById[streamPart] || streamPart;
  const sectionLabel = sectionLabelByNumber[sectionPart] || sectionPart;

  const baseOrder = Number(sectionPart || 1);
  const order =
    streamPart === "general"
      ? baseOrder
      : streamPart === "quran"
        ? 9 + baseOrder
        : streamPart === "international"
          ? 20 + baseOrder
          : baseOrder;

  return {
    gradeId,
    streamId,
    sectionLabel,
    title: `${gradeLabel} / ${streamLabel} / ${sectionLabel}`,
    code: classId.toUpperCase(),
    order,
  };
}

function subjectSlug(subjectKey) {
  return String(subjectKey).toLowerCase().replace(/_/g, "-");
}

function buildOfferingId({ schoolId, classId, subjectKey }) {
  return `${schoolId}-${classId}-${subjectSlug(subjectKey)}`;
}

function buildClassPayload({ schoolId, classId }) {
  const meta = getClassMeta(classId);

  return {
    id: classId,
    orgId,
    schoolId,
    academicYearId,

    gradeId: meta.gradeId,
    streamId: meta.streamId,

    title: meta.title,
    code: meta.code,
    sectionLabel: meta.sectionLabel,
    order: meta.order,

    schoolType: "PRIMARY",
    status: "ACTIVE",
    isActive: true,

    createdAt: now,
    updatedAt: now,
  };
}

function buildOfferingPayload({ schoolId, classId, subjectKey, order }) {
  const subject = SUBJECTS[subjectKey];

  if (!subject) {
    throw new Error(`Unknown subjectKey: ${subjectKey}`);
  }

  const meta = getClassMeta(classId);
  const id = buildOfferingId({ schoolId, classId, subjectKey });

  return {
    id,
    orgId,
    schoolId,
    academicYearId,

    gradeId: meta.gradeId,
    classId,
    streamId: meta.streamId,

    subjectKey: subject.subjectKey,
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,
    subjectTitleSnapshot: subject.subjectTitle,
    displayName: subject.subjectTitle,
    shortLabel: subject.subjectTitle,

    enabledModuleKeys: ENABLED_MODULE_KEYS,

    status: "ACTIVE",
    isActive: true,
    order: order ?? subject.order,

    offeringKind: "PRIMARY_SUBJECT",
    source: "seed-primary-class-subject-offerings",

    createdAt: now,
    updatedAt: now,
  };
}

async function ensureClass({ schoolId, classId, result }) {
  const classRef = db
    .collection("orgs")
    .doc(orgId)
    .collection("schools")
    .doc(schoolId)
    .collection("academicYears")
    .doc(academicYearId)
    .collection("classes")
    .doc(classId);

  const snap = await classRef.get();

  if (snap.exists) {
    result.classes.existing += 1;
    return;
  }

  const payload = buildClassPayload({ schoolId, classId });

  if (!dryRun) {
    await classRef.set(payload, { merge: false });
  }

  result.classes.created += 1;
  console.log(`${dryRun ? "DRY RUN create" : "CREATED"} class ${schoolId}/${classId}`);
}

async function upsertOffering({ schoolId, classId, subjectKey, order, result }) {
  const payload = buildOfferingPayload({
    schoolId,
    classId,
    subjectKey,
    order,
  });

  const ref = db
    .collection("orgs")
    .doc(orgId)
    .collection("classSubjectOfferings")
    .doc(payload.id);

  const snap = await ref.get();

  if (!dryRun) {
    await ref.set(
      {
        ...payload,
        createdAt: snap.exists ? snap.data()?.createdAt ?? now : now,
        updatedAt: now,
      },
      { merge: false },
    );
  }

  if (snap.exists) {
    result.offerings.updated += 1;
    console.log(`${dryRun ? "DRY RUN update" : "UPDATED"} offering ${payload.id}`);
  } else {
    result.offerings.created += 1;
    console.log(`${dryRun ? "DRY RUN create" : "CREATED"} offering ${payload.id}`);
  }
}

async function main() {
  const result = {
    orgId,
    academicYearId,
    dryRun,
    schools: SCHOOLS.map((item) => item.schoolId),
    classes: {
      existing: 0,
      created: 0,
    },
    offerings: {
      created: 0,
      updated: 0,
    },
  };

  console.log("Seeding PRIMARY class subject offerings...");
  console.log({
    orgId,
    academicYearId,
    dryRun,
    schools: result.schools,
    classPlans: CLASS_PLANS.length,
  });

  for (const school of SCHOOLS) {
    for (const plan of CLASS_PLANS) {
      await ensureClass({
        schoolId: school.schoolId,
        classId: plan.classId,
        result,
      });

      for (let index = 0; index < plan.subjects.length; index += 1) {
        await upsertOffering({
          schoolId: school.schoolId,
          classId: plan.classId,
          subjectKey: plan.subjects[index],
          order: index + 1,
          result,
        });
      }
    }
  }

  console.log("Done.");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to seed PRIMARY class subject offerings.");
  console.error(error);
  process.exit(1);
});