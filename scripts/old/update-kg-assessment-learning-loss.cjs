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

const assessmentTemplateUpdates = [
  {
    id: "kg-teacher-measure-1",
    label: "قياس المعلمة 1",
  },
  {
    id: "kg-teacher-measure-2",
    label: "قياس المعلمة 2",
  },
  {
    id: "kg-teacher-measure-3",
    label: "قياس المعلمة 3",
  },
  {
    id: "kg-teacher-measure-4",
    label: "قياس المعلمة 4",
  },
  {
    id: "kg-teacher-measure-5",
    label: "قياس المعلمة 5",
  },
  {
    id: "kg-vp-measure-1",
    label: "قياس الوكيلة 1",
  },
  {
    id: "kg-vp-measure-2",
    label: "قياس الوكيلة 2",
  },
];

async function main() {
  const startedAt = Date.now();

  const result = {
    orgId,
    dryRun,
    updated: [],
    skippedMissing: [],
  };

  console.log("Starting KG assessment learning-loss update...");
  console.log({
    orgId,
    dryRun,
    learningLossThresholdPercentage,
  });

  for (const item of assessmentTemplateUpdates) {
    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("studentAssessmentTemplates")
      .doc(item.id);

    const snap = await ref.get();

    if (!snap.exists) {
      result.skippedMissing.push(item.id);
      console.log(`SKIP missing assessment template: ${item.id}`);
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

  const finishedAt = Date.now();

  console.log("Done.");
  console.log({
    ...result,
    durationMs: finishedAt - startedAt,
  });
}

main().catch((error) => {
  console.error("Failed to update KG assessment learning-loss templates.");
  console.error(error);
  process.exit(1);
});