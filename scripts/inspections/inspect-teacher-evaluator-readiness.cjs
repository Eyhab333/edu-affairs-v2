/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schools: ["mrb-boys-sayh", "mrb-boys-faleh"],
  evaluatorRoleKeys: ["BOYS_STUDENT_GUIDE", "BOYS_VP", "BOYS_EDU_VP"],
  teacherRoleKeys: ["BOYS_TEACHER", "TEACHER"],
};

const EVALUATOR_ROLE_ALIASES = {
  BOYS_STUDENT_GUIDE: ["BOYS_STUDENT_GUIDE", "STUDENT_COUNSELOR"],
  BOYS_VP: ["BOYS_VP", "SCHOOL_VICE_PRINCIPAL"],
  BOYS_EDU_VP: ["BOYS_EDU_VP"],
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
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED"].includes(status)
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

function membershipRoleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function canonicalEvaluatorRoleKey(value) {
  const roleKey = asString(value).toUpperCase();

  return (
    Object.entries(EVALUATOR_ROLE_ALIASES).find(([, aliases]) =>
      aliases.includes(roleKey),
    )?.[0] || ""
  );
}

function membershipUid(document) {
  const dataUid = asString(document.data().uid);
  if (dataUid) return dataUid;

  if (document.ref.parent.id === "orgMemberships") {
    return document.ref.parent.parent?.id || "";
  }

  return "";
}

async function loadSchoolMemberships(db, orgRoot, schoolId) {
  const membershipsRef = db.collection(`${orgRoot}/memberships`);
  const [bySchoolId, byScopeId, bySchoolIds, users] = await Promise.all([
    membershipsRef.where("schoolId", "==", schoolId).get(),
    membershipsRef.where("scopeId", "==", schoolId).get(),
    membershipsRef.where("scopes.schoolIds", "array-contains", schoolId).get(),
    db.collection("users").where("schoolIds", "array-contains", schoolId).get(),
  ]);
  const userMemberships = users.empty
    ? []
    : await db.getAll(
        ...users.docs.map((user) =>
          db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
        ),
      );

  return uniqueDocuments([
    ...bySchoolId.docs,
    ...byScopeId.docs,
    ...bySchoolIds.docs,
    ...userMemberships.filter((membership) => membership.exists),
  ]).filter((membership) => isActive(membership.data()));
}

async function inspectSchool(db, orgRoot, schoolId) {
  const [school, memberships, plans, targetAssignments, evaluatorAssignments] = await Promise.all([
    db.doc(`${orgRoot}/schools/${schoolId}`).get(),
    loadSchoolMemberships(db, orgRoot, schoolId),
    db.collection(`${orgRoot}/evaluationPlans`).where("schoolId", "==", schoolId).get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`).where("schoolId", "==", schoolId).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("schoolId", "==", schoolId).get(),
  ]);
  const relevantMemberships = memberships.filter((membership) => {
    const roleKey = membershipRoleKey(membership.data());
    return (
      Boolean(canonicalEvaluatorRoleKey(roleKey)) ||
      CONFIG.teacherRoleKeys.includes(roleKey)
    );
  });
  const evaluatorTargets = targetAssignments.docs
    .map((target) => ({ id: target.id, ...target.data() }))
    .filter((target) => Boolean(canonicalEvaluatorRoleKey(target.targetRoleKey)));
  const personIds = Array.from(new Set([
    ...relevantMemberships.map((membership) => asString(membership.data().personId)),
    ...evaluatorTargets.map((target) => asString(target.targetPersonId)),
  ].filter(Boolean)));
  const people = personIds.length
    ? await db.getAll(
        ...personIds.map((personId) => db.doc(`${orgRoot}/people/${personId}`)),
      )
    : [];
  const peopleById = new Map(
    people.filter((person) => person.exists).map((person) => [person.id, person.data()]),
  );
  const staff = relevantMemberships.map((membership) => {
    const data = membership.data();
    const personId = asString(data.personId);
    const person = peopleById.get(personId) || {};

    return {
      uid: membershipUid(membership),
      personId,
      displayName: asString(person.displayName || data.displayName),
      email: asString(person.email || data.email).toLowerCase(),
      roleKey: membershipRoleKey(data),
      manageEvaluations: data.permissions?.manageEvaluations === true,
      membershipPath: membership.ref.path,
    };
  });
  const evaluatorPersonIds = Array.from(
    new Set(evaluatorTargets.map((target) => asString(target.targetPersonId)).filter(Boolean)),
  );
  const evaluatorUserSnapshots = await Promise.all(
    evaluatorPersonIds.map((personId) =>
      db.collection("users").where("personId", "==", personId).get(),
    ),
  );
  const evaluatorUsers = uniqueDocuments(
    evaluatorUserSnapshots.flatMap((snapshot) => snapshot.docs),
  );
  const evaluatorMemberships = evaluatorUsers.length
    ? await db.getAll(
        ...evaluatorUsers.map((user) =>
          db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
        ),
      )
    : [];
  const evaluatorMembershipByPersonId = new Map(
    evaluatorMemberships
      .filter((membership) => membership.exists)
      .map((membership) => [asString(membership.data().personId), membership]),
  );
  const evaluatorStaff = Array.from(
    new Map(
      evaluatorTargets.map((target) => {
        const personId = asString(target.targetPersonId);
        const person = peopleById.get(personId) || {};
        const membership = evaluatorMembershipByPersonId.get(personId);
        const membershipData = membership?.data() || {};
        const user = evaluatorUsers.find(
          (candidate) => asString(candidate.data().personId) === personId,
        );
        const roleKey = membershipRoleKey(membershipData) || asString(target.targetRoleKey).toUpperCase();

        return [
          `${personId}|${roleKey}`,
          {
            uid: user?.id || "",
            personId,
            displayName: asString(person.displayName || target.targetDisplayName),
            email: asString(person.email || target.targetEmail).toLowerCase(),
            roleKey,
            manageEvaluations: membershipData.permissions?.manageEvaluations === true,
            membershipPath: membership?.ref.path || "",
            activeEvaluationAssignments: evaluatorAssignments.docs.filter(
              (assignment) =>
                asString(assignment.data().evaluatorPersonId) === personId &&
                isActive(assignment.data()),
            ).length,
          },
        ];
      }),
    ).values(),
  );
  const evaluators = CONFIG.evaluatorRoleKeys.map((roleKey) => ({
    roleKey,
    matches: evaluatorStaff.filter(
      (person) => canonicalEvaluatorRoleKey(person.roleKey) === roleKey,
    ),
  }));
  const teachers = Array.from(
    new Map(
      staff
        .filter((person) => CONFIG.teacherRoleKeys.includes(person.roleKey))
        .map((person) => [person.personId, person]),
    ).values(),
  );
  const relatedPlans = plans.docs
    .filter((plan) => {
      const id = plan.id.toLowerCase();
      return (
        id.includes("student-guide-teacher") ||
        id.includes("vice-principal-teacher") ||
        id.includes("educational-vice-principal-teacher")
      );
    })
    .map((plan) => plan.id);

  return {
    school: { id: schoolId, name: asString(school.data()?.name || school.data()?.title) },
    teachers: teachers.length,
    evaluators,
    existingRelatedPlans: relatedPlans,
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const schools = [];

  for (const schoolId of CONFIG.schools) {
    schools.push(await inspectSchool(db, orgRoot, schoolId));
  }

  console.log("Teacher evaluator readiness (read-only)");
  console.dir({ schools }, { depth: 8 });
}

main().catch((error) => {
  console.error("Teacher evaluator readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
