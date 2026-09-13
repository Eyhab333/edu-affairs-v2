const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const INCLUDE_SAYED = process.argv.includes("--includeSayed");

const EXCLUDED_TARGET_PLAN_IDS = new Set([
  "mrb-girls-ay-1448-term-1-girls-vice-principal-periodic-teacher-evaluation",
]);

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

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
      safeFileName(EMAIL),
      safeFileName(FROM_SCHOOL_ID),
      "to",
      safeFileName(TO_SCHOOL_ID),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return reportPath;
}

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const ORG_ID = getArg("org", "takween");
const YEAR_ID = getArg("year", "ay-1448");
const TERM_ID = getArg("term", "term-1");

const EMAIL = getArg("email").trim().toLowerCase();
const FROM_SCHOOL_ID = getArg("from").trim();
const TO_SCHOOL_ID = getArg("to").trim();

function requireArgs() {
  const missing = [];

  if (!EMAIL) missing.push("--email");
  if (!FROM_SCHOOL_ID) missing.push("--from");
  if (!TO_SCHOOL_ID) missing.push("--to");

  if (missing.length > 0) {
    console.error("Missing required args:", missing.join(", "));
    process.exit(1);
  }

  if (FROM_SCHOOL_ID === TO_SCHOOL_ID) {
    console.error("--from and --to cannot be the same school.");
    process.exit(1);
  }
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isActive(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
}

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "OPEN" || status === "ACTIVE" || !status;
}

function isFrameworkActive(framework) {
  return asString(framework?.status, "ACTIVE") === "ACTIVE";
}

function isTeacherTarget(row) {
  const targetKind = normalizeStatus(row.targetKind);
  const roleKey = normalizeStatus(row.targetRoleKey);
  const roleLabel = asString(row.targetRoleLabel);
  const planTitle = asString(row.planTitle);
  const frameworkTitle = asString(row.frameworkTitle);

  const text = [targetKind, roleKey, roleLabel, planTitle, frameworkTitle]
    .filter(Boolean)
    .join(" ");

  return (
    targetKind === "TEACHER" ||
    roleKey.includes("TEACHER") ||
    text.includes("معلم") ||
    text.includes("معلمة")
  );
}

function cleanForCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.targetPersonId;
  delete cleaned.targetEmail;
  delete cleaned.targetDisplayName;
  delete cleaned.targetName;
  delete cleaned.teacherEmail;
  delete cleaned.teacherName;
  delete cleaned.teacherDisplayName;

  delete cleaned.removedAt;
  delete cleaned.removedReason;
  delete cleaned.transferredAt;
  delete cleaned.transferredFromSchoolId;
  delete cleaned.transferredToSchoolId;
  delete cleaned.transferTool;

  return cleaned;
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
    const aOrder = asNumber(a.sequence, asNumber(a.cycleNumber, 9999));
    const bOrder = asNumber(b.sequence, asNumber(b.cycleNumber, 9999));

    if (aOrder !== bOrder) return aOrder - bOrder;

    return asString(a.id).localeCompare(asString(b.id));
  });
}

function targetAssignmentId(planId, targetPersonId) {
  return `${planId}-target-${targetPersonId}`;
}

function fallbackEvaluatorAssignmentId(params) {
  return `${params.planId}-${params.cycleId}-${params.targetPersonId}-${params.evaluatorPersonId}`;
}

function buildEvaluatorAssignmentIdFromPattern(
  pattern,
  targetPersonId,
  planId,
  cycleId,
) {
  const patternId = asString(pattern.id);
  const patternTargetPersonId = asString(pattern.targetPersonId);
  const patternPlanId = asString(pattern.planId);
  const patternCycleId = asString(pattern.cycleId);

  if (
    patternId &&
    patternTargetPersonId &&
    patternId.includes(patternTargetPersonId)
  ) {
    let nextId = patternId.split(patternTargetPersonId).join(targetPersonId);

    if (patternPlanId && nextId.includes(patternPlanId)) {
      nextId = nextId.split(patternPlanId).join(planId);
    }

    if (patternCycleId && nextId.includes(patternCycleId)) {
      nextId = nextId.split(patternCycleId).join(cycleId);
    }

    return nextId;
  }

  return fallbackEvaluatorAssignmentId({
    planId,
    cycleId,
    targetPersonId,
    evaluatorPersonId: asString(pattern.evaluatorPersonId),
  });
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);

  const usersSnap = await db
    .collection("users")
    .where("email", "==", normalized)
    .limit(5)
    .get();

  if (!usersSnap.empty) {
    const doc = usersSnap.docs[0];
    const row = doc.data();

    return {
      uid: row.uid || doc.id,
      personId: asString(row.personId, doc.id),
      email: normalizeEmail(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        normalized,
      roleKey: asString(row.roleKey),
      source: "users",
    };
  }

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const peopleSnap = await orgRef
    .collection("people")
    .where("email", "==", normalized)
    .limit(5)
    .get();

  if (!peopleSnap.empty) {
    const doc = peopleSnap.docs[0];
    const row = doc.data();

    return {
      uid: "",
      personId: asString(row.personId, doc.id),
      email: normalizeEmail(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        normalized,
      roleKey: asString(row.roleKey),
      source: "orgs/people",
    };
  }

  return null;
}

async function getSchoolTitle(orgRef, schoolId) {
  const snap = await orgRef.collection("schools").doc(schoolId).get();

  if (!snap.exists) return schoolId;

  const row = snap.data();

  return (
    asString(row.title) ||
    asString(row.name) ||
    asString(row.displayName) ||
    schoolId
  );
}

function countByStatus(rows) {
  return rows.reduce(
    (acc, row) => {
      const status = normalizeStatus(row.status) || "UNKNOWN";
      acc.total += 1;
      acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} },
  );
}

function shouldIncludeTargetPlan(plan, framework) {
  if (plan.schoolId !== TO_SCHOOL_ID) return false;
  if (plan.academicYearId !== YEAR_ID) return false;
  if (plan.termId !== TERM_ID) return false;

  if (EXCLUDED_TARGET_PLAN_IDS.has(asString(plan.id))) {
    return false;
  }

  if (plan.targetKind !== "TEACHER") return false;
  if (!isActive(plan)) return false;
  if (!isFrameworkActive(framework)) return false;

  if (!INCLUDE_SAYED && asString(plan.id).includes("sayed-")) {
    return false;
  }

  return true;
}

function buildTargetWrite(params) {
  const { plan, pattern, teacher, schoolTitle, now } = params;

  const newTargetId = targetAssignmentId(plan.id, teacher.personId);

  return {
    id: newTargetId,
    orgId: ORG_ID,

    schoolId: TO_SCHOOL_ID,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId: plan.id,
    planTitle: asString(plan.title),
    frameworkId: asString(plan.frameworkId),

    targetKind: "TEACHER",
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    targetRoleKey:
      asString(pattern?.targetRoleKey) ||
      asString(teacher.roleKey) ||
      "TEACHER",
    targetRoleLabel: asString(pattern?.targetRoleLabel, "معلمة"),

    status: "ACTIVE",

    transferredAt: now,
    transferredFromSchoolId: FROM_SCHOOL_ID,
    transferredToSchoolId: TO_SCHOOL_ID,
    transferTool: "transfer-teacher-to-target-standard-plans.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildEvaluatorWrite(params) {
  const {
    plan,
    cycle,
    pattern,
    teacher,
    schoolTitle,
    newTargetId,
    newEvaluatorId,
    now,
  } = params;

  const base = cleanForCopy(pattern);

  return {
    ...base,

    id: newEvaluatorId,
    orgId: ORG_ID,

    schoolId: TO_SCHOOL_ID,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId: plan.id,
    planTitle: asString(plan.title),
    frameworkId: asString(plan.frameworkId),

    cycleId: cycle.id,
    cycleTitle: asString(cycle.title, asString(cycle.shortTitle)),

    targetAssignmentId: newTargetId,
    targetKind: "TEACHER",
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    targetRoleKey:
      asString(pattern.targetRoleKey) || asString(teacher.roleKey) || "TEACHER",
    targetRoleLabel: asString(pattern.targetRoleLabel, "معلمة"),

    evaluatorUid: asString(pattern.evaluatorUid, asString(pattern.uid)),
    evaluatorPersonId: asString(pattern.evaluatorPersonId),
    evaluatorEmail: asString(pattern.evaluatorEmail),
    evaluatorDisplayName: asString(pattern.evaluatorDisplayName),
    evaluatorRoleKey: asString(pattern.evaluatorRoleKey),
    evaluatorRoleLabel: asString(pattern.evaluatorRoleLabel),

    status: "ACTIVE",

    transferredAt: now,
    transferredFromSchoolId: FROM_SCHOOL_ID,
    transferredToSchoolId: TO_SCHOOL_ID,
    transferTool: "transfer-teacher-to-target-standard-plans.cjs",

    createdAt: now,
    updatedAt: now,
  };
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

  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const teacher = await getUserByEmail(EMAIL);

  if (!teacher) {
    console.error(`Could not find teacher by email: ${EMAIL}`);
    process.exit(1);
  }

  const [fromSchoolTitle, toSchoolTitle] = await Promise.all([
    getSchoolTitle(orgRef, FROM_SCHOOL_ID),
    getSchoolTitle(orgRef, TO_SCHOOL_ID),
  ]);

  const [
    plans,
    frameworks,
    cycles,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    getCollectionRows(orgRef, "evaluationPlans"),
    getCollectionRows(orgRef, "evaluationFrameworks"),
    getCollectionRows(orgRef, "evaluationCycles"),
    getCollectionRows(orgRef, "evaluationTargetAssignments"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const frameworksById = new Map(frameworks.map((item) => [item.id, item]));

  const oldActiveTargets = targetAssignments
    .filter((row) => row.schoolId === FROM_SCHOOL_ID)
    .filter((row) => row.targetPersonId === teacher.personId)
    .filter((row) => row.academicYearId === YEAR_ID || !row.academicYearId)
    .filter((row) => row.termId === TERM_ID || !row.termId)
    .filter(isActive)
    .filter(isTeacherTarget);

  const oldActiveEvaluators = evaluatorAssignments
    .filter((row) => row.schoolId === FROM_SCHOOL_ID)
    .filter((row) => row.targetPersonId === teacher.personId)
    .filter((row) => row.academicYearId === YEAR_ID || !row.academicYearId)
    .filter((row) => row.termId === TERM_ID || !row.termId)
    .filter(isActive);

  const oldSubmissions = submissions
    .filter((row) => row.schoolId === FROM_SCHOOL_ID)
    .filter((row) => row.targetPersonId === teacher.personId)
    .filter((row) => row.academicYearId === YEAR_ID || !row.academicYearId)
    .filter((row) => row.termId === TERM_ID || !row.termId);

  const existingActiveTargetInNewSchool = targetAssignments
    .filter((row) => row.schoolId === TO_SCHOOL_ID)
    .filter((row) => row.targetPersonId === teacher.personId)
    .filter((row) => row.academicYearId === YEAR_ID || !row.academicYearId)
    .filter((row) => row.termId === TERM_ID || !row.termId)
    .filter(isActive);

  const targetPlans = plans
    .filter((plan) => {
      const framework = frameworksById.get(asString(plan.frameworkId)) || null;
      return shouldIncludeTargetPlan(plan, framework);
    })
    .sort((a, b) => asString(a.id).localeCompare(asString(b.id)));

  const conflicts = [];
  const warnings = [];

  if (oldActiveTargets.length === 0) {
    conflicts.push({
      reason: "NO_ACTIVE_TEACHER_TARGET_ASSIGNMENTS_IN_FROM_SCHOOL",
      fromSchoolId: FROM_SCHOOL_ID,
      teacherPersonId: teacher.personId,
      email: teacher.email,
    });
  }

  if (targetPlans.length === 0) {
    conflicts.push({
      reason: "NO_ACTIVE_TARGET_TEACHER_PLANS_IN_TO_SCHOOL",
      toSchoolId: TO_SCHOOL_ID,
    });
  }

  if (existingActiveTargetInNewSchool.length > 0) {
    warnings.push({
      reason: "TEACHER_ALREADY_HAS_ACTIVE_TARGET_ASSIGNMENTS_IN_TO_SCHOOL",
      count: existingActiveTargetInNewSchool.length,
      sample: existingActiveTargetInNewSchool.slice(0, 10).map((row) => ({
        id: row.id,
        planId: row.planId,
        targetDisplayName: row.targetDisplayName,
      })),
    });
  }

  const targetPlanReports = [];
  const newTargetWrites = [];
  const newEvaluatorWrites = [];
  const removeOldTargetWrites = [];
  const removeOldEvaluatorWrites = [];

  for (const plan of targetPlans) {
    const planCycles = sortByCycle(
      cycles
        .filter((cycle) => cycle.planId === plan.id)
        .filter(
          (cycle) => cycle.academicYearId === YEAR_ID || !cycle.academicYearId,
        )
        .filter((cycle) => cycle.termId === TERM_ID || !cycle.termId)
        .filter(isUsableCycle),
    );

    if (planCycles.length === 0) {
      conflicts.push({
        reason: "NO_USABLE_CYCLES_FOR_TARGET_PLAN",
        planId: plan.id,
        title: plan.title || "",
      });

      continue;
    }

    const newTargetId = targetAssignmentId(plan.id, teacher.personId);

    const cycleReports = [];
    let firstPatternForTarget = null;

    for (const cycle of planCycles) {
      let patternSource = "SAME_PLAN_SAME_CYCLE";

      let patterns = uniqueBy(
        evaluatorAssignments
          .filter((row) => row.schoolId === TO_SCHOOL_ID)
          .filter((row) => row.planId === plan.id)
          .filter((row) => row.cycleId === cycle.id)
          .filter((row) => row.targetPersonId !== teacher.personId)
          .filter(isActive),
        (row) =>
          [
            asString(row.evaluatorPersonId),
            asString(row.evaluatorRoleKey),
            asString(row.evaluatorEmail),
          ].join("__"),
      );

      if (patterns.length === 0) {
        patternSource = "SAME_PLAN_ANY_CYCLE";

        patterns = uniqueBy(
          evaluatorAssignments
            .filter((row) => row.schoolId === TO_SCHOOL_ID)
            .filter((row) => row.planId === plan.id)
            .filter((row) => row.targetPersonId !== teacher.personId)
            .filter(isActive),
          (row) =>
            [
              asString(row.evaluatorPersonId),
              asString(row.evaluatorRoleKey),
              asString(row.evaluatorEmail),
            ].join("__"),
        );
      }

      if (patterns.length === 0) {
        conflicts.push({
          reason: "NO_EVALUATOR_PATTERN_FOR_TARGET_PLAN_CYCLE",
          planId: plan.id,
          cycleId: cycle.id,
          title: plan.title || "",
          note: "يوجد cycle لكن لا يوجد إسناد مقيم نشط لنفس الخطة والدورة في المدرسة الجديدة.",
        });

        continue;
      }

      if (!firstPatternForTarget) {
        firstPatternForTarget = patterns[0];
      }

      cycleReports.push({
        cycleId: cycle.id,
        cycleTitle: cycle.title || cycle.shortTitle || "",
        patternSource,
        evaluatorPatterns: patterns.map((pattern) => ({
          patternId: pattern.id,
          evaluatorPersonId: pattern.evaluatorPersonId || "",
          evaluatorEmail: pattern.evaluatorEmail || "",
          evaluatorDisplayName: pattern.evaluatorDisplayName || "",
          evaluatorRoleKey: pattern.evaluatorRoleKey || "",
          evaluatorRoleLabel: pattern.evaluatorRoleLabel || "",
          patternTargetPersonId: pattern.targetPersonId || "",
          patternTargetDisplayName: pattern.targetDisplayName || "",
        })),
      });

      for (const pattern of patterns) {
        const newEvaluatorId = buildEvaluatorAssignmentIdFromPattern(
          pattern,
          teacher.personId,
          plan.id,
          cycle.id,
        );

        newEvaluatorWrites.push({
          ref: orgRef
            .collection("evaluationEvaluatorAssignments")
            .doc(newEvaluatorId),
          data: buildEvaluatorWrite({
            plan,
            cycle,
            pattern,
            teacher,
            schoolTitle: toSchoolTitle,
            newTargetId,
            newEvaluatorId,
            now,
          }),
        });
      }
    }

    if (!firstPatternForTarget) {
      continue;
    }

    newTargetWrites.push({
      ref: orgRef.collection("evaluationTargetAssignments").doc(newTargetId),
      data: buildTargetWrite({
        plan,
        pattern: firstPatternForTarget,
        teacher,
        schoolTitle: toSchoolTitle,
        now,
      }),
    });

    targetPlanReports.push({
      planId: plan.id,
      title: plan.title || "",
      frameworkId: plan.frameworkId || "",
      cyclesCount: planCycles.length,
      newTargetId,
      cycleReports,
    });
  }

  for (const oldTarget of oldActiveTargets) {
    removeOldTargetWrites.push({
      ref: oldTarget.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "TRANSFERRED_TO_TARGET_STANDARD_PLANS",
        transferredAt: now,
        transferredFromSchoolId: FROM_SCHOOL_ID,
        transferredToSchoolId: TO_SCHOOL_ID,
        transferTool: "transfer-teacher-to-target-standard-plans.cjs",
        updatedAt: now,
      },
    });
  }

  for (const oldEvaluator of oldActiveEvaluators) {
    removeOldEvaluatorWrites.push({
      ref: oldEvaluator.ref,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "TRANSFERRED_TO_TARGET_STANDARD_PLANS",
        transferredAt: now,
        transferredFromSchoolId: FROM_SCHOOL_ID,
        transferredToSchoolId: TO_SCHOOL_ID,
        transferTool: "transfer-teacher-to-target-standard-plans.cjs",
        updatedAt: now,
      },
    });
  }

  const allWrites = [
    ...newTargetWrites,
    ...newEvaluatorWrites,
    ...removeOldTargetWrites,
    ...removeOldEvaluatorWrites,
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
      email: EMAIL,
      fromSchoolId: FROM_SCHOOL_ID,
      fromSchoolTitle,
      toSchoolId: TO_SCHOOL_ID,
      toSchoolTitle,
      includeSayed: INCLUDE_SAYED,
    },

    teacher,

    currentState: {
      oldActiveTeacherTargetAssignments: oldActiveTargets.length,
      oldActiveEvaluatorAssignments: oldActiveEvaluators.length,
      oldSubmissions: countByStatus(oldSubmissions),
      existingActiveTargetsInToSchool: existingActiveTargetInNewSchool.length,
    },

    targetStandardPlans: {
      count: targetPlans.length,
      plans: targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title || "",
        frameworkId: plan.frameworkId || "",
      })),
    },

    plannedChanges: {
      createOrUpdateNewTargetAssignments: newTargetWrites.length,
      createOrUpdateNewEvaluatorAssignments: newEvaluatorWrites.length,
      removeOldTargetAssignments: removeOldTargetWrites.length,
      removeOldEvaluatorAssignments: removeOldEvaluatorWrites.length,
      totalWrites: allWrites.length,
    },

    targetPlanReports,

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      oldAssignmentsAction: "status becomes REMOVED",
      historicalSubmissionsRemain: true,
      requiresApplyFlag: true,
      excludedSayedPlanByDefault: !INCLUDE_SAYED,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      teacher: report.teacher,
      currentState: report.currentState,
      targetStandardPlansCount: report.targetStandardPlans.count,
      plannedChanges: report.plannedChanges,
      warningsCount: report.warnings.length,
      conflictsCount: report.conflicts.length,
      conflicts: report.conflicts.map((conflict) => ({
        reason: conflict.reason,
        planId: conflict.planId,
        cycleId: conflict.cycleId,
        oldPlanId: conflict.oldPlanId,
        expectedNewPlanId: conflict.expectedNewPlanId,
      })),
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
    console.log("Review the report carefully.");
    console.log("Run again with --apply to transfer assignments.");
    return;
  }

  const committed = await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    createdOrUpdatedTargets: newTargetWrites.length,
    createdOrUpdatedEvaluators: newEvaluatorWrites.length,
    removedOldTargets: removeOldTargetWrites.length,
    removedOldEvaluators: removeOldEvaluatorWrites.length,
    submissionsTouched: 0,
    previewReportPath: reportPath,
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
  console.error("Transfer failed:", error);
  process.exit(1);
});
