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
const SUPERVISOR_PERSON_ID = getArg("supervisorPersonId").trim();
const SCHOOL_ID = getArg("school").trim();

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

const TARGET_ROLE_KEY_ARG = getArg("targetRoleKey").trim();

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

  if (!TARGET_PERSON_ID) missing.push("--targetPersonId");
  if (!SUPERVISOR_PERSON_ID) missing.push("--supervisorPersonId");
  if (!SCHOOL_ID) missing.push("--school");

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

async function resolvePerson(personId) {
  const users = await db
    .collection("users")
    .where("personId", "==", personId)
    .limit(5)
    .get();

  if (!users.empty) {
    const doc = users.docs[0];
    const row = doc.data();

    return {
      uid: asString(row.uid, doc.id),
      personId,
      email: asString(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        personId,
      roleKey: asString(row.roleKey),
      source: "users/personId",
    };
  }

  const personSnap = await db
    .collection("orgs")
    .doc(ORG_ID)
    .collection("people")
    .doc(personId)
    .get();

  if (personSnap.exists) {
    const row = personSnap.data();

    return {
      uid: asString(row.uid),
      personId,
      email: asString(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        personId,
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

function targetAssignmentId(planId, targetPersonId) {
  return `${planId}-target-${targetPersonId}`;
}

function evaluatorAssignmentId(
  planId,
  cycleId,
  targetPersonId,
  evaluatorPersonId,
) {
  return `${planId}-${cycleId}-${targetPersonId}-${evaluatorPersonId}`;
}

function cleanForCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.targetPersonId;
  delete cleaned.targetUid;
  delete cleaned.targetEmail;
  delete cleaned.targetDisplayName;

  delete cleaned.createdAt;
  delete cleaned.updatedAt;

  return cleaned;
}

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "add-staff-to-supervisor-evaluations",
      safeFileName(TARGET_PERSON_ID),
      "to",
      safeFileName(SUPERVISOR_PERSON_ID),
      safeFileName(SCHOOL_ID),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

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

  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [target, supervisor] = await Promise.all([
    resolvePerson(TARGET_PERSON_ID),
    resolvePerson(SUPERVISOR_PERSON_ID),
  ]);

  const conflicts = [];
  const warnings = [];

  if (!target) {
    conflicts.push({
      reason: "TARGET_PERSON_NOT_FOUND",
      targetPersonId: TARGET_PERSON_ID,
    });
  }

  if (!supervisor) {
    conflicts.push({
      reason: "SUPERVISOR_NOT_FOUND",
      supervisorPersonId: SUPERVISOR_PERSON_ID,
    });
  }

  const [plans, cycles, targetAssignments, evaluatorAssignments, submissions] =
    await Promise.all([
      getCollectionRows(orgRef, "evaluationPlans"),
      getCollectionRows(orgRef, "evaluationCycles"),
      getCollectionRows(orgRef, "evaluationTargetAssignments"),
      getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
      getCollectionRows(orgRef, "evaluationSubmissions"),
    ]);

  /*
   * نأخذ دور لمى من آخر Target Assignment قديم لها،
   * حتى لو أصبح REMOVED بعد الخطوة السابقة.
   */
  const historicalTargetRows = targetAssignments
    .filter((row) => asString(row.targetPersonId) === TARGET_PERSON_ID)
    .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
    .filter((row) => asString(row.termId, TERM_ID) === TERM_ID)
    .filter((row) => asString(row.targetRoleKey));

  const targetRoleKeys = Array.from(
    new Set(
      historicalTargetRows
        .map((row) => asString(row.targetRoleKey))
        .filter(Boolean),
    ),
  );

  if (targetRoleKeys.length === 0) {
    conflicts.push({
      reason: "TARGET_ROLE_KEY_NOT_FOUND",
      targetPersonId: TARGET_PERSON_ID,
    });
  }

  if (targetRoleKeys.length > 1) {
    warnings.push({
      reason: "MULTIPLE_HISTORICAL_TARGET_ROLES_FOUND",
      targetRoleKeys,
    });
  }

  const targetRoleKey = TARGET_ROLE_KEY_ARG || targetRoleKeys[0] || "";

  const targetRoleLabel =
    TARGET_ROLE_KEY_ARG === "KG_TEACHER"
      ? "معلمة"
      : historicalTargetRows
          .map((row) => asString(row.targetRoleLabel))
          .find(Boolean) || "";

  /*
   * خطط فاطمة الفعلية في الروضة الأولى.
   * نحدد الخطط من evaluator assignments الموجودة لها،
   * وليس من أسماء الخطط يدويًا.
   */
  const supervisorPatternAssignments = evaluatorAssignments
    .filter((row) => asString(row.schoolId) === SCHOOL_ID)
    .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
    .filter((row) => asString(row.termId, TERM_ID) === TERM_ID)
    .filter((row) => asString(row.evaluatorPersonId) === SUPERVISOR_PERSON_ID)
    .filter(isActive);

  const matchingPatterns = supervisorPatternAssignments.filter(
    (row) => asString(row.targetRoleKey) === targetRoleKey,
  );

  const matchingPlanIds = Array.from(
    new Set(
      matchingPatterns.map((row) => asString(row.planId)).filter(Boolean),
    ),
  );

  const targetPlans = plans
    .filter((plan) => matchingPlanIds.includes(asString(plan.id)))
    .filter((plan) => asString(plan.schoolId) === SCHOOL_ID)
    .filter((plan) => asString(plan.academicYearId, YEAR_ID) === YEAR_ID)
    .filter((plan) => asString(plan.termId, TERM_ID) === TERM_ID)
    .filter(isActive);

  if (targetRoleKey && matchingPatterns.length === 0) {
    conflicts.push({
      reason: "NO_SUPERVISOR_PATTERN_FOR_TARGET_ROLE",
      supervisorPersonId: SUPERVISOR_PERSON_ID,
      schoolId: SCHOOL_ID,
      targetRoleKey,
      targetRoleLabel,
    });
  }

  if (matchingPatterns.length > 0 && targetPlans.length === 0) {
    conflicts.push({
      reason: "NO_ACTIVE_TARGET_PLANS_FOUND",
      schoolId: SCHOOL_ID,
      targetRoleKey,
      matchingPlanIds,
    });
  }

  const schoolTitle = await getSchoolTitle(orgRef, SCHOOL_ID);

  const targetWrites = [];
  const evaluatorWrites = [];
  const planReports = [];

  for (const plan of targetPlans) {
    const planId = asString(plan.id);

    const patternRows = matchingPatterns.filter(
      (row) => asString(row.planId) === planId,
    );

    const planCycles = cycles
      .filter((cycle) => asString(cycle.planId) === planId)
      .filter(isUsableCycle);

    const targetId = targetAssignmentId(planId, TARGET_PERSON_ID);

    const firstPattern = patternRows[0];

    if (!firstPattern) {
      conflicts.push({
        reason: "NO_PATTERN_FOR_PLAN",
        planId,
      });

      continue;
    }

    targetWrites.push({
      ref: orgRef.collection("evaluationTargetAssignments").doc(targetId),

      data: {
        id: targetId,
        orgId: ORG_ID,

        schoolId: SCHOOL_ID,
        schoolTitle,

        academicYearId: YEAR_ID,
        termId: TERM_ID,

        planId,
        planTitle: asString(plan.title),
        frameworkId: asString(plan.frameworkId),

        targetKind:
          asString(firstPattern.targetKind) || asString(plan.targetKind),

        targetPersonId: TARGET_PERSON_ID,
        targetUid: asString(target?.uid),
        targetEmail: asString(target?.email),
        targetDisplayName: asString(target?.displayName, TARGET_PERSON_ID),

        targetRoleKey,
        targetRoleLabel:
          targetRoleLabel || asString(firstPattern.targetRoleLabel),

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        seedTool: "add-staff-to-supervisor-evaluations.cjs",
      },
    });

    const cycleReports = [];

    for (const cycle of planCycles) {
      const cycleId = asString(cycle.id);

      const pattern =
        patternRows.find((row) => asString(row.cycleId) === cycleId) ||
        firstPattern;

      const assignmentId = evaluatorAssignmentId(
        planId,
        cycleId,
        TARGET_PERSON_ID,
        SUPERVISOR_PERSON_ID,
      );

      const base = cleanForCopy(pattern);

      evaluatorWrites.push({
        ref: orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(assignmentId),

        data: {
          ...base,

          id: assignmentId,
          orgId: ORG_ID,

          schoolId: SCHOOL_ID,
          schoolTitle,

          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          planTitle: asString(plan.title),

          frameworkId: asString(plan.frameworkId),

          cycleId,
          cycleTitle: asString(cycle.title) || asString(cycle.shortTitle),

          targetAssignmentId: targetId,

          targetPersonId: TARGET_PERSON_ID,
          targetUid: asString(target?.uid),
          targetEmail: asString(target?.email),
          targetDisplayName: asString(target?.displayName, TARGET_PERSON_ID),

          targetRoleKey,
          targetRoleLabel: targetRoleLabel || asString(pattern.targetRoleLabel),

          evaluatorUid:
            asString(supervisor?.uid) || asString(pattern.evaluatorUid),

          evaluatorPersonId: SUPERVISOR_PERSON_ID,

          evaluatorEmail:
            asString(supervisor?.email) || asString(pattern.evaluatorEmail),

          evaluatorDisplayName:
            asString(supervisor?.displayName) ||
            asString(pattern.evaluatorDisplayName),

          evaluatorRoleKey:
            asString(supervisor?.roleKey) || asString(pattern.evaluatorRoleKey),

          evaluatorRoleLabel:
            asString(pattern.evaluatorRoleLabel) || "مشرفة تعليمية",

          weight: 100,
          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          seedTool: "add-staff-to-supervisor-evaluations.cjs",
        },
      });

      cycleReports.push({
        cycleId,
        title: asString(cycle.title) || asString(cycle.shortTitle),
        patternId: asString(pattern.id),
      });
    }

    planReports.push({
      planId,
      title: asString(plan.title),
      frameworkId: asString(plan.frameworkId),
      targetAssignmentId: targetId,
      cyclesCount: planCycles.length,
      cycleReports,
    });
  }

  const historicalSubmissions = submissions.filter(
    (row) => asString(row.targetPersonId) === TARGET_PERSON_ID,
  );

  const allWrites = [...targetWrites, ...evaluatorWrites];

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
      supervisorPersonId: SUPERVISOR_PERSON_ID,
      schoolId: SCHOOL_ID,
    },

    target,
    supervisor,

    selectedSchool: {
      schoolId: SCHOOL_ID,
      schoolTitle,
    },

    detectedRole: {
      targetRoleKey,
      targetRoleLabel,
      historicalRoleKeys: targetRoleKeys,
    },

    targetRoleKeyArg: TARGET_ROLE_KEY_ARG,

    currentState: {
      historicalTargetAssignments: historicalTargetRows.length,
      supervisorPatternAssignments: supervisorPatternAssignments.length,
      matchingSupervisorPatterns: matchingPatterns.length,
      targetPlansCount: targetPlans.length,
      historicalSubmissions: historicalSubmissions.length,
    },

    plannedChanges: {
      createOrUpdateTargetAssignments: targetWrites.length,
      createOrUpdateEvaluatorAssignments: evaluatorWrites.length,
      submissionsTouched: 0,
      totalWrites: allWrites.length,
    },

    planReports,

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      oldAssignmentsTouched: 0,
      targetSchoolOnly: SCHOOL_ID,
      targetSupervisorOnly: SUPERVISOR_PERSON_ID,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      target: report.target,
      supervisor: report.supervisor,
      selectedSchool: report.selectedSchool,
      detectedRole: report.detectedRole,
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
    console.log("Stopped. Fix conflicts before applying.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report carefully.");
    console.log("Run again with --apply to add the staff member.");
    return;
  }

  const committed = await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    createdOrUpdatedTargetAssignments: targetWrites.length,
    createdOrUpdatedEvaluatorAssignments: evaluatorWrites.length,
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
  console.error("Add staff to supervisor evaluations failed:", error);
  process.exit(1);
});
