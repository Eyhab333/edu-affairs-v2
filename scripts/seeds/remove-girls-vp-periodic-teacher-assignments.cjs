/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  academicYearId: "ay-1448",
  termId: "term-1",
  targetPlanId: "mrb-girls-ay-1448-term-1-girls-vice-principal-periodic-teacher-evaluation",
  targetFrameworkId: "girls-vice-principal-periodic-teacher-evaluation-v1",
  adminPlanId: "mrb-girls-ay-1448-term-1-vice-principal-periodic-evaluation",
  evaluatorRoleKey: "GIRLS_VP",
};

const SCHOOL_ID_ALIASES = {
  manarGirls: "mrb-girls",
  manarBoysSayh: "mrb-boys-sayh",
  manarBoysFaleh: "mrb-boys-faleh",
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

function normalizeSchoolId(value) {
  const schoolId = asString(value);
  return SCHOOL_ID_ALIASES[schoolId] || schoolId;
}

function scopeMatches(data) {
  return (
    normalizeSchoolId(data.schoolId) === CONFIG.schoolId &&
    asString(data.academicYearId) === CONFIG.academicYearId &&
    asString(data.termId) === CONFIG.termId
  );
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function validatePlans(db, orgRoot) {
  const [targetPlan, adminPlan] = await Promise.all([
    readRequiredDoc(db, `${orgRoot}/evaluationPlans/${CONFIG.targetPlanId}`, "VP periodic teacher plan"),
    readRequiredDoc(db, `${orgRoot}/evaluationPlans/${CONFIG.adminPlanId}`, "VP ADMIN plan"),
  ]);
  const target = targetPlan.data();
  const adminPlanData = adminPlan.data();
  assert(
    scopeMatches(target) &&
      asString(target.planKind) === "PERIODIC" &&
      asString(target.targetKind) === "TEACHER" &&
      asString(target.frameworkId) === CONFIG.targetFrameworkId,
    `Target VP periodic teacher plan shape mismatch: ${targetPlan.ref.path}`,
  );
  assert(
    targetPlan.id !== adminPlan.id &&
      scopeMatches(adminPlanData) &&
      asString(adminPlanData.targetKind) === "ADMIN",
    `ADMIN VP plan validation failed: ${adminPlan.ref.path}`,
  );
  return { targetPlan, adminPlan };
}

function assignmentSummary(document) {
  const data = document.data();
  return {
    assignmentId: document.id,
    planId: asString(data.planId),
    rawSchoolId: asString(data.schoolId),
    normalizedSchoolId: normalizeSchoolId(data.schoolId),
    evaluatorPersonId: asString(data.evaluatorPersonId),
    evaluatorRoleKey: asString(data.evaluatorRoleKey),
    targetPersonId: asString(data.targetPersonId),
    cycleId: asString(data.cycleId),
    status: asString(data.status),
  };
}

function assignmentKey(data) {
  return [
    asString(data.planId),
    asString(data.cycleId),
    asString(data.targetPersonId),
    asString(data.evaluatorPersonId),
  ].join("|");
}

async function buildRemovalPlan(db, orgRoot) {
  const [assignmentsSnapshot, submissionsSnapshot] = await Promise.all([
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", CONFIG.targetPlanId).get(),
    db.collection(`${orgRoot}/evaluationSubmissions`).where("planId", "==", CONFIG.targetPlanId).get(),
  ]);
  const scopedAssignments = assignmentsSnapshot.docs.filter((document) => scopeMatches(document.data()));
  const discoveredVpPersonIds = [...new Set(scopedAssignments
    .filter((document) => asString(document.data().evaluatorRoleKey).toUpperCase() === CONFIG.evaluatorRoleKey)
    .map((document) => asString(document.data().evaluatorPersonId))
    .filter(Boolean))];
  const matchesVp = (document) => {
    const data = document.data();
    return (
      asString(data.evaluatorRoleKey).toUpperCase() === CONFIG.evaluatorRoleKey ||
      discoveredVpPersonIds.includes(asString(data.evaluatorPersonId))
    );
  };
  const activeAssignments = scopedAssignments.filter((document) => asString(document.data().status) === "ACTIVE" && matchesVp(document));
  const alreadyRemoved = scopedAssignments.filter((document) => asString(document.data().status) === "REMOVED" && matchesVp(document));
  const skipped = scopedAssignments
    .filter((document) => !matchesVp(document) || !["ACTIVE", "REMOVED"].includes(asString(document.data().status)))
    .map((document) => ({ assignment: document, reason: !matchesVp(document) ? "evaluator is not the discovered GIRLS_VP" : `unsupported status ${asString(document.data().status) || "(missing)"}` }));
  const submissionKeys = new Set(submissionsSnapshot.docs.map((document) => assignmentKey(document.data())));
  const submittedAssignments = activeAssignments.filter((document) => submissionKeys.has(assignmentKey(document.data())));
  submittedAssignments.forEach((assignment) => skipped.push({ assignment, reason: "submission exists" }));
  const removals = activeAssignments.filter((document) => !submissionKeys.has(assignmentKey(document.data())));

  const plannedWrites = removals.map((assignment) => ({
    path: assignment.ref.path,
    data: assignment.data(),
  }));
  const writesOutsideGirls = plannedWrites.filter((write) => normalizeSchoolId(write.data.schoolId) !== CONFIG.schoolId);
  const wrongPlanWrites = plannedWrites.filter((write) => asString(write.data.planId) !== CONFIG.targetPlanId);
  assert(writesOutsideGirls.length === 0, "Refusing planned writes outside normalized mrb-girls.");
  assert(wrongPlanWrites.length === 0, "Refusing planned writes for a plan other than the VP periodic teacher plan.");

  return {
    discoveredVpPersonIds,
    activeAssignments,
    alreadyRemoved,
    removals,
    skipped,
    writesOutsideGirls,
    wrongPlanWrites,
  };
}

function buildSummary(plans, removalPlan) {
  const safetyReasons = [];
  const skippedHistorical = removalPlan.skipped.filter((entry) => entry.reason === "submission exists");
  const skippedUnexpected = removalPlan.skipped.filter((entry) => entry.reason !== "submission exists");
  if (removalPlan.writesOutsideGirls.length > 0) safetyReasons.push(`${removalPlan.writesOutsideGirls.length} writes outside mrb-girls`);
  if (removalPlan.wrongPlanWrites.length > 0) safetyReasons.push(`${removalPlan.wrongPlanWrites.length} wrong-plan writes`);
  if (skippedHistorical.length > 0) safetyReasons.push(`${skippedHistorical.length} assignments have submissions`);
  if (skippedUnexpected.some((entry) => asString(entry.assignment.data().status) === "ACTIVE")) safetyReasons.push("active assignments did not match the VP evaluator criteria");

  return {
    targetPlan: { id: plans.targetPlan.id, title: asString(plans.targetPlan.data().title) },
    excludedAdminPlan: { id: plans.adminPlan.id, title: asString(plans.adminPlan.data().title), touched: false },
    discoveredVicePrincipalPersonIds: removalPlan.discoveredVpPersonIds,
    activeAssignmentsFound: removalPlan.activeAssignments.length,
    assignmentsToMarkRemoved: removalPlan.removals.map(assignmentSummary),
    alreadyRemovedAssignments: removalPlan.alreadyRemoved.map(assignmentSummary),
    skipped: removalPlan.skipped.map((entry) => ({ ...assignmentSummary(entry.assignment), reason: entry.reason })),
    plannedWritesOutsideMrbGirls: removalPlan.writesOutsideGirls.length,
    wrongPlanPlannedWrites: removalPlan.wrongPlanWrites.length,
    decision: safetyReasons.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
    reasons: safetyReasons,
    message: removalPlan.activeAssignments.length === 0 ? "No active matching VP periodic teacher assignments were found; no write is required." : null,
  };
}

async function applyRemovals(db, removals) {
  const now = Date.now();
  for (const group of chunk(removals, 400)) {
    const batch = db.batch();
    group.forEach((assignment) => {
      batch.update(assignment.ref, {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Manar Girls periodic vice-principal teacher evaluation removed from future work.",
        updatedAt: now,
      });
    });
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const plans = await validatePlans(db, orgRoot);
  const removalPlan = await buildRemovalPlan(db, orgRoot);
  const summary = buildSummary(plans, removalPlan);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(summary, { depth: null });
  if (summary.decision !== "SAFE TO APPLY") {
    console.log("No writes performed because the removal plan is not safe to apply.");
    process.exitCode = 1;
    return;
  }
  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to mark only the listed VP periodic teacher assignments REMOVED.");
    return;
  }

  await applyRemovals(db, removalPlan.removals);
  console.dir({ removedAssignments: removalPlan.removals.length, decision: "APPLIED" }, { depth: null });
}

main().catch((error) => {
  console.error("Girls VP periodic teacher assignment removal failed:");
  console.error(error);
  process.exitCode = 1;
});
