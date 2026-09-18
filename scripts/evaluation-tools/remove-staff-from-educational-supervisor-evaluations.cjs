const admin = require("firebase-admin");
const fs = require("fs");
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
const YEAR_ID = getArg("year", "ay-1448");
const TERM_ID = getArg("term", "term-1");

const TARGET_PERSON_ID = getArg("targetPersonId").trim();
const SCHOOL_ID = getArg("school").trim();

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isActive(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[@]/g, "_at_")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireArgs() {
  const missing = [];

  if (!TARGET_PERSON_ID) {
    missing.push("--targetPersonId");
  }

  if (!SCHOOL_ID) {
    missing.push("--school");
  }

  if (missing.length > 0) {
    console.error("Missing required args:", missing.join(", "));
    process.exit(1);
  }
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

function isEducationalSupervisorTeacherPlan(plan) {
  const planId = asString(plan.id).toLowerCase();
  const title = asString(plan.title);
  const targetKind = asString(plan.targetKind).toUpperCase();

  if (targetKind !== "TEACHER") {
    return false;
  }

  const looksEducationalSupervisor =
    planId.includes("educational-supervisor") ||
    title.includes("المشرفة التعليمية") ||
    title.includes("المشرف التعليمي");

  return looksEducationalSupervisor;
}

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "remove-staff-from-educational-supervisor-evaluations",
      safeFileName(TARGET_PERSON_ID),
      safeFileName(SCHOOL_ID),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return reportPath;
}

async function commitInChunks(writes, chunkSize = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + chunkSize);

    for (const write of chunk) {
      batch.set(write.ref, write.data, { merge: true });
    }

    await batch.commit();
    committed += chunk.length;
  }

  return committed;
}

async function main() {
  requireArgs();

  console.log(
    APPLY
      ? "APPLY mode"
      : "Preview mode - no writes",
  );

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const [
    plans,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    getCollectionRows(orgRef, "evaluationPlans"),
    getCollectionRows(orgRef, "evaluationTargetAssignments"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const relevantPlans = plans
    .filter(
      (plan) =>
        asString(plan.schoolId) === SCHOOL_ID,
    )
    .filter(
      (plan) =>
        asString(plan.academicYearId, YEAR_ID) === YEAR_ID,
    )
    .filter(
      (plan) =>
        asString(plan.termId, TERM_ID) === TERM_ID,
    )
    .filter(isActive)
    .filter(isEducationalSupervisorTeacherPlan);

  const relevantPlanIds = new Set(
    relevantPlans.map((plan) => asString(plan.id)),
  );

  const activeTargetAssignments = targetAssignments
    .filter(
      (row) =>
        relevantPlanIds.has(asString(row.planId)),
    )
    .filter(
      (row) =>
        asString(row.schoolId) === SCHOOL_ID,
    )
    .filter(
      (row) =>
        asString(row.targetPersonId) === TARGET_PERSON_ID,
    )
    .filter(isActive);

  const activeEvaluatorAssignments = evaluatorAssignments
    .filter(
      (row) =>
        relevantPlanIds.has(asString(row.planId)),
    )
    .filter(
      (row) =>
        asString(row.schoolId) === SCHOOL_ID,
    )
    .filter(
      (row) =>
        asString(row.targetPersonId) === TARGET_PERSON_ID,
    )
    .filter(isActive);

  const historicalSubmissions = submissions
    .filter(
      (row) =>
        relevantPlanIds.has(asString(row.planId)),
    )
    .filter(
      (row) =>
        asString(row.schoolId) === SCHOOL_ID,
    )
    .filter(
      (row) =>
        asString(row.targetPersonId) === TARGET_PERSON_ID,
    );

  const warnings = [];
  const conflicts = [];

  if (relevantPlans.length === 0) {
    conflicts.push({
      reason: "NO_EDUCATIONAL_SUPERVISOR_TEACHER_PLANS_FOUND",
      schoolId: SCHOOL_ID,
    });
  }

  if (
    activeTargetAssignments.length === 0 &&
    activeEvaluatorAssignments.length === 0
  ) {
    warnings.push({
      reason: "NO_ACTIVE_ASSIGNMENTS_FOUND",
      targetPersonId: TARGET_PERSON_ID,
      schoolId: SCHOOL_ID,
    });
  }

  const now = Date.now();

  const targetWrites = activeTargetAssignments.map(
    (assignment) => ({
      ref: assignment.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason:
          "REMOVED_FROM_EDUCATIONAL_SUPERVISOR_EVALUATIONS",
        removalTool:
          "remove-staff-from-educational-supervisor-evaluations.cjs",
        updatedAt: now,
      },
    }),
  );

  const evaluatorWrites = activeEvaluatorAssignments.map(
    (assignment) => ({
      ref: assignment.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason:
          "REMOVED_FROM_EDUCATIONAL_SUPERVISOR_EVALUATIONS",
        removalTool:
          "remove-staff-from-educational-supervisor-evaluations.cjs",
        updatedAt: now,
      },
    }),
  );

  const allWrites = [
    ...targetWrites,
    ...evaluatorWrites,
  ];

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode: APPLY ? "APPLY" : "PREVIEW",

    input: {
      orgId: ORG_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      targetPersonId: TARGET_PERSON_ID,
      schoolId: SCHOOL_ID,
    },

    relevantPlans: relevantPlans.map((plan) => ({
      id: plan.id,
      title: plan.title || "",
      frameworkId: plan.frameworkId || "",
    })),

    currentState: {
      relevantPlansCount: relevantPlans.length,
      activeTargetAssignments:
        activeTargetAssignments.length,
      activeEvaluatorAssignments:
        activeEvaluatorAssignments.length,
      historicalSubmissions:
        historicalSubmissions.length,
    },

    plannedChanges: {
      removeTargetAssignments:
        targetWrites.length,
      removeEvaluatorAssignments:
        evaluatorWrites.length,
      submissionsTouched: 0,
      totalWrites: allWrites.length,
    },

    targetAssignments: activeTargetAssignments.map(
      (row) => ({
        id: row.id,
        planId: row.planId || "",
        targetPersonId: row.targetPersonId || "",
        targetDisplayName:
          row.targetDisplayName || "",
        status: row.status || "",
      }),
    ),

    evaluatorAssignments:
      activeEvaluatorAssignments.map((row) => ({
        id: row.id,
        planId: row.planId || "",
        cycleId: row.cycleId || "",
        evaluatorPersonId:
          row.evaluatorPersonId || "",
        evaluatorDisplayName:
          row.evaluatorDisplayName || "",
        targetPersonId:
          row.targetPersonId || "",
        weight: row.weight,
        status: row.status || "",
      })),

    warnings,
    conflicts,

    safety: {
      firestoreDeletes: 0,
      submissionsTouched: 0,
      plansTouched: 0,
      frameworksTouched: 0,
      cyclesTouched: 0,
      assignmentsMarkedRemovedOnly: true,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      currentState: report.currentState,
      plannedChanges: report.plannedChanges,
      warningsCount: warnings.length,
      conflictsCount: conflicts.length,
      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log(
      "Stopped. Fix conflicts before applying.",
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log(
      "Review the JSON report carefully.",
    );
    console.log(
      "Run again with --apply to remove the assignments.",
    );
    return;
  }

  const committed =
    await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    targetAssignmentsRemoved:
      targetWrites.length,
    evaluatorAssignmentsRemoved:
      evaluatorWrites.length,
    submissionsTouched: 0,
  };

  const applyReportPath = writeJsonReport({
    ...report,
    applyResult,
  });

  console.dir({
    ...applyResult,
    applyReportPath,
  });
}

main().catch((error) => {
  console.error(
    "Remove from educational supervisor evaluations failed:",
    error,
  );
  process.exit(1);
});