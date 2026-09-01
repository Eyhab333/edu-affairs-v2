/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  academicYearId: "ay-1448",
  termId: "term-1",
  frameworkId: "educational-supervisor-periodic-teacher-evaluation-girls-v2",
  frameworkTitle: "التقييم الفتري للمشرف التعليمي - للمعلمات",
  referencePlanId: "mrb-girls-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
  planId: "mrb-girls-ay-1448-term-1-sayed-educational-supervisor-periodic-teacher-evaluation",
  planTitle: "التقييم الفتري للمشرف التعليمي - للمعلمات - مدرسة منار الريادة بنات - الفصل الأول",
  evaluator: {
    uid: "aa3uDx6i5uf6Dp5YP3unAqD5Zyo1",
    personId: "p-s-sayed",
    email: "s.sayed@qz.org.sa",
    roleKey: "EDU_SUPERVISOR",
    operationalAssignmentId: "staff-provisioning__p-s-sayed__mrb-girls__STAFF_EVALUATION",
  },
};

const SCHOOL_ID_ALIASES = {
  manarGirls: "mrb-girls",
  manarBoysSayh: "mrb-boys-sayh",
  manarBoysFaleh: "mrb-boys-faleh",
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function normalizeSchoolId(value) {
  const schoolId = asString(value);
  return SCHOOL_ID_ALIASES[schoolId] || schoolId;
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function referenceScopeMatches(data) {
  return (
    normalizeSchoolId(data.schoolId) === CONFIG.schoolId &&
    asString(data.academicYearId) === CONFIG.academicYearId &&
    asString(data.termId) === CONFIG.termId
  );
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadSayed(db, orgRoot) {
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Sayed user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Sayed person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Sayed membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();
  const emails = [authUser.email, userData.email, personData.email].map(normalizeEmail).filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  const roleKey = asString(membershipData.roleKey || membershipData.role).toUpperCase();

  assert(uniqueEmails.length === 1 && uniqueEmails[0] === evaluator.email, "Sayed email identity mismatch.");
  assert(asString(userData.personId) === evaluator.personId, "Sayed user personId mismatch.");
  assert(asString(membershipData.personId) === evaluator.personId, "Sayed membership personId mismatch.");
  assert(roleKey === evaluator.roleKey, "Sayed role mismatch.");
  assert(isActive(membershipData), "Sayed membership is inactive.");
  const operation = operations.docs.find((document) => document.id === evaluator.operationalAssignmentId);
  assert(operation && isActive(operation.data()), "Sayed Manar Girls STAFF_EVALUATION operation is missing or inactive.");
  assert(
    normalizeSchoolId(operation.data().schoolId || operation.data().scopeId) === CONFIG.schoolId &&
      asString(operation.data().operationKind) === "STAFF_EVALUATION",
    "Sayed operational assignment does not match Manar Girls STAFF_EVALUATION scope.",
  );

  return { personId: evaluator.personId, email: uniqueEmails[0], roleKey };
}

async function loadReference(db, orgRoot) {
  const referencePlan = await readRequiredDoc(db, `${orgRoot}/evaluationPlans/${CONFIG.referencePlanId}`, "Reference plan");
  const planData = referencePlan.data();
  assert(referenceScopeMatches(planData), "Reference plan is outside the configured Manar Girls scope.");
  assert(asString(planData.planKind) === "PERIODIC", "Reference plan must be PERIODIC.");
  assert(asString(planData.targetKind) === "TEACHER", "Reference plan must target TEACHER.");
  assert(isActive(planData), "Reference plan is not active.");

  const [cyclesSnapshot, targetsSnapshot, assignmentsSnapshot] = await Promise.all([
    db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", CONFIG.referencePlanId).get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", CONFIG.referencePlanId).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", CONFIG.referencePlanId).get(),
  ]);
  const cycles = cyclesSnapshot.docs
    .filter((document) => referenceScopeMatches(document.data()) && isActive(document.data()))
    .sort((left, right) => Number(left.data().cycleNumber) - Number(right.data().cycleNumber));
  const targets = targetsSnapshot.docs
    .filter((document) => referenceScopeMatches(document.data()) && isActive(document.data()))
    .sort((left, right) => asString(left.data().targetPersonId).localeCompare(asString(right.data().targetPersonId)));
  const assignments = assignmentsSnapshot.docs.filter((document) => {
    return referenceScopeMatches(document.data()) && isActive(document.data());
  });

  assert(cycles.length > 0, "Reference plan has no active cycles.");
  assert(targets.length > 0, "Reference plan has no active target assignments.");
  assert(new Set(cycles.map((document) => Number(document.data().cycleNumber))).size === cycles.length, "Reference plan has duplicate active cycle numbers.");
  assert(new Set(targets.map((document) => asString(document.data().targetPersonId))).size === targets.length, "Reference plan has duplicate active target assignments.");
  assert(targets.every((document) => asString(document.data().targetPersonId)), "Reference plan has a target assignment without targetPersonId.");

  const assignmentByTargetCycle = new Map();
  for (const assignment of assignments) {
    const data = assignment.data();
    const key = `${asString(data.cycleId)}|${asString(data.targetPersonId)}`;
    assert(!assignmentByTargetCycle.has(key), `Reference plan has multiple active evaluator assignments for ${key}.`);
    assert(Number(data.weight) === 100, `Reference evaluator assignment must have weight 100: ${assignment.ref.path}`);
    assignmentByTargetCycle.set(key, assignment);
  }
  for (const cycle of cycles) {
    for (const target of targets) {
      const key = `${cycle.id}|${asString(target.data().targetPersonId)}`;
      assert(assignmentByTargetCycle.has(key), `Reference plan is missing an active evaluator assignment for ${key}.`);
    }
  }

  return { referencePlan, cycles, targets, assignmentByTargetCycle };
}

async function validateFramework(db, orgRoot) {
  const framework = await readRequiredDoc(db, `${orgRoot}/evaluationFrameworks/${CONFIG.frameworkId}`, "New framework");
  const data = framework.data();
  assert(asString(data.title) === CONFIG.frameworkTitle, "New framework title mismatch.");
  assert(asString(data.targetKind) === "TEACHER", "New framework must target TEACHER.");
  assert(asString(data.frameworkKind) === "PERIODIC_STAFF_EVALUATION", "New framework must be periodic staff evaluation.");
  assert(data.isActive !== false && data.isLocked === true && data.version === 1, "New framework lock/version mismatch.");
}

function stripTimestamps(data) {
  const { createdAt, updatedAt, assignedAt, ...result } = data;
  return result;
}

function buildDocuments(orgRoot, sayed, reference) {
  const referencePlanData = stripTimestamps(reference.referencePlan.data());
  const { id: _referencePlanId, planId: _referencePlanField, frameworkId: _referenceFrameworkId, ...referencePlanShape } = referencePlanData;
  const documents = [
    {
      type: "plan",
      path: `${orgRoot}/evaluationPlans/${CONFIG.planId}`,
      data: {
        ...referencePlanShape,
        id: CONFIG.planId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        title: CONFIG.planTitle,
        description: `خطة تطبيق ${CONFIG.frameworkTitle} داخل الفصل الدراسي الأول.`,
        frameworkId: CONFIG.frameworkId,
        planKind: "PERIODIC",
        targetKind: "TEACHER",
        status: "ACTIVE",
      },
    },
  ];
  const newCycleIdByReferenceId = new Map();

  reference.cycles.forEach((cycle) => {
    const suffix = cycle.id.slice(`${CONFIG.referencePlanId}-`.length);
    assert(suffix && cycle.id === `${CONFIG.referencePlanId}-${suffix}`, `Reference cycle ID is not deterministic: ${cycle.id}`);
    const cycleId = `${CONFIG.planId}-${suffix}`;
    newCycleIdByReferenceId.set(cycle.id, cycleId);
    const { id: _id, planId: _planId, ...cycleShape } = stripTimestamps(cycle.data());
    documents.push({
      type: "cycle",
      path: `${orgRoot}/evaluationCycles/${cycleId}`,
      data: {
        ...cycleShape,
        id: cycleId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: CONFIG.planId,
      },
    });
  });

  reference.targets.forEach((target) => {
    const targetData = target.data();
    const targetPersonId = asString(targetData.targetPersonId);
    const targetId = `${CONFIG.planId}-target-${targetPersonId}`;
    const { id: _id, planId: _planId, ...targetShape } = stripTimestamps(targetData);
    documents.push({
      type: "targetAssignment",
      path: `${orgRoot}/evaluationTargetAssignments/${targetId}`,
      data: {
        ...targetShape,
        id: targetId,
        orgId: CONFIG.orgId,
        schoolId: CONFIG.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId: CONFIG.planId,
        status: "ACTIVE",
      },
    });

    reference.cycles.forEach((cycle) => {
      const source = reference.assignmentByTargetCycle.get(`${cycle.id}|${targetPersonId}`);
      const cycleId = newCycleIdByReferenceId.get(cycle.id);
      const assignmentId = `${cycleId}-${targetPersonId}-${sayed.personId}`;
      const { id: _assignmentId, planId: _assignmentPlanId, cycleId: _assignmentCycleId, evaluatorDisplayName: _evaluatorDisplayName, ...assignmentShape } = stripTimestamps(source.data());
      documents.push({
        type: "evaluatorAssignment",
        path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`,
        data: {
          ...assignmentShape,
          id: assignmentId,
          orgId: CONFIG.orgId,
          schoolId: CONFIG.schoolId,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId: CONFIG.planId,
          cycleId,
          targetPersonId,
          evaluatorPersonId: sayed.personId,
          evaluatorEmail: sayed.email,
          evaluatorRoleKey: sayed.roleKey,
          weight: 100,
          status: "ACTIVE",
        },
      });
    });
  });

  return documents;
}

function assertAllWritesAreManarGirls(documents) {
  const outsideScope = documents.filter((document) => document.data.schoolId !== CONFIG.schoolId);
  assert(outsideScope.length === 0, `Refusing to write outside ${CONFIG.schoolId}: ${outsideScope.map((document) => document.path).join(", ")}`);
}

function assertExistingDocument(snapshot, desired) {
  const current = snapshot.data();
  for (const [field, expected] of Object.entries(desired.data)) {
    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}.`,
    );
  }
}

async function inspectDocuments(db, documents) {
  const missing = [];
  const existing = [];
  for (const group of chunk(documents, 400)) {
    const snapshots = await db.getAll(...group.map((document) => db.doc(document.path)));
    snapshots.forEach((snapshot, index) => {
      const desired = group[index];
      if (!snapshot.exists) missing.push(desired);
      else {
        assertExistingDocument(snapshot, desired);
        existing.push(desired);
      }
    });
  }
  return { missing, existing };
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function createMissingDocuments(db, documents) {
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    group.forEach((document) => {
      batch.create(db.doc(document.path), {
        ...document.data,
        createdAt: now,
        updatedAt: now,
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    });
    await batch.commit();
  }
}

function documentIdsByType(documents) {
  return documents.reduce((result, document) => {
    result[document.type] = result[document.type] || [];
    result[document.type].push(document.data.id);
    return result;
  }, {});
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  await validateFramework(db, orgRoot);
  const [sayed, reference] = await Promise.all([
    loadSayed(db, orgRoot),
    loadReference(db, orgRoot),
  ]);
  const documents = buildDocuments(orgRoot, sayed, reference);
  assertAllWritesAreManarGirls(documents);
  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir({
    planId: CONFIG.planId,
    frameworkId: CONFIG.frameworkId,
    referencePlanId: CONFIG.referencePlanId,
    evaluator: sayed,
    cyclesToCreate: documentIdsByType(inspection.missing).cycle || [],
    targetAssignmentsToCreate: (documentIdsByType(inspection.missing).targetAssignment || []).length,
    evaluatorAssignmentsToCreate: (documentIdsByType(inspection.missing).evaluatorAssignment || []).length,
    existingDocuments: documentIdsByType(inspection.existing),
    documentsToCreate: documentIdsByType(inspection.missing),
  }, { depth: null });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create only missing Manar Girls plan documents.");
    return;
  }

  await createMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Plan documents are still missing after apply.");
  console.dir({
    createdDocuments: documentIdsByType(inspection.missing),
    updatedDocuments: [],
    writtenCounts: countByType(inspection.missing),
  }, { depth: null });
}

main().catch((error) => {
  console.error("Sayed periodic teacher evaluation plan seed failed:");
  console.error(error);
  process.exitCode = 1;
});
