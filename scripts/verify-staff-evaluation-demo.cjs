/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";

const FRAMEWORK_ID = "weekly-teacher-evaluation-v1";
const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation";
const CYCLE_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation-week-01";

const EVALUATOR_PERSON_ID = "oyVunHzwNwdYV5HMyJKsUwaeCfW2";
const TARGET_PERSON_ID = "p-a-brakat";

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

function compact(value) {
  return JSON.stringify(value, null, 2);
}

async function getDocData(db, pathValue) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    return null;
  }

  return {
    id: snap.id,
    path: snap.ref.path,
    ...snap.data(),
  };
}

async function listByField(db, collectionPath, field, value) {
  const snap = await db.collection(collectionPath).where(field, "==", value).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  }));
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log("Verifying staff evaluation demo seed. No writes will be performed.");

  const framework = await getDocData(
    db,
    `orgs/${ORG_ID}/evaluationFrameworks/${FRAMEWORK_ID}`
  );

  console.log("\n==================================================");
  console.log("Framework");
  console.log("==================================================");

  if (!framework) {
    console.log("❌ Framework not found");
  } else {
    console.log(
      compact({
        path: framework.path,
        id: framework.id,
        title: framework.title,
        targetKind: framework.targetKind,
        frameworkKind: framework.frameworkKind,
        isActive: framework.isActive,
        version: framework.version,
      })
    );
  }

  const sections = await listByField(
    db,
    `orgs/${ORG_ID}/evaluationRubricSections`,
    "frameworkId",
    FRAMEWORK_ID
  );

  console.log("\n==================================================");
  console.log("Rubric Sections");
  console.log("==================================================");
  console.log(`count: ${sections.length}`);

  for (const section of sections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    console.log(
      compact({
        path: section.path,
        id: section.id,
        title: section.title,
        order: section.order,
        weight: section.weight,
        isActive: section.isActive,
      })
    );
  }

  const items = await listByField(
    db,
    `orgs/${ORG_ID}/evaluationRubricItems`,
    "frameworkId",
    FRAMEWORK_ID
  );

  console.log("\n==================================================");
  console.log("Rubric Items");
  console.log("==================================================");
  console.log(`count: ${items.length}`);

  for (const item of items.sort((a, b) => {
    const sectionCompare = String(a.sectionId).localeCompare(String(b.sectionId));
    if (sectionCompare !== 0) return sectionCompare;
    return (a.order ?? 0) - (b.order ?? 0);
  })) {
    console.log(
      compact({
        path: item.path,
        id: item.id,
        sectionId: item.sectionId,
        title: item.title,
        order: item.order,
        maxScore: item.maxScore,
        scoreInputType: item.scoreInputType,
        isRequired: item.isRequired,
        isActive: item.isActive,
      })
    );
  }

  const plan = await getDocData(
    db,
    `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`
  );

  console.log("\n==================================================");
  console.log("Plan");
  console.log("==================================================");

  if (!plan) {
    console.log("❌ Plan not found");
  } else {
    console.log(
      compact({
        path: plan.path,
        id: plan.id,
        title: plan.title,
        schoolId: plan.schoolId,
        academicYearId: plan.academicYearId,
        termId: plan.termId,
        frameworkId: plan.frameworkId,
        planKind: plan.planKind,
        targetKind: plan.targetKind,
        status: plan.status,
      })
    );
  }

  const policies = await listByField(
    db,
    `orgs/${ORG_ID}/evaluatorPolicies`,
    "planId",
    PLAN_ID
  );

  console.log("\n==================================================");
  console.log("Evaluator Policies");
  console.log("==================================================");
  console.log(`count: ${policies.length}`);

  for (const policy of policies) {
    console.log(
      compact({
        path: policy.path,
        id: policy.id,
        evaluatorRoleKey: policy.evaluatorRoleKey,
        evaluatorLabel: policy.evaluatorLabel,
        weight: policy.weight,
        required: policy.required,
        canSubmit: policy.canSubmit,
        canApprove: policy.canApprove,
      })
    );
  }

  const cycle = await getDocData(
    db,
    `orgs/${ORG_ID}/evaluationCycles/${CYCLE_ID}`
  );

  console.log("\n==================================================");
  console.log("Cycle");
  console.log("==================================================");

  if (!cycle) {
    console.log("❌ Cycle not found");
  } else {
    console.log(
      compact({
        path: cycle.path,
        id: cycle.id,
        title: cycle.title,
        planId: cycle.planId,
        cycleNumber: cycle.cycleNumber,
        cycleKind: cycle.cycleKind,
        status: cycle.status,
        isIncludedInAverage: cycle.isIncludedInAverage,
      })
    );
  }

  const targetAssignments = await listByField(
    db,
    `orgs/${ORG_ID}/evaluationTargetAssignments`,
    "planId",
    PLAN_ID
  );

  console.log("\n==================================================");
  console.log("Target Assignments");
  console.log("==================================================");
  console.log(`count: ${targetAssignments.length}`);

  for (const targetAssignment of targetAssignments) {
    console.log(
      compact({
        path: targetAssignment.path,
        id: targetAssignment.id,
        targetPersonId: targetAssignment.targetPersonId,
        targetEmail: targetAssignment.targetEmail,
        targetDisplayName: targetAssignment.targetDisplayName,
        targetRoleKey: targetAssignment.targetRoleKey,
        targetKind: targetAssignment.targetKind,
        status: targetAssignment.status,
      })
    );
  }

  const evaluatorAssignments = await listByField(
    db,
    `orgs/${ORG_ID}/evaluationEvaluatorAssignments`,
    "planId",
    PLAN_ID
  );

  console.log("\n==================================================");
  console.log("Evaluator Assignments");
  console.log("==================================================");
  console.log(`count: ${evaluatorAssignments.length}`);

  for (const evaluatorAssignment of evaluatorAssignments) {
    console.log(
      compact({
        path: evaluatorAssignment.path,
        id: evaluatorAssignment.id,
        cycleId: evaluatorAssignment.cycleId,
        targetPersonId: evaluatorAssignment.targetPersonId,
        evaluatorPersonId: evaluatorAssignment.evaluatorPersonId,
        evaluatorEmail: evaluatorAssignment.evaluatorEmail,
        evaluatorRoleKey: evaluatorAssignment.evaluatorRoleKey,
        weight: evaluatorAssignment.weight,
        sourceType: evaluatorAssignment.sourceType,
        status: evaluatorAssignment.status,
      })
    );
  }

  console.log("\n==================================================");
  console.log("Validation Summary");
  console.log("==================================================");

  const checks = [
    {
      label: "Framework exists",
      ok: !!framework,
    },
    {
      label: "Plan exists and ACTIVE",
      ok: !!plan && plan.status === "ACTIVE",
    },
    {
      label: "Cycle exists and OPEN",
      ok: !!cycle && cycle.status === "OPEN",
    },
    {
      label: "Sections count = 5",
      ok: sections.length === 5,
    },
    {
      label: "Items count = 14",
      ok: items.length === 14,
    },
    {
      label: "Target assignment exists for p-a-brakat",
      ok: targetAssignments.some(
        (assignment) => assignment.targetPersonId === TARGET_PERSON_ID
      ),
    },
    {
      label: "Evaluator assignment exists for Ihab",
      ok: evaluatorAssignments.some(
        (assignment) =>
          assignment.evaluatorPersonId === EVALUATOR_PERSON_ID &&
          assignment.targetPersonId === TARGET_PERSON_ID
      ),
    },
    {
      label: "Evaluator weight = 100",
      ok: evaluatorAssignments.some(
        (assignment) =>
          assignment.evaluatorPersonId === EVALUATOR_PERSON_ID &&
          assignment.targetPersonId === TARGET_PERSON_ID &&
          assignment.weight === 100
      ),
    },
  ];

  for (const check of checks) {
    console.log(`${check.ok ? "✅" : "❌"} ${check.label}`);
  }

  const hasFailures = checks.some((check) => !check.ok);

  if (hasFailures) {
    console.log("\n⚠️ Verify finished with failed checks.");
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Verify finished successfully. No writes performed.");
}

main().catch((error) => {
  console.error("\n❌ Verify failed:");
  console.error(error);
  process.exit(1);
});