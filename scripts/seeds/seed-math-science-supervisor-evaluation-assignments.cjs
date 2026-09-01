/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  subjectKeys: ["MATH", "SCIENCE"],
  expectedTargetCountBySchool: {
    "mrb-boys-sayh": 5,
    "mrb-boys-faleh": 5,
  },
  evaluator: {
    displayName: "مشرف الرياضيات والعلوم",
    email: "math-science-sup@qz.org.sa",
    uid: "NOFByrx0XLVovqxuFjfwRWSokgs1",
    personId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
    roleKey: "EDU_SUPERVISOR",
  },
  plans: [
    {
      key: "diagnostic",
      slug: "educational-supervisor-diagnostic-teacher-evaluation",
      frameworkId: "educational-supervisor-diagnostic-teacher-evaluation-v1",
      planKind: "VISIT_BASED",
      cycleSuffixes: ["visit-01", "visit-02", "visit-03"],
    },
    {
      key: "periodic",
      slug: "educational-supervisor-periodic-teacher-evaluation",
      frameworkId: "educational-supervisor-periodic-teacher-evaluation-v1",
      planKind: "PERIODIC",
      cycleSuffixes: ["evaluation-01", "evaluation-02", "evaluation-03"],
    },
  ],
  teacherRoleKey: "BOYS_TEACHER",
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

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && ![
    "DISABLED",
    "ENDED",
    "INACTIVE",
    "REVOKED",
    "REMOVED",
  ].includes(status);
}

function isActiveTeacherAssignment(data) {
  return asString(data.status).toUpperCase() === "ACTIVE" && data.active !== false;
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function planIdFor(schoolId, plan) {
  return [schoolId, CONFIG.academicYearId, CONFIG.termId, plan.slug].join("-");
}

function expectedCycleId(planId, suffix) {
  return `${planId}-${suffix}`;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function countBy(items, key) {
  return Object.fromEntries(items.reduce((counts, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()));
}

async function getAllInChunks(db, references) {
  const snapshots = [];
  for (const group of chunk(references, 400)) {
    snapshots.push(...await db.getAll(...group));
  }
  return snapshots;
}

async function inspectEvaluator(db, orgRoot) {
  const evaluator = CONFIG.evaluator;
  const [userSnapshot, personSnapshot, membershipSnapshot] = await Promise.all([
    db.doc(`users/${evaluator.uid}`).get(),
    db.doc(`${orgRoot}/people/${evaluator.personId}`).get(),
    db.doc(`users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`).get(),
  ]);
  let authUser = null;
  let authError = null;
  try {
    authUser = await admin.auth().getUser(evaluator.uid);
  } catch (error) {
    authError = error.message;
  }

  const user = userSnapshot.exists ? userSnapshot.data() : {};
  const person = personSnapshot.exists ? personSnapshot.data() : {};
  const membership = membershipSnapshot.exists ? membershipSnapshot.data() : {};
  const schoolAccess = Object.fromEntries(CONFIG.schoolIds.map((schoolId) => [
    schoolId,
    membershipSnapshot.exists && membershipCoversSchool(membership, schoolId),
  ]));
  const errors = [];

  if (!authUser) errors.push(`Firebase Auth user is missing: ${authError || evaluator.uid}`);
  if (authUser && normalizeEmail(authUser.email) !== evaluator.email) errors.push("Evaluator Auth email does not match the configured email.");
  if (!userSnapshot.exists) errors.push("Evaluator users document is missing.");
  if (!personSnapshot.exists) errors.push("Evaluator people document is missing.");
  if (!membershipSnapshot.exists) errors.push("Evaluator orgMembership is missing.");
  if (userSnapshot.exists && personSnapshot.exists && ![user.email, person.email].some((email) => normalizeEmail(email) === evaluator.email)) errors.push("Evaluator Firestore email does not match the configured email.");
  if (membershipSnapshot.exists && asString(membership.personId) !== evaluator.personId) errors.push("Evaluator membership personId does not match.");
  if (membershipSnapshot.exists && asString(membership.roleKey || membership.role).toUpperCase() !== evaluator.roleKey) errors.push("Evaluator membership roleKey does not match.");
  if (membershipSnapshot.exists && !isActive(membership)) errors.push("Evaluator membership is inactive.");
  for (const schoolId of CONFIG.schoolIds) {
    if (!schoolAccess[schoolId]) errors.push(`Evaluator membership does not cover ${schoolId}.`);
  }

  return {
    evaluator,
    userPath: userSnapshot.ref.path,
    personPath: personSnapshot.ref.path,
    membershipPath: membershipSnapshot.ref.path,
    authExists: Boolean(authUser),
    firestoreUserExists: userSnapshot.exists,
    personExists: personSnapshot.exists,
    membershipExists: membershipSnapshot.exists,
    membershipRoleKey: asString(membership.roleKey || membership.role).toUpperCase() || null,
    membershipSchoolAccess: schoolAccess,
    errors,
  };
}

async function loadTargetTeachers(db, orgRoot) {
  const assignmentCollection = db.collection(`${orgRoot}/teacherAssignments`);
  const schoolSnapshots = await Promise.all(CONFIG.schoolIds.map((schoolId) => (
    assignmentCollection.where("schoolId", "==", schoolId).get()
  )));
  const sourceEntries = [];
  const ignoredInactive = [];

  for (const snapshot of schoolSnapshots) {
    for (const document of snapshot.docs) {
      const data = document.data();
      const subjectKey = asString(data.subjectKey).toUpperCase();
      const matchesScope =
        asString(data.academicYearId) === CONFIG.academicYearId &&
        asString(data.termId) === CONFIG.termId &&
        CONFIG.subjectKeys.includes(subjectKey);
      if (!matchesScope) continue;

      if (!isActiveTeacherAssignment(data)) {
        ignoredInactive.push({
          assignmentId: document.id,
          path: document.ref.path,
          schoolId: asString(data.schoolId),
          teacherPersonId: asString(data.teacherPersonId),
          subjectKey,
          status: asString(data.status) || null,
        });
        continue;
      }

      const schoolId = asString(data.schoolId);
      const teacherPersonId = asString(data.teacherPersonId);
      assert(CONFIG.schoolIds.includes(schoolId), `Refusing unexpected teacher-assignment school: ${schoolId}`);
      assert(teacherPersonId, `Teacher assignment is missing teacherPersonId: ${document.ref.path}`);
      sourceEntries.push({
        document,
        schoolId,
        teacherPersonId,
        teacherEmail: asString(data.teacherEmail),
        subjectKey,
        classSubjectOfferingId: asString(data.classSubjectOfferingId),
        classId: asString(data.classId),
      });
    }
  }

  const personIds = [...new Set(sourceEntries.map((entry) => entry.teacherPersonId))];
  const offeringIds = [...new Set(sourceEntries.map((entry) => entry.classSubjectOfferingId).filter(Boolean))];
  const [people, offerings] = await Promise.all([
    getAllInChunks(db, personIds.map((personId) => db.doc(`${orgRoot}/people/${personId}`))),
    getAllInChunks(db, offeringIds.map((offeringId) => db.doc(`${orgRoot}/classSubjectOfferings/${offeringId}`))),
  ]);
  const peopleById = new Map(people.filter((document) => document.exists).map((document) => [document.id, document.data()]));
  const offeringsById = new Map(offerings.map((document) => [document.id, document]));
  const targets = new Map();
  const warnings = [];

  for (const entry of sourceEntries) {
    const key = `${entry.schoolId}|${entry.teacherPersonId}`;
    if (!targets.has(key)) {
      const person = peopleById.get(entry.teacherPersonId) || {};
      targets.set(key, {
        schoolId: entry.schoolId,
        teacherPersonId: entry.teacherPersonId,
        teacherDisplayName: asString(person.displayName) || null,
        teacherEmail: asString(person.email) || entry.teacherEmail || null,
        subjectKeys: new Set(),
        sourceEvidence: [],
      });
    }
    const offering = offeringsById.get(entry.classSubjectOfferingId);
    const offeringSubjectKey = offering?.exists
      ? asString(offering.data().subjectKey).toUpperCase()
      : "";
    if (entry.classSubjectOfferingId && !offering?.exists) {
      warnings.push(`classSubjectOffering is missing: ${orgRoot}/classSubjectOfferings/${entry.classSubjectOfferingId}`);
    }
    if (offeringSubjectKey && offeringSubjectKey !== entry.subjectKey) {
      warnings.push(`subjectKey mismatch between teacherAssignment and classSubjectOffering: ${entry.document.ref.path}`);
    }
    const target = targets.get(key);
    target.subjectKeys.add(entry.subjectKey);
    target.sourceEvidence.push({
      teacherAssignmentPath: entry.document.ref.path,
      teacherAssignmentId: entry.document.id,
      subjectKey: entry.subjectKey,
      classId: entry.classId || null,
      classSubjectOffering: entry.classSubjectOfferingId ? {
        path: `${orgRoot}/classSubjectOfferings/${entry.classSubjectOfferingId}`,
        exists: Boolean(offering?.exists),
        subjectKey: offeringSubjectKey || null,
      } : null,
    });
  }

  return {
    targets: [...targets.values()]
      .map((target) => ({ ...target, subjectKeys: [...target.subjectKeys].sort() }))
      .sort((left, right) => left.schoolId.localeCompare(right.schoolId) || left.teacherPersonId.localeCompare(right.teacherPersonId)),
    ignoredInactive,
    warnings,
  };
}

async function loadPlanData(db, orgRoot) {
  const entries = [];
  for (const schoolId of CONFIG.schoolIds) {
    for (const plan of CONFIG.plans) {
      const planId = planIdFor(schoolId, plan);
      const snapshot = await db.doc(`${orgRoot}/evaluationPlans/${planId}`).get();
      const data = snapshot.exists ? snapshot.data() : {};
      const errors = [];
      if (!snapshot.exists) {
        errors.push("plan is missing");
      } else {
        if (asString(data.schoolId) !== schoolId) errors.push("schoolId mismatch");
        if (asString(data.academicYearId) !== CONFIG.academicYearId) errors.push("academicYearId mismatch");
        if (asString(data.termId) !== CONFIG.termId) errors.push("termId mismatch");
        if (asString(data.targetKind).toUpperCase() !== "TEACHER") errors.push("targetKind must be TEACHER");
        if (asString(data.planKind).toUpperCase() !== plan.planKind) errors.push(`planKind must be ${plan.planKind}`);
        if (!asString(data.frameworkId).includes("educational-supervisor-") || asString(data.frameworkId) !== plan.frameworkId) errors.push(`frameworkId must be ${plan.frameworkId}`);
        const configuredEvaluatorRole = asString(data.evaluatorRoleKey || data.evaluatorRole).toUpperCase();
        if (configuredEvaluatorRole && !configuredEvaluatorRole.includes("EDU_SUPERVISOR")) errors.push(`evaluator role must be an educational supervisor, found ${configuredEvaluatorRole}`);
      }

      const [cycleSnapshot, evaluatorSnapshot] = snapshot.exists ? await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]) : [{ docs: [] }, { docs: [] }];
      const cycles = cycleSnapshot.docs.filter((document) => {
        const cycle = document.data();
        return asString(cycle.schoolId) === schoolId &&
          asString(cycle.academicYearId) === CONFIG.academicYearId &&
          asString(cycle.termId) === CONFIG.termId;
      });
      const assignments = evaluatorSnapshot.docs.filter((document) => {
        const assignment = document.data();
        return asString(assignment.schoolId) === schoolId &&
          asString(assignment.academicYearId) === CONFIG.academicYearId &&
          asString(assignment.termId) === CONFIG.termId;
      });
      const expectedCycleIds = plan.cycleSuffixes.map((suffix) => expectedCycleId(planId, suffix));
      const actualCycleIds = new Set(cycles.map((document) => document.id));
      for (const cycleId of expectedCycleIds) {
        if (!actualCycleIds.has(cycleId)) errors.push(`expected cycle is missing: ${cycleId}`);
      }
      if (cycles.length !== plan.cycleSuffixes.length) errors.push(`expected ${plan.cycleSuffixes.length} scoped cycles, found ${cycles.length}`);

      entries.push({
        schoolId,
        plan,
        planId,
        planSnapshot: snapshot,
        cycles,
        assignments,
        errors,
      });
    }
  }
  return entries;
}

function targetAssignmentDocument(orgRoot, target, planEntry) {
  const id = `${planEntry.planId}-target-${target.teacherPersonId}`;
  return {
    type: "targetAssignment",
    id,
    path: `${orgRoot}/evaluationTargetAssignments/${id}`,
    data: {
      id,
      orgId: CONFIG.orgId,
      schoolId: target.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: planEntry.planId,
      targetPersonId: target.teacherPersonId,
      targetEmail: target.teacherEmail || "",
      targetDisplayName: target.teacherDisplayName || target.teacherPersonId,
      targetRoleKey: CONFIG.teacherRoleKey,
      targetRoleLabel: "معلم",
      targetKind: "TEACHER",
      status: "ACTIVE",
    },
  };
}

function evaluatorAssignmentDocument(orgRoot, target, planEntry, cycle) {
  const cycleId = cycle.id;
  const id = `${cycleId}-${target.teacherPersonId}-${CONFIG.evaluator.personId}`;
  return {
    type: "evaluatorAssignment",
    id,
    path: `${orgRoot}/evaluationEvaluatorAssignments/${id}`,
    data: {
      id,
      orgId: CONFIG.orgId,
      schoolId: target.schoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: planEntry.planId,
      cycleId,
      targetPersonId: target.teacherPersonId,
      targetRoleKey: CONFIG.teacherRoleKey,
      targetRoleLabel: "معلم",
      evaluatorPersonId: CONFIG.evaluator.personId,
      evaluatorEmail: CONFIG.evaluator.email,
      evaluatorRoleKey: CONFIG.evaluator.roleKey,
      weight: 100,
      sourceType: "MANUAL",
      status: "ACTIVE",
    },
  };
}

function scopeFieldsMatch(current, desired) {
  return [
    "orgId",
    "schoolId",
    "academicYearId",
    "termId",
    "planId",
    "targetPersonId",
  ].every((field) => current[field] === desired[field]);
}

function targetFieldsMatch(current, desired) {
  return scopeFieldsMatch(current, desired) && current.targetKind === desired.targetKind;
}

function evaluatorFieldsMatch(current, desired) {
  return scopeFieldsMatch(current, desired) && [
    "cycleId",
    "evaluatorPersonId",
    "evaluatorEmail",
    "evaluatorRoleKey",
    "weight",
    "sourceType",
  ].every((field) => current[field] === desired[field]);
}

async function buildChangePlan(db, orgRoot, targets, planEntries) {
  const targetDocuments = [];
  const evaluatorDocuments = [];
  const conflicts = [];
  const existingTargetAssignments = [];
  const existingEvaluatorAssignments = [];

  for (const target of targets) {
    for (const planEntry of planEntries.filter((entry) => entry.schoolId === target.schoolId)) {
      if (planEntry.errors.length > 0) continue;
      targetDocuments.push(targetAssignmentDocument(orgRoot, target, planEntry));
      for (const cycle of planEntry.cycles) {
        evaluatorDocuments.push(evaluatorAssignmentDocument(orgRoot, target, planEntry, cycle));
      }
    }
  }

  const allDocuments = [...targetDocuments, ...evaluatorDocuments];
  const snapshots = await getAllInChunks(db, allDocuments.map((document) => db.doc(document.path)));
  const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
  const plannedTargetAssignments = [];
  const plannedEvaluatorAssignments = [];

  for (const document of targetDocuments) {
    const snapshot = snapshotByPath.get(document.path);
    if (!snapshot.exists) {
      plannedTargetAssignments.push(document);
      continue;
    }
    const current = snapshot.data();
    if (isActive(current) && targetFieldsMatch(current, document.data)) {
      existingTargetAssignments.push({ id: document.id, path: document.path });
    } else {
      conflicts.push({ type: document.type, path: document.path, reason: `existing target assignment is ${asString(current.status) || "not ACTIVE"} or has conflicting scope fields` });
    }
  }

  for (const document of evaluatorDocuments) {
    const snapshot = snapshotByPath.get(document.path);
    const sameTargetCycle = planEntries
      .find((entry) => entry.planId === document.data.planId)
      .assignments
      .filter((assignment) => (
        asString(assignment.data().targetPersonId) === document.data.targetPersonId &&
        asString(assignment.data().cycleId) === document.data.cycleId
      ));
    const activeOtherEvaluator = sameTargetCycle.find((assignment) => (
      isActive(assignment.data()) &&
      asString(assignment.data().evaluatorPersonId) !== CONFIG.evaluator.personId
    ));

    if (activeOtherEvaluator) {
      conflicts.push({
        type: document.type,
        path: document.path,
        reason: "an active evaluator assignment already exists for this teacher/plan/cycle with another evaluator",
        existingAssignmentId: activeOtherEvaluator.id,
        existingEvaluatorPersonId: asString(activeOtherEvaluator.data().evaluatorPersonId),
        existingEvaluatorRoleKey: asString(activeOtherEvaluator.data().evaluatorRoleKey),
      });
      continue;
    }
    if (!snapshot.exists) {
      plannedEvaluatorAssignments.push(document);
      continue;
    }
    const current = snapshot.data();
    if (isActive(current) && evaluatorFieldsMatch(current, document.data)) {
      existingEvaluatorAssignments.push({ id: document.id, path: document.path });
    } else {
      conflicts.push({ type: document.type, path: document.path, reason: `existing evaluator assignment is ${asString(current.status) || "not ACTIVE"} or conflicts with the expected evaluator fields` });
    }
  }

  const plannedWrites = [...plannedTargetAssignments, ...plannedEvaluatorAssignments];
  const planIds = new Set(planEntries.map((entry) => entry.planId));
  const writesOutsideIncludedSchools = plannedWrites.filter((document) => !CONFIG.schoolIds.includes(document.data.schoolId));
  const writesTouchingGirls = plannedWrites.filter((document) => document.data.schoolId === "mrb-girls");
  const writesTouchingKindergarten = plannedWrites.filter((document) => /kindergarten|kg/i.test(document.data.schoolId));
  const writesOutsideAllowedPlans = plannedWrites.filter((document) => !planIds.has(document.data.planId));
  const evidenceKeys = new Set(targets.map((target) => `${target.schoolId}|${target.teacherPersonId}`));
  const writesWithoutEvidence = plannedWrites.filter((document) => !evidenceKeys.has(`${document.data.schoolId}|${document.data.targetPersonId}`));

  return {
    plannedTargetAssignments,
    plannedEvaluatorAssignments,
    existingTargetAssignments,
    existingEvaluatorAssignments,
    conflicts,
    plannedWrites,
    writesOutsideIncludedSchools,
    writesTouchingGirls,
    writesTouchingKindergarten,
    writesOutsideAllowedPlans,
    writesWithoutEvidence,
  };
}

function buildReport(evaluatorInspection, teacherData, planEntries, changePlan) {
  const errors = [
    ...evaluatorInspection.errors,
    ...planEntries.flatMap((entry) => entry.errors.map((error) => `${entry.planId}: ${error}`)),
  ];
  const targetsBySchool = Object.fromEntries(CONFIG.schoolIds.map((schoolId) => [
    schoolId,
    teacherData.targets.filter((target) => target.schoolId === schoolId),
  ]));
  for (const schoolId of CONFIG.schoolIds) {
    const actual = targetsBySchool[schoolId].length;
    const expected = CONFIG.expectedTargetCountBySchool[schoolId];
    if (actual !== expected) errors.push(`${schoolId}: expected ${expected} unique Math/Science teachers, found ${actual}.`);
  }
  if (teacherData.targets.length !== 10) errors.push(`Expected 10 total unique Math/Science teachers, found ${teacherData.targets.length}.`);
  if (teacherData.targets.length === 0) errors.push("No active Math/Science teacher assignments were found.");
  if (changePlan.writesOutsideIncludedSchools.length > 0) errors.push("Planned writes outside included boys schools.");
  if (changePlan.writesTouchingGirls.length > 0) errors.push("Planned writes touching mrb-girls.");
  if (changePlan.writesTouchingKindergarten.length > 0) errors.push("Planned writes touching kindergarten.");
  if (changePlan.writesOutsideAllowedPlans.length > 0) errors.push("Planned writes outside the four allowed plans.");
  if (changePlan.writesWithoutEvidence.length > 0) errors.push("Planned writes without active Math/Science teacher-assignment evidence.");
  if (changePlan.conflicts.length > 0) errors.push(`${changePlan.conflicts.length} assignment conflict(s) must be resolved before apply.`);

  return {
    mode: APPLY ? "APPLY" : "PREVIEW",
    evaluator: evaluatorInspection,
    scope: {
      orgId: CONFIG.orgId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      includedSchools: CONFIG.schoolIds,
      excludedSchoolsConfirmed: ["mrb-girls", "kindergarten schools", "all other schools"],
      subjectKeys: CONFIG.subjectKeys,
    },
    detectedTargetTeachersBySchool: targetsBySchool,
    ignoredInactiveTeacherAssignments: teacherData.ignoredInactive,
    sourceWarnings: teacherData.warnings,
    plansFound: planEntries.map((entry) => ({
      schoolId: entry.schoolId,
      planId: entry.planId,
      planKey: entry.plan.key,
      exists: entry.planSnapshot.exists,
      cyclesFound: entry.cycles.map((cycle) => cycle.id),
      errors: entry.errors,
    })),
    targetAssignmentsToCreate: changePlan.plannedTargetAssignments.map((document) => ({ id: document.id, path: document.path, schoolId: document.data.schoolId, planId: document.data.planId, targetPersonId: document.data.targetPersonId })),
    evaluatorAssignmentsToCreate: changePlan.plannedEvaluatorAssignments.map((document) => ({ id: document.id, path: document.path, schoolId: document.data.schoolId, planId: document.data.planId, cycleId: document.data.cycleId, targetPersonId: document.data.targetPersonId })),
    alreadyExistingTargetAssignments: changePlan.existingTargetAssignments,
    alreadyExistingEvaluatorAssignments: changePlan.existingEvaluatorAssignments,
    conflicts: changePlan.conflicts,
    safety: {
      plannedWritesOutsideIncludedSchools: changePlan.writesOutsideIncludedSchools.length,
      plannedWritesTouchingMrbGirls: changePlan.writesTouchingGirls.length,
      plannedWritesTouchingKindergarten: changePlan.writesTouchingKindergarten.length,
      plannedWritesOutsideAllowedPlans: changePlan.writesOutsideAllowedPlans.length,
      plannedWritesWithoutActiveMathScienceEvidence: changePlan.writesWithoutEvidence.length,
    },
    expectedWhenAllAssignmentsAreMissing: {
      targetAssignments: 20,
      evaluatorAssignments: 60,
    },
    counts: {
      targetAssignmentsToCreate: changePlan.plannedTargetAssignments.length,
      evaluatorAssignmentsToCreate: changePlan.plannedEvaluatorAssignments.length,
      alreadyExistingTargetAssignments: changePlan.existingTargetAssignments.length,
      alreadyExistingEvaluatorAssignments: changePlan.existingEvaluatorAssignments.length,
      conflicts: changePlan.conflicts.length,
      plannedWritesByType: countBy(changePlan.plannedWrites, "type"),
    },
    validationErrors: errors,
    decision: errors.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
  };
}

async function applyMissingDocuments(db, documents) {
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) {
      batch.create(db.doc(document.path), {
        ...document.data,
        createdAt: now,
        updatedAt: now,
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    }
    await batch.commit();
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [evaluatorInspection, teacherData, planEntries] = await Promise.all([
    inspectEvaluator(db, orgRoot),
    loadTargetTeachers(db, orgRoot),
    loadPlanData(db, orgRoot),
  ]);
  const changePlan = await buildChangePlan(db, orgRoot, teacherData.targets, planEntries);
  const report = buildReport(evaluatorInspection, teacherData, planEntries, changePlan);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(report, { depth: null, colors: process.stdout.isTTY });
  if (report.decision !== "SAFE TO APPLY") {
    console.log("NOT APPLIED: resolve the reported validation errors or conflicts first.");
    process.exitCode = 1;
    return;
  }
  if (!APPLY) {
    console.log("No Firestore writes performed. Re-run with --apply only after reviewing this report.");
    return;
  }

  await applyMissingDocuments(db, changePlan.plannedWrites);
  console.dir({
    decision: "APPLIED",
    createdTargetAssignments: changePlan.plannedTargetAssignments.length,
    createdEvaluatorAssignments: changePlan.plannedEvaluatorAssignments.length,
    skippedAlreadyExisting: changePlan.existingTargetAssignments.length + changePlan.existingEvaluatorAssignments.length,
    conflicts: 0,
  }, { depth: null, colors: process.stdout.isTTY });
}

main().catch((error) => {
  console.error("Math & Science supervisor evaluation assignment seed failed:");
  console.error(error);
  process.exitCode = 1;
});
