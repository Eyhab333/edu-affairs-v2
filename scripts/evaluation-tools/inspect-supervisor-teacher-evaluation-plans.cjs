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

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const SUPERVISOR_PERSON_ID = getArg("supervisorPersonId").trim();
const SCHOOL_ID = getArg("school").trim();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function rows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function main() {
  if (!SUPERVISOR_PERSON_ID || !SCHOOL_ID) {
    throw new Error("Required: --supervisorPersonId --school");
  }

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const [
    plans,
    frameworks,
    cycles,
    targets,
    evaluators,
  ] = await Promise.all([
    rows(orgRef, "evaluationPlans"),
    rows(orgRef, "evaluationFrameworks"),
    rows(orgRef, "evaluationCycles"),
    rows(orgRef, "evaluationTargetAssignments"),
    rows(orgRef, "evaluationEvaluatorAssignments"),
  ]);

  const supervisorAssignments = evaluators.filter(
    (row) =>
      text(row.schoolId) === SCHOOL_ID &&
      text(row.evaluatorPersonId) === SUPERVISOR_PERSON_ID,
  );

  const planIds = new Set(
    supervisorAssignments
      .map((row) => text(row.planId))
      .filter(Boolean),
  );

  console.log("");
  console.log("SUPERVISOR ASSIGNMENTS");
  console.table(
    supervisorAssignments.map((row) => ({
      planId: row.planId,
      cycleId: row.cycleId,
      targetPersonId: row.targetPersonId,
      targetRoleKey: row.targetRoleKey,
      status: row.status,
      weight: row.weight,
    })),
  );

  console.log("");
  console.log("PLANS REFERENCED BY SUPERVISOR");
  console.table(
    plans
      .filter((plan) => planIds.has(text(plan.id)))
      .map((plan) => {
        const framework = frameworks.find(
          (fw) => text(fw.id) === text(plan.frameworkId),
        );

        const planCycles = cycles.filter(
          (cycle) => text(cycle.planId) === text(plan.id),
        );

        const planTargets = targets.filter(
          (target) => text(target.planId) === text(plan.id),
        );

        return {
          planId: plan.id,
          title: plan.title,
          targetKind: plan.targetKind,
          status: plan.status,
          isActive: plan.isActive,
          frameworkId: plan.frameworkId,
          frameworkStatus: framework?.status,
          frameworkIsActive: framework?.isActive,
          cycles: planCycles.length,
          targets: planTargets.length,
        };
      }),
  );

  console.log("");
  console.log("SAYED-LIKE PLANS IN SCHOOL");

  console.table(
    plans
      .filter((plan) => text(plan.schoolId) === SCHOOL_ID)
      .filter((plan) => {
        const id = text(plan.id).toLowerCase();
        const title = text(plan.title);

        return (
          id.includes("sayed") ||
          title.includes("السيد") ||
          id.includes("educational-supervisor")
        );
      })
      .map((plan) => ({
        planId: plan.id,
        title: plan.title,
        targetKind: plan.targetKind,
        status: plan.status,
        isActive: plan.isActive,
        frameworkId: plan.frameworkId,
      })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});