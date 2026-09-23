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
const SCHOOL_ID = "kg-02";
const YEAR_ID = "ay-1448";
const TERM_ID = "term-1";

const COORDINATOR_PERSON_ID = "p-t-altwala";

const OLD_VALUES_TEACHER_PERSON_ID = "p-r-albatel";
const NEW_VALUES_TEACHER_PERSON_ID = "p-alanoodf";

const TARGET_PLAN_MARKERS = [
  "values-coordinator-values-teacher-periodic-evaluation",
  "values-coordinator-values-teacher-weekly-evaluation",
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
  const id = text(plan.id);

  return (
    text(plan.schoolId) === SCHOOL_ID &&
    text(plan.academicYearId, YEAR_ID) === YEAR_ID &&
    text(plan.termId, TERM_ID) === TERM_ID &&
    TARGET_PLAN_MARKERS.some((marker) =>
      id.includes(marker),
    )
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
    `${timestamp}__${mode}__swap-kg02-values-coordinator-teacher.json`,
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

  if (targetPlans.length === 0) {
    conflicts.push({
      reason: "NO_TARGET_PLANS_FOUND",
      schoolId: SCHOOL_ID,
      markers: TARGET_PLAN_MARKERS,
    });
  }

  const targetPlanIds = new Set(
    targetPlans.map((plan) => text(plan.id)),
  );

  const matchingSubmissions = submissions.filter(
    (row) =>
      targetPlanIds.has(text(row.planId)) &&
      (
        text(row.targetPersonId) ===
          OLD_VALUES_TEACHER_PERSON_ID ||
        text(row.targetPersonId) ===
          NEW_VALUES_TEACHER_PERSON_ID
      ),
  );

  if (matchingSubmissions.length > 0) {
    conflicts.push({
      reason: "SUBMISSIONS_EXIST_FOR_OLD_OR_NEW_TARGET",
      count: matchingSubmissions.length,
      submissionIds: matchingSubmissions.map(
        (row) => row.id,
      ),
    });
  }

  const planReports = [];

  for (const plan of targetPlans) {
    const planId = text(plan.id);

    const planCycles = cycles
      .filter(
        (row) =>
          text(row.planId) === planId &&
          normalizeStatus(row.status) !== "REMOVED",
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

    const oldTargetAssignments =
      targetAssignments.filter(
        (row) =>
          text(row.planId) === planId &&
          text(row.targetPersonId) ===
            OLD_VALUES_TEACHER_PERSON_ID &&
          isActive(row),
      );

    if (oldTargetAssignments.length === 0) {
      conflicts.push({
        reason: "OLD_ACTIVE_TARGET_NOT_FOUND",
        planId,
        targetPersonId:
          OLD_VALUES_TEACHER_PERSON_ID,
      });

      continue;
    }

    const oldTargetPattern =
      oldTargetAssignments[0];

    const coordinatorPatterns =
      evaluatorAssignments.filter(
        (row) =>
          text(row.planId) === planId &&
          text(row.targetPersonId) ===
            OLD_VALUES_TEACHER_PERSON_ID &&
          text(row.evaluatorPersonId) ===
            COORDINATOR_PERSON_ID &&
          isActive(row),
      );

    if (coordinatorPatterns.length === 0) {
      conflicts.push({
        reason:
          "NO_ACTIVE_COORDINATOR_PATTERN_FOR_OLD_TEACHER",
        planId,
        evaluatorPersonId:
          COORDINATOR_PERSON_ID,
        targetPersonId:
          OLD_VALUES_TEACHER_PERSON_ID,
      });

      continue;
    }

    const coordinatorPattern =
      coordinatorPatterns[0];

    /*
     * نحاول أخذ بيانات العنود من أي assignment موجود سابقًا.
     */
    const newTeacherPattern =
      targetAssignments.find(
        (row) =>
          text(row.schoolId) === SCHOOL_ID &&
          text(row.targetPersonId) ===
            NEW_VALUES_TEACHER_PERSON_ID,
      ) ||
      evaluatorAssignments.find(
        (row) =>
          text(row.schoolId) === SCHOOL_ID &&
          text(row.targetPersonId) ===
            NEW_VALUES_TEACHER_PERSON_ID,
      );

    if (!newTeacherPattern) {
      conflicts.push({
        reason:
          "NEW_TEACHER_IDENTITY_PATTERN_NOT_FOUND",
        planId,
        targetPersonId:
          NEW_VALUES_TEACHER_PERSON_ID,
      });

      continue;
    }

    /*
     * إزالة رهام من Target Assignments.
     */
    for (const oldTarget of oldTargetAssignments) {
      writes.push({
        ref: oldTarget.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "VALUES_TEACHER_REPLACED_BY_ALANOOD",
          updatedAt: now,
        },
      });
    }

    /*
     * إزالة إسنادات رهام لدى منسقة القيم.
     */
    const oldEvaluatorAssignments =
      evaluatorAssignments.filter(
        (row) =>
          text(row.planId) === planId &&
          text(row.targetPersonId) ===
            OLD_VALUES_TEACHER_PERSON_ID &&
          text(row.evaluatorPersonId) ===
            COORDINATOR_PERSON_ID &&
          isActive(row),
      );

    for (const oldAssignment of oldEvaluatorAssignments) {
      writes.push({
        ref: oldAssignment.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "VALUES_TEACHER_REPLACED_BY_ALANOOD",
          updatedAt: now,
        },
      });
    }

    /*
     * إنشاء Target Assignment للعنود.
     */
    const newTargetId =
      targetAssignmentId(
        planId,
        NEW_VALUES_TEACHER_PERSON_ID,
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
          NEW_VALUES_TEACHER_PERSON_ID,

        targetUid:
          text(newTeacherPattern.targetUid),

        targetEmail:
          text(newTeacherPattern.targetEmail),

        targetDisplayName:
          text(newTeacherPattern.targetDisplayName),

        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة القيم",

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        seedTool:
          "swap-kg02-values-coordinator-teacher.cjs",
      },
    });

    /*
     * إنشاء evaluator assignment للعنود
     * في كل Cycle.
     */
    let createdEvaluatorAssignments = 0;

    for (const cycle of planCycles) {
      const cycleId = text(cycle.id);

      /*
       * نستخدم assignment الخاص برهام في نفس الدورة إن وجد.
       */
      const cyclePattern =
        oldEvaluatorAssignments.find(
          (row) =>
            text(row.cycleId) === cycleId,
        ) || coordinatorPattern;

      const assignmentId =
        evaluatorAssignmentId(
          planId,
          cycleId,
          NEW_VALUES_TEACHER_PERSON_ID,
          COORDINATOR_PERSON_ID,
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
            NEW_VALUES_TEACHER_PERSON_ID,

          targetUid:
            text(newTeacherPattern.targetUid),

          targetEmail:
            text(newTeacherPattern.targetEmail),

          targetDisplayName:
            text(
              newTeacherPattern.targetDisplayName,
            ),

          targetRoleKey:
            "KG_TEACHER",

          targetRoleLabel:
            "معلمة القيم",

          evaluatorPersonId:
            COORDINATOR_PERSON_ID,

          evaluatorUid:
            text(
              coordinatorPattern.evaluatorUid,
            ),

          evaluatorEmail:
            text(
              coordinatorPattern.evaluatorEmail,
            ),

          evaluatorDisplayName:
            text(
              coordinatorPattern.evaluatorDisplayName,
              "طيبة سليمان الطوالة",
            ),

          evaluatorRoleKey:
            text(
              coordinatorPattern.evaluatorRoleKey,
            ),

          evaluatorRoleLabel:
            text(
              coordinatorPattern.evaluatorRoleLabel,
              "منسقة القيم",
            ),

          weight: 100,
          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          seedTool:
            "swap-kg02-values-coordinator-teacher.cjs",
        },
      });

      createdEvaluatorAssignments += 1;
    }

    planReports.push({
      planId,
      planTitle: text(plan.title),
      frameworkId:
        text(plan.frameworkId),

      cycles:
        planCycles.length,

      oldTarget: {
        personId:
          OLD_VALUES_TEACHER_PERSON_ID,
        displayName:
          text(
            oldTargetPattern.targetDisplayName,
          ),
      },

      newTarget: {
        personId:
          NEW_VALUES_TEACHER_PERSON_ID,
        displayName:
          text(
            newTeacherPattern.targetDisplayName,
          ),
        email:
          text(
            newTeacherPattern.targetEmail,
          ),
      },

      evaluator: {
        personId:
          COORDINATOR_PERSON_ID,
        displayName:
          text(
            coordinatorPattern.evaluatorDisplayName,
            "طيبة سليمان الطوالة",
          ),
        email:
          text(
            coordinatorPattern.evaluatorEmail,
          ),
      },

      removeTargetAssignments:
        oldTargetAssignments.length,

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

    schoolId:
      SCHOOL_ID,

    coordinator: {
      personId:
        COORDINATOR_PERSON_ID,
      displayName:
        "طيبة سليمان الطوالة",
    },

    oldValuesTeacher: {
      personId:
        OLD_VALUES_TEACHER_PERSON_ID,
      displayName:
        "رهام سويد محمد الباتل",
    },

    newValuesTeacher: {
      personId:
        NEW_VALUES_TEACHER_PERSON_ID,
      displayName:
        "العنود دخيل عبدالله الفهيد",
    },

    matchingPlans:
      targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        frameworkId:
          plan.frameworkId,
      })),

    planReports,

    submissionsFound:
      matchingSubmissions.length,

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

      coordinator:
        report.coordinator,

      oldValuesTeacher:
        report.oldValuesTeacher,

      newValuesTeacher:
        report.newValuesTeacher,

      matchingPlans:
        report.matchingPlans,

      planReports:
        report.planReports,

      submissionsFound:
        report.submissionsFound,

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
    "Swap KG-02 values coordinator teacher failed:",
    error,
  );

  process.exit(1);
});