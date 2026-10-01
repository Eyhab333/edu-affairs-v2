/* eslint-disable no-console */
// Read-only Staff PDF scope diagnosis. This script performs no Firestore writes.

const admin = require("firebase-admin");
const path = require("node:path");

const ORG_ID = "takween";
const BOYS_SCHOOL_IDS = ["mrb-boys-sayh", "mrb-boys-faleh"];
const MATH_SCIENCE_SUPERVISOR_PERSON_ID = "staff-NOFByrx0XLVovqxuFjfwRWSokgs1";
const SUPERVISORY_ROLE_KEYS = new Set([
  "EDU_SUPERVISOR",
  "BOYS_EDU_SUPERVISOR",
  "BOYS_SUPERVISION_HEAD",
  "ORG_SUPERVISION_HEAD",
  "ADMIN_SUPERVISOR",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function active(item, now = Date.now()) {
  if (item.isActive === false || item.active === false) return false;
  if (text(item.status).toUpperCase() === "ENDED") return false;
  return !(
    (typeof item.startAt === "number" && item.startAt > now) ||
    (typeof item.endAt === "number" && item.endAt < now)
  );
}

function activeTeacherAssignment(item, now) {
  return active(item, now) && text(item.status).toUpperCase() === "ACTIVE";
}

function membershipRole(membership) {
  return text(membership.roleKey || membership.role);
}

function isLocalTeacher(membership) {
  return ["teacher", "BOYS_TEACHER", "GIRLS_TEACHER", "KG_TEACHER"].includes(
    membershipRole(membership),
  );
}

function directAuthorityPersonIds(membership) {
  return unique([
    text(membership.directEvaluatorPersonId),
    text(membership.supervisorPersonId),
    text(membership.managerPersonId),
    text(membership.principalPersonId),
    text(membership.vicePrincipalPersonId),
  ]);
}

function currentHomeSchoolIds(membership, assignments, personId, now) {
  const ids = [];
  if (active(membership, now) && text(membership.scopeType) === "SCHOOL") {
    ids.push(text(membership.scopeId));
  }
  for (const assignment of assignments) {
    if (assignment.teacherPersonId === personId && activeTeacherAssignment(assignment, now)) {
      ids.push(text(assignment.schoolId));
    }
  }
  return unique(ids);
}

function currentSubjectKeys(assignments, personId, now) {
  return unique(
    assignments
      .filter((assignment) => assignment.teacherPersonId === personId && activeTeacherAssignment(assignment, now))
      .map((assignment) => text(assignment.subjectKey).toUpperCase()),
  );
}

function oldResolverSource({ viewer, target, viewerAssignments, targetAssignments, scopes, operationalAssignments, now }) {
  const targetHomes = currentHomeSchoolIds(target.membership, targetAssignments, target.personId, now);
  const explicit = operationalAssignments.some((assignment) =>
    active(assignment, now) &&
    text(assignment.status).toUpperCase() === "ACTIVE" &&
    Array.isArray(assignment.permissions) && assignment.permissions.includes("VIEW") &&
    Array.isArray(assignment.targetPersonIds) && assignment.targetPersonIds.includes(target.personId),
  );
  if (explicit) return "EXPLICIT_OPERATIONAL_ASSIGNMENT";
  if (directAuthorityPersonIds(target.membership).includes(viewer.personId)) {
    return "TARGET_MEMBERSHIP_RELATION";
  }

  const mergedScopeSchoolIds = unique(
    scopes
      .filter((scope) =>
        active(scope, now) &&
        ["STAFF_WORK_VIEW", "TEACHER_WORK_VIEW"].includes(text(scope.capability)),
      )
      .map((scope) => text(scope.schoolId)),
  );
  if (
    isLocalTeacher(target.membership) &&
    targetHomes.some((schoolId) => mergedScopeSchoolIds.includes(schoolId))
  ) {
    return "PERSON_SUPERVISION_SCOPE (merged-school legacy path)";
  }
  return "NONE";
}

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = require(path.resolve(__dirname, "../service-account.json"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const now = Date.now();
  const scopesSnapshot = await db
    .collection(`orgs/${ORG_ID}/personSupervisionScopes`)
    .where("schoolId", "in", BOYS_SCHOOL_IDS)
    .get();
  const boysScopes = scopesSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((scope) => active(scope, now));
  const supervisorPersonIds = unique(boysScopes.map((scope) => text(scope.personId)));

  const membershipSnapshot = await db
    .collectionGroup("orgMemberships")
    .where("orgId", "==", ORG_ID)
    .get();
  const membershipsByPersonId = new Map();
  membershipSnapshot.docs.forEach((document) => {
    const membership = document.data();
    const personId = text(membership.personId);
    if (personId && active(membership, now)) membershipsByPersonId.set(personId, membership);
  });

  const supervisoryPersonIds = supervisorPersonIds.filter((personId) =>
    SUPERVISORY_ROLE_KEYS.has(membershipRole(membershipsByPersonId.get(personId))),
  );
  const selectedSupervisorIds = [
    MATH_SCIENCE_SUPERVISOR_PERSON_ID,
    ...supervisoryPersonIds.filter((personId) => personId !== MATH_SCIENCE_SUPERVISOR_PERSON_ID),
  ]
    .filter((personId) => membershipsByPersonId.has(personId))
    .slice(0, 3);

  const [assignmentsSnapshot, operationalAssignmentsSnapshot, peopleSnapshot] = await Promise.all([
    db.collection(`orgs/${ORG_ID}/teacherAssignments`).get(),
    db.collection(`orgs/${ORG_ID}/operationalAssignments`).get(),
    db.collection(`orgs/${ORG_ID}/people`).get(),
  ]);
  const assignments = assignmentsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  const operationalAssignments = operationalAssignmentsSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  const peopleById = new Map(peopleSnapshot.docs.map((document) => [document.id, document.data()]));
  const targetPersonIds = unique(
    assignments
      .filter((assignment) => BOYS_SCHOOL_IDS.includes(text(assignment.schoolId)) && activeTeacherAssignment(assignment, now))
      .map((assignment) => text(assignment.teacherPersonId)),
  );

  const report = selectedSupervisorIds.map((viewerPersonId) => {
    const viewerMembership = membershipsByPersonId.get(viewerPersonId);
    const viewerScopes = boysScopes.filter((scope) => text(scope.personId) === viewerPersonId);
    const viewer = { personId: viewerPersonId, membership: viewerMembership };
    const viewerOperationalAssignments = operationalAssignments.filter(
      (assignment) => text(assignment.actorPersonId) === viewerPersonId,
    );
    const visibleTargets = targetPersonIds
      .map((targetPersonId) => ({
        personId: targetPersonId,
        membership: membershipsByPersonId.get(targetPersonId),
      }))
      .filter((target) => target.membership && isLocalTeacher(target.membership))
      .map((target) => ({
        personId: target.personId,
        displayName: text(peopleById.get(target.personId)?.displayName) || null,
        homeSchoolIds: currentHomeSchoolIds(target.membership, assignments, target.personId, now),
        subjectKeys: currentSubjectKeys(assignments, target.personId, now),
        currentAuthoritySource: oldResolverSource({
          viewer,
          target,
          viewerAssignments: assignments,
          targetAssignments: assignments,
          scopes: viewerScopes,
          operationalAssignments: viewerOperationalAssignments,
          now,
        }),
      }))
      .filter((target) => target.currentAuthoritySource !== "NONE")
      .slice(0, 8);

    return {
      viewer: {
        personId: viewerPersonId,
        roleKey: membershipRole(viewerMembership),
        displayName: text(peopleById.get(viewerPersonId)?.displayName) || null,
      },
      activeScopes: viewerScopes.map((scope) => ({
        capability: text(scope.capability),
        schoolId: text(scope.schoolId),
        subjectScope: text(scope.subjectScope),
        subjectKeys: Array.isArray(scope.subjectKeys) ? scope.subjectKeys.map((key) => text(key).toUpperCase()) : [],
      })),
      activeOperationalViewAssignments: viewerOperationalAssignments
        .filter((assignment) => active(assignment, now) && Array.isArray(assignment.permissions) && assignment.permissions.includes("VIEW"))
        .map((assignment) => ({ id: assignment.id, targetPersonIds: assignment.targetPersonIds || [] })),
      visibleTeacherSamplesUnderCurrentResolver: visibleTargets,
    };
  });

  console.dir({
    mode: "READ_ONLY",
    writesPerformed: false,
    orgId: ORG_ID,
    selectedSupervisorCount: report.length,
    supervisors: report,
  }, { depth: null, colors: process.stdout.isTTY });
}

main().catch((error) => {
  console.error("Staff PDF boys subject-supervision inspection failed:", error);
  process.exitCode = 1;
});
