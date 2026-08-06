/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-boys-sayh",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluatorEmail: "a-s-alkmays@qz.org.sa",
  evaluatorRoleKey: "BOYS_PRINCIPAL",
  frameworkId: "director-admin-educational-vice-principal-evaluation-v1",
  cycleSourcePlanId:
    "mrb-boys-sayh-ay-1448-term-1-director-admin-vice-principal-evaluation",
  planId:
    "mrb-boys-sayh-ay-1448-term-1-director-admin-educational-vice-principal-evaluation",
  target: {
    email: "m.alateeq@qz.org.sa",
    personId: "p-m-alateeq",
    displayName: "محمد صالح حمد العتيق",
    roleKey: "BOYS_EDU_VP",
    roleLabel: "الوكيل التعليمي",
  },
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

function membershipCoversSayh(data) {
  return (
    asString(data.schoolId) === CONFIG.schoolId ||
    asString(data.scopeId) === CONFIG.schoolId ||
    data.scopes?.schoolIds?.includes(CONFIG.schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function listByField(db, collectionPath, field, value) {
  const snapshot = await db
    .collection(collectionPath)
    .where(field, "==", value)
    .get();
  return snapshot.docs;
}

async function loadActor(db, email, expected) {
  const authUser = await admin.auth().getUserByEmail(email);
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [user, membership] = await Promise.all([
    readRequiredDoc(db, `users/${authUser.uid}`, `${expected.label} user`),
    readRequiredDoc(
      db,
      `users/${authUser.uid}/orgMemberships/${CONFIG.orgId}`,
      `${expected.label} membership`,
    ),
  ]);
  const userData = user.data();
  const membershipData = membership.data();
  const personId = asString(membershipData.personId || userData.personId);
  const person = await readRequiredDoc(
    db,
    `${orgRoot}/people/${personId}`,
    `${expected.label} person`,
  );
  const personData = person.data();

  assert(personId, `${expected.label} personId is missing.`);
  assert(
    normalizeEmail(userData.email || personData.email) === email,
    `${expected.label} email does not match.`,
  );
  assert(
    asString(membershipData.roleKey || membershipData.role).toUpperCase() ===
      expected.roleKey,
    `${expected.label} role does not match ${expected.roleKey}.`,
  );
  assert(isActive(membershipData), `${expected.label} membership is inactive.`);
  assert(
    membershipCoversSayh(membershipData),
    `${expected.label} cannot access Sayh.`,
  );

  if (expected.personId) {
    assert(personId === expected.personId, `${expected.label} personId mismatch.`);
  }
  if (expected.displayName) {
    assert(
      asString(personData.displayName) === expected.displayName,
      `${expected.label} displayName mismatch.`,
    );
  }
  if (expected.manageEvaluations) {
    assert(
      membershipData.permissions?.manageEvaluations === true,
      `${expected.label} is missing manageEvaluations.`,
    );
  }

  return {
    uid: authUser.uid,
    personId,
    email,
    displayName: asString(personData.displayName),
    roleKey: expected.roleKey,
  };
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [school, framework, sections, items, sourcePlan, sourceCycles] =
    await Promise.all([
      readRequiredDoc(
        db,
        `${orgRoot}/schools/${CONFIG.schoolId}`,
        "Sayh school",
      ),
      readRequiredDoc(
        db,
        `${orgRoot}/evaluationFrameworks/${CONFIG.frameworkId}`,
        "Educational vice-principal framework",
      ),
      listByField(
        db,
        `${orgRoot}/evaluationRubricSections`,
        "frameworkId",
        CONFIG.frameworkId,
      ),
      listByField(
        db,
        `${orgRoot}/evaluationRubricItems`,
        "frameworkId",
        CONFIG.frameworkId,
      ),
      readRequiredDoc(
        db,
        `${orgRoot}/evaluationPlans/${CONFIG.cycleSourcePlanId}`,
        "Sayh admin cycle source plan",
      ),
      listByField(
        db,
        `${orgRoot}/evaluationCycles`,
        "planId",
        CONFIG.cycleSourcePlanId,
      ),
    ]);
  const frameworkData = framework.data();
  const sourcePlanData = sourcePlan.data();
  const cycles = sourceCycles
    .filter((cycle) => isActive(cycle.data()))
    .sort(
      (left, right) =>
        Number(left.data().cycleNumber || 0) -
        Number(right.data().cycleNumber || 0),
    );

  assert(frameworkData.isActive === true, "Framework is inactive.");
  assert(frameworkData.version === 1, "Framework must be v1.");
  assert(frameworkData.isLocked === true, "Framework must be locked.");
  assert(sections.length === 1, "Framework must have one section.");
  assert(
    sections.reduce(
      (total, section) => total + Number(section.data().weight || 0),
      0,
    ) === 100,
    "Framework section weights must total 100.",
  );
  assert(items.length === 6, "Framework must have six items.");
  assert(
    items.every(
      (item) =>
        Number.isInteger(item.data().order) && item.data().maxScore === 5,
    ),
    "Framework has an invalid item.",
  );
  assert(
    asString(sourcePlanData.schoolId) === CONFIG.schoolId &&
      asString(sourcePlanData.academicYearId) === CONFIG.academicYearId &&
      asString(sourcePlanData.termId) === CONFIG.termId,
    "Cycle source plan context does not match Sayh.",
  );
  assert(cycles.length === 9, "Cycle source plan must have 9 active cycles.");

  const [evaluator, target] = await Promise.all([
    loadActor(db, CONFIG.evaluatorEmail, {
      label: "Sayh principal",
      roleKey: CONFIG.evaluatorRoleKey,
      manageEvaluations: true,
    }),
    loadActor(db, CONFIG.target.email, {
      label: "Educational vice-principal",
      roleKey: CONFIG.target.roleKey,
      personId: CONFIG.target.personId,
      displayName: CONFIG.target.displayName,
    }),
  ]);

  return {
    school: { id: school.id, ...school.data() },
    evaluator,
    target,
    cycles,
  };
}

function buildDocuments(preflight) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const documents = [];

  documents.push({
    type: "plan",
    path: `${orgRoot}/evaluationPlans/${CONFIG.planId}`,
    data: {
      id: CONFIG.planId,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      title: "تقييم المدير للوكيل التعليمي - منار الريادة بنين السيح - الفصل الأول",
      description: "خطة تطبيق تقييم الوكيل التعليمي 9 مرات داخل الفصل الدراسي.",
      frameworkId: CONFIG.frameworkId,
      planKind: "PERIODIC",
      targetKind: "ADMIN_STAFF",
      targetRoleKey: CONFIG.target.roleKey,
      targetRoleLabel: CONFIG.target.roleLabel,
      status: "ACTIVE",
    },
  });

  const policyId = `${CONFIG.planId}-policy-director`;
  documents.push({
    type: "policy",
    path: `${orgRoot}/evaluatorPolicies/${policyId}`,
    data: {
      id: policyId,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: CONFIG.planId,
      evaluatorRoleKey: preflight.evaluator.roleKey,
      evaluatorLabel: "مدير المدرسة",
      weight: 100,
      required: true,
      canSubmit: true,
      canReview: false,
      canApprove: true,
      order: 1,
    },
  });

  const targetAssignmentId =
    `${CONFIG.planId}-target-${preflight.target.personId}`;
  documents.push({
    type: "targetAssignment",
    path:
      `${orgRoot}/evaluationTargetAssignments/` + targetAssignmentId,
    data: {
      id: targetAssignmentId,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: CONFIG.planId,
      targetPersonId: preflight.target.personId,
      targetEmail: preflight.target.email,
      targetDisplayName: preflight.target.displayName,
      targetRoleKey: preflight.target.roleKey,
      targetRoleLabel: CONFIG.target.roleLabel,
      targetKind: "ADMIN_STAFF",
      status: "ACTIVE",
    },
  });

  for (const sourceCycle of preflight.cycles) {
    const sourceCycleData = sourceCycle.data();
    const cycleId = sourceCycle.id.replace(
      CONFIG.cycleSourcePlanId,
      CONFIG.planId,
    );
    documents.push({
      type: "cycle",
      path: `${orgRoot}/evaluationCycles/${cycleId}`,
      data: {
        id: cycleId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: CONFIG.planId,
        cycleNumber: sourceCycleData.cycleNumber,
        title: sourceCycleData.title,
        cycleKind: sourceCycleData.cycleKind || "CUSTOM",
        status: "OPEN",
        isIncludedInAverage:
          sourceCycleData.isIncludedInAverage !== false,
      },
    });

    const evaluatorAssignmentId =
      `${CONFIG.planId}-${cycleId}-${preflight.target.personId}-` +
      preflight.evaluator.personId;
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
        planId: CONFIG.planId,
        cycleId,
        targetPersonId: preflight.target.personId,
        targetRoleKey: preflight.target.roleKey,
        targetRoleLabel: CONFIG.target.roleLabel,
        evaluatorPersonId: preflight.evaluator.personId,
        evaluatorEmail: preflight.evaluator.email,
        evaluatorRoleKey: preflight.evaluator.roleKey,
        weight: 100,
        sourceType: "MANUAL",
        status: "ACTIVE",
      },
    });
  }

  return documents;
}

function assertDocument(snapshot, desired) {
  const current = snapshot.data();

  for (const [field, expected] of Object.entries(desired.data)) {
    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}.`,
    );
  }
}

async function inspectDocuments(db, documents) {
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

    assertDocument(snapshot, desired);
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

async function applyMissing(db, documents) {
  if (documents.length === 0) return;

  const batch = db.batch();
  const now = Date.now();

  for (const document of documents) {
    batch.create(db.doc(document.path), {
      ...document.data,
      createdAt: now,
      updatedAt: now,
      ...(document.type === "targetAssignment"
        ? { assignedAt: now }
        : {}),
    });
  }

  await batch.commit();
}

async function verify(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );

  snapshots.forEach((snapshot, index) => {
    assert(snapshot.exists, `Missing after apply: ${snapshot.ref.path}`);
    assertDocument(snapshot, documents[index]);
  });
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = buildDocuments(preflight);
  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(
    {
      school: {
        id: CONFIG.schoolId,
        name: preflight.school.name || preflight.school.title,
      },
      evaluator: preflight.evaluator,
      target: preflight.target,
      frameworkId: CONFIG.frameworkId,
      planId: CONFIG.planId,
      desired: countByType(documents),
      existing: countByType(inspection.existing),
      missing: countByType(inspection.missing),
    },
    { depth: 6 },
  );

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create the plan.");
    return;
  }

  await applyMissing(db, inspection.missing);
  await verify(db, documents);

  console.log("Sayh educational vice-principal evaluation applied and verified.");
  console.dir({ verified: countByType(documents) });
}

main().catch((error) => {
  console.error("Sayh educational vice-principal evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
