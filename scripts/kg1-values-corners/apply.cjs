"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CONFIRMATION, buildPlan, planFingerprint, writeReport } = require("./config.cjs");

function readArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "";
}

async function main() {
  const previewPathArgument = readArgument("preview");
  const applyRequested = process.argv.includes("--apply");
  const confirmed = process.argv.includes(`--confirm=${CONFIRMATION}`);
  if (!applyRequested || !confirmed || !previewPathArgument) {
    throw new Error(`Apply requires --apply --confirm=${CONFIRMATION} --preview=<validated-preview-report.json>.`);
  }
  const previewPath = path.resolve(previewPathArgument);
  const preview = JSON.parse(fs.readFileSync(previewPath, "utf8"));
  if (preview.metadata?.reportType !== "KG1_VALUES_CORNERS_PREVIEW" || preview.metadata?.orgId !== "takween" || preview.metadata?.version !== 2 || preview.summary?.safeToApply !== true || preview.metadata?.readOnly !== true) {
    throw new Error("The supplied preview report is not a safe KG1 VALUES/CORNERS preview.");
  }
  const previewTime = Date.parse(preview.metadata?.generatedAt || "");
  if (!Number.isFinite(previewTime) || Date.now() - previewTime > 60 * 60 * 1000 || previewTime > Date.now() + 60 * 1000) {
    throw new Error("The approved preview is older than one hour or has an invalid timestamp. Generate a fresh preview.");
  }
  const { db, report: freshPreview, writes } = await buildPlan();
  if (preview.metadata.projectId !== freshPreview.metadata.projectId ||
      preview.metadata.academicYearId !== freshPreview.metadata.academicYearId ||
      preview.metadata.source !== freshPreview.metadata.source ||
      preview.summary.targetCount !== freshPreview.summary.targetCount) {
    throw new Error("Preview metadata does not match the current target environment.");
  }
  if (!freshPreview.summary.safeToApply || freshPreview.planFingerprint !== preview.planFingerprint || planFingerprint(writes) !== preview.planFingerprint) {
    throw new Error("Firestore state no longer matches the approved preview. Run and review a fresh preview before applying.");
  }
  if (writes.length === 0) {
    console.log("No new documents required. Nothing was written.");
    return;
  }
  // This transaction guarantees create-only writes; the preview is revalidated immediately before it.
  // If source documents may be edited concurrently, verify source versions in a separate controlled maintenance window.
  await db.runTransaction(async (transaction) => {
    const refs = writes.map((write) => db.doc(write.path));
    const snapshots = refs.length ? await transaction.getAll(...refs) : [];
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) throw new Error(`Planned create is no longer safe because the document now exists: ${snapshot.ref.path}`);
    });
    writes.forEach((write) => transaction.create(db.doc(write.path), write.payload));
  });
  const result = { ...freshPreview, metadata: { ...freshPreview.metadata, reportType: "KG1_VALUES_CORNERS_APPLY_RESULT", readOnly: false, firestoreWritesPerformed: true, appliedAt: new Date().toISOString(), approvedPreviewPath: previewPath }, appliedWrites: writes.map(({ payload, ...write }) => write) };
  const resultPath = writeReport("apply-result", result);
  console.log(`Applied ${writes.length} approved creates. Result report: ${resultPath}`);
}

main().catch((error) => { console.error("KG1 VALUES/CORNERS apply failed:", error.stack || error); process.exitCode = 1; });
