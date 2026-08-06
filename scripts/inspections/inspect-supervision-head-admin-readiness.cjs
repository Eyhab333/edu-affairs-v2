/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  supervisionHeadRoleKeys: ["ORG_SUPERVISION_HEAD", "BOYS_SUPERVISION_HEAD"],
  targetPlans: [
    { key: "principal", roleKey: "BOYS_PRINCIPAL", planSuffix: "director-weekly-teacher-evaluation" },
    { key: "media", roleKey: "MEDIA_SPECIALIST", planSuffix: "director-admin-media-evaluation" },
    { key: "admin-assistant", roleKey: "ADMIN_ASSISTANT", planSuffix: "director-admin-assistant-evaluation" },
    { key: "activity-leader", roleKey: "ACTIVITY_COORD", planSuffix: "director-admin-activity-leader-evaluation" },
    { key: "vice-principal", roleKey: "BOYS_VP", planSuffix: "director-admin-vice-principal-evaluation" },
    { key: "educational-vice-principal", roleKey: "BOYS_EDU_VP", planSuffix: "director-admin-educational-vice-principal-evaluation" },
    { key: "student-guide", roleKey: "BOYS_STUDENT_GUIDE", planSuffix: "director-admin-student-counselor-evaluation" },
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

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && !["INACTIVE", "DISABLED", "ENDED", "REVOKED"].includes(status);
}

async function loadSupervisionHeads(db) {
  const [users, orgMemberships] = await Promise.all([
    db.collection("users").get(),
    db.collection(`orgs/${CONFIG.orgId}/memberships`)
      .where("roleKey", "in", CONFIG.supervisionHeadRoleKeys)
      .get(),
  ]);
  const nestedMemberships = [];

  for (let index = 0; index < users.docs.length; index += 400) {
    const group = users.docs.slice(index, index + 400);
    const snapshots = await db.getAll(
      ...group.map((user) =>
        db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
      ),
    );
    nestedMemberships.push(...snapshots.filter((document) => document.exists));
  }

  const memberships = uniqueDocuments([
    ...nestedMemberships,
    ...orgMemberships.docs,
  ]).filter((document) => {
    const data = document.data();
    const roleKey = asString(data.roleKey || data.role).toUpperCase();
    return CONFIG.supervisionHeadRoleKeys.includes(roleKey) && isActive(data);
  });
  const people = memberships.length
    ? await db.getAll(
        ...memberships.map((membership) =>
          db.doc(`orgs/${CONFIG.orgId}/people/${asString(membership.data().personId)}`),
        ),
      )
    : [];
  const peopleById = new Map(
    people.filter((person) => person.exists).map((person) => [person.id, person.data()]),
  );

  const heads = memberships.map((membership) => {
    const data = membership.data();
    const personId = asString(data.personId);
    const person = peopleById.get(personId) || {};
    const uid = membership.ref.parent.id === "orgMemberships"
      ? membership.ref.parent.parent?.id || asString(data.uid)
      : asString(data.uid);

    return {
      uid,
      personId,
      displayName: asString(person.displayName || data.displayName),
      email: asString(person.email || data.email).toLowerCase(),
      roleKey: asString(data.roleKey || data.role).toUpperCase(),
      manageEvaluations: data.permissions?.manageEvaluations === true,
      schoolIds: Array.from(new Set([
        ...(data.scopes?.schoolIds || []),
        data.scopeType === "SCHOOL" ? data.scopeId : "",
      ].map(asString).filter(Boolean))),
      canAccessAllSchools: data.scopes?.canAccessAllSchools === true,
      membershipPath: membership.ref.path,
    };
  });

  for (const head of heads) {
    const assignments = await db.collection(`orgs/${CONFIG.orgId}/operationalAssignments`)
      .where("actorPersonId", "==", head.personId)
      .get();
    head.activeOperationalAssignments = assignments.docs
      .filter((document) => isActive(document.data()))
      .map((document) => ({
        id: document.id,
        schoolId: asString(document.data().schoolId || document.data().scopeId),
        operationKind: asString(document.data().operationKind),
      }));
  }

  return heads;
}

async function loadSchoolTargets(db, schoolId) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const targetSnapshot = await db.collection(`${orgRoot}/evaluationTargetAssignments`)
    .where("schoolId", "==", schoolId)
    .get();
  const evaluatorSnapshot = await db.collection(`${orgRoot}/evaluationEvaluatorAssignments`)
    .where("schoolId", "==", schoolId)
    .get();

  return CONFIG.targetPlans.map((target) => {
    const planId = `${schoolId}-ay-1448-term-1-${target.planSuffix}`;
    let matches;

    if (target.key === "principal") {
      matches = evaluatorSnapshot.docs
        .filter((document) => asString(document.data().planId) === planId)
        .map((document) => ({
          personId: asString(document.data().evaluatorPersonId),
          displayName: asString(document.data().evaluatorDisplayName),
          email: asString(document.data().evaluatorEmail).toLowerCase(),
          roleKey: asString(document.data().evaluatorRoleKey).toUpperCase(),
        }));
    } else {
      matches = targetSnapshot.docs
        .filter((document) => asString(document.data().planId) === planId)
        .map((document) => ({
          personId: asString(document.data().targetPersonId),
          displayName: asString(document.data().targetDisplayName),
          email: asString(document.data().targetEmail).toLowerCase(),
          roleKey: asString(document.data().targetRoleKey).toUpperCase(),
        }));
    }

    return {
      key: target.key,
      expectedRoleKey: target.roleKey,
      planId,
      matches: Array.from(
        new Map(matches.map((item) => [item.personId, item])).values(),
      ),
    };
  });
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const supervisionHeads = await loadSupervisionHeads(db);
  const schools = [];

  for (const schoolId of CONFIG.schoolIds) {
    schools.push({ schoolId, targets: await loadSchoolTargets(db, schoolId) });
  }

  console.log("Supervision head admin evaluation readiness (read-only)");
  console.dir({ supervisionHeads, schools }, { depth: 9 });
}

main().catch((error) => {
  console.error("Supervision head readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
