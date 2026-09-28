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

const ORG_ID = "takween";
const SCHOOL_ID = "kg-04";
const YEAR_ID = "ay-1448";
const TERM_ID = "term-1";

const VP_PERSON_ID = "p-h-alshaya";

const OLD_TARGET_PERSON_ID = "p-s-bader";
const NEW_TARGET_PERSON_ID = "p-r-a-atyar";

const TARGET_PLAN_MARKERS = [
  "corners",
];

const REPORTS_DIR = path.resolve(
  "scripts/evaluation-tools/reports",
);

function text(value, fallback = "") {
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

function clean(row) {
  const copy = { ...row };

  delete copy.id;
  delete copy.ref;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.removedAt;
  delete copy.removedReason;

  return copy;
}

async function rows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

function matchesTargetPlan(plan) {
  const id = text(plan.id).toLowerCase();

  if (text(plan.schoolId) !== SCHOOL_ID) {
    return false;
  }

  if (
    text(plan.academicYearId, YEAR_ID) !== YEAR_ID ||
    text(plan.termId, TERM_ID) !== TERM_ID
  ) {
    return false;
  }

  return (
    id ===
      "kg-04-ay-1448-term-1-vice-principal-corners-teacher-diagnostic-evaluation" ||
    id ===
      "kg-04-ay-1448-term-1-vice-principal-corners-teacher-weekly-evaluation"
  );
}

function targetAssignmentId(planId, personId) {
  return `${planId}-target-${personId}`;
}

function evaluatorAssignmentId(
  planId,
  cycleId,
  targetPersonId,
  evaluatorPersonId,
) {
  return `${planId}-${cycleId}-${targetPersonId}-${evaluatorPersonId}`;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const mode = APPLY ? "apply" : "preview";

  const file = path.join(
    REPORTS_DIR,
    `${timestamp}__${mode}__swap-kg04-vp-corners-teacher.json`,
  );

  fs.writeFileSync(
    file,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return file;
}

async function commitInChunks(writes, size = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += size) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + size);

    for (const write of chunk) {
      batch.set(write.ref, write.data, { merge: true });
    }

    await batch.commit();
    committed += chunk.length;
  }

  return committed;
}

async function main() {
  console.log(
    APPLY
      ? "APPLY mode"
      : "Preview mode - no writes",
  );

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [
    plans,
    cycles,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    rows(orgRef, "evaluationPlans"),
    rows(orgRef, "evaluationCycles"),
    rows(orgRef, "evaluationTargetAssignments"),
    rows(orgRef, "evaluationEvaluatorAssignments"),
    rows(orgRef, "evaluationSubmissions"),
  ]);

  const conflicts = [];
  const warnings = [];
  const writes = [];

  const targetPlans = plans.filter(matchesTargetPlan);

  if (targetPlans.length !== 2) {
    conflicts.push({
      reason: "EXPECTED_EXACTLY_TWO_CORNERS_PLANS",
      found: targetPlans.length,
      plans: targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        frameworkId: plan.frameworkId,
      })),
    });
  }

  const targetPlanIds = new Set(
    targetPlans.map((plan) => text(plan.id)),
  );

  /*
   * لا نحذف أي submissions تاريخية.
   */
  const oldTargetSubmissions = submissions.filter(
    (row) =>
      targetPlanIds.has(text(row.planId)) &&
      text(row.targetPersonId) ===
        OLD_TARGET_PERSON_ID,
  );

  const newTargetSubmissions = submissions.filter(
    (row) =>
      targetPlanIds.has(text(row.planId)) &&
      text(row.targetPersonId) ===
        NEW_TARGET_PERSON_ID,
  );

  if (oldTargetSubmissions.length > 0) {
    warnings.push({
      reason: "OLD_TARGET_HAS_HISTORICAL_SUBMISSIONS",
      count: oldTargetSubmissions.length,
      action: "PRESERVE_SUBMISSIONS",
    });
  }

  if (newTargetSubmissions.length > 0) {
    warnings.push({
      reason: "NEW_TARGET_ALREADY_HAS_SUBMISSIONS",
      count: newTargetSubmissions.length,
      action: "PRESERVE_SUBMISSIONS",
    });
  }

  const planReports = [];

  for (const plan of targetPlans) {
    const planId = text(plan.id);

    const planCycles = cycles
      .filter(
        (row) =>
          text(row.planId) === planId &&
          normalizeStatus(row.status) !== "CANCELLED",
      )
      .sort((a, b) => {
        const aOrder =
          Number(a.sequence ?? a.order ?? a.cycleNumber ?? 0);

        const bOrder =
          Number(b.sequence ?? b.order ?? b.cycleNumber ?? 0);

        return aOrder - bOrder;
      });

    if (planCycles.length === 0) {
      conflicts.push({
        reason: "NO_CYCLES_FOR_PLAN",
        planId,
      });

      continue;
    }

    const oldTargets = targetAssignments.filter(
      (row) =>
        text(row.planId) === planId &&
        text(row.targetPersonId) ===
          OLD_TARGET_PERSON_ID &&
        isActive(row),
    );

    if (oldTargets.length === 0) {
      conflicts.push({
        reason: "OLD_ACTIVE_TARGET_NOT_FOUND",
        planId,
        targetPersonId:
          OLD_TARGET_PERSON_ID,
      });

      continue;
    }

    const oldTargetPattern = oldTargets[0];

    const oldEvaluatorAssignments =
      evaluatorAssignments.filter(
        (row) =>
          text(row.planId) === planId &&
          text(row.targetPersonId) ===
            OLD_TARGET_PERSON_ID &&
          text(row.evaluatorPersonId) ===
            VP_PERSON_ID &&
          isActive(row),
      );

    if (oldEvaluatorAssignments.length === 0) {
      conflicts.push({
        reason:
          "NO_ACTIVE_VP_ASSIGNMENT_FOR_OLD_TARGET",
        planId,
        evaluatorPersonId: VP_PERSON_ID,
        targetPersonId: OLD_TARGET_PERSON_ID,
      });

      continue;
    }

    /*
     * بيانات رهام الطيار من أي assignment موجود لها في kg-04.
     */
    const newTargetPattern =
      targetAssignments.find(
        (row) =>
          text(row.schoolId) === SCHOOL_ID &&
          text(row.targetPersonId) ===
            NEW_TARGET_PERSON_ID,
      ) ||
      evaluatorAssignments.find(
        (row) =>
          text(row.schoolId) === SCHOOL_ID &&
          text(row.targetPersonId) ===
            NEW_TARGET_PERSON_ID,
      );

    if (!newTargetPattern) {
      conflicts.push({
        reason:
          "NEW_TARGET_IDENTITY_PATTERN_NOT_FOUND",
        planId,
        targetPersonId:
          NEW_TARGET_PERSON_ID,
      });

      continue;
    }

    const vpPattern =
      oldEvaluatorAssignments[0];

    /*
     * إزالة سارة البدر من target assignment.
     */
    for (const oldTarget of oldTargets) {
      writes.push({
        ref: oldTarget.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "CORNERS_TEACHER_REPLACED_BY_RAHAM_ALTAYAR",
          updatedAt: now,
        },
      });
    }

    /*
     * إزالة إسنادات سارة البدر لدى الوكيلة.
     */
    for (const oldAssignment of oldEvaluatorAssignments) {
      writes.push({
        ref: oldAssignment.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "CORNERS_TEACHER_REPLACED_BY_RAHAM_ALTAYAR",
          updatedAt: now,
        },
      });
    }

    /*
     * Target assignment جديد لرهام الطيار.
     */
    const newTargetId =
      targetAssignmentId(
        planId,
        NEW_TARGET_PERSON_ID,
      );

    writes.push({
      ref: orgRef
        .collection("evaluationTargetAssignments")
        .doc(newTargetId),

      data: {
        ...clean(oldTargetPattern),

        id: newTargetId,

        orgId: ORG_ID,
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,

        planId,
        planTitle: text(plan.title),

        frameworkId:
          text(plan.frameworkId),

        targetKind: "TEACHER",

        targetPersonId:
          NEW_TARGET_PERSON_ID,

        targetUid:
          text(newTargetPattern.targetUid),

        targetEmail:
          text(newTargetPattern.targetEmail),

        targetDisplayName:
          text(newTargetPattern.targetDisplayName),

        targetRoleKey:
          text(
            newTargetPattern.targetRoleKey,
            "KG_TEACHER",
          ),

        targetRoleLabel:
          "معلمة الأركان",

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        seedTool:
          "swap-kg04-vp-corners-teacher.cjs",
      },
    });

    /*
     * إنشاء evaluator assignment لرهام في كل cycle.
     */
    let createdEvaluatorAssignments = 0;

    for (const cycle of planCycles) {
      const cycleId = text(cycle.id);

      const cyclePattern =
        oldEvaluatorAssignments.find(
          (row) =>
            text(row.cycleId) === cycleId,
        ) || vpPattern;

      const assignmentId =
        evaluatorAssignmentId(
          planId,
          cycleId,
          NEW_TARGET_PERSON_ID,
          VP_PERSON_ID,
        );

      writes.push({
        ref: orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(assignmentId),

        data: {
          ...clean(cyclePattern),

          id: assignmentId,

          orgId: ORG_ID,
          schoolId: SCHOOL_ID,
          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          planTitle: text(plan.title),

          frameworkId:
            text(plan.frameworkId),

          cycleId,
          cycleTitle:
            text(cycle.title),

          targetAssignmentId:
            newTargetId,

          targetKind: "TEACHER",

          targetPersonId:
            NEW_TARGET_PERSON_ID,

          targetUid:
            text(newTargetPattern.targetUid),

          targetEmail:
            text(newTargetPattern.targetEmail),

          targetDisplayName:
            text(newTargetPattern.targetDisplayName),

          targetRoleKey:
            text(
              newTargetPattern.targetRoleKey,
              "KG_TEACHER",
            ),

          targetRoleLabel:
            "معلمة الأركان",

          evaluatorPersonId:
            VP_PERSON_ID,

          evaluatorUid:
            text(vpPattern.evaluatorUid),

          evaluatorEmail:
            text(vpPattern.evaluatorEmail),

          evaluatorDisplayName:
            text(vpPattern.evaluatorDisplayName),

          evaluatorRoleKey:
            text(
              vpPattern.evaluatorRoleKey,
              "KG_VP",
            ),

          evaluatorRoleLabel:
            text(
              vpPattern.evaluatorRoleLabel,
              "وكيلة الروضة",
            ),

          weight: 100,
          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          seedTool:
            "swap-kg04-vp-corners-teacher.cjs",
        },
      });

      createdEvaluatorAssignments += 1;
    }

    planReports.push({
      planId,
      planTitle: text(plan.title),
      frameworkId: text(plan.frameworkId),

      cycles: planCycles.length,

      oldTarget: {
        personId: OLD_TARGET_PERSON_ID,
        displayName:
          text(oldTargetPattern.targetDisplayName),
      },

      newTarget: {
        personId: NEW_TARGET_PERSON_ID,
        displayName:
          text(newTargetPattern.targetDisplayName),
        email:
          text(newTargetPattern.targetEmail),
      },

      evaluator: {
        personId: VP_PERSON_ID,
        displayName:
          text(vpPattern.evaluatorDisplayName),
        email:
          text(vpPattern.evaluatorEmail),
      },

      removeTargetAssignments:
        oldTargets.length,

      removeEvaluatorAssignments:
        oldEvaluatorAssignments.length,

      createTargetAssignments: 1,

      createEvaluatorAssignments:
        createdEvaluatorAssignments,
    });
  }

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode:
      APPLY
        ? "APPLY"
        : "PREVIEW",

    schoolId: SCHOOL_ID,

    evaluator: {
      personId: VP_PERSON_ID,
    },

    oldTarget: {
      personId: OLD_TARGET_PERSON_ID,
    },

    newTarget: {
      personId: NEW_TARGET_PERSON_ID,
    },

    matchingPlans:
      targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        frameworkId: plan.frameworkId,
      })),

    planReports,

    historicalSubmissions: {
      oldTarget:
        oldTargetSubmissions.length,

      newTarget:
        newTargetSubmissions.length,

      touched: 0,
    },

    plannedChanges: {
      totalWrites:
        writes.length,

      submissionsTouched: 0,
    },

    warningsCount:
      warnings.length,

    conflictsCount:
      conflicts.length,

    warnings,
    conflicts,
  };

  const reportPath =
    writeReport(report);

  console.dir(
    {
      decision:
        report.decision,

      mode:
        report.mode,

      reportPath,

      schoolId:
        report.schoolId,

      evaluator:
        report.evaluator,

      oldTarget:
        report.oldTarget,

      newTarget:
        report.newTarget,

      matchingPlans:
        report.matchingPlans,

      planReports:
        report.planReports,

      historicalSubmissions:
        report.historicalSubmissions,

      plannedChanges:
        report.plannedChanges,

      warningsCount:
        report.warningsCount,

      conflictsCount:
        report.conflictsCount,

      warnings:
        report.warnings,

      conflicts:
        report.conflicts,
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
    console.log(
      "Preview mode - no writes performed.",
    );

    return;
  }

  const committedWrites =
    await commitInChunks(writes);

  console.log("");

  console.dir({
    decision: "APPLIED",
    committedWrites,
    submissionsTouched: 0,
  });
}

main().catch((error) => {
  console.error(
    "Swap KG-04 VP corners teacher failed:",
    error,
  );

  process.exit(1);
});