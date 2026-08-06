/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-boys-sayh",
  personId: "p-a-brakat",
  uid: "owgHkCBLiLa42srMZrjFLNqCMQD2",
  email: "a.brakat@qz.org.sa",
  displayName: "المعلم فلان",
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

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

async function queryByField(db, collectionPath, field, value) {
  return (
    await db.collection(collectionPath).where(field, "==", value).get()
  ).docs;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadIdentityReferences(db, orgRoot) {
  const querySpecs = [
    ["deviceTokens", "personId", CONFIG.personId],
    ["deviceTokens", "staffPersonId", CONFIG.personId],
    ["deviceTokens", "uid", CONFIG.uid],
    ["evaluationCycleTargetSummaries", "targetPersonId", CONFIG.personId],
    ["evaluationEvaluatorAssignments", "targetPersonId", CONFIG.personId],
    ["evaluationEvaluatorAssignments", "evaluatorPersonId", CONFIG.personId],
    ["evaluationStaffSummaries", "targetPersonId", CONFIG.personId],
    ["evaluationSubmissions", "targetPersonId", CONFIG.personId],
    ["evaluationSubmissions", "evaluatorPersonId", CONFIG.personId],
    ["evaluationTargetAssignments", "targetPersonId", CONFIG.personId],
    ["memberships", "personId", CONFIG.personId],
    ["operationalAssignments", "actorPersonId", CONFIG.personId],
    ["operationalMemberships", "personId", CONFIG.personId],
    ["studentGamificationEvents", "createdByPersonId", CONFIG.personId],
    ["studentHomeworkAssignments", "createdByPersonId", CONFIG.personId],
    ["subjectLessonPreps", "teacherPersonId", CONFIG.personId],
    ["teacherAssignments", "teacherPersonId", CONFIG.personId],
  ];
  const results = await Promise.all(
    querySpecs.map(async ([collectionId, field, value]) => ({
      collectionId,
      documents: await queryByField(db, `${orgRoot}/${collectionId}`, field, value),
    })),
  );
  const documents = uniqueDocuments(results.flatMap((result) => result.documents));

  return documents;
}

async function loadDependentReferences(db, orgRoot, identityReferences) {
  const teacherAssignments = identityReferences.filter(
    (document) => document.ref.parent.id === "teacherAssignments",
  );
  const homeworkAssignments = identityReferences.filter(
    (document) => document.ref.parent.id === "studentHomeworkAssignments",
  );
  const [teacherDependencies, homeworkSubmissions] = await Promise.all([
    Promise.all(
      teacherAssignments.flatMap((assignment) => [
        queryByField(
          db,
          `${orgRoot}/teacherAssignmentClassLinks`,
          "assignmentId",
          assignment.id,
        ),
        queryByField(
          db,
          `${orgRoot}/operationalAssignments`,
          "sourceTeacherAssignmentId",
          assignment.id,
        ),
        queryByField(
          db,
          `${orgRoot}/subjectLessonPreps`,
          "teacherAssignmentId",
          assignment.id,
        ),
      ]),
    ),
    Promise.all(
      homeworkAssignments.map((homework) =>
        queryByField(
          db,
          `${orgRoot}/studentHomeworkSubmissions`,
          "homeworkId",
          homework.id,
        ),
      ),
    ),
  ]);

  return uniqueDocuments([
    ...teacherDependencies.flat(),
    ...homeworkSubmissions.flat(),
  ]);
}

function groupCounts(documents) {
  return documents.reduce((counts, document) => {
    const collectionId = document.ref.parent.id;
    counts[collectionId] = (counts[collectionId] || 0) + 1;
    return counts;
  }, {});
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [authUser, user, person, membership] = await Promise.all([
    admin.auth().getUser(CONFIG.uid),
    readRequiredDoc(db, `users/${CONFIG.uid}`, "Demo teacher user"),
    readRequiredDoc(db, `${orgRoot}/people/${CONFIG.personId}`, "Demo teacher person"),
    readRequiredDoc(
      db,
      `users/${CONFIG.uid}/orgMemberships/${CONFIG.orgId}`,
      "Demo teacher membership",
    ),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();

  assert(normalizeEmail(authUser.email) === CONFIG.email, "Auth email mismatch.");
  assert(normalizeEmail(userData.email || personData.email) === CONFIG.email, "Firestore email mismatch.");
  assert(asString(personData.displayName) === CONFIG.displayName, "Display name mismatch.");
  assert(asString(membershipData.personId) === CONFIG.personId, "Membership personId mismatch.");
  assert(["BOYS_TEACHER", "TEACHER"].includes(asString(membershipData.roleKey || membershipData.role).toUpperCase()), "Membership is not a teacher role.");

  const identityReferences = await loadIdentityReferences(db, orgRoot);
  const dependentReferences = await loadDependentReferences(
    db,
    orgRoot,
    identityReferences,
  );
  const deletionDocuments = uniqueDocuments([
    ...identityReferences,
    ...dependentReferences,
  ]);
  const schoolScopedDocuments = deletionDocuments.filter(
    (document) => asString(document.data().schoolId),
  );

  assert(
    schoolScopedDocuments.every(
      (document) => asString(document.data().schoolId) === CONFIG.schoolId,
    ),
    "The demo teacher has data outside Sayh; refusing broad deletion.",
  );
  assert(deletionDocuments.length < 500, "Deletion exceeds one Firestore batch.");

  return {
    orgRoot,
    authUser,
    user,
    person,
    membership,
    deletionDocuments,
  };
}

function buildPreview(preflight) {
  const submissions = preflight.deletionDocuments.filter(
    (document) => document.ref.parent.id === "evaluationSubmissions",
  );
  const summaries = preflight.deletionDocuments.filter((document) =>
    ["evaluationCycleTargetSummaries", "evaluationStaffSummaries"].includes(
      document.ref.parent.id,
    ),
  );

  return {
    identity: CONFIG,
    permanentDeletion: true,
    firestoreDocumentsToDelete: preflight.deletionDocuments.length,
    counts: groupCounts(preflight.deletionDocuments),
    approvedOrSubmittedEvaluationRecords: [
      ...submissions.map((document) => ({
        path: document.ref.path,
        status: document.data().status,
        finalScore: document.data().finalScore,
      })),
      ...summaries.map((document) => ({
        path: document.ref.path,
        status: document.data().status,
        finalScore: document.data().finalScore,
      })),
    ],
    identityDocumentsToDelete: [
      preflight.user.ref.path,
      preflight.person.ref.path,
      `Firebase Auth: ${CONFIG.uid}`,
    ],
  };
}

async function applyDeletion(db, preflight) {
  const batch = db.batch();

  for (const document of preflight.deletionDocuments) {
    batch.delete(document.ref);
  }

  await batch.commit();
  await admin.auth().deleteUser(CONFIG.uid);
  await db.recursiveDelete(preflight.user.ref);
  await db.recursiveDelete(preflight.person.ref);
}

async function verifyDeletion(db, orgRoot) {
  const [references, user, person] = await Promise.all([
    loadIdentityReferences(db, orgRoot),
    db.doc(`users/${CONFIG.uid}`).get(),
    db.doc(`${orgRoot}/people/${CONFIG.personId}`).get(),
  ]);

  assert(references.length === 0, `Found ${references.length} identity references after deletion.`);
  assert(!user.exists, "User document still exists.");
  assert(!person.exists, "Person document still exists.");

  try {
    await admin.auth().getUser(CONFIG.uid);
    throw new Error("Auth user still exists.");
  } catch (error) {
    assert(error?.code === "auth/user-not-found", `Unexpected Auth verification error: ${error?.message || error}`);
  }

  return { remainingIdentityReferences: 0, authDeleted: true, userDeleted: true, personDeleted: true };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildPreview(preflight), { depth: 7 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to permanently delete the demo teacher and all test data.");
    return;
  }

  await applyDeletion(db, preflight);
  const verification = await verifyDeletion(db, preflight.orgRoot);

  console.log("Demo teacher and all linked test data permanently deleted.");
  console.dir(verification);
}

main().catch((error) => {
  console.error("Demo teacher deletion failed:");
  console.error(error);
  process.exitCode = 1;
});
