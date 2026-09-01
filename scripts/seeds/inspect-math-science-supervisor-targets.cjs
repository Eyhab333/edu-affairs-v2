/* eslint-disable no-console */

// Read-only inspection. This script intentionally contains no Firestore writes.

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  subjectKeys: ["MATH", "SCIENCE"],
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
      expectedPlanKind: "VISIT_BASED",
      expectedFrameworkId: "educational-supervisor-diagnostic-teacher-evaluation-v1",
    },
    {
      key: "periodic",
      slug: "educational-supervisor-periodic-teacher-evaluation",
      expectedPlanKind: "PERIODIC",
      expectedFrameworkId: "educational-supervisor-periodic-teacher-evaluation-v1",
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

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function planIdFor(schoolId, plan) {
  return [
    schoolId,
    CONFIG.academicYearId,
    CONFIG.termId,
    plan.slug,
  ].join("-");
}

function mapCounts(values) {
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function timestampValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return value;
}

async function getAllInChunks(db, references, chunkSize = 400) {
  const snapshots = [];

  for (let index = 0; index < references.length; index += chunkSize) {
    const chunk = references.slice(index, index + chunkSize);
    snapshots.push(...await db.getAll(...chunk));
  }

  return snapshots;
}

async function inspectEvaluator(db, orgRoot) {
  const evaluator = CONFIG.evaluator;
  const [userSnapshot, personSnapshot, membershipSnapshot, orgMembershipSnapshot] = await Promise.all([
    db.doc(`users/${evaluator.uid}`).get(),
    db.doc(`${orgRoot}/people/${evaluator.personId}`).get(),
    db.doc(`users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`).get(),
    db.doc(`${orgRoot}/memberships/${evaluator.uid}`).get(),
  ]);

  let authUser = null;
  let authLookupError = null;
  try {
    authUser = await admin.auth().getUser(evaluator.uid);
  } catch (error) {
    authLookupError = error.message;
  }

  const user = userSnapshot.exists ? userSnapshot.data() : {};
  const person = personSnapshot.exists ? personSnapshot.data() : {};
  const membership = membershipSnapshot.exists ? membershipSnapshot.data() : {};
  const orgMembership = orgMembershipSnapshot.exists ? orgMembershipSnapshot.data() : {};
  const membershipSchoolAccess = Object.fromEntries(
    CONFIG.schoolIds.map((schoolId) => [schoolId, membershipSnapshot.exists && membershipCoversSchool(membership, schoolId)]),
  );

  return {
    expected: evaluator,
    auth: {
      exists: Boolean(authUser),
      email: authUser?.email || null,
      uid: authUser?.uid || null,
      error: authLookupError,
    },
    firestoreUser: {
      exists: userSnapshot.exists,
      path: userSnapshot.ref.path,
      email: asString(user.email) || null,
      personId: asString(user.personId) || null,
      displayName: asString(user.displayName) || null,
    },
    person: {
      exists: personSnapshot.exists,
      path: personSnapshot.ref.path,
      email: asString(person.email) || null,
      personId: asString(person.personId || person.id) || personSnapshot.id,
      displayName: asString(person.displayName) || null,
    },
    orgMembership: {
      exists: membershipSnapshot.exists,
      path: membershipSnapshot.ref.path,
      personId: asString(membership.personId) || null,
      roleKey: asString(membership.roleKey || membership.role).toUpperCase() || null,
      active: membershipSnapshot.exists ? isActive(membership) : false,
      manageEvaluations: membership.permissions?.manageEvaluations === true,
      schoolAccess: membershipSchoolAccess,
      rawScopes: membership.scopes || null,
    },
    mirroredOrgMembership: {
      exists: orgMembershipSnapshot.exists,
      path: orgMembershipSnapshot.ref.path,
      personId: asString(orgMembership.personId) || null,
      roleKey: asString(orgMembership.roleKey || orgMembership.role).toUpperCase() || null,
    },
    verification: {
      uidMatches: authUser?.uid === evaluator.uid,
      authEmailMatches: normalizeEmail(authUser?.email) === evaluator.email,
      firestoreEmailMatches: [user.email, person.email].some((email) => normalizeEmail(email) === evaluator.email),
      personIdMatches: asString(membership.personId) === evaluator.personId,
      roleKeyMatches: asString(membership.roleKey || membership.role).toUpperCase() === evaluator.roleKey,
      hasBothSchoolScopes: Object.values(membershipSchoolAccess).every(Boolean),
    },
  };
}

async function loadSubjectTeacherAssignments(db, orgRoot) {
  const collection = db.collection(`${orgRoot}/teacherAssignments`);
  const snapshots = await Promise.all(
    CONFIG.schoolIds.map((schoolId) => collection.where("schoolId", "==", schoolId).get()),
  );
  const eligibleAssignments = [];
  const ignoredAssignments = [];

  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      const data = document.data();
      const subjectKey = asString(data.subjectKey).toUpperCase();
      const withinTerm =
        asString(data.academicYearId) === CONFIG.academicYearId &&
        asString(data.termId) === CONFIG.termId;
      const inRequestedSubject = CONFIG.subjectKeys.includes(subjectKey);

      if (withinTerm && inRequestedSubject && isActive(data)) {
        eligibleAssignments.push(document);
      } else if (withinTerm && inRequestedSubject) {
        ignoredAssignments.push({
          path: document.ref.path,
          assignmentId: document.id,
          schoolId: asString(data.schoolId),
          teacherPersonId: asString(data.teacherPersonId),
          subjectKey,
          status: asString(data.status) || null,
          active: data.active !== false,
          reason: "inactive teacher assignment",
        });
      }
    }
  }

  return { eligibleAssignments, ignoredAssignments };
}

async function buildTeacherTargets(db, orgRoot, assignments) {
  const assignmentEntries = assignments.map((document) => {
    const data = document.data();
    return {
      document,
      schoolId: asString(data.schoolId),
      teacherPersonId: asString(data.teacherPersonId),
      teacherEmail: asString(data.teacherEmail),
      subjectKey: asString(data.subjectKey).toUpperCase(),
      classSubjectOfferingId: asString(data.classSubjectOfferingId),
      classId: asString(data.classId),
      gradeId: asString(data.gradeId),
      streamId: asString(data.streamId),
    };
  }).filter((entry) => entry.schoolId && entry.teacherPersonId);

  const personIds = [...new Set(assignmentEntries.map((entry) => entry.teacherPersonId))];
  const offeringIds = [...new Set(assignmentEntries.map((entry) => entry.classSubjectOfferingId).filter(Boolean))];
  const [people, offerings] = await Promise.all([
    getAllInChunks(db, personIds.map((personId) => db.doc(`${orgRoot}/people/${personId}`))),
    getAllInChunks(db, offeringIds.map((offeringId) => db.doc(`${orgRoot}/classSubjectOfferings/${offeringId}`))),
  ]);
  const peopleById = new Map(people.filter((document) => document.exists).map((document) => [document.id, document.data()]));
  const offeringsById = new Map(offerings.filter((document) => document.exists).map((document) => [document.id, document]));
  const targets = new Map();

  for (const entry of assignmentEntries) {
    const key = `${entry.schoolId}|${entry.teacherPersonId}`;
    if (!targets.has(key)) {
      const person = peopleById.get(entry.teacherPersonId) || {};
      targets.set(key, {
        schoolId: entry.schoolId,
        teacherPersonId: entry.teacherPersonId,
        teacherDisplayName: asString(person.displayName) || null,
        teacherEmail: asString(person.email) || entry.teacherEmail || null,
        subjectKeys: new Set(),
        sourceDocuments: [],
      });
    }

    const target = targets.get(key);
    const offering = offeringsById.get(entry.classSubjectOfferingId);
    target.subjectKeys.add(entry.subjectKey);
    target.sourceDocuments.push({
      teacherAssignment: {
        path: entry.document.ref.path,
        assignmentId: entry.document.id,
        subjectKey: entry.subjectKey,
        classSubjectOfferingId: entry.classSubjectOfferingId || null,
        classId: entry.classId || null,
        gradeId: entry.gradeId || null,
        streamId: entry.streamId || null,
      },
      classSubjectOffering: offering ? {
        path: offering.ref.path,
        exists: true,
        subjectKey: asString(offering.data().subjectKey).toUpperCase() || null,
      } : entry.classSubjectOfferingId ? {
        path: `${orgRoot}/classSubjectOfferings/${entry.classSubjectOfferingId}`,
        exists: false,
        subjectKey: null,
      } : null,
    });
  }

  return [...targets.values()]
    .map((target) => ({ ...target, subjectKeys: [...target.subjectKeys].sort() }))
    .sort((left, right) => (
      left.schoolId.localeCompare(right.schoolId) ||
      (left.teacherDisplayName || left.teacherPersonId).localeCompare(right.teacherDisplayName || right.teacherPersonId)
    ));
}

async function loadEvaluationData(db, orgRoot) {
  const plans = [];

  for (const schoolId of CONFIG.schoolIds) {
    for (const planConfig of CONFIG.plans) {
      const planId = planIdFor(schoolId, planConfig);
      const document = await db.doc(`${orgRoot}/evaluationPlans/${planId}`).get();
      const data = document.exists ? document.data() : {};
      const scopeMatches = document.exists &&
        asString(data.schoolId) === schoolId &&
        asString(data.academicYearId) === CONFIG.academicYearId &&
        asString(data.termId) === CONFIG.termId;

      plans.push({
        schoolId,
        planConfig,
        planId,
        document,
        exists: document.exists,
        validShape: scopeMatches &&
          asString(data.targetKind).toUpperCase() === "TEACHER" &&
          asString(data.planKind).toUpperCase() === planConfig.expectedPlanKind &&
          asString(data.frameworkId) === planConfig.expectedFrameworkId,
        details: document.exists ? {
          title: asString(data.title) || null,
          schoolId: asString(data.schoolId) || null,
          academicYearId: asString(data.academicYearId) || null,
          termId: asString(data.termId) || null,
          frameworkId: asString(data.frameworkId) || null,
          frameworkKind: asString(data.frameworkKind) || null,
          planKind: asString(data.planKind) || null,
          targetKind: asString(data.targetKind) || null,
          status: asString(data.status) || null,
        } : null,
      });
    }
  }

  const loaded = await Promise.all(plans.map(async (plan) => {
    if (!plan.exists) return { ...plan, cycles: [], targetAssignments: [], evaluatorAssignments: [] };

    const [cycles, targetAssignments, evaluatorAssignments] = await Promise.all([
      db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", plan.planId).get(),
      db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", plan.planId).get(),
      db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", plan.planId).get(),
    ]);

    return {
      ...plan,
      cycles: cycles.docs.filter((document) => {
        const data = document.data();
        return asString(data.schoolId) === plan.schoolId &&
          asString(data.academicYearId) === CONFIG.academicYearId &&
          asString(data.termId) === CONFIG.termId;
      }),
      targetAssignments: targetAssignments.docs.filter((document) => {
        const data = document.data();
        return asString(data.schoolId) === plan.schoolId &&
          asString(data.academicYearId) === CONFIG.academicYearId &&
          asString(data.termId) === CONFIG.termId;
      }),
      evaluatorAssignments: evaluatorAssignments.docs.filter((document) => {
        const data = document.data();
        return asString(data.schoolId) === plan.schoolId &&
          asString(data.academicYearId) === CONFIG.academicYearId &&
          asString(data.termId) === CONFIG.termId;
      }),
    };
  }));

  return loaded;
}

function evaluationCoverageForTarget(target, plan) {
  const targetAssignment = plan.targetAssignments.find((document) => asString(document.data().targetPersonId) === target.teacherPersonId);
  const cycles = plan.cycles.map((document) => ({
    cycleId: document.id,
    title: asString(document.data().title) || null,
    status: asString(document.data().status) || null,
  }));
  const assignments = plan.evaluatorAssignments
    .filter((document) => asString(document.data().targetPersonId) === target.teacherPersonId)
    .map((document) => {
      const data = document.data();
      return {
        assignmentId: document.id,
        cycleId: asString(data.cycleId) || null,
        evaluatorPersonId: asString(data.evaluatorPersonId) || null,
        evaluatorRoleKey: asString(data.evaluatorRoleKey) || null,
        status: asString(data.status) || null,
        weight: data.weight ?? null,
        active: isActive(data),
      };
    })
    .sort((left, right) => (left.cycleId || "").localeCompare(right.cycleId || "") || (left.evaluatorPersonId || "").localeCompare(right.evaluatorPersonId || ""));
  const missingForMathScienceSupervisor = cycles
    .filter((cycle) => !assignments.some((assignment) => (
      assignment.cycleId === cycle.cycleId &&
      assignment.evaluatorPersonId === CONFIG.evaluator.personId &&
      assignment.active
    )))
    .map((cycle) => ({
      cycleId: cycle.cycleId,
      reason: targetAssignment ? "no active Math & Science supervisor evaluator assignment" : "target assignment is also missing",
    }));

  return {
    planId: plan.planId,
    planKey: plan.planConfig.key,
    planExists: plan.exists,
    planValidShape: plan.validShape,
    evaluationTargetAssignment: targetAssignment ? {
      exists: true,
      assignmentId: targetAssignment.id,
      status: asString(targetAssignment.data().status) || null,
    } : { exists: false, assignmentId: null, status: null },
    cycles,
    evaluatorAssignments: assignments,
    mathScienceSupervisorAlreadyAssigned: assignments.some((assignment) => assignment.evaluatorPersonId === CONFIG.evaluator.personId && assignment.active),
    missingMathScienceSupervisorCycles: missingForMathScienceSupervisor,
  };
}

function buildReport(evaluator, targets, plans, ignoredTeacherAssignments) {
  const targetsBySchool = Object.fromEntries(CONFIG.schoolIds.map((schoolId) => [schoolId, []]));
  const planBySchoolAndId = new Map(plans.map((plan) => [`${plan.schoolId}|${plan.planId}`, plan]));
  const evaluatorCounts = new Map();
  const schoolSummaries = [];

  for (const target of targets) {
    const evaluations = CONFIG.plans.map((planConfig) => {
      const plan = planBySchoolAndId.get(`${target.schoolId}|${planIdFor(target.schoolId, planConfig)}`);
      return evaluationCoverageForTarget(target, plan);
    });
    const reportTarget = { ...target, evaluations };
    targetsBySchool[target.schoolId].push(reportTarget);

    for (const evaluation of evaluations) {
      for (const assignment of evaluation.evaluatorAssignments) {
        increment(evaluatorCounts, assignment.evaluatorPersonId || "(missing evaluatorPersonId)");
      }
    }
  }

  for (const schoolId of CONFIG.schoolIds) {
    const schoolTargets = targetsBySchool[schoolId];
    const subjectCounts = Object.fromEntries(CONFIG.subjectKeys.map((subjectKey) => [
      subjectKey,
      schoolTargets.filter((target) => target.subjectKeys.includes(subjectKey)).length,
    ]));
    const coverage = schoolTargets.flatMap((target) => target.evaluations);
    const targetAssignmentCount = coverage.filter((item) => item.evaluationTargetAssignment.exists).length;
    const existingEvaluatorAssignments = coverage.flatMap((item) => item.evaluatorAssignments);
    const evaluatorAssignmentsByEvaluator = new Map();
    existingEvaluatorAssignments.forEach((assignment) => increment(evaluatorAssignmentsByEvaluator, assignment.evaluatorPersonId || "(missing evaluatorPersonId)"));
    const missing = schoolTargets.flatMap((target) => target.evaluations.flatMap((evaluation) => evaluation.missingMathScienceSupervisorCycles.map((item) => ({
      teacherPersonId: target.teacherPersonId,
      teacherDisplayName: target.teacherDisplayName,
      planId: evaluation.planId,
      ...item,
    }))));

    schoolSummaries.push({
      schoolId,
      mathTeachers: subjectCounts.MATH,
      scienceTeachers: subjectCounts.SCIENCE,
      uniqueTargetTeachers: schoolTargets.length,
      teachersTeachingBothMathAndScience: schoolTargets.filter((target) => target.subjectKeys.includes("MATH") && target.subjectKeys.includes("SCIENCE")).map((target) => ({
        teacherPersonId: target.teacherPersonId,
        teacherDisplayName: target.teacherDisplayName,
      })),
      existingTargetAssignmentsCount: targetAssignmentCount,
      existingEvaluatorAssignmentsCount: existingEvaluatorAssignments.length,
      existingEvaluatorAssignmentsByEvaluator: mapCounts(evaluatorAssignmentsByEvaluator),
      missingEvaluatorAssignmentsForMathScienceSupervisor: missing,
    });
  }

  return {
    mode: "READ_ONLY_INSPECTION",
    firestoreWritesPerformed: false,
    scope: {
      orgId: CONFIG.orgId,
      schoolIds: CONFIG.schoolIds,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      subjectKeys: CONFIG.subjectKeys,
      explicitlyExcluded: ["mrb-girls", "kindergarten schools", "all other schools"],
    },
    inspectedCollections: [
      "users",
      `users/{uid}/orgMemberships/${CONFIG.orgId}`,
      `${CONFIG.orgId}/people`,
      `${CONFIG.orgId}/memberships`,
      `${CONFIG.orgId}/teacherAssignments`,
      `${CONFIG.orgId}/classSubjectOfferings`,
      `${CONFIG.orgId}/evaluationPlans`,
      `${CONFIG.orgId}/evaluationCycles`,
      `${CONFIG.orgId}/evaluationTargetAssignments`,
      `${CONFIG.orgId}/evaluationEvaluatorAssignments`,
    ],
    evaluator,
    evaluationPlans: plans.map((plan) => ({
      schoolId: plan.schoolId,
      planId: plan.planId,
      planKey: plan.planConfig.key,
      exists: plan.exists,
      validExpectedShape: plan.validShape,
      ...plan.details,
      cycleCount: plan.cycles.length,
      cycles: plan.cycles.map((cycle) => ({
        cycleId: cycle.id,
        title: asString(cycle.data().title) || null,
        status: asString(cycle.data().status) || null,
        createdAt: timestampValue(cycle.data().createdAt),
      })),
    })),
    targetTeachersBySchool: targetsBySchool,
    summaryBySchool: schoolSummaries,
    ignoredInactiveTeacherAssignments: ignoredTeacherAssignments,
    totals: {
      uniqueTargetTeachers: targets.length,
      existingEvaluatorAssignmentsByEvaluator: mapCounts(evaluatorCounts),
      missingEvaluatorAssignmentsForMathScienceSupervisor: schoolSummaries.reduce((total, school) => total + school.missingEvaluatorAssignmentsForMathScienceSupervisor.length, 0),
    },
    safetyConfirmation: {
      includedSchoolIds: CONFIG.schoolIds,
      manarGirlsIncluded: false,
      kindergartenIncluded: false,
      firestoreWritesPerformed: false,
      note: "This script is inspection-only and has no create, update, delete, or batch commit operation.",
    },
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [evaluator, teacherAssignmentData, plans] = await Promise.all([
    inspectEvaluator(db, orgRoot),
    loadSubjectTeacherAssignments(db, orgRoot),
    loadEvaluationData(db, orgRoot),
  ]);
  const targets = await buildTeacherTargets(db, orgRoot, teacherAssignmentData.eligibleAssignments);
  const report = buildReport(evaluator, targets, plans, teacherAssignmentData.ignoredAssignments);

  console.log("Math & Science supervisor target inspection (read-only)");
  console.dir(report, { depth: null, colors: process.stdout.isTTY });
  console.log("Confirmed: no Firestore writes were performed.");
}

main().catch((error) => {
  console.error("Inspection failed:", error.message);
  process.exitCode = 1;
});
