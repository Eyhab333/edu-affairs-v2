/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length).trim();
}

function pickString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function printSection(title) {
  console.log("");
  console.log("=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

function printData(label, data) {
  console.log("");
  console.log(`--- ${label} ---`);
  console.dir(data ?? null, { depth: 12, colors: true });
}

async function readDoc(docPath) {
  const snap = await db.doc(docPath).get();

  if (!snap.exists) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function getAuthUser({ email, uid }) {
  if (uid) {
    return admin.auth().getUser(uid);
  }

  if (email) {
    return admin.auth().getUserByEmail(email);
  }

  console.error("استخدم أحد الخيارين:");
  console.error("node scripts/inspect-staff-user.js --email=teacher@example.com");
  console.error("node scripts/inspect-staff-user.js --uid=USER_UID");
  process.exit(1);
}

async function queryCollection(collectionPath, field, op, value, limit = 10) {
  const snap = await db
    .collection(collectionPath)
    .where(field, op, value)
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function listSubcollection(collectionPath, limit = 50) {
  const snap = await db.collection(collectionPath).limit(limit).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function tryQuery(label, collectionPath, field, value) {
  try {
    if (!value) return [];

    const rows = await queryCollection(collectionPath, field, "==", value);

    printData(`${label}: ${collectionPath} where ${field} == ${value}`, rows);

    return rows;
  } catch (error) {
    printData(`${label}: failed`, {
      collectionPath,
      field,
      value,
      message: error.message,
    });

    return [];
  }
}

async function main() {
  const email = getArg("email");
  const uidArg = getArg("uid");

  printSection("Inspect staff user - READ ONLY");

  const authUser = await getAuthUser({
    email,
    uid: uidArg,
  });

  const uid = authUser.uid;

  printData("Firebase Auth user", {
    uid: authUser.uid,
    email: authUser.email,
    displayName: authUser.displayName,
    disabled: authUser.disabled,
    customClaims: authUser.customClaims ?? {},
  });

  const userPath = `users/${uid}`;
  const userData = await readDoc(userPath);

  printData(userPath, userData);

  const userPersonId = pickString(userData?.personId);
  const userDisplayName =
    pickString(userData?.displayName) ||
    pickString(userData?.name) ||
    pickString(userData?.nameAr) ||
    pickString(authUser.displayName);

  const userMembershipsPath = `users/${uid}/orgMemberships`;
  const userOrgMemberships = await listSubcollection(userMembershipsPath);

  printData(userMembershipsPath, userOrgMemberships);

  const selectedOrgMembershipPath = `users/${uid}/orgMemberships/${ORG_ID}`;
  const selectedOrgMembership = await readDoc(selectedOrgMembershipPath);

  printData(selectedOrgMembershipPath, selectedOrgMembership);

  const personId =
    userPersonId ||
    pickString(selectedOrgMembership?.personId) ||
    pickString(selectedOrgMembership?.actorPersonId);

  if (!personId) {
    printSection("Result");
    console.log("لم أجد personId في users/{uid} أو orgMemberships.");
    console.log("سنحتاج معرفة مكان ربط المستخدم بالـ person يدويًا.");
    return;
  }

  const personPath = `orgs/${ORG_ID}/people/${personId}`;
  const personData = await readDoc(personPath);

  printData(personPath, personData);

  await tryQuery(
    "org memberships by personId",
    `orgs/${ORG_ID}/memberships`,
    "personId",
    personId
  );

  await tryQuery(
    "org memberships by uid",
    `orgs/${ORG_ID}/memberships`,
    "uid",
    uid
  );

  await tryQuery(
    "org staff by personId",
    `orgs/${ORG_ID}/staff`,
    "personId",
    personId
  );

  await tryQuery(
    "org staff by uid",
    `orgs/${ORG_ID}/staff`,
    "uid",
    uid
  );

  await tryQuery(
    "teacher assignments by personId",
    `orgs/${ORG_ID}/teacherAssignments`,
    "personId",
    personId
  );

  await tryQuery(
    "operational assignments by actorPersonId",
    `orgs/${ORG_ID}/operationalAssignments`,
    "actorPersonId",
    personId
  );

  printSection("Useful summary");

  console.dir(
    {
      orgId: ORG_ID,
      uid,
      email: authUser.email || email || "",
      personId,
      displayName:
        userDisplayName ||
        pickString(personData?.displayName) ||
        pickString(personData?.name) ||
        pickString(personData?.nameAr) ||
        "",

      userRole:
        selectedOrgMembership?.roleKey ||
        selectedOrgMembership?.role ||
        "",

      isActive:
        selectedOrgMembership?.isActive ??
        selectedOrgMembership?.active ??
        null,
    },
    { depth: 8, colors: true }
  );

  printSection("Done");
  console.log("تم الفحص بدون تعديل أي بيانات ✅");
}

main().catch((error) => {
  console.error("فشل فحص المستخدم:");
  console.error(error);
  process.exit(1);
});