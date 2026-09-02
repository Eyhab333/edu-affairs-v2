/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-boys-faleh",
  academicYearId: "ay-1448",
  termId: "term-1",
  sourceEvaluatorEmail: "m.alateeq@qz.org.sa",
  targetEvaluatorEmail: "educational-agent-faleh@qz.org.sa",
  plans: [
    {
      key: "diagnostic",
      id: "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
      title: "التقييم التشخيصي للمعلمين بواسطة الوكيل التعليمي - منار الريادة بنين الفالح - الفصل الأول",
      frameworkId: "educational-vice-principal-diagnostic-teacher-evaluation-v1",
    },
    {
      key: "weekly",
      id: "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
      title: "تقييم الوكيل التعليمي الأسبوعي للمعلمين - منار الريادة بنين الفالح - الفصل الأول",
      frameworkId: "educational-vice-principal-weekly-teacher-evaluation-v1",
    },
  ],
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

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && ![
    "DISABLED",
    "ENDED",
    "INACTIVE",
    "REVOKED",
    "REMOVED",
  ].includes(status);
}

function membershipCoversSchool(data) {
  return (
    asString(data.schoolId) === CONFIG.schoolId ||
    asString(data.scopeId) === CONFIG.schoolId ||
    data.scopes?.schoolIds?.includes(CONFIG.schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function assignmentKey(data) {
  return [
    asString(data.planId),
    asString(data.cycleId),
    asString(data.targetPersonId),
    asString(data.evaluatorPersonId),
  ].join("|");
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

async function getAllInChunks(db, references) {
  const snapshots = [];
  for (const group of chunk(references, 400)) snapshots.push(...await db.getAll(...group));
  return snapshots;
}

async function resolveEvaluatorByEmail(db, orgRoot, email, label) {
  const users = await db.collection("users").where("email", "==", email).limit(2).get();
  const errors = [];
  if (users.empty) return { label, email, errors: [`No users document found for ${email}.`], resolved: null };
  if (users.size !== 1) return { label, email, errors: [`Expected exactly one users document for ${email}, found ${users.size}.`], resolved: null };

  const user = users.docs[0];
  const userData = user.data();
  const personId = asString(userData.personId);
  if (!personId) return { label, email, errors: [`users/${user.id} has no personId.`], resolved: null };
  const [person, membership] = await Promise.all([
    db.doc(`${orgRoot}/people/${personId}`).get(),
    db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`).get(),
  ]);
  const membershipData = membership.exists ? membership.data() : {};
  if (normalizeEmail(userData.email) !== email) errors.push(`Resolved email mismatch for ${email}.`);
  if (!person.exists) errors.push(`People document missing: ${orgRoot}/people/${personId}.`);
  if (!membership.exists) errors.push(`Org membership missing for ${email}.`);
  if (membership.exists && asString(membershipData.personId) !== personId) errors.push(`Membership personId mismatch for ${email}.`);
  if (membership.exists && !isActive(membershipData)) errors.push(`Membership is inactive for ${email}.`);

  return {
    label,
    email,
    errors,
    resolved: {
      uid: user.id,
      personId,
      displayName: asString(person.data()?.displayName || userData.displayName) || null,
      email,
      roleKey: asString(membershipData.roleKey || membershipData.role).toUpperCase() || null,
      membershipCoversFaleh: membership.exists && membershipCoversSchool(membershipData),
    },
  };
}

async function loadTargetPlans(db, orgRoot) {
  const entries = [];
  for (const plan of CONFIG.plans) {
    const snapshot = await db.doc(`${orgRoot}/evaluationPlans/${plan.id}`).get();
    const errors = [];
    if (!snapshot.exists) {
      errors.push("plan is missing");
      entries.push({ plan, snapshot, cycles: [], assignments: [], errors });
      continue;
    }
    const data = snapshot.data();
    if (asString(data.schoolId) !== CONFIG.schoolId) errors.push("schoolId mismatch");
    if (asString(data.academicYearId) !== CONFIG.academicYearId) errors.push("academicYearId mismatch");
    if (asString(data.termId) !== CONFIG.termId) errors.push("termId mismatch");
    if (asString(data.title) !== plan.title) errors.push(`title mismatch; expected ${plan.title}`);
    if (asString(data.targetKind).toUpperCase() !== "TEACHER") errors.push("targetKind must be TEACHER");
    if (asString(data.frameworkId) !== plan.frameworkId) errors.push(`frameworkId must be ${plan.frameworkId}`);
    if (asString(data.frameworkId).includes("educational-supervisor")) errors.push("educational-supervisor framework is not allowed");
    const [cycles, evaluatorAssignments] = await Promise.all([
      db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", plan.id).get(),
      db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", plan.id).get(),
    ]);
    const scopedCycles = cycles.docs.filter((document) => {
      const cycle = document.data();
      return asString(cycle.schoolId) === CONFIG.schoolId &&
        asString(cycle.academicYearId) === CONFIG.academicYearId &&
        asString(cycle.termId) === CONFIG.termId;
    });
    if (scopedCycles.length === 0) errors.push("no Faleh cycles found");
    const scopedAssignments = evaluatorAssignments.docs.filter((document) => {
      const assignment = document.data();
      return asString(assignment.schoolId) === CONFIG.schoolId &&
        asString(assignment.academicYearId) === CONFIG.academicYearId &&
        asString(assignment.termId) === CONFIG.termId;
    });
    entries.push({ plan, snapshot, cycles: scopedCycles, assignments: scopedAssignments, errors });
  }
  return entries;
}

function stripSourceMutableFields(data) {
  const {
    id,
    createdAt,
    updatedAt,
    removedAt,
    removalReason,
    replacementEvaluatorAssignmentId,
    migratedAt,
    migratedFromEvaluatorPersonId,
    evaluatorPersonId,
    evaluatorEmail,
    evaluatorRoleKey,
    evaluatorDisplayName,
    status,
    ...shape
  } = data;
  return shape;
}

function buildReplacement(source, targetEvaluator, evaluatorRoleKey) {
  const data = source.data();
  const weight = Number(data.weight);
  assert(Number.isFinite(weight) && weight > 0, `Source assignment has invalid weight: ${source.ref.path}`);
  const id = `${asString(data.cycleId)}-${asString(data.targetPersonId)}-${targetEvaluator.personId}`;
  return {
    id,
    path: source.ref.parent.doc(id).path,
    data: {
      ...stripSourceMutableFields(data),
      id,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: asString(data.planId),
      cycleId: asString(data.cycleId),
      targetPersonId: asString(data.targetPersonId),
      evaluatorPersonId: targetEvaluator.personId,
      evaluatorEmail: targetEvaluator.email,
      evaluatorRoleKey,
      ...(targetEvaluator.displayName ? { evaluatorDisplayName: targetEvaluator.displayName } : {}),
      weight,
      status: "ACTIVE",
    },
  };
}

function differingFields(current, desired) {
  return Object.entries(desired)
    .filter(([field, expected]) => JSON.stringify(current[field]) !== JSON.stringify(expected))
    .map(([field]) => field);
}

function countByPlan(entries, dataForEntry) {
  return entries.reduce((counts, entry) => {
    const planId = asString(dataForEntry(entry).planId) || "(missing)";
    counts[planId] = (counts[planId] || 0) + 1;
    return counts;
  }, {});
}

async function buildMovePlan(db, orgRoot, sourceEvaluator, targetEvaluator, planEntries) {
  const allowedPlanIds = new Set(CONFIG.plans.map((plan) => plan.id));
  const [sourceSnapshot, submissionsSnapshot, targetSnapshot] = await Promise.all([
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("evaluatorPersonId", "==", sourceEvaluator.personId).get(),
    db.collection(`${orgRoot}/evaluationSubmissions`).where("evaluatorPersonId", "==", sourceEvaluator.personId).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("evaluatorPersonId", "==", targetEvaluator.personId).get(),
  ]);
  const scopedSourceAssignments = sourceSnapshot.docs.filter((document) => {
    const data = document.data();
    return asString(data.schoolId) === CONFIG.schoolId &&
      asString(data.academicYearId) === CONFIG.academicYearId &&
      asString(data.termId) === CONFIG.termId &&
      allowedPlanIds.has(asString(data.planId));
  });
  const activeSources = scopedSourceAssignments.filter((document) => asString(document.data().status).toUpperCase() === "ACTIVE");
  const alreadyRemovedSources = scopedSourceAssignments.filter((document) => asString(document.data().status).toUpperCase() === "REMOVED");
  const unsupportedSources = scopedSourceAssignments.filter((document) => !["ACTIVE", "REMOVED"].includes(asString(document.data().status).toUpperCase()));
  const sourceRoleKeys = [...new Set(scopedSourceAssignments.map((document) => asString(document.data().evaluatorRoleKey)).filter(Boolean))];
  const targetRoleKeys = [...new Set(targetSnapshot.docs
    .filter((document) => {
      const data = document.data();
      return isActive(data) && asString(data.schoolId) === CONFIG.schoolId && allowedPlanIds.has(asString(data.planId));
    })
    .map((document) => asString(document.data().evaluatorRoleKey))
    .filter(Boolean))];
  const conflicts = [];
  if (sourceRoleKeys.length !== 1) conflicts.push({ type: "source", reason: "source evaluatorRoleKey is missing or inconsistent" });
  if (targetRoleKeys.length > 1) conflicts.push({ type: "target", reason: "existing Faleh-agent evaluatorRoleKey is inconsistent" });
  const evaluatorRoleKey = targetRoleKeys[0] || sourceRoleKeys[0] || "";
  if (targetEvaluator.roleKey && evaluatorRoleKey && targetEvaluator.roleKey !== evaluatorRoleKey) conflicts.push({ type: "target", reason: `target membership roleKey ${targetEvaluator.roleKey} differs from evaluator assignment roleKey ${evaluatorRoleKey}` });

  const targetAssignmentRefs = scopedSourceAssignments.map((source) => {
    const data = source.data();
    return db.doc(`${orgRoot}/evaluationTargetAssignments/${asString(data.planId)}-target-${asString(data.targetPersonId)}`);
  });
  const targetAssignments = await getAllInChunks(db, targetAssignmentRefs);
  const targetAssignmentByPath = new Map(targetAssignments.map((snapshot) => [snapshot.ref.path, snapshot]));
  const submissionKeys = new Set(submissionsSnapshot.docs.map((document) => assignmentKey(document.data())));
  const eligibleSources = [];
  const skipped = [];

  for (const source of activeSources) {
    const data = source.data();
    const targetAssignmentPath = `${orgRoot}/evaluationTargetAssignments/${asString(data.planId)}-target-${asString(data.targetPersonId)}`;
    const targetAssignment = targetAssignmentByPath.get(targetAssignmentPath);
    if (submissionKeys.has(assignmentKey(data))) {
      conflicts.push({ type: "source", path: source.ref.path, reason: "submission exists; historical assignment will not be removed" });
    } else if (!targetAssignment?.exists) {
      conflicts.push({ type: "source", path: source.ref.path, reason: "matching Faleh targetAssignment is missing" });
    } else {
      const target = targetAssignment.data();
      const validTarget = isActive(target) && asString(target.schoolId) === CONFIG.schoolId && asString(target.planId) === asString(data.planId) && asString(target.targetPersonId) === asString(data.targetPersonId);
      if (!validTarget) conflicts.push({ type: "source", path: source.ref.path, reason: "matching targetAssignment is not an active Faleh target" });
      else eligibleSources.push(source);
    }
  }
  unsupportedSources.forEach((source) => conflicts.push({ type: "source", path: source.ref.path, reason: `unsupported source status ${asString(source.data().status) || "(missing)"}` }));

  const replacements = new Map();
  for (const source of [...eligibleSources, ...alreadyRemovedSources]) {
    const replacement = buildReplacement(source, targetEvaluator, evaluatorRoleKey);
    if ([...replacements.values()].some((entry) => entry.id === replacement.id)) conflicts.push({ type: "replacement", path: replacement.path, reason: "duplicate deterministic replacement ID" });
    replacements.set(source.ref.path, replacement);
  }
  const replacementEntries = [...replacements.entries()];
  const replacementSnapshots = await getAllInChunks(db, replacementEntries.map(([, replacement]) => db.doc(replacement.path)));
  const creates = [];
  const removals = [];
  const existingReplacements = [];
  const missingReplacementForRemoved = [];

  replacementSnapshots.forEach((snapshot, index) => {
    const [sourcePath, replacement] = replacementEntries[index];
    const source = [...eligibleSources, ...alreadyRemovedSources].find((document) => document.ref.path === sourcePath);
    if (!snapshot.exists) {
      if (asString(source.data().status).toUpperCase() === "ACTIVE") creates.push({ source, replacement });
      else {
        missingReplacementForRemoved.push({ source, replacement });
        conflicts.push({ type: "replacement", path: replacement.path, reason: "old assignment is REMOVED but its active replacement is missing" });
      }
      return;
    }
    const fields = differingFields(snapshot.data(), replacement.data);
    if (!isActive(snapshot.data()) || fields.length > 0) {
      conflicts.push({ type: "replacement", path: snapshot.ref.path, reason: !isActive(snapshot.data()) ? "replacement exists but is not ACTIVE" : "replacement exists but conflicts with the expected copied assignment", fields });
      return;
    }
    existingReplacements.push({ source, replacement });
  });

  const targetAssignmentsByPlan = new Map(planEntries.map((entry) => [entry.plan.id, entry]));
  for (const source of eligibleSources) {
    const replacement = replacements.get(source.ref.path);
    const replacementConflict = conflicts.some((conflict) => conflict.path === replacement.path || conflict.path === source.ref.path);
    if (replacementConflict) continue;
    const planEntry = targetAssignmentsByPlan.get(asString(source.data().planId));
    const otherActive = planEntry ? planEntry.assignments.find((assignment) => {
      const data = assignment.data();
      return isActive(data) && asString(data.cycleId) === asString(source.data().cycleId) && asString(data.targetPersonId) === asString(source.data().targetPersonId) && ![sourceEvaluator.personId, targetEvaluator.personId].includes(asString(data.evaluatorPersonId));
    }) : null;
    if (otherActive) {
      conflicts.push({ type: "source", path: source.ref.path, reason: "another ACTIVE evaluator exists for the same Faleh plan/cycle/target", existingAssignmentId: otherActive.id, existingEvaluatorPersonId: asString(otherActive.data().evaluatorPersonId) });
      continue;
    }
    removals.push(source);
  }

  const plannedWrites = [
    ...creates.map((entry) => ({ type: "create replacement", path: entry.replacement.path, data: entry.replacement.data })),
    ...removals.map((source) => ({ type: "remove old Alateeq assignment", path: source.ref.path, data: source.data() })),
  ];
  const outsideFaleh = plannedWrites.filter((write) => asString(write.data.schoolId) !== CONFIG.schoolId);
  const touchingSayh = plannedWrites.filter((write) => asString(write.data.schoolId) === "mrb-boys-sayh");
  const touchingGirls = plannedWrites.filter((write) => asString(write.data.schoolId) === "mrb-girls");
  const touchingKindergarten = plannedWrites.filter((write) => /kindergarten|kg/i.test(asString(write.data.schoolId)));
  const nonTargetPlans = plannedWrites.filter((write) => !allowedPlanIds.has(asString(write.data.planId)));
  const disallowedPlans = plannedWrites.filter((write) => !allowedPlanIds.has(asString(write.data.planId)) && /(educational-supervisor|vice-principal|principal|admin)/.test(asString(write.data.planId)));
  const missingCycles = plannedWrites.filter((write) => !targetAssignmentsByPlan.get(asString(write.data.planId))?.cycles.some((cycle) => cycle.id === asString(write.data.cycleId)));
  const targetOutsideFaleh = plannedWrites.filter((write) => !targetAssignmentByPath.get(`${orgRoot}/evaluationTargetAssignments/${asString(write.data.planId)}-target-${asString(write.data.targetPersonId)}`)?.exists);

  return {
    scopedSourceAssignments,
    activeSources,
    alreadyRemovedSources,
    creates,
    removals,
    existingReplacements,
    conflicts,
    skipped,
    missingReplacementForRemoved,
    plannedWrites,
    outsideFaleh,
    touchingSayh,
    touchingGirls,
    touchingKindergarten,
    nonTargetPlans,
    disallowedPlans,
    missingCycles,
    targetOutsideFaleh,
  };
}

function buildReport(sourceEvaluator, targetEvaluator, planEntries, movePlan) {
  const errors = [
    ...sourceEvaluator.errors,
    ...targetEvaluator.errors,
    ...planEntries.flatMap((entry) => entry.errors.map((error) => `${entry.plan.id}: ${error}`)),
  ];
  if (!targetEvaluator.resolved?.membershipCoversFaleh) errors.push("Target evaluator does not have mrb-boys-faleh access.");
  if (movePlan.scopedSourceAssignments.length === 0) errors.push("No matching Alateeq Faleh assignments were found under the two allowed plans.");
  if (movePlan.conflicts.length > 0) errors.push(`${movePlan.conflicts.length} conflict(s) must be resolved before apply.`);
  const safety = {
    plannedWritesOutsideMrbBoysFaleh: movePlan.outsideFaleh.length,
    plannedWritesTouchingMrbBoysSayh: movePlan.touchingSayh.length,
    plannedWritesTouchingMrbGirls: movePlan.touchingGirls.length,
    plannedWritesTouchingKindergarten: movePlan.touchingKindergarten.length,
    plannedWritesOutsideAllowedPlans: movePlan.nonTargetPlans.length,
    plannedWritesTouchingDisallowedPlanTypes: movePlan.disallowedPlans.length,
    plannedWritesWithMissingCycle: movePlan.missingCycles.length,
    plannedWritesTargetingOutsideFaleh: movePlan.targetOutsideFaleh.length,
  };
  if (Object.values(safety).some((count) => count > 0)) errors.push("One or more planned writes violate the Faleh-only safety boundary.");

  return {
    mode: APPLY ? "APPLY" : "PREVIEW",
    sourceEvaluator: sourceEvaluator.resolved || { email: CONFIG.sourceEvaluatorEmail },
    targetEvaluator: targetEvaluator.resolved || { email: CONFIG.targetEvaluatorEmail },
    includedSchool: CONFIG.schoolId,
    falehPlansIncluded: planEntries.map((entry) => ({ planId: entry.plan.id, title: entry.plan.title, cycles: entry.cycles.map((cycle) => cycle.id), errors: entry.errors })),
    sourceAlateeqAssignmentsFoundByPlan: countByPlan(movePlan.activeSources, (source) => source.data()),
    replacementAssignmentsToCreateByPlan: countByPlan(movePlan.creates, (entry) => entry.replacement.data),
    oldAlateeqAssignmentsToMarkRemovedByPlan: countByPlan(movePlan.removals, (source) => source.data()),
    alreadyExistingReplacementAssignmentsByPlan: countByPlan(movePlan.existingReplacements, (entry) => entry.replacement.data),
    alreadyRemovedOldAlateeqAssignmentsByPlan: countByPlan(movePlan.alreadyRemovedSources, (source) => source.data()),
    conflicts: movePlan.conflicts,
    skipped: movePlan.skipped,
    safety,
    counts: {
      replacementAssignmentsToCreate: movePlan.creates.length,
      oldAlateeqAssignmentsToMarkRemoved: movePlan.removals.length,
      alreadyExistingReplacementAssignments: movePlan.existingReplacements.length,
      alreadyRemovedOldAlateeqAssignments: movePlan.alreadyRemovedSources.length,
      conflicts: movePlan.conflicts.length,
    },
    validationErrors: errors,
    decision: errors.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
  };
}

async function applyMovePlan(db, movePlan, sourceEvaluator, targetEvaluator) {
  const actions = [
    ...movePlan.creates.map((entry) => ({ type: "create", ...entry })),
    ...movePlan.removals.map((source) => ({ type: "remove", source })),
  ];
  const now = Date.now();
  for (const group of chunk(actions, 350)) {
    const batch = db.batch();
    for (const action of group) {
      if (action.type === "create") {
        batch.create(db.doc(action.replacement.path), {
          ...action.replacement.data,
          createdAt: now,
          updatedAt: now,
          migratedAt: now,
          migratedFromEvaluatorPersonId: sourceEvaluator.personId,
        });
      } else {
        batch.update(action.source.ref, {
          status: "REMOVED",
          removedAt: now,
          removalReason: "Moved from Mohammad Alateeq to the Faleh educational agent.",
          replacementEvaluatorAssignmentId: `${asString(action.source.data().cycleId)}-${asString(action.source.data().targetPersonId)}-${targetEvaluator.personId}`,
          updatedAt: now,
        });
      }
    }
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [sourceEvaluator, targetEvaluator, planEntries] = await Promise.all([
    resolveEvaluatorByEmail(db, orgRoot, CONFIG.sourceEvaluatorEmail, "source evaluator"),
    resolveEvaluatorByEmail(db, orgRoot, CONFIG.targetEvaluatorEmail, "target evaluator"),
    loadTargetPlans(db, orgRoot),
  ]);
  const movePlan = sourceEvaluator.resolved && targetEvaluator.resolved
    ? await buildMovePlan(db, orgRoot, sourceEvaluator.resolved, targetEvaluator.resolved, planEntries)
    : {
      scopedSourceAssignments: [], activeSources: [], alreadyRemovedSources: [], creates: [], removals: [], existingReplacements: [], conflicts: [], skipped: [], plannedWrites: [], outsideFaleh: [], touchingSayh: [], touchingGirls: [], touchingKindergarten: [], nonTargetPlans: [], disallowedPlans: [], missingCycles: [], targetOutsideFaleh: [],
    };
  const report = buildReport(sourceEvaluator, targetEvaluator, planEntries, movePlan);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(report, { depth: null, colors: process.stdout.isTTY });
  if (report.decision !== "SAFE TO APPLY") {
    console.log("NOT APPLIED: resolve the validation errors or conflicts first.");
    process.exitCode = 1;
    return;
  }
  if (!APPLY) {
    console.log("No Firestore writes performed. Re-run with --apply only after reviewing this report.");
    return;
  }
  await applyMovePlan(db, movePlan, sourceEvaluator.resolved, targetEvaluator.resolved);
  console.dir({
    decision: "APPLIED",
    createdReplacementAssignments: movePlan.creates.length,
    alreadyExistingReplacementAssignments: movePlan.existingReplacements.length,
    removedOldAlateeqAssignments: movePlan.removals.length,
    conflicts: 0,
  }, { depth: null, colors: process.stdout.isTTY });
}

main().catch((error) => {
  console.error("Faleh educational-agent assignment move failed:");
  console.error(error);
  process.exitCode = 1;
});
