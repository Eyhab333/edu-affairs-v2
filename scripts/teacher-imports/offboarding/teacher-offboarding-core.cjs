const fs = require("node:fs");
const path = require("node:path");
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "takween";
const INPUT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "offboarding",
  "input.local.json",
);
const APPLY_REPORT_FILE = path.resolve(
  process.cwd(),
  "scripts",
  "teacher-imports",
  "offboarding",
  "reports",
  "teacher-offboarding-apply.json",
);
const TEACHER_ROLE_KEYS = new Set([
  "TEACHER",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function recordFromSnapshot(snapshot) {
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    ref: snapshot.ref,
    data: snapshot.data() || {},
  };
}

function dedupeRecords(records) {
  return Array.from(
    new Map(records.map((item) => [item.path, item])).values(),
  );
}

function isActiveMembership(data) {
  return data.isActive !== false && data.active !== false;
}

function isActiveProjectRecord(data) {
  const status = text(data.status).toUpperCase();
  return (
    data.isArchived !== true &&
    data.isActive !== false &&
    data.active !== false &&
    !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status)
  );
}

function isActiveClassLink(data) {
  return data.isActive !== false && data.active !== false;
}

function isActiveEvaluationAssignment(data) {
  if (hasOwn(data, "status")) {
    return text(data.status).toUpperCase() === "ACTIVE";
  }

  return data.isActive !== false && data.active !== false;
}

function isTeacherMembership(data) {
  const role = text(data.role).toLowerCase();
  const roleKey = text(data.roleKey).toUpperCase();
  return role === "teacher" || TEACHER_ROLE_KEYS.has(roleKey);
}

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...valueParts] = arg.slice(2).split("=");
    result[key] = valueParts.join("=");
  }

  return result;
}

function readInput() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Offboarding input file not found: ${INPUT_FILE}`);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Offboarding input must be a JSON object.");
  }

  const email = normalizeEmail(raw.email);
  if (!email || !isValidEmail(email)) {
    throw new Error("Offboarding input requires a valid email.");
  }

  const reason = text(raw.reason);
  const effectiveDate = text(raw.effectiveDate);

  return { email, reason, effectiveDate };
}

async function initializeFirebase(args = {}) {
  if (getApps().length > 0) return;

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    initializeApp({
      credential: cert(require(path.resolve(serviceAccountPath))),
    });
    return;
  }

  initializeApp({ credential: applicationDefault() });
}

async function findAuthUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function queryByField(db, collectionPath, field, value) {
  const snapshot = await db.collection(collectionPath).where(field, "==", value).get();
  return snapshot.docs.map(recordFromSnapshot);
}

function addBlockedAction(actions, reason) {
  actions.push({
    action: "BLOCKED",
    collection: "identity-or-scope",
    path: "",
    reason,
  });
}

function addKeepHistoryAction(actions, record, reason) {
  actions.push({
    action: "KEEP_HISTORY",
    collection: record.ref.parent.id,
    path: record.path,
    reason,
  });
}

function addUpdateAction(actions, action, record, update, reason) {
  actions.push({
    action,
    collection: record.ref.parent.id,
    path: record.path,
    update,
    reason,
  });
}

function buildTeacherAssignmentEndUpdate(data, now) {
  const update = {
    status: "ENDED",
    active: false,
    updatedAt: now,
  };

  if (!data.endedAt) update.endedAt = now;
  return update;
}

function buildOperationalAssignmentEndUpdate(data, now) {
  const update = {
    status: "ENDED",
    isActive: false,
    active: false,
    updatedAt: now,
  };

  if (!data.endedAt) update.endedAt = now;
  return update;
}

function buildEvaluationAssignmentRemovalUpdate(data, now) {
  if (hasOwn(data, "status")) {
    return { status: "REMOVED", updatedAt: now };
  }

  return { isActive: false, updatedAt: now };
}

function historyRecordsFromState(state) {
  return dedupeRecords([
    state.user,
    state.person,
    ...state.teacherAssignments.filter((item) => !isActiveProjectRecord(item.data)),
    ...state.classLinks.filter((item) => !isActiveClassLink(item.data)),
    ...state.operationalAssignments.filter((item) => !isActiveProjectRecord(item.data)),
    ...state.evaluationTargetAssignments.filter(
      (item) => !isActiveEvaluationAssignment(item.data),
    ),
    ...state.evaluationEvaluatorAssignments.filter(
      (item) => !isActiveEvaluationAssignment(item.data),
    ),
    ...state.evaluationSubmissions,
    ...state.evaluationCycleTargetSummaries,
    ...state.evaluationStaffSummaries,
    ...state.evaluationSummaryReadModels,
  ]);
}

async function resolveIdentity({ auth, db, input }) {
  const blockers = [];
  const authUser = await findAuthUser(auth, input.email);

  if (!authUser) {
    blockers.push("No Firebase Auth user exists for the input email.");
    return { blockers, authUser: null };
  }

  if (normalizeEmail(authUser.email) !== input.email) {
    blockers.push("Firebase Auth email does not match the requested email.");
  }

  const uid = authUser.uid;
  const [userSnapshot, userMatches] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    queryByField(db, "users", "email", input.email),
  ]);

  if (!userSnapshot.exists) {
    blockers.push(`UserProfile is missing: users/${uid}.`);
    return { blockers, authUser, uid };
  }

  const user = recordFromSnapshot(userSnapshot);
  const userData = user.data;
  const personId = text(userData.personId);

  if (userMatches.length !== 1 || userMatches[0].id !== uid) {
    blockers.push("UserProfile email resolution is missing or ambiguous.");
  }

  if (normalizeEmail(userData.email) !== input.email) {
    blockers.push("UserProfile email does not match Firebase Auth.");
  }

  if (!personId) {
    blockers.push("UserProfile has no personId.");
    return { blockers, authUser, uid, user };
  }

  const [personSnapshot, personMatches, userMembershipSnapshot, orgMembershipSnapshot] =
    await Promise.all([
      db.doc(`orgs/${ORG_ID}/people/${personId}`).get(),
      queryByField(db, `orgs/${ORG_ID}/people`, "email", input.email),
      db.doc(`users/${uid}/orgMemberships/${ORG_ID}`).get(),
      db.doc(`orgs/${ORG_ID}/memberships/${uid}`).get(),
    ]);

  if (!personSnapshot.exists) {
    blockers.push(`Person is missing: orgs/${ORG_ID}/people/${personId}.`);
  }

  if (personMatches.length !== 1 || personMatches[0].id !== personId) {
    blockers.push("Person email resolution is missing or ambiguous.");
  }

  const person = personSnapshot.exists ? recordFromSnapshot(personSnapshot) : null;
  if (person && normalizeEmail(person.data.email) !== input.email) {
    blockers.push("Person email does not match Firebase Auth.");
  }

  if (!userMembershipSnapshot.exists || !orgMembershipSnapshot.exists) {
    blockers.push("Both required organization membership documents must exist.");
  }

  const userMembership = userMembershipSnapshot.exists
    ? recordFromSnapshot(userMembershipSnapshot)
    : null;
  const orgMembership = orgMembershipSnapshot.exists
    ? recordFromSnapshot(orgMembershipSnapshot)
    : null;

  for (const membership of [userMembership, orgMembership].filter(Boolean)) {
    if (text(membership.data.uid) && text(membership.data.uid) !== uid) {
      blockers.push(`Membership uid mismatch: ${membership.path}.`);
    }
    if (text(membership.data.orgId) && text(membership.data.orgId) !== ORG_ID) {
      blockers.push(`Membership orgId mismatch: ${membership.path}.`);
    }
    if (text(membership.data.personId) !== personId) {
      blockers.push(`Membership personId mismatch: ${membership.path}.`);
    }
    if (!isTeacherMembership(membership.data)) {
      blockers.push(`Membership does not identify this user as a teacher: ${membership.path}.`);
    }
  }

  return {
    blockers,
    authUser,
    uid,
    personId,
    user,
    person,
    userMembership,
    orgMembership,
  };
}

async function loadTeacherState({ db, identity }) {
  const personId = identity.personId;
  const orgRoot = `orgs/${ORG_ID}`;
  const [teacherAssignments, targetAssignmentsByPerson, targetAssignmentsByLegacyPerson, evaluatorAssignmentsByPerson, evaluatorAssignmentsByLegacyPerson, submissionsByPerson, submissionsByLegacyPerson, cycleSummaries, staffSummaries, summaryReadModel] =
    await Promise.all([
      queryByField(db, `${orgRoot}/teacherAssignments`, "teacherPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "targetPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationTargetAssignments`, "targetTeacherPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationEvaluatorAssignments`, "targetTeacherPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationSubmissions`, "targetPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationSubmissions`, "targetTeacherPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationCycleTargetSummaries`, "targetPersonId", personId),
      queryByField(db, `${orgRoot}/evaluationStaffSummaries`, "targetPersonId", personId),
      db.doc(`${orgRoot}/evaluationSummaryReadModels/${personId}`).get(),
    ]);

  const teacherAssignmentIds = teacherAssignments.map((item) => item.id);
  const classLinkQueries = [];
  const operationalSourceQueries = [];

  for (const assignmentId of teacherAssignmentIds) {
    classLinkQueries.push(
      queryByField(db, `${orgRoot}/teacherAssignmentClassLinks`, "assignmentId", assignmentId),
      queryByField(db, `${orgRoot}/teacherAssignmentClassLinks`, "teacherAssignmentId", assignmentId),
    );
    operationalSourceQueries.push(
      queryByField(db, `${orgRoot}/operationalAssignments`, "sourceTeacherAssignmentId", assignmentId),
    );
  }

  const [classLinkGroups, operationalSourceGroups, operationalActorRecords] = await Promise.all([
    Promise.all(classLinkQueries),
    Promise.all(operationalSourceQueries),
    queryByField(db, `${orgRoot}/operationalAssignments`, "actorPersonId", personId),
  ]);

  return {
    ...identity,
    teacherAssignments,
    classLinks: dedupeRecords(classLinkGroups.flat()),
    operationalAssignments: dedupeRecords([
      ...operationalSourceGroups.flat(),
      ...operationalActorRecords,
    ]),
    evaluationTargetAssignments: dedupeRecords([
      ...targetAssignmentsByPerson,
      ...targetAssignmentsByLegacyPerson,
    ]),
    evaluationEvaluatorAssignments: dedupeRecords([
      ...evaluatorAssignmentsByPerson,
      ...evaluatorAssignmentsByLegacyPerson,
    ]),
    evaluationSubmissions: dedupeRecords([
      ...submissionsByPerson,
      ...submissionsByLegacyPerson,
    ]),
    evaluationCycleTargetSummaries: cycleSummaries,
    evaluationStaffSummaries: staffSummaries,
    evaluationSummaryReadModels: summaryReadModel.exists
      ? [recordFromSnapshot(summaryReadModel)]
      : [],
  };
}

function findScopeConflicts(state) {
  const conflicts = [];
  const assignmentIds = new Set(state.teacherAssignments.map((item) => item.id));
  const personId = state.personId;

  for (const link of state.classLinks) {
    const assignmentId = text(link.data.assignmentId);
    const teacherAssignmentId = text(link.data.teacherAssignmentId);

    if (
      assignmentId &&
      teacherAssignmentId &&
      assignmentId !== teacherAssignmentId
    ) {
      conflicts.push(`Class link has conflicting parent assignment ids: ${link.path}.`);
      continue;
    }

    const parentId = assignmentId || teacherAssignmentId;
    if (!parentId || !assignmentIds.has(parentId)) {
      conflicts.push(`Class link is outside the resolved teacher assignment scope: ${link.path}.`);
    }
  }

  for (const assignment of state.operationalAssignments) {
    const actorPersonId = text(assignment.data.actorPersonId);
    const sourceTeacherAssignmentId = text(assignment.data.sourceTeacherAssignmentId);

    if (actorPersonId && actorPersonId !== personId) {
      conflicts.push(`Operational assignment actor does not match the resolved teacher: ${assignment.path}.`);
    }
    if (sourceTeacherAssignmentId && !assignmentIds.has(sourceTeacherAssignmentId)) {
      conflicts.push(`Operational assignment source is outside the resolved teacher assignment scope: ${assignment.path}.`);
    }
  }

  for (const assignment of [
    ...state.evaluationTargetAssignments,
    ...state.evaluationEvaluatorAssignments,
  ]) {
    const targetPersonId = text(assignment.data.targetPersonId);
    const targetTeacherPersonId = text(assignment.data.targetTeacherPersonId);

    if (
      (targetPersonId && targetPersonId !== personId) ||
      (targetTeacherPersonId && targetTeacherPersonId !== personId)
    ) {
      conflicts.push(`Evaluation assignment target does not match the resolved teacher: ${assignment.path}.`);
    }
  }

  return conflicts;
}

function buildOffboardingActions({ state, blockers, now }) {
  const actions = [];

  for (const blocker of blockers) addBlockedAction(actions, blocker);
  if (blockers.length > 0) return actions;

  if (!state.authUser.disabled) {
    actions.push({
      action: "AUTH_DISABLE",
      collection: "FirebaseAuth",
      path: `auth/users/${state.uid}`,
      update: { disabled: true },
      reason: "Disable sign-in without deleting Firebase Auth.",
    });
  }

  for (const membership of [state.userMembership, state.orgMembership]) {
    if (isActiveMembership(membership.data)) {
      addUpdateAction(
        actions,
        "MEMBERSHIP_DEACTIVATE",
        membership,
        { isActive: false, updatedAt: now },
        "Deactivate the existing organization membership convention.",
      );
    }
  }

  for (const assignment of state.teacherAssignments) {
    if (isActiveProjectRecord(assignment.data)) {
      addUpdateAction(
        actions,
        "TEACHER_ASSIGNMENT_END",
        assignment,
        buildTeacherAssignmentEndUpdate(assignment.data, now),
        "End active teacher assignment while preserving its document.",
      );
    }
  }

  for (const link of state.classLinks) {
    if (isActiveClassLink(link.data)) {
      addUpdateAction(
        actions,
        "CLASS_LINK_END",
        link,
        { active: false, updatedAt: now },
        "Deactivate dependent teacher assignment class link.",
      );
    }
  }

  for (const assignment of state.operationalAssignments) {
    if (isActiveProjectRecord(assignment.data)) {
      addUpdateAction(
        actions,
        "OPERATIONAL_ASSIGNMENT_END",
        assignment,
        buildOperationalAssignmentEndUpdate(assignment.data, now),
        "End dependent operational assignment while preserving its document.",
      );
    }
  }

  for (const assignment of [
    ...state.evaluationTargetAssignments,
    ...state.evaluationEvaluatorAssignments,
  ]) {
    if (isActiveEvaluationAssignment(assignment.data)) {
      addUpdateAction(
        actions,
        "EVALUATION_ASSIGNMENT_REMOVE",
        assignment,
        buildEvaluationAssignmentRemovalUpdate(assignment.data, now),
        "Remove active evaluation work for this teacher as target without deleting evaluations or results.",
      );
    }
  }

  for (const record of historyRecordsFromState(state)) {
    addKeepHistoryAction(
      actions,
      record,
      "Preserve identity, historical assignment, evaluation, submission, or result data.",
    );
  }

  return actions;
}

function summarizeActions(actions) {
  const grouped = new Map();

  for (const action of actions) {
    const key = `${action.collection}\u001f${action.action}`;
    const item = grouped.get(key) || {
      collection: action.collection,
      action: action.action,
      total: 0,
    };
    item.total += 1;
    grouped.set(key, item);
  }

  return Array.from(grouped.values()).sort(
    (left, right) =>
      left.collection.localeCompare(right.collection) ||
      left.action.localeCompare(right.action),
  );
}

async function buildOffboardingPlan({ args = {} } = {}) {
  const input = readInput();
  await initializeFirebase(args);

  const auth = getAuth();
  const db = getFirestore();
  const identity = await resolveIdentity({ auth, db, input });
  const blockers = [...identity.blockers];

  if (blockers.length > 0) {
    const actions = buildOffboardingActions({ state: identity, blockers, now: Date.now() });
    return {
      input,
      auth,
      db,
      state: identity,
      blockers,
      actions,
      totals: summarizeActions(actions),
    };
  }

  const state = await loadTeacherState({ db, identity });
  blockers.push(...findScopeConflicts(state));
  const actions = buildOffboardingActions({ state, blockers, now: Date.now() });

  return {
    input,
    auth,
    db,
    state,
    blockers,
    actions,
    totals: summarizeActions(actions),
  };
}

function printPlan(plan) {
  console.log("Teacher offboarding plan");
  console.log({
    orgId: ORG_ID,
    email: plan.input.email,
    reason: plan.input.reason || "",
    effectiveDate: plan.input.effectiveDate || "",
    uid: plan.state.uid || "",
    personId: plan.state.personId || "",
    blocked: plan.blockers.length > 0,
  });

  console.log("\nTotals by collection/action");
  console.table(plan.totals);

  const changes = plan.actions
    .filter((item) => item.action !== "KEEP_HISTORY")
    .map((item) => ({
      action: item.action,
      collection: item.collection,
      path: item.path,
      nextState: item.update ? JSON.stringify(item.update) : "",
      reason: item.reason,
    }));

  if (changes.length > 0) {
    console.log("\nPlanned changes or blocks");
    console.table(changes);
  }

  const historyTotals = plan.totals.filter((item) => item.action === "KEEP_HISTORY");
  if (historyTotals.length > 0) {
    console.log("\nHistorical data retained");
    console.table(historyTotals);
  }
}

function actionableFirestoreActions(plan) {
  return plan.actions.filter(
    (item) =>
      item.action !== "AUTH_DISABLE" &&
      item.action !== "KEEP_HISTORY" &&
      item.action !== "BLOCKED",
  );
}

function historicalEvaluationPaths(plan) {
  return plan.actions
    .filter(
      (item) =>
        item.action === "KEEP_HISTORY" &&
        [
          "evaluationSubmissions",
          "evaluationCycleTargetSummaries",
          "evaluationStaffSummaries",
          "evaluationSummaryReadModels",
        ].includes(item.collection),
    )
    .map((item) => item.path);
}

function writeApplyReport(plan, appliedActions) {
  fs.mkdirSync(path.dirname(APPLY_REPORT_FILE), { recursive: true });
  fs.writeFileSync(
    APPLY_REPORT_FILE,
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        orgId: ORG_ID,
        input: plan.input,
        uid: plan.state.uid,
        personId: plan.state.personId,
        appliedActions: appliedActions.map((item) => ({
          action: item.action,
          collection: item.collection,
          path: item.path,
        })),
        historicalEvaluationPaths: historicalEvaluationPaths(plan),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function readApplyReport() {
  if (!fs.existsSync(APPLY_REPORT_FILE)) return null;
  return JSON.parse(fs.readFileSync(APPLY_REPORT_FILE, "utf8"));
}

async function applyOffboardingPlan(plan) {
  if (plan.blockers.length > 0) {
    throw new Error("Offboarding is blocked. No Firebase writes were performed.");
  }

  const authActions = plan.actions.filter((item) => item.action === "AUTH_DISABLE");
  const firestoreActions = actionableFirestoreActions(plan);

  for (const action of authActions) {
    await plan.auth.updateUser(plan.state.uid, action.update);
  }

  const batchSize = 400;
  for (let index = 0; index < firestoreActions.length; index += batchSize) {
    const batch = plan.db.batch();
    const chunk = firestoreActions.slice(index, index + batchSize);

    for (const action of chunk) {
      batch.update(plan.db.doc(action.path), action.update);
    }

    await batch.commit();
  }

  const appliedActions = [...authActions, ...firestoreActions];
  if (appliedActions.length > 0) writeApplyReport(plan, appliedActions);
  return appliedActions;
}

module.exports = {
  APPLY_REPORT_FILE,
  ORG_ID,
  actionableFirestoreActions,
  applyOffboardingPlan,
  buildOffboardingPlan,
  isActiveClassLink,
  isActiveEvaluationAssignment,
  isActiveMembership,
  isActiveProjectRecord,
  parseArgs,
  printPlan,
  readApplyReport,
};
