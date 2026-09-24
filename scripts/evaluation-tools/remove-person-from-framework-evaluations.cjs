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

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const ORG_ID = getArg("org", "takween");
const PERSON_ID = getArg("personId").trim();
const FRAMEWORK_ID = getArg("frameworkId").trim();
const SCHOOL_ID = getArg("school").trim();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isActive(row) {
  return text(row.status).toUpperCase() === "ACTIVE";
}

async function rows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function main() {
  if (!PERSON_ID || !FRAMEWORK_ID || !SCHOOL_ID) {
    throw new Error("Required: --personId --frameworkId --school");
  }

  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const [plans, targetAssignments, evaluatorAssignments, submissions] =
    await Promise.all([
      rows(orgRef, "evaluationPlans"),
      rows(orgRef, "evaluationTargetAssignments"),
      rows(orgRef, "evaluationEvaluatorAssignments"),
      rows(orgRef, "evaluationSubmissions"),
    ]);

  const matchingPlans = plans.filter(
    (plan) =>
      text(plan.frameworkId) === FRAMEWORK_ID &&
      text(plan.schoolId) === SCHOOL_ID,
  );

  const planIds = new Set(matchingPlans.map((plan) => text(plan.id)));

  const targets = targetAssignments
    .filter((row) => planIds.has(text(row.planId)))
    .filter((row) => text(row.targetPersonId) === PERSON_ID)
    .filter(isActive);

  const evaluators = evaluatorAssignments
    .filter((row) => planIds.has(text(row.planId)))
    .filter((row) => text(row.targetPersonId) === PERSON_ID)
    .filter(isActive);

  const matchingSubmissions = submissions
    .filter((row) => planIds.has(text(row.planId)))
    .filter((row) => text(row.targetPersonId) === PERSON_ID);

  const now = Date.now();

  const writes = [
    ...targets.map((row) => ({
      ref: row.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "REMOVED_FROM_FRAMEWORK_EVALUATION",
        updatedAt: now,
      },
    })),

    ...evaluators.map((row) => ({
      ref: row.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "REMOVED_FROM_FRAMEWORK_EVALUATION",
        updatedAt: now,
      },
    })),
  ];

  console.dir(
    {
      decision: "SAFE_PREVIEW",
      personId: PERSON_ID,
      frameworkId: FRAMEWORK_ID,
      schoolId: SCHOOL_ID,

      matchingPlans: matchingPlans.map((plan) => ({
        id: plan.id,
        title: plan.title || "",
      })),

      activeTargetAssignments: targets.length,
      activeEvaluatorAssignments: evaluators.length,
      submissionsFound: matchingSubmissions.length,

      plannedWrites: writes.length,
      submissionsTouched: 0,
    },
    { depth: 20 },
  );

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    return;
  }

  const PRESERVE_SUBMISSIONS = process.argv.includes("--preserveSubmissions");

  if (matchingSubmissions.length > 0 && !PRESERVE_SUBMISSIONS) {
    throw new Error(
      `Stopped: ${matchingSubmissions.length} submission(s) found. ` +
        `Re-run with --preserveSubmissions to keep historical submissions and remove only active assignments.`,
    );
  }

  const batch = db.batch();

  for (const write of writes) {
    batch.set(write.ref, write.data, { merge: true });
  }

  await batch.commit();

  console.dir({
    decision: "APPLIED",
    committedWrites: writes.length,
    targetAssignmentsRemoved: targets.length,
    evaluatorAssignmentsRemoved: evaluators.length,
    submissionsTouched: 0,
    
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
