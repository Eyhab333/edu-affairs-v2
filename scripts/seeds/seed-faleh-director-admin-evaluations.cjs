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
  plans: [
    {
      key: "vice-principal",
      frameworkId: "director-admin-vice-principal-evaluation-v1",
      expectedItems: 8,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-vice-principal-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-vice-principal-evaluation",
      title: "تقييم المدير لوكيل المدرسة - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "BOYS_VP",
      roleLabel: "وكيل المدرسة",
      target: {
        uid: "qU0t5pxQOthttvJz4IlfJlhw7Gg2",
        personId: "p-ralfaiz",
        displayName: "راشد سليمان فايز الفايز",
        email: "ralfaiz@qz.org.sa",
      },
    },
    {
      key: "admin-assistant",
      frameworkId: "director-admin-assistant-evaluation-v1",
      expectedItems: 8,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-assistant-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-assistant-evaluation",
      title: "تقييم المدير للمساعد الإداري - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "ADMIN_ASSISTANT",
      roleLabel: "المساعد الإداري",
      target: {
        uid: "rsOkC1xYdEQ7cveEeBJmxKzDDvX2",
        personId: "p-a-almotwa",
        displayName: "أيوب صالح عبدالكريم المطوع",
        email: "a.almotwa@qz.org.sa",
      },
    },
    {
      key: "activity-leader",
      frameworkId: "director-admin-activity-leader-evaluation-v1",
      expectedItems: 10,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-activity-leader-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-activity-leader-evaluation",
      title: "تقييم المدير لرائد النشاط - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "ACTIVITY_COORD",
      roleLabel: "رائد النشاط",
      target: {
        personId: "p-f-alqashami",
        displayName: "فهد محمد عبدالله القشعمي",
        email: "f.alqashami@qz.org.sa",
        operationalMembershipId: "op-boys-activity",
        operationalAssignmentId: "activity-p-f-alqashami-mrb-boys-faleh",
      },
    },
    {
      key: "student-counselor",
      frameworkId: "director-admin-student-counselor-evaluation-v1",
      expectedItems: 13,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-student-counselor-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-student-counselor-evaluation",
      title: "تقييم المدير للموجه الطلابي - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "BOYS_STUDENT_GUIDE",
      roleLabel: "الموجه الطلابي",
      target: {
        uid: "gm37B5cNxxUyIasU9G70zHgVkEj2",
        personId: "staff-gm37B5cNxxUyIasU9G70zHgVkEj2",
        displayName: "الموجه الطلابي",
        email: "students-mentor-faleh@qz.org.sa",
      },
    },
    {
      key: "media",
      frameworkId: "director-admin-media-evaluation-v1",
      expectedItems: 8,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-media-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-media-evaluation",
      title: "تقييم المدير للإعلامي - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "MEDIA_SPECIALIST",
      roleLabel: "الإعلامي",
      target: {
        uid: "xqqedggnhfVpwza1UWmqaoPxRmD3",
        personId: "staff-xqqedggnhfVpwza1UWmqaoPxRmD3",
        displayName: "إعلامي مدرسة الفالح",
        email: "media-faleh@qz.org.sa",
      },
    },
    {
      key: "educational-vice-principal",
      frameworkId:
        "director-admin-educational-vice-principal-evaluation-v1",
      expectedItems: 6,
      cycleSourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-admin-vice-principal-evaluation",
      planId:
        "mrb-boys-faleh-ay-1448-term-1-director-admin-educational-vice-principal-evaluation",
      title: "تقييم المدير للوكيل التعليمي - منار الريادة بنين الفالح - الفصل الأول",
      roleKey: "BOYS_EDU_VP",
      roleLabel: "الوكيل التعليمي",
      target: {
        uid: "H2KAczlZXTRKfVwvbVLLixnufMu2",
        personId: "staff-H2KAczlZXTRKfVwvbVLLixnufMu2",
        displayName: "الوكيل التعليمي",
        email: "educational-agent-faleh@qz.org.sa",
      },
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

function membershipCoversSchool(data) {
  return (
    asString(data.schoolId) === CONFIG.targetSchoolId ||
    asString(data.scopeId) === CONFIG.targetSchoolId ||
    data.scopes?.schoolIds?.includes(CONFIG.targetSchoolId) ||
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

async function validateEvaluator(db, orgRoot) {
  const [user, person, membership] = await Promise.all([
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
  ]);
  const membershipData = membership.data();

  assert(
    normalizeEmail(user.data().email || person.data().email) ===
      CONFIG.evaluator.email,
    "Evaluator email does not match.",
  );
  assert(
    asString(membershipData.personId) === CONFIG.evaluator.personId,
    "Evaluator personId does not match.",
  );
  assert(
    asString(membershipData.roleKey || membershipData.role).toUpperCase() ===
      CONFIG.evaluator.roleKey,
    "Evaluator role does not match.",
  );
  assert(isActive(membershipData), "Evaluator membership is inactive.");
  assert(
    membershipCoversSchool(membershipData),
    "Evaluator cannot access Faleh.",
  );
  assert(
    membershipData.permissions?.manageEvaluations === true,
    "Evaluator is missing manageEvaluations.",
  );
}

async function validateTarget(db, orgRoot, config) {
  const person = await readRequiredDoc(
    db,
    `${orgRoot}/people/${config.target.personId}`,
    `${config.key} person`,
  );
  const personData = person.data();

  assert(
    normalizeEmail(personData.email) === config.target.email,
    `${config.key} person email does not match.`,
  );
  assert(
    asString(personData.displayName) === config.target.displayName,
    `${config.key} displayName does not match.`,
  );

  if (!config.target.uid) {
    const [operationalMembership, operationalAssignment] = await Promise.all([
      readRequiredDoc(
        db,
        `${orgRoot}/operationalMemberships/${config.target.operationalMembershipId}`,
        `${config.key} operational membership`,
      ),
      readRequiredDoc(
        db,
        `${orgRoot}/operationalAssignments/${config.target.operationalAssignmentId}`,
        `${config.key} Faleh operational assignment`,
      ),
    ]);
    const membershipData = operationalMembership.data();
    const assignmentData = operationalAssignment.data();

    assert(
      asString(membershipData.personId) === config.target.personId &&
        asString(membershipData.roleKey).toUpperCase() === config.roleKey &&
        isActive(membershipData),
      `${config.key} operational membership does not match.`,
    );
    assert(
      asString(assignmentData.actorPersonId) === config.target.personId &&
        asString(assignmentData.actorRoleKey).toUpperCase() === config.roleKey &&
        asString(assignmentData.scopeId) === CONFIG.targetSchoolId &&
        isActive(assignmentData),
      `${config.key} Faleh operational assignment does not match: ` +
        JSON.stringify({
          actorPersonId: assignmentData.actorPersonId,
          actorRoleKey: assignmentData.actorRoleKey,
          scopeId: assignmentData.scopeId,
          schoolId: assignmentData.schoolId,
          isActive: assignmentData.isActive,
          status: assignmentData.status,
        }),
    );
    return;
  }

  const [user, membership] = await Promise.all([
    readRequiredDoc(db, `users/${config.target.uid}`, `${config.key} user`),
    readRequiredDoc(
      db,
      `users/${config.target.uid}/orgMemberships/${CONFIG.orgId}`,
      `${config.key} membership`,
    ),
  ]);
  const userData = user.data();
  const membershipData = membership.data();

  assert(
    asString(userData.personId) === config.target.personId &&
      asString(membershipData.personId) === config.target.personId,
    `${config.key} personId does not match user/membership.`,
  );
  assert(
    normalizeEmail(userData.email || personData.email) === config.target.email,
    `${config.key} email does not match.`,
  );
  assert(
    asString(membershipData.roleKey || membershipData.role).toUpperCase() ===
      config.roleKey,
    `${config.key} role does not match ${config.roleKey}.`,
  );
  assert(isActive(membershipData), `${config.key} membership is inactive.`);
  assert(
    membershipCoversSchool(membershipData),
    `${config.key} membership cannot access Faleh.`,
  );
}

async function loadPlanPreflight(db, orgRoot, config) {
  const [framework, sections, items, sourcePlan, sourceCycles] =
    await Promise.all([
      readRequiredDoc(
        db,
        `${orgRoot}/evaluationFrameworks/${config.frameworkId}`,
        `${config.key} framework`,
      ),
      listByField(
        db,
        `${orgRoot}/evaluationRubricSections`,
        "frameworkId",
        config.frameworkId,
      ),
      listByField(
        db,
        `${orgRoot}/evaluationRubricItems`,
        "frameworkId",
        config.frameworkId,
      ),
      readRequiredDoc(
        db,
        `${orgRoot}/evaluationPlans/${config.cycleSourcePlanId}`,
        `${config.key} cycle source plan`,
      ),
      listByField(
        db,
        `${orgRoot}/evaluationCycles`,
        "planId",
        config.cycleSourcePlanId,
      ),
    ]);
  const frameworkData = framework.data();
  const sourcePlanData = sourcePlan.data();
  const activeCycles = sourceCycles
    .filter((cycle) => isActive(cycle.data()))
    .sort(
      (left, right) =>
        Number(left.data().cycleNumber || 0) -
        Number(right.data().cycleNumber || 0),
    );

  assert(frameworkData.isActive === true, `${config.key} framework inactive.`);
  assert(frameworkData.version === 1, `${config.key} framework must be v1.`);
  assert(sections.length > 0, `${config.key} framework has no sections.`);
  assert(
    sections.reduce(
      (total, section) => total + Number(section.data().weight || 0),
      0,
    ) === 100,
    `${config.key} section weights must total 100.`,
  );
  assert(
    items.length === config.expectedItems,
    `${config.key} must have ${config.expectedItems} items; found ${items.length}.`,
  );
  assert(
    items.every(
      (item) =>
        Number.isInteger(item.data().order) &&
        Number(item.data().maxScore) > 0,
    ),
    `${config.key} has an invalid item.`,
  );
  assert(
    asString(sourcePlanData.schoolId) === CONFIG.sourceSchoolId &&
      asString(sourcePlanData.academicYearId) === CONFIG.academicYearId &&
      asString(sourcePlanData.termId) === CONFIG.termId,
    `${config.key} cycle source plan context does not match.`,
  );
  assert(
    activeCycles.length === 9,
    `${config.key} cycle source must have 9 active cycles.`,
  );

  await validateTarget(db, orgRoot, config);

  return { ...config, sourcePlanData, sourceCycles: activeCycles };
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;

  await Promise.all([
    readRequiredDoc(
      db,
      `${orgRoot}/schools/${CONFIG.targetSchoolId}`,
      "Faleh school",
    ),
    validateEvaluator(db, orgRoot),
  ]);

  const plans = [];

  for (const config of CONFIG.plans) {
    plans.push(await loadPlanPreflight(db, orgRoot, config));
  }

  return { plans };
}

function buildDocuments(preflight) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const documents = [];

  for (const config of preflight.plans) {
    documents.push({
      type: "plan",
      path: `${orgRoot}/evaluationPlans/${config.planId}`,
      data: {
        id: config.planId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        title: config.title,
        description: `خطة تطبيق ${config.roleLabel} 9 مرات داخل الفصل الدراسي.`,
        frameworkId: config.frameworkId,
        planKind: "PERIODIC",
        targetKind: "ADMIN_STAFF",
        targetRoleKey: config.roleKey,
        targetRoleLabel: config.roleLabel,
        status: "ACTIVE",
      },
    });

    const policyId = `${config.planId}-policy-director`;
    documents.push({
      type: "policy",
      path: `${orgRoot}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: config.planId,
        evaluatorRoleKey: CONFIG.evaluator.roleKey,
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
      `${config.planId}-target-${config.target.personId}`;
    documents.push({
      type: "targetAssignment",
      path:
        `${orgRoot}/evaluationTargetAssignments/` + targetAssignmentId,
      data: {
        id: targetAssignmentId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.targetSchoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: config.planId,
        targetPersonId: config.target.personId,
        targetEmail: config.target.email,
        targetDisplayName: config.target.displayName,
        targetRoleKey: config.roleKey,
        targetRoleLabel: config.roleLabel,
        targetKind: "ADMIN_STAFF",
        status: "ACTIVE",
      },
    });

    for (const sourceCycle of config.sourceCycles) {
      const sourceCycleData = sourceCycle.data();
      const cycleId = sourceCycle.id.replace(
        config.cycleSourcePlanId,
        config.planId,
      );
      documents.push({
        type: "cycle",
        path: `${orgRoot}/evaluationCycles/${cycleId}`,
        data: {
          id: cycleId,
          orgId: CONFIG.orgId,
          schoolId: CONFIG.targetSchoolId,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId: config.planId,
          cycleNumber: sourceCycleData.cycleNumber,
          title: sourceCycleData.title,
          cycleKind: sourceCycleData.cycleKind || "CUSTOM",
          status: "OPEN",
          isIncludedInAverage:
            sourceCycleData.isIncludedInAverage !== false,
        },
      });

      const evaluatorAssignmentId =
        `${config.planId}-${cycleId}-${config.target.personId}-` +
        CONFIG.evaluator.personId;
      documents.push({
        type: "evaluatorAssignment",
        path:
          `${orgRoot}/evaluationEvaluatorAssignments/` +
          evaluatorAssignmentId,
        data: {
          id: evaluatorAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: CONFIG.targetSchoolId,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId: config.planId,
          cycleId,
          targetPersonId: config.target.personId,
          targetRoleKey: config.roleKey,
          targetRoleLabel: config.roleLabel,
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
  assert(documents.length <= 500, "Firestore batch limit exceeded.");
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
      schoolId: CONFIG.targetSchoolId,
      evaluator: CONFIG.evaluator,
      plans: preflight.plans.map((plan) => ({
        key: plan.key,
        planId: plan.planId,
        frameworkId: plan.frameworkId,
        target: plan.target,
        roleKey: plan.roleKey,
        cycles: plan.sourceCycles.length,
      })),
      desired: countByType(documents),
      existing: countByType(inspection.existing),
      missing: countByType(inspection.missing),
    },
    { depth: 8 },
  );

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create Faleh plans.");
    return;
  }

  await applyMissing(db, inspection.missing);
  await verify(db, documents);

  console.log("Faleh admin evaluations applied and verified.");
  console.dir({ verified: countByType(documents) });
}

main().catch((error) => {
  console.error("Faleh admin evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
