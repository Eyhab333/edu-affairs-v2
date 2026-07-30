const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const learningLossThresholdPercentage = 60;

const trackerTemplateUpdates = [
  {
    id: "kg-quran-tracker",
    label: "متابعة القرآن",
  },
  {
    id: "kg-learning-gardens-tracker",
    label: "متابعة بساتين المعرفة",
  },
  {
    id: "kg-numbers-tracker",
    label: "متابعة الأرقام",
  },
];

const trackerTemplateIdsToDelete = ["kg-loss-tracker"];

async function main() {
  const startedAt = Date.now();

  const result = {
    orgId,
    dryRun,
    updated: [],
    skippedMissing: [],
    deleted: [],
    deleteSkippedMissing: [],
  };

  console.log("Starting KG tracker learning-loss update...");
  console.log({
    orgId,
    dryRun,
    learningLossThresholdPercentage,
  });

  for (const item of trackerTemplateUpdates) {
    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("studentTrackerTemplates")
      .doc(item.id);

    const snap = await ref.get();

    if (!snap.exists) {
      result.skippedMissing.push(item.id);
      console.log(`SKIP missing tracker template: ${item.id}`);
      continue;
    }

    const patch = {
      requiresLearningLossFollowUp: true,
      learningLossThresholdPercentage,
      learningLossThresholdScore: FieldValue.delete(),
      updatedAt: Date.now(),
    };

    if (!dryRun) {
      await ref.update(patch);
    }

    result.updated.push(item.id);

    console.log(
      `${dryRun ? "DRY RUN update" : "UPDATED"} ${item.id} — ${item.label}`,
    );
  }

  for (const id of trackerTemplateIdsToDelete) {
    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("studentTrackerTemplates")
      .doc(id);

    const snap = await ref.get();

    if (!snap.exists) {
      result.deleteSkippedMissing.push(id);
      console.log(`SKIP missing template to delete: ${id}`);
      continue;
    }

    if (!dryRun) {
      await ref.delete();
    }

    result.deleted.push(id);

    console.log(`${dryRun ? "DRY RUN delete" : "DELETED"} ${id}`);
  }

  const finishedAt = Date.now();

  console.log("Done.");
  console.log({
    ...result,
    durationMs: finishedAt - startedAt,
  });
}

main().catch((error) => {
  console.error("Failed to update KG tracker learning-loss templates.");
  console.error(error);
  process.exit(1);
});