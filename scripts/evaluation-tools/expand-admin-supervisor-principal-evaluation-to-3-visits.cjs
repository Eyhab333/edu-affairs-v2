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

const EVALUATOR_PERSON_ID = getArg("evaluatorPersonId", "p-a-almansur");

const DEFAULT_SCHOOL_IDS = ["mrb-girls", "kg-01", "kg-02", "kg-03", "kg-04"];

const SCHOOL_IDS = getArg("schools")
  ? getArg("schools")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  : DEFAULT_SCHOOL_IDS;

const TARGET_VISITS = 3;

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isActive(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
}

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "OPEN" || status === "ACTIVE" || !status;
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[@]/g, "_at_")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "expand-admin-supervisor-principal-to-3-visits",
      safeFileName(EVALUATOR_PERSON_ID),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return reportPath;
}

function uniqueBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, item);
  }

  return Array.from(map.values());
}

function sortByCycle(items) {
  return [...items].sort((a, b) => {
    const aOrder = asNumber(a.sequence, asNumber(a.cycleNumber, asNumber(a.order, 9999)));
    const bOrder = asNumber(b.sequence, asNumber(b.cycleNumber, asNumber(b.order, 9999)));

    if (aOrder !== bOrder) return aOrder - bOrder;

    return asString(a.id).localeCompare(asString(b.id));
  });
}

function visitTitle(visitNumber) {
  switch (visitNumber) {
    case 1:
      return "الزيارة الأولى";
    case 2:
      return "الزيارة الثانية";
    case 3:
      return "الزيارة الثالثة";
    default:
      return `الزيارة ${visitNumber}`;
  }
}

function makeCycleIdFromPattern(params) {
  const { patternCycleId, planId, visitNumber } = params;
  const padded = String(visitNumber).padStart(2, "0");
  const id = asString(patternCycleId);

  if (!id) {
    return `${planId}-evaluation-${padded}`;
  }

  if (/-visit-\d+$/.test(id)) {
    return id.replace(/-visit-\d+$/, `-visit-${padded}`);
  }

  if (/-evaluation-\d+$/.test(id)) {
    return id.replace(/-evaluation-\d+$/, `-evaluation-${padded}`);
  }

  if (/-cycle-\d+$/.test(id)) {
    return id.replace(/-cycle-\d+$/, `-cycle-${padded}`);
  }

  if (/-period-\d+$/.test(id)) {
    return id.replace(/-period-\d+$/, `-period-${padded}`);
  }

  if (/-week-\d+$/.test(id)) {
    return id.replace(/-week-\d+$/, `-week-${padded}`);
  }

  if (/-\d+$/.test(id)) {
    return id.replace(/-\d+$/, `-${padded}`);
  }

  return `${planId}-evaluation-${padded}`;
}

function makeEvaluatorAssignmentIdFromPattern(params) {
  const { patternId, patternCycleId, newCycleId, targetPersonId, evaluatorPersonId, planId } =
    params;

  let id = asString(patternId);

  if (id && patternCycleId && id.includes(patternCycleId)) {
    id = id.split(patternCycleId).join(newCycleId);
    return id;
  }

  return `${planId}-${newCycleId}-${targetPersonId}-${evaluatorPersonId}`;
}

function isAdminSupervisorPrincipalPlan(plan) {
  const schoolId = asString(plan.schoolId);
  const planId = asString(plan.id);
  const frameworkId = asString(plan.frameworkId);
  const title = asString(plan.title);

  if (!SCHOOL_IDS.includes(schoolId)) return false;
  if (asString(plan.academicYearId) !== YEAR_ID) return false;
  if (asString(plan.termId) !== TERM_ID) return false;
  if (!isActive(plan)) return false;

  return (
    planId.includes("admin-supervisor-principal-evaluation") ||
    frameworkId.includes("admin-supervisor-principal-evaluation") ||
    title.includes("المشرفة الإدارية") && title.includes("مديرة")
  );
}

function targetAssignmentId(planId, targetPersonId) {
  return `${planId}-target-${targetPersonId}`;
}

function cleanForCycleCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.removedAt;
  delete cleaned.removedReason;

  return cleaned;
}

function cleanForEvaluatorCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.removedAt;
  delete cleaned.removedReason;

  return cleaned;
}

function buildCycleWrite(params) {
  const { plan, patternCycle, newCycleId, visitNumber, now } = params;

  const base = cleanForCycleCopy(patternCycle);

  return {
    ...base,

    id: newCycleId,
    orgId: ORG_ID,

    schoolId: asString(plan.schoolId),
    schoolTitle: asString(plan.schoolTitle),

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId: asString(plan.id),
    planTitle: asString(plan.title),
    frameworkId: asString(plan.frameworkId),

    title: visitTitle(visitNumber),
    shortTitle: visitTitle(visitNumber),

    sequence: visitNumber,
    order: visitNumber,
    cycleNumber: visitNumber,
    visitNumber,

    status: "OPEN",

    createdByExpansionTool: true,
    expandedFromCycleId: asString(patternCycle.id),
    expansionTool: "expand-admin-supervisor-principal-evaluation-to-3-visits.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildEvaluatorAssignmentWrite(params) {
  const {
    plan,
    cycle,
    targetAssignment,
    patternAssignment,
    newAssignmentId,
    newCycleId,
    now,
  } = params;

  const base = cleanForEvaluatorCopy(patternAssignment);

  const targetPersonId = asString(
    targetAssignment.targetPersonId,
    asString(patternAssignment.targetPersonId),
  );

  return {
    ...base,

    id: newAssignmentId,
    orgId: ORG_ID,

    schoolId: asString(plan.schoolId),
    schoolTitle: asString(plan.schoolTitle),

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId: asString(plan.id),
    planTitle: asString(plan.title),
    frameworkId: asString(plan.frameworkId),

    cycleId: newCycleId,
    cycleTitle: asString(cycle.title, visitTitle(asNumber(cycle.visitNumber, asNumber(cycle.cycleNumber, 1)))),

    targetAssignmentId: targetAssignmentId(asString(plan.id), targetPersonId),
    targetKind: asString(targetAssignment.targetKind, asString(patternAssignment.targetKind, "ADMIN")),
    targetPersonId,
    targetEmail: asString(targetAssignment.targetEmail, asString(patternAssignment.targetEmail)),
    targetDisplayName: asString(
      targetAssignment.targetDisplayName,
      asString(patternAssignment.targetDisplayName, targetPersonId),
    ),
    targetRoleKey: asString(targetAssignment.targetRoleKey, asString(patternAssignment.targetRoleKey)),
    targetRoleLabel: asString(targetAssignment.targetRoleLabel, asString(patternAssignment.targetRoleLabel)),

    evaluatorPersonId: asString(patternAssignment.evaluatorPersonId, EVALUATOR_PERSON_ID),
    evaluatorEmail: asString(patternAssignment.evaluatorEmail),
    evaluatorDisplayName: asString(patternAssignment.evaluatorDisplayName),
    evaluatorRoleKey: asString(patternAssignment.evaluatorRoleKey, "ADMIN_SUPERVISOR"),
    evaluatorRoleLabel: asString(patternAssignment.evaluatorRoleLabel, "المشرفة الإدارية"),

    status: "ACTIVE",

    createdByExpansionTool: true,
    expandedFromAssignmentId: asString(patternAssignment.id),
    expansionTool: "expand-admin-supervisor-principal-evaluation-to-3-visits.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
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
  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [plans, cycles, targetAssignments, evaluatorAssignments, submissions] =
    await Promise.all([
      getCollectionRows(orgRef, "evaluationPlans"),
      getCollectionRows(orgRef, "evaluationCycles"),
      getCollectionRows(orgRef, "evaluationTargetAssignments"),
      getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
      getCollectionRows(orgRef, "evaluationSubmissions"),
    ]);

  const targetPlans = plans
    .filter(isAdminSupervisorPrincipalPlan)
    .sort((a, b) => asString(a.id).localeCompare(asString(b.id)));

  const conflicts = [];
  const warnings = [];

  if (targetPlans.length === 0) {
    conflicts.push({
      reason: "NO_ADMIN_SUPERVISOR_PRINCIPAL_PLANS_FOUND",
      schoolIds: SCHOOL_IDS,
      yearId: YEAR_ID,
      termId: TERM_ID,
      evaluatorPersonId: EVALUATOR_PERSON_ID,
    });
  }

  const newCycleWrites = [];
  const newEvaluatorAssignmentWrites = [];
  const planUpdateWrites = [];
  const planReports = [];

  for (const plan of targetPlans) {
    const planId = asString(plan.id);

    const planCycles = sortByCycle(
      cycles
        .filter((cycle) => cycle.planId === planId)
        .filter((cycle) => asString(cycle.academicYearId, YEAR_ID) === YEAR_ID)
        .filter((cycle) => asString(cycle.termId, TERM_ID) === TERM_ID)
        .filter(isUsableCycle),
    );

    const existingCycleIds = new Set(planCycles.map((cycle) => asString(cycle.id)));

    const patternCycle = planCycles[0];

    if (!patternCycle) {
      conflicts.push({
        reason: "NO_EXISTING_CYCLE_TO_USE_AS_PATTERN",
        planId,
        title: asString(plan.title),
        schoolId: asString(plan.schoolId),
      });
      continue;
    }

    const planTargetAssignments = targetAssignments
      .filter((target) => target.planId === planId)
      .filter((target) => asString(target.schoolId) === asString(plan.schoolId))
      .filter((target) => asString(target.academicYearId, YEAR_ID) === YEAR_ID)
      .filter((target) => asString(target.termId, TERM_ID) === TERM_ID)
      .filter(isActive);

    if (planTargetAssignments.length === 0) {
      conflicts.push({
        reason: "NO_ACTIVE_TARGET_ASSIGNMENTS_FOR_PLAN",
        planId,
        title: asString(plan.title),
        schoolId: asString(plan.schoolId),
      });
      continue;
    }

    const activeEvaluatorAssignmentsForPlan = evaluatorAssignments
      .filter((assignment) => assignment.planId === planId)
      .filter((assignment) => asString(assignment.schoolId) === asString(plan.schoolId))
      .filter((assignment) => asString(assignment.evaluatorPersonId) === EVALUATOR_PERSON_ID)
      .filter(isActive);

    if (activeEvaluatorAssignmentsForPlan.length === 0) {
      conflicts.push({
        reason: "NO_ACTIVE_EVALUATOR_ASSIGNMENT_PATTERN_FOR_ASMAA",
        planId,
        title: asString(plan.title),
        schoolId: asString(plan.schoolId),
        evaluatorPersonId: EVALUATOR_PERSON_ID,
      });
      continue;
    }

    const createdCycleReports = [];
    const assignmentReports = [];

    const desiredCycles = [];

    for (let visitNumber = 1; visitNumber <= TARGET_VISITS; visitNumber += 1) {
      let desiredCycle =
        planCycles.find((cycle) => {
          return (
            asNumber(cycle.visitNumber) === visitNumber ||
            asNumber(cycle.cycleNumber) === visitNumber ||
            asNumber(cycle.sequence) === visitNumber ||
            asNumber(cycle.order) === visitNumber ||
            asString(cycle.id).endsWith(`-${String(visitNumber).padStart(2, "0")}`)
          );
        }) || null;

      const desiredCycleId =
        desiredCycle?.id ||
        makeCycleIdFromPattern({
          patternCycleId: asString(patternCycle.id),
          planId,
          visitNumber,
        });

      if (!desiredCycle) {
        desiredCycle = {
          ...buildCycleWrite({
            plan,
            patternCycle,
            newCycleId: desiredCycleId,
            visitNumber,
            now,
          }),
        };

        if (!existingCycleIds.has(desiredCycleId)) {
          newCycleWrites.push({
            ref: orgRef.collection("evaluationCycles").doc(desiredCycleId),
            data: desiredCycle,
          });

          createdCycleReports.push({
            action: "CREATE_CYCLE",
            cycleId: desiredCycleId,
            title: desiredCycle.title,
            visitNumber,
          });
        }
      }

      desiredCycles.push({
        ...desiredCycle,
        id: desiredCycleId,
        visitNumber,
      });
    }

    const activeAssignmentKeys = new Set(
      activeEvaluatorAssignmentsForPlan.map((assignment) => {
        return [
          asString(assignment.cycleId),
          asString(assignment.targetPersonId),
          asString(assignment.evaluatorPersonId),
        ].join("__");
      }),
    );

    for (const targetAssignment of planTargetAssignments) {
      const targetPersonId = asString(targetAssignment.targetPersonId);

      const patternsForSameTarget = activeEvaluatorAssignmentsForPlan.filter(
        (assignment) => asString(assignment.targetPersonId) === targetPersonId,
      );

      const patternAssignment =
        patternsForSameTarget[0] || activeEvaluatorAssignmentsForPlan[0];

      if (!patternAssignment) {
        conflicts.push({
          reason: "NO_PATTERN_ASSIGNMENT_FOR_TARGET",
          planId,
          targetPersonId,
          targetDisplayName: asString(targetAssignment.targetDisplayName),
        });
        continue;
      }

      for (const desiredCycle of desiredCycles) {
        const cycleId = asString(desiredCycle.id);
        const key = [cycleId, targetPersonId, EVALUATOR_PERSON_ID].join("__");

        if (activeAssignmentKeys.has(key)) {
          assignmentReports.push({
            action: "SKIP_EXISTING_ASSIGNMENT",
            cycleId,
            targetPersonId,
            targetDisplayName: asString(targetAssignment.targetDisplayName),
          });
          continue;
        }

        const newAssignmentId = makeEvaluatorAssignmentIdFromPattern({
          patternId: asString(patternAssignment.id),
          patternCycleId: asString(patternAssignment.cycleId),
          newCycleId: cycleId,
          targetPersonId,
          evaluatorPersonId: EVALUATOR_PERSON_ID,
          planId,
        });

        newEvaluatorAssignmentWrites.push({
          ref: orgRef.collection("evaluationEvaluatorAssignments").doc(newAssignmentId),
          data: buildEvaluatorAssignmentWrite({
            plan,
            cycle: desiredCycle,
            targetAssignment,
            patternAssignment,
            newAssignmentId,
            newCycleId: cycleId,
            now,
          }),
        });

        assignmentReports.push({
          action: "CREATE_EVALUATOR_ASSIGNMENT",
          assignmentId: newAssignmentId,
          cycleId,
          targetPersonId,
          targetDisplayName: asString(targetAssignment.targetDisplayName),
        });
      }
    }

    planUpdateWrites.push({
      ref: orgRef.collection("evaluationPlans").doc(planId),
      data: {
        cycleCount: TARGET_VISITS,
        maxCyclesPerTerm: TARGET_VISITS,
        updatedAt: now,
        expandedToVisits: TARGET_VISITS,
        expansionTool: "expand-admin-supervisor-principal-evaluation-to-3-visits.cjs",
      },
    });

    planReports.push({
      planId,
      title: asString(plan.title),
      schoolId: asString(plan.schoolId),
      schoolTitle: asString(plan.schoolTitle),
      existingCyclesCount: planCycles.length,
      targetVisits: TARGET_VISITS,
      activeTargetsCount: planTargetAssignments.length,
      activeEvaluatorAssignmentsBefore: activeEvaluatorAssignmentsForPlan.length,
      createdCycles: createdCycleReports,
      assignmentActions: assignmentReports,
    });
  }

  const matchingSubmissions = submissions
    .filter((submission) => targetPlans.some((plan) => plan.id === submission.planId))
    .filter((submission) => asString(submission.evaluatorPersonId) === EVALUATOR_PERSON_ID);

  const allWrites = [
    ...newCycleWrites,
    ...newEvaluatorAssignmentWrites,
    ...planUpdateWrites,
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
      evaluatorPersonId: EVALUATOR_PERSON_ID,
      schoolIds: SCHOOL_IDS,
      targetVisits: TARGET_VISITS,
    },

    foundPlans: {
      count: targetPlans.length,
      plans: targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title || "",
        schoolId: plan.schoolId || "",
        schoolTitle: plan.schoolTitle || "",
        frameworkId: plan.frameworkId || "",
      })),
    },

    plannedChanges: {
      createNewCycles: newCycleWrites.length,
      createNewEvaluatorAssignments: newEvaluatorAssignmentWrites.length,
      updatePlans: planUpdateWrites.length,
      totalWrites: allWrites.length,
    },

    submissions: {
      touched: 0,
      existingMatchingSubmissionsCount: matchingSubmissions.length,
    },

    planReports,

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      targetAssignmentsTouched: 0,
      existingCyclesTouchedOnlyIfPlanUpdate: false,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      foundPlansCount: report.foundPlans.count,
      plannedChanges: report.plannedChanges,
      warningsCount: warnings.length,
      conflictsCount: conflicts.length,
      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log("Stopped. Fix conflicts before applying.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report carefully.");
    console.log("Run again with --apply to create visits 2 and 3.");
    return;
  }

  const committed = await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    createdNewCycles: newCycleWrites.length,
    createdNewEvaluatorAssignments: newEvaluatorAssignmentWrites.length,
    updatedPlans: planUpdateWrites.length,
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
  console.error("Expansion failed:", error);
  process.exit(1);
});