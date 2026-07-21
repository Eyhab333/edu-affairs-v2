/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const FRAMEWORK_ID = "director-weekly-teacher-evaluation-v1";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation";

const DRY_RUN = process.env.DRY_RUN !== "false";

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function evaluationTitle(value) {
  const titles = {
    1: "التقييم الأول",
    2: "التقييم الثاني",
    3: "التقييم الثالث",
    4: "التقييم الرابع",
    5: "التقييم الخامس",
    6: "التقييم السادس",
    7: "التقييم السابع",
    8: "التقييم الثامن",
    9: "التقييم التاسع",
  };

  return titles[value] || `التقييم ${value}`;
}

async function collectByField(db, paths, collectionName, field, value) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/${collectionName}`)
    .where(field, "==", value)
    .get();

  for (const doc of snap.docs) {
    paths.add(doc.ref.path);
  }
}

async function collectDirectDoc(db, paths, docPath) {
  const snap = await db.doc(docPath).get();

  if (snap.exists) {
    paths.add(docPath);
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = Date.now();

  console.log("Preparing director evaluation trim to 9 times per term...");
  console.log({
    orgId: ORG_ID,
    frameworkId: FRAMEWORK_ID,
    planId: PLAN_ID,
    dryRun: DRY_RUN,
  });

  const pathsToDelete = new Set();

  for (let value = 10; value <= 19; value += 1) {
    const cycleId = `${PLAN_ID}-week-${pad(value)}`;

    await collectDirectDoc(
      db,
      pathsToDelete,
      `orgs/${ORG_ID}/evaluationCycles/${cycleId}`
    );

    const cycleLinkedCollections = [
      "evaluationEvaluatorAssignments",
      "evaluationSubmissions",
      "evaluationCycleTargetSummaries",
    ];

    for (const collectionName of cycleLinkedCollections) {
      await collectByField(db, pathsToDelete, collectionName, "cycleId", cycleId);
    }
  }

  console.log(`\nDocuments to delete: ${pathsToDelete.size}`);

  for (const docPath of Array.from(pathsToDelete).sort()) {
    console.log(DRY_RUN ? `[DRY_RUN DELETE] ${docPath}` : `[DELETE] ${docPath}`);
  }

  const updates = [];

  updates.push({
    path: `orgs/${ORG_ID}/evaluationFrameworks/${FRAMEWORK_ID}`,
    data: {
      title: "تقييم المدير للمعلمين",
      description:
        "قالب رسمي لتقييم المدير للمعلمين، وينفذ 9 مرات داخل الفصل الدراسي.",
      updatedAt: ts,
    },
  });

  updates.push({
    path: `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`,
    data: {
      title: "تقييم المدير لمعلمي منار الريادة بنين السيح - الفصل الأول",
      description:
        "خطة تطبيق تقييم المدير للمعلمين 9 مرات داخل الفصل الدراسي.",
      updatedAt: ts,
    },
  });

  for (let value = 1; value <= 9; value += 1) {
    const cycleId = `${PLAN_ID}-week-${pad(value)}`;

    updates.push({
      path: `orgs/${ORG_ID}/evaluationCycles/${cycleId}`,
      data: {
        title: evaluationTitle(value),
        cycleNumber: value,
        cycleKind: "CUSTOM",
        updatedAt: ts,
      },
    });
  }

  console.log(`\nDocuments to update: ${updates.length}`);

  for (const update of updates) {
    console.log(
      DRY_RUN ? `[DRY_RUN UPDATE] ${update.path}` : `[UPDATE] ${update.path}`
    );
  }

  if (DRY_RUN) {
    console.log("\n✅ Dry run only. No documents were changed.");
    console.log("To apply changes, run with DRY_RUN=false.");
    return;
  }

  let batch = db.batch();
  let count = 0;

  for (const docPath of pathsToDelete) {
    batch.delete(db.doc(docPath));
    count += 1;

    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  for (const update of updates) {
    batch.set(db.doc(update.path), update.data, { merge: true });
    count += 1;

    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  await batch.commit();

  console.log("\n✅ Director evaluation trimmed successfully.");
  console.log({
    deletedDocuments: pathsToDelete.size,
    updatedDocuments: updates.length,
    finalCycles: 9,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to trim director evaluation:");
  console.error(error);
  process.exit(1);
});