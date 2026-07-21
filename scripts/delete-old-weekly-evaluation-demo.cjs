/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const OLD_FRAMEWORK_ID = "weekly-teacher-evaluation-v1";
const OLD_PLAN_ID = "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation";

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

async function collectDirectDoc(db, paths, docPath) {
  const snap = await db.doc(docPath).get();

  if (snap.exists) {
    paths.add(docPath);
  }
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

async function deletePaths(db, paths) {
  const allPaths = Array.from(paths).sort();

  if (allPaths.length === 0) {
    console.log("No matching old evaluation documents found.");
    return;
  }

  console.log(`\nMatched documents: ${allPaths.length}\n`);

  for (const docPath of allPaths) {
    console.log(DRY_RUN ? `[DRY_RUN] ${docPath}` : `[DELETE] ${docPath}`);
  }

  if (DRY_RUN) {
    console.log("\n✅ Dry run only. No documents were deleted.");
    console.log("To delete for real, run with DRY_RUN=false.");
    return;
  }

  let batch = db.batch();
  let count = 0;

  for (const docPath of allPaths) {
    batch.delete(db.doc(docPath));
    count += 1;

    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  await batch.commit();

  console.log(`\n✅ Deleted ${allPaths.length} old evaluation documents.`);
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const paths = new Set();

  console.log("Preparing to delete OLD weekly evaluation demo...");
  console.log({
    orgId: ORG_ID,
    oldFrameworkId: OLD_FRAMEWORK_ID,
    oldPlanId: OLD_PLAN_ID,
    dryRun: DRY_RUN,
  });

  // Old framework itself.
  await collectDirectDoc(
    db,
    paths,
    `orgs/${ORG_ID}/evaluationFrameworks/${OLD_FRAMEWORK_ID}`
  );

  // Old rubric sections/items connected to the old framework.
  await collectByField(
    db,
    paths,
    "evaluationRubricSections",
    "frameworkId",
    OLD_FRAMEWORK_ID
  );

  await collectByField(
    db,
    paths,
    "evaluationRubricItems",
    "frameworkId",
    OLD_FRAMEWORK_ID
  );

  // Old plan itself.
  await collectDirectDoc(
    db,
    paths,
    `orgs/${ORG_ID}/evaluationPlans/${OLD_PLAN_ID}`
  );

  // Everything generated from the old plan.
  const planCollections = [
    "evaluatorPolicies",
    "evaluationCycles",
    "evaluationTargetAssignments",
    "evaluationEvaluatorAssignments",
    "evaluationSubmissions",
    "evaluationCycleTargetSummaries",
    "evaluationStaffSummaries",
  ];

  for (const collectionName of planCollections) {
    await collectByField(db, paths, collectionName, "planId", OLD_PLAN_ID);
  }

  await deletePaths(db, paths);
}

main().catch((error) => {
  console.error("\n❌ Failed to delete old evaluation demo:");
  console.error(error);
  process.exit(1);
});