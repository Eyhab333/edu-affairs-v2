/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const EMAILS = [
  "r.almutawa@qz.org.sa",
  "f.alqashami@qz.org.sa",
];

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

  for (const email of EMAILS) {
    console.log("\n====================================");
    console.log(`Inspecting: ${email}`);
    console.log("====================================");

    const person = await findPersonByEmail(db, email);

    if (!person) {
      console.log("Person not found.");
      continue;
    }

    console.log("Person:");
    console.log({
      personId: person.id,
      displayName: person.displayName,
      email: person.email,
    });

    const targetSnap = await db
      .collection(`orgs/${ORG_ID}/evaluationTargetAssignments`)
      .where("targetPersonId", "==", person.id)
      .get();

    console.log(`\nTarget assignments: ${targetSnap.size}`);

    for (const doc of targetSnap.docs) {
      const data = doc.data();

      console.log({
        id: doc.id,
        planId: data.planId,
        targetRoleKey: data.targetRoleKey,
        targetRoleLabel: data.targetRoleLabel,
        targetKind: data.targetKind,
        status: data.status,
      });
    }

    const evaluatorSnap = await db
      .collection(`orgs/${ORG_ID}/evaluationEvaluatorAssignments`)
      .where("targetPersonId", "==", person.id)
      .get();

    console.log(`\nEvaluator assignments: ${evaluatorSnap.size}`);

    for (const doc of evaluatorSnap.docs) {
      const data = doc.data();

      console.log({
        id: doc.id,
        planId: data.planId,
        cycleId: data.cycleId,
        targetRoleKey: data.targetRoleKey,
        targetRoleLabel: data.targetRoleLabel,
        evaluatorEmail: data.evaluatorEmail,
        status: data.status,
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});