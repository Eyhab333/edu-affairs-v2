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

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-sayh";
const EMAIL = "hameed-s@qz.org.sa";

function isActive(row) {
  return row.status === "ACTIVE" || row.active === true;
}

async function resolveTeacher() {
  const snap = await db.collection("users").where("email", "==", EMAIL).limit(5).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected exactly one user for ${EMAIL}, found ${users.length}`);
  }

  const user = users[0];

  if (!user.personId) {
    throw new Error(`User has no personId for ${EMAIL}`);
  }

  return {
    uid: user.uid || user.id,
    email: user.email,
    personId: user.personId,
    displayName: user.displayName || "حامد السيد السيد نافع",
    roleKey: "BOYS_TEACHER",
    roleLabel: "معلم",
  };
}

function needsRepair(row, teacher) {
  return (
    row.targetEmail !== teacher.email ||
    row.targetDisplayName !== teacher.displayName ||
    row.targetPersonId !== teacher.personId
  );
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const teacher = await resolveTeacher();

  const targetSnap = await orgRef
    .collection("evaluationTargetAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const evaluatorSnap = await orgRef
    .collection("evaluationEvaluatorAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const activeTargets = targetSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const activeEvaluators = evaluatorSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const targetRowsToRepair = activeTargets.filter((row) => needsRepair(row, teacher));

  const evaluatorRowsToRepair = activeEvaluators.filter((row) => {
    return (
      row.targetEmail !== undefined ||
      row.targetDisplayName !== undefined ||
      row.targetRoleKey !== undefined ||
      row.targetRoleLabel !== undefined
    );
  });

  const safe =
    activeTargets.length === 8 &&
    activeEvaluators.length === 75 &&
    targetRowsToRepair.length === 8;

  console.dir(
    {
      teacher,
      schoolId: SCHOOL_ID,
      counts: {
        activeTargets: activeTargets.length,
        activeEvaluators: activeEvaluators.length,
        targetRowsToRepair: targetRowsToRepair.length,
        evaluatorRowsToRepair: evaluatorRowsToRepair.length,
      },
      targetRepairsPreview: targetRowsToRepair.map((row) => ({
        id: row.id,
        planId: row.planId,
        before: {
          targetPersonId: row.targetPersonId,
          targetEmail: row.targetEmail,
          targetDisplayName: row.targetDisplayName,
          targetRoleKey: row.targetRoleKey,
          targetRoleLabel: row.targetRoleLabel,
        },
        after: {
          targetPersonId: teacher.personId,
          targetEmail: teacher.email,
          targetDisplayName: teacher.displayName,
          targetRoleKey: teacher.roleKey,
          targetRoleLabel: teacher.roleLabel,
        },
      })),
      decision: safe ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
    },
    { depth: 20 }
  );

  if (!APPLY) {
    console.log("No writes performed.");
    return;
  }

  if (!safe) {
    console.log("Not safe. No writes performed.");
    return;
  }

  const now = Date.now();
  const batch = db.batch();

  for (const row of targetRowsToRepair) {
    batch.update(row.ref, {
      targetPersonId: teacher.personId,
      targetEmail: teacher.email,
      targetDisplayName: teacher.displayName,
      targetRoleKey: teacher.roleKey,
      targetRoleLabel: teacher.roleLabel,
      updatedAt: now,
    });
  }

  for (const row of evaluatorRowsToRepair) {
    batch.update(row.ref, {
      targetPersonId: teacher.personId,
      targetEmail: teacher.email,
      targetDisplayName: teacher.displayName,
      targetRoleKey: teacher.roleKey,
      targetRoleLabel: teacher.roleLabel,
      updatedAt: now,
    });
  }

  await batch.commit();

  console.dir({
    decision: "APPLIED",
    repairedTargetAssignments: targetRowsToRepair.length,
    repairedEvaluatorAssignments: evaluatorRowsToRepair.length,
  });
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});