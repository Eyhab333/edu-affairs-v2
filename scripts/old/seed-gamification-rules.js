const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";

function now() {
  return Date.now();
}

function baseRuleFields() {
  const timestamp = now();

  return {
    orgId: ORG_ID,

    scopeType: "ORG",
    scopeId: ORG_ID,

    schoolId: "",
    academicYearId: "",
    termId: "",

    gradeId: "",
    classId: "",

    subjectKey: "",
    classSubjectOfferingId: "",

    status: "ACTIVE",
    createdByPersonId: "seed",

    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const levelRules = [
  {
    id: "level-1-start",
    key: "level-1-start",
    title: "بداية موفقة",
    description: "المستوى الأول للطالب عند بداية التفاعل مع التحفيز.",
    levelNumber: 1,

    minPoints: 0,
    minXp: 0,
    minBadges: 0,

    iconKey: "sparkles",
    emoji: "🌱",
    imageUrl: "",

    color: "#166534",
    backgroundColor: "#DCFCE7",

    rewardBadgeId: "",
    rewardBadgeKey: "",

    rewardValue: 0,
    rewardValueKind: "CUSTOM",

    order: 10,
  },
  {
    id: "level-2-active",
    key: "level-2-active",
    title: "طالب نشيط",
    description: "يصل إليه الطالب عند جمع 50 نقطة.",
    levelNumber: 2,

    minPoints: 50,
    minXp: 0,
    minBadges: 0,

    iconKey: "zap",
    emoji: "⚡",
    imageUrl: "",

    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",

    rewardBadgeId: "",
    rewardBadgeKey: "",

    rewardValue: 0,
    rewardValueKind: "CUSTOM",

    order: 20,
  },
  {
    id: "level-3-excellent",
    key: "level-3-excellent",
    title: "طالب متميز",
    description: "يصل إليه الطالب عند جمع 100 نقطة أو أكثر.",
    levelNumber: 3,

    minPoints: 100,
    minXp: 0,
    minBadges: 0,

    iconKey: "star",
    emoji: "⭐",
    imageUrl: "",

    color: "#92400E",
    backgroundColor: "#FEF3C7",

    rewardBadgeId: "",
    rewardBadgeKey: "",

    rewardValue: 0,
    rewardValueKind: "CUSTOM",

    order: 30,
  },
  {
    id: "level-4-subject-star",
    key: "level-4-subject-star",
    title: "نجم المادة",
    description: "يصل إليه الطالب عند جمع 150 نقطة وشارتين على الأقل.",
    levelNumber: 4,

    minPoints: 150,
    minXp: 0,
    minBadges: 2,

    iconKey: "trophy",
    emoji: "🏆",
    imageUrl: "",

    color: "#7C2D12",
    backgroundColor: "#FFEDD5",

    rewardBadgeId: "",
    rewardBadgeKey: "",

    rewardValue: 0,
    rewardValueKind: "CUSTOM",

    order: 40,
  },
  {
    id: "level-5-learning-hero",
    key: "level-5-learning-hero",
    title: "بطل التعلم",
    description: "أعلى مستوى افتراضي للطالب عند جمع 250 نقطة و5 شارات.",
    levelNumber: 5,

    minPoints: 250,
    minXp: 0,
    minBadges: 5,

    iconKey: "crown",
    emoji: "👑",
    imageUrl: "",

    color: "#6D28D9",
    backgroundColor: "#EDE9FE",

    rewardBadgeId: "",
    rewardBadgeKey: "",

    rewardValue: 0,
    rewardValueKind: "CUSTOM",

    order: 50,
  },
];

const achievementRules = [
  {
    id: "achievement-first-25-points",
    key: "first-25-points",
    title: "أول 25 نقطة",
    description: "يفتح هذا الإنجاز عندما يجمع الطالب أول 25 نقطة.",
    kind: "ACHIEVEMENT",

    category: "POINTS",
    categoryTitle: "النقاط",

    triggerMetric: "TOTAL_POINTS",
    thresholdValue: 25,

    triggerEventType: undefined,
    triggerReasonKey: "",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-participation-star",
    rewardBadgeKey: "participation-star",
    rewardBadgeTitle: "نجم المشاركة",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "sparkles",
    emoji: "⭐",
    imageUrl: "",

    color: "#92400E",
    backgroundColor: "#FEF3C7",

    order: 10,
  },
  {
    id: "achievement-100-points",
    key: "100-points",
    title: "جامع 100 نقطة",
    description: "يفتح هذا الإنجاز عندما يصل الطالب إلى 100 نقطة.",
    kind: "ACHIEVEMENT",

    category: "POINTS",
    categoryTitle: "النقاط",

    triggerMetric: "TOTAL_POINTS",
    thresholdValue: 100,

    triggerEventType: undefined,
    triggerReasonKey: "",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-skill-mastery",
    rewardBadgeKey: "skill-mastery",
    rewardBadgeTitle: "متقن المهارة",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "target",
    emoji: "🎯",
    imageUrl: "",

    color: "#6D28D9",
    backgroundColor: "#EDE9FE",

    order: 20,
  },
  {
    id: "achievement-5-participations",
    key: "5-participations",
    title: "خمس مشاركات مميزة",
    description: "يفتح هذا الإنجاز عندما يحصل الطالب على مشاركة مميزة 5 مرات.",
    kind: "PARTICIPATION",

    category: "CLASSROOM",
    categoryTitle: "داخل الحصة",

    triggerMetric: "REASON_COUNT",
    thresholdValue: 5,

    triggerEventType: undefined,
    triggerReasonKey: "participation",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-participation-star",
    rewardBadgeKey: "participation-star",
    rewardBadgeTitle: "نجم المشاركة",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "sparkles",
    emoji: "⭐",
    imageUrl: "",

    color: "#92400E",
    backgroundColor: "#FEF3C7",

    order: 30,
  },
  {
    id: "achievement-3-badges",
    key: "3-badges",
    title: "جامع 3 شارات",
    description: "يفتح هذا الإنجاز عندما يحصل الطالب على 3 شارات.",
    kind: "ACHIEVEMENT",

    category: "BADGES",
    categoryTitle: "الشارات",

    triggerMetric: "BADGE_COUNT",
    thresholdValue: 3,

    triggerEventType: undefined,
    triggerReasonKey: "",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-improvement",
    rewardBadgeKey: "improvement",
    rewardBadgeTitle: "متحسن",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "award",
    emoji: "🏅",
    imageUrl: "",

    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",

    order: 40,
  },
  {
    id: "achievement-5-teamwork",
    key: "5-teamwork",
    title: "متعاون دائمًا",
    description: "يفتح هذا الإنجاز عندما يحصل الطالب على تحفيز التعاون 5 مرات.",
    kind: "TEAMWORK",

    category: "BEHAVIOR",
    categoryTitle: "السلوك الإيجابي",

    triggerMetric: "REASON_COUNT",
    thresholdValue: 5,

    triggerEventType: undefined,
    triggerReasonKey: "teamwork",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-teamwork",
    rewardBadgeKey: "teamwork",
    rewardBadgeTitle: "متعاون",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "users",
    emoji: "🤝",
    imageUrl: "",

    color: "#7C2D12",
    backgroundColor: "#FFEDD5",

    order: 50,
  },
  {
    id: "achievement-skill-mastery-once",
    key: "skill-mastery-once",
    title: "إتقان أول مهارة",
    description: "يفتح هذا الإنجاز عند حصول الطالب على أول تحفيز إتقان مهارة.",
    kind: "ACHIEVEMENT",

    category: "MASTERY",
    categoryTitle: "إتقان المهارات",

    triggerMetric: "REASON_COUNT",
    thresholdValue: 1,

    triggerEventType: undefined,
    triggerReasonKey: "skill-mastery",
    triggerBadgeKey: "",
    triggerLevelKey: "",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-skill-mastery",
    rewardBadgeKey: "skill-mastery",
    rewardBadgeTitle: "متقن المهارة",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "target",
    emoji: "🎯",
    imageUrl: "",

    color: "#6D28D9",
    backgroundColor: "#EDE9FE",

    order: 60,
  },
  {
    id: "achievement-level-3-reached",
    key: "level-3-reached",
    title: "وصل إلى طالب متميز",
    description: "يفتح هذا الإنجاز عندما يصل الطالب إلى المستوى الثالث.",
    kind: "LEVEL",

    category: "LEVELS",
    categoryTitle: "المستويات",

    triggerMetric: "LEVEL_REACHED",
    thresholdValue: 3,

    triggerEventType: undefined,
    triggerReasonKey: "",
    triggerBadgeKey: "",
    triggerLevelKey: "level-3-excellent",

    requiredSubjectKey: "",
    requiredClassSubjectOfferingId: "",

    rewardEventType: "BADGE_AWARDED",
    rewardBadgeId: "badge-improvement",
    rewardBadgeKey: "improvement",
    rewardBadgeTitle: "متحسن",

    rewardValue: 0,
    rewardValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",

    isRepeatable: false,
    repeatLimit: 0,

    iconKey: "star",
    emoji: "🌟",
    imageUrl: "",

    color: "#92400E",
    backgroundColor: "#FEF3C7",

    order: 70,
  },
];

function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)])
    );
  }

  return value;
}

async function seedCollection({ collectionName, items }) {
  const batch = db.batch();

  for (const item of items) {
    const ref = db.doc(`orgs/${ORG_ID}/${collectionName}/${item.id}`);

    const safeData = removeUndefinedDeep({
      ...baseRuleFields(),
      ...item,
      updatedAt: now(),
    });

    batch.set(ref, safeData, { merge: true });
  }

  await batch.commit();

  console.log(
    `Seeded ${items.length} document(s) into orgs/${ORG_ID}/${collectionName}`
  );
}

async function main() {
  console.log(`Seeding gamification rules for org: ${ORG_ID}`);

  await seedCollection({
    collectionName: "gamificationLevelRules",
    items: levelRules,
  });

  await seedCollection({
    collectionName: "gamificationAchievementRules",
    items: achievementRules,
  });

  console.log("Gamification rules seed completed successfully.");
}

main().catch((error) => {
  console.error("Gamification rules seed failed:");
  console.error(error);
  process.exitCode = 1;
});