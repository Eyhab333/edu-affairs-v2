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
  repairKey: "reset-k-alsadle-sayh-2026-09",
};

const EVALUATION_COLLECTIONS = new Set([
  "evaluationTargetAssignments",
  "evaluationEvaluatorAssignments",
]);

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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function statusOf(data) {
  return text(data.status).toUpperCase() || "(missing)";
}

function isActiveAssignment(data) {
  return (
    statusOf(data) === "ACTIVE" &&
    data.isActive !== false &&
    data.active !== false
  );
}

function isLivePlanOrCycle(data) {
  const status = statusOf(data);
  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status)
  );
}

function isTeacherKind(data, plan) {
  return text(data.targetKind || plan?.data?.targetKind).toUpperCase() === "TEACHER";
}

function dataWithId(document) {
  return {
    id: document.id,
    path: document.ref.path,
    ref: document.ref,
    data: document.data() || {},
  };
}

function groupCounts(items, keyBuilder) {
  return Array.from(
    items.reduce((groups, item) => {
      const key = keyBuilder(item) || "(empty)";
      groups.set(key, (groups.get(key) || 0) + 1);
      return groups;
    }, new Map()).entries(),
  )
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function conflictReason(message) {
  const value = text(message);
  const prefixes = [
    ["Identity", "IDENTITY"],
    ["Teacher has no ACTIVE", "NO_ACTIVE_SAYH_TEACHER_ASSIGNMENT"],
    ["Submitted or approved", "SUBMITTED_OR_APPROVED_SUBMISSION"],
    ["Cannot prove", "MISSING_PLAN_OR_CYCLE"],
    ["Sayh plan", "SAYH_PLAN_CONFLICT"],
    ["Sayh cycle", "SAYH_CYCLE_CONFLICT"],
    ["Comparable Sayh", "COMPARABLE_PATTERN_CONFLICT"],
    ["No comparable", "NO_COMPARABLE_SAYH_PATTERN"],
    ["Admin/principal", "NON_TEACHER_TARGET_ASSIGNMENT"],
    ["already exists", "NON_ACTIVE_OR_DUPLICATE_ASSIGNMENT"],
    ["Fresh repair", "REPAIR_ID_CONFLICT"],
    ["Write", "WRITE_SCOPE"],
    ["Creation", "WRITE_SCOPE"],
    ["Removal", "WRITE_SCOPE"],
  ];
  const match = prefixes.find(([prefix]) => value.startsWith(prefix));
  return match ? match[1] : value.split(":")[0] || "UNCLASSIFIED";
}

function evaluatorKey(data) {
  return [
    text(data.evaluatorPersonId),
    text(data.evaluatorRoleKey),
    String(data.weight ?? ""),
  ].join("\u001f");
}

function contextKey(data) {
  return [
    text(data.planId),
    text(data.cycleId),
    text(data.evaluatorRoleKey),
  ].join("\u001f");
}

function assignmentKey(data) {
  return [
    text(data.planId),
    text(data.cycleId),
    text(data.evaluatorRoleKey),
    text(data.evaluatorPersonId),
  ].join(" | ");
}

async function queryByField(db, collectionPath, field, value) {
  const snapshot = await db.collection(collectionPath).where(field, "==", value).get();
  return snapshot.docs.map(dataWithId);
}

async function resolveTeacher(db, conflicts) {
  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(CONFIG.email);
  } catch (error) {
    conflicts.push(`Identity: Firebase Auth user was not found for ${CONFIG.email}: ${error.message || error}.`);
    return null;
  }

  if (normalizeEmail(authUser.email) !== CONFIG.email) {
    conflicts.push("Identity: Firebase Auth email does not exactly match the configured email.");
    return null;
  }

  const userMatches = await queryByField(db, "users", "email", CONFIG.email);
  const userSnapshot = await db.doc(`users/${authUser.uid}`).get();
  if (!userSnapshot.exists || userMatches.length !== 1 || userMatches[0].id !== authUser.uid) {
    conflicts.push("Identity: users email resolution is missing or ambiguous.");
    return null;
  }

  const user = dataWithId(userSnapshot);
  const personId = text(user.data.personId);
  if (!personId || normalizeEmail(user.data.email) !== CONFIG.email) {
    conflicts.push("Identity: resolved user document has no matching email/personId.");
    return null;
  }

  const peoplePath = `orgs/${CONFIG.orgId}/people`;
  const [personSnapshot, personMatches] = await Promise.all([
    db.doc(`${peoplePath}/${personId}`).get(),
    queryByField(db, peoplePath, "email", CONFIG.email),
  ]);
  if (!personSnapshot.exists || personMatches.length !== 1 || personMatches[0].id !== personId) {
    conflicts.push("Identity: people email resolution is missing or ambiguous.");
    return null;
  }

  const person = dataWithId(personSnapshot);
  if (normalizeEmail(person.data.email) !== CONFIG.email) {
    conflicts.push("Identity: resolved person email does not exactly match the configured email.");
    return null;
  }

  return {
    uid: authUser.uid,
    personId,
    email: CONFIG.email,
    displayName: text(person.data.displayName) || text(user.data.displayName),
    user,
    person,
  };
}

function actionRow({
  action,
  collection,
  document,
  sourceData,
  data,
  planTargetKind,
  mappedPlanVerified = false,
  mappedCycleVerified = false,
  reason,
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
    sourceTargetKind: text(sourceData.targetKind),
    planTargetKind: text(planTargetKind),
    mappedPlanVerified,
    mappedCycleVerified,
    data,
    reason,
  };
}

function freshId(canonicalId, existingDocuments) {
  const id = `${canonicalId}-${CONFIG.repairKey}`;
  if (existingDocuments.some((document) => document.id === id)) return null;
  return id;
}

function buildTargetPayload({ teacher, plan, exemplar, id, now }) {
  const payload = {
    ...exemplar.data,
    id,
    orgId: CONFIG.orgId,
    schoolId: CONFIG.toSchoolId,
    academicYearId: text(plan.data.academicYearId),
    termId: text(plan.data.termId),
    planId: plan.id,
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    targetKind: "TEACHER",
    status: "ACTIVE",
    assignedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return payload;
}

function buildEvaluatorPayload({ teacher, plan, cycle, exemplar, evaluator, id, now }) {
  return {
    ...exemplar.data,
    id,
    orgId: CONFIG.orgId,
    schoolId: CONFIG.toSchoolId,
    academicYearId: text(cycle.data.academicYearId) || text(plan.data.academicYearId),
    termId: text(cycle.data.termId) || text(plan.data.termId),
    planId: plan.id,
    cycleId: cycle.id,
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    targetKind: "TEACHER",
    evaluatorPersonId: text(evaluator.evaluatorPersonId),
    ...(text(evaluator.evaluatorEmail) ? { evaluatorEmail: text(evaluator.evaluatorEmail) } : {}),
    ...(text(evaluator.evaluatorRoleKey) ? { evaluatorRoleKey: text(evaluator.evaluatorRoleKey) } : {}),
    weight: evaluator.weight,
    sourceType: text(evaluator.sourceType) || text(exemplar.data.sourceType) || "MANUAL",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

function validateSafety(plan) {
  const violations = [];
  const counters = {
    totalWrites: plan.writes.length,
    removedFalehTargetAssignments: 0,
    removedFalehEvaluatorAssignments: 0,
    removedSayhTargetAssignments: 0,
    removedSayhEvaluatorAssignments: 0,
    createdSayhTargetAssignments: 0,
    createdSayhEvaluatorAssignments: 0,
    createsOutsideSayh: 0,
    removesOutsideTransferSchools: 0,
    touchesOtherTeacher: 0,
    touchesGirls: 0,
    touchesKindergarten: 0,
    touchesAdminTarget: 0,
    missingPlanOrCycle: 0,
    submittedOrApprovedSubmissions: plan.submissions.filter((item) =>
      ["SUBMITTED", "APPROVED"].includes(statusOf(item.data)),
    ).length,
    forbiddenCollection: 0,
    duplicateWrites: 0,
  };
  const seenWrites = new Set();

  for (const write of plan.writes) {
    const source = write.sourceData || {};
    const schoolId = text(source.schoolId);
    const targetPersonId = text(source.targetPersonId);
    const planId = text(source.planId);
    const cycleId = text(source.cycleId);
    const targetKind = text(source.targetKind || write.planTargetKind).toUpperCase();
    const isCreate = write.action === "CREATE";
    const isRemove = write.action === "REMOVE";
    const writeKey = `${write.action}\u001f${write.path}`;

    if (seenWrites.has(writeKey)) {
      counters.duplicateWrites += 1;
      violations.push(`Write: duplicate planned write ${write.path}.`);
    }
    seenWrites.add(writeKey);

    if (!EVALUATION_COLLECTIONS.has(write.collection)) {
      counters.forbiddenCollection += 1;
      violations.push(`Write: forbidden collection ${write.collection}.`);
    }
    if (!isCreate && !isRemove) {
      violations.push(`Write: unsupported action ${write.action || "(missing)"}.`);
    }
    if (schoolId.includes("mrb-girls")) {
      counters.touchesGirls += 1;
      violations.push(`Write: touches mrb-girls ${write.path}.`);
    }
    if (schoolId.includes("kindergarten") || schoolId.includes("-kg") || schoolId.includes("kg-")) {
      counters.touchesKindergarten += 1;
      violations.push(`Write: touches kindergarten ${write.path}.`);
    }
    if (targetPersonId !== plan.teacher.personId) {
      counters.touchesOtherTeacher += 1;
      violations.push(`Write: targets another teacher ${write.path}.`);
    }
    if (targetKind !== "TEACHER") {
      counters.touchesAdminTarget += 1;
      violations.push(`Write: targetKind is not TEACHER at ${write.path}.`);
    }
    if (!planId || !write.mappedPlanVerified) {
      counters.missingPlanOrCycle += 1;
      violations.push(`Write: mapped Sayh plan is not proven for ${write.path}.`);
    }

    if (isCreate) {
      if (schoolId !== CONFIG.toSchoolId) {
        counters.createsOutsideSayh += 1;
        violations.push(`Creation: schoolId is not ${CONFIG.toSchoolId} at ${write.path}.`);
      }
      if (statusOf(source) !== "ACTIVE") {
        violations.push(`Creation: status is not ACTIVE at ${write.path}.`);
      }
      if (write.collection === "evaluationEvaluatorAssignments" && (!cycleId || !write.mappedCycleVerified)) {
        counters.missingPlanOrCycle += 1;
        violations.push(`Write: mapped Sayh cycle is not proven for ${write.path}.`);
      }
      if (schoolId === CONFIG.toSchoolId && targetPersonId === plan.teacher.personId && targetKind === "TEACHER") {
        if (write.collection === "evaluationTargetAssignments") counters.createdSayhTargetAssignments += 1;
        if (write.collection === "evaluationEvaluatorAssignments") counters.createdSayhEvaluatorAssignments += 1;
      }
    }

    if (isRemove) {
      if (![CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(schoolId)) {
        counters.removesOutsideTransferSchools += 1;
        violations.push(`Removal: schoolId is outside the two transfer schools at ${write.path}.`);
      }
      if (statusOf(source) !== "ACTIVE") {
        violations.push(`Removal: source assignment is not currently ACTIVE at ${write.path}.`);
      }
      if (text(write.data.status).toUpperCase() !== "REMOVED") {
        violations.push(`Removal: status is not REMOVED at ${write.path}.`);
      }
      if (schoolId === CONFIG.toSchoolId && targetPersonId === plan.teacher.personId && targetKind === "TEACHER") {
        if (write.collection === "evaluationTargetAssignments") counters.removedSayhTargetAssignments += 1;
        if (write.collection === "evaluationEvaluatorAssignments") counters.removedSayhEvaluatorAssignments += 1;
      }
      if (schoolId === CONFIG.fromSchoolId && targetPersonId === plan.teacher.personId && targetKind === "TEACHER") {
        if (write.collection === "evaluationTargetAssignments") counters.removedFalehTargetAssignments += 1;
        if (write.collection === "evaluationEvaluatorAssignments") counters.removedFalehEvaluatorAssignments += 1;
      }
    }
  }

  if (counters.submittedOrApprovedSubmissions > 0) {
    violations.push("Submitted or approved evaluation submissions exist in the reset scope.");
  }
  return { counters, violations };
}

async function buildPlan(db) {
  const conflicts = [];
  const teacher = await resolveTeacher(db, conflicts);
  const orgRoot = `orgs/${CONFIG.orgId}`;
  if (!teacher) {
    return {
      teacher: { email: CONFIG.email },
      teacherAssignments: [],
      submissions: [],
      oldFalehTargetAssignments: [],
      oldFalehEvaluatorAssignments: [],
      oldSayhTargetAssignments: [],
      oldSayhEvaluatorAssignments: [],
      comparablePatterns: [],
      includedPlans: [],
      includedCycles: [],
      inferredSayhEvaluators: [],
      targetCreates: [],
      evaluatorCreates: [],
      alreadyExisting: [],
      writes: [],
      conflicts,
    };
  }

  const [
    teacherAssignments,
    allTargetAssignments,
    allEvaluatorAssignments,
    submissions,
    planSnapshot,
    cycleSnapshot,
  ] = await Promise.all([
    queryByField(db, `${orgRoot}/teacherAssignments`, "teacherPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationSubmissions`, "targetPersonId", teacher.personId),
    db.collection(`${orgRoot}/evaluationPlans`).get(),
    db.collection(`${orgRoot}/evaluationCycles`).get(),
  ]);
  const allPlans = planSnapshot.docs.map(dataWithId);
  const allCycles = cycleSnapshot.docs.map(dataWithId);
  const plansById = new Map(allPlans.map((plan) => [plan.id, plan]));
  const cyclesById = new Map(allCycles.map((cycle) => [cycle.id, cycle]));

  const teacherAssignmentEvidence = teacherAssignments.filter((item) =>
    [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)),
  );
  if (!teacherAssignments.some((item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data))) {
    conflicts.push(`Teacher has no ACTIVE teacherAssignment in ${CONFIG.toSchoolId}.`);
  }

  const scopedSubmissions = submissions.filter((item) =>
    [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)),
  );
  if (scopedSubmissions.some((item) => ["SUBMITTED", "APPROVED"].includes(statusOf(item.data)))) {
    conflicts.push("Submitted or approved evaluation submissions exist in the reset scope.");
  }

  const sayhTeacherAssignments = teacherAssignments.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data),
  );
  const comparableTeacherIds = new Set(
    sayhTeacherAssignments
      .map((item) => text(item.data.teacherPersonId))
      .filter((personId) => personId && personId !== teacher.personId),
  );
  const activeSayhTargets = allTargetAssignments.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data),
  );
  const comparableTargets = activeSayhTargets.filter((item) => {
    const plan = plansById.get(text(item.data.planId));
    return comparableTeacherIds.has(text(item.data.targetPersonId)) && isTeacherKind(item.data, plan);
  });

  const includedPlanIds = Array.from(new Set(comparableTargets.map((item) => text(item.data.planId)).filter(Boolean)));
  const includedPlans = [];
  const comparableTargetByPlan = new Map();
  for (const planId of includedPlanIds) {
    const plan = plansById.get(planId);
    if (!plan || text(plan.data.schoolId) !== CONFIG.toSchoolId || !isLivePlanOrCycle(plan.data) || !isTeacherKind({}, plan)) {
      conflicts.push(`Cannot prove a live Sayh TEACHER plan exists: ${planId}.`);
      continue;
    }
    includedPlans.push(plan);
    comparableTargetByPlan.set(planId, comparableTargets.find((item) => text(item.data.planId) === planId));
  }

  const activeSayhEvaluators = allEvaluatorAssignments.filter(
    (item) =>
      text(item.data.schoolId) === CONFIG.toSchoolId &&
      isActiveAssignment(item.data) &&
      text(item.data.evaluatorPersonId),
  );
  const comparableEvaluatorRecords = activeSayhEvaluators.filter((item) => {
    const plan = plansById.get(text(item.data.planId));
    return comparableTeacherIds.has(text(item.data.targetPersonId)) && isTeacherKind(item.data, plan);
  });
  const patternGroups = new Map();
  for (const item of comparableEvaluatorRecords) {
    if (!includedPlanIds.includes(text(item.data.planId))) continue;
    const key = contextKey(item.data);
    const group = patternGroups.get(key) || [];
    group.push(item);
    patternGroups.set(key, group);
  }

  const comparablePatterns = [];
  const patternByContext = new Map();
  const includedPlanById = new Map(includedPlans.map((plan) => [plan.id, plan]));
  for (const [key, records] of patternGroups) {
    const planId = text(records[0].data.planId);
    const cycleId = text(records[0].data.cycleId);
    const plan = includedPlanById.get(planId);
    const cycle = cyclesById.get(cycleId);
    if (!plan) {
      conflicts.push(`Cannot prove a matching included Sayh plan exists for evaluator pattern ${key}.`);
      continue;
    }
    if (!cycle || text(cycle.data.planId) !== planId || (text(cycle.data.schoolId) && text(cycle.data.schoolId) !== CONFIG.toSchoolId) || !isLivePlanOrCycle(cycle.data)) {
      conflicts.push(`Cannot prove a matching Sayh cycle exists: ${cycleId}.`);
      continue;
    }

    const byTarget = new Map();
    for (const record of records) {
      const targetId = text(record.data.targetPersonId);
      const targetSet = byTarget.get(targetId) || new Map();
      targetSet.set(evaluatorKey(record.data), record);
      byTarget.set(targetId, targetSet);
    }
    const targetSets = Array.from(byTarget.values());
    const firstSet = targetSets[0] || new Map();
    const consistent = targetSets.every((set) =>
      set.size === firstSet.size && Array.from(set.keys()).every((entry) => firstSet.has(entry)),
    );
    if (!consistent || firstSet.size === 0) {
      conflicts.push(`Comparable Sayh evaluator pattern is inconsistent for ${key}.`);
      continue;
    }
    const evaluators = Array.from(firstSet.values()).map((item) => item.data);
    const pattern = {
      key,
      planId,
      cycleId,
      evaluatorRoleKey: text(records[0].data.evaluatorRoleKey),
      comparableTargetCount: byTarget.size,
      evaluators,
      exemplar: records[0],
      plan,
      cycle,
    };
    comparablePatterns.push(pattern);
    patternByContext.set(key, pattern);
  }

  for (const plan of includedPlans) {
    if (!comparablePatterns.some((pattern) => pattern.planId === plan.id)) {
      conflicts.push(`No comparable Sayh evaluator pattern exists for teacher plan ${plan.id}.`);
    }
  }

  const resetTargets = allTargetAssignments.filter(
    (item) => [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)) && isActiveAssignment(item.data),
  );
  const resetEvaluators = allEvaluatorAssignments.filter(
    (item) => [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)) && isActiveAssignment(item.data),
  );
  const oldFalehTargetAssignments = resetTargets.filter((item) => text(item.data.schoolId) === CONFIG.fromSchoolId);
  const oldFalehEvaluatorAssignments = resetEvaluators.filter((item) => text(item.data.schoolId) === CONFIG.fromSchoolId);
  const oldSayhTargetAssignments = resetTargets.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && !item.id.endsWith(`-${CONFIG.repairKey}`),
  );
  const oldSayhEvaluatorAssignments = resetEvaluators.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && !item.id.endsWith(`-${CONFIG.repairKey}`),
  );
  const existingRepairTargets = resetTargets.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && item.id.endsWith(`-${CONFIG.repairKey}`),
  );
  const existingRepairEvaluators = resetEvaluators.filter(
    (item) => text(item.data.schoolId) === CONFIG.toSchoolId && item.id.endsWith(`-${CONFIG.repairKey}`),
  );

  const allResetAssignments = [...resetTargets, ...resetEvaluators];
  for (const item of allResetAssignments) {
    const plan = plansById.get(text(item.data.planId));
    if (!isTeacherKind(item.data, plan)) {
      conflicts.push(`Admin/principal target assignment is in the reset scope: ${item.path}.`);
    }
  }
  for (const item of oldSayhTargetAssignments) {
    if (!includedPlans.some((plan) => plan.id === text(item.data.planId))) {
      conflicts.push(`Sayh active target assignment is outside the comparable teacher plans: ${item.path}.`);
    }
  }
  for (const item of oldSayhEvaluatorAssignments) {
    if (!patternByContext.has(contextKey(item.data))) {
      conflicts.push(`Sayh active evaluator assignment has no comparable replacement pattern: ${item.path}.`);
    }
  }
  if (existingRepairTargets.length > includedPlans.length) {
    conflicts.push("Fresh repair target assignments already exist in an ambiguous or duplicated state.");
  }

  const writes = [];
  const alreadyExisting = [];
  const targetCreates = [];
  const evaluatorCreates = [];
  const now = Date.now();
  const allSayhTargetDocuments = allTargetAssignments.filter((item) => text(item.data.schoolId) === CONFIG.toSchoolId);
  const allSayhEvaluatorDocuments = allEvaluatorAssignments.filter((item) => text(item.data.schoolId) === CONFIG.toSchoolId);

  for (const plan of includedPlans) {
    const activeFresh = existingRepairTargets.filter((item) => text(item.data.planId) === plan.id);
    if (activeFresh.length > 1) {
      conflicts.push(`Fresh repair target assignment is duplicated for ${plan.id}.`);
      continue;
    }
    if (activeFresh.length === 1) {
      alreadyExisting.push({ type: "TARGET", ...activeFresh[0] });
      continue;
    }
    const canonicalId = `${plan.id}-target-${teacher.personId}`;
    const id = freshId(canonicalId, allSayhTargetDocuments);
    if (!id) {
      conflicts.push(`Fresh repair target ID already exists and cannot be reused: ${canonicalId}-${CONFIG.repairKey}.`);
      continue;
    }
    const payload = buildTargetPayload({
      teacher,
      plan,
      exemplar: comparableTargetByPlan.get(plan.id),
      id,
      now,
    });
    targetCreates.push({ planId: plan.id, path: `${orgRoot}/evaluationTargetAssignments/${id}`, data: payload });
    writes.push(actionRow({
      action: "CREATE",
      collection: "evaluationTargetAssignments",
      document: { id, path: `${orgRoot}/evaluationTargetAssignments/${id}` },
      sourceData: payload,
      data: payload,
      planTargetKind: "TEACHER",
      mappedPlanVerified: true,
      reason: `Create fresh Sayh target assignment from comparable Sayh teacher pattern for ${plan.id}.`,
    }));
  }

  for (const pattern of comparablePatterns) {
    const activeFresh = existingRepairEvaluators.filter(
      (item) => text(item.data.planId) === pattern.planId && text(item.data.cycleId) === pattern.cycleId && text(item.data.evaluatorRoleKey) === pattern.evaluatorRoleKey,
    );
    const expectedEvaluatorKeys = new Set(pattern.evaluators.map(evaluatorKey));
    const actualEvaluatorKeys = new Set(activeFresh.map((item) => evaluatorKey(item.data)));
    const hasPartialOrIncompatibleFreshState = activeFresh.some((item) => !expectedEvaluatorKeys.has(evaluatorKey(item.data))) ||
      actualEvaluatorKeys.size !== expectedEvaluatorKeys.size;
    if (hasPartialOrIncompatibleFreshState) {
      conflicts.push(`Fresh repair evaluator assignments are partial or incompatible for ${pattern.key}.`);
      continue;
    }
    if (activeFresh.length > 0) {
      alreadyExisting.push(...activeFresh.map((item) => ({ type: "EVALUATOR", ...item })));
      continue;
    }
    for (const evaluator of pattern.evaluators) {
      const canonicalId = `${pattern.cycleId}-${teacher.personId}-${text(evaluator.evaluatorPersonId)}`;
      const id = freshId(canonicalId, allSayhEvaluatorDocuments);
      if (!id) {
        conflicts.push(`Fresh repair evaluator ID already exists and cannot be reused: ${canonicalId}-${CONFIG.repairKey}.`);
        continue;
      }
      const payload = buildEvaluatorPayload({
        teacher,
        plan: pattern.plan,
        cycle: pattern.cycle,
        exemplar: pattern.exemplar,
        evaluator,
        id,
        now,
      });
      evaluatorCreates.push({
        planId: pattern.planId,
        cycleId: pattern.cycleId,
        evaluatorRoleKey: text(evaluator.evaluatorRoleKey),
        evaluatorPersonId: text(evaluator.evaluatorPersonId),
        path: `${orgRoot}/evaluationEvaluatorAssignments/${id}`,
        data: payload,
      });
      writes.push(actionRow({
        action: "CREATE",
        collection: "evaluationEvaluatorAssignments",
        document: { id, path: `${orgRoot}/evaluationEvaluatorAssignments/${id}` },
        sourceData: payload,
        data: payload,
        planTargetKind: "TEACHER",
        mappedPlanVerified: true,
        mappedCycleVerified: true,
        reason: `Create fresh Sayh evaluator assignment from comparable Sayh pattern ${pattern.key}.`,
      }));
    }
  }

  for (const item of [...oldFalehTargetAssignments, ...oldSayhTargetAssignments]) {
    const plan = plansById.get(text(item.data.planId));
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationTargetAssignments",
      document: item,
      sourceData: item.data,
      data: {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Beginning-of-year evaluation assignment reset for k.alsadle.",
        updatedAt: now,
      },
      planTargetKind: plan?.data?.targetKind,
      mappedPlanVerified: Boolean(plan && text(plan.data.schoolId) === (text(item.data.schoolId) === CONFIG.toSchoolId ? CONFIG.toSchoolId : text(plan.data.schoolId))),
      reason: "Close old active assignment without deleting its document.",
    }));
  }

  for (const item of [...oldFalehEvaluatorAssignments, ...oldSayhEvaluatorAssignments]) {
    const plan = plansById.get(text(item.data.planId));
    const cycle = cyclesById.get(text(item.data.cycleId));
    const pattern = patternByContext.get(contextKey(item.data));
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationEvaluatorAssignments",
      document: item,
      sourceData: item.data,
      data: {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Beginning-of-year evaluation assignment reset for k.alsadle.",
        updatedAt: now,
      },
      planTargetKind: plan?.data?.targetKind,
      mappedPlanVerified: Boolean(plan && text(plan.data.schoolId) === text(item.data.schoolId)),
      mappedCycleVerified: Boolean(cycle && text(cycle.data.planId) === text(item.data.planId) && text(cycle.data.schoolId) === CONFIG.toSchoolId),
      reason: pattern
        ? "Close old active assignment after a comparable Sayh replacement is planned or already exists."
        : "Close old active assignment during beginning-of-year reset.",
    }));
  }

  const plan = {
    teacher,
    teacherAssignments: teacherAssignmentEvidence,
    submissions: scopedSubmissions,
    oldFalehTargetAssignments,
    oldFalehEvaluatorAssignments,
    oldSayhTargetAssignments,
    oldSayhEvaluatorAssignments,
    comparablePatterns,
    includedPlans: includedPlans.map((item) => ({
      id: item.id,
      title: text(item.data.title),
      schoolId: text(item.data.schoolId),
      academicYearId: text(item.data.academicYearId),
      termId: text(item.data.termId),
      targetKind: text(item.data.targetKind),
      planKind: text(item.data.planKind),
      frameworkId: text(item.data.frameworkId),
    })),
    includedCycles: comparablePatterns.map((item) => ({
      id: item.cycle.id,
      planId: item.planId,
      status: statusOf(item.cycle.data),
    })).filter((item, index, items) => items.findIndex((entry) => entry.id === item.id) === index),
    inferredSayhEvaluators: comparablePatterns.map((item) => ({
      planId: item.planId,
      cycleId: item.cycleId,
      evaluatorRoleKey: item.evaluatorRoleKey,
      comparableTargetCount: item.comparableTargetCount,
      evaluatorPersonIds: item.evaluators.map((evaluator) => text(evaluator.evaluatorPersonId)),
      evaluators: item.evaluators.map((evaluator) => ({
        evaluatorPersonId: text(evaluator.evaluatorPersonId),
        evaluatorRoleKey: text(evaluator.evaluatorRoleKey),
        weight: evaluator.weight,
      })),
    })),
    targetCreates,
    evaluatorCreates,
    alreadyExisting,
    writes,
    conflicts,
  };
  plan.safety = validateSafety(plan);
  plan.conflicts.push(...plan.safety.violations);
  plan.decision = plan.conflicts.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY";
  return plan;
}

function printPreview(plan) {
  console.log("Teacher resolved data");
  console.table([plan.teacher]);
  console.log({ fromSchool: CONFIG.fromSchoolId, toSchool: CONFIG.toSchoolId });

  console.log("TeacherAssignments evidence in Faleh and Sayh");
  console.table(plan.teacherAssignments.map((item) => ({
    id: item.id,
    schoolId: text(item.data.schoolId),
    academicYearId: text(item.data.academicYearId),
    termId: text(item.data.termId),
    assignmentKind: text(item.data.assignmentKind),
    status: statusOf(item.data),
  })));
  console.log("Submissions found by school/plan/status");
  console.table(groupCounts(plan.submissions, (item) => [
    text(item.data.schoolId),
    text(item.data.planId),
    statusOf(item.data),
  ].join(" | ")));

  console.log("Old Faleh targetAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldFalehTargetAssignments, (item) => text(item.data.planId)));
  console.log("Old Faleh evaluatorAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldFalehEvaluatorAssignments, (item) => assignmentKey(item.data)));
  console.log("Old Sayh targetAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldSayhTargetAssignments, (item) => text(item.data.planId)));
  console.log("Old Sayh evaluatorAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldSayhEvaluatorAssignments, (item) => assignmentKey(item.data)));

  console.log("Comparable Sayh patterns used");
  console.table(plan.comparablePatterns.map((item) => ({
    planId: item.planId,
    cycleId: item.cycleId,
    evaluatorRoleKey: item.evaluatorRoleKey,
    comparableTargetCount: item.comparableTargetCount,
    evaluatorPersonIds: item.evaluators.map((evaluator) => text(evaluator.evaluatorPersonId)).join(","),
  })));
  console.log("Included Sayh plans");
  console.table(plan.includedPlans);
  console.log("Included Sayh cycles");
  console.table(plan.includedCycles);
  console.log("Inferred Sayh evaluators");
  console.table(plan.inferredSayhEvaluators);

  console.log("New Sayh targetAssignments to create");
  console.table(groupCounts(plan.targetCreates, (item) => item.planId));
  console.log("New Sayh evaluatorAssignments to create");
  console.table(groupCounts(plan.evaluatorCreates, (item) => [
    item.planId,
    item.cycleId,
    item.evaluatorRoleKey,
    item.evaluatorPersonId,
  ].join(" | ")));
  console.log("Already existing Khaled Sayh assignments");
  console.table(groupCounts(plan.alreadyExisting, (item) => [
    item.type,
    text(item.data.planId),
    text(item.data.cycleId),
    text(item.data.evaluatorRoleKey),
  ].join(" | ")));

  const removeTargets = plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments");
  const removeEvaluators = plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments");
  console.log({
    oldFalehTargetAssignmentsToMarkRemoved: removeTargets.filter((item) => item.sourceSchoolId === CONFIG.fromSchoolId).length,
    oldFalehEvaluatorAssignmentsToMarkRemoved: removeEvaluators.filter((item) => item.sourceSchoolId === CONFIG.fromSchoolId).length,
    oldSayhTargetAssignmentsToMarkRemoved: removeTargets.filter((item) => item.sourceSchoolId === CONFIG.toSchoolId).length,
    oldSayhEvaluatorAssignmentsToMarkRemoved: removeEvaluators.filter((item) => item.sourceSchoolId === CONFIG.toSchoolId).length,
    sayhTargetAssignmentsToCreate: plan.targetCreates.length,
    sayhEvaluatorAssignmentsToCreate: plan.evaluatorCreates.length,
    alreadyExistingKhaledSayhAssignments: plan.alreadyExisting.length,
    conflicts: plan.conflicts.length,
    safetyCounters: plan.safety.counters,
    decision: plan.decision,
  });

  if (plan.conflicts.length > 0) {
    console.log("Conflicts grouped by reason");
    console.table(groupCounts(plan.conflicts, conflictReason));
    console.log("Conflicts");
    console.table(plan.conflicts.map((message) => ({ reason: conflictReason(message), message })));
  }
}

async function applyPlan(db, plan) {
  if (plan.decision !== "SAFE TO APPLY") {
    console.log({ decision: "NOT APPLIED" });
    process.exitCode = 1;
    return;
  }

  const batch = db.batch();
  for (const write of plan.writes) {
    const ref = db.doc(write.path);
    if (write.action === "CREATE") batch.create(ref, write.data);
    if (write.action === "REMOVE") batch.update(ref, write.data);
  }
  await batch.commit();

  console.log({
    removedOldFalehTargetAssignments: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments" && item.sourceSchoolId === CONFIG.fromSchoolId).length,
    removedOldFalehEvaluatorAssignments: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments" && item.sourceSchoolId === CONFIG.fromSchoolId).length,
    removedOldSayhTargetAssignments: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments" && item.sourceSchoolId === CONFIG.toSchoolId).length,
    removedOldSayhEvaluatorAssignments: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments" && item.sourceSchoolId === CONFIG.toSchoolId).length,
    createdSayhTargetAssignments: plan.targetCreates.length,
    createdSayhEvaluatorAssignments: plan.evaluatorCreates.length,
    skippedAlreadyExisting: plan.alreadyExisting.length,
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
  await applyPlan(db, plan);
}

main().catch((error) => {
  console.error("Reset and seed failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
