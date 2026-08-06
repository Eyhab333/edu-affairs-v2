/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const JSON_ONLY = process.argv.includes("--json");
const SCHOOL_KEY = process.argv.includes("--school=girls")
  ? "girls"
  : process.argv.includes("--school=sayh")
    ? "sayh"
    : "faleh";

const SCHOOL_CONFIGS = {
  faleh: {
    schoolId: "mrb-boys-faleh",
    evaluatorPersonId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
    teacherRoleKey: "BOYS_TEACHER",
    planSlugs: [
      "director-weekly-teacher-evaluation",
      "director-diagnostic-teacher-evaluation",
    ],
  },
  sayh: {
    schoolId: "mrb-boys-sayh",
    evaluatorPersonId: "p-a-s-alkmays",
    teacherRoleKey: "BOYS_TEACHER",
    planSlugs: [
      "director-weekly-teacher-evaluation",
      "director-diagnostic-teacher-evaluation",
    ],
  },
  girls: {
    schoolId: "mrb-girls",
    evaluatorPersonId: "p-n-albader",
    teacherRoleKey: "GIRLS_TEACHER",
    planSlugs: [
      "girls-principal-weekly-teacher-evaluation",
      "girls-principal-periodic-teacher-evaluation",
    ],
  },
};

const SCHOOL_CONFIG = SCHOOL_CONFIGS[SCHOOL_KEY];

const CONFIG = {
  orgId: "takween",
  schoolId: SCHOOL_CONFIG.schoolId,
  teacherRoleKey: SCHOOL_CONFIG.teacherRoleKey,
  evaluatorPersonId: SCHOOL_CONFIG.evaluatorPersonId,
  planIds: SCHOOL_CONFIG.planSlugs.map(
    (slug) => `${SCHOOL_CONFIG.schoolId}-ay-1448-term-1-${slug}`,
  ),
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  return Array.from(
    new Set(values.map(asString).filter(Boolean)),
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(
      documents.map((document) => [document.ref.path, document]),
    ).values(),
  );
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();

  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED"].includes(status)
  );
}

function resolveRoleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function resolvePersonId(data) {
  return asString(data.personId || data.teacherPersonId);
}

function resolveUid(document) {
  return asString(document.data().uid) || document.id;
}

function mapBy(items, keySelector) {
  const result = new Map();

  for (const item of items) {
    const key = keySelector(item);
    if (!key) continue;

    const current = result.get(key) || [];
    current.push(item);
    result.set(key, current);
  }

  return result;
}

async function loadSchoolMemberships(db, collectionPath) {
  const [bySchoolId, byScopeId, bySchoolIds] = await Promise.all([
    db.collection(collectionPath)
      .where("schoolId", "==", CONFIG.schoolId)
      .get(),
    db.collection(collectionPath)
      .where("scopeId", "==", CONFIG.schoolId)
      .get(),
    db.collection(collectionPath)
      .where("scopes.schoolIds", "array-contains", CONFIG.schoolId)
      .get(),
  ]);

  return uniqueDocuments([
    ...bySchoolId.docs,
    ...byScopeId.docs,
    ...bySchoolIds.docs,
  ]);
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;

  const [
    schoolSnapshot,
    membershipDocuments,
    teacherAssignmentsSnapshot,
    targetAssignmentsSnapshot,
    evaluatorAssignmentsSnapshot,
    cyclesSnapshot,
  ] = await Promise.all([
    db.doc(`${orgRoot}/schools/${CONFIG.schoolId}`).get(),
    loadSchoolMemberships(db, `${orgRoot}/memberships`),
    db.collection(`${orgRoot}/teacherAssignments`)
      .where("schoolId", "==", CONFIG.schoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`)
      .where("schoolId", "==", CONFIG.schoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`)
      .where("schoolId", "==", CONFIG.schoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationCycles`)
      .where("schoolId", "==", CONFIG.schoolId)
      .get(),
  ]);

  if (!schoolSnapshot.exists) {
    throw new Error(`School not found: ${CONFIG.schoolId}`);
  }

  const teacherMemberships = membershipDocuments.filter((document) => {
    const data = document.data();
    const roleKey = resolveRoleKey(data);

    return (
      isActive(data) &&
      (roleKey === CONFIG.teacherRoleKey || roleKey === "TEACHER")
    );
  });

  const activeTeacherAssignments = teacherAssignmentsSnapshot.docs.filter(
    (document) => isActive(document.data()),
  );

  const membershipsByPersonId = mapBy(
    teacherMemberships,
    (document) => resolvePersonId(document.data()),
  );
  const teacherAssignmentsByPersonId = mapBy(
    activeTeacherAssignments,
    (document) => resolvePersonId(document.data()),
  );

  const candidatePersonIds = uniqueStrings([
    ...membershipsByPersonId.keys(),
    ...teacherAssignmentsByPersonId.keys(),
  ]).sort();

  const personSnapshots = candidatePersonIds.length
    ? await db.getAll(
        ...candidatePersonIds.map((personId) =>
          db.doc(`${orgRoot}/people/${personId}`),
        ),
      )
    : [];
  const peopleById = new Map(
    personSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );

  const targetAssignments = targetAssignmentsSnapshot.docs.filter(
    (document) =>
      CONFIG.planIds.includes(asString(document.data().planId)) &&
      isActive(document.data()),
  );
  const evaluatorAssignments = evaluatorAssignmentsSnapshot.docs.filter(
    (document) =>
      CONFIG.planIds.includes(asString(document.data().planId)) &&
      asString(document.data().evaluatorPersonId) ===
        CONFIG.evaluatorPersonId &&
      isActive(document.data()),
  );
  const evaluationCycles = cyclesSnapshot.docs.filter((document) =>
    CONFIG.planIds.includes(asString(document.data().planId)),
  );

  const targetsByPersonAndPlan = mapBy(
    targetAssignments,
    (document) => {
      const data = document.data();
      return `${asString(data.targetPersonId)}|${asString(data.planId)}`;
    },
  );
  const evaluatorsByPersonAndPlan = mapBy(
    evaluatorAssignments,
    (document) => {
      const data = document.data();
      return `${asString(data.targetPersonId)}|${asString(data.planId)}`;
    },
  );
  const cyclesByPlan = mapBy(
    evaluationCycles,
    (document) => asString(document.data().planId),
  );

  const teachers = candidatePersonIds.map((personId) => {
    const person = peopleById.get(personId);
    const personData = person?.exists ? person.data() : {};
    const memberships = membershipsByPersonId.get(personId) || [];
    const teacherAssignments =
      teacherAssignmentsByPersonId.get(personId) || [];
    const primaryMembership = memberships[0];
    const warnings = [];

    if (!person?.exists) warnings.push("PERSON_DOCUMENT_MISSING");
    if (memberships.length === 0) {
      warnings.push("ACTIVE_TEACHER_MEMBERSHIP_MISSING");
    }
    if (teacherAssignments.length === 0) {
      warnings.push("NO_ACTIVE_TEACHER_ASSIGNMENTS");
    }

    const plans = CONFIG.planIds.map((planId) => {
      const key = `${personId}|${planId}`;
      const targetDocuments = targetsByPersonAndPlan.get(key) || [];
      const evaluatorDocuments = evaluatorsByPersonAndPlan.get(key) || [];
      const cycleDocuments = cyclesByPlan.get(planId) || [];
      const assignedCycleIds = uniqueStrings(
        evaluatorDocuments.map((document) => document.data().cycleId),
      );
      const expectedCycleIds = uniqueStrings(
        cycleDocuments.map((document) => document.id),
      );
      const missingCycleIds = expectedCycleIds.filter(
        (cycleId) => !assignedCycleIds.includes(cycleId),
      );

      return {
        planId,
        targetAssignmentIds: targetDocuments.map(
          (document) => document.id,
        ),
        evaluatorAssignmentIds: evaluatorDocuments.map(
          (document) => document.id,
        ),
        expectedCycles: expectedCycleIds.length,
        assignedCycles: assignedCycleIds.length,
        missingCycleIds,
        complete:
          targetDocuments.length === 1 &&
          expectedCycleIds.length > 0 &&
          missingCycleIds.length === 0,
      };
    });

    return {
      personId,
      uid: primaryMembership ? resolveUid(primaryMembership) : null,
      displayName: asString(personData.displayName),
      email: asString(personData.email),
      employeeNumber: asString(personData.employeeNumber),
      provisioningStatus: asString(personData.provisioningStatus),
      roleKey: primaryMembership
        ? resolveRoleKey(primaryMembership.data())
        : null,
      membershipIds: memberships.map((document) => document.id),
      teacherAssignmentIds: teacherAssignments.map(
        (document) => document.id,
      ),
      plans,
      fullyConfigured: plans.every((plan) => plan.complete),
      warnings,
    };
  }).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "ar"),
  );

  const targetsToAdd = teachers
    .filter((teacher) => !teacher.fullyConfigured)
    .map((teacher) => ({
      personId: teacher.personId,
      uid: teacher.uid,
      displayName: teacher.displayName,
      email: teacher.email,
      employeeNumber: teacher.employeeNumber,
      provisioningStatus: teacher.provisioningStatus,
      missingPlanIds: teacher.plans
        .filter((plan) => !plan.complete)
        .map((plan) => plan.planId),
    }));

  const report = {
    mode: "INSPECT_ONLY_NO_WRITES",
    school: {
      id: schoolSnapshot.id,
      name:
        asString(schoolSnapshot.data().name) ||
        asString(schoolSnapshot.data().title),
    },
    summary: {
      activeTeachers: teachers.length,
      fullyConfigured: teachers.filter(
        (teacher) => teacher.fullyConfigured,
      ).length,
      targetsToAdd: targetsToAdd.length,
      membershipCandidates: teacherMemberships.length,
      assignmentCandidates: activeTeacherAssignments.length,
    },
    planIds: CONFIG.planIds,
    teachers,
    targetsToAdd,
  };

  if (JSON_ONLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`${SCHOOL_KEY} teachers for evaluations (read-only)`);
  console.dir(
    { school: report.school, summary: report.summary },
    { depth: 4 },
  );
  console.table(
    teachers.map((teacher) => ({
      name: teacher.displayName,
      email: teacher.email,
      personId: teacher.personId,
      uid: teacher.uid || "-",
      employeeNumber: teacher.employeeNumber || "-",
      provisioning: teacher.provisioningStatus || "-",
      configured: teacher.fullyConfigured ? "YES" : "NO",
      warnings: teacher.warnings.join(", ") || "-",
    })),
  );
  console.log("\nTargets that still need evaluation assignments:");
  console.log(JSON.stringify(targetsToAdd, null, 2));
}

main().catch((error) => {
  console.error(`${SCHOOL_KEY} teacher inspection failed:`);
  console.error(error);
  process.exitCode = 1;
});
