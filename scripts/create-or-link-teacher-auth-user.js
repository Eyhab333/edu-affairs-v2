/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");
const crypto = require("crypto");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function generatePassword() {
  return `Tkw-${crypto.randomBytes(8).toString("hex")}-1448`;
}

function readString(data, key, fallback = "") {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function readDoc(docPath) {
  const snap = await db.doc(docPath).get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    path: snap.ref.path,
    ...snap.data(),
  };
}

async function getOrCreateAuthUser({ email, displayName, password }) {
  try {
    const user = await admin.auth().getUserByEmail(email);

    await admin.auth().updateUser(user.uid, {
      displayName,
      disabled: false,
    });

    return {
      uid: user.uid,
      created: false,
      password: "",
    };
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    const user = await admin.auth().createUser({
      email,
      displayName,
      password,
      emailVerified: false,
      disabled: false,
    });

    return {
      uid: user.uid,
      created: true,
      password,
    };
  }
}

async function main() {
  const personId = getArg("personId", "p-a-brakat");
  const roleKey = getArg("roleKey", "teacher");
  const passwordArg = getArg("password");

  const person = await readDoc(`orgs/${ORG_ID}/people/${personId}`);

  if (!person) {
    throw new Error(`Person not found: orgs/${ORG_ID}/people/${personId}`);
  }

  const email = getArg("email", readString(person, "email"));

  if (!email) {
    throw new Error("email is required");
  }

  const displayName =
    getArg("displayName") ||
    readString(person, "displayName") ||
    readString(person, "name") ||
    readString(person, "nameAr") ||
    email;

  const password = passwordArg || generatePassword();

  console.log("Creating/linking teacher auth user...");
  console.log({
    orgId: ORG_ID,
    personId,
    email,
    displayName,
    roleKey,
  });

  const authResult = await getOrCreateAuthUser({
    email,
    displayName,
    password,
  });

  const uid = authResult.uid;
  const now = Date.now();

  const baseMembership = {
    orgId: ORG_ID,
    uid,
    personId,

    role: roleKey,
    roleKey,
    title: "معلم",
    department: "التعليم",

    isActive: true,

    permissions: {
      manageOrg: false,
      manageUsers: false,
      manageSchools: false,
      manageClasses: false,
      manageSubjects: false,
      manageAssignments: false,
      manageDirectory: false,
      manageEvaluations: false,
      manageCases: false,
      manageDisplay: false,
      sendNotifications: false,
    },

    scopes: {
      canAccessAllSchools: false,
      schoolIds: ["mrb-boys-sayh"],
      gradeIds: ["g1"],
      classIds: ["g1-general-1"],
      subjectKeys: ["GENERAL"],
      routeIds: [],
    },

    updatedAt: now,
  };

  const userRef = db.doc(`users/${uid}`);
  const userOrgMembershipRef = db.doc(`users/${uid}/orgMemberships/${ORG_ID}`);
  const orgMembershipRef = db.doc(`orgs/${ORG_ID}/memberships/${uid}`);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const orgMembershipSnap = await transaction.get(orgMembershipRef);
    const userOrgMembershipSnap = await transaction.get(userOrgMembershipRef);

    transaction.set(
      userRef,
      {
        id: uid,
        uid,
        email,
        displayName,
        personId,
        updatedAt: now,
        ...(userSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );

    transaction.set(
      userOrgMembershipRef,
      {
        ...baseMembership,
        ...(userOrgMembershipSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );

    transaction.set(
      orgMembershipRef,
      {
        id: uid,
        ...baseMembership,
        ...(orgMembershipSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  });

  console.log("");
  console.log("Teacher auth/membership linked successfully ✅");
  console.log({
    uid,
    email,
    personId,
    roleKey,
    createdAuthUser: authResult.created,
  });

  if (authResult.created) {
    console.log("");
    console.log("Temporary password:");
    console.log(authResult.password);
    console.log("");
    console.log("احفظ كلمة المرور الآن؛ لن نستطيع قراءتها مرة أخرى من Firebase Auth.");
  }
}

main().catch((error) => {
  console.error("Failed to create/link teacher auth user:");
  console.error(error);
  process.exit(1);
});