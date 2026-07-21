/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const ASSIGNMENT_ID = "mrb-boys-sayh-principal-staff-evaluation";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  const ref = db.doc(`orgs/${ORG_ID}/operationalAssignments/${ASSIGNMENT_ID}`);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log("Assignment already not found.");
    return;
  }

  await ref.delete();

  console.log("✅ Bad principal operational assignment removed.");
  console.log({
    orgId: ORG_ID,
    assignmentId: ASSIGNMENT_ID,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});