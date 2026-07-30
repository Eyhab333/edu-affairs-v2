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

function baseCatalogFields() {
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

const badges = [
  {
    id: "badge-participation-star",
    key: "participation-star",
    title: "نجم المشاركة",
    description: "تُمنح للطالب عند المشاركة المميزة داخل الحصة.",
    kind: "PARTICIPATION",
    category: "CLASSROOM",
    categoryTitle: "داخل الحصة",
    iconKey: "sparkles",
    emoji: "⭐",
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",
    order: 10,
  },
  {
    id: "badge-homework-hero",
    key: "homework-hero",
    title: "بطل الواجب",
    description: "تُمنح للطالب عند حل الواجب بجودة عالية.",
    kind: "HOMEWORK",
    category: "HOMEWORK",
    categoryTitle: "الواجبات",
    iconKey: "clipboard-check",
    emoji: "🏅",
    color: "#065F46",
    backgroundColor: "#D1FAE5",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    order: 20,
  },
  {
    id: "badge-improvement",
    key: "improvement",
    title: "متحسن",
    description: "تُمنح للطالب عند ظهور تحسن واضح في المستوى.",
    kind: "IMPROVEMENT",
    category: "PROGRESS",
    categoryTitle: "التحسن",
    iconKey: "trending-up",
    emoji: "📈",
    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    order: 30,
  },
  {
    id: "badge-teamwork",
    key: "teamwork",
    title: "متعاون",
    description: "تُمنح للطالب عند التعاون الإيجابي مع الزملاء.",
    kind: "TEAMWORK",
    category: "BEHAVIOR",
    categoryTitle: "السلوك الإيجابي",
    iconKey: "users",
    emoji: "🤝",
    color: "#7C2D12",
    backgroundColor: "#FFEDD5",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",
    order: 40,
  },
  {
    id: "badge-skill-mastery",
    key: "skill-mastery",
    title: "متقن المهارة",
    description: "تُمنح للطالب عند إتقان مهارة تعليمية محددة.",
    kind: "ACHIEVEMENT",
    category: "MASTERY",
    categoryTitle: "إتقان المهارات",
    iconKey: "target",
    emoji: "🎯",
    color: "#6D28D9",
    backgroundColor: "#EDE9FE",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    order: 50,
  },
  {
    id: "badge-quran-recitation",
    key: "quran-recitation",
    title: "قارئ متميز",
    description: "تُمنح للطالب عند التميز في التلاوة أو الحفظ.",
    kind: "QURAN",
    category: "QURAN",
    categoryTitle: "القرآن",
    iconKey: "book-open",
    emoji: "📖",
    color: "#166534",
    backgroundColor: "#DCFCE7",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    order: 60,
  },
];

const reasons = [
  {
    id: "reason-participation",
    key: "participation",
    title: "مشاركة مميزة",
    description: "تحفيز الطالب على المشاركة الفعالة داخل الحصة.",
    kind: "PARTICIPATION",
    category: "CLASSROOM",
    categoryTitle: "داخل الحصة",
    defaultEventType: "POINTS_ADD",
    defaultValue: 5,
    defaultValueKind: "POINTS",
    defaultVisibility: "STUDENT_DISPLAY",
    badgeKey: "participation-star",
    badgeId: "badge-participation-star",
    isManual: true,
    sourceType: "MANUAL",
    order: 10,
  },
  {
    id: "reason-homework-completed",
    key: "homework-completed",
    title: "حل الواجب",
    description: "تحفيز الطالب على الالتزام بحل الواجب.",
    kind: "HOMEWORK_COMPLETED",
    category: "HOMEWORK",
    categoryTitle: "الواجبات",
    defaultEventType: "POINTS_ADD",
    defaultValue: 5,
    defaultValueKind: "POINTS",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "",
    badgeId: "",
    isManual: true,
    sourceType: "STUDENT_HOMEWORK_SUBMISSION",
    order: 20,
  },
  {
    id: "reason-homework-excellent",
    key: "homework-excellent",
    title: "واجب مميز",
    description: "تحفيز الطالب عند حل الواجب بجودة عالية.",
    kind: "HOMEWORK_EXCELLENT",
    category: "HOMEWORK",
    categoryTitle: "الواجبات",
    defaultEventType: "BADGE_AWARDED",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "homework-hero",
    badgeId: "badge-homework-hero",
    isManual: true,
    sourceType: "STUDENT_HOMEWORK_SUBMISSION",
    order: 30,
  },
  {
    id: "reason-improvement",
    key: "improvement",
    title: "تحسن واضح",
    description: "تحفيز الطالب عند ظهور تحسن ملحوظ في الأداء.",
    kind: "IMPROVEMENT",
    category: "PROGRESS",
    categoryTitle: "التحسن",
    defaultEventType: "BADGE_AWARDED",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "improvement",
    badgeId: "badge-improvement",
    isManual: true,
    sourceType: "MANUAL",
    order: 40,
  },
  {
    id: "reason-positive-behavior",
    key: "positive-behavior",
    title: "سلوك إيجابي",
    description: "تحفيز الطالب عند ظهور سلوك إيجابي داخل الفصل.",
    kind: "POSITIVE_BEHAVIOR",
    category: "BEHAVIOR",
    categoryTitle: "السلوك الإيجابي",
    defaultEventType: "POINTS_ADD",
    defaultValue: 5,
    defaultValueKind: "POINTS",
    defaultVisibility: "STUDENT_DISPLAY",
    badgeKey: "",
    badgeId: "",
    isManual: true,
    sourceType: "STUDENT_NOTE",
    order: 50,
  },
  {
    id: "reason-teamwork",
    key: "teamwork",
    title: "تعاون مع الزملاء",
    description: "تحفيز الطالب على التعاون والمشاركة الجماعية.",
    kind: "TEAMWORK",
    category: "BEHAVIOR",
    categoryTitle: "السلوك الإيجابي",
    defaultEventType: "BADGE_AWARDED",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "STUDENT_DISPLAY",
    badgeKey: "teamwork",
    badgeId: "badge-teamwork",
    isManual: true,
    sourceType: "MANUAL",
    order: 60,
  },
  {
    id: "reason-attendance-commitment",
    key: "attendance-commitment",
    title: "التزام بالحضور",
    description: "تحفيز الطالب على الالتزام بالحضور والانضباط.",
    kind: "ATTENDANCE_COMMITMENT",
    category: "ATTENDANCE",
    categoryTitle: "الحضور والانضباط",
    defaultEventType: "POINTS_ADD",
    defaultValue: 5,
    defaultValueKind: "POINTS",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "",
    badgeId: "",
    isManual: true,
    sourceType: "STUDENT_ATTENDANCE_BATCH",
    order: 70,
  },
  {
    id: "reason-skill-mastery",
    key: "skill-mastery",
    title: "إتقان مهارة",
    description: "تحفيز الطالب عند إتقان مهارة تعليمية.",
    kind: "SKILL_MASTERY",
    category: "MASTERY",
    categoryTitle: "إتقان المهارات",
    defaultEventType: "BADGE_AWARDED",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "skill-mastery",
    badgeId: "badge-skill-mastery",
    isManual: true,
    sourceType: "STUDENT_ASSESSMENT_RECORD",
    order: 80,
  },
  {
    id: "reason-quran-recitation",
    key: "quran-recitation",
    title: "تلاوة مميزة",
    description: "تحفيز الطالب عند التميز في التلاوة أو الحفظ.",
    kind: "QURAN_RECITATION",
    category: "QURAN",
    categoryTitle: "القرآن",
    defaultEventType: "BADGE_AWARDED",
    defaultValue: 0,
    defaultValueKind: "BADGE_VALUE",
    defaultVisibility: "GUARDIAN_VISIBLE",
    badgeKey: "quran-recitation",
    badgeId: "badge-quran-recitation",
    isManual: true,
    sourceType: "MANUAL",
    order: 90,
  },
];

async function seedCollection({ collectionName, items }) {
  const batch = db.batch();

  for (const item of items) {
    const ref = db.doc(`orgs/${ORG_ID}/${collectionName}/${item.id}`);

    batch.set(
      ref,
      {
        ...baseCatalogFields(),
        ...item,
        updatedAt: now(),
      },
      { merge: true }
    );
  }

  await batch.commit();

  console.log(
    `Seeded ${items.length} document(s) into orgs/${ORG_ID}/${collectionName}`
  );
}

async function main() {
  console.log(`Seeding gamification catalog for org: ${ORG_ID}`);

  await seedCollection({
    collectionName: "gamificationBadges",
    items: badges,
  });

  await seedCollection({
    collectionName: "gamificationReasons",
    items: reasons,
  });

  console.log("Gamification catalog seed completed successfully.");
}

main().catch((error) => {
  console.error("Gamification catalog seed failed:");
  console.error(error);
  process.exitCode = 1;
});