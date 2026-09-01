/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  frameworkId: "educational-supervisor-periodic-teacher-evaluation-girls-v2",
  title: "التقييم الفتري للمشرف التعليمي - للمعلمات",
  items: [
    "اللقاء المهني",
    "التحضير",
    "سجل المتابعة",
    "سجل المهارات",
    "المذكرات الاثرائية",
    "المبادرة التعليمية",
    "الفاقد التعليمي",
    "تبادل الزيارات",
    "حضور الدورات والتفاعل",
    "نواتج التعلم",
  ],
};

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
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
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const sectionId = `${CONFIG.frameworkId}-main`;
  const framework = {
    id: CONFIG.frameworkId,
    orgId: CONFIG.orgId,
    title: CONFIG.title,
    description: "قالب التقييم الفتري للمشرف التعليمي للمعلمات.",
    targetKind: "TEACHER",
    targetRoleLabel: "المعلمات",
    targetRoleKeyHint: "GIRLS_TEACHER",
    evaluatorKind: "EDUCATIONAL_SUPERVISOR",
    evaluatorLabel: "المشرف التعليمي",
    defaultEvaluatorRoleKeys: ["EDU_SUPERVISOR"],
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    schoolTypes: ["PRIMARY"],
    maxCyclesPerTerm: 3,
    defaultItemMaxScore: 5,
    isActive: true,
    isLocked: true,
    version: 1,
  };
  const section = {
    id: sectionId,
    orgId: CONFIG.orgId,
    frameworkId: CONFIG.frameworkId,
    title: CONFIG.title,
    description: "بنود التقييم الفتري للمشرف التعليمي للمعلمات.",
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
  const snapshots = await db.getAll(...documents.map((document) => db.doc(document.path)));
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

function assertStructure(documents) {
  const frameworks = documents.filter((document) => document.type === "framework");
  const sections = documents.filter((document) => document.type === "section");
  const items = documents.filter((document) => document.type === "item");
  assert(frameworks.length === 1, "Exactly one framework is required.");
  assert(sections.length === 1 && sections[0].data.weight === 100, "Exactly one section with weight 100 is required.");
  assert(items.length === CONFIG.items.length, "Rubric item count mismatch.");
  assert(
    items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5 && item.data.isActive === true),
    "Every rubric item must be active with ordered maxScore=5.",
  );
}

async function createMissingDocuments(db, documents) {
  if (documents.length === 0) return;
  const now = Date.now();
  const batch = db.batch();
  documents.forEach((document) => {
    batch.create(db.doc(document.path), {
      ...document.data,
      createdAt: now,
      updatedAt: now,
      ...(document.type === "framework" ? { lockedAt: now } : {}),
    });
  });
  await batch.commit();
}

function documentIds(documents) {
  return documents.map((document) => ({ type: document.type, id: document.data.id }));
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const documents = buildDocuments();
  assertStructure(documents);
  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir({
    frameworkId: CONFIG.frameworkId,
    writtenCollections: ["evaluationFrameworks", "evaluationRubricSections", "evaluationRubricItems"],
    wouldCreateDocumentIds: documentIds(inspection.missing),
    existingDocumentIds: documentIds(inspection.existing),
    updatedDocumentIds: [],
    counts: {
      frameworks: 1,
      sections: 1,
      items: CONFIG.items.length,
    },
  }, { depth: null });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create only missing framework/rubric documents.");
    return;
  }

  await createMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Framework/rubric documents are still missing after apply.");
  const written = countByType(inspection.missing);
  console.dir({
    createdDocumentIds: documentIds(inspection.missing),
    updatedDocumentIds: [],
    frameworksWritten: written.framework || 0,
    sectionsWritten: written.section || 0,
    itemsWritten: written.item || 0,
  }, { depth: null });
}

main().catch((error) => {
  console.error("Sayed periodic teacher evaluation framework seed failed:");
  console.error(error);
  process.exitCode = 1;
});
