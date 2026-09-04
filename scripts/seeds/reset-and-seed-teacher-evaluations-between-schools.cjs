/* eslint-disable no-console */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ARGUMENTS = parseArguments(process.argv.slice(2));
const APPLY = process.argv.includes("--apply");
const CONFIG = {
  orgId: "takween",
  email: ARGUMENTS.email,
  fromSchoolId: ARGUMENTS.from,
  toSchoolId: ARGUMENTS.to,
  repairKey: `reset-seed-${safeId(ARGUMENTS.email)}-${safeId(ARGUMENTS.to)}`,
};

const EVALUATION_COLLECTIONS = new Set([
  "evaluationTargetAssignments",
  "evaluationEvaluatorAssignments",
]);

function parseArguments(argv) {
  const values = {};
  for (const name of ["email", "from", "to"]) {
    const prefix = `--${name}=`;
    const argument = argv.find((value) => value.startsWith(prefix));
    values[name] = argument ? argument.slice(prefix.length).trim() : "";
  }
  const missing = ["email", "from", "to"].filter((name) => !values[name]);
  if (missing.length > 0 || (values.from && values.from === values.to)) {
    console.error("Required usage:");
    console.error("node .\\scripts\\seeds\\reset-and-seed-teacher-evaluations-between-schools.cjs --email=<email> --from=<sourceSchoolId> --to=<destinationSchoolId> [--apply]");
    if (missing.length > 0) console.error(`Missing required arguments: ${missing.map((name) => `--${name}`).join(", ")}.`);
    if (values.from && values.from === values.to) console.error("--from and --to must be different schools.");
    process.exit(1);
  }
  return values;
}

function safeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) throw new Error(`service-account.json was not found: ${serviceAccountPath}`);
  admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
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
  return statusOf(data) === "ACTIVE" && data.isActive !== false && data.active !== false;
}

function isLivePlanOrCycle(data) {
  return data.isActive !== false && data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(statusOf(data));
}

function dataWithId(document) {
  return { id: document.id, path: document.ref.path, ref: document.ref, data: document.data() || {} };
}

function groupCounts(items, keyBuilder) {
  return Array.from(items.reduce((groups, item) => {
    const key = keyBuilder(item) || "(empty)";
    groups.set(key, (groups.get(key) || 0) + 1);
    return groups;
  }, new Map()).entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function conflictReason(message) {
  const value = text(message);
  const prefixes = [
    ["Identity", "IDENTITY"],
    ["Teacher has no ACTIVE", "NO_ACTIVE_DESTINATION_TEACHER_ASSIGNMENT"],
    ["Submitted or approved", "SUBMITTED_OR_APPROVED_SUBMISSION"],
    ["Cannot prove", "MISSING_PLAN_OR_CYCLE"],
    ["No comparable", "NO_COMPARABLE_DESTINATION_PATTERN"],
    ["Comparable", "COMPARABLE_PATTERN_CONFLICT"],
    ["Admin/principal", "NON_TEACHER_TARGET_ASSIGNMENT"],
    ["Sayh", "DESTINATION_ASSIGNMENT_CONFLICT"],
    ["Fresh repair", "REPAIR_ID_CONFLICT"],
    ["Write", "WRITE_SCOPE"],
    ["Creation", "WRITE_SCOPE"],
    ["Removal", "WRITE_SCOPE"],
  ];
  const match = prefixes.find(([prefix]) => value.startsWith(prefix));
  return match ? match[1] : value.split(":")[0] || "UNCLASSIFIED";
}

function evaluatorKey(data) {
  return [text(data.evaluatorPersonId), text(data.evaluatorRoleKey), String(data.weight ?? "")].join("\u001f");
}

function contextKey(data) {
  return [text(data.planId), text(data.cycleId), text(data.evaluatorRoleKey)].join("\u001f");
}

function assignmentKey(data) {
  return [text(data.planId), text(data.cycleId), text(data.evaluatorRoleKey), text(data.evaluatorPersonId)].join(" | ");
}

function mapSourceId(value, label, conflicts) {
  const source = text(value);
  if (!source.includes(CONFIG.fromSchoolId)) {
    conflicts.push(`${label} does not contain source school ${CONFIG.fromSchoolId}: ${source || "(empty)"}.`);
    return "";
  }
  const mapped = source.replace(CONFIG.fromSchoolId, CONFIG.toSchoolId);
  if (!mapped || mapped.includes(CONFIG.fromSchoolId)) {
    conflicts.push(`${label} could not be mapped safely: ${source}.`);
    return "";
  }
  return mapped;
}

function isTeacherPlan(assignmentData, plan) {
  return text(assignmentData.targetKind || plan?.data?.targetKind).toUpperCase() === "TEACHER";
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
  if (normalizeEmail(authUser.email) !== normalizeEmail(CONFIG.email)) {
    conflicts.push("Identity: Firebase Auth email does not exactly match --email.");
    return null;
  }

  const userPath = `users/${authUser.uid}`;
  const [userSnapshot, userMatches] = await Promise.all([
    db.doc(userPath).get(),
    queryByField(db, "users", "email", CONFIG.email),
  ]);
  if (!userSnapshot.exists || userMatches.length !== 1 || userMatches[0].id !== authUser.uid) {
    conflicts.push("Identity: users email resolution is missing or ambiguous.");
    return null;
  }
  const user = dataWithId(userSnapshot);
  const personId = text(user.data.personId);
  if (!personId || normalizeEmail(user.data.email) !== normalizeEmail(CONFIG.email)) {
    conflicts.push("Identity: resolved user has no matching email/personId.");
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
  if (normalizeEmail(person.data.email) !== normalizeEmail(CONFIG.email)) {
    conflicts.push("Identity: resolved person email does not exactly match --email.");
    return null;
  }
  return {
    uid: authUser.uid,
    personId,
    email: text(authUser.email) || CONFIG.email,
    displayName: text(person.data.displayName) || text(user.data.displayName),
    user,
    person,
  };
}

function actionRow({ action, collection, document, sourceData, data, planTargetKind, mappedPlanVerified, mappedCycleVerified, inferredEvaluator = false, reason }) {
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
    planTargetKind: text(planTargetKind),
    mappedPlanVerified: Boolean(mappedPlanVerified),
    mappedCycleVerified: Boolean(mappedCycleVerified),
    inferredEvaluator,
    data,
    reason,
  };
}

function freshId(canonicalId, existingDocuments) {
  const id = `${canonicalId}-${CONFIG.repairKey}`;
  return existingDocuments.some((document) => document.id === id) ? null : id;
}

function buildTargetPayload({ teacher, plan, exemplar, id, now }) {
  return {
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
    createsOutsideDestination: 0,
    removesOutsideTransferSchools: 0,
    touchesOtherTeacher: 0,
    touchesGirls: 0,
    touchesKindergarten: 0,
    touchesNonTeacherTarget: 0,
    missingPlanOrCycle: 0,
    submittedOrApprovedSubmissions: plan.submissions.filter((item) => ["SUBMITTED", "APPROVED"].includes(statusOf(item.data))).length,
    forbiddenCollection: 0,
    duplicateWrites: 0,
    sourceTargetRemovals: 0,
    destinationTargetRemovals: 0,
    sourceEvaluatorRemovals: 0,
    destinationEvaluatorRemovals: 0,
    destinationTargetCreates: 0,
    destinationEvaluatorCreates: 0,
  };
  const seenWrites = new Set();

  for (const write of plan.writes) {
    const source = write.sourceData || {};
    const schoolId = text(source.schoolId);
    const targetPersonId = text(source.targetPersonId);
    const targetKind = text(source.targetKind || write.planTargetKind).toUpperCase();
    const isCreate = write.action === "CREATE";
    const isRemove = write.action === "REMOVE";
    const key = `${write.action}\u001f${write.path}`;
    if (seenWrites.has(key)) {
      counters.duplicateWrites += 1;
      violations.push(`Write: duplicate planned write ${write.path}.`);
    }
    seenWrites.add(key);

    if (!EVALUATION_COLLECTIONS.has(write.collection)) {
      counters.forbiddenCollection += 1;
      violations.push(`Write: forbidden collection ${write.collection}.`);
    }
    if (schoolId.includes("mrb-girls")) {
      counters.touchesGirls += 1;
      violations.push(`Write: touches mrb-girls at ${write.path}.`);
    }
    if (schoolId.includes("kindergarten") || schoolId.includes("-kg") || schoolId.includes("kg-")) {
      counters.touchesKindergarten += 1;
      violations.push(`Write: touches kindergarten at ${write.path}.`);
    }
    if (targetPersonId !== plan.teacher.personId) {
      counters.touchesOtherTeacher += 1;
      violations.push(`Write: targets another teacher at ${write.path}.`);
    }
    if (targetKind !== "TEACHER") {
      counters.touchesNonTeacherTarget += 1;
      violations.push(`Write: targetKind is not TEACHER at ${write.path}.`);
    }

    if (isCreate) {
      if (schoolId !== CONFIG.toSchoolId) {
        counters.createsOutsideDestination += 1;
        violations.push(`Creation: schoolId is not ${CONFIG.toSchoolId} at ${write.path}.`);
      }
      if (statusOf(source) !== "ACTIVE") violations.push(`Creation: status is not ACTIVE at ${write.path}.`);
      if (!write.mappedPlanVerified) {
        counters.missingPlanOrCycle += 1;
        violations.push(`Creation: destination plan is not proven at ${write.path}.`);
      }
      if (write.collection === "evaluationEvaluatorAssignments" && (!text(source.cycleId) || !write.mappedCycleVerified)) {
        counters.missingPlanOrCycle += 1;
        violations.push(`Creation: destination cycle is not proven at ${write.path}.`);
      }
      if (write.collection === "evaluationEvaluatorAssignments" && !write.inferredEvaluator) {
        violations.push(`Creation: destination evaluator was not inferred safely at ${write.path}.`);
      }
      if (schoolId === CONFIG.toSchoolId && targetPersonId === plan.teacher.personId && targetKind === "TEACHER") {
        if (write.collection === "evaluationTargetAssignments") counters.destinationTargetCreates += 1;
        if (write.collection === "evaluationEvaluatorAssignments") counters.destinationEvaluatorCreates += 1;
      }
    }

    if (isRemove) {
      if (schoolId !== CONFIG.fromSchoolId) {
        counters.removesOutsideTransferSchools += 1;
        violations.push(`Removal: schoolId is not the source school ${CONFIG.fromSchoolId} at ${write.path}.`);
      }
      if (statusOf(source) !== "ACTIVE") violations.push(`Removal: source is not currently ACTIVE at ${write.path}.`);
      if (statusOf(write.data) !== "REMOVED") violations.push(`Removal: status is not REMOVED at ${write.path}.`);
      if (schoolId === CONFIG.fromSchoolId && write.collection === "evaluationTargetAssignments") counters.sourceTargetRemovals += 1;
      if (schoolId === CONFIG.fromSchoolId && write.collection === "evaluationEvaluatorAssignments") counters.sourceEvaluatorRemovals += 1;
    }
  }
  if (counters.submittedOrApprovedSubmissions > 0) violations.push("Submitted or approved evaluation submissions exist in the reset scope.");
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
      oldSourceTargetAssignments: [],
      oldSourceEvaluatorAssignments: [],
      oldDestinationTargetAssignments: [],
      oldDestinationEvaluatorAssignments: [],
      sourcePatterns: [],
      includedPlans: [],
      includedCycles: [],
      inferredDestinationEvaluators: [],
      targetCreates: [],
      evaluatorCreates: [],
      alreadyExisting: [],
      writes: [],
      conflicts,
    };
  }

  const [
    teacherAssignments,
    teacherTargets,
    teacherEvaluators,
    submissions,
    destinationTeacherAssignments,
    destinationTargets,
    destinationEvaluators,
    planSnapshot,
    cycleSnapshot,
  ] = await Promise.all([
    queryByField(db, `${orgRoot}/teacherAssignments`, "teacherPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/evaluationSubmissions`, "targetPersonId", teacher.personId),
    queryByField(db, `${orgRoot}/teacherAssignments`, "schoolId", CONFIG.toSchoolId),
    queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "schoolId", CONFIG.toSchoolId),
    queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "schoolId", CONFIG.toSchoolId),
    db.collection(`${orgRoot}/evaluationPlans`).get(),
    db.collection(`${orgRoot}/evaluationCycles`).get(),
  ]);
  const allPlans = planSnapshot.docs.map(dataWithId);
  const allCycles = cycleSnapshot.docs.map(dataWithId);
  const plansById = new Map(allPlans.map((item) => [item.id, item]));
  const cyclesById = new Map(allCycles.map((item) => [item.id, item]));

  const teacherAssignmentEvidence = teacherAssignments.filter((item) => [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)));
  if (!teacherAssignments.some((item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data))) {
    conflicts.push(`Teacher has no ACTIVE teacherAssignment in destination school ${CONFIG.toSchoolId}.`);
  }

  const scopedSubmissions = submissions.filter((item) => [CONFIG.fromSchoolId, CONFIG.toSchoolId].includes(text(item.data.schoolId)));
  if (scopedSubmissions.some((item) => ["SUBMITTED", "APPROVED"].includes(statusOf(item.data)))) {
    conflicts.push("Submitted or approved evaluation submissions exist in the reset scope.");
  }

  const sourceActiveTargets = teacherTargets.filter((item) => text(item.data.schoolId) === CONFIG.fromSchoolId && isActiveAssignment(item.data));
  const sourceActiveEvaluators = teacherEvaluators.filter((item) => text(item.data.schoolId) === CONFIG.fromSchoolId && isActiveAssignment(item.data));
  const sourcePlanIds = Array.from(new Set([
    ...sourceActiveTargets.map((item) => text(item.data.planId)),
    ...sourceActiveEvaluators.map((item) => text(item.data.planId)),
  ].filter(Boolean)));
  const sourcePlanToDestinationPlan = new Map();
  const includedPlans = [];
  const includedPlanById = new Map();
  const sourceTargetByPlan = new Map();
  for (const sourcePlanId of sourcePlanIds) {
    const sourcePlan = plansById.get(sourcePlanId);
    const destinationPlanId = mapSourceId(sourcePlanId, "Source planId", conflicts);
    const destinationPlan = plansById.get(destinationPlanId);
    if (!sourcePlan || text(sourcePlan.data.schoolId) !== CONFIG.fromSchoolId) {
      conflicts.push(`Cannot prove the source plan exists in the source school: ${sourcePlanId}.`);
    }
    if (!destinationPlan || text(destinationPlan.data.schoolId) !== CONFIG.toSchoolId || !isLivePlanOrCycle(destinationPlan.data) || !isTeacherPlan({}, destinationPlan)) {
      conflicts.push(`Cannot prove a live destination TEACHER plan exists: ${destinationPlanId || sourcePlanId}.`);
      continue;
    }
    if (sourcePlan && destinationPlan) {
      for (const field of ["academicYearId", "termId", "planKind"]) {
        const sourceValue = text(sourcePlan.data[field]);
        const destinationValue = text(destinationPlan.data[field]);
        if (sourceValue && destinationValue && sourceValue !== destinationValue) conflicts.push(`Destination plan ${destinationPlan.id} has a different ${field} than source plan ${sourcePlan.id}.`);
      }
    }
    sourcePlanToDestinationPlan.set(sourcePlanId, destinationPlan);
    includedPlans.push(destinationPlan);
    includedPlanById.set(destinationPlan.id, destinationPlan);
    const sourceTarget = sourceActiveTargets.find((item) => text(item.data.planId) === sourcePlanId);
    if (sourceTarget) sourceTargetByPlan.set(destinationPlan.id, sourceTarget);
  }
  if (includedPlans.length === 0) conflicts.push("No destination TEACHER evaluation plan could be mapped from the teacher's source assignments.");

  const destinationTeacherPeople = new Set(destinationTeacherAssignments.filter(isActiveAssignment).map((item) => text(item.data.teacherPersonId)).filter(Boolean));
  const sourceEvaluatorPatterns = new Map();
  for (const sourceAssignment of sourceActiveEvaluators) {
    const sourcePlanId = text(sourceAssignment.data.planId);
    const destinationPlan = sourcePlanToDestinationPlan.get(sourcePlanId);
    const sourceCycleId = text(sourceAssignment.data.cycleId);
    const destinationCycleId = mapSourceId(sourceCycleId, "Source cycleId", conflicts);
    const destinationCycle = cyclesById.get(destinationCycleId);
    if (!destinationPlan || !destinationCycle || text(destinationCycle.data.planId) !== destinationPlan.id || (text(destinationCycle.data.schoolId) && text(destinationCycle.data.schoolId) !== CONFIG.toSchoolId) || !isLivePlanOrCycle(destinationCycle.data)) {
      conflicts.push(`Cannot prove a matching destination cycle exists for ${sourceCycleId}: ${destinationCycleId || "(empty)"}.`);
      continue;
    }
    const key = `${destinationPlan.id}\u001f${destinationCycle.id}\u001f${text(sourceAssignment.data.evaluatorRoleKey)}`;
    const records = sourceEvaluatorPatterns.get(key) || [];
    records.push({ sourceAssignment, destinationPlan, destinationCycle });
    sourceEvaluatorPatterns.set(key, records);
  }

  const sourcePatterns = [];
  const inferredDestinationEvaluators = [];
  const patternByContext = new Map();
  for (const [key, records] of sourceEvaluatorPatterns) {
    const first = records[0];
    const roleKey = text(first.sourceAssignment.data.evaluatorRoleKey);
    const candidates = destinationEvaluators.filter((item) =>
      isActiveAssignment(item.data) &&
      text(item.data.schoolId) === CONFIG.toSchoolId &&
      text(item.data.planId) === first.destinationPlan.id &&
      text(item.data.cycleId) === first.destinationCycle.id &&
      text(item.data.evaluatorRoleKey) === roleKey &&
      destinationTeacherPeople.has(text(item.data.targetPersonId)) &&
      text(item.data.evaluatorPersonId),
    );
    const byEvaluator = new Map();
    for (const candidate of candidates) {
      const evaluatorPersonId = text(candidate.data.evaluatorPersonId);
      const existing = byEvaluator.get(evaluatorPersonId) || [];
      existing.push(candidate);
      byEvaluator.set(evaluatorPersonId, existing);
    }
    if (byEvaluator.size !== 1) {
      conflicts.push(`Destination evaluator inference requires exactly one evaluatorPersonId for ${first.destinationPlan.id}/${first.destinationCycle.id}/${roleKey || "(no role key)"}; found ${byEvaluator.size}.`);
      continue;
    }
    const candidateRecords = Array.from(byEvaluator.values())[0];
    const conventionKeys = new Set(candidateRecords.map((item) => evaluatorKey(item.data)));
    if (conventionKeys.size !== 1) {
      conflicts.push(`Destination evaluator has conflicting weight conventions for ${key}.`);
      continue;
    }
    const evaluator = candidateRecords[0].data;
    const pattern = {
      key,
      sourcePlanId: text(first.sourceAssignment.data.planId),
      sourceCycleId: text(first.sourceAssignment.data.cycleId),
      planId: first.destinationPlan.id,
      cycleId: first.destinationCycle.id,
      evaluatorRoleKey: roleKey,
      evaluator,
      sourceAssignments: records.map((item) => item.sourceAssignment),
      sourceExemplar: records[0].sourceAssignment,
      destinationPlan: first.destinationPlan,
      destinationCycle: first.destinationCycle,
    };
    sourcePatterns.push(pattern);
    patternByContext.set(key, pattern);
    inferredDestinationEvaluators.push({
      planId: pattern.planId,
      cycleId: pattern.cycleId,
      evaluatorRoleKey: roleKey,
      evaluatorPersonId: text(evaluator.evaluatorPersonId),
      weight: evaluator.weight,
      sourceAssignmentIds: records.map((item) => item.sourceAssignment.id),
    });
  }

  const repairSuffix = `-${CONFIG.repairKey}`;
  const oldSourceTargetAssignments = sourceActiveTargets;
  const oldSourceEvaluatorAssignments = sourceActiveEvaluators;
  const oldDestinationTargetAssignments = [];
  const oldDestinationEvaluatorAssignments = [];
  const activeDestinationTargetsForTeacher = teacherTargets.filter((item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data));
  const activeDestinationEvaluatorsForTeacher = teacherEvaluators.filter((item) => text(item.data.schoolId) === CONFIG.toSchoolId && isActiveAssignment(item.data));

  for (const item of [...oldSourceTargetAssignments, ...oldSourceEvaluatorAssignments]) {
    const plan = plansById.get(text(item.data.planId));
    if (!isTeacherPlan(item.data, plan)) conflicts.push(`Admin/principal target assignment is in the reset scope: ${item.path}.`);
  }
  for (const item of activeDestinationTargetsForTeacher) {
    const plan = plansById.get(text(item.data.planId));
    if (!isTeacherPlan(item.data, plan)) conflicts.push(`Destination admin/principal target assignment is present for the teacher: ${item.path}.`);
  }

  const writes = [];
  const alreadyExisting = [];
  const targetCreates = [];
  const evaluatorCreates = [];
  const now = Date.now();
  const targetDocuments = destinationTargets;
  const evaluatorDocuments = destinationEvaluators;

  for (const plan of includedPlans) {
    const activeExisting = activeDestinationTargetsForTeacher.filter((item) => text(item.data.planId) === plan.id && isTeacherPlan(item.data, plan));
    if (activeExisting.length > 1) {
      conflicts.push(`Destination target assignment is duplicated for ${plan.id}.`);
      continue;
    }
    if (activeExisting.length === 1) {
      alreadyExisting.push({ type: "TARGET", ...activeExisting[0] });
      continue;
    }
    const exemplar = sourceTargetByPlan.get(plan.id);
    if (!exemplar) {
      conflicts.push(`Source target assignment pattern is missing for mapped destination plan ${plan.id}.`);
      continue;
    }
    const canonicalId = `${plan.id}-target-${teacher.personId}`;
    const id = freshId(canonicalId, targetDocuments);
    if (!id) {
      conflicts.push(`Fresh repair target ID already exists and cannot be reused: ${id || `${canonicalId}-${CONFIG.repairKey}`}.`);
      continue;
    }
    const payload = buildTargetPayload({ teacher, plan, exemplar, id, now });
    targetCreates.push({ planId: plan.id, path: `${orgRoot}/evaluationTargetAssignments/${id}`, data: payload });
    writes.push(actionRow({
      action: "CREATE",
      collection: "evaluationTargetAssignments",
      document: { id, path: `${orgRoot}/evaluationTargetAssignments/${id}` },
      sourceData: payload,
      data: payload,
      planTargetKind: "TEACHER",
      mappedPlanVerified: true,
      mappedCycleVerified: true,
      reason: `Create fresh destination target assignment from comparable teacher pattern for ${plan.id}.`,
    }));
  }

  for (const pattern of sourcePatterns) {
    const activeExisting = activeDestinationEvaluatorsForTeacher.filter((item) =>
      text(item.data.planId) === pattern.planId &&
      text(item.data.cycleId) === pattern.cycleId &&
      evaluatorKey(item.data) === evaluatorKey(pattern.evaluator),
    );
    if (activeExisting.length > 1) {
      conflicts.push(`Destination evaluator assignment is duplicated for ${pattern.key}.`);
      continue;
    }
    if (activeExisting.length === 1) {
      alreadyExisting.push({ type: "EVALUATOR", ...activeExisting[0] });
      continue;
    }
    const evaluator = pattern.evaluator;
    const canonicalId = `${pattern.cycleId}-${teacher.personId}-${text(evaluator.evaluatorPersonId)}`;
    const id = freshId(canonicalId, evaluatorDocuments);
    if (!id) {
      conflicts.push(`Fresh repair evaluator ID already exists and cannot be reused: ${canonicalId}-${CONFIG.repairKey}.`);
      continue;
    }
    const payload = buildEvaluatorPayload({ teacher, plan: pattern.destinationPlan, cycle: pattern.destinationCycle, exemplar: pattern.sourceExemplar, evaluator, id, now });
    evaluatorCreates.push({ planId: pattern.planId, cycleId: pattern.cycleId, evaluatorRoleKey: text(evaluator.evaluatorRoleKey), evaluatorPersonId: text(evaluator.evaluatorPersonId), path: `${orgRoot}/evaluationEvaluatorAssignments/${id}`, data: payload });
    writes.push(actionRow({
      action: "CREATE",
      collection: "evaluationEvaluatorAssignments",
      document: { id, path: `${orgRoot}/evaluationEvaluatorAssignments/${id}` },
      sourceData: payload,
      data: payload,
      planTargetKind: "TEACHER",
      mappedPlanVerified: true,
      mappedCycleVerified: true,
      inferredEvaluator: true,
      reason: `Create fresh destination evaluator assignment from source pattern ${pattern.key}.`,
    }));
  }

  for (const item of [...oldSourceTargetAssignments, ...oldDestinationTargetAssignments]) {
    const plan = plansById.get(text(item.data.planId));
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationTargetAssignments",
      document: item,
      sourceData: item.data,
      data: { status: "REMOVED", removedAt: now, removalReason: `Beginning-of-year reset for ${teacher.email}.`, updatedAt: now },
      planTargetKind: plan?.data?.targetKind,
      mappedPlanVerified: Boolean(plan),
      mappedCycleVerified: true,
      reason: "Mark old active target assignment REMOVED without deleting it.",
    }));
  }
  for (const item of [...oldSourceEvaluatorAssignments, ...oldDestinationEvaluatorAssignments]) {
    const plan = plansById.get(text(item.data.planId));
    const cycle = cyclesById.get(text(item.data.cycleId));
    writes.push(actionRow({
      action: "REMOVE",
      collection: "evaluationEvaluatorAssignments",
      document: item,
      sourceData: item.data,
      data: { status: "REMOVED", removedAt: now, removalReason: `Beginning-of-year reset for ${teacher.email}.`, updatedAt: now },
      planTargetKind: plan?.data?.targetKind,
      mappedPlanVerified: Boolean(plan),
      mappedCycleVerified: Boolean(cycle),
      reason: "Mark old active evaluator assignment REMOVED without deleting it.",
    }));
  }

  const plan = {
    cliArgs: { email: CONFIG.email, from: CONFIG.fromSchoolId, to: CONFIG.toSchoolId, apply: APPLY },
    currentUseCase: CONFIG.fromSchoolId === "mrb-boys-faleh" && CONFIG.toSchoolId === "mrb-boys-sayh",
    teacher,
    teacherAssignments: teacherAssignmentEvidence,
    submissions: scopedSubmissions,
    oldSourceTargetAssignments,
    oldSourceEvaluatorAssignments,
    oldDestinationTargetAssignments,
    oldDestinationEvaluatorAssignments,
    sourcePatterns,
    includedPlans: includedPlans.map((item) => ({ id: item.id, title: text(item.data.title), schoolId: text(item.data.schoolId), academicYearId: text(item.data.academicYearId), termId: text(item.data.termId), targetKind: text(item.data.targetKind), planKind: text(item.data.planKind), frameworkId: text(item.data.frameworkId) })),
    includedCycles: sourcePatterns.map((item) => ({ id: item.destinationCycle.id, planId: item.planId, status: statusOf(item.destinationCycle.data) })).filter((item, index, items) => items.findIndex((entry) => entry.id === item.id) === index),
    inferredDestinationEvaluators: inferredDestinationEvaluators.map((item) => item),
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
  console.log("CLI args");
  console.log(plan.cliArgs);
  console.log("Teacher resolved data");
  console.table([plan.teacher]);
  console.log({ sourceSchool: CONFIG.fromSchoolId, destinationSchool: CONFIG.toSchoolId, currentUseCase: plan.currentUseCase, noGirlsOrKindergartenScope: !CONFIG.fromSchoolId.includes("girls") && !CONFIG.toSchoolId.includes("girls") && !CONFIG.fromSchoolId.includes("kg") && !CONFIG.toSchoolId.includes("kg") });

  console.log("TeacherAssignments evidence in source/destination");
  console.table(plan.teacherAssignments.map((item) => ({ id: item.id, schoolId: text(item.data.schoolId), academicYearId: text(item.data.academicYearId), termId: text(item.data.termId), assignmentKind: text(item.data.assignmentKind), status: statusOf(item.data) })));
  console.log("Submissions found by school/plan/status");
  console.table(groupCounts(plan.submissions, (item) => [text(item.data.schoolId), text(item.data.planId), statusOf(item.data)].join(" | ")));

  console.log("Old source-school targetAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldSourceTargetAssignments, (item) => text(item.data.planId)));
  console.log("Old source-school evaluatorAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldSourceEvaluatorAssignments, (item) => assignmentKey(item.data)));
  console.log("Old destination-school targetAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldDestinationTargetAssignments, (item) => text(item.data.planId)));
  console.log("Old destination-school evaluatorAssignments to mark REMOVED");
  console.table(groupCounts(plan.oldDestinationEvaluatorAssignments, (item) => assignmentKey(item.data)));
  console.log("Source assignments used as pattern");
  console.table(plan.sourcePatterns.map((item) => ({ planId: item.planId, cycleId: item.cycleId, evaluatorRoleKey: item.evaluatorRoleKey, sourceAssignmentIds: item.sourceAssignments.map((source) => source.id).join(","), evaluatorPersonId: text(item.evaluator.evaluatorPersonId) })));
  console.log("Included destination-school plans");
  console.table(plan.includedPlans);
  console.log("Included destination-school cycles");
  console.table(plan.includedCycles);
  console.log("Inferred destination-school evaluators");
  console.table(plan.inferredDestinationEvaluators);
  console.log("New destination-school targetAssignments to create");
  console.table(groupCounts(plan.targetCreates, (item) => item.planId));
  console.log("New destination-school evaluatorAssignments to create");
  console.table(groupCounts(plan.evaluatorCreates, (item) => [item.planId, item.cycleId, item.evaluatorRoleKey, item.evaluatorPersonId].join(" | ")));
  console.log("Already existing destination-school assignments");
  console.table(groupCounts(plan.alreadyExisting, (item) => [item.type, text(item.data.planId), text(item.data.cycleId), text(item.data.evaluatorRoleKey)].join(" | ")));

  console.log({
    oldSourceTargetAssignmentsToMarkRemoved: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments" && item.sourceSchoolId === CONFIG.fromSchoolId).length,
    oldSourceEvaluatorAssignmentsToMarkRemoved: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments" && item.sourceSchoolId === CONFIG.fromSchoolId).length,
    oldDestinationTargetAssignmentsToMarkRemoved: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationTargetAssignments" && item.sourceSchoolId === CONFIG.toSchoolId).length,
    oldDestinationEvaluatorAssignmentsToMarkRemoved: plan.writes.filter((item) => item.action === "REMOVE" && item.collection === "evaluationEvaluatorAssignments" && item.sourceSchoolId === CONFIG.toSchoolId).length,
    newDestinationTargetAssignmentsToCreate: plan.targetCreates.length,
    newDestinationEvaluatorAssignmentsToCreate: plan.evaluatorCreates.length,
    alreadyExistingDestinationAssignments: plan.alreadyExisting.length,
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
    removedOldSourceTargetAssignments: plan.safety.counters.sourceTargetRemovals,
    removedOldSourceEvaluatorAssignments: plan.safety.counters.sourceEvaluatorRemovals,
    removedOldDestinationTargetAssignments: plan.safety.counters.destinationTargetRemovals,
    removedOldDestinationEvaluatorAssignments: plan.safety.counters.destinationEvaluatorRemovals,
    createdDestinationTargetAssignments: plan.safety.counters.destinationTargetCreates,
    createdDestinationEvaluatorAssignments: plan.safety.counters.destinationEvaluatorCreates,
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
