const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const ORG_ID = "takween";
const SCHOOL_ID = "kg-02";

const PEOPLE = [
  "p-r-albatel",
  "p-alanoodf",
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);

  const [targetsSnap, evaluatorsSnap] = await Promise.all([
    orgRef.collection("evaluationTargetAssignments").get(),
    orgRef.collection("evaluationEvaluatorAssignments").get(),
  ]);

  const targets = targetsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => text(row.schoolId) === SCHOOL_ID)
    .filter((row) => PEOPLE.includes(text(row.targetPersonId)));

  const evaluators = evaluatorsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => text(row.schoolId) === SCHOOL_ID)
    .filter((row) => PEOPLE.includes(text(row.targetPersonId)));

  for (const personId of PEOPLE) {
    console.log("");
    console.log("========================================");
    console.log(personId);
    console.log("========================================");

    console.log("");
    console.log("TARGET ASSIGNMENTS");

    console.table(
      targets
        .filter((row) => text(row.targetPersonId) === personId)
        .map((row) => ({
          id: row.id,
          planId: row.planId,
          targetDisplayName: row.targetDisplayName,
          targetRoleKey: row.targetRoleKey,
          targetRoleLabel: row.targetRoleLabel,
          status: row.status,
        })),
    );

    console.log("");
    console.log("EVALUATOR ASSIGNMENTS");

    console.table(
      evaluators
        .filter((row) => text(row.targetPersonId) === personId)
        .map((row) => ({
          planId: row.planId,
          cycleId: row.cycleId,
          targetDisplayName: row.targetDisplayName,
          targetRoleKey: row.targetRoleKey,
          targetRoleLabel: row.targetRoleLabel,
          evaluatorDisplayName: row.evaluatorDisplayName,
          status: row.status,
        })),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});