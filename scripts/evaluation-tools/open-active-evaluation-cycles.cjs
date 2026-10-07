const admin = require("firebase-admin");
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

async function commitInChunks(writes, chunkSize = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + chunkSize);

    for (const write of chunk) {
      batch.update(write.ref, write.data);
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

  const cyclesRef = db
    .collection("orgs")
    .doc(ORG_ID)
    .collection("evaluationCycles");

  const snap = await cyclesRef
    .where("status", "==", "ACTIVE")
    .get();

  const matches = snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));

  console.log("");
  console.log(`ACTIVE cycles found: ${matches.length}`);

  if (matches.length > 0) {
    console.table(
      matches.map((row) => ({
        id: row.id,
        planId: row.planId || "",
        title: row.title || row.shortTitle || "",
        schoolId: row.schoolId || "",
        statusBefore: row.status,
        statusAfter: "OPEN",
      })),
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("Preview only. No writes performed.");

    console.log("");
    console.log(
      "Run again with --apply to change ACTIVE -> OPEN.",
    );

    return;
  }

  if (matches.length === 0) {
    console.log("");
    console.log("Nothing to update.");
    return;
  }

  const now = Date.now();

  const writes = matches.map((row) => ({
    ref: row.ref,
    data: {
      status: "OPEN",
      updatedAt: now,
      statusRepairTool:
        "open-active-evaluation-cycles.cjs",
      statusRepairedAt: now,
    },
  }));

  const committed = await commitInChunks(writes);

  console.log("");

  console.dir({
    decision: "APPLIED",
    activeCyclesFound: matches.length,
    cyclesUpdated: committed,
    fromStatus: "ACTIVE",
    toStatus: "OPEN",
  });
}

main().catch((error) => {
  console.error(
    "Failed to open ACTIVE evaluation cycles:",
    error,
  );

  process.exit(1);
});