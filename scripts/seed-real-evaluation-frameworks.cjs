/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const WEEKLY_FRAMEWORK_ID = "director-weekly-teacher-evaluation-v1";
const DIAGNOSTIC_FRAMEWORK_ID = "director-diagnostic-teacher-evaluation-v1";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json"
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function now() {
  return Date.now();
}

async function upsert(db, collectionPath, id, data) {
  await db.doc(`${collectionPath}/${id}`).set(data, { merge: true });
}

function buildFrameworks(ts) {
  return [
    {
      id: WEEKLY_FRAMEWORK_ID,
      orgId: ORG_ID,
      title: "تقييم المدير الأسبوعي للمعلمين",
      description:
        "قالب رسمي لتقييم المدير للمعلمين أسبوعيًا داخل الفصل الدراسي.",

      targetKind: "TEACHER",

      evaluatorKind: "SCHOOL_PRINCIPAL",
      evaluatorLabel: "مدير المدرسة",
      defaultEvaluatorRoleKeys: ["SCHOOL_PRINCIPAL"],

      frameworkKind: "WEEKLY_TEACHER_EVALUATION",
      schoolTypes: ["PRIMARY"],
      isActive: true,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: DIAGNOSTIC_FRAMEWORK_ID,
      orgId: ORG_ID,
      title: "التقييم التشخيصي للمعلمين بواسطة المدير",
      description:
        "قالب رسمي للتقييم التشخيصي الذي يجريه مدير المدرسة للمعلم، وينفذ مرتين فقط داخل الفصل الدراسي.",

      targetKind: "TEACHER",

      evaluatorKind: "SCHOOL_PRINCIPAL",
      evaluatorLabel: "مدير المدرسة",
      defaultEvaluatorRoleKeys: ["SCHOOL_PRINCIPAL"],

      frameworkKind: "CLASSROOM_VISIT",
      schoolTypes: ["PRIMARY"],
      isActive: true,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function buildSections(ts) {
  return [
    {
      id: `${WEEKLY_FRAMEWORK_ID}-weekly-performance`,
      orgId: ORG_ID,
      frameworkId: WEEKLY_FRAMEWORK_ID,
      title: "التقييم الأسبوعي",
      description: "بنود المتابعة الأسبوعية للمعلم.",
      order: 1,
      weight: 100,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: `${DIAGNOSTIC_FRAMEWORK_ID}-diagnostic-performance`,
      orgId: ORG_ID,
      frameworkId: DIAGNOSTIC_FRAMEWORK_ID,
      title: "التقييم التشخيصي",
      description: "بنود التقييم التشخيصي للأداء التعليمي داخل الحصة.",
      order: 1,
      weight: 100,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function buildItems(ts) {
  const weeklyItems = [
    "التحضير",
    "المبادرة في تنفيذ الأعمال",
    "التواجد أثناء الدوام",
    "تقبل التوجيه",
    "المحافظة على العهد",
    "التواصل مع أولياء الأمور",
    "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
    "القيام بما يسند له من مهام",
    "السلوك العام والقدوة الحسنة",
    "الاصطفاف الصباحي",
  ];

  const diagnosticItems = [
    "التحضير الذهني والكتابي",
    "الالتزام بخطة توزيع المنهج",
    "التهيئة المناسبة للدرس",
    "إعداد الوسائل المناسبة وتوظيفها",
    "استخدام السبورة وتنظيمها",
    "التسلسل المنطقي في عرض الدرس",
    "مراعاة الفروق الفردية",
    "التقويم القبلي والتكويني والختامي",
    "الالتزام باللغة الفصحى نطقًا وكتابة",
    "التدرج في معالجة أخطاء التلميذ",
    "تفعيل استراتيجيات التدريس الحديثة",
    "استراتيجية التدريس مناسبة للدرس",
    "ضبط الصف وإدارته",
    "إدارة الوقت بفاعلية",
    "إثارة الدافعية وتعزيز الإجابات",
    "ربط الدرس بواقع حياة التلميذ",
    "التركيز على ترسيخ القيم المستهدفة",
    "تحقيق أهداف الدرس",
    "ربط الأهداف بالتقويم",
    "مهارة إغلاق الدرس",
    "إشباع مهارات المادة",
  ];

  const weeklySectionId = `${WEEKLY_FRAMEWORK_ID}-weekly-performance`;
  const diagnosticSectionId = `${DIAGNOSTIC_FRAMEWORK_ID}-diagnostic-performance`;

  const weekly = weeklyItems.map((title, index) => {
    const itemNo = String(index + 1).padStart(2, "0");

    return {
      id: `${weeklySectionId}-${itemNo}`,
      orgId: ORG_ID,
      frameworkId: WEEKLY_FRAMEWORK_ID,
      sectionId: weeklySectionId,
      title,
      description: "",
      order: index + 1,
      maxScore: 5,
      scoreInputType: "SCORE",
      isRequired: true,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    };
  });

  const diagnostic = diagnosticItems.map((title, index) => {
    const itemNo = String(index + 1).padStart(2, "0");

    return {
      id: `${diagnosticSectionId}-${itemNo}`,
      orgId: ORG_ID,
      frameworkId: DIAGNOSTIC_FRAMEWORK_ID,
      sectionId: diagnosticSectionId,
      title,
      description: "",
      order: index + 1,
      maxScore: 5,
      scoreInputType: "SCORE",
      isRequired: true,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    };
  });

  return [...weekly, ...diagnostic];
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = now();

  console.log("Seeding real evaluation frameworks only...");
  console.log({
    orgId: ORG_ID,
    weeklyFrameworkId: WEEKLY_FRAMEWORK_ID,
    diagnosticFrameworkId: DIAGNOSTIC_FRAMEWORK_ID,
  });

  const frameworks = buildFrameworks(ts);
  const sections = buildSections(ts);
  const items = buildItems(ts);

  const writes = [];

  for (const framework of frameworks) {
    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationFrameworks`,
        framework.id,
        framework
      )
    );
  }

  for (const section of sections) {
    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationRubricSections`,
        section.id,
        section
      )
    );
  }

  for (const item of items) {
    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationRubricItems`,
        item.id,
        item
      )
    );
  }

  await Promise.all(writes);

  console.log("\n✅ Real frameworks seed completed successfully.");
  console.log({
    frameworksUpserted: frameworks.length,
    sectionsUpserted: sections.length,
    itemsUpserted: items.length,
    weeklyItems: 10,
    diagnosticItems: 21,
  });

  console.log("\nCreated/updated IDs:");
  console.log({
    weeklyFrameworkId: WEEKLY_FRAMEWORK_ID,
    diagnosticFrameworkId: DIAGNOSTIC_FRAMEWORK_ID,
  });
}

main().catch((error) => {
  console.error("\n❌ Real frameworks seed failed:");
  console.error(error);
  process.exit(1);
});