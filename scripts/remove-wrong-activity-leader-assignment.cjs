/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const WRONG_EMAIL = (
  process.env.WRONG_EMAIL || "r.almutawa@qz.org.sa"
).toLowerCase();

const ACTIVITY_LEADER_PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-admin-activity-leader-evaluation";

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

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

async function findPersonByEmail(db, email) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  const allSnap = await db.collection(`orgs/${ORG_ID}/people`).get();

  return (
    allSnap.docs
      .map(dataWithId)
      .find((person) => String(person.email || "").toLowerCase() === email) ||
    null
  );
}

async function collectByPlanAndTarget(db, paths, collectionName, targetPersonId) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/${collectionName}`)
    .where("planId", "==", ACTIVITY_LEADER_PLAN_ID)
    .where("targetPersonId", "==", targetPersonId)
    .get();

  for (const doc of snap.docs) {
    paths.add(doc.ref.path);
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log("Removing wrong activity leader assignment...");
  console.log({
    orgId: ORG_ID,
    wrongEmail: WRONG_EMAIL,
    activityLeaderPlanId: ACTIVITY_LEADER_PLAN_ID,
    dryRun: DRY_RUN,
  });

  const wrongPerson = await findPersonByEmail(db, WRONG_EMAIL);

  if (!wrongPerson) {
    throw new Error(`Person not found: ${WRONG_EMAIL}`);
  }

  console.log("Wrong target person:");
  console.log({
    personId: wrongPerson.id,
    displayName: wrongPerson.displayName,
    email: wrongPerson.email,
  });

  const paths = new Set();

  const collections = [
    "evaluationTargetAssignments",
    "evaluationEvaluatorAssignments",
    "evaluationSubmissions",
    "evaluationCycleTargetSummaries",
    "evaluationStaffSummaries",
  ];

  for (const collectionName of collections) {
    await collectByPlanAndTarget(db, paths, collectionName, wrongPerson.id);
  }

  const allPaths = Array.from(paths).sort();

  console.log(`\nMatched documents: ${allPaths.length}`);

  for (const docPath of allPaths) {
    console.log(DRY_RUN ? `[DRY_RUN DELETE] ${docPath}` : `[DELETE] ${docPath}`);
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

  console.log("\n✅ Wrong activity leader assignment removed.");
  console.log({
    deletedDocuments: allPaths.length,
    removedFrom: "رائد النشاط",
    personId: wrongPerson.id,
    email: WRONG_EMAIL,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to remove wrong activity leader assignment:");
  console.error(error);
  process.exit(1);
});