/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const EMAIL = "r.almutawa@qz.org.sa";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-admin-vice-principal-evaluation";

const CORRECT_ROLE_KEY = "SCHOOL_VICE_PRINCIPAL";
const CORRECT_ROLE_LABEL = "وكيل المدرسة";

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

async function main() {
  initAdmin();

  const db = admin.firestore();
  const now = Date.now();

  const person = await findPersonByEmail(db, EMAIL);

  if (!person) {
    throw new Error(`Person not found: ${EMAIL}`);
  }

  console.log("Fixing vice principal role key...");
  console.log({
    personId: person.id,
    displayName: person.displayName,
    email: EMAIL,
    planId: PLAN_ID,
    correctRoleKey: CORRECT_ROLE_KEY,
    correctRoleLabel: CORRECT_ROLE_LABEL,
  });

  const targetSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationTargetAssignments`)
    .where("planId", "==", PLAN_ID)
    .where("targetPersonId", "==", person.id)
    .get();

  const evaluatorSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationEvaluatorAssignments`)
    .where("planId", "==", PLAN_ID)
    .where("targetPersonId", "==", person.id)
    .get();

  const submissionSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationSubmissions`)
    .where("planId", "==", PLAN_ID)
    .where("targetPersonId", "==", person.id)
    .get();

  const cycleSummarySnap = await db
    .collection(`orgs/${ORG_ID}/evaluationCycleTargetSummaries`)
    .where("planId", "==", PLAN_ID)
    .where("targetPersonId", "==", person.id)
    .get();

  const staffSummarySnap = await db
    .collection(`orgs/${ORG_ID}/evaluationStaffSummaries`)
    .where("planId", "==", PLAN_ID)
    .where("targetPersonId", "==", person.id)
    .get();

  const refs = [
    ...targetSnap.docs,
    ...evaluatorSnap.docs,
    ...submissionSnap.docs,
    ...cycleSummarySnap.docs,
    ...staffSummarySnap.docs,
  ];

  console.log({
    targetAssignments: targetSnap.size,
    evaluatorAssignments: evaluatorSnap.size,
    submissions: submissionSnap.size,
    cycleSummaries: cycleSummarySnap.size,
    staffSummaries: staffSummarySnap.size,
    totalDocsToUpdate: refs.length,
  });

  const batch = db.batch();

  for (const doc of refs) {
    batch.set(
      doc.ref,
      {
        targetRoleKey: CORRECT_ROLE_KEY,
        targetRoleLabel: CORRECT_ROLE_LABEL,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();

  console.log("\n✅ Vice principal role key fixed successfully.");
}

main().catch((error) => {
  console.error("\n❌ Failed to fix vice principal role key:");
  console.error(error);
  process.exit(1);
});