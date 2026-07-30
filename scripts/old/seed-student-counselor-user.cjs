/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";

const EMAIL = "students-mentor-syeh@qz.org.sa";
const DISPLAY_NAME = "الموجه الطلابي - منار بنين السيح";

const PERSON_ID = "p-students-mentor-syeh";
const ROLE_KEY = "STUDENT_COUNSELOR";
const ROLE_LABEL = "الموجه الطلابي";

const PASSWORD = process.env.PASSWORD || "Takween@123456";

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

async function getOrCreateAuthUser() {
  try {
    const user = await admin.auth().getUserByEmail(EMAIL);

    await admin.auth().updateUser(user.uid, {
      displayName: DISPLAY_NAME,
      disabled: false,
    });

    return user.uid;
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    const user = await admin.auth().createUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true,
      disabled: false,
    });

    return user.uid;
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const now = Date.now();

  const uid = await getOrCreateAuthUser();

  console.log("Seeding student counselor user...");
  console.log({
    uid,
    personId: PERSON_ID,
    email: EMAIL,
    displayName: DISPLAY_NAME,
    roleKey: ROLE_KEY,
  });

  await Promise.all([
    db.doc(`users/${uid}`).set(
      {
        uid,
        email: EMAIL,
        displayName: DISPLAY_NAME,
        personId: PERSON_ID,
        isActive: true,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    ),

    db.doc(`users/${uid}/orgMemberships/${ORG_ID}`).set(
      {
        orgId: ORG_ID,
        personId: PERSON_ID,
        role: "staff",
        roleKey: ROLE_KEY,
        roleLabel: ROLE_LABEL,
        isActive: true,
        status: "ACTIVE",
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    ),

    db.doc(`orgs/${ORG_ID}/people/${PERSON_ID}`).set(
      {
        id: PERSON_ID,
        uid,
        orgId: ORG_ID,
        email: EMAIL,
        displayName: DISPLAY_NAME,
        fullName: DISPLAY_NAME,
        roleKey: ROLE_KEY,
        roleLabel: ROLE_LABEL,
        isActive: true,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    ),

    db.doc(`orgs/${ORG_ID}/operationalMemberships/op-${PERSON_ID}`).set(
      {
        id: `op-${PERSON_ID}`,
        orgId: ORG_ID,
        personId: PERSON_ID,
        uid,
        email: EMAIL,
        displayName: DISPLAY_NAME,
        roleKey: ROLE_KEY,
        roleLabel: ROLE_LABEL,
        scopeType: "SCHOOL",
        scopeId: SCHOOL_ID,
        schoolId: SCHOOL_ID,
        isActive: true,
        status: "ACTIVE",
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    ),
  ]);

  console.log("\n✅ Student counselor user/person seeded successfully.");
  console.log({
    email: EMAIL,
    password: PASSWORD,
    personId: PERSON_ID,
    uid,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to seed student counselor user:");
  console.error(error);
  process.exit(1);
});