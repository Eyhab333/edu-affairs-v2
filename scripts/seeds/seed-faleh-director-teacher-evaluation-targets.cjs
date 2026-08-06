/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const SCHOOL_KEY = process.argv.includes("--school=sayh")
  ? "sayh"
  : "faleh";

const SCHOOL_CONFIGS = {
  faleh: {
    schoolId: "mrb-boys-faleh",
    evaluator: {
      uid: "EJP7cQWlOldemQo6R6TciBZXSFt2",
      personId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
      email: "riadah3@qz.org.sa",
      roleKey: "BOYS_PRINCIPAL",
    },
  },
  sayh: {
    schoolId: "mrb-boys-sayh",
    evaluator: {
      uid: "ZsxqcyMToKRzvp9ZC94zsiW1apC2",
      personId: "p-a-s-alkmays",
      email: "a-s-alkmays@qz.org.sa",
      roleKey: "BOYS_PRINCIPAL",
    },
  },
};

const SCHOOL_CONFIG = SCHOOL_CONFIGS[SCHOOL_KEY];

const CONFIG = {
  orgId: "takween",
  schoolId: SCHOOL_CONFIG.schoolId,
  academicYearId: "ay-1448",
  termId: "term-1",
  teacherRoleKey: "BOYS_TEACHER",
  evaluator: SCHOOL_CONFIG.evaluator,
  plans: [
    {
      id: `${SCHOOL_CONFIG.schoolId}-ay-1448-term-1-director-weekly-teacher-evaluation`,
      expectedCycles: 9,
    },
    {
      id: `${SCHOOL_CONFIG.schoolId}-ay-1448-term-1-director-diagnostic-teacher-evaluation`,
      expectedCycles: 2,
    },
  ],
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
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
    new Map(
      documents.map((document) => [document.ref.path, document]),
    ).values(),
  );
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
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

function assertExistingDocument(snapshot, desired) {
  const current = snapshot.data();

  for (const [field, expected] of Object.entries(desired.data)) {
    if (
      field === "sourceType" &&
      expected === "MANUAL" &&
      current[field] === "AUTO_GENERATED"
    ) {
      continue;
    }

    assert(
      current[field] === expected,
      `Conflicting ${field} at ${snapshot.ref.path}: ` +
        `expected ${JSON.stringify(expected)}, found ${JSON.stringify(current[field])}`,
    );
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [
    school,
    evaluatorUser,
    evaluatorPerson,
    evaluatorMembership,
    schoolMemberships,
  ] = await Promise.all([
    readRequiredDoc(
      db,
      `${orgRoot}/schools/${CONFIG.schoolId}`,
      "School",
    ),
    readRequiredDoc(
      db,
      `users/${CONFIG.evaluator.uid}`,
      "Evaluator user",
    ),
    readRequiredDoc(
      db,
      `${orgRoot}/people/${CONFIG.evaluator.personId}`,
      "Evaluator person",
    ),
    readRequiredDoc(
      db,
      `users/${CONFIG.evaluator.uid}/orgMemberships/${CONFIG.orgId}`,
      "Evaluator membership",
    ),
    loadSchoolMemberships(db, `${orgRoot}/memberships`),
  ]);

  const evaluatorUserData = evaluatorUser.data();
  const evaluatorPersonData = evaluatorPerson.data();
  const evaluatorMembershipData = evaluatorMembership.data();

  assert(
    normalizeEmail(evaluatorUserData.email || evaluatorPersonData.email) ===
      CONFIG.evaluator.email,
    "Evaluator email does not match.",
  );
  assert(
    asString(evaluatorMembershipData.personId) ===
      CONFIG.evaluator.personId,
    "Evaluator membership personId does not match.",
  );
  assert(
    asString(
      evaluatorMembershipData.roleKey || evaluatorMembershipData.role,
    ).toUpperCase() === CONFIG.evaluator.roleKey,
    "Evaluator role does not match.",
  );
  assert(
    isActive(evaluatorMembershipData),
    "Evaluator membership is inactive.",
  );
  assert(
    evaluatorMembershipData.permissions?.manageEvaluations === true,
    "Evaluator is missing manageEvaluations.",
  );

  const teacherMemberships = schoolMemberships.filter((membership) => {
    const data = membership.data();
    const roleKey = asString(data.roleKey || data.role).toUpperCase();

    return (
      isActive(data) &&
      (roleKey === CONFIG.teacherRoleKey || roleKey === "TEACHER") &&
      asString(data.personId)
    );
  });
  const membershipByPersonId = new Map();

  for (const membership of teacherMemberships) {
    const personId = asString(membership.data().personId);
    assert(
      !membershipByPersonId.has(personId),
      `Duplicate active teacher membership for ${personId}.`,
    );
    membershipByPersonId.set(personId, membership);
  }

  assert(
    membershipByPersonId.size > 0,
    `No active ${SCHOOL_KEY} teacher memberships found.`,
  );

  const people = await db.getAll(
    ...Array.from(membershipByPersonId.keys()).map((personId) =>
      db.doc(`${orgRoot}/people/${personId}`),
    ),
  );
  const teachers = people.map((person) => {
    assert(person.exists, `Teacher person not found: ${person.ref.path}`);
    const data = person.data();
    const email = normalizeEmail(data.email);

    assert(email, `Teacher email is missing: ${person.ref.path}`);
    assert(
      asString(data.displayName),
      `Teacher displayName is missing: ${person.ref.path}`,
    );

    return {
      personId: person.id,
      displayName: asString(data.displayName),
      email,
      employeeNumber: asString(data.employeeNumber),
      provisioningStatus: asString(data.provisioningStatus),
    };
  }).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "ar"),
  );

  const plans = [];

  for (const planConfig of CONFIG.plans) {
    const [plan, cyclesSnapshot] = await Promise.all([
      readRequiredDoc(
        db,
        `${orgRoot}/evaluationPlans/${planConfig.id}`,
        "Evaluation plan",
      ),
      db.collection(`${orgRoot}/evaluationCycles`)
        .where("planId", "==", planConfig.id)
        .get(),
    ]);
    const planData = plan.data();
    const cycles = cyclesSnapshot.docs
      .filter((cycle) => isActive(cycle.data()))
      .sort(
        (left, right) =>
          Number(left.data().cycleNumber || 0) -
          Number(right.data().cycleNumber || 0),
      );

    assert(
      asString(planData.schoolId) === CONFIG.schoolId &&
        asString(planData.academicYearId) === CONFIG.academicYearId &&
        asString(planData.termId) === CONFIG.termId,
      `Plan context does not match: ${planConfig.id}`,
    );
    assert(
      cycles.length === planConfig.expectedCycles,
      `${planConfig.id} must have ${planConfig.expectedCycles} active cycles; ` +
        `found ${cycles.length}.`,
    );

    plans.push({ id: planConfig.id, cycles });
  }

  return {
    school: { id: school.id, ...school.data() },
    teachers,
    plans,
  };
}

function buildDesiredDocuments(preflight) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const documents = [];

  for (const teacher of preflight.teachers) {
    for (const plan of preflight.plans) {
      const targetAssignmentId = `${plan.id}-target-${teacher.personId}`;

      documents.push({
        type: "targetAssignment",
        path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`,
        data: {
          id: targetAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: CONFIG.schoolId,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId: plan.id,
          targetPersonId: teacher.personId,
          targetEmail: teacher.email,
          targetDisplayName: teacher.displayName,
          targetRoleKey: CONFIG.teacherRoleKey,
          targetKind: "TEACHER",
          status: "ACTIVE",
        },
      });

      for (const cycle of plan.cycles) {
        const evaluatorAssignmentId =
          `${plan.id}-${cycle.id}-${teacher.personId}-` +
          CONFIG.evaluator.personId;

        documents.push({
          type: "evaluatorAssignment",
          path:
            `${orgRoot}/evaluationEvaluatorAssignments/` +
            evaluatorAssignmentId,
          data: {
            id: evaluatorAssignmentId,
            orgId: CONFIG.orgId,
            schoolId: CONFIG.schoolId,
            academicYearId: CONFIG.academicYearId,
            termId: CONFIG.termId,
            planId: plan.id,
            cycleId: cycle.id,
            targetPersonId: teacher.personId,
            evaluatorPersonId: CONFIG.evaluator.personId,
            evaluatorEmail: CONFIG.evaluator.email,
            evaluatorRoleKey: CONFIG.evaluator.roleKey,
            weight: 100,
            sourceType: "MANUAL",
            status: "ACTIVE",
          },
        });
      }
    }
  }

  return documents;
}

async function inspectDesiredDocuments(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );
  const missing = [];
  const existing = [];

  snapshots.forEach((snapshot, index) => {
    const desired = documents[index];

    if (!snapshot.exists) {
      missing.push(desired);
      return;
    }

    assertExistingDocument(snapshot, desired);
    existing.push(desired);
  });

  return { missing, existing };
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function applyMissingDocuments(db, documents) {
  assert(documents.length <= 500, "Firestore batch write limit exceeded.");

  const batch = db.batch();
  const now = Date.now();

  for (const document of documents) {
    const timestamps = {
      createdAt: now,
      updatedAt: now,
      ...(document.type === "targetAssignment"
        ? { assignedAt: now }
        : {}),
    };

    batch.create(
      db.doc(document.path),
      { ...document.data, ...timestamps },
    );
  }

  await batch.commit();
}

async function verifyAll(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );

  snapshots.forEach((snapshot, index) => {
    assert(snapshot.exists, `Missing after apply: ${snapshot.ref.path}`);
    assertExistingDocument(snapshot, documents[index]);
  });
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const desiredDocuments = buildDesiredDocuments(preflight);
  const inspection = await inspectDesiredDocuments(db, desiredDocuments);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(
    {
      school: {
        id: CONFIG.schoolId,
        name: preflight.school.name || preflight.school.title,
      },
      evaluator: CONFIG.evaluator,
      teachers: preflight.teachers.length,
      teacherPersonIds: preflight.teachers.map(
        (teacher) => teacher.personId,
      ),
      desired: countByType(desiredDocuments),
      alreadyExists: countByType(inspection.existing),
      missingToCreate: countByType(inspection.missing),
    },
    { depth: 6 },
  );

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }

  if (inspection.missing.length > 0) {
    await applyMissingDocuments(db, inspection.missing);
  }

  await verifyAll(db, desiredDocuments);

  console.log(`${SCHOOL_KEY} teacher evaluation targets applied and verified.`);
  console.dir({ verified: countByType(desiredDocuments) });
}

main().catch((error) => {
  console.error(`${SCHOOL_KEY} teacher evaluation target seed failed:`);
  console.error(error);
  process.exitCode = 1;
});
