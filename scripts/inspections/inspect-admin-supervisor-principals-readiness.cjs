/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schools: [
    { id: "mrb-girls", principalRoleKey: "GIRLS_PRINCIPAL" },
    { id: "kg-01", principalRoleKey: "KG_PRINCIPAL" },
    { id: "kg-02", principalRoleKey: "KG_PRINCIPAL" },
    { id: "kg-03", principalRoleKey: "KG_PRINCIPAL" },
    { id: "kg-04", principalRoleKey: "KG_PRINCIPAL" },
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

function membershipRoleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function membershipUid(document) {
  const dataUid = asString(document.data().uid);
  if (dataUid) return dataUid;
  if (document.ref.parent.id === "orgMemberships") {
    return document.ref.parent.parent?.id || "";
  }
  return "";
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

async function loadMemberships(db) {
  const users = await db.collection("users").get();
  const nested = [];
  for (let index = 0; index < users.docs.length; index += 400) {
    const group = users.docs.slice(index, index + 400);
    const snapshots = await db.getAll(
      ...group.map((user) =>
        db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
      ),
    );
    nested.push(...snapshots.filter((document) => document.exists));
  }

  const root = await db.collection(`orgs/${CONFIG.orgId}/memberships`).get();
  return uniqueDocuments([...nested, ...root.docs]).filter((document) =>
    isActive(document.data()),
  );
}

async function personFromMembership(db, membership) {
  const data = membership.data();
  const personId = asString(data.personId);
  const person = personId
    ? await db.doc(`orgs/${CONFIG.orgId}/people/${personId}`).get()
    : null;
  return {
    uid: membershipUid(membership),
    personId,
    displayName: asString(person?.data()?.displayName || data.displayName),
    email: asString(person?.data()?.email || data.email).toLowerCase(),
    roleKey: membershipRoleKey(data),
    manageEvaluations: data.permissions?.manageEvaluations === true,
    schoolIds: CONFIG.schools
      .map((school) => school.id)
      .filter((schoolId) => membershipCoversSchool(data, schoolId)),
    membershipPath: membership.ref.path,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const memberships = await loadMemberships(db);
  const supervisorMemberships = memberships.filter(
    (membership) => membershipRoleKey(membership.data()) === "ADMIN_SUPERVISOR",
  );
  const principalMemberships = memberships.filter((membership) =>
    ["GIRLS_PRINCIPAL", "KG_PRINCIPAL"].includes(
      membershipRoleKey(membership.data()),
    ),
  );
  const supervisors = await Promise.all(
    supervisorMemberships.map((membership) =>
      personFromMembership(db, membership),
    ),
  );

  for (const supervisor of supervisors) {
    const operations = await db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", supervisor.personId)
      .get();
    supervisor.activeOperationalAssignments = operations.docs
      .filter((document) => isActive(document.data()))
      .map((document) => ({
        id: document.id,
        schoolId: asString(document.data().schoolId || document.data().scopeId),
        operationKind: asString(document.data().operationKind),
      }));
  }

  const schools = [];
  for (const schoolConfig of CONFIG.schools) {
    const school = await db.doc(`${orgRoot}/schools/${schoolConfig.id}`).get();
    const matches = principalMemberships.filter((membership) => {
      const data = membership.data();
      return (
        membershipRoleKey(data) === schoolConfig.principalRoleKey &&
        membershipCoversSchool(data, schoolConfig.id)
      );
    });
    schools.push({
      id: schoolConfig.id,
      name: asString(school.data()?.name || school.data()?.title),
      expectedRoleKey: schoolConfig.principalRoleKey,
      principals: await Promise.all(
        matches.map((membership) => personFromMembership(db, membership)),
      ),
    });
  }

  console.log("Admin supervisor principals readiness (read-only)");
  console.dir({ supervisors, schools }, { depth: 9 });
}

main().catch((error) => {
  console.error("Admin supervisor principals readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
