/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

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
  },
  plans: [
    {
      kind: "weekly",
      frameworkId: "director-weekly-teacher-evaluation-v1",
      sourcePlanId:
        "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation",
      targetPlanId:
        "mrb-boys-faleh-ay-1448-term-1-director-weekly-teacher-evaluation",
    },
    {
      kind: "diagnostic",
      frameworkId: "director-diagnostic-teacher-evaluation-v1",
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

async function readDoc(db, documentPath) {
  const snapshot = await db.doc(documentPath).get();

  if (!snapshot.exists) return null;

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

function summarizeFramework(framework, sections, items) {
  return {
    exists: Boolean(framework),
    title: framework?.title,
    version: framework?.version,
    isActive: framework?.isActive,
    isLocked: framework?.isLocked,
    lockedAt: framework?.lockedAt,
    sectionsCount: sections.length,
    itemsCount: items.length,
    sectionWeightsTotal: sections.reduce(
      (total, section) => total + Number(section.weight || 0),
      0,
    ),
    maxScoreTotal: items.reduce(
      (total, item) => total + Number(item.maxScore || 0),
      0,
    ),
    itemsMissingOrder: items.filter(
      (item) => !Number.isInteger(item.order),
    ).length,
    itemsMissingMaxScore: items.filter(
      (item) =>
        typeof item.maxScore !== "number" || item.maxScore <= 0,
    ).length,
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;

  const [school, evaluatorUser, evaluatorPerson, membership, targetPerson] =
    await Promise.all([
      readDoc(db, `${orgRoot}/schools/${CONFIG.targetSchoolId}`),
      readDoc(db, `users/${CONFIG.evaluator.uid}`),
      readDoc(db, `${orgRoot}/people/${CONFIG.evaluator.personId}`),
      readDoc(
        db,
        `users/${CONFIG.evaluator.uid}/orgMemberships/${CONFIG.orgId}`,
      ),
      readDoc(db, `${orgRoot}/people/${CONFIG.target.personId}`),
    ]);

  const [evaluatorOperationalAssignments, teacherAssignments] =
    await Promise.all([
      listByField(
        db,
        `${orgRoot}/operationalAssignments`,
        "personId",
        CONFIG.evaluator.personId,
      ),
      listByField(
        db,
        `${orgRoot}/teacherAssignments`,
        "teacherPersonId",
        CONFIG.target.personId,
      ),
    ]);

  console.log("Faleh director/teacher evaluation readiness (read-only)");
  console.dir(
    {
      school: school
        ? { id: school.id, name: school.name || school.title }
        : null,
      evaluator: {
        userExists: Boolean(evaluatorUser),
        personExists: Boolean(evaluatorPerson),
        membershipExists: Boolean(membership),
        emailMatches:
          normalizeEmail(evaluatorUser?.email || evaluatorPerson?.email) ===
          CONFIG.evaluator.email,
        membershipPersonId: membership?.personId,
        roleKey: membership?.roleKey || membership?.role,
        scopeType: membership?.scopeType,
        scopeId: membership?.scopeId,
        schoolIds: membership?.scopes?.schoolIds || [],
        manageEvaluations: membership?.permissions?.manageEvaluations,
        isActive: membership?.isActive,
        staffEvaluationAssignments: evaluatorOperationalAssignments
          .filter(
            (assignment) =>
              assignment.schoolId === CONFIG.targetSchoolId &&
              assignment.domainKey === "STAFF_EVALUATION",
          )
          .map((assignment) => assignment.id),
      },
      target: targetPerson
        ? {
            id: targetPerson.id,
            displayName: targetPerson.displayName,
            email: targetPerson.email,
            emailMatches:
              normalizeEmail(targetPerson.email) === CONFIG.target.email,
            provisioningStatus: targetPerson.provisioningStatus,
            activeTeacherAssignments: teacherAssignments
              .filter(
                (assignment) =>
                  assignment.schoolId === CONFIG.targetSchoolId &&
                  assignment.status === "ACTIVE",
              )
              .map((assignment) => assignment.id),
          }
        : null,
    },
    { depth: 8 },
  );

  for (const planConfig of CONFIG.plans) {
    const [framework, sections, items, sourcePlan, sourceCycles, targetPlan] =
      await Promise.all([
        readDoc(
          db,
          `${orgRoot}/evaluationFrameworks/${planConfig.frameworkId}`,
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
        readDoc(
          db,
          `${orgRoot}/evaluationPlans/${planConfig.sourcePlanId}`,
        ),
        listByField(
          db,
          `${orgRoot}/evaluationCycles`,
          "planId",
          planConfig.sourcePlanId,
        ),
        readDoc(
          db,
          `${orgRoot}/evaluationPlans/${planConfig.targetPlanId}`,
        ),
      ]);

    console.log(`\n${planConfig.kind}:`);
    console.dir(
      {
        framework: summarizeFramework(framework, sections, items),
        sourcePlan: sourcePlan
          ? {
              id: sourcePlan.id,
              title: sourcePlan.title,
              schoolId: sourcePlan.schoolId,
              academicYearId: sourcePlan.academicYearId,
              termId: sourcePlan.termId,
              status: sourcePlan.status,
            }
          : null,
        sourceCycles: sourceCycles
          .sort(
            (left, right) =>
              Number(left.cycleNumber || 0) -
              Number(right.cycleNumber || 0),
          )
          .map((cycle) => ({
            id: cycle.id,
            number: cycle.cycleNumber,
            title: cycle.title,
            kind: cycle.cycleKind,
            status: cycle.status,
            includedInAverage: cycle.isIncludedInAverage,
          })),
        targetPlanAlreadyExists: Boolean(targetPlan),
      },
      { depth: 8 },
    );
  }
}

main().catch((error) => {
  console.error("Readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
