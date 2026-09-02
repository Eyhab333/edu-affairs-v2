/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  frameworkId: "educational-supervisor-periodic-teacher-evaluation-v1",
  currentTitle: "أوراق عمل الفاقد",
  newTitle: "نواتج التعلم",
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const collectionPath = `orgs/${CONFIG.orgId}/evaluationRubricItems`;
  const snapshot = await db
    .collection(collectionPath)
    .where("frameworkId", "==", CONFIG.frameworkId)
    .where("title", "==", CONFIG.currentTitle)
    .get();
  const matches = snapshot.docs.map((document) => ({
    ref: document.ref,
    id: document.id,
    data: document.data(),
  }));

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");

  if (matches.length === 0) {
    console.log(`No rubric item found with title \"${CONFIG.currentTitle}\" in framework ${CONFIG.frameworkId}.`);
    return;
  }

  const plannedWrites = matches.map((item) => ({
    path: item.ref.path,
    changes: {
      title: CONFIG.newTitle,
      updatedAt: "Date.now()",
    },
  }));
  const outsideTargetCollection = plannedWrites.filter((write) => !write.path.startsWith(`${collectionPath}/`));
  const wrongFramework = matches.filter((item) => asString(item.data.frameworkId) !== CONFIG.frameworkId);
  const invalidChangeShape = plannedWrites.some((write) => {
    const fields = Object.keys(write.changes).sort();
    return JSON.stringify(fields) !== JSON.stringify(["title", "updatedAt"]);
  });

  assert(wrongFramework.length === 0, "Refusing apply: a matched item has a different frameworkId.");
  assert(outsideTargetCollection.length === 0, "Refusing apply: a planned write is outside evaluationRubricItems.");
  assert(!invalidChangeShape, "Refusing apply: planned changes must contain only title and updatedAt.");

  console.dir({
    frameworkId: CONFIG.frameworkId,
    matches: matches.map((item) => ({
      itemId: item.id,
      currentTitle: asString(item.data.title),
      newTitle: CONFIG.newTitle,
      frameworkId: asString(item.data.frameworkId),
      sectionId: asString(item.data.sectionId) || null,
      order: item.data.order ?? null,
    })),
    plannedWrites: plannedWrites.length,
  }, { depth: null, colors: process.stdout.isTTY });

  if (!APPLY) {
    console.log("No Firestore writes performed. Re-run with --apply to rename only the listed rubric items.");
    return;
  }

  const now = Date.now();
  const batch = db.batch();
  matches.forEach((item) => {
    batch.update(item.ref, {
      title: CONFIG.newTitle,
      updatedAt: now,
    });
  });
  await batch.commit();
  console.log(`Updated ${matches.length} rubric item(s).`);
}

main().catch((error) => {
  console.error("Periodic supervisor rubric-item rename failed:", error.message);
  process.exitCode = 1;
});
