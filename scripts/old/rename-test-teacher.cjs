/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const EMAIL = (process.env.EMAIL || "a.brakat@qz.org.sa").toLowerCase();
const NEW_DISPLAY_NAME = process.env.NEW_DISPLAY_NAME || "المعلم فلان";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json"
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

async function findPersonByEmail(db, email) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  return null;
}

async function findUserByEmail(db, email) {
  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  return null;
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = Date.now();

  console.log("Renaming test teacher...");
  console.log({
    orgId: ORG_ID,
    email: EMAIL,
    newDisplayName: NEW_DISPLAY_NAME,
  });

  const person = await findPersonByEmail(db, EMAIL);
  if (!person) {
    throw new Error(`Person not found for email: ${EMAIL}`);
  }

  const userDoc = await findUserByEmail(db, EMAIL);

  console.log("Found person:");
  console.log({
    personId: person.id,
    oldDisplayName: person.displayName,
    email: person.email,
  });

  if (userDoc) {
    console.log("Found user:");
    console.log({
      uid: userDoc.id,
      oldDisplayName: userDoc.displayName,
      email: userDoc.email,
    });
  } else {
    console.log("No user document found. Will only update person and related evaluation docs.");
  }

  const batch = db.batch();

  batch.set(
    db.doc(`orgs/${ORG_ID}/people/${person.id}`),
    {
      displayName: NEW_DISPLAY_NAME,
      updatedAt: ts,
    },
    { merge: true }
  );

  if (userDoc) {
    batch.set(
      db.doc(`users/${userDoc.id}`),
      {
        displayName: NEW_DISPLAY_NAME,
        updatedAt: ts,
      },
      { merge: true }
    );
  }

  const targetAssignmentsSnap = await db
    .collection(`orgs/${ORG_ID}/evaluationTargetAssignments`)
    .where("targetPersonId", "==", person.id)
    .get();

  for (const docSnap of targetAssignmentsSnap.docs) {
    batch.set(
      docSnap.ref,
      {
        targetDisplayName: NEW_DISPLAY_NAME,
        updatedAt: ts,
      },
      { merge: true }
    );
  }

  await batch.commit();

  if (userDoc) {
    await admin.auth().updateUser(userDoc.id, {
      displayName: NEW_DISPLAY_NAME,
    });
  }

  console.log("✅ Rename completed successfully.");
  console.log({
    personId: person.id,
    userId: userDoc?.id || null,
    email: EMAIL,
    newDisplayName: NEW_DISPLAY_NAME,
    evaluationTargetAssignmentsUpdated: targetAssignmentsSnap.size,
  });
}

main().catch((error) => {
  console.error("❌ Rename failed:");
  console.error(error);
  process.exit(1);
});