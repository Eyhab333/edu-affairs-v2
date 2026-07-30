/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";

const EMAIL = "a-s-alkmays@qz.org.sa";
const DISPLAY_NAME = "أحمد سليمان عبدالله الخميس";

const PERSON_ID = "p-a-s-alkmays";

// نستخدم الدور الموجود فعلًا عندك في البيانات
const ROLE_KEY = "BOYS_PRINCIPAL";
const ROLE_LABEL = "مدير المدرسة";

const PASSWORD = process.env.PASSWORD || "Takween@123456";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
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
      displayName: user.displayName || DISPLAY_NAME,
      disabled: false,
    });

    return user.uid;
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;

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

  console.log("Syncing school principal user...");
  console.log({
    uid,
    personId: PERSON_ID,
    email: EMAIL,
    displayName: DISPLAY_NAME,
    roleKey: ROLE_KEY,
    roleLabel: ROLE_LABEL,
    schoolId: SCHOOL_ID,
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
      },
      { merge: true }
    ),

    // نحدّث العضوية القديمة الموجودة بدل إنشاء واحدة مكررة
    db.doc(`orgs/${ORG_ID}/operationalMemberships/op-boys-principal`).set(
      {
        id: "op-boys-principal",
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
      },
      { merge: true }
    ),
  ]);

  console.log("\n✅ School principal synced successfully.");
  console.log({
    email: EMAIL,
    password: PASSWORD,
    personId: PERSON_ID,
    uid,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to sync school principal:");
  console.error(error);
  process.exit(1);
});