/* eslint-disable no-console */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const APPLY = process.argv.includes("--apply");
const CONFIG = {
  orgId: "takween",
  email: "k.alsadle@qz.org.sa",
  fromSchoolId: "mrb-boys-faleh",
  toSchoolId: "mrb-boys-sayh",
};

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`service-account.json was not found: ${serviceAccountPath}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function dataWithId(document) {
  return {
    id: document.id,
    path: document.ref.path,
    ref: document.ref,
    data: document.data() || {},
  };
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.path, document])).values(),
  );
}

function mapFalehIdToSayh(value, label, conflicts) {
  const source = text(value);
  if (!source.includes(CONFIG.fromSchoolId)) {
    conflicts.push(`${label} does not contain ${CONFIG.fromSchoolId}: ${source || "(empty)"}.`);
    return "";
  }

  const mapped = source.replace(CONFIG.fromSchoolId, CONFIG.toSchoolId);
  if (!mapped || mapped.includes(CONFIG.fromSchoolId)) {
    conflicts.push(`${label} could not be mapped safely: ${source}.`);
    return "";
  }

  return mapped;
}

function assignmentIsActive(data) {
  return text(data.status).toUpperCase() === "ACTIVE";
}

function statusOf(data) {
  return text(data.status).toUpperCase() || "(missing)";
}

function queryByField(db, collectionPath, field, value) {
  return db
    .collection(collectionPath)
    .where(field, "==", value)
    .get()
    .then((snapshot) => snapshot.docs.map(dataWithId));
}

function groupCounts(items, keyBuilder) {
  return Array.from(
    items.reduce((groups, item) => {
      const key = keyBuilder(item);
      groups.set(key, (groups.get(key) || 0) + 1);
      return groups;
    }, new Map()).entries(),
  )
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function resolveTeacher(db) {
  const authUser = await admin.auth().getUserByEmail(CONFIG.email);
  assert(
    normalizeEmail(authUser.email) === CONFIG.email,
    "Resolved Firebase Auth user email does not match the configured teacher email.",
  );

  const [userSnapshot, userMatches] = await Promise.all([
    db.doc(`users/${authUser.uid}`).get(),
    queryByField(db, "users", "email", CONFIG.email),
  ]);

  assert(userSnapshot.exists, `User document is missing: users/${authUser.uid}.`);
  assert(
    userMatches.length === 1 && userMatches[0].id === authUser.uid,
    "User email resolution is missing or ambiguous.",
  );

  const user = dataWithId(userSnapshot);
  const personId = text(user.data.personId);
  assert(personId, "Resolved user document has no personId.");
  assert(
    normalizeEmail(user.data.email) === CONFIG.email,
    "User document email does not match the configured teacher email.",
  );

  const [personSnapshot, personMatches] = await Promise.all([
    db.doc(`orgs/${CONFIG.orgId}/people/${personId}`).get(),
    queryByField(db, `orgs/${CONFIG.orgId}/people`, "email", CONFIG.email),
  ]);

  assert(personSnapshot.exists, `Person document is missing: ${personId}.`);
  assert(
    personMatches.length === 1 && personMatches[0].id === personId,
    "Person email resolution is missing or ambiguous.",
  );

  const person = dataWithId(personSnapshot);
  assert(
    normalizeEmail(person.data.email) === CONFIG.email,
    "Person document email does not match the configured teacher email.",
  );

  return {
    uid: authUser.uid,
    personId,
    email: CONFIG.email,
    displayName: text(person.data.displayName) || text(user.data.displayName),
    user,
    person,
  };
}

function verifyMappedPlan({ oldPlan, newPlan, oldPlanId, newPlanId, conflicts }) {
  if (!newPlan) {
    conflicts.push(`Mapped Sayh plan is missing: ${newPlanId}.`);
    return;
  }

  if (text(newPlan.data.schoolId) !== CONFIG.toSchoolId) {
    conflicts.push(`Mapped Sayh plan has an unexpected schoolId: ${newPlanId}.`);
  }

  for (const field of ["academicYearId", "termId", "targetKind", "planKind"]) {
    const oldValue = text(oldPlan.data[field]);
    const newValue = text(newPlan.data[field]);
    if (oldValue && newValue && oldValue !== newValue) {
      conflicts.push(`Mapped Sayh plan ${newPlanId} has a different ${field} than ${oldPlanId}.`);
    }
  }

  const oldFrameworkId = text(oldPlan.data.frameworkId);
  const newFrameworkId = text(newPlan.data.frameworkId);
  if (oldFrameworkId && newFrameworkId && oldFrameworkId !== newFrameworkId) {
    const oldFrameworkKind = text(oldPlan.data.frameworkKind);
    const newFrameworkKind = text(newPlan.data.frameworkKind);
    if (!oldFrameworkKind || !newFrameworkKind || oldFrameworkKind !== newFrameworkKind) {
      conflicts.push(`Mapped Sayh plan ${newPlanId} has no provably equivalent framework to ${oldPlanId}.`);
    }
  }
}

function verifyMappedCycle({ oldCycle, newCycle, oldCycleId, newCycleId, mappedPlanId, conflicts }) {
  if (!newCycle) {
    conflicts.push(`Mapped Sayh cycle is missing: ${newCycleId}.`);
    return;
  }

  if (text(newCycle.data.planId) !== mappedPlanId) {
    conflicts.push(`Mapped Sayh cycle does not belong to ${mappedPlanId}: ${newCycleId}.`);
  }
  if (text(newCycle.data.schoolId) && text(newCycle.data.schoolId) !== CONFIG.toSchoolId) {
    conflicts.push(`Mapped Sayh cycle has an unexpected schoolId: ${newCycleId}.`);
  }
  for (const field of ["academicYearId", "termId"]) {
    const oldValue = text(oldCycle.data[field]);
    const newValue = text(newCycle.data[field]);
    if (oldValue && newValue && oldValue !== newValue) {
      conflicts.push(`Mapped Sayh cycle ${newCycleId} has a different ${field} than ${oldCycleId}.`);
    }
  }
}

function buildTargetAssignment({ teacher, mappedPlan, sourceTarget, now, conflicts }) {
  const targetKind = text(mappedPlan.data.targetKind) || text(sourceTarget?.data.targetKind);
  const targetRoleKey = text(mappedPlan.data.targetRoleKey) || text(sourceTarget?.data.targetRoleKey);

  if (!targetKind) {
    conflicts.push(`Cannot create Sayh target assignment for ${mappedPlan.id}: targetKind is missing.`);
    return null;
  }

  const id = `${mappedPlan.id}-target-${teacher.personId}`;
  return {
    id,
    orgId: CONFIG.orgId,
    schoolId: CONFIG.toSchoolId,
    academicYearId: text(mappedPlan.data.academicYearId),
    termId: text(mappedPlan.data.termId),
    planId: mappedPlan.id,
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    ...(targetRoleKey ? { targetRoleKey } : {}),
    targetKind,
    status: "ACTIVE",
    assignedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function evaluatorKey(item) {
  return [
    text(item.evaluatorPersonId),
    text(item.evaluatorRoleKey),
    String(item.weight ?? ""),
  ].join("\u001f");
}

function inferSayhEvaluators({ candidates, oldAssignment, mappedPlanId, mappedCycleId, conflicts }) {
  const oldRoleKey = text(oldAssignment.data.evaluatorRoleKey);
  const eligible = candidates.filter((item) => {
    const data = item.data;
    return (
      assignmentIsActive(data) &&
      text(data.schoolId) === CONFIG.toSchoolId &&
      text(data.planId) === mappedPlanId &&
      text(data.cycleId) === mappedCycleId &&
      (!oldRoleKey || text(data.evaluatorRoleKey) === oldRoleKey)
    );
  });

  const inferred = Array.from(
    new Map(
      eligible
        .filter((item) => text(item.data.evaluatorPersonId))
        .map((item) => [evaluatorKey(item.data), item.data]),
    ).values(),
  );

  if (inferred.length === 0) {
    conflicts.push(
      `Cannot infer a Sayh evaluator for ${mappedPlanId}/${mappedCycleId}/${oldRoleKey || "(no role key)"}.`,
    );
    return {
      evaluators: [],
      multiplicity: {
        oldAssignmentId: oldAssignment.id,
        planId: mappedPlanId,
        cycleId: mappedCycleId,
        evaluatorRoleKey: oldRoleKey,
        inferredCount: 0,
        conventionProven: false,
        reason: "No matching ACTIVE Sayh evaluator could be inferred.",
      },
    };
  }

  const duplicatePeopleWithDifferentConventions = new Map();
  for (const item of inferred) {
    const personId = text(item.evaluatorPersonId);
    const existing = duplicatePeopleWithDifferentConventions.get(personId) || new Set();
    existing.add(`${text(item.evaluatorRoleKey)}\u001f${String(item.weight ?? "")}`);
    duplicatePeopleWithDifferentConventions.set(personId, existing);
  }
  for (const [personId, conventions] of duplicatePeopleWithDifferentConventions) {
    if (conventions.size > 1) {
      conflicts.push(`Sayh evaluator ${personId} has conflicting role/weight conventions for ${mappedPlanId}/${mappedCycleId}.`);
    }
  }

  const inferredKeys = new Set(inferred.map(evaluatorKey));
  const targetConventions = new Map();
  for (const item of eligible) {
    const targetPersonId = text(item.data.targetPersonId);
    if (!targetPersonId) continue;
    const keys = targetConventions.get(targetPersonId) || new Set();
    keys.add(evaluatorKey(item.data));
    targetConventions.set(targetPersonId, keys);
  }

  const sameConventionTargets = Array.from(targetConventions.values()).filter((keys) =>
    keys.size === inferredKeys.size && Array.from(keys).every((key) => inferredKeys.has(key)),
  ).length;
  const conventionProven =
    inferred.length === 1 ||
    (sameConventionTargets >= 2 && sameConventionTargets === targetConventions.size);

  if (inferred.length > 1 && !conventionProven) {
    conflicts.push(
      `Multiple Sayh evaluators were inferred for ${mappedPlanId}/${mappedCycleId}/${oldRoleKey || "(no role key)"}, but a consistent multi-evaluator convention was not proven.`,
    );
  }

  return {
    evaluators: conventionProven ? inferred : [],
    multiplicity: {
      oldAssignmentId: oldAssignment.id,
      oldPlanId: text(oldAssignment.data.planId),
      oldCycleId: text(oldAssignment.data.cycleId),
      oldEvaluatorRoleKey: oldRoleKey,
      oldEvaluatorPersonId: text(oldAssignment.data.evaluatorPersonId),
      planId: mappedPlanId,
      cycleId: mappedCycleId,
      inferredCount: inferred.length,
      inferredEvaluators: inferred.map((item) => ({
        evaluatorPersonId: text(item.evaluatorPersonId),
        evaluatorRoleKey: text(item.evaluatorRoleKey),
        weight: item.weight,
      })),
      sameConventionTargets,
      totalConventionTargets: targetConventions.size,
      conventionProven,
      reason: conventionProven
        ? inferred.length > 1
          ? "Existing Sayh targets consistently use this multi-evaluator convention."
          : "One-to-one Sayh evaluator replacement inferred."
        : "Multiple evaluators were not proven to be the standard Sayh convention.",
    },
  };
}

function activeTargetForPlan(records, planId) {
  return records.filter(
    (item) => text(item.data.planId) === planId && assignmentIsActive(item.data),
  );
}

function nonActiveTargetForPlan(records, planId) {
  return records.filter(
    (item) => text(item.data.planId) === planId && !assignmentIsActive(item.data),
  );
}

function evaluatorConventionMatches(data, evaluator) {
  if (text(data.evaluatorPersonId) !== text(evaluator.evaluatorPersonId)) return false;
  const expectedRoleKey = text(evaluator.evaluatorRoleKey);
  if (expectedRoleKey && text(data.evaluatorRoleKey) !== expectedRoleKey) return false;
  if (evaluator.weight !== undefined && data.weight !== undefined && String(data.weight) !== String(evaluator.weight)) {
    return false;
  }
  return true;
}

function evaluatorAssignmentsForPersonInContext(records, planId, cycleId, evaluator) {
  return records.filter(
    (item) =>
      text(item.data.planId) === planId &&
      text(item.data.cycleId) === cycleId &&
      text(item.data.evaluatorPersonId) === text(evaluator.evaluatorPersonId),
  );
}

function activeEvaluatorForContext(records, planId, cycleId, evaluator) {
  return evaluatorAssignmentsForPersonInContext(records, planId, cycleId, evaluator).filter(
    (item) => assignmentIsActive(item.data) && evaluatorConventionMatches(item.data, evaluator),
  );
}

function nonActiveEvaluatorForContext(records, planId, cycleId, evaluator) {
  return evaluatorAssignmentsForPersonInContext(records, planId, cycleId, evaluator).filter(
    (item) => !assignmentIsActive(item.data),
  );
}

function buildEvaluatorAssignment({ teacher, mappedPlan, mappedCycle, evaluator, now }) {
  const id = `${mappedCycle.id}-${teacher.personId}-${text(evaluator.evaluatorPersonId)}`;
  return {
    id,
    orgId: CONFIG.orgId,
    schoolId: CONFIG.toSchoolId,
    academicYearId: text(mappedCycle.data.academicYearId) || text(mappedPlan.data.academicYearId),
    termId: text(mappedCycle.data.termId) || text(mappedPlan.data.termId),
    planId: mappedPlan.id,
    cycleId: mappedCycle.id,
    targetPersonId: teacher.personId,
    evaluatorPersonId: text(evaluator.evaluatorPersonId),
    ...(text(evaluator.evaluatorEmail) ? { evaluatorEmail: text(evaluator.evaluatorEmail) } : {}),
    ...(text(evaluator.evaluatorRoleKey) ? { evaluatorRoleKey: text(evaluator.evaluatorRoleKey) } : {}),
    weight: evaluator.weight,
    sourceType: text(evaluator.sourceType) || "MANUAL",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

function actionRow({
  action,
  collection,
  document,
  sourceData,
  data,
  reason,
  mappedPlanId = "",
  mappedCycleId = "",
  mappedPlanVerified = false,
  mappedCycleVerified = false,
  inferredEvaluator = false,
  replacementConfirmed = false,
}) {
  return {
    action,
    collection,
    path: document.path,
    id: document.id,
    sourceData,
    sourceSchoolId: text(sourceData.schoolId),
    sourceTargetPersonId: text(sourceData.targetPersonId),
    sourcePlanId: text(sourceData.planId),
    sourceCycleId: text(sourceData.cycleId),
    sourceStatus: statusOf(sourceData),
    mappedPlanId,
    mappedCycleId,
    mappedPlanVerified,
    mappedCycleVerified,
    inferredEvaluator,
    replacementConfirmed,
    data,
    reason,
  };
}

function validateSafety(plan) {
  const violations = [];
  const counters = {
    totalWrites: plan.writes.length,
    validSayhCreations: 0,
    validFalehRemovals: 0,
    createsInFaleh: 0,
    removesInSayh: 0,
    outsideTransferSchools: 0,
    wrongTeacher: 0,
    girlsTouches: 0,
    kindergartenTouches: 0,
    missingMappedPlan: 0,
    missingMappedCycle: 0,
    uninferredEvaluator: 0,
    unconfirmedReplacement: 0,
    invalidSourceStatus: 0,
    duplicateWrite: 0,
    forbiddenCollection: 0,
  };
  const seenWrites = new Set();

  for (const action of plan.writes) {
    const isCreate = action.action === "CREATE";
    const isRemove = action.action === "REMOVE";
    const source = action.sourceData || {};
    const schoolId = text(source.schoolId);
    const targetPersonId = text(source.targetPersonId);
    const planId = text(source.planId);
    const cycleId = text(source.cycleId);
    const sourceStatus = statusOf(source);
    const allowedCollection = [
      "evaluationTargetAssignments",
      "evaluationEvaluatorAssignments",
    ].includes(action.collection);
    const writeKey = `${action.action}\u001f${action.path}`;

    if (seenWrites.has(writeKey)) {
      counters.duplicateWrite += 1;
      violations.push(`Duplicate planned write: ${action.path}.`);
    }
    seenWrites.add(writeKey);

    if (!allowedCollection) {
      counters.forbiddenCollection += 1;
      violations.push(`Forbidden collection in write plan: ${action.collection}.`);
    }
    if (!isCreate && !isRemove) {
      violations.push(`Unsupported write action: ${action.action || "(missing)"} at ${action.path}.`);
    }
    if (schoolId.includes("mrb-girls")) {
      counters.girlsTouches += 1;
      violations.push(`Write touches a girls school: ${action.path}.`);
    }
    if (schoolId.includes("kindergarten") || schoolId.includes("-kg") || schoolId.includes("kg-")) {
      counters.kindergartenTouches += 1;
      violations.push(`Write touches kindergarten: ${action.path}.`);
    }
    if (![CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(schoolId)) {
      counters.outsideTransferSchools += 1;
      violations.push(`Write outside transfer schools according to its source data: ${action.path}.`);
    }
    if (targetPersonId !== plan.teacher.personId) {
      counters.wrongTeacher += 1;
      violations.push(`Write targets another person according to its source data: ${action.path}.`);
    }
    if (!planId) {
      counters.missingMappedPlan += 1;
      violations.push(`Write has no planId in its source data: ${action.path}.`);
    }

    if (isCreate) {
      if (schoolId === CONFIG.fromSchoolId) counters.createsInFaleh += 1;
      if (schoolId !== CONFIG.toSchoolId) {
        violations.push(`Creation is not scoped to Sayh according to its payload data: ${action.path}.`);
      }
      if (sourceStatus !== "ACTIVE") {
        counters.invalidSourceStatus += 1;
        violations.push(`Sayh creation is not ACTIVE: ${action.path}.`);
      }
      if (!action.mappedPlanVerified || !text(action.mappedPlanId)) {
        counters.missingMappedPlan += 1;
        violations.push(`Sayh creation has no verified mapped plan: ${action.path}.`);
      }
      if (action.collection === "evaluationEvaluatorAssignments") {
        if (!cycleId || !action.mappedCycleVerified || !text(action.mappedCycleId)) {
          counters.missingMappedCycle += 1;
          violations.push(`Sayh evaluator creation has no verified mapped cycle: ${action.path}.`);
        }
        if (!action.inferredEvaluator) {
          counters.uninferredEvaluator += 1;
          violations.push(`Sayh evaluator creation has no proven Sayh evaluator: ${action.path}.`);
        }
      }
      if (schoolId === CONFIG.toSchoolId && targetPersonId === plan.teacher.personId && sourceStatus === "ACTIVE") {
        counters.validSayhCreations += 1;
      }
    }

    if (isRemove) {
      if (schoolId === CONFIG.toSchoolId) counters.removesInSayh += 1;
      if (schoolId !== CONFIG.fromSchoolId) {
        violations.push(`Removal is not scoped to Faleh according to its source document data: ${action.path}.`);
      }
      if (sourceStatus !== "ACTIVE") {
        counters.invalidSourceStatus += 1;
        violations.push(`Faleh removal source is not currently ACTIVE: ${action.path}.`);
      }
      if (text(action.data && action.data.status).toUpperCase() !== "REMOVED") {
        violations.push(`Faleh removal does not set status REMOVED: ${action.path}.`);
      }
      if (!action.replacementConfirmed) {
        counters.unconfirmedReplacement += 1;
        violations.push(`Faleh removal has no confirmed Sayh replacement: ${action.path}.`);
      }
      if (!action.mappedPlanVerified || !text(action.mappedPlanId)) {
        counters.missingMappedPlan += 1;
        violations.push(`Faleh removal has no verified mapped Sayh plan: ${action.path}.`);
      }
      if (action.collection === "evaluationEvaluatorAssignments") {
        if (!cycleId || !action.mappedCycleVerified || !text(action.mappedCycleId)) {
          counters.missingMappedCycle += 1;
          violations.push(`Faleh evaluator removal has no verified mapped Sayh cycle: ${action.path}.`);
        }
        if (!action.inferredEvaluator) {
          counters.uninferredEvaluator += 1;
          violations.push(`Faleh evaluator removal has no proven Sayh evaluator replacement: ${action.path}.`);
        }
      }
      if (schoolId === CONFIG.fromSchoolId && targetPersonId === plan.teacher.personId && sourceStatus === "ACTIVE" && action.replacementConfirmed) {
        counters.validFalehRemovals += 1;
      }
    }
  }

  return { counters, violations };
}

function conflictReason(message) {
  const value = text(message);
  const prefixes = [
    ["Cannot infer a Sayh evaluator", "SAYH_EVALUATOR_NOT_INFERRED"],
    ["Multiple Sayh evaluators were inferred", "MULTI_EVALUATOR_CONVENTION_NOT_PROVEN"],
    ["Sayh evaluator creation surplus", "UNEXPLAINED_EVALUATOR_CREATION_SURPLUS"],
    ["Mapped Sayh plan", "MAPPED_PLAN_MISMATCH"],
    ["Mapped Sayh cycle", "MAPPED_CYCLE_MISMATCH"],
    ["No verified Sayh plan", "MAPPED_PLAN_UNAVAILABLE"],
    ["Sayh target assignment already exists but is not ACTIVE", "SAYH_TARGET_NON_ACTIVE_CONFLICT"],
    ["Sayh evaluator assignment already exists but is not ACTIVE", "SAYH_EVALUATOR_NON_ACTIVE_CONFLICT"],
    ["Cannot remove old Faleh", "FALEH_REMOVAL_WITHOUT_REPLACEMENT"],
    ["Write outside transfer schools", "SAFETY_OUTSIDE_TRANSFER_SCHOOLS"],
    ["Write targets another person", "SAFETY_WRONG_TEACHER"],
    ["Write touches a girls school", "SAFETY_GIRLS_SCOPE"],
    ["Write touches kindergarten", "SAFETY_KINDERGARTEN_SCOPE"],
    ["Creation is not scoped to Sayh", "SAFETY_CREATION_NOT_SAYH"],
    ["Removal is not scoped to Faleh", "SAFETY_REMOVAL_NOT_FALEH"],
  ];
  const match = prefixes.find(([prefix]) => value.startsWith(prefix));
  return match ? match[1] : value.split(":")[0] || "UNCLASSIFIED";
}

async function buildPlan(db) {
  const conflicts = [];
  const teacher = await resolveTeacher(db);
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [allTargetAssignments, allEvaluatorAssignments, allSubmissions] = await Promise.all([
    queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationSubmissions`, "targetPersonId", teacher.personId),
  ]);

  const oldTargetAssignments = allTargetAssignments.filter(
    (item) =>
      text(item.data.schoolId) === CONFIG.fromSchoolId &&
      assignmentIsActive(item.data),
  );
  const oldEvaluatorAssignments = allEvaluatorAssignments.filter(
    (item) =>
      text(item.data.schoolId) === CONFIG.fromSchoolId &&
      assignmentIsActive(item.data),
  );
  const sayhTargetAssignments = allTargetAssignments.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId,
  );
  const sayhEvaluatorAssignments = allEvaluatorAssignments.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId,
  );

  const oldPlanIds = Array.from(
    new Set([
      ...oldTargetAssignments.map((item) => text(item.data.planId)),
      ...oldEvaluatorAssignments.map((item) => text(item.data.planId)),
    ].filter(Boolean)),
  );
  const oldCycleIds = Array.from(
    new Set(oldEvaluatorAssignments.map((item) => text(item.data.cycleId)).filter(Boolean)),
  );

  const oldPlans = new Map();
  const mappedPlans = new Map();
  for (const oldPlanId of oldPlanIds) {
    const mappedPlanId = mapFalehIdToSayh(oldPlanId, "Faleh planId", conflicts);
    if (!mappedPlanId) continue;
    const [oldPlanSnapshot, mappedPlanSnapshot] = await Promise.all([
      db.doc(`${orgRoot}/evaluationPlans/${oldPlanId}`).get(),
      db.doc(`${orgRoot}/evaluationPlans/${mappedPlanId}`).get(),
    ]);
    if (!oldPlanSnapshot.exists) {
      conflicts.push(`Old Faleh plan is missing: ${oldPlanId}.`);
      continue;
    }
    const oldPlan = dataWithId(oldPlanSnapshot);
    const mappedPlan = mappedPlanSnapshot.exists ? dataWithId(mappedPlanSnapshot) : null;
    verifyMappedPlan({ oldPlan, newPlan: mappedPlan, oldPlanId, newPlanId: mappedPlanId, conflicts });
    oldPlans.set(oldPlanId, oldPlan);
    if (mappedPlan) mappedPlans.set(oldPlanId, mappedPlan);
  }

  const oldCycles = new Map();
  const mappedCycles = new Map();
  for (const oldCycleId of oldCycleIds) {
    const mappedCycleId = mapFalehIdToSayh(oldCycleId, "Faleh cycleId", conflicts);
    if (!mappedCycleId) continue;
    const oldCycleSnapshot = await db.doc(`${orgRoot}/evaluationCycles/${oldCycleId}`).get();
    if (!oldCycleSnapshot.exists) {
      conflicts.push(`Old Faleh cycle is missing: ${oldCycleId}.`);
      continue;
    }
    const oldCycle = dataWithId(oldCycleSnapshot);
    const oldPlanId = text(oldCycle.data.planId);
    const mappedPlan = mappedPlans.get(oldPlanId);
    if (!mappedPlan) {
      conflicts.push(`No verified Sayh plan is available for old cycle ${oldCycleId}.`);
      continue;
    }
    const mappedCycleSnapshot = await db.doc(`${orgRoot}/evaluationCycles/${mappedCycleId}`).get();
    const mappedCycle = mappedCycleSnapshot.exists ? dataWithId(mappedCycleSnapshot) : null;
    verifyMappedCycle({
      oldCycle,
      newCycle: mappedCycle,
      oldCycleId,
      newCycleId: mappedCycleId,
      mappedPlanId: mappedPlan.id,
      conflicts,
    });
    oldCycles.set(oldCycleId, oldCycle);
    if (mappedCycle) mappedCycles.set(oldCycleId, mappedCycle);
  }

  const sayhEvaluatorCandidatesByContext = new Map();
  for (const oldAssignment of oldEvaluatorAssignments) {
    const mappedPlan = mappedPlans.get(text(oldAssignment.data.planId));
    const mappedCycle = mappedCycles.get(text(oldAssignment.data.cycleId));
    if (!mappedPlan || !mappedCycle) continue;
    const key = `${mappedPlan.id}\u001f${mappedCycle.id}`;
    if (sayhEvaluatorCandidatesByContext.has(key)) continue;
    const candidates = await queryByField(
      db,
      `${orgRoot}/evaluationEvaluatorAssignments`,
      "planId",
      mappedPlan.id,
    );
    sayhEvaluatorCandidatesByContext.set(
      key,
      candidates.filter((item) => text(item.data.cycleId) === mappedCycle.id),
    );
  }

  const writes = [];
  const alreadyExisting = [];
  const now = Date.now();
  const oldTargetByPlan = new Map(
    oldTargetAssignments.map((item) => [text(item.data.planId), item]),
  );
  const replacementTargetsByPlan = new Map();

  for (const [oldPlanId, mappedPlan] of mappedPlans) {
    const activeExisting = activeTargetForPlan(sayhTargetAssignments, mappedPlan.id);
    const nonActiveExisting = nonActiveTargetForPlan(sayhTargetAssignments, mappedPlan.id);

    if (nonActiveExisting.length > 0) {
      conflicts.push(`Sayh target assignment already exists but is not ACTIVE for ${mappedPlan.id}.`);
      continue;
    }
    if (activeExisting.length > 0) {
      alreadyExisting.push(...activeExisting.map((item) => ({ type: "TARGET", ...item })));
      replacementTargetsByPlan.set(oldPlanId, true);
      continue;
    }

    const payload = buildTargetAssignment({
      teacher,
      mappedPlan,
      sourceTarget: oldTargetByPlan.get(oldPlanId),
      now,
      conflicts,
    });
    if (!payload) continue;

    replacementTargetsByPlan.set(oldPlanId, true);
    writes.push(actionRow({
      action: "CREATE",
      collection: "evaluationTargetAssignments",
      document: {
        id: payload.id,
        path: `${orgRoot}/evaluationTargetAssignments/${payload.id}`,
      },
      sourceData: payload,
      data: payload,
      reason: `Create missing Sayh target assignment mapped from ${oldPlanId}.`,
      mappedPlanId: mappedPlan.id,
      mappedPlanVerified: true,
      replacementConfirmed: true,
    }));
  }

  const replacementEvaluatorsByOldPath = new Map();
  const inferredEvaluatorMultiplicity = [];
  const plannedEvaluatorPaths = new Set();
  for (const oldAssignment of oldEvaluatorAssignments) {
    const oldPlanId = text(oldAssignment.data.planId);
    const oldCycleId = text(oldAssignment.data.cycleId);
    const mappedPlan = mappedPlans.get(oldPlanId);
    const mappedCycle = mappedCycles.get(oldCycleId);
    if (!mappedPlan || !mappedCycle || !replacementTargetsByPlan.get(oldPlanId)) continue;

    const key = `${mappedPlan.id}\u001f${mappedCycle.id}`;
    const inference = inferSayhEvaluators({
      candidates: sayhEvaluatorCandidatesByContext.get(key) || [],
      oldAssignment,
      mappedPlanId: mappedPlan.id,
      mappedCycleId: mappedCycle.id,
      conflicts,
    });
    inferredEvaluatorMultiplicity.push(inference.multiplicity);
    const inferred = inference.evaluators;
    if (inferred.length === 0) continue;

    let replacementConfirmed = true;
    for (const evaluator of inferred) {
      const activeExisting = activeEvaluatorForContext(
        sayhEvaluatorAssignments,
        mappedPlan.id,
        mappedCycle.id,
        evaluator,
      );
      const incompatibleActiveExisting = evaluatorAssignmentsForPersonInContext(
        sayhEvaluatorAssignments,
        mappedPlan.id,
        mappedCycle.id,
        evaluator,
      ).filter(
        (item) => assignmentIsActive(item.data) && !evaluatorConventionMatches(item.data, evaluator),
      );
      const nonActiveExisting = nonActiveEvaluatorForContext(
        sayhEvaluatorAssignments,
        mappedPlan.id,
        mappedCycle.id,
        evaluator,
      );

      if (nonActiveExisting.length > 0) {
        conflicts.push(
          `Sayh evaluator assignment already exists but is not ACTIVE for ${mappedPlan.id}/${mappedCycle.id}/${text(evaluator.evaluatorPersonId)}.`,
        );
        replacementConfirmed = false;
        continue;
      }
      if (incompatibleActiveExisting.length > 0) {
        conflicts.push(
          `Sayh evaluator assignment has an incompatible ACTIVE role/weight convention for ${mappedPlan.id}/${mappedCycle.id}/${text(evaluator.evaluatorPersonId)}.`,
        );
        replacementConfirmed = false;
        continue;
      }
      if (activeExisting.length > 0) {
        alreadyExisting.push(...activeExisting.map((item) => ({ type: "EVALUATOR", ...item })));
        continue;
      }

      const payload = buildEvaluatorAssignment({
        teacher,
        mappedPlan,
        mappedCycle,
        evaluator,
        now,
      });
      const payloadPath = `${orgRoot}/evaluationEvaluatorAssignments/${payload.id}`;
      if (plannedEvaluatorPaths.has(payloadPath)) continue;
      plannedEvaluatorPaths.add(payloadPath);
      writes.push(actionRow({
        action: "CREATE",
        collection: "evaluationEvaluatorAssignments",
        document: { id: payload.id, path: payloadPath },
        sourceData: payload,
        data: payload,
        reason: "Create Sayh evaluator assignment using the inferred Sayh evaluator convention.",
        mappedPlanId: mappedPlan.id,
        mappedCycleId: mappedCycle.id,
        mappedPlanVerified: true,
        mappedCycleVerified: true,
        inferredEvaluator: true,
        replacementConfirmed: true,
      }));
    }

    if (replacementConfirmed) replacementEvaluatorsByOldPath.set(oldAssignment.path, true);
  }

  for (const oldAssignment of oldTargetAssignments) {
    const oldPlanId = text(oldAssignment.data.planId);
    if (!replacementTargetsByPlan.get(oldPlanId)) {
      conflicts.push(`Cannot remove old Faleh target assignment without a confirmed Sayh target replacement: ${oldAssignment.path}.`);
      continue;
    }
    const mappedPlan = mappedPlans.get(oldPlanId);
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationTargetAssignments",
      document: oldAssignment,
      sourceData: oldAssignment.data,
      data: { status: "REMOVED", updatedAt: now },
      reason: "Close the old ACTIVE Faleh target assignment without deleting it.",
      mappedPlanId: mappedPlan ? mappedPlan.id : "",
      mappedPlanVerified: Boolean(mappedPlan),
      replacementConfirmed: true,
    }));
  }

  for (const oldAssignment of oldEvaluatorAssignments) {
    if (!replacementEvaluatorsByOldPath.get(oldAssignment.path)) {
      conflicts.push(`Cannot remove old Faleh evaluator assignment without a confirmed Sayh evaluator replacement: ${oldAssignment.path}.`);
      continue;
    }
    const oldPlanId = text(oldAssignment.data.planId);
    const oldCycleId = text(oldAssignment.data.cycleId);
    const mappedPlan = mappedPlans.get(oldPlanId);
    const mappedCycle = mappedCycles.get(oldCycleId);
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationEvaluatorAssignments",
      document: oldAssignment,
      sourceData: oldAssignment.data,
      data: { status: "REMOVED", updatedAt: now },
      reason: "Close the old ACTIVE Faleh evaluator assignment without deleting it.",
      mappedPlanId: mappedPlan ? mappedPlan.id : "",
      mappedCycleId: mappedCycle ? mappedCycle.id : "",
      mappedPlanVerified: Boolean(mappedPlan),
      mappedCycleVerified: Boolean(mappedCycle),
      inferredEvaluator: true,
      replacementConfirmed: true,
    }));
  }

  const oldPlanIdSet = new Set(oldPlanIds);
  const oldFalehSubmissions = allSubmissions.filter((item) => {
    return (
      text(item.data.schoolId) === CONFIG.fromSchoolId &&
      oldPlanIdSet.has(text(item.data.planId))
    );
  });

  const plannedEvaluatorCreates = writes.filter(
    (item) => item.action === "CREATE" && item.collection === "evaluationEvaluatorAssignments",
  ).length;
  const plannedEvaluatorRemovals = writes.filter(
    (item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments",
  ).length;
  const provenMultiEvaluatorPatterns = inferredEvaluatorMultiplicity.filter(
    (item) => item.inferredCount > 1 && item.conventionProven,
  );
  const unprovenMultiEvaluatorPatterns = inferredEvaluatorMultiplicity.filter(
    (item) => item.inferredCount > 1 && !item.conventionProven,
  );
  const maximumProvenExtraEvaluatorReplacements = provenMultiEvaluatorPatterns.reduce(
    (total, item) => total + item.inferredCount - 1,
    0,
  );
  const evaluatorCreationSurplus = Math.max(
    0,
    plannedEvaluatorCreates - plannedEvaluatorRemovals,
  );
  if (evaluatorCreationSurplus > maximumProvenExtraEvaluatorReplacements) {
    conflicts.push(
      `Sayh evaluator creation surplus (${evaluatorCreationSurplus}) exceeds the ${maximumProvenExtraEvaluatorReplacements} replacement(s) justified by proven multi-evaluator conventions.`,
    );
  }
  const evaluatorReplacementExplanation = {
    oldFalehEvaluatorAssignmentsToRemove: plannedEvaluatorRemovals,
    sayhEvaluatorAssignmentsToCreate: plannedEvaluatorCreates,
    creationSurplus: evaluatorCreationSurplus,
    maximumProvenExtraEvaluatorReplacements,
    provenMultiEvaluatorPatterns: provenMultiEvaluatorPatterns.length,
    unprovenMultiEvaluatorPatterns: unprovenMultiEvaluatorPatterns.length,
    conclusion: evaluatorCreationSurplus === 0
      ? "No creation surplus over old Faleh removals."
      : evaluatorCreationSurplus <= maximumProvenExtraEvaluatorReplacements && unprovenMultiEvaluatorPatterns.length === 0
        ? "Creation surplus is explained by proven existing Sayh multi-evaluator conventions."
        : "Creation surplus is not fully justified; APPLY is not safe.",
  };

  const plan = {
    teacher,
    oldTargetAssignments,
    oldEvaluatorAssignments,
    oldFalehSubmissions,
    mappedPlans: Array.from(mappedPlans.entries()).map(([oldPlanId, newPlan]) => ({ oldPlanId, newPlanId: newPlan.id })),
    mappedCycles: Array.from(mappedCycles.entries()).map(([oldCycleId, newCycle]) => ({ oldCycleId, newCycleId: newCycle.id, planId: text(newCycle.data.planId) })),
    inferredSayhEvaluators: Array.from(sayhEvaluatorCandidatesByContext.entries()).map(([key, values]) => ({
      context: key,
      candidates: values.filter((item) => assignmentIsActive(item.data)).map((item) => ({
        evaluatorPersonId: text(item.data.evaluatorPersonId),
        evaluatorRoleKey: text(item.data.evaluatorRoleKey),
        weight: item.data.weight,
      })),
    })),
    alreadyExisting,
    inferredEvaluatorMultiplicity,
    evaluatorReplacementExplanation,
    writes,
    conflicts,
  };

  const safety = validateSafety(plan);
  plan.safety = safety;
  plan.conflicts.push(...safety.violations);
  plan.decision = plan.conflicts.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY";
  return plan;
}

function printPreview(plan) {
  console.log("Teacher resolved data");
  console.table([{
    email: plan.teacher.email,
    uid: plan.teacher.uid,
    personId: plan.teacher.personId,
    displayName: plan.teacher.displayName,
  }]);
  console.log({ fromSchool: CONFIG.fromSchoolId, toSchool: CONFIG.toSchoolId });
  console.log({
    oldFalehTargetAssignmentsFound: plan.oldTargetAssignments.length,
    oldFalehEvaluatorAssignmentsFound: plan.oldEvaluatorAssignments.length,
  });
  console.log("Old Faleh submissions by plan/cycle/status");
  console.table(groupCounts(plan.oldFalehSubmissions, (item) => [
    text(item.data.planId),
    text(item.data.cycleId),
    statusOf(item.data),
  ].join(" | ")));
  console.log("Mapped Sayh plans");
  console.table(plan.mappedPlans);
  console.log("Mapped Sayh cycles");
  console.table(plan.mappedCycles);
  console.log("Inferred Sayh evaluators by plan/cycle");
  console.table(plan.inferredSayhEvaluators.map((item) => ({
    context: item.context,
    candidates: JSON.stringify(item.candidates),
  })));

  const targetCreates = plan.writes.filter((item) => item.action === "CREATE" && item.collection === "evaluationTargetAssignments");
  const evaluatorCreates = plan.writes.filter((item) => item.action === "CREATE" && item.collection === "evaluationEvaluatorAssignments");
  const targetRemovals = plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments");
  const evaluatorRemovals = plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments");
  console.log("Old Faleh target assignments to remove by planId");
  console.table(groupCounts(targetRemovals, (item) => item.sourcePlanId));
  console.log("Old Faleh evaluator assignments to remove by planId/cycleId/evaluatorRoleKey/evaluatorPersonId");
  console.table(groupCounts(evaluatorRemovals, (item) => [
    item.sourcePlanId,
    item.sourceCycleId,
    text(item.sourceData.evaluatorRoleKey),
    text(item.sourceData.evaluatorPersonId),
  ].join(" | ")));
  console.log("Sayh target assignments to create by planId");
  console.table(groupCounts(targetCreates, (item) => item.sourcePlanId));
  console.log("Sayh evaluator assignments to create by planId/cycleId/evaluatorRoleKey/evaluatorPersonId");
  console.table(groupCounts(evaluatorCreates, (item) => [
    item.sourcePlanId,
    item.sourceCycleId,
    text(item.sourceData.evaluatorRoleKey),
    text(item.sourceData.evaluatorPersonId),
  ].join(" | ")));
  console.log("Already existing Sayh replacements by planId/cycleId/evaluatorRoleKey");
  console.table(groupCounts(plan.alreadyExisting, (item) => [
    item.type,
    text(item.data.planId),
    text(item.data.cycleId),
    text(item.data.evaluatorRoleKey),
  ].join(" | ")));
  console.log("inferredEvaluatorMultiplicity");
  console.table(plan.inferredEvaluatorMultiplicity.map((item) => ({
    oldAssignmentId: item.oldAssignmentId,
    oldPlanId: item.oldPlanId,
    oldCycleId: item.oldCycleId,
    oldEvaluatorRoleKey: item.oldEvaluatorRoleKey,
    oldEvaluatorPersonId: item.oldEvaluatorPersonId,
    mappedPlanId: item.planId,
    mappedCycleId: item.cycleId,
    inferredCount: item.inferredCount,
    sameConventionTargets: item.sameConventionTargets,
    totalConventionTargets: item.totalConventionTargets,
    conventionProven: item.conventionProven,
    reason: item.reason,
  })));
  console.log("Evaluator replacement explanation");
  console.log(plan.evaluatorReplacementExplanation);
  console.log({
    sayhTargetAssignmentsToCreate: targetCreates.length,
    sayhEvaluatorAssignmentsToCreate: evaluatorCreates.length,
    alreadyExistingSayhAssignments: plan.alreadyExisting.length,
    oldFalehTargetAssignmentsToMarkRemoved: targetRemovals.length,
    oldFalehEvaluatorAssignmentsToMarkRemoved: evaluatorRemovals.length,
    conflicts: plan.conflicts.length,
    safetyCounters: plan.safety.counters,
    decision: plan.decision,
  });

  if (plan.conflicts.length > 0) {
    console.log("Conflicts grouped by reason");
    console.table(groupCounts(plan.conflicts, (message) => conflictReason(message)));
    console.log("Conflicts");
    console.table(plan.conflicts.map((message) => ({ reason: conflictReason(message), message })));
  }
}

async function applyPlan(db, plan) {
  assert(plan.decision === "SAFE TO APPLY", "NOT SAFE TO APPLY. No writes were performed.");

  const createActions = plan.writes.filter((item) => item.action === "CREATE");
  const removeActions = plan.writes.filter((item) => item.action === "REMOVE");
  const allActions = [...createActions, ...removeActions];
  const chunkSize = 400;

  for (let index = 0; index < allActions.length; index += chunkSize) {
    const batch = db.batch();
    for (const action of allActions.slice(index, index + chunkSize)) {
      const ref = db.doc(action.path);
      if (action.action === "CREATE") {
        batch.create(ref, action.data);
      } else {
        batch.update(ref, action.data);
      }
    }
    await batch.commit();
  }

  console.log({
    createdSayhTargetAssignments: createActions.filter((item) => item.collection === "evaluationTargetAssignments").length,
    createdSayhEvaluatorAssignments: createActions.filter((item) => item.collection === "evaluationEvaluatorAssignments").length,
    removedOldFalehTargetAssignments: removeActions.filter((item) => item.collection === "evaluationTargetAssignments").length,
    removedOldFalehEvaluatorAssignments: removeActions.filter((item) => item.collection === "evaluationEvaluatorAssignments").length,
    alreadyExistingReplacements: plan.alreadyExisting.length,
    conflicts: plan.conflicts.length,
    decision: "APPLIED",
  });
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const plan = await buildPlan(db);
  printPreview(plan);

  if (!APPLY) {
    console.log("Preview complete. No writes performed.");
    return;
  }

  if (plan.decision !== "SAFE TO APPLY") {
    console.log({ decision: "NOT APPLIED" });
    process.exitCode = 1;
    return;
  }

  await applyPlan(db, plan);
}

main().catch((error) => {
  console.error("Teacher evaluation transfer failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
