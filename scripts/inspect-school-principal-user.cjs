/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";

const EMAIL = (
  process.env.EMAIL || "a-s-alkmays@qz.org.sa"
).toLowerCase();

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
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

async function findAuthUser() {
  try {
    const user = await admin.auth().getUserByEmail(EMAIL);

    return {
      found: true,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "",
      disabled: user.disabled,
      emailVerified: user.emailVerified,
    };
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return {
        found: false,
      };
    }

    throw error;
  }
}

async function findPeopleByEmail(db) {
  const directSnap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", EMAIL)
    .get();

  const direct = directSnap.docs.map(dataWithId);

  const allSnap = await db.collection(`orgs/${ORG_ID}/people`).get();

  const fallback = allSnap.docs
    .map(dataWithId)
    .filter(
      (person) =>
        String(person.email || "").toLowerCase() === EMAIL ||
        String(person.workEmail || "").toLowerCase() === EMAIL ||
        String(person.personalEmail || "").toLowerCase() === EMAIL
    );

  const merged = new Map();

  for (const person of [...direct, ...fallback]) {
    merged.set(person.path, person);
  }

  return Array.from(merged.values());
}

async function findUsersByEmail(db) {
  const directSnap = await db
    .collection("users")
    .where("email", "==", EMAIL)
    .get();

  const direct = directSnap.docs.map(dataWithId);

  const allSnap = await db.collection("users").get();

  const fallback = allSnap.docs
    .map(dataWithId)
    .filter(
      (user) =>
        String(user.email || "").toLowerCase() === EMAIL ||
        String(user.workEmail || "").toLowerCase() === EMAIL
    );

  const merged = new Map();

  for (const user of [...direct, ...fallback]) {
    merged.set(user.path, user);
  }

  return Array.from(merged.values());
}

async function findMembershipsByPersonIds(db, personIds) {
  if (!personIds.length) return [];

  const allSnap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .get();

  return allSnap.docs
    .map(dataWithId)
    .filter((membership) => personIds.includes(membership.personId));
}

async function findOrgMembershipsByUserIds(db, userIds) {
  const results = [];

  for (const uid of userIds) {
    const snap = await db.doc(`users/${uid}/orgMemberships/${ORG_ID}`).get();

    if (snap.exists) {
      results.push(dataWithId(snap));
    }
  }

  return results;
}

async function findSchoolPrincipalLikeMemberships(db) {
  const allSnap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .get();

  return allSnap.docs
    .map(dataWithId)
    .filter((membership) => {
      const text = [
        membership.email,
        membership.displayName,
        membership.roleKey,
        membership.roleLabel,
        membership.scopeId,
        membership.schoolId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (membership.schoolId === SCHOOL_ID || membership.scopeId === SCHOOL_ID) &&
        (text.includes("principal") ||
          text.includes("مدير") ||
          text.includes("school_principal"))
      );
    });
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log("Inspecting school principal user...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    email: EMAIL,
  });

  const authUser = await findAuthUser();
  const people = await findPeopleByEmail(db);
  const users = await findUsersByEmail(db);

  const personIds = people.map((person) => person.id);
  const userIds = Array.from(
    new Set([
      ...users.map((user) => user.id),
      ...(authUser.found ? [authUser.uid] : []),
      ...people.map((person) => person.uid).filter(Boolean),
    ])
  );

  const operationalMemberships = await findMembershipsByPersonIds(db, personIds);
  const orgMemberships = await findOrgMembershipsByUserIds(db, userIds);
  const principalLikeMemberships = await findSchoolPrincipalLikeMemberships(db);

  console.log("\nAuth user:");
  console.log(authUser);

  console.log(`\nPeople by email: ${people.length}`);
  for (const person of people) {
    console.log({
      path: person.path,
      id: person.id,
      uid: person.uid,
      email: person.email,
      displayName: person.displayName,
      roleKey: person.roleKey,
      roleLabel: person.roleLabel,
      isActive: person.isActive,
    });
  }

  console.log(`\nUsers by email: ${users.length}`);
  for (const user of users) {
    console.log({
      path: user.path,
      id: user.id,
      uid: user.uid,
      personId: user.personId,
      email: user.email,
      displayName: user.displayName,
      roleKey: user.roleKey,
      roleLabel: user.roleLabel,
      isActive: user.isActive,
    });
  }

  console.log(`\nOrg memberships: ${orgMemberships.length}`);
  for (const membership of orgMemberships) {
    console.log({
      path: membership.path,
      orgId: membership.orgId,
      personId: membership.personId,
      role: membership.role,
      roleKey: membership.roleKey,
      roleLabel: membership.roleLabel,
      status: membership.status,
      isActive: membership.isActive,
    });
  }

  console.log(`\nOperational memberships for matched person: ${operationalMemberships.length}`);
  for (const membership of operationalMemberships) {
    console.log({
      path: membership.path,
      personId: membership.personId,
      uid: membership.uid,
      email: membership.email,
      displayName: membership.displayName,
      roleKey: membership.roleKey,
      roleLabel: membership.roleLabel,
      scopeType: membership.scopeType,
      scopeId: membership.scopeId,
      schoolId: membership.schoolId,
      status: membership.status,
      isActive: membership.isActive,
    });
  }

  console.log(`\nPrincipal-like memberships in school: ${principalLikeMemberships.length}`);
  for (const membership of principalLikeMemberships) {
    console.log({
      path: membership.path,
      personId: membership.personId,
      uid: membership.uid,
      email: membership.email,
      displayName: membership.displayName,
      roleKey: membership.roleKey,
      roleLabel: membership.roleLabel,
      scopeType: membership.scopeType,
      scopeId: membership.scopeId,
      schoolId: membership.schoolId,
      status: membership.status,
      isActive: membership.isActive,
    });
  }

  console.log("\n✅ Inspect completed.");
}

main().catch((error) => {
  console.error("\n❌ Inspect failed:");
  console.error(error);
  process.exit(1);
});