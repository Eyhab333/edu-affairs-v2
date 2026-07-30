/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

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

const ADMIN_FRAMEWORKS = [
  {
    id: "director-admin-media-evaluation-v1",
    title: "تقييم المدير للإعلامي",
    roleLabel: "الإعلامي",
    roleKeyHint: "MEDIA_SPECIALIST",
    items: [
      "توثيق الممارسات",
      "خطة المناسبات",
      "توثيق الأنشطة",
      "توثيق الإذاعة",
      "إبراز الإنجازات",
      "إدارة الملف الإعلامي",
      "رفع التقارير الإعلامية",
      "تنفيذ التكليفات",
    ],
  },
  {
    id: "director-admin-assistant-evaluation-v1",
    title: "تقييم المدير للمساعد الإداري",
    roleLabel: "المساعد الإداري",
    roleKeyHint: "ADMIN_ASSISTANT",
    items: [
      "إدارة المراسلات",
      "متابعة البريد",
      "تنظيم الملفات",
      "إدارة برنامج نور وراصد",
      "إعداد كشوف المتابعة",
      "كشوف الفصول",
      "إعداد سجل المهارات",
      "تنفيذ التكليفات",
    ],
  },
  {
    id: "director-admin-activity-leader-evaluation-v1",
    title: "تقييم المدير لرائد النشاط",
    roleLabel: "رائد النشاط",
    roleKeyHint: "ACTIVITY_LEADER",
    items: [
      "خطة النشاط",
      "خطة الإذاعة",
      "خطة المبادرات",
      "متابعة تنفيذ المبادرات",
      "تنظيم الأيام العالمية والوطنية",
      "تقارير النشاط",
      "المشاركة في مجلس الآباء",
      "تفعيل الزيارات الطلابية",
      "تفعيل الأيام المفتوحة",
      "تفعيل الحفل السنوي",
    ],
  },
  {
    id: "director-admin-vice-principal-evaluation-v1",
    title: "تقييم المدير لوكيل المدرسة",
    roleLabel: "وكيل المدرسة",
    roleKeyHint: "SCHOOL_VICE_PRINCIPAL",
    items: [
      "المشاركة في الخطة",
      "متابعة ملفات الطلاب",
      "متابعة انتظام المعلمين داخل الفصول",
      "توزيع الطلاب على الفصول",
      "تطبيق لائحة السلوك المدرسي",
      "متابعة خطة النشاط",
      "متابعة الغياب وإرسال الإشعارات",
      "انتظام الطلاب في اليوم الدراسي",
    ],
  },
  {
    id: "director-admin-student-counselor-evaluation-v1",
    title: "تقييم المدير للموجه الطلابي",
    roleLabel: "الموجه الطلابي",
    roleKeyHint: "STUDENT_COUNSELOR",
    items: [
      "متابعة سجل الواجبات",
      "متابعة سجل المهارات",
      "معالجة الفاقد التعليمي",
      "تفعيل الأسبوع التمهيدي",
      "تفعيل البرامج الإرشادية",
      "تصنيف الحالات الطلابية",
      "متابعة المتعثرين",
      "متابعة الغياب",
      "اللقاءات الفردية مع أولياء الأمور",
      "البرامج التوعوية",
      "السجلات الإرشادية",
      "البرامج القيمية",
      "متابعة الحالات الصحية",
    ],
  },
];

function buildFramework(seed, ts) {
  return {
    id: seed.id,
    orgId: ORG_ID,

    title: seed.title,
    description: `قالب رسمي لتقييم المدير لـ ${seed.roleLabel}، وينفذ 9 مرات داخل الفصل الدراسي.`,

    targetKind: "ADMIN_STAFF",
    targetRoleLabel: seed.roleLabel,
    targetRoleKeyHint: seed.roleKeyHint,

    evaluatorKind: "SCHOOL_PRINCIPAL",
    evaluatorLabel: "مدير المدرسة",
    defaultEvaluatorRoleKeys: ["SCHOOL_PRINCIPAL"],

    frameworkKind: "ADMIN_EVALUATION",
    schoolTypes: ["PRIMARY"],

    maxCyclesPerTerm: 9,
    defaultItemMaxScore: 5,

    isActive: true,
    version: 1,

    createdAt: ts,
    updatedAt: ts,
  };
}

function buildSection(seed, ts) {
  const sectionId = `${seed.id}-main`;

  return {
    id: sectionId,
    orgId: ORG_ID,
    frameworkId: seed.id,

    title: seed.roleLabel,
    description: `بنود تقييم ${seed.roleLabel}.`,

    order: 1,
    weight: 100,

    isActive: true,

    createdAt: ts,
    updatedAt: ts,
  };
}

function buildItems(seed, ts) {
  const sectionId = `${seed.id}-main`;

  return seed.items.map((title, index) => {
    const itemNo = String(index + 1).padStart(2, "0");

    return {
      id: `${sectionId}-${itemNo}`,
      orgId: ORG_ID,
      frameworkId: seed.id,
      sectionId,

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
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = now();

  console.log("Seeding admin evaluation frameworks only...");
  console.log({
    orgId: ORG_ID,
    frameworks: ADMIN_FRAMEWORKS.length,
  });

  const frameworks = ADMIN_FRAMEWORKS.map((seed) => buildFramework(seed, ts));
  const sections = ADMIN_FRAMEWORKS.map((seed) => buildSection(seed, ts));
  const items = ADMIN_FRAMEWORKS.flatMap((seed) => buildItems(seed, ts));

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

  console.log("\n✅ Admin evaluation frameworks seed completed successfully.");
  console.log({
    frameworksUpserted: frameworks.length,
    sectionsUpserted: sections.length,
    itemsUpserted: items.length,
  });

  console.log("\nFrameworks:");
  for (const framework of frameworks) {
    console.log(`- ${framework.id}: ${framework.title}`);
  }
}

main().catch((error) => {
  console.error("\n❌ Admin evaluation frameworks seed failed:");
  console.error(error);
  process.exit(1);
});