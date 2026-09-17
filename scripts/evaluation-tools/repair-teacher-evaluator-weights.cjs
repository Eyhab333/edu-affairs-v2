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

const TEACHER_PERSON_ID = getArg("teacherPersonId").trim();
const SCHOOL_ID = getArg("school").trim();

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function requireArgs() {
  const missing = [];

  if (!TEACHER_PERSON_ID) missing.push("--teacherPersonId");
  if (!SCHOOL_ID) missing.push("--school");

  if (missing.length > 0) {
    console.error("Missing required args:", missing.join(", "));
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

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "repair-teacher-evaluator-weights",
      safeFileName(TEACHER_PERSON_ID),
      safeFileName(SCHOOL_ID),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

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

function groupByCycle(assignments) {
  const map = new Map();

  for (const assignment of assignments) {
    const key = [
      asString(assignment.planId),
      asString(assignment.cycleId),
      asString(assignment.targetPersonId),
    ].join("__");

    const current = map.get(key);

    if (current) {
      current.push(assignment);
    } else {
      map.set(key, [assignment]);
    }
  }

  return map;
}

function buildWeights(count) {
  if (count <= 0) return [];

  if (count === 1) return [100];

  const base = Math.floor((100 / count) * 1000) / 1000;
  const weights = Array.from({ length: count }, () => base);

  const used = base * count;
  const remainder = Number((100 - used).toFixed(3));

  weights[weights.length - 1] = Number(
    (weights[weights.length - 1] + remainder).toFixed(3),
  );

  return weights;
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

  const [evaluatorAssignments, submissions] = await Promise.all([
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const activeAssignments = evaluatorAssignments
    .filter((row) => asString(row.schoolId) === SCHOOL_ID)
    .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
    .filter((row) => asString(row.termId, TERM_ID) === TERM_ID)
    .filter((row) => asString(row.targetPersonId) === TEACHER_PERSON_ID)
    .filter(isActive);

  const groups = groupByCycle(activeAssignments);

  const writes = [];
  const cycleReports = [];
  const conflicts = [];
  const warnings = [];

  for (const [groupKey, assignments] of groups.entries()) {
    const sorted = [...assignments].sort((a, b) => {
      return asString(a.evaluatorPersonId).localeCompare(
        asString(b.evaluatorPersonId),
      );
    });

    const weights = buildWeights(sorted.length);

    const currentTotal = sorted.reduce(
      (sum, assignment) => sum + asNumber(assignment.weight, 100),
      0,
    );

    const targetTotal = weights.reduce((sum, weight) => sum + weight, 0);

    if (Number(targetTotal.toFixed(3)) !== 100) {
      conflicts.push({
        reason: "CALCULATED_WEIGHT_TOTAL_NOT_100",
        groupKey,
        targetTotal,
      });
      continue;
    }

    const assignmentReports = [];

    sorted.forEach((assignment, index) => {
      const oldWeight = asNumber(assignment.weight, 100);
      const newWeight = weights[index];

      assignmentReports.push({
        assignmentId: assignment.id,
        evaluatorPersonId: asString(assignment.evaluatorPersonId),
        evaluatorEmail: asString(assignment.evaluatorEmail),
        evaluatorDisplayName: asString(assignment.evaluatorDisplayName),
        oldWeight,
        newWeight,
      });

      if (oldWeight !== newWeight) {
        writes.push({
          ref: assignment.ref,
          data: {
            weight: newWeight,
            updatedAt: now,
            weightRepairTool: "repair-teacher-evaluator-weights.cjs",
          },
        });
      }
    });

    cycleReports.push({
      groupKey,
      planId: asString(sorted[0]?.planId),
      cycleId: asString(sorted[0]?.cycleId),
      targetPersonId: TEACHER_PERSON_ID,
      activeEvaluatorsCount: sorted.length,
      currentWeightTotal: currentTotal,
      targetWeightTotal: targetTotal,
      assignments: assignmentReports,
    });
  }

  const matchingSubmissions = submissions
    .filter((row) => asString(row.schoolId) === SCHOOL_ID)
    .filter((row) => asString(row.targetPersonId) === TEACHER_PERSON_ID)
    .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
    .filter((row) => asString(row.termId, TERM_ID) === TERM_ID);

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
      teacherPersonId: TEACHER_PERSON_ID,
      schoolId: SCHOOL_ID,
    },

    currentState: {
      activeEvaluatorAssignments: activeAssignments.length,
      cycleGroups: groups.size,
      matchingSubmissions: matchingSubmissions.length,
    },

    plannedChanges: {
      evaluatorAssignmentsToUpdate: writes.length,
      submissionsTouched: 0,
      totalWrites: writes.length,
    },

    cycleReports,

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      evaluatorAssignmentsOnly: true,
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
    console.log("Stopped. Fix conflicts before applying.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report carefully.");
    console.log("Run again with --apply to repair evaluator weights.");
    return;
  }

  const committed = await commitInChunks(writes);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    evaluatorAssignmentsUpdated: writes.length,
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
  console.error("Weight repair failed:", error);
  process.exit(1);
});