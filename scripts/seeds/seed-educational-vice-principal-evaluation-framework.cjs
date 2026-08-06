/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  frameworkId: "director-admin-educational-vice-principal-evaluation-v1",
  title: "تقييم المدير للوكيل التعليمي",
  roleLabel: "الوكيل التعليمي",
  roleKey: "BOYS_EDU_VP",
  items: [
    "متابعة تفعيل الكتاب المدرسي",
    "متابعة تفعيل المذكرات الإثرائية",
    "متابعة رفع الفاقد التعليمي",
    "الإشراف على متابعة الاختبارات",
    "تفعيل المتابعات الأسبوعية",
    "تنفيذ الزيارات التشخيصية",
  ],
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildDocuments() {
  const sectionId = `${CONFIG.frameworkId}-main`;
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const framework = {
    id: CONFIG.frameworkId,
    orgId: CONFIG.orgId,
    title: CONFIG.title,
    description:
      "قالب رسمي لتقييم المدير للوكيل التعليمي، وينفذ 9 مرات داخل الفصل الدراسي.",
    targetKind: "ADMIN_STAFF",
    targetRoleLabel: CONFIG.roleLabel,
    targetRoleKeyHint: CONFIG.roleKey,
    evaluatorKind: "SCHOOL_PRINCIPAL",
    evaluatorLabel: "مدير المدرسة",
    defaultEvaluatorRoleKeys: ["BOYS_PRINCIPAL"],
    frameworkKind: "ADMIN_EVALUATION",
    schoolTypes: ["PRIMARY"],
    maxCyclesPerTerm: 9,
    defaultItemMaxScore: 5,
    isActive: true,
    isLocked: true,
    version: 1,
  };
  const section = {
    id: sectionId,
    orgId: CONFIG.orgId,
    frameworkId: CONFIG.frameworkId,
    title: CONFIG.roleLabel,
    description: `بنود تقييم ${CONFIG.roleLabel}.`,
    order: 1,
    weight: 100,
    isActive: true,
  };
  const items = CONFIG.items.map((title, index) => {
    const itemNumber = String(index + 1).padStart(2, "0");

    return {
      id: `${sectionId}-${itemNumber}`,
      orgId: CONFIG.orgId,
      frameworkId: CONFIG.frameworkId,
      sectionId,
      title,
      description: "",
      order: index + 1,
      maxScore: 5,
      scoreInputType: "SCORE",
      isRequired: true,
      isActive: true,
    };
  });

  return [
    {
      type: "framework",
      path: `${orgRoot}/evaluationFrameworks/${framework.id}`,
      data: framework,
    },
    {
      type: "section",
      path: `${orgRoot}/evaluationRubricSections/${section.id}`,
      data: section,
    },
    ...items.map((item) => ({
      type: "item",
      path: `${orgRoot}/evaluationRubricItems/${item.id}`,
      data: item,
    })),
  ];
}

function assertDocument(snapshot, desired) {
  const current = snapshot.data();

  for (const [field, expected] of Object.entries(desired.data)) {
    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}.`,
    );
  }
}

async function inspectDocuments(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );
  const missing = [];
  const existing = [];

  snapshots.forEach((snapshot, index) => {
    const desired = documents[index];

    if (!snapshot.exists) {
      missing.push(desired);
      return;
    }

    assertDocument(snapshot, desired);
    existing.push(desired);
  });

  return { missing, existing };
}

async function applyMissing(db, documents) {
  if (documents.length === 0) return;

  const batch = db.batch();
  const now = Date.now();

  for (const document of documents) {
    batch.create(db.doc(document.path), {
      ...document.data,
      createdAt: now,
      updatedAt: now,
      ...(document.type === "framework" ? { lockedAt: now } : {}),
    });
  }

  await batch.commit();
}

async function verify(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );

  snapshots.forEach((snapshot, index) => {
    assert(snapshot.exists, `Missing document: ${snapshot.ref.path}`);
    assertDocument(snapshot, documents[index]);
  });

  const sections = documents.filter(
    (document) => document.type === "section",
  );
  const items = documents.filter((document) => document.type === "item");

  assert(sections.length === 1, "Framework must have one section.");
  assert(
    sections.reduce(
      (total, section) => total + Number(section.data.weight || 0),
      0,
    ) === 100,
    "Section weights must total 100.",
  );
  assert(items.length === 6, "Framework must have six items.");
  assert(
    items.every(
      (item) =>
        Number.isInteger(item.data.order) &&
        item.data.maxScore === 5,
    ),
    "Every item must have order and maxScore=5.",
  );
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const documents = buildDocuments();
  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir({
    frameworkId: CONFIG.frameworkId,
    version: 1,
    isLocked: true,
    documents: {
      desired: documents.length,
      existing: inspection.existing.length,
      missing: inspection.missing.length,
    },
    items: CONFIG.items,
  });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to seed the framework.");
    return;
  }

  await applyMissing(db, inspection.missing);
  await verify(db, documents);

  console.log("Educational vice-principal framework applied and verified.");
}

main().catch((error) => {
  console.error("Educational vice-principal framework seed failed:");
  console.error(error);
  process.exitCode = 1;
});
