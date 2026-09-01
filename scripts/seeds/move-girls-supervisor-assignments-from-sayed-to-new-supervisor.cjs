/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  academicYearId: "ay-1448",
  termId: "term-1",
  sourcePlanIds: [
    "mrb-girls-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
    "mrb-girls-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
  ],
  currentEvaluator: {
    uid: "aa3uDx6i5uf6Dp5YP3unAqD5Zyo1",
    personId: "p-s-sayed",
    email: "s.sayed@qz.org.sa",
    roleKey: "EDU_SUPERVISOR",
  },
  newEvaluator: {
    uid: "ZKSVVOeoJOhUhIu4HDFapMwApo83",
    personId: "staff-ZKSVVOeoJOhUhIu4HDFapMwApo83",
    roleKey: "EDU_SUPERVISOR",
  },
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

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function normalizeSchoolId(value) {
  const schoolId = asString(value);
  return SCHOOL_ID_ALIASES[schoolId] || schoolId;
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}

function membershipCoversSchool(data) {
  return (
    normalizeSchoolId(data.schoolId) === CONFIG.schoolId ||
    normalizeSchoolId(data.scopeId) === CONFIG.schoolId ||
    data.scopes?.schoolIds?.some((schoolId) => normalizeSchoolId(schoolId) === CONFIG.schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function assignmentKey(data) {
  return [
    asString(data.planId),
    asString(data.cycleId),
    asString(data.targetPersonId),
    asString(data.evaluatorPersonId),
  ].join("|");
}

function sourceScopeMatches(data) {
  return (
    normalizeSchoolId(data.schoolId) === CONFIG.schoolId &&
    asString(data.academicYearId) === CONFIG.academicYearId &&
    asString(data.termId) === CONFIG.termId &&
    CONFIG.sourcePlanIds.includes(asString(data.planId))
  );
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadEvaluator(db, orgRoot, evaluator, expectedEmail) {
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();
  const emails = [authUser.email, userData.email, personData.email].map(normalizeEmail).filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  const roleKey = asString(membershipData.roleKey || membershipData.role).toUpperCase();
  const operation = operations.docs.find((document) => {
    const data = document.data();
    return (
      isActive(data) &&
      asString(data.operationKind) === "STAFF_EVALUATION" &&
      normalizeSchoolId(data.schoolId || data.scopeId) === CONFIG.schoolId
    );
  });

  assert(asString(userData.personId) === evaluator.personId, `User personId mismatch for ${evaluator.personId}.`);
  assert(asString(membershipData.personId) === evaluator.personId, `Membership personId mismatch for ${evaluator.personId}.`);
  assert(uniqueEmails.length === 1, `Email identity is incomplete or inconsistent for ${evaluator.personId}.`);
  if (expectedEmail) assert(uniqueEmails[0] === expectedEmail, `Email mismatch for ${evaluator.personId}.`);
  assert(roleKey === evaluator.roleKey, `Role mismatch for ${evaluator.personId}.`);
  assert(isActive(membershipData) && membershipCoversSchool(membershipData), `Membership/school scope mismatch for ${evaluator.personId}.`);
  assert(operation, `Missing active Manar Girls STAFF_EVALUATION operation for ${evaluator.personId}.`);

  return {
    uid: evaluator.uid,
    personId: evaluator.personId,
    email: uniqueEmails[0],
    displayName: asString(personData.displayName),
    roleKey,
  };
}

async function loadSourcePlans(db, orgRoot) {
  const snapshots = await db.getAll(...CONFIG.sourcePlanIds.map((planId) => db.doc(`${orgRoot}/evaluationPlans/${planId}`)));
  snapshots.forEach((snapshot) => {
    assert(snapshot.exists, `Source plan not found: ${snapshot.ref.path}`);
    const data = snapshot.data();
    assert(
      normalizeSchoolId(data.schoolId) === CONFIG.schoolId &&
        asString(data.academicYearId) === CONFIG.academicYearId &&
        asString(data.termId) === CONFIG.termId &&
        asString(data.planKind) &&
        asString(data.targetKind) === "TEACHER",
      `Source plan scope/shape mismatch: ${snapshot.ref.path}`,
    );
  });
}

function stripMutableSourceFields(data) {
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

function buildReplacement(source, newEvaluator) {
  const sourceData = source.data();
  const weight = Number(sourceData.weight);
  assert(Number.isFinite(weight) && weight > 0, `Source assignment has invalid weight: ${source.ref.path}`);
  const replacementId = `${asString(sourceData.cycleId)}-${asString(sourceData.targetPersonId)}-${newEvaluator.personId}`;
  return {
    id: replacementId,
    path: source.ref.parent.doc(replacementId).path,
    data: {
      ...stripMutableSourceFields(sourceData),
      id: replacementId,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: asString(sourceData.planId),
      cycleId: asString(sourceData.cycleId),
      targetPersonId: asString(sourceData.targetPersonId),
      evaluatorPersonId: newEvaluator.personId,
      evaluatorEmail: newEvaluator.email,
      evaluatorRoleKey: newEvaluator.roleKey,
      ...(newEvaluator.displayName ? { evaluatorDisplayName: newEvaluator.displayName } : {}),
      weight,
      status: "ACTIVE",
    },
  };
}

function differingFields(current, desired) {
  return Object.entries(desired).filter(([field, expected]) => {
    return JSON.stringify(current[field]) !== JSON.stringify(expected);
  }).map(([field]) => field);
}

function countByPlan(actions, getData) {
  return actions.reduce((counts, action) => {
    const data = getData(action);
    const planId = asString(data.planId) || "(missing)";
    counts[planId] = (counts[planId] || 0) + 1;
    return counts;
  }, {});
}

async function buildMovePlan(db, orgRoot, currentEvaluator, newEvaluator) {
  const [assignmentsSnapshot, submissionsSnapshot] = await Promise.all([
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("evaluatorPersonId", "==", currentEvaluator.personId).get(),
    db.collection(`${orgRoot}/evaluationSubmissions`).where("evaluatorPersonId", "==", currentEvaluator.personId).get(),
  ]);
  const matchingPlanAssignments = assignmentsSnapshot.docs.filter((document) => {
    return CONFIG.sourcePlanIds.includes(asString(document.data().planId));
  });
  const outsideGirls = matchingPlanAssignments.filter((document) => normalizeSchoolId(document.data().schoolId) !== CONFIG.schoolId);
  assert(outsideGirls.length === 0, `Refusing to process matching source assignments outside normalized ${CONFIG.schoolId}: ${outsideGirls.map((document) => document.ref.path).join(", ")}`);
  const invalidTerm = matchingPlanAssignments.filter((document) => {
    const data = document.data();
    return asString(data.academicYearId) !== CONFIG.academicYearId || asString(data.termId) !== CONFIG.termId;
  });
  assert(invalidTerm.length === 0, `Matching source assignments have unexpected academic year or term: ${invalidTerm.map((document) => document.ref.path).join(", ")}`);

  const sourceAssignments = matchingPlanAssignments.filter((document) => sourceScopeMatches(document.data()));
  const submissionKeys = new Set(submissionsSnapshot.docs.map((document) => assignmentKey(document.data())));
  const activeSources = sourceAssignments.filter((document) => asString(document.data().status) === "ACTIVE");
  const removedSources = sourceAssignments.filter((document) => asString(document.data().status) === "REMOVED");
  const unsupportedSources = sourceAssignments.filter((document) => !["ACTIVE", "REMOVED"].includes(asString(document.data().status)));
  const skipped = unsupportedSources.map((source) => ({ source, reason: `unsupported source status ${asString(source.data().status) || "(missing)"}` }));
  const submittedSources = activeSources.filter((source) => submissionKeys.has(assignmentKey(source.data())));
  submittedSources.forEach((source) => skipped.push({ source, reason: "submission exists" }));
  const eligibleSources = activeSources.filter((source) => !submissionKeys.has(assignmentKey(source.data())));
  const replacementBySourcePath = new Map();
  const duplicateReplacementIds = [];
  for (const source of [...eligibleSources, ...removedSources]) {
    const replacement = buildReplacement(source, newEvaluator);
    if ([...replacementBySourcePath.values()].some((entry) => entry.id === replacement.id)) {
      duplicateReplacementIds.push(replacement.id);
    }
    replacementBySourcePath.set(source.ref.path, replacement);
  }
  assert(duplicateReplacementIds.length === 0, `Duplicate deterministic replacement IDs found: ${[...new Set(duplicateReplacementIds)].join(", ")}`);

  const replacementEntries = [...replacementBySourcePath.entries()];
  const replacementSnapshots = replacementEntries.length
    ? await db.getAll(...replacementEntries.map(([, replacement]) => db.doc(replacement.path)))
    : [];
  const existingReplacements = [];
  const conflicts = [];
  const missingReplacements = new Set();
  replacementSnapshots.forEach((snapshot, index) => {
    const [sourcePath, replacement] = replacementEntries[index];
    if (!snapshot.exists) {
      missingReplacements.add(sourcePath);
      return;
    }
    const fields = differingFields(snapshot.data(), replacement.data);
    if (fields.length > 0) {
      conflicts.push({ sourcePath, replacementPath: snapshot.ref.path, fields });
      return;
    }
    existingReplacements.push({ sourcePath, replacement });
  });

  const creates = eligibleSources
    .filter((source) => missingReplacements.has(source.ref.path))
    .map((source) => ({ source, replacement: replacementBySourcePath.get(source.ref.path) }));
  const removals = eligibleSources
    .filter((source) => !conflicts.some((conflict) => conflict.sourcePath === source.ref.path));
  const unpairedRemoved = removedSources
    .filter((source) => missingReplacements.has(source.ref.path))
    .map((source) => ({ source, reason: "source is already REMOVED but its replacement is missing" }));
  skipped.push(...unpairedRemoved);

  const plannedWrites = [
    ...creates.map(({ replacement }) => ({ kind: "create replacement", path: replacement.path, data: replacement.data })),
    ...removals.map((source) => ({ kind: "remove old assignment", path: source.ref.path, data: source.data() })),
  ];
  const writesOutsideGirls = plannedWrites.filter((write) => normalizeSchoolId(write.data.schoolId) !== CONFIG.schoolId);
  const boysWrites = plannedWrites.filter((write) => {
    const schoolId = normalizeSchoolId(write.data.schoolId);
    return schoolId === "mrb-boys-sayh" || schoolId === "mrb-boys-faleh";
  });
  assert(writesOutsideGirls.length === 0 && boysWrites.length === 0, "Refusing planned writes outside Manar Girls.");

  return {
    sourceAssignments,
    activeSources,
    removedSources,
    creates,
    removals,
    existingReplacements,
    conflicts,
    skipped,
    plannedWrites,
    writesOutsideGirls,
    boysWrites,
  };
}

function buildSummary(movePlan) {
  const safetyReasons = [];
  if (movePlan.conflicts.length > 0) safetyReasons.push(`${movePlan.conflicts.length} replacement conflicts`);
  if (movePlan.skipped.length > 0) safetyReasons.push(`${movePlan.skipped.length} skipped source assignments`);
  if (movePlan.writesOutsideGirls.length > 0) safetyReasons.push(`${movePlan.writesOutsideGirls.length} writes outside mrb-girls`);
  if (movePlan.boysWrites.length > 0) safetyReasons.push(`${movePlan.boysWrites.length} boys writes`);
  return {
    sourcePlans: CONFIG.sourcePlanIds,
    sayedActiveAssignmentsFoundByPlan: countByPlan(movePlan.activeSources, (source) => source.data()),
    replacementAssignmentsToCreateByPlan: countByPlan(movePlan.creates, (entry) => entry.replacement.data),
    oldSayedAssignmentsToMarkRemovedByPlan: countByPlan(movePlan.removals, (source) => source.data()),
    alreadyExistingReplacementsByPlan: countByPlan(movePlan.existingReplacements, (entry) => entry.replacement.data),
    alreadyRemovedOldAssignmentsByPlan: countByPlan(movePlan.removedSources, (source) => source.data()),
    skipped: movePlan.skipped.map((entry) => ({ assignmentId: entry.source.id, planId: entry.source.data().planId, reason: entry.reason })),
    conflicts: movePlan.conflicts,
    plannedWritesOutsideMrbGirls: movePlan.writesOutsideGirls.length,
    boysPlannedWrites: movePlan.boysWrites.length,
    decision: safetyReasons.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
    reasons: safetyReasons,
  };
}

async function applyMovePlan(db, movePlan) {
  const actions = [
    ...movePlan.creates.map((entry) => ({ type: "create", ...entry })),
    ...movePlan.removals.map((source) => ({ type: "remove", source })),
  ];
  const now = Date.now();
  for (const group of chunk(actions, 350)) {
    const batch = db.batch();
    group.forEach((action) => {
      if (action.type === "create") {
        batch.create(db.doc(action.replacement.path), {
          ...action.replacement.data,
          createdAt: now,
          updatedAt: now,
          migratedAt: now,
          migratedFromEvaluatorPersonId: CONFIG.currentEvaluator.personId,
        });
        return;
      }
      batch.update(action.source.ref, {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Reassigned to the Manar Girls replacement educational supervisor.",
        replacementEvaluatorAssignmentId: `${asString(action.source.data().cycleId)}-${asString(action.source.data().targetPersonId)}-${CONFIG.newEvaluator.personId}`,
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
  await loadSourcePlans(db, orgRoot);
  const [currentEvaluator, newEvaluator] = await Promise.all([
    loadEvaluator(db, orgRoot, CONFIG.currentEvaluator, CONFIG.currentEvaluator.email),
    loadEvaluator(db, orgRoot, CONFIG.newEvaluator),
  ]);
  const movePlan = await buildMovePlan(db, orgRoot, currentEvaluator, newEvaluator);
  const summary = buildSummary(movePlan);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(summary, { depth: null });
  if (summary.decision !== "SAFE TO APPLY") {
    console.log("No writes performed because the move plan is not safe to apply.");
    process.exitCode = 1;
    return;
  }
  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create replacements and mark only the listed Sayed assignments REMOVED.");
    return;
  }

  await applyMovePlan(db, movePlan);
  console.dir({
    createdReplacementAssignments: movePlan.creates.length,
    removedOldSayedAssignments: movePlan.removals.length,
    decision: "APPLIED",
  }, { depth: null });
}

main().catch((error) => {
  console.error("Girls supervisor assignment move failed:");
  console.error(error);
  process.exitCode = 1;
});
