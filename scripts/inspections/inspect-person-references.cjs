/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  personId: "p-a-brakat",
  uid: "owgHkCBLiLa42srMZrjFLNqCMQD2",
  email: "a.brakat@qz.org.sa",
};

const PERSON_FIELDS = [
  "personId",
  "actorPersonId",
  "teacherPersonId",
  "targetPersonId",
  "evaluatorPersonId",
  "principalPersonId",
  "staffPersonId",
  "createdByPersonId",
  "updatedByPersonId",
  "approvedByPersonId",
  "reviewedByPersonId",
];

const UID_FIELDS = ["uid", "userId", "actorUid", "createdByUid", "updatedByUid"];
const EMAIL_FIELDS = ["email", "targetEmail", "evaluatorEmail", "actorEmail"];

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = db.doc(`orgs/${CONFIG.orgId}`);
  const collections = await orgRoot.listCollections();
  const references = new Map();

  for (const collection of collections) {
    const queries = [
      ...PERSON_FIELDS.map((field) => ({ field, value: CONFIG.personId })),
      ...UID_FIELDS.map((field) => ({ field, value: CONFIG.uid })),
      ...EMAIL_FIELDS.map((field) => ({ field, value: CONFIG.email })),
    ];

    const snapshots = await Promise.all(
      queries.map(async (item) => ({
        item,
        snapshot: await collection.where(item.field, "==", item.value).get(),
      })),
    );

    for (const { item, snapshot } of snapshots) {
      for (const document of snapshot.docs) {
        const existing = references.get(document.ref.path) || {
          path: document.ref.path,
          collection: collection.id,
          matchedFields: [],
          data: document.data(),
        };

        existing.matchedFields.push(item.field);
        references.set(document.ref.path, existing);
      }
    }
  }

  let authUser = null;

  try {
    const user = await admin.auth().getUser(CONFIG.uid);
    authUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: user.disabled,
    };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  const [userDocument, personDocument] = await Promise.all([
    db.doc(`users/${CONFIG.uid}`).get(),
    db.doc(`orgs/${CONFIG.orgId}/people/${CONFIG.personId}`).get(),
  ]);
  const userCollections = userDocument.exists
    ? await userDocument.ref.listCollections()
    : [];
  const groupedReferences = Array.from(references.values()).reduce(
    (groups, reference) => {
      groups[reference.collection] = groups[reference.collection] || [];
      groups[reference.collection].push(reference);
      return groups;
    },
    {},
  );

  console.log("Person reference inspection (read-only)");
  console.dir(
    {
      identity: CONFIG,
      authUser,
      userDocument: userDocument.exists
        ? { path: userDocument.ref.path, data: userDocument.data() }
        : null,
      userSubcollections: userCollections.map((collection) => collection.id),
      personDocument: personDocument.exists
        ? { path: personDocument.ref.path, data: personDocument.data() }
        : null,
      referenceCounts: Object.fromEntries(
        Object.entries(groupedReferences).map(([key, values]) => [key, values.length]),
      ),
      references: groupedReferences,
    },
    { depth: 8 },
  );
}

main().catch((error) => {
  console.error("Person reference inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
