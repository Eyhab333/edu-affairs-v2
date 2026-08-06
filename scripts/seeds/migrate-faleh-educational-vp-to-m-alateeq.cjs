/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  falehSchoolId: "mrb-boys-faleh",
  sayhSchoolId: "mrb-boys-sayh",
  roleKey: "BOYS_EDU_VP",
  oldActor: {
    uid: "H2KAczlZXTRKfVwvbVLLixnufMu2",
    personId: "staff-H2KAczlZXTRKfVwvbVLLixnufMu2",
    email: "educational-agent-faleh@qz.org.sa",
    displayName: "الوكيل التعليمي",
  },
  newActor: {
    uid: "6V8WflFTNzWpejeOrv8JKzfqQC12",
    personId: "p-m-alateeq",
    email: "m.alateeq@qz.org.sa",
    displayName: "محمد صالح حمد العتيق",
  },
  evaluatorPlanIds: [
    "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
    "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
  ],
  directorPlanId:
    "mrb-boys-faleh-ay-1448-term-1-director-admin-educational-vice-principal-evaluation",
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

function uniqueStrings(values) {
  return Array.from(new Set(values.map(asString).filter(Boolean)));
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function queryByField(db, collectionPath, field, value) {
  return (
    await db.collection(collectionPath).where(field, "==", value).get()
  ).docs;
}

async function validateIdentity(db, orgRoot, actor, expectedSchoolId) {
  const [authUser, user, person, membership] = await Promise.all([
    admin.auth().getUser(actor.uid),
    readRequiredDoc(db, `users/${actor.uid}`, `${actor.email} user`),
    readRequiredDoc(db, `${orgRoot}/people/${actor.personId}`, `${actor.email} person`),
    readRequiredDoc(
      db,
      `users/${actor.uid}/orgMemberships/${CONFIG.orgId}`,
      `${actor.email} membership`,
    ),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();
  const membershipSchoolIds = uniqueStrings([
    ...(membershipData.scopes?.schoolIds || []),
    membershipData.scopeType === "SCHOOL" ? membershipData.scopeId : "",
  ]);

  assert(normalizeEmail(authUser.email) === actor.email, `${actor.email} auth email mismatch.`);
  assert(normalizeEmail(userData.email || personData.email) === actor.email, `${actor.email} Firestore email mismatch.`);
  assert(asString(membershipData.personId) === actor.personId, `${actor.email} membership personId mismatch.`);
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === CONFIG.roleKey, `${actor.email} role mismatch.`);
  assert(membershipData.isActive !== false, `${actor.email} membership is inactive.`);
  assert(membershipData.permissions?.manageEvaluations === true, `${actor.email} is missing manageEvaluations.`);
  assert(membershipSchoolIds.includes(expectedSchoolId), `${actor.email} does not cover ${expectedSchoolId}.`);

  return {
    authUser,
    user,
    userData,
    person,
    personData,
    membership,
    membershipData,
    membershipSchoolIds,
  };
}

function buildTransferredDocument(oldDocument, mode) {
  const current = oldDocument.data();
  let id;
  let data;

  if (mode === "evaluatorAssignment") {
    id = `${current.planId}-${current.cycleId}-${current.targetPersonId}-${CONFIG.newActor.personId}`;
    data = {
      ...current,
      id,
      evaluatorPersonId: CONFIG.newActor.personId,
      evaluatorEmail: CONFIG.newActor.email,
      evaluatorRoleKey: CONFIG.roleKey,
    };
  } else if (mode === "targetAssignment") {
    id = `${current.planId}-target-${CONFIG.newActor.personId}`;
    data = {
      ...current,
      id,
      targetPersonId: CONFIG.newActor.personId,
      targetEmail: CONFIG.newActor.email,
      targetDisplayName: CONFIG.newActor.displayName,
      targetRoleKey: CONFIG.roleKey,
      targetRoleLabel: "الوكيل التعليمي",
    };
  } else if (mode === "targetEvaluatorAssignment") {
    id = `${current.planId}-${current.cycleId}-${CONFIG.newActor.personId}-${current.evaluatorPersonId}`;
    data = {
      ...current,
      id,
      targetPersonId: CONFIG.newActor.personId,
      targetRoleKey: CONFIG.roleKey,
      targetRoleLabel: "الوكيل التعليمي",
    };
  } else if (mode === "operationalAssignment") {
    id = oldDocument.id.includes(CONFIG.oldActor.personId)
      ? oldDocument.id.replace(CONFIG.oldActor.personId, CONFIG.newActor.personId)
      : `${oldDocument.id}__${CONFIG.newActor.personId}`;
    data = {
      ...current,
      id,
      actorPersonId: CONFIG.newActor.personId,
      ...(asString(current.personId) === CONFIG.oldActor.personId
        ? { personId: CONFIG.newActor.personId }
        : {}),
      ...(asString(current.actorUid) === CONFIG.oldActor.uid
        ? { actorUid: CONFIG.newActor.uid }
        : {}),
      ...(asString(current.uid) === CONFIG.oldActor.uid
        ? { uid: CONFIG.newActor.uid }
        : {}),
      ...(normalizeEmail(current.actorEmail) === CONFIG.oldActor.email
        ? { actorEmail: CONFIG.newActor.email }
        : {}),
      ...(asString(current.actorDisplayName) === CONFIG.oldActor.displayName
        ? { actorDisplayName: CONFIG.newActor.displayName }
        : {}),
    };
  } else {
    throw new Error(`Unknown transfer mode: ${mode}`);
  }

  return {
    mode,
    oldDocument,
    newRef: oldDocument.ref.parent.doc(id),
    data,
  };
}

function assertDestination(snapshot, transfer) {
  if (!snapshot.exists) return;

  const current = snapshot.data();

  if (transfer.mode === "operationalAssignment") {
    for (const field of [
      "id",
      "orgId",
      "schoolId",
      "scopeType",
      "scopeId",
      "actorPersonId",
      "operationKey",
      "operationType",
      "status",
      "isActive",
    ]) {
      if (transfer.data[field] === undefined) continue;

      assert(
        JSON.stringify(current[field]) === JSON.stringify(transfer.data[field]),
        `Conflicting ${field} at ${snapshot.ref.path}.`,
      );
    }

    return;
  }

  const nonSemanticFields = new Set([
    "createdAt",
    "updatedAt",
    "assignedAt",
    "appliedAt",
    "migratedAt",
    "migratedFromPersonId",
  ]);

  for (const [field, expected] of Object.entries(transfer.data)) {
    if (nonSemanticFields.has(field)) continue;

    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}.`,
    );
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [oldIdentity, newIdentity] = await Promise.all([
    validateIdentity(db, orgRoot, CONFIG.oldActor, CONFIG.falehSchoolId),
    validateIdentity(db, orgRoot, CONFIG.newActor, CONFIG.sayhSchoolId),
  ]);
  const [
    oldEvaluatorAssignments,
    oldTargetEvaluatorAssignments,
    oldTargetAssignments,
    evaluatorSubmissions,
    targetSubmissions,
    oldOperationalAssignments,
    oldOrgMemberships,
  ] = await Promise.all([
    queryByField(
      db,
      `${orgRoot}/evaluationEvaluatorAssignments`,
      "evaluatorPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/evaluationEvaluatorAssignments`,
      "targetPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/evaluationTargetAssignments`,
      "targetPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/evaluationSubmissions`,
      "evaluatorPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/evaluationSubmissions`,
      "targetPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/operationalAssignments`,
      "actorPersonId",
      CONFIG.oldActor.personId,
    ),
    queryByField(
      db,
      `${orgRoot}/memberships`,
      "personId",
      CONFIG.oldActor.personId,
    ),
  ]);

  assert(evaluatorSubmissions.length === 0, `Old evaluator has ${evaluatorSubmissions.length} submissions; refusing automatic migration.`);
  assert(targetSubmissions.length === 0, `Old target has ${targetSubmissions.length} submissions; refusing automatic migration.`);
  assert(oldEvaluatorAssignments.length === 220, `Expected 220 old teacher evaluator assignments; found ${oldEvaluatorAssignments.length}.`);
  assert(
    oldEvaluatorAssignments.every(
      (document) =>
        asString(document.data().schoolId) === CONFIG.falehSchoolId &&
        CONFIG.evaluatorPlanIds.includes(asString(document.data().planId)),
    ),
    "Old evaluator has assignments outside the expected Faleh plans.",
  );
  assert(oldTargetEvaluatorAssignments.length === 9, `Expected 9 director evaluator assignments targeting old actor; found ${oldTargetEvaluatorAssignments.length}.`);
  assert(
    oldTargetEvaluatorAssignments.every(
      (document) => asString(document.data().planId) === CONFIG.directorPlanId,
    ),
    "Old target has evaluator assignments outside the director plan.",
  );
  assert(oldTargetAssignments.length === 1, `Expected one old target assignment; found ${oldTargetAssignments.length}.`);
  assert(asString(oldTargetAssignments[0].data().planId) === CONFIG.directorPlanId, "Old target assignment belongs to an unexpected plan.");
  assert(oldOperationalAssignments.length > 0, "No old operational assignments found.");
  assert(
    oldOperationalAssignments.every(
      (document) => asString(document.data().schoolId || document.data().scopeId) === CONFIG.falehSchoolId,
    ),
    "Old actor has operational assignments outside Faleh.",
  );

  const transfers = [
    ...oldEvaluatorAssignments.map((document) =>
      buildTransferredDocument(document, "evaluatorAssignment"),
    ),
    ...oldTargetAssignments.map((document) =>
      buildTransferredDocument(document, "targetAssignment"),
    ),
    ...oldTargetEvaluatorAssignments.map((document) =>
      buildTransferredDocument(document, "targetEvaluatorAssignment"),
    ),
    ...oldOperationalAssignments.map((document) =>
      buildTransferredDocument(document, "operationalAssignment"),
    ),
  ];
  const destinationSnapshots = await db.getAll(
    ...transfers.map((transfer) => transfer.newRef),
  );
  const missingDestinations = [];
  const existingDestinations = [];

  destinationSnapshots.forEach((snapshot, index) => {
    const transfer = transfers[index];
    assertDestination(snapshot, transfer);

    if (snapshot.exists) {
      existingDestinations.push(transfer);
    } else {
      missingDestinations.push(transfer);
    }
  });

  return {
    orgRoot,
    oldIdentity,
    newIdentity,
    oldEvaluatorAssignments,
    oldTargetEvaluatorAssignments,
    oldTargetAssignments,
    oldOperationalAssignments,
    oldOrgMemberships,
    transfers,
    missingDestinations,
    existingDestinations,
  };
}

function countTransfers(transfers) {
  return transfers.reduce((counts, transfer) => {
    counts[transfer.mode] = (counts[transfer.mode] || 0) + 1;
    return counts;
  }, {});
}

function buildPreview(preflight) {
  const oldOperationalAssignments = preflight.oldOperationalAssignments.map(
    (document) => ({ id: document.id, ...document.data() }),
  );

  return {
    oldActor: CONFIG.oldActor,
    newActor: CONFIG.newActor,
    newActorCurrentSchoolIds: preflight.newIdentity.membershipSchoolIds,
    newActorFinalSchoolIds: uniqueStrings([
      ...preflight.newIdentity.membershipSchoolIds,
      CONFIG.falehSchoolId,
    ]),
    submissionsBlockingDeletion: 0,
    transfers: countTransfers(preflight.transfers),
    destinationsAlreadyExisting: countTransfers(preflight.existingDestinations),
    destinationsToCreate: countTransfers(preflight.missingDestinations),
    oldOrgMembershipsToDelete: preflight.oldOrgMemberships.map(
      (document) => document.ref.path,
    ),
    oldOperationalAssignments,
    accountDeletion: {
      authUid: CONFIG.oldActor.uid,
      userDocument: `users/${CONFIG.oldActor.uid}`,
      personDocument: `${preflight.orgRoot}/people/${CONFIG.oldActor.personId}`,
    },
  };
}

async function applyTransfer(db, preflight) {
  const now = Date.now();
  const newSchoolIds = uniqueStrings([
    ...preflight.newIdentity.membershipSchoolIds,
    CONFIG.falehSchoolId,
  ]);
  const newUserSchoolIds = uniqueStrings([
    ...(preflight.newIdentity.userData.schoolIds || []),
    CONFIG.sayhSchoolId,
    CONFIG.falehSchoolId,
  ]);
  const batch = db.batch();
  let operationCount = 0;

  for (const transfer of preflight.missingDestinations) {
    batch.create(transfer.newRef, {
      ...transfer.data,
      updatedAt: now,
      migratedAt: now,
      migratedFromPersonId: CONFIG.oldActor.personId,
    });
    operationCount += 1;
  }

  for (const transfer of preflight.transfers) {
    batch.delete(transfer.oldDocument.ref);
    operationCount += 1;
  }

  for (const membership of preflight.oldOrgMemberships) {
    batch.delete(membership.ref);
    operationCount += 1;
  }

  batch.set(
    preflight.newIdentity.membership.ref,
    {
      scopes: {
        ...(preflight.newIdentity.membershipData.scopes || {}),
        schoolIds: newSchoolIds,
      },
      updatedAt: now,
    },
    { merge: true },
  );
  operationCount += 1;

  batch.set(
    preflight.newIdentity.user.ref,
    { schoolIds: newUserSchoolIds, updatedAt: now },
    { merge: true },
  );
  operationCount += 1;

  assert(operationCount <= 500, `Migration needs ${operationCount} writes; Firestore limit is 500.`);
  await batch.commit();

  return { operationCount, newSchoolIds };
}

async function verifyTransfer(db, preflight) {
  const [
    oldEvaluatorAssignments,
    oldTargetEvaluatorAssignments,
    oldTargetAssignments,
    oldOperationalAssignments,
    newEvaluatorAssignments,
    newTargetEvaluatorAssignments,
    newTargetAssignments,
    newOperationalAssignments,
    membership,
  ] = await Promise.all([
    queryByField(db, `${preflight.orgRoot}/evaluationEvaluatorAssignments`, "evaluatorPersonId", CONFIG.oldActor.personId),
    queryByField(db, `${preflight.orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", CONFIG.oldActor.personId),
    queryByField(db, `${preflight.orgRoot}/evaluationTargetAssignments`, "targetPersonId", CONFIG.oldActor.personId),
    queryByField(db, `${preflight.orgRoot}/operationalAssignments`, "actorPersonId", CONFIG.oldActor.personId),
    queryByField(db, `${preflight.orgRoot}/evaluationEvaluatorAssignments`, "evaluatorPersonId", CONFIG.newActor.personId),
    queryByField(db, `${preflight.orgRoot}/evaluationEvaluatorAssignments`, "targetPersonId", CONFIG.newActor.personId),
    queryByField(db, `${preflight.orgRoot}/evaluationTargetAssignments`, "targetPersonId", CONFIG.newActor.personId),
    queryByField(db, `${preflight.orgRoot}/operationalAssignments`, "actorPersonId", CONFIG.newActor.personId),
    preflight.newIdentity.membership.ref.get(),
  ]);
  const schoolIds = uniqueStrings(membership.data()?.scopes?.schoolIds || []);
  const falehTeacherAssignments = newEvaluatorAssignments.filter(
    (document) =>
      asString(document.data().schoolId) === CONFIG.falehSchoolId &&
      CONFIG.evaluatorPlanIds.includes(asString(document.data().planId)),
  );
  const falehDirectorAssignments = newTargetEvaluatorAssignments.filter(
    (document) => asString(document.data().planId) === CONFIG.directorPlanId,
  );
  const falehDirectorTargets = newTargetAssignments.filter(
    (document) => asString(document.data().planId) === CONFIG.directorPlanId,
  );
  const falehOperationalAssignments = newOperationalAssignments.filter(
    (document) => asString(document.data().schoolId || document.data().scopeId) === CONFIG.falehSchoolId,
  );

  assert(oldEvaluatorAssignments.length === 0, "Old evaluator assignments remain.");
  assert(oldTargetEvaluatorAssignments.length === 0, "Old target evaluator assignments remain.");
  assert(oldTargetAssignments.length === 0, "Old target assignments remain.");
  assert(oldOperationalAssignments.length === 0, "Old operational assignments remain.");
  assert(falehTeacherAssignments.length === 220, `Expected 220 transferred Faleh teacher assignments; found ${falehTeacherAssignments.length}.`);
  assert(falehDirectorAssignments.length === 9, `Expected 9 transferred director assignments; found ${falehDirectorAssignments.length}.`);
  assert(falehDirectorTargets.length === 1, `Expected one transferred director target; found ${falehDirectorTargets.length}.`);
  assert(falehOperationalAssignments.length === preflight.oldOperationalAssignments.length, "Transferred operational assignment count mismatch.");
  assert(schoolIds.includes(CONFIG.sayhSchoolId) && schoolIds.includes(CONFIG.falehSchoolId), "New actor membership does not include both schools.");

  return {
    schoolIds,
    falehTeacherAssignments: falehTeacherAssignments.length,
    falehDirectorAssignments: falehDirectorAssignments.length,
    falehDirectorTargets: falehDirectorTargets.length,
    falehOperationalAssignments: falehOperationalAssignments.length,
  };
}

async function deleteOldIdentity(db, preflight) {
  await admin.auth().deleteUser(CONFIG.oldActor.uid);
  await db.recursiveDelete(preflight.oldIdentity.user.ref);
  await db.recursiveDelete(preflight.oldIdentity.person.ref);

  const [user, person] = await Promise.all([
    preflight.oldIdentity.user.ref.get(),
    preflight.oldIdentity.person.ref.get(),
  ]);
  assert(!user.exists, "Old user document still exists.");
  assert(!person.exists, "Old person document still exists.");

  try {
    await admin.auth().getUser(CONFIG.oldActor.uid);
    throw new Error("Old Auth user still exists.");
  } catch (error) {
    assert(error?.code === "auth/user-not-found", `Unexpected Auth verification error: ${error?.message || error}`);
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildPreview(preflight), { depth: 8 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to transfer assignments and delete the old account.");
    return;
  }

  const transferResult = await applyTransfer(db, preflight);
  const verification = await verifyTransfer(db, preflight);
  await deleteOldIdentity(db, preflight);

  console.log("Faleh educational vice-principal migrated to Mohammed Alateeq and old account deleted.");
  console.dir({ transferResult, verification, oldIdentityDeleted: true }, { depth: 6 });
}

main().catch((error) => {
  console.error("Faleh educational vice-principal migration failed:");
  console.error(error);
  process.exitCode = 1;
});
