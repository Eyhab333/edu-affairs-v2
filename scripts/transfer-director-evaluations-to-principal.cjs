/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const OLD_EVALUATOR_EMAIL = (
  process.env.OLD_EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const NEW_EVALUATOR_EMAIL = (
  process.env.NEW_EVALUATOR_EMAIL || "a-s-alkmays@qz.org.sa"
).toLowerCase();

const NEW_EVALUATOR_ROLE_KEY = "BOYS_PRINCIPAL";
const NEW_EVALUATOR_LABEL = "مدير المدرسة";

const DRY_RUN = process.env.DRY_RUN !== "false";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

async function findPersonByEmail(db, email) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  const allSnap = await db.collection(`orgs/${ORG_ID}/people`).get();

  return (
    allSnap.docs
      .map(dataWithId)
      .find((person) => String(person.email || "").toLowerCase() === email) ||
    null
  );
}

function isDirectorPlan(plan) {
  const text = [
    plan.id,
    plan.planId,
    plan.frameworkId,
    plan.title,
    plan.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("director-") || text.includes("تقييم المدير");
}

function assignmentKey(data) {
  return [data.planId, data.cycleId, data.targetPersonId].join("|");
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const now = Date.now();

  const oldEvaluator = await findPersonByEmail(db, OLD_EVALUATOR_EMAIL);
  const newEvaluator = await findPersonByEmail(db, NEW_EVALUATOR_EMAIL);

  if (!oldEvaluator) {
    throw new Error(`Old evaluator person not found: ${OLD_EVALUATOR_EMAIL}`);
  }

  if (!newEvaluator) {
    throw new Error(`New evaluator person not found: ${NEW_EVALUATOR_EMAIL}`);
  }

  console.log("Transferring director evaluations...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    from: {
      personId: oldEvaluator.id,
      email: OLD_EVALUATOR_EMAIL,
      displayName: oldEvaluator.displayName,
    },
    to: {
      personId: newEvaluator.id,
      email: NEW_EVALUATOR_EMAIL,
      displayName: newEvaluator.displayName,
    },
    dryRun: DRY_RUN,
  });

  const plansSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationPlans`)
    .where("schoolId", "==", SCHOOL_ID)
    .where("academicYearId", "==", ACADEMIC_YEAR_ID)
    .where("termId", "==", TERM_ID)
    .get();

  const directorPlans = plansSnap.docs.map(dataWithId).filter(isDirectorPlan);
  const directorPlanIds = new Set(directorPlans.map((plan) => plan.id));

  console.log("\nDirector plans:");
  for (const plan of directorPlans) {
    console.log({
      id: plan.id,
      title: plan.title,
      frameworkId: plan.frameworkId,
    });
  }

  const submissionsSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationSubmissions`)
    .get();

  const startedKeys = new Set();

  for (const doc of submissionsSnap.docs) {
    const data = doc.data();

    if (!directorPlanIds.has(data.planId)) continue;
    if (data.schoolId && data.schoolId !== SCHOOL_ID) continue;
    if (data.academicYearId && data.academicYearId !== ACADEMIC_YEAR_ID) continue;
    if (data.termId && data.termId !== TERM_ID) continue;

    startedKeys.add(assignmentKey(data));
  }

  const assignmentsSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationEvaluatorAssignments`)
    .get();

  const candidates = [];
  const skippedStarted = [];

  for (const doc of assignmentsSnap.docs) {
    const data = doc.data();

    if (!directorPlanIds.has(data.planId)) continue;
    if (data.schoolId !== SCHOOL_ID) continue;
    if (data.academicYearId !== ACADEMIC_YEAR_ID) continue;
    if (data.termId !== TERM_ID) continue;

    const evaluatorEmail = String(data.evaluatorEmail || "").toLowerCase();
    if (evaluatorEmail !== OLD_EVALUATOR_EMAIL) continue;

    if (startedKeys.has(assignmentKey(data))) {
      skippedStarted.push(data);
      continue;
    }

    candidates.push({
      doc,
      data,
    });
  }

  console.log("\nMatched assignments:");
  console.log({
    candidatesToTransfer: candidates.length,
    skippedBecauseAlreadyStarted: skippedStarted.length,
  });

  for (const item of candidates) {
    const data = item.data;

    console.log(
      DRY_RUN ? "[DRY_RUN TRANSFER]" : "[TRANSFER]",
      {
        planId: data.planId,
        cycleId: data.cycleId,
        targetPersonId: data.targetPersonId,
        targetRoleLabel: data.targetRoleLabel,
        from: OLD_EVALUATOR_EMAIL,
        to: NEW_EVALUATOR_EMAIL,
      }
    );
  }

  if (skippedStarted.length) {
    console.log("\nSkipped started assignments:");
    for (const data of skippedStarted) {
      console.log({
        planId: data.planId,
        cycleId: data.cycleId,
        targetPersonId: data.targetPersonId,
        targetRoleLabel: data.targetRoleLabel,
      });
    }
  }

  const policySnap = await db
    .collection(`orgs/${ORG_ID}/evaluatorPolicies`)
    .get();

  const policiesToUpdate = policySnap.docs.filter((doc) => {
    const data = doc.data();
    return directorPlanIds.has(data.planId);
  });

  console.log("\nEvaluator policies to update:", policiesToUpdate.length);

  if (DRY_RUN) {
    console.log("\n✅ Dry run only. No documents were changed.");
    console.log("To apply for real, run with DRY_RUN=false.");
    return;
  }

  let batch = db.batch();
  let writeCount = 0;

  for (const item of candidates) {
    const oldRef = item.doc.ref;
    const oldData = item.data;

    const newId = [
      oldData.planId,
      oldData.cycleId,
      oldData.targetPersonId,
      newEvaluator.id,
    ].join("-");

    const newRef = db.doc(
      `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${newId}`
    );

    batch.set(
      newRef,
      {
        ...oldData,
        id: newId,
        evaluatorPersonId: newEvaluator.id,
        evaluatorEmail: NEW_EVALUATOR_EMAIL,
        evaluatorDisplayName: newEvaluator.displayName || NEW_EVALUATOR_LABEL,
        evaluatorRoleKey: NEW_EVALUATOR_ROLE_KEY,
        evaluatorRoleLabel: NEW_EVALUATOR_LABEL,
        transferredFromEvaluatorPersonId: oldEvaluator.id,
        transferredFromEvaluatorEmail: OLD_EVALUATOR_EMAIL,
        transferredAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.delete(oldRef);

    writeCount += 2;

    if (writeCount >= 400) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
  }

  for (const doc of policiesToUpdate) {
    batch.set(
      doc.ref,
      {
        evaluatorRoleKey: NEW_EVALUATOR_ROLE_KEY,
        evaluatorLabel: NEW_EVALUATOR_LABEL,
        updatedAt: now,
      },
      { merge: true }
    );

    writeCount += 1;

    if (writeCount >= 400) {
      await batch.commit();
      batch = db.batch();
      writeCount = 0;
    }
  }

  if (writeCount > 0) {
    await batch.commit();
  }

  console.log("\n✅ Director evaluations transferred successfully.");
  console.log({
    transferredAssignments: candidates.length,
    updatedPolicies: policiesToUpdate.length,
    from: OLD_EVALUATOR_EMAIL,
    to: NEW_EVALUATOR_EMAIL,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to transfer director evaluations:");
  console.error(error);
  process.exit(1);
});