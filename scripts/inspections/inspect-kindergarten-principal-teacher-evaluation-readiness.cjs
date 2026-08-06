/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
  academicYearId: "ay-1448",
};

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
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

function roleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function membershipCoversSchool(data, schoolId) {
  return asString(data.schoolId) === schoolId || asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) || data.scopes?.canAccessAllSchools === true;
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
  const [memberships, assignments] = await Promise.all([
    loadMemberships(db),
    db.collection(`${orgRoot}/teacherAssignments`).get(),
  ]);
  const schools = [];

  for (const schoolId of CONFIG.schoolIds) {
    const school = await db.doc(`${orgRoot}/schools/${schoolId}`).get();
    const teacherMemberships = memberships.filter((membership) => {
      const data = membership.data();
      return roleKey(data) === "KG_TEACHER" && membershipCoversSchool(data, schoolId);
    });
    const people = teacherMemberships.length
      ? await db.getAll(...teacherMemberships.map((membership) =>
          db.doc(`${orgRoot}/people/${asString(membership.data().personId)}`),
        ))
      : [];
    const peopleById = new Map(
      people.filter((person) => person.exists).map((person) => [person.id, person.data()]),
    );

    const teachers = teacherMemberships.map((membership) => {
      const data = membership.data();
      const personId = asString(data.personId);
      const person = peopleById.get(personId) || {};
      const teacherAssignments = assignments.docs
        .filter((document) => {
          const assignment = document.data();
          return isActive(assignment) &&
            asString(assignment.teacherPersonId || assignment.personId || assignment.assignedPersonId) === personId &&
            (!asString(assignment.schoolId) || asString(assignment.schoolId) === schoolId) &&
            (!asString(assignment.academicYearId) || asString(assignment.academicYearId) === CONFIG.academicYearId);
        })
        .map((document) => ({
          id: document.id,
          assignmentKind: asString(document.data().assignmentKind),
          subjectKey: asString(document.data().subjectKey),
          scopeType: asString(document.data().scopeType),
          scopeId: asString(document.data().scopeId),
          classId: asString(document.data().classId),
        }));
      return {
        uid: membership.ref.parent.parent?.id || "",
        personId,
        displayName: asString(person.displayName || data.displayName),
        email: asString(person.email || data.email).toLowerCase(),
        roleKey: roleKey(data),
        membershipPath: membership.ref.path,
        teacherAssignments,
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

    schools.push({
      schoolId,
      schoolLabel: asString(school.data()?.name || school.data()?.title),
      teacherCount: teachers.length,
      teachers,
    });
  }

  console.log("Kindergarten principal teacher evaluation readiness (read-only)");
  console.dir({ schools }, { depth: 12 });
}

main().catch((error) => {
  console.error("Kindergarten teacher evaluation readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
