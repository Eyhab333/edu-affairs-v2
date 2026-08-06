/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  evaluatorRoleKey: "GIRLS_PRINCIPAL",
  excludedRoleKeys: ["GIRLS_TEACHER", "TEACHER", "GUARDIAN"],
  targetRoleKeys: [
    "GIRLS_VP",
    "GIRLS_STUDENT_COUNSELOR",
    "MEDIA_SPECIALIST",
    "ACTIVITY_COORD",
    "ADMIN_ASSISTANT",
    "SCHOOL_MONITOR",
  ],
  requestedAccounts: [
    { displayName: "روعه إبراهيم احمد عبدالله", email: "r.abdallah@qz.org.sa", expectedLabel: "حاضنة" },
    { displayName: "هاجر إبراهيم احمدعبدالله", email: "h.abdallah@qz.org.sa", expectedLabel: "حاضنة" },
    { displayName: "ريف فهد سعود المحترش", email: "r.almuhatrsh@qz.org.sa", expectedLabel: "إعلامية" },
    { displayName: "مرام صالح جوير الفراج", email: "m.alfrraj@qz.org.sa", expectedLabel: "إعلامية" },
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

function membershipCoversSchool(data) {
  return (
    asString(data.schoolId) === CONFIG.schoolId ||
    asString(data.scopeId) === CONFIG.schoolId ||
    data.scopes?.schoolIds?.includes(CONFIG.schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function membershipUid(document) {
  const uid = asString(document.data().uid);
  if (uid) return uid;
  if (document.ref.parent.id === "orgMemberships") {
    return document.ref.parent.parent?.id || "";
  }
  return "";
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

  return uniqueDocuments([...nested, ...root.docs]).filter((membership) =>
    isActive(membership.data()),
  );
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [school, allMemberships, allPeople] = await Promise.all([
    db.doc(`${orgRoot}/schools/${CONFIG.schoolId}`).get(),
    loadMemberships(db),
    db.collection(`${orgRoot}/people`).get(),
  ]);
  const memberships = allMemberships.filter((membership) =>
    membershipCoversSchool(membership.data()),
  );
  const relevantMemberships = memberships.filter(
    (membership) => !CONFIG.excludedRoleKeys.includes(roleKey(membership.data())),
  );
  const people = relevantMemberships.length
    ? await db.getAll(
        ...relevantMemberships.map((membership) =>
          db.doc(`${orgRoot}/people/${asString(membership.data().personId)}`),
        ),
      )
    : [];
  const peopleById = new Map(
    people.filter((person) => person.exists).map((person) => [person.id, person.data()]),
  );
  const allPeopleById = new Map(
    allPeople.docs.map((person) => [person.id, person.data()]),
  );
  const staff = relevantMemberships
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
        manageEvaluations: data.permissions?.manageEvaluations === true,
        membershipPath: membership.ref.path,
      };
    })
    .sort((left, right) => left.roleKey.localeCompare(right.roleKey) || left.displayName.localeCompare(right.displayName, "ar"));
  const evaluator = staff.find((person) => person.roleKey === CONFIG.evaluatorRoleKey);
  let evaluatorOperationalAssignments = [];
  if (evaluator) {
    const operations = await db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", evaluator.personId)
      .get();
    evaluatorOperationalAssignments = operations.docs
      .filter((document) => isActive(document.data()))
      .map((document) => ({
        id: document.id,
        schoolId: asString(document.data().schoolId || document.data().scopeId),
        operationKind: asString(document.data().operationKind),
      }));
  }
  const organizationRoleCandidates = allMemberships
    .filter((membership) =>
      CONFIG.targetRoleKeys.includes(roleKey(membership.data())),
    )
    .map((membership) => {
      const data = membership.data();
      const personId = asString(data.personId);
      const person = allPeopleById.get(personId) || {};
      return {
        personId,
        displayName: asString(person.displayName || data.displayName),
        email: asString(person.email || data.email).toLowerCase(),
        roleKey: roleKey(data),
        coversGirlsSchool: membershipCoversSchool(data),
        scopeType: asString(data.scopeType),
        scopeId: asString(data.scopeId),
        schoolId: asString(data.schoolId),
        schoolIds: Array.from(
          new Set([
            ...(data.scopes?.schoolIds || []),
            ...(data.schoolIds || []),
          ].map(asString).filter(Boolean)),
        ),
        membershipPath: membership.ref.path,
      };
    })
    .filter(
      (candidate) =>
        !candidate.coversGirlsSchool ||
        candidate.displayName.includes("النتيفي") ||
        candidate.email.includes("media"),
    );
  const unassignedNameCandidates = allPeople.docs
    .map((person) => ({
      personId: person.id,
      displayName: asString(person.data().displayName),
      email: asString(person.data().email).toLowerCase(),
    }))
    .filter((person) => {
      const text = `${person.displayName} ${person.email}`.toLowerCase();
      return (
        text.includes("النتيفي") ||
        text.includes("اعلام") ||
        text.includes("إعلام") ||
        text.includes("حاضن") ||
        text.includes("media") ||
        text.includes("nursery")
      );
    });
  const requestedAccounts = [];
  for (const requested of CONFIG.requestedAccounts) {
    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(requested.email);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
    const user = authUser ? await db.doc(`users/${authUser.uid}`).get() : null;
    const membership = authUser
      ? await db.doc(`users/${authUser.uid}/orgMemberships/${CONFIG.orgId}`).get()
      : null;
    const personId = asString(
      membership?.data()?.personId || user?.data()?.personId,
    );
    const person = personId
      ? await db.doc(`${orgRoot}/people/${personId}`).get()
      : null;
    requestedAccounts.push({
      requested,
      foundInAuth: Boolean(authUser),
      uid: authUser?.uid || "",
      personId,
      displayName: asString(person?.data()?.displayName || user?.data()?.displayName),
      email: asString(person?.data()?.email || user?.data()?.email).toLowerCase(),
      membershipExists: membership?.exists === true,
      roleKey: roleKey(membership?.data() || {}),
      active: membership?.exists === true && isActive(membership.data()),
      coversGirlsSchool:
        membership?.exists === true && membershipCoversSchool(membership.data()),
      membershipPath: membership?.ref.path || "",
    });
  }

  console.log("Girls school admin evaluation readiness (read-only)");
  console.dir(
    {
      school: {
        id: CONFIG.schoolId,
        name: asString(school.data()?.name || school.data()?.title),
      },
      evaluator,
      evaluatorOperationalAssignments,
      staff,
      organizationRoleCandidates,
      unassignedNameCandidates,
      requestedAccounts,
    },
    { depth: 8 },
  );
}

main().catch((error) => {
  console.error("Girls admin evaluation readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
