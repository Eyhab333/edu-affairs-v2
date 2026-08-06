/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
  roleKeys: [
    "KG_PRINCIPAL",
    "KG_VP",
    "ADMIN_ASSISTANT",
    "MEDIA_SPECIALIST",
    "NURSERY_CAREGIVER",
  ],
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

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status)
  );
}

function roleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function membershipUid(document) {
  return asString(document.data().uid) || document.ref.parent.parent?.id || "";
}

async function loadMemberships(db) {
  const users = await db.collection("users").get();
  const memberships = [];

  for (let index = 0; index < users.docs.length; index += 400) {
    const snapshots = await db.getAll(
      ...users.docs.slice(index, index + 400).map((user) =>
        db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
      ),
    );
    memberships.push(...snapshots.filter((document) => document.exists));
  }

  return memberships.filter((document) => isActive(document.data()));
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const memberships = await loadMemberships(db);
  const schools = [];

  for (const schoolId of CONFIG.schoolIds) {
    const school = await db.doc(`${orgRoot}/schools/${schoolId}`).get();
    const schoolMemberships = memberships.filter((membership) => {
      const data = membership.data();
      return (
        CONFIG.roleKeys.includes(roleKey(data)) &&
        membershipCoversSchool(data, schoolId)
      );
    });

    const people = schoolMemberships.length
      ? await db.getAll(
          ...schoolMemberships.map((membership) =>
            db.doc(`${orgRoot}/people/${asString(membership.data().personId)}`),
          ),
        )
      : [];
    const peopleById = new Map(
      people.filter((person) => person.exists).map((person) => [person.id, person.data()]),
    );

    const staff = schoolMemberships
      .map((membership) => {
        const data = membership.data();
        const personId = asString(data.personId);
        const person = peopleById.get(personId) || {};
        return {
          uid: membershipUid(membership),
          personId,
          displayName: asString(person.displayName || data.displayName),
          email: asString(person.email || data.email).toLowerCase(),
          roleKey: roleKey(data),
          title: asString(data.title || person.title || person.jobTitle),
          manageEvaluations: data.permissions?.manageEvaluations === true,
          membershipPath: membership.ref.path,
        };
      })
      .sort(
        (left, right) =>
          left.roleKey.localeCompare(right.roleKey) ||
          left.displayName.localeCompare(right.displayName, "ar"),
      );

    const principals = staff.filter((person) => person.roleKey === "KG_PRINCIPAL");
    for (const principal of principals) {
      const assignments = await db
        .collection(`${orgRoot}/operationalAssignments`)
        .where("actorPersonId", "==", principal.personId)
        .get();
      principal.activeOperationalAssignments = assignments.docs
        .filter((document) => isActive(document.data()))
        .map((document) => ({
          id: document.id,
          schoolId: asString(document.data().schoolId || document.data().scopeId),
          operationKind: asString(document.data().operationKind),
        }));
    }

    schools.push({
      schoolId,
      schoolLabel: asString(school.data()?.name || school.data()?.title),
      staff,
    });
  }

  console.log("Kindergarten admin evaluation readiness (read-only)");
  console.dir({ schools }, { depth: 10 });
}

main().catch((error) => {
  console.error("Kindergarten admin evaluation readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
