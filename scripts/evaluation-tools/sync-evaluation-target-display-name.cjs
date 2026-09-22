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
const PERSON_ID = getArg("personId").trim();
const NEW_NAME = getArg("name").trim();

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function requireArgs() {
  const missing = [];

  if (!PERSON_ID) missing.push("--personId");
  if (!NEW_NAME) missing.push("--name");

  if (missing.length > 0) {
    console.error("Missing required args:", missing.join(", "));
    process.exit(1);
  }
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[@]/g, "_at_")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "sync-evaluation-target-display-name",
      safeFileName(PERSON_ID),
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
  const now = Date.now();

  const [
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    getCollectionRows(orgRef, "evaluationTargetAssignments"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const matchingTargets = targetAssignments.filter(
    (row) => asString(row.targetPersonId) === PERSON_ID,
  );

  const matchingEvaluators = evaluatorAssignments.filter(
    (row) => asString(row.targetPersonId) === PERSON_ID,
  );

  const matchingSubmissions = submissions.filter(
    (row) => asString(row.targetPersonId) === PERSON_ID,
  );

  const writes = [];

  for (const row of matchingTargets) {
    if (asString(row.targetDisplayName) === NEW_NAME) continue;

    writes.push({
      ref: row.ref,
      data: {
        targetDisplayName: NEW_NAME,
        updatedAt: now,
        displayNameSyncTool:
          "sync-evaluation-target-display-name.cjs",
      },
    });
  }

  for (const row of matchingEvaluators) {
    if (asString(row.targetDisplayName) === NEW_NAME) continue;

    writes.push({
      ref: row.ref,
      data: {
        targetDisplayName: NEW_NAME,
        updatedAt: now,
        displayNameSyncTool:
          "sync-evaluation-target-display-name.cjs",
      },
    });
  }

  for (const row of matchingSubmissions) {
    if (asString(row.targetDisplayName) === NEW_NAME) continue;

    writes.push({
      ref: row.ref,
      data: {
        targetDisplayName: NEW_NAME,
        updatedAt: now,
        displayNameSyncTool:
          "sync-evaluation-target-display-name.cjs",
      },
    });
  }

  const report = {
    decision: APPLY ? "READY_TO_APPLY" : "SAFE_PREVIEW",
    mode: APPLY ? "APPLY" : "PREVIEW",

    input: {
      orgId: ORG_ID,
      personId: PERSON_ID,
      newName: NEW_NAME,
    },

    currentState: {
      targetAssignmentsFound: matchingTargets.length,
      evaluatorAssignmentsFound: matchingEvaluators.length,
      submissionsFound: matchingSubmissions.length,
    },

    plannedChanges: {
      totalWrites: writes.length,
    },

    samples: {
      targetAssignments: matchingTargets.slice(0, 10).map((row) => ({
        id: row.id,
        currentName: row.targetDisplayName || "",
        planId: row.planId || "",
      })),

      evaluatorAssignments: matchingEvaluators.slice(0, 10).map((row) => ({
        id: row.id,
        currentName: row.targetDisplayName || "",
        planId: row.planId || "",
        cycleId: row.cycleId || "",
      })),

      submissions: matchingSubmissions.slice(0, 10).map((row) => ({
        id: row.id,
        currentName: row.targetDisplayName || "",
        planId: row.planId || "",
        cycleId: row.cycleId || "",
        status: row.status || "",
      })),
    },

    safety: {
      personIdChanged: false,
      uidChanged: false,
      emailChanged: false,
      scoresChanged: false,
      statusesChanged: false,
      displayNameOnly: true,
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
    },
    { depth: 20 },
  );

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report carefully.");
    console.log("Run again with --apply to sync the display name.");
    return;
  }

  const committed = await commitInChunks(writes);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
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
    "Sync evaluation display name failed:",
    error,
  );

  process.exit(1);
});