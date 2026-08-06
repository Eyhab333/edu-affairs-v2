/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  email: "t.altwala@qz.org.sa",
  schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
};

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = require(path.resolve(process.cwd(), "service-account.json"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}

function membershipCoversSchool(data, schoolId) {
  return asString(data.schoolId) === schoolId || asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) || data.scopes?.canAccessAllSchools === true;
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const authUser = await admin.auth().getUserByEmail(CONFIG.email);
  const [user, membership] = await Promise.all([
    db.doc(`users/${authUser.uid}`).get(),
    db.doc(`users/${authUser.uid}/orgMemberships/${CONFIG.orgId}`).get(),
  ]);
  const membershipData = membership.data() || {};
  const personId = asString(membershipData.personId || user.data()?.personId);
  const [person, operations] = await Promise.all([
    db.doc(`${orgRoot}/people/${personId}`).get(),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", personId).get(),
  ]);

  console.log("Kindergarten values coordinator readiness (read-only)");
  console.dir({
    evaluator: {
      uid: authUser.uid,
      personId,
      displayName: asString(person.data()?.displayName || user.data()?.displayName),
      email: asString(authUser.email).toLowerCase(),
      roleKey: asString(membershipData.roleKey || membershipData.role).toUpperCase(),
      active: membership.exists && isActive(membershipData),
      manageEvaluations: membershipData.permissions?.manageEvaluations === true,
      schools: CONFIG.schoolIds.map((schoolId) => ({
        schoolId,
        coveredByMembership: membershipCoversSchool(membershipData, schoolId),
      })),
      activeOperationalAssignments: operations.docs
        .filter((document) => isActive(document.data()))
        .map((document) => ({
          id: document.id,
          schoolId: asString(document.data().schoolId || document.data().scopeId),
          operationKind: asString(document.data().operationKind),
        })),
    },
  }, { depth: 10 });
}

main().catch((error) => {
  console.error("Kindergarten values coordinator readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
