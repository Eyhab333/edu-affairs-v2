const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(
  path.resolve("service-account.json"),
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const YEAR_ID = "ay-1448";
const TERM_ID = "term-1";

const SOURCE_SCHOOL_ID = "kg-02";
const TARGET_SCHOOL_ID = "kg-04";

const SUPERVISOR_PERSON_ID = "p-f-alhamaad";
const TARGET_TEACHER_PERSON_ID = "p-r-a-atyar";

const SOURCE_PLAN_ID =
  "kg-02-ay-1448-term-1-educational-supervisor-corners-teacher-periodic-evaluation";

const TARGET_PLAN_ID =
  "kg-04-ay-1448-term-1-educational-supervisor-corners-teacher-periodic-evaluation";

const REPORTS_DIR = path.resolve(
  "scripts/evaluation-tools/reports",
);

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isActive(row) {
  const status = normalizeStatus(row?.status);

  if (status === "ACTIVE") return true;

  if (!status && row?.isActive === true) {
    return true;
  }

  return false;
}

function asNumber(value, fallback = 9999) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function sortCycles(rows) {
  return [...rows].sort((a, b) => {
    const aOrder = asNumber(
      a.sequence,
      asNumber(
        a.cycleNumber,
        asNumber(a.order),
      ),
    );

    const bOrder = asNumber(
      b.sequence,
      asNumber(
        b.cycleNumber,
        asNumber(b.order),
      ),
    );

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return asString(a.id).localeCompare(
      asString(b.id),
    );
  });
}

async function getRows(
  orgRef,
  collectionName,
) {
  const snap = await orgRef
    .collection(collectionName)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

/*
 * هذه الحقول ممنوع تمامًا نسخها من الروضة الثانية.
 *
 * نريد فقط إعدادات النموذج / rubric / presentation
 * الموجودة في الـ source assignment.
 */
const PROTECTED_FIELDS = new Set([
  "id",
  "ref",

  "orgId",

  "schoolId",
  "schoolTitle",

  "academicYearId",
  "termId",

  "planId",
  "planTitle",

  "frameworkId",

  "cycleId",
  "cycleTitle",

  "targetAssignmentId",

  "targetKind",
  "targetPersonId",
  "targetUid",
  "targetEmail",
  "targetDisplayName",
  "targetName",
  "targetRoleKey",
  "targetRoleLabel",

  "teacherEmail",
  "teacherName",
  "teacherDisplayName",

  "evaluatorUid",
  "evaluatorPersonId",
  "evaluatorEmail",
  "evaluatorDisplayName",
  "evaluatorRoleKey",
  "evaluatorRoleLabel",

  "weight",
  "status",

  "createdAt",
  "updatedAt",

  "removedAt",
  "removedReason",

  "transferredAt",
  "transferTool",

  "seedTool",

  "createdBySupervisorAddTool",

  "weightRebalancedAt",
  "weightRebalanceTool",
]);

/*
 * أي حقول تخص حالة submission أو نتائج فعلية
 * لا نريد نسخها حتى لو كانت موجودة بالخطأ في assignment.
 */
function isResultOrSubmissionField(key) {
  const normalized = key.toLowerCase();

  return (
    normalized.includes("submission") ||
    normalized.includes("approvedat") ||
    normalized.includes("approvedby") ||
    normalized.includes("submittedat") ||
    normalized.includes("submittedby") ||
    normalized.includes("score") ||
    normalized.includes("result")
  );
}

/*
 * نأخذ فقط الحقول الإضافية من الـ source pattern.
 *
 * بهذا ننقل أي:
 * - rubric snapshot
 * - rubric version
 * - sections config
 * - items config
 * - template config
 * - display configuration
 *
 * بدون تخمين أسماء الحقول الموجودة حاليًا.
 */
function extractRubricConfig(source) {
  const config = {};

  for (const [key, value] of Object.entries(
    source,
  )) {
    if (PROTECTED_FIELDS.has(key)) {
      continue;
    }

    if (isResultOrSubmissionField(key)) {
      continue;
    }

    config[key] = value;
  }

  return config;
}

function diffFields(before, patch) {
  const changed = [];

  for (const [key, nextValue] of Object.entries(
    patch,
  )) {
    const oldValue = before[key];

    if (
      JSON.stringify(oldValue) !==
      JSON.stringify(nextValue)
    ) {
      changed.push({
        field: key,
        before: oldValue,
        after: nextValue,
      });
    }
  }

  return changed;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, {
    recursive: true,
  });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const mode = APPLY
    ? "apply"
    : "preview";

  const reportPath = path.join(
    REPORTS_DIR,
    `${timestamp}__${mode}__repair-kg04-corners-teacher-rubric-from-kg02.json`,
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return reportPath;
}

async function commitInChunks(
  writes,
  chunkSize = 450,
) {
  let committed = 0;

  for (
    let i = 0;
    i < writes.length;
    i += chunkSize
  ) {
    const batch = db.batch();

    const chunk = writes.slice(
      i,
      i + chunkSize,
    );

    for (const write of chunk) {
      batch.set(
        write.ref,
        write.data,
        {
          merge: true,
        },
      );
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

  const orgRef = db
    .collection("orgs")
    .doc(ORG_ID);

  const now = Date.now();

  const [
    plans,
    cycles,
    evaluatorAssignments,
    targetAssignments,
    submissions,
  ] = await Promise.all([
    getRows(
      orgRef,
      "evaluationPlans",
    ),

    getRows(
      orgRef,
      "evaluationCycles",
    ),

    getRows(
      orgRef,
      "evaluationEvaluatorAssignments",
    ),

    getRows(
      orgRef,
      "evaluationTargetAssignments",
    ),

    getRows(
      orgRef,
      "evaluationSubmissions",
    ),
  ]);

  const conflicts = [];
  const warnings = [];
  const writes = [];
  const changes = [];

  /*
   * =========================================================
   * Plans
   * =========================================================
   */

  const sourcePlan = plans.find(
    (row) =>
      asString(row.id) ===
      SOURCE_PLAN_ID,
  );

  const targetPlan = plans.find(
    (row) =>
      asString(row.id) ===
      TARGET_PLAN_ID,
  );

  if (!sourcePlan) {
    conflicts.push({
      reason:
        "SOURCE_PLAN_NOT_FOUND",

      planId:
        SOURCE_PLAN_ID,
    });
  }

  if (!targetPlan) {
    conflicts.push({
      reason:
        "TARGET_PLAN_NOT_FOUND",

      planId:
        TARGET_PLAN_ID,
    });
  }

  if (
    sourcePlan &&
    asString(
      sourcePlan.schoolId,
    ) !== SOURCE_SCHOOL_ID
  ) {
    conflicts.push({
      reason:
        "SOURCE_PLAN_SCHOOL_MISMATCH",

      expectedSchoolId:
        SOURCE_SCHOOL_ID,

      actualSchoolId:
        asString(
          sourcePlan.schoolId,
        ),
    });
  }

  if (
    targetPlan &&
    asString(
      targetPlan.schoolId,
    ) !== TARGET_SCHOOL_ID
  ) {
    conflicts.push({
      reason:
        "TARGET_PLAN_SCHOOL_MISMATCH",

      expectedSchoolId:
        TARGET_SCHOOL_ID,

      actualSchoolId:
        asString(
          targetPlan.schoolId,
        ),
    });
  }

  /*
   * مهم:
   * الخطة نفسها في kg-04 يجب أن تكون framework معلمة الأركان.
   */
  if (
    sourcePlan &&
    targetPlan &&
    asString(
      sourcePlan.frameworkId,
    ) !==
      asString(
        targetPlan.frameworkId,
      )
  ) {
    warnings.push({
      reason:
        "SOURCE_AND_TARGET_FRAMEWORK_IDS_DIFFER",

      sourceFrameworkId:
        asString(
          sourcePlan.frameworkId,
        ),

      targetFrameworkId:
        asString(
          targetPlan.frameworkId,
        ),

      note:
        "لن يتم استبدال frameworkId الخاص بخطة kg-04. سيتم فقط إصلاح بيانات الـ assignment.",
    });
  }

  /*
   * =========================================================
   * Cycles
   * =========================================================
   */

  const sourceCycles = sortCycles(
    cycles.filter(
      (row) =>
        asString(row.planId) ===
        SOURCE_PLAN_ID,
    ),
  );

  const targetCycles = sortCycles(
    cycles.filter(
      (row) =>
        asString(row.planId) ===
        TARGET_PLAN_ID,
    ),
  );

  if (
    sourceCycles.length === 0
  ) {
    conflicts.push({
      reason:
        "SOURCE_PLAN_HAS_NO_CYCLES",
    });
  }

  if (
    targetCycles.length === 0
  ) {
    conflicts.push({
      reason:
        "TARGET_PLAN_HAS_NO_CYCLES",
    });
  }

  if (
    sourceCycles.length !==
    targetCycles.length
  ) {
    conflicts.push({
      reason:
        "SOURCE_TARGET_CYCLE_COUNT_MISMATCH",

      sourceCycles:
        sourceCycles.length,

      targetCycles:
        targetCycles.length,

      note:
        "الإصلاح يتطلب نفس عدد الدورات حتى نربط التقييم الأول بالأول والثاني بالثاني بشكل آمن.",
    });
  }

  /*
   * =========================================================
   * Find source evaluator patterns
   * =========================================================
   *
   * نبحث في kg-02 عن تقييم معلمة أركان فعلي
   * بواسطة نفس المشرفة فاطمة.
   */

  const sourcePatterns =
    sourceCycles.map(
      (cycle) => {
        const patterns =
          evaluatorAssignments.filter(
            (row) =>
              asString(
                row.planId,
              ) ===
                SOURCE_PLAN_ID &&
              asString(
                row.cycleId,
              ) ===
                asString(
                  cycle.id,
                ) &&
              asString(
                row.evaluatorPersonId,
              ) ===
                SUPERVISOR_PERSON_ID &&
              isActive(
                row,
              ),
          );

        if (
          patterns.length === 0
        ) {
          return null;
        }

        /*
         * أي target نشط داخل خطة معلمة الأركان في kg-02
         * صالح كـ source pattern.
         */
        return patterns[0];
      },
    );

  sourcePatterns.forEach(
    (pattern, index) => {
      if (!pattern) {
        conflicts.push({
          reason:
            "SOURCE_PATTERN_NOT_FOUND_FOR_CYCLE",

          cycleId:
            asString(
              sourceCycles[index]?.id,
            ),

          evaluatorPersonId:
            SUPERVISOR_PERSON_ID,
        });
      }
    },
  );

  /*
   * =========================================================
   * Find target assignments for Raham
   * =========================================================
   */

  const targetTargetAssignment =
    targetAssignments.find(
      (row) =>
        asString(
          row.planId,
        ) ===
          TARGET_PLAN_ID &&
        asString(
          row.targetPersonId,
        ) ===
          TARGET_TEACHER_PERSON_ID &&
        isActive(
          row,
        ),
    );

  if (!targetTargetAssignment) {
    conflicts.push({
      reason:
        "RAHAM_TARGET_ASSIGNMENT_NOT_FOUND",

      planId:
        TARGET_PLAN_ID,

      targetPersonId:
        TARGET_TEACHER_PERSON_ID,
    });
  }

  const targetEvaluatorAssignments =
    targetCycles.map(
      (cycle) =>
        evaluatorAssignments.find(
          (row) =>
            asString(
              row.planId,
            ) ===
              TARGET_PLAN_ID &&
            asString(
              row.cycleId,
            ) ===
              asString(
                cycle.id,
              ) &&
            asString(
              row.targetPersonId,
            ) ===
              TARGET_TEACHER_PERSON_ID &&
            asString(
              row.evaluatorPersonId,
            ) ===
              SUPERVISOR_PERSON_ID &&
            isActive(
              row,
            ),
        ),
    );

  targetEvaluatorAssignments.forEach(
    (assignment, index) => {
      if (!assignment) {
        conflicts.push({
          reason:
            "TARGET_EVALUATOR_ASSIGNMENT_NOT_FOUND",

          cycleId:
            asString(
              targetCycles[index]?.id,
            ),

          targetPersonId:
            TARGET_TEACHER_PERSON_ID,

          evaluatorPersonId:
            SUPERVISOR_PERSON_ID,
        });
      }
    },
  );

  /*
   * =========================================================
   * Historical submission safety
   * =========================================================
   */

  const matchingSubmissions =
    submissions.filter(
      (row) =>
        asString(
          row.planId,
        ) ===
          TARGET_PLAN_ID &&
        asString(
          row.targetPersonId,
        ) ===
          TARGET_TEACHER_PERSON_ID,
    );

  if (
    matchingSubmissions.length > 0
  ) {
    warnings.push({
      reason:
        "TARGET_HAS_EXISTING_SUBMISSIONS",

      count:
        matchingSubmissions.length,

      action:
        "PRESERVE_ONLY",

      note:
        "لن يتم تعديل أو حذف أي submission.",
    });
  }

  /*
   * =========================================================
   * Build repair writes
   * =========================================================
   */

  if (
    conflicts.length === 0
  ) {
    for (
      let i = 0;
      i < targetCycles.length;
      i += 1
    ) {
      const sourcePattern =
        sourcePatterns[i];

      const targetAssignment =
        targetEvaluatorAssignments[i];

      const rubricConfig =
        extractRubricConfig(
          sourcePattern,
        );

      /*
       * نؤكد بعض الحقول المهمة من الخطة الصحيحة
       * بدل الاعتماد على source.
       */
      const patch = {
        ...rubricConfig,

        frameworkId:
          asString(
            targetPlan.frameworkId,
          ),

        planId:
          TARGET_PLAN_ID,

        cycleId:
          asString(
            targetCycles[i].id,
          ),

        schoolId:
          TARGET_SCHOOL_ID,

        academicYearId:
          YEAR_ID,

        termId:
          TERM_ID,

        targetPersonId:
          TARGET_TEACHER_PERSON_ID,

        evaluatorPersonId:
          SUPERVISOR_PERSON_ID,

        updatedAt:
          now,

        rubricRepairTool:
          "repair-kg04-corners-teacher-rubric-from-kg02.cjs",

        rubricRepairSourcePlanId:
          SOURCE_PLAN_ID,

        rubricRepairSourceAssignmentId:
          asString(
            sourcePattern.id,
          ),

        rubricRepairedAt:
          now,
      };

      /*
       * نحذف أي fields لا ينبغي أن نكتبها
       * حتى لو دخلت من source بصورة غير متوقعة.
       */
      delete patch.id;
      delete patch.ref;

      delete patch.targetUid;
      delete patch.targetEmail;
      delete patch.targetDisplayName;
      delete patch.targetRoleKey;
      delete patch.targetRoleLabel;

      delete patch.evaluatorUid;
      delete patch.evaluatorEmail;
      delete patch.evaluatorDisplayName;
      delete patch.evaluatorRoleKey;
      delete patch.evaluatorRoleLabel;

      delete patch.weight;
      delete patch.status;

      delete patch.createdAt;

      const fieldChanges =
        diffFields(
          targetAssignment,
          patch,
        );

      writes.push({
        ref:
          targetAssignment.ref,

        data:
          patch,
      });

      changes.push({
        targetCycleId:
          asString(
            targetCycles[i].id,
          ),

        targetAssignmentId:
          asString(
            targetAssignment.id,
          ),

        sourceCycleId:
          asString(
            sourceCycles[i].id,
          ),

        sourceAssignmentId:
          asString(
            sourcePattern.id,
          ),

        sourceTargetPersonId:
          asString(
            sourcePattern.targetPersonId,
          ),

        sourceTargetDisplayName:
          asString(
            sourcePattern.targetDisplayName,
          ),

        changedFields:
          fieldChanges,
      });
    }
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

    source: {
      schoolId:
        SOURCE_SCHOOL_ID,

      planId:
        SOURCE_PLAN_ID,

      frameworkId:
        sourcePlan
          ? asString(
              sourcePlan.frameworkId,
            )
          : "",

      cycles:
        sourceCycles.map(
          (row) => ({
            id:
              asString(row.id),

            title:
              asString(
                row.title,
                asString(
                  row.shortTitle,
                ),
              ),
          }),
        ),
    },

    target: {
      schoolId:
        TARGET_SCHOOL_ID,

      planId:
        TARGET_PLAN_ID,

      frameworkId:
        targetPlan
          ? asString(
              targetPlan.frameworkId,
            )
          : "",

      targetPersonId:
        TARGET_TEACHER_PERSON_ID,

      evaluatorPersonId:
        SUPERVISOR_PERSON_ID,

      cycles:
        targetCycles.map(
          (row) => ({
            id:
              asString(row.id),

            title:
              asString(
                row.title,
                asString(
                  row.shortTitle,
                ),
              ),
          }),
        ),
    },

    historicalSubmissions: {
      found:
        matchingSubmissions.length,

      touched:
        0,
    },

    plannedChanges: {
      evaluatorAssignmentsToRepair:
        writes.length,

      targetAssignmentsTouched:
        0,

      submissionsTouched:
        0,

      totalWrites:
        writes.length,
    },

    changes,

    warningsCount:
      warnings.length,

    warnings,

    conflictsCount:
      conflicts.length,

    conflicts,
  };

  const reportPath =
    writeReport(
      report,
    );

  console.dir(
    {
      decision:
        report.decision,

      mode:
        report.mode,

      reportPath,

      source:
        report.source,

      target:
        report.target,

      historicalSubmissions:
        report.historicalSubmissions,

      plannedChanges:
        report.plannedChanges,

      warningsCount:
        report.warningsCount,

      warnings:
        report.warnings,

      conflictsCount:
        report.conflictsCount,

      conflicts:
        report.conflicts,
    },
    {
      depth: 20,
    },
  );

  if (
    conflicts.length > 0
  ) {
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

    console.log(
      "Review the JSON report, especially changes[].changedFields.",
    );

    return;
  }

  const committed =
    await commitInChunks(
      writes,
    );

  console.log("");

  console.dir({
    decision:
      "APPLIED",

    committedWrites:
      committed,

    evaluatorAssignmentsRepaired:
      writes.length,

    submissionsTouched:
      0,
  });
}

main().catch((error) => {
  console.error(
    "Repair KG-04 corners teacher rubric failed:",
    error,
  );

  process.exit(1);
});