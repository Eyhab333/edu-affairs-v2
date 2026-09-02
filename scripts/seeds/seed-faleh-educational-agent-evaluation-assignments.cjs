/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  sourceSchoolId: "mrb-boys-sayh",
  targetSchoolId: "mrb-boys-faleh",
  sourceEvaluatorEmail: "m.alateeq@qz.org.sa",
  targetEvaluatorEmail: "educational-agent-faleh@qz.org.sa",
  teacherRoleKey: "BOYS_TEACHER",
  plans: [
    {
      key: "diagnostic",
      slug: "educational-vice-principal-diagnostic-teacher-evaluation",
      frameworkId: "educational-vice-principal-diagnostic-teacher-evaluation-v1",
      shortTitle: "التقييم التشخيصي للمعلمين بواسطة الوكيل التعليمي",
      sourceTitle: "التقييم التشخيصي للمعلمين بواسطة الوكيل التعليمي - منار الريادة بنين السيح - الفصل الأول",
      targetTitle: "التقييم التشخيصي للمعلمين بواسطة الوكيل التعليمي - منار الريادة بنين الفالح - الفصل الأول",
    },
    {
      key: "weekly",
      slug: "educational-vice-principal-weekly-teacher-evaluation",
      frameworkId: "educational-vice-principal-weekly-teacher-evaluation-v1",
      shortTitle: "تقييم الوكيل التعليمي الأسبوعي للمعلمين",
      sourceTitle: "تقييم الوكيل التعليمي الأسبوعي للمعلمين - منار الريادة بنين السيح - الفصل الأول",
      targetTitle: "تقييم الوكيل التعليمي الأسبوعي للمعلمين - منار الريادة بنين الفالح - الفصل الأول",
    },
  ],
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

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

async function getAllInChunks(db, references) {
  const documents = [];
  for (const group of chunk(references, 400)) documents.push(...await db.getAll(...group));
  return documents;
}

async function resolveEvaluatorByEmail(db, orgRoot, email, label) {
  const users = await db.collection("users").where("email", "==", email).limit(2).get();
  const errors = [];
  if (users.empty) {
    return { label, email, errors: [`No users document found for ${email}.`], resolved: null };
  }
  if (users.size !== 1) {
    return { label, email, errors: [`Expected exactly one users document for ${email}, found ${users.size}.`], resolved: null };
  }

  const user = users.docs[0];
  const userData = user.data();
  const personId = asString(userData.personId);
  if (!personId) {
    return { label, email, errors: [`users/${user.id} has no personId.`], resolved: null };
  }
  const [person, membership] = await Promise.all([
    db.doc(`${orgRoot}/people/${personId}`).get(),
    db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`).get(),
  ]);
  if (normalizeEmail(userData.email) !== email) errors.push(`Resolved user email mismatch for ${email}.`);
  if (!person.exists) errors.push(`People document missing: ${orgRoot}/people/${personId}.`);
  if (!membership.exists) errors.push(`Org membership missing: users/${user.id}/orgMemberships/${CONFIG.orgId}.`);
  const membershipData = membership.exists ? membership.data() : {};
  if (membership.exists && asString(membershipData.personId) !== personId) errors.push(`Membership personId mismatch for ${email}.`);
  if (membership.exists && !isActive(membershipData)) errors.push(`Membership is inactive for ${email}.`);

  return {
    label,
    email,
    errors,
    resolved: {
      uid: user.id,
      personId,
      displayName: asString(person.data()?.displayName || userData.displayName) || null,
      email,
      roleKey: asString(membershipData.roleKey || membershipData.role).toUpperCase() || null,
      membershipSchoolIds: membershipData.scopes?.schoolIds || [],
      membershipCoversTargetSchool: membership.exists && membershipCoversSchool(membershipData, CONFIG.targetSchoolId),
    },
  };
}

async function loadPlanEntry(db, orgRoot, schoolId, plan, title) {
  const planId = planIdFor(schoolId, plan);
  const planSnapshot = await db.doc(`${orgRoot}/evaluationPlans/${planId}`).get();
  const errors = [];
  if (!planSnapshot.exists) {
    errors.push("plan is missing");
    return { schoolId, plan, planId, title, planSnapshot, cycles: [], targetAssignments: [], evaluatorAssignments: [], errors };
  }

  const planData = planSnapshot.data();
  if (asString(planData.schoolId) !== schoolId) errors.push("schoolId mismatch");
  if (asString(planData.academicYearId) !== CONFIG.academicYearId) errors.push("academicYearId mismatch");
  if (asString(planData.termId) !== CONFIG.termId) errors.push("termId mismatch");
  if (asString(planData.title) !== title) errors.push(`title mismatch; expected ${title}`);
  if (asString(planData.targetKind).toUpperCase() !== "TEACHER") errors.push("targetKind must be TEACHER");
  if (asString(planData.frameworkId) !== plan.frameworkId) errors.push(`frameworkId must be ${plan.frameworkId}`);
  if (asString(planData.frameworkId).includes("educational-supervisor")) errors.push("educational-supervisor framework is not allowed");

  const [cycles, targetAssignments, evaluatorAssignments] = await Promise.all([
    db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
  ]);
  const scoped = (documents) => documents.filter((document) => {
    const data = document.data();
    return asString(data.schoolId) === schoolId &&
      asString(data.academicYearId) === CONFIG.academicYearId &&
      asString(data.termId) === CONFIG.termId;
  });
  const scopedCycles = scoped(cycles.docs);
  if (scopedCycles.length === 0) errors.push("no scoped cycles found");

  return {
    schoolId,
    plan,
    planId,
    title,
    planSnapshot,
    cycles: scopedCycles,
    targetAssignments: scoped(targetAssignments.docs),
    evaluatorAssignments: scoped(evaluatorAssignments.docs),
    errors,
  };
}

function cycleSuffixes(planEntry) {
  const prefix = `${planEntry.planId}-`;
  return planEntry.cycles.map((document) => document.id.startsWith(prefix) ? document.id.slice(prefix.length) : document.id).sort();
}

function sourcePattern(planEntry, sourcePersonId) {
  const assignments = planEntry.evaluatorAssignments.filter((document) => (
    isActive(document.data()) && asString(document.data().evaluatorPersonId) === sourcePersonId
  ));
  const values = (field) => [...new Set(assignments.map((document) => document.data()[field]).filter((value) => value !== undefined && value !== null))];
  const roleKeys = values("evaluatorRoleKey");
  const weights = values("weight");
  const sourceTypes = values("sourceType");
  const targetRoleKeys = values("targetRoleKey");
  const targetRoleLabels = values("targetRoleLabel");
  const errors = [];
  if (assignments.length === 0) errors.push("no ACTIVE source evaluator assignments found");
  if (roleKeys.length !== 1) errors.push("source evaluatorRoleKey is not consistent");
  if (weights.length !== 1) errors.push("source evaluator weight is not consistent");
  if (sourceTypes.length > 1) errors.push("source evaluator sourceType is not consistent");
  if (targetRoleKeys.length > 1) errors.push("source targetRoleKey is not consistent");
  if (targetRoleLabels.length > 1) errors.push("source targetRoleLabel is not consistent");
  return {
    assignments,
    pattern: assignments.length > 0 ? {
      evaluatorRoleKey: asString(roleKeys[0]),
      weight: weights[0],
      sourceType: asString(sourceTypes[0]) || "MANUAL",
      targetRoleKey: asString(targetRoleKeys[0]) || CONFIG.teacherRoleKey,
      targetRoleLabel: asString(targetRoleLabels[0]) || "معلم",
    } : null,
    errors,
  };
}

async function loadFalehTeachers(db, orgRoot) {
  const assignments = await db.collection(`${orgRoot}/teacherAssignments`).where("schoolId", "==", CONFIG.targetSchoolId).get();
  const active = assignments.docs.filter((document) => {
    const data = document.data();
    return isActiveTeacherAssignment(data) &&
      asString(data.academicYearId) === CONFIG.academicYearId &&
      asString(data.termId) === CONFIG.termId &&
      asString(data.teacherPersonId);
  });
  const personIds = [...new Set(active.map((document) => asString(document.data().teacherPersonId)))];
  const people = await getAllInChunks(db, personIds.map((personId) => db.doc(`${orgRoot}/people/${personId}`)));
  const peopleById = new Map(people.filter((document) => document.exists).map((document) => [document.id, document.data()]));
  const offerings = [...new Set(active.map((document) => asString(document.data().classSubjectOfferingId)).filter(Boolean))];
  const offeringSnapshots = await getAllInChunks(db, offerings.map((offeringId) => db.doc(`${orgRoot}/classSubjectOfferings/${offeringId}`)));
  const offeringById = new Map(offeringSnapshots.map((document) => [document.id, document]));
  const errors = [];
  const warnings = [];
  const teachers = personIds.map((personId) => {
    const person = peopleById.get(personId);
    const sourceAssignments = active.filter((document) => asString(document.data().teacherPersonId) === personId);
    if (!person) errors.push(`Faleh teacher person document is missing: ${orgRoot}/people/${personId}`);
    const evidence = sourceAssignments.map((document) => {
      const data = document.data();
      const offeringId = asString(data.classSubjectOfferingId);
      const offering = offeringById.get(offeringId);
      if (offeringId && !offering?.exists) warnings.push(`classSubjectOffering missing: ${orgRoot}/classSubjectOfferings/${offeringId}`);
      return {
        teacherAssignmentId: document.id,
        path: document.ref.path,
        classId: asString(data.classId) || null,
        subjectKey: asString(data.subjectKey) || null,
        classSubjectOfferingId: offeringId || null,
        classSubjectOfferingExists: offeringId ? Boolean(offering?.exists) : null,
      };
    });
    return {
      schoolId: CONFIG.targetSchoolId,
      personId,
      displayName: asString(person?.displayName) || null,
      email: asString(person?.email || sourceAssignments[0]?.data().teacherEmail) || null,
      evidence,
    };
  });
  return { teachers, errors, warnings };
}

function targetAssignmentDocument(orgRoot, teacher, planEntry, pattern) {
  const id = `${planEntry.planId}-target-${teacher.personId}`;
  return {
    type: "targetAssignment",
    path: `${orgRoot}/evaluationTargetAssignments/${id}`,
    data: {
      id,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.targetSchoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: planEntry.planId,
      targetPersonId: teacher.personId,
      targetEmail: teacher.email || "",
      targetDisplayName: teacher.displayName || teacher.personId,
      targetRoleKey: pattern.targetRoleKey,
      targetRoleLabel: pattern.targetRoleLabel,
      targetKind: "TEACHER",
      status: "ACTIVE",
    },
  };
}

function evaluatorAssignmentDocument(orgRoot, teacher, planEntry, cycle, evaluator, pattern) {
  const id = `${cycle.id}-${teacher.personId}-${evaluator.personId}`;
  return {
    type: "evaluatorAssignment",
    path: `${orgRoot}/evaluationEvaluatorAssignments/${id}`,
    data: {
      id,
      orgId: CONFIG.orgId,
      schoolId: CONFIG.targetSchoolId,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      planId: planEntry.planId,
      cycleId: cycle.id,
      targetPersonId: teacher.personId,
      targetRoleKey: pattern.targetRoleKey,
      targetRoleLabel: pattern.targetRoleLabel,
      evaluatorPersonId: evaluator.personId,
      evaluatorEmail: evaluator.email,
      evaluatorRoleKey: pattern.evaluatorRoleKey,
      weight: pattern.weight,
      sourceType: pattern.sourceType,
      status: "ACTIVE",
    },
  };
}

function targetScopeMatches(current, desired) {
  return ["orgId", "schoolId", "academicYearId", "termId", "planId", "targetPersonId", "targetKind"].every((field) => current[field] === desired[field]);
}

function evaluatorScopeMatches(current, desired) {
  return ["orgId", "schoolId", "academicYearId", "termId", "planId", "cycleId", "targetPersonId", "evaluatorPersonId", "evaluatorEmail", "evaluatorRoleKey", "weight", "sourceType"].every((field) => current[field] === desired[field]);
}

async function buildChangePlan(db, orgRoot, teachers, sourceEntries, targetEntries, targetEvaluator) {
  const targetDocuments = [];
  const evaluatorDocuments = [];
  const sourceByKey = new Map(sourceEntries.map((entry) => [entry.plan.key, entry]));
  for (const targetEntry of targetEntries) {
    const source = sourceByKey.get(targetEntry.plan.key);
    if (source.errors.length > 0 || targetEntry.errors.length > 0) continue;
    const patternResult = sourcePattern(source, source.sourceEvaluatorPersonId);
    if (patternResult.errors.length > 0) continue;
    for (const teacher of teachers) {
      targetDocuments.push(targetAssignmentDocument(orgRoot, teacher, targetEntry, patternResult.pattern));
      for (const cycle of targetEntry.cycles) evaluatorDocuments.push(evaluatorAssignmentDocument(orgRoot, teacher, targetEntry, cycle, targetEvaluator, patternResult.pattern));
    }
  }
  const snapshots = await getAllInChunks(db, [...targetDocuments, ...evaluatorDocuments].map((document) => db.doc(document.path)));
  const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
  const plannedTargetAssignments = [];
  const plannedEvaluatorAssignments = [];
  const existingTargetAssignments = [];
  const existingEvaluatorAssignments = [];
  const conflicts = [];

  for (const document of targetDocuments) {
    const snapshot = snapshotByPath.get(document.path);
    if (!snapshot.exists) plannedTargetAssignments.push(document);
    else if (isActive(snapshot.data()) && targetScopeMatches(snapshot.data(), document.data)) existingTargetAssignments.push({ path: document.path, id: document.data.id });
    else conflicts.push({ type: document.type, path: document.path, reason: "existing target assignment is not ACTIVE or conflicts with the Faleh target scope" });
  }
  for (const document of evaluatorDocuments) {
    const snapshot = snapshotByPath.get(document.path);
    const targetEntry = targetEntries.find((entry) => entry.planId === document.data.planId);
    const activeOtherEvaluator = targetEntry.evaluatorAssignments.find((assignment) => {
      const data = assignment.data();
      return isActive(data) && asString(data.targetPersonId) === document.data.targetPersonId && asString(data.cycleId) === document.data.cycleId && asString(data.evaluatorPersonId) !== targetEvaluator.personId;
    });
    if (activeOtherEvaluator) {
      conflicts.push({ type: document.type, path: document.path, reason: "another ACTIVE evaluator assignment exists for the same Faleh teacher/plan/cycle", existingAssignmentId: activeOtherEvaluator.id, existingEvaluatorPersonId: asString(activeOtherEvaluator.data().evaluatorPersonId) });
    } else if (!snapshot.exists) {
      plannedEvaluatorAssignments.push(document);
    } else if (isActive(snapshot.data()) && evaluatorScopeMatches(snapshot.data(), document.data)) {
      existingEvaluatorAssignments.push({ path: document.path, id: document.data.id });
    } else {
      conflicts.push({ type: document.type, path: document.path, reason: "existing evaluator assignment is not ACTIVE or conflicts with the source educational-agent pattern" });
    }
  }

  const plannedWrites = [...plannedTargetAssignments, ...plannedEvaluatorAssignments];
  const allowedPlanIds = new Set(targetEntries.map((entry) => entry.planId));
  const outsideFaleh = plannedWrites.filter((document) => document.data.schoolId !== CONFIG.targetSchoolId);
  const touchingSayh = plannedWrites.filter((document) => document.data.schoolId === CONFIG.sourceSchoolId);
  const touchingGirls = plannedWrites.filter((document) => document.data.schoolId === "mrb-girls");
  const touchingKindergarten = plannedWrites.filter((document) => /kindergarten|kg/i.test(document.data.schoolId));
  const nonTargetPlans = plannedWrites.filter((document) => !allowedPlanIds.has(document.data.planId));
  const educationalSupervisorPlans = plannedWrites.filter((document) => document.data.planId.includes("educational-supervisor"));
  const disallowedAdminPlans = plannedWrites.filter((document) => !allowedPlanIds.has(document.data.planId) && /(vice-principal|principal|admin)/.test(document.data.planId));
  const teacherIds = new Set(teachers.map((teacher) => teacher.personId));
  const nonFalehTeacherTargets = plannedWrites.filter((document) => !teacherIds.has(document.data.targetPersonId));

  return {
    plannedTargetAssignments,
    plannedEvaluatorAssignments,
    existingTargetAssignments,
    existingEvaluatorAssignments,
    conflicts,
    plannedWrites,
    outsideFaleh,
    touchingSayh,
    touchingGirls,
    touchingKindergarten,
    nonTargetPlans,
    educationalSupervisorPlans,
    disallowedAdminPlans,
    nonFalehTeacherTargets,
  };
}

function buildReport(sourceEvaluator, targetEvaluator, sourceEntries, targetEntries, teacherData, sourcePatterns, changePlan) {
  const errors = [
    ...sourceEvaluator.errors,
    ...targetEvaluator.errors,
    ...teacherData.errors,
    ...sourceEntries.flatMap((entry) => entry.errors.map((error) => `Source ${entry.planId}: ${error}`)),
    ...targetEntries.flatMap((entry) => entry.errors.map((error) => `Target ${entry.planId}: ${error}`)),
    ...sourcePatterns.flatMap((item) => item.errors.map((error) => `Source pattern ${item.planId}: ${error}`)),
  ];
  if (!targetEvaluator.resolved?.membershipCoversTargetSchool) errors.push(`Target evaluator does not have access to ${CONFIG.targetSchoolId}.`);
  if (sourcePatterns.reduce((count, item) => count + item.assignments.length, 0) === 0) errors.push("No source pattern assignments were found for Mohammad Alateeq.");
  if (changePlan.conflicts.length > 0) errors.push(`${changePlan.conflicts.length} conflict(s) must be resolved before apply.`);
  const safetyCounts = {
    plannedWritesOutsideMrbBoysFaleh: changePlan.outsideFaleh.length,
    plannedWritesTouchingMrbBoysSayh: changePlan.touchingSayh.length,
    plannedWritesTouchingMrbGirls: changePlan.touchingGirls.length,
    plannedWritesTouchingKindergarten: changePlan.touchingKindergarten.length,
    plannedWritesOutsideTargetPlans: changePlan.nonTargetPlans.length,
    plannedWritesTouchingEducationalSupervisorPlans: changePlan.educationalSupervisorPlans.length,
    plannedWritesTouchingDisallowedVicePrincipalPrincipalAdminPlans: changePlan.disallowedAdminPlans.length,
    plannedWritesTargetingNonFalehTeachers: changePlan.nonFalehTeacherTargets.length,
  };
  if (Object.values(safetyCounts).some((count) => count > 0)) errors.push("One or more planned writes violate the Faleh-only safety boundary.");

  return {
    mode: APPLY ? "APPLY" : "PREVIEW",
    sourceEvaluator: sourceEvaluator.resolved || { email: CONFIG.sourceEvaluatorEmail },
    targetEvaluator: targetEvaluator.resolved || { email: CONFIG.targetEvaluatorEmail },
    sourceSchoolId: CONFIG.sourceSchoolId,
    targetSchoolId: CONFIG.targetSchoolId,
    sourceSayhEducationalAgentPlans: sourceEntries.map((entry) => ({ planId: entry.planId, title: entry.title, cycles: entry.cycles.map((cycle) => cycle.id), errors: entry.errors })),
    mappedFalehEducationalAgentPlans: targetEntries.map((entry) => ({ planId: entry.planId, title: entry.title, cycles: entry.cycles.map((cycle) => cycle.id), errors: entry.errors })),
    sourcePatternAssignments: sourcePatterns.map((item) => ({ planId: item.planId, activeAssignments: item.assignments.length, pattern: item.pattern, errors: item.errors })),
    falehTeachers: teacherData.teachers,
    sourceWarnings: teacherData.warnings,
    targetAssignmentsToCreate: changePlan.plannedTargetAssignments.map((document) => ({ id: document.data.id, planId: document.data.planId, targetPersonId: document.data.targetPersonId })),
    evaluatorAssignmentsToCreate: changePlan.plannedEvaluatorAssignments.map((document) => ({ id: document.data.id, planId: document.data.planId, cycleId: document.data.cycleId, targetPersonId: document.data.targetPersonId })),
    alreadyExistingTargetAssignments: changePlan.existingTargetAssignments,
    alreadyExistingEvaluatorAssignments: changePlan.existingEvaluatorAssignments,
    conflicts: changePlan.conflicts,
    safety: safetyCounts,
    counts: {
      targetAssignmentsToCreate: changePlan.plannedTargetAssignments.length,
      evaluatorAssignmentsToCreate: changePlan.plannedEvaluatorAssignments.length,
      alreadyExistingTargetAssignments: changePlan.existingTargetAssignments.length,
      alreadyExistingEvaluatorAssignments: changePlan.existingEvaluatorAssignments.length,
      conflicts: changePlan.conflicts.length,
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
  const [sourceEvaluator, targetEvaluator, teacherData] = await Promise.all([
    resolveEvaluatorByEmail(db, orgRoot, CONFIG.sourceEvaluatorEmail, "source evaluator"),
    resolveEvaluatorByEmail(db, orgRoot, CONFIG.targetEvaluatorEmail, "target evaluator"),
    loadFalehTeachers(db, orgRoot),
  ]);
  const sourceEntries = await Promise.all(CONFIG.plans.map(async (plan) => {
    const entry = await loadPlanEntry(db, orgRoot, CONFIG.sourceSchoolId, plan, plan.sourceTitle);
    entry.sourceEvaluatorPersonId = sourceEvaluator.resolved?.personId || "";
    return entry;
  }));
  const targetEntries = await Promise.all(CONFIG.plans.map((plan) => loadPlanEntry(db, orgRoot, CONFIG.targetSchoolId, plan, plan.targetTitle)));
  const sourcePatterns = sourceEntries.map((entry) => ({ planId: entry.planId, ...sourcePattern(entry, entry.sourceEvaluatorPersonId) }));
  const allowedSourcePlanIds = new Set(sourceEntries.map((entry) => entry.planId));
  const sourceOutsidePlans = sourceEvaluator.resolved ? await db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("evaluatorPersonId", "==", sourceEvaluator.resolved.personId).get() : { docs: [] };
  const activeSourceOutsidePlans = sourceOutsidePlans.docs.filter((document) => {
    const data = document.data();
    return isActive(data) && (
      !allowedSourcePlanIds.has(asString(data.planId)) ||
      asString(data.schoolId) !== CONFIG.sourceSchoolId ||
      asString(data.academicYearId) !== CONFIG.academicYearId ||
      asString(data.termId) !== CONFIG.termId
    );
  });
  if (activeSourceOutsidePlans.length > 0) sourceEvaluator.errors.push(`Source evaluator has ${activeSourceOutsidePlans.length} ACTIVE evaluator assignment(s) outside the two allowed Sayh plans.`);
  const sourceRoleKeys = [...new Set(sourcePatterns.map((item) => item.pattern?.evaluatorRoleKey).filter(Boolean))];
  if (sourceRoleKeys.length === 1 && targetEvaluator.resolved?.roleKey !== sourceRoleKeys[0]) {
    targetEvaluator.errors.push(`Target evaluator membership roleKey ${targetEvaluator.resolved.roleKey || "(missing)"} does not match source pattern ${sourceRoleKeys[0]}.`);
  }
  const sourceCycleMismatch = sourceEntries.flatMap((source) => {
    const target = targetEntries.find((entry) => entry.plan.key === source.plan.key);
    return JSON.stringify(cycleSuffixes(source)) === JSON.stringify(cycleSuffixes(target)) ? [] : [`Cycle pattern mismatch between ${source.planId} and ${target.planId}.`];
  });
  sourceCycleMismatch.forEach((message) => sourceEvaluator.errors.push(message));
  const changePlan = await buildChangePlan(db, orgRoot, teacherData.teachers, sourceEntries, targetEntries, targetEvaluator.resolved || {});
  const report = buildReport(sourceEvaluator, targetEvaluator, sourceEntries, targetEntries, teacherData, sourcePatterns, changePlan);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(report, { depth: null, colors: process.stdout.isTTY });
  if (report.decision !== "SAFE TO APPLY") {
    console.log("NOT APPLIED: resolve the validation errors or conflicts first.");
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
  console.error("Faleh educational-agent evaluation assignment seed failed:");
  console.error(error);
  process.exitCode = 1;
});
