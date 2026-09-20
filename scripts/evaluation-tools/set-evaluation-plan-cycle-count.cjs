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
const PLAN_ID = getArg("planId").trim();
const COUNT = Number(getArg("count"));

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function requireArgs() {
  const missing = [];

  if (!PLAN_ID) {
    missing.push("--planId");
  }

  if (!Number.isInteger(COUNT) || COUNT < 1) {
    missing.push("--count must be an integer >= 1");
  }

  if (missing.length > 0) {
    console.error("Invalid or missing args:");
    console.error(missing.join("\n"));

    console.error("");
    console.error("Example:");
    console.error(
      'node .\\scripts\\evaluation-tools\\set-evaluation-plan-cycle-count.cjs --planId "PLAN_ID" --count 6',
    );

    process.exit(1);
  }
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "OPEN" || status === "ACTIVE" || !status;
}

function isRemovedCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "REMOVED" || status === "INACTIVE";
}

function isActiveAssignment(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
}

function isRemovedAssignment(row) {
  const status = normalizeStatus(row?.status);

  return status === "REMOVED" || status === "INACTIVE";
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
      "set-evaluation-plan-cycle-count",
      safeFileName(PLAN_ID),
      `count-${COUNT}`,
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return reportPath;
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

function cycleOrder(row) {
  return asNumber(
    row.visitNumber,
    asNumber(
      row.cycleNumber,
      asNumber(
        row.sequence,
        asNumber(row.order, 999999),
      ),
    ),
  );
}

function sortCycles(rows) {
  return [...rows].sort((a, b) => {
    const aOrder = cycleOrder(a);
    const bOrder = cycleOrder(b);

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return asString(a.id).localeCompare(asString(b.id));
  });
}

function visitTitle(number) {
  const known = {
    1: "الزيارة الأولى",
    2: "الزيارة الثانية",
    3: "الزيارة الثالثة",
    4: "الزيارة الرابعة",
    5: "الزيارة الخامسة",
    6: "الزيارة السادسة",
    7: "الزيارة السابعة",
    8: "الزيارة الثامنة",
    9: "الزيارة التاسعة",
    10: "الزيارة العاشرة",
    11: "الزيارة الحادية عشرة",
    12: "الزيارة الثانية عشرة",
    13: "الزيارة الثالثة عشرة",
    14: "الزيارة الرابعة عشرة",
    15: "الزيارة الخامسة عشرة",
    16: "الزيارة السادسة عشرة",
    17: "الزيارة السابعة عشرة",
    18: "الزيارة الثامنة عشرة",
    19: "الزيارة التاسعة عشرة",
    20: "الزيارة العشرون",
  };

  return known[number] || `الزيارة ${number}`;
}

function replaceCycleSuffix(id, number) {
  const padded = String(number).padStart(2, "0");

  const patterns = [
    /(?:visit|evaluation|cycle|period|week)-\d+$/i,
    /-\d+$/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(id)) {
      return id.replace(pattern, (match) => {
        const prefixMatch = match.match(
          /(visit|evaluation|cycle|period|week)-/i,
        );

        if (prefixMatch) {
          return `${prefixMatch[1]}-${padded}`;
        }

        return `-${padded}`;
      });
    }
  }

  return `${PLAN_ID}-evaluation-${padded}`;
}

function makeNewCycleId(patternCycleId, number) {
  if (patternCycleId) {
    return replaceCycleSuffix(patternCycleId, number);
  }

  return `${PLAN_ID}-evaluation-${String(number).padStart(2, "0")}`;
}

function cleanForCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.removedAt;
  delete cleaned.removedReason;
  delete cleaned.reactivatedAt;

  return cleaned;
}

function buildNewCycle(params) {
  const {
    pattern,
    number,
    cycleId,
    plan,
    now,
  } = params;

  const base = pattern ? cleanForCopy(pattern) : {};

  return {
    ...base,

    id: cycleId,
    orgId: ORG_ID,

    planId: PLAN_ID,
    planTitle: asString(plan.title),

    frameworkId: asString(plan.frameworkId),

    schoolId: asString(plan.schoolId),
    schoolTitle: asString(plan.schoolTitle),

    academicYearId: asString(plan.academicYearId),
    termId: asString(plan.termId),

    title: visitTitle(number),
    shortTitle: visitTitle(number),

    sequence: number,
    order: number,
    cycleNumber: number,
    visitNumber: number,

    status: "OPEN",

    createdAt: now,
    updatedAt: now,

    cycleCountTool:
      "set-evaluation-plan-cycle-count.cjs",
  };
}

function buildEvaluatorAssignmentIdFromPattern(
  patternAssignment,
  oldCycleId,
  newCycleId,
) {
  const oldId = asString(patternAssignment.id);

  if (
    oldId &&
    oldCycleId &&
    oldId.includes(oldCycleId)
  ) {
    return oldId
      .split(oldCycleId)
      .join(newCycleId);
  }

  return [
    PLAN_ID,
    newCycleId,
    asString(patternAssignment.targetPersonId),
    asString(patternAssignment.evaluatorPersonId),
  ].join("-");
}

function buildNewEvaluatorAssignment(params) {
  const {
    pattern,
    newAssignmentId,
    newCycle,
    now,
  } = params;

  const base = cleanForCopy(pattern);

  return {
    ...base,

    id: newAssignmentId,
    orgId: ORG_ID,

    planId: PLAN_ID,
    cycleId: newCycle.id,
    cycleTitle:
      asString(newCycle.title) ||
      asString(newCycle.shortTitle),

    status: "ACTIVE",

    createdAt: now,
    updatedAt: now,

    cycleCountTool:
      "set-evaluation-plan-cycle-count.cjs",
  };
}

async function commitInChunks(writes, chunkSize = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + chunkSize);

    for (const write of chunk) {
      batch.set(
        write.ref,
        write.data,
        { merge: true },
      );
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
  const now = Date.now();

  const [
    planSnap,
    cycles,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    orgRef.collection("evaluationPlans").doc(PLAN_ID).get(),
    getCollectionRows(orgRef, "evaluationCycles"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const conflicts = [];
  const warnings = [];

  if (!planSnap.exists) {
    conflicts.push({
      reason: "PLAN_NOT_FOUND",
      planId: PLAN_ID,
    });
  }

  const plan = planSnap.exists
    ? {
        id: planSnap.id,
        ref: planSnap.ref,
        ...planSnap.data(),
      }
    : null;

  if (!plan) {
    const report = {
      decision: "STOPPED",
      conflicts,
    };

    const reportPath = writeJsonReport(report);

    console.dir({
      decision: "STOPPED",
      reportPath,
      conflicts,
    });

    process.exit(1);
  }

  const planCycles = sortCycles(
    cycles.filter(
      (cycle) =>
        asString(cycle.planId) === PLAN_ID,
    ),
  );

  const activeCycles = planCycles.filter(isUsableCycle);
  const removedCycles = planCycles.filter(isRemovedCycle);

  const currentConfiguredCount =
    asNumber(
      plan.cycleCount,
      asNumber(plan.maxCyclesPerTerm, activeCycles.length),
    );

  /*
   * نرتب كل Cycle حسب رقمها الحقيقي.
   */
  const cyclesByNumber = new Map();

  for (const cycle of planCycles) {
    const number = cycleOrder(cycle);

    if (
      Number.isFinite(number) &&
      number > 0 &&
      number < 999999
    ) {
      cyclesByNumber.set(number, cycle);
    }
  }

  /*
   * Pattern لإنشاء Cycle جديدة:
   * نستخدم آخر Cycle موجودة في نفس الخطة.
   */
  const patternCycle =
    activeCycles[activeCycles.length - 1] ||
    removedCycles[removedCycles.length - 1] ||
    planCycles[planCycles.length - 1] ||
    null;

  if (!patternCycle && COUNT > 0) {
    conflicts.push({
      reason: "NO_EXISTING_CYCLE_PATTERN",
      planId: PLAN_ID,
      note:
        "هذه الخطة لا تحتوي أي Cycle يمكن استخدامها كـ pattern.",
    });
  }

  const assignmentsForPlan = evaluatorAssignments.filter(
    (row) => asString(row.planId) === PLAN_ID,
  );

  const submissionsForPlan = submissions.filter(
    (row) => asString(row.planId) === PLAN_ID,
  );

  const cycleWrites = [];
  const assignmentWrites = [];
  const createdCycles = [];
  const reactivatedCycles = [];
  const deactivatedCycles = [];

  /*
   * المطلوب من 1 إلى COUNT يجب أن يكون نشطًا.
   */
  for (let number = 1; number <= COUNT; number += 1) {
    const existing = cyclesByNumber.get(number);

    /*
     * Cycle موجودة ومفعلة بالفعل.
     */
    if (existing && isUsableCycle(existing)) {
      continue;
    }

    /*
     * Cycle موجودة لكن REMOVED / INACTIVE:
     * نعيد تفعيلها بدل إنشاء واحدة جديدة.
     */
    if (existing && isRemovedCycle(existing)) {
      cycleWrites.push({
        ref: existing.ref,
        data: {
          status: "OPEN",

          sequence: number,
          order: number,
          cycleNumber: number,
          visitNumber: number,

          title:
            asString(existing.title) ||
            visitTitle(number),

          shortTitle:
            asString(existing.shortTitle) ||
            visitTitle(number),

          reactivatedAt: now,
          updatedAt: now,

          cycleCountTool:
            "set-evaluation-plan-cycle-count.cjs",
        },
      });

      reactivatedCycles.push({
        id: existing.id,
        number,
      });

      const removedAssignments =
        assignmentsForPlan.filter(
          (assignment) =>
            asString(assignment.cycleId) ===
              asString(existing.id) &&
            isRemovedAssignment(assignment),
        );

      for (const assignment of removedAssignments) {
        assignmentWrites.push({
          ref: assignment.ref,
          data: {
            status: "ACTIVE",
            reactivatedAt: now,
            updatedAt: now,

            cycleCountTool:
              "set-evaluation-plan-cycle-count.cjs",
          },
        });
      }

      continue;
    }

    /*
     * Cycle غير موجودة إطلاقًا:
     * ننشئها من pattern.
     */
    const cycleId = makeNewCycleId(
      asString(patternCycle?.id),
      number,
    );

    const newCycle = buildNewCycle({
      pattern: patternCycle,
      number,
      cycleId,
      plan,
      now,
    });

    cycleWrites.push({
      ref: orgRef
        .collection("evaluationCycles")
        .doc(cycleId),
      data: newCycle,
    });

    createdCycles.push({
      id: cycleId,
      number,
    });

    /*
     * نأخذ evaluator assignments من pattern cycle.
     */
    const patternAssignments =
      assignmentsForPlan.filter(
        (assignment) =>
          asString(assignment.cycleId) ===
            asString(patternCycle.id) &&
          isActiveAssignment(assignment),
      );

    if (patternAssignments.length === 0) {
      conflicts.push({
        reason:
          "NO_ACTIVE_EVALUATOR_ASSIGNMENT_PATTERN_FOR_NEW_CYCLE",
        patternCycleId: asString(patternCycle.id),
        newCycleId: cycleId,
      });

      continue;
    }

    for (const patternAssignment of patternAssignments) {
      const newAssignmentId =
        buildEvaluatorAssignmentIdFromPattern(
          patternAssignment,
          asString(patternCycle.id),
          cycleId,
        );

      assignmentWrites.push({
        ref: orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(newAssignmentId),

        data: buildNewEvaluatorAssignment({
          pattern: patternAssignment,
          newAssignmentId,
          newCycle,
          now,
        }),
      });
    }
  }

  /*
   * أي Cycle رقمها أكبر من COUNT:
   * نحولها REMOVED بدل حذفها.
   */
  for (const cycle of planCycles) {
    const number = cycleOrder(cycle);

    if (
      !Number.isFinite(number) ||
      number <= COUNT ||
      number >= 999999
    ) {
      continue;
    }

    if (!isUsableCycle(cycle)) {
      continue;
    }

    const cycleSubmissions =
      submissionsForPlan.filter(
        (submission) =>
          asString(submission.cycleId) ===
          asString(cycle.id),
      );

    if (cycleSubmissions.length > 0) {
      warnings.push({
        reason:
          "DEACTIVATING_CYCLE_WITH_EXISTING_SUBMISSIONS",
        cycleId: cycle.id,
        cycleNumber: number,
        submissionsCount: cycleSubmissions.length,
        note:
          "لن يتم حذف submissions. سيتم فقط تعطيل الـ Cycle والإسنادات النشطة.",
      });
    }

    cycleWrites.push({
      ref: cycle.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason:
          "CYCLE_COUNT_REDUCED",
        updatedAt: now,

        cycleCountTool:
          "set-evaluation-plan-cycle-count.cjs",
      },
    });

    deactivatedCycles.push({
      id: cycle.id,
      number,
      submissionsCount: cycleSubmissions.length,
    });

    const activeAssignments =
      assignmentsForPlan.filter(
        (assignment) =>
          asString(assignment.cycleId) ===
            asString(cycle.id) &&
          isActiveAssignment(assignment),
      );

    for (const assignment of activeAssignments) {
      assignmentWrites.push({
        ref: assignment.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "CYCLE_COUNT_REDUCED",
          updatedAt: now,

          cycleCountTool:
            "set-evaluation-plan-cycle-count.cjs",
        },
      });
    }
  }

  /*
   * تحديث Plan نفسها.
   */
  const planWrite = {
    ref: plan.ref,
    data: {
      cycleCount: COUNT,
      maxCyclesPerTerm: COUNT,
      updatedAt: now,

      cycleCountTool:
        "set-evaluation-plan-cycle-count.cjs",
    },
  };

  const allWrites = [
    planWrite,
    ...cycleWrites,
    ...assignmentWrites,
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
      planId: PLAN_ID,
      requestedCycleCount: COUNT,
    },

    plan: {
      id: PLAN_ID,
      title: asString(plan.title),
      schoolId: asString(plan.schoolId),
      academicYearId: asString(plan.academicYearId),
      termId: asString(plan.termId),
      frameworkId: asString(plan.frameworkId),

      currentCycleCount:
        currentConfiguredCount,

      requestedCycleCount: COUNT,
    },

    currentState: {
      totalCycles: planCycles.length,
      activeCycles: activeCycles.length,
      removedCycles: removedCycles.length,
      evaluatorAssignments:
        assignmentsForPlan.length,
      submissions:
        submissionsForPlan.length,
    },

    plannedChanges: {
      updatePlan: 1,

      createCycles:
        createdCycles.length,

      reactivateCycles:
        reactivatedCycles.length,

      deactivateCycles:
        deactivatedCycles.length,

      evaluatorAssignmentWrites:
        assignmentWrites.length,

      submissionsTouched: 0,

      totalWrites:
        allWrites.length,
    },

    createdCycles,
    reactivatedCycles,
    deactivatedCycles,

    warnings,
    conflicts,

    safety: {
      firestoreDeletes: 0,
      submissionsTouched: 0,
      frameworksTouched: 0,
      targetAssignmentsTouched: 0,
      evaluatorAssignmentsMayBeCreatedReactivatedOrRemoved: true,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,

      plan: report.plan,

      currentState:
        report.currentState,

      plannedChanges:
        report.plannedChanges,

      warningsCount:
        warnings.length,

      conflictsCount:
        conflicts.length,

      warnings,
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
      "Run again with --apply to change the cycle count.",
    );
    return;
  }

  const committed =
    await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",

    committedWrites:
      committed,

    planUpdated: 1,

    cyclesCreated:
      createdCycles.length,

    cyclesReactivated:
      reactivatedCycles.length,

    cyclesDeactivated:
      deactivatedCycles.length,

    evaluatorAssignmentWrites:
      assignmentWrites.length,

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
    "Set evaluation plan cycle count failed:",
    error,
  );

  process.exit(1);
});