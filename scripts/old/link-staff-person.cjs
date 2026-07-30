const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function readArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (const arg of args) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg.slice(2).split("=");
    result[key] = valueParts.join("=");
  }

  return result;
}

function requireArg(args, key) {
  const value = args[key];

  if (!value) {
    throw new Error(`Missing required argument: --${key}=...`);
  }

  return value;
}

function loadServiceAccount(args) {
  const explicitPath = args.serviceAccount;
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const serviceAccountPath =
    explicitPath ||
    envPath ||
    path.join(process.cwd(), "service-account.json");

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Service account file not found: ${serviceAccountPath}\n` +
        `Pass --serviceAccount=path/to/service-account.json`,
    );
  }

  return require(path.resolve(serviceAccountPath));
}

async function main() {
  const args = readArgs();

  const email = requireArg(args, "email").trim().toLowerCase();
  const orgId = args.orgId || "takween";
  const role = args.role || "platform_owner";
  const displayNameArg = args.displayName || "";
  const personIdArg = args.personId || "";
  const title = args.title || "";

  const serviceAccount = loadServiceAccount(args);

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  const auth = getAuth();
  const db = getFirestore();

  console.log("🔎 البحث عن المستخدم في Firebase Auth...");
  const user = await auth.getUserByEmail(email);

  const uid = user.uid;
  const personId = personIdArg || uid;
  const displayName =
    displayNameArg || user.displayName || user.email || personId;

  const now = Date.now();

  console.log("✅ تم العثور على المستخدم:");
  console.log(`- uid: ${uid}`);
  console.log(`- email: ${email}`);
  console.log(`- personId: ${personId}`);
  console.log(`- orgId: ${orgId}`);
  console.log(`- role: ${role}`);

  const userRef = db.doc(`users/${uid}`);
  const userMembershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
  const personRef = db.doc(`orgs/${orgId}/people/${personId}`);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const personSnap = await tx.get(personRef);
    const membershipSnap = await tx.get(userMembershipRef);

    tx.set(
      userRef,
      {
        uid,
        displayName,
        email,
        photoUrl: user.photoURL || "",
        personId,
        isDisabled: !!user.disabled,
        createdAt: userSnap.exists
          ? userSnap.data().createdAt || now
          : now,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(
      personRef,
      {
        id: personId,
        displayName,
        email,
        phone: "",
        createdAt: personSnap.exists
          ? personSnap.data().createdAt || now
          : now,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(
      userMembershipRef,
      {
        id: orgId,
        uid,
        personId,
        orgId,
        role,
        roleKey: role,
        title,
        department: "",
        scopes: {
          schoolIds: [],
          gradeIds: [],
          classIds: [],
          subjectKeys: [],
          routeIds: [],
          canAccessAllSchools: true,
        },
        permissions: {
          manageOrg: true,
          manageSchools: true,
          manageAcademicYears: true,
          manageGrades: true,
          manageClasses: true,
          manageSubjects: true,
          manageUsers: true,
          manageDirectory: true,
          manageAssignments: true,
          manageCases: true,
          manageEvaluations: true,
          manageDisplay: true,
          sendNotifications: true,
        },
        isActive: true,
        createdAt: membershipSnap.exists
          ? membershipSnap.data().createdAt || now
          : now,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(
      db.doc(`orgs/${orgId}/memberships/${uid}`),
      {
        id: uid,
        uid,
        personId,
        orgId,
        role,
        roleKey: role,
        title,
        department: "",
        scopes: {
          schoolIds: [],
          gradeIds: [],
          classIds: [],
          subjectKeys: [],
          routeIds: [],
          canAccessAllSchools: true,
        },
        permissions: {
          manageOrg: true,
          manageSchools: true,
          manageAcademicYears: true,
          manageGrades: true,
          manageClasses: true,
          manageSubjects: true,
          manageUsers: true,
          manageDirectory: true,
          manageAssignments: true,
          manageCases: true,
          manageEvaluations: true,
          manageDisplay: true,
          sendNotifications: true,
        },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  await auth.setCustomUserClaims(uid, {
    orgId,
    personId,
    role,
  });

  console.log("✅ تم الربط بنجاح.");
  console.log("");
  console.log("المستندات التي تم تحديثها:");
  console.log(`- users/${uid}`);
  console.log(`- users/${uid}/orgMemberships/${orgId}`);
  console.log(`- orgs/${orgId}/people/${personId}`);
  console.log(`- orgs/${orgId}/memberships/${uid}`);
  console.log("");
  console.log("ملاحظة: سجّل خروج ثم دخول مرة أخرى حتى تظهر custom claims الجديدة.");
}

main().catch((error) => {
  console.error("❌ فشل تنفيذ الربط:");
  console.error(error);
  process.exit(1);
});