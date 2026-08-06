/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  sourceSchoolId: "mrb-boys-sayh",
  targetSchoolId: "mrb-boys-faleh",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "EJP7cQWlOldemQo6R6TciBZXSFt2",
    personId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
    email: "riadah3@qz.org.sa",
    roleKey: "BOYS_PRINCIPAL",
  },
  target: {
    personId: "p-k-alfanisan",
    email: "k.alfanisan@qz.org.sa",
    roleKey: "BOYS_TEACHER",
  },
  plans: [
    {
      kind: "weekly",
      frameworkId: "director-weekly-teacher-evaluation-v1",
      expectedItemsCount: 10,
      expectedCyclesCount: 9,
      sourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation",
      targetPlanId:
        "mrb-boys-faleh-ay-1448-term-1-director-weekly-teacher-evaluation",
    },
    {
      kind: "diagnostic",
      frameworkId: "director-diagnostic-teacher-evaluation-v1",
      expectedItemsCount: 21,
      expectedCyclesCount: 2,
      sourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
      targetPlanId:
        "mrb-boys-faleh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();

  assert(snapshot.exists, `${label} not found: ${documentPath}`);

  return { id: snapshot.id, ...snapshot.data() };
}

async function listByField(db, collectionPath, field, value) {
  const snapshot = await db
    .collection(collectionPath)
    .where(field, "==", value)
    .get();

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

function targetText(value) {
  if (typeof value !== "string") return value;

  return value.replaceAll("السيح", "الفالح");
}

function copyOptionalNumber(source, target, field) {
  if (typeof source[field] === "number") {
    target[field] = source[field];
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [school, evaluatorUser, evaluatorPerson, membership, targetPerson] =
    await Promise.all([
      readRequiredDoc(
        db,
        `${orgRoot}/schools/${CONFIG.targetSchoolId}`,
        "Target school",
      ),
      readRequiredDoc(db, `users/${CONFIG.evaluator.uid}`, "Evaluator user"),
      readRequiredDoc(
        db,
        `${orgRoot}/people/${CONFIG.evaluator.personId}`,
        "Evaluator person",
      ),
      readRequiredDoc(
        db,
        `users/${CONFIG.evaluator.uid}/orgMemberships/${CONFIG.orgId}`,
        "Evaluator organization membership",
      ),
      readRequiredDoc(
        db,
        `${orgRoot}/people/${CONFIG.target.personId}`,
        "Target person",
      ),
    ]);

  assert(
    normalizeEmail(evaluatorUser.email || evaluatorPerson.email) ===
      CONFIG.evaluator.email,
    "Evaluator email does not match the configured user/person.",
  );
  assert(
    membership.personId === CONFIG.evaluator.personId,
    "Evaluator membership personId does not match.",
  );
  assert(
    (membership.roleKey || membership.role) === CONFIG.evaluator.roleKey,
    "Evaluator membership role does not match BOYS_PRINCIPAL.",
  );
  assert(
    membership.isActive !== false && membership.active !== false,
    "Evaluator membership is inactive.",
  );
  assert(
    membership.permissions?.manageEvaluations === true,
    "Evaluator membership is missing manageEvaluations permission.",
  );
  assert(
    membership.scopeId === CONFIG.targetSchoolId ||
      membership.scopes?.schoolIds?.includes(CONFIG.targetSchoolId) ||
      membership.scopes?.canAccessAllSchools === true,
    "Evaluator membership cannot access the target school.",
  );
  assert(
    normalizeEmail(targetPerson.email) === CONFIG.target.email,
    "Target person email does not match.",
  );

  const plans = [];

  for (const planConfig of CONFIG.plans) {
    const [framework, sections, items, sourcePlan, sourceCycles] =
      await Promise.all([
        readRequiredDoc(
          db,
          `${orgRoot}/evaluationFrameworks/${planConfig.frameworkId}`,
          `${planConfig.kind} framework`,
        ),
        listByField(
          db,
          `${orgRoot}/evaluationRubricSections`,
          "frameworkId",
          planConfig.frameworkId,
        ),
        listByField(
          db,
          `${orgRoot}/evaluationRubricItems`,
          "frameworkId",
          planConfig.frameworkId,
        ),
        readRequiredDoc(
          db,
          `${orgRoot}/evaluationPlans/${planConfig.sourcePlanId}`,
          `${planConfig.kind} source plan`,
        ),
        listByField(
          db,
          `${orgRoot}/evaluationCycles`,
          "planId",
          planConfig.sourcePlanId,
        ),
      ]);

    assert(framework.isActive === true, `${planConfig.kind} framework is inactive.`);
    assert(
      framework.version === 1,
      `${planConfig.kind} framework version must be 1.`,
    );
    assert(
      items.length === planConfig.expectedItemsCount,
      `${planConfig.kind} framework items count must be ${planConfig.expectedItemsCount}.`,
    );
    assert(sections.length > 0, `${planConfig.kind} framework has no sections.`);
    assert(
      Math.abs(
        sections.reduce(
          (total, section) => total + Number(section.weight || 0),
          0,
        ) - 100,
      ) < 0.001,
      `${planConfig.kind} framework section weights must total 100.`,
    );
    assert(
      items.every(
        (item) =>
          Number.isInteger(item.order) &&
          typeof item.maxScore === "number" &&
          item.maxScore > 0,
      ),
      `${planConfig.kind} framework contains an invalid rubric item.`,
    );
    assert(
      sourcePlan.schoolId === CONFIG.sourceSchoolId &&
        sourcePlan.academicYearId === CONFIG.academicYearId &&
        sourcePlan.termId === CONFIG.termId &&
        sourcePlan.frameworkId === planConfig.frameworkId,
      `${planConfig.kind} source plan context does not match.`,
    );
    assert(
      sourceCycles.length === planConfig.expectedCyclesCount,
      `${planConfig.kind} source cycles count must be ${planConfig.expectedCyclesCount}.`,
    );

    plans.push({
      ...planConfig,
      framework,
      sourcePlan,
      sourceCycles: sourceCycles.sort(
        (left, right) =>
          Number(left.cycleNumber || 0) - Number(right.cycleNumber || 0),
      ),
    });
  }

  return { school, evaluatorPerson, targetPerson, plans };
}

function buildDocuments(preflight) {
  const documents = [];

  for (const plan of preflight.plans) {
    const planDocument = {
      id: plan.targetPlanId,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.targetSchoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      title: targetText(plan.sourcePlan.title),
      description: targetText(plan.sourcePlan.description),
      frameworkId: plan.frameworkId,
      planKind: plan.sourcePlan.planKind,
      targetKind: "TEACHER",
      status: "ACTIVE",
    };

    copyOptionalNumber(plan.sourcePlan, planDocument, "startsAt");
    copyOptionalNumber(plan.sourcePlan, planDocument, "endsAt");

    documents.push({
      path: `orgs/${CONFIG.orgId}/evaluationPlans/${plan.targetPlanId}`,
      data: planDocument,
      type: "plan",
    });

    const policyId = `${plan.targetPlanId}-policy-director`;

    documents.push({
      path: `orgs/${CONFIG.orgId}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: plan.targetPlanId,
        evaluatorRoleKey: CONFIG.evaluator.roleKey,
        evaluatorLabel: "مدير المدرسة",
        weight: 100,
        required: true,
        canSubmit: true,
        canReview: false,
        canApprove: true,
        order: 1,
      },
      type: "policy",
    });

    const targetAssignmentId =
      `${plan.targetPlanId}-target-${CONFIG.target.personId}`;

    documents.push({
      path:
        `orgs/${CONFIG.orgId}/evaluationTargetAssignments/` +
        targetAssignmentId,
      data: {
        id: targetAssignmentId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: plan.targetPlanId,
        targetPersonId: CONFIG.target.personId,
        targetEmail: CONFIG.target.email,
        targetDisplayName: preflight.targetPerson.displayName,
        targetRoleKey: CONFIG.target.roleKey,
        targetKind: "TEACHER",
        status: "ACTIVE",
        assignedAt: Date.now(),
      },
      type: "targetAssignment",
    });

    for (const sourceCycle of plan.sourceCycles) {
      const cycleId = sourceCycle.id.replace(
        plan.sourcePlanId,
        plan.targetPlanId,
      );
      const cycleDocument = {
        id: cycleId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: plan.targetPlanId,
        cycleNumber: sourceCycle.cycleNumber,
        title: sourceCycle.title,
        cycleKind: sourceCycle.cycleKind,
        status: "OPEN",
        isIncludedInAverage: sourceCycle.isIncludedInAverage !== false,
      };

      copyOptionalNumber(sourceCycle, cycleDocument, "startsAt");
      copyOptionalNumber(sourceCycle, cycleDocument, "endsAt");

      documents.push({
        path: `orgs/${CONFIG.orgId}/evaluationCycles/${cycleId}`,
        data: cycleDocument,
        type: "cycle",
      });

      const evaluatorAssignmentId =
        `${plan.targetPlanId}-${cycleId}-` +
        `${CONFIG.target.personId}-${CONFIG.evaluator.personId}`;

      documents.push({
        path:
          `orgs/${CONFIG.orgId}/evaluationEvaluatorAssignments/` +
          evaluatorAssignmentId,
        data: {
          id: evaluatorAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: CONFIG.targetSchoolId,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId: plan.targetPlanId,
          cycleId,
          targetPersonId: CONFIG.target.personId,
          evaluatorPersonId: CONFIG.evaluator.personId,
          evaluatorEmail: CONFIG.evaluator.email,
          evaluatorRoleKey: CONFIG.evaluator.roleKey,
          weight: 100,
          sourceType: "MANUAL",
          status: "ACTIVE",
        },
        type: "evaluatorAssignment",
      });
    }
  }

  return documents;
}

async function applyDocuments(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );
  const snapshotByPath = new Map(
    snapshots.map((snapshot) => [snapshot.ref.path, snapshot]),
  );
  const batch = db.batch();
  const timestamp = Date.now();

  for (const document of documents) {
    const reference = db.doc(document.path);
    const current = snapshotByPath.get(reference.path);
    const timestamps = {
      updatedAt: timestamp,
      ...(current?.exists ? {} : { createdAt: timestamp }),
    };

    batch.set(reference, { ...document.data, ...timestamps }, { merge: true });
  }

  await batch.commit();
}

async function verify(db, documents) {
  const snapshots = await db.getAll(
    ...documents.map((document) => db.doc(document.path)),
  );
  const missing = snapshots.filter((snapshot) => !snapshot.exists);

  assert(missing.length === 0, `${missing.length} seeded documents are missing.`);

  const byType = documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});

  for (const snapshot of snapshots) {
    const data = snapshot.data();

    assert(
      data.orgId === CONFIG.orgId,
      `Invalid orgId at ${snapshot.ref.path}.`,
    );
    assert(
      data.schoolId === CONFIG.targetSchoolId,
      `Invalid schoolId at ${snapshot.ref.path}.`,
    );
  }

  return byType;
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = buildDocuments(preflight);
  const byType = documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(
    {
      school: {
        id: CONFIG.targetSchoolId,
        name: preflight.school.name || preflight.school.title,
      },
      evaluator: {
        personId: CONFIG.evaluator.personId,
        email: CONFIG.evaluator.email,
        roleKey: CONFIG.evaluator.roleKey,
      },
      target: {
        personId: CONFIG.target.personId,
        displayName: preflight.targetPerson.displayName,
        email: CONFIG.target.email,
      },
      plans: preflight.plans.map((plan) => ({
        id: plan.targetPlanId,
        frameworkId: plan.frameworkId,
        cycles: plan.sourceCycles.length,
      })),
      documents: byType,
    },
    { depth: 6 },
  );

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to commit this seed.");
    return;
  }

  await applyDocuments(db, documents);
  const verified = await verify(db, documents);

  console.log("Seed applied and verified successfully.");
  console.dir(verified);
}

main().catch((error) => {
  console.error("Faleh evaluation pilot seed failed:");
  console.error(error);
  process.exitCode = 1;
});
