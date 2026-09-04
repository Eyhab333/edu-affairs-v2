/*
 * Read-only inspection for one teacher's Manar Boys Faleh teacher-evaluation data.
 * This script deliberately contains no write operation.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../service-account.json');

const DEFAULT_EMAIL = 'hameed-s@qz.org.sa';
const DEFAULT_SCHOOL = 'mrb-boys-faleh';
const EXPECTED_ORG = 'takween';
const TEACHER_TARGET_KIND = 'TEACHER';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  // Accept the \@ spelling often used when this command is copied from Markdown.
  return value ? value.slice(prefix.length).replace(/\\@/g, '@') : fallback;
}

function field(data, ...names) {
  const values = names.map((name) => data[name]).filter((value) => value !== undefined && value !== null);
  if (values.length > 1 && new Set(values.map(String)).size > 1) {
    throw new Error(`Conflicting fields ${names.join(', ')} on one document.`);
  }
  return values[0];
}

function planIdFor(data) {
  return field(data, 'evaluationPlanId', 'planId');
}

function cycleIdsFor(data) {
  return [
    ...new Set(
      ['cycleId', 'evaluationCycleId']
        .flatMap((key) => (Array.isArray(data[key]) ? data[key] : [data[key]]))
        .filter(Boolean),
    ),
  ];
}

function compactAssignment(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    status: data.status,
    planId: planIdFor(data),
    cycleIds: cycleIdsFor(data),
    evaluatorPersonId: data.evaluatorPersonId || null,
    evaluatorRoleKey: data.evaluatorRoleKey || null,
  };
}

async function resolveTeacher(db, email) {
  const normalizedEmail = email.trim().toLowerCase();
  const peopleByEmail = await db.collection('people').where('email', '==', normalizedEmail).get();
  if (peopleByEmail.size === 1) return { personId: peopleByEmail.docs[0].id, source: 'people.email' };
  if (peopleByEmail.size > 1) throw new Error(`More than one person has email ${normalizedEmail}.`);

  const usersByEmail = await db.collection('users').where('email', '==', normalizedEmail).get();
  if (usersByEmail.size !== 1) {
    throw new Error(`Could not uniquely resolve ${normalizedEmail} from people.email or users.email.`);
  }
  const user = usersByEmail.docs[0];
  const personId = field(user.data(), 'personId');
  if (!personId) throw new Error(`User ${user.id} has no personId; refusing to guess.`);
  return { personId, source: 'users.email -> users.personId' };
}

async function fetchPlanMap(db, candidatePlanIds) {
  const documents = await Promise.all(
    [...candidatePlanIds].map((planId) => db.collection('evaluationPlans').doc(planId).get()),
  );
  const plans = documents
    .filter((doc) => doc.exists)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((plan) => plan.orgId === EXPECTED_ORG && plan.targetKind === TEACHER_TARGET_KIND);
  return new Map(plans.map((plan) => [plan.id, plan]));
}

async function readTeacherDocuments(db, collection, personId, schoolId) {
  const snapshot = await db.collection(collection).where('targetPersonId', '==', personId).get();
  return snapshot.docs.filter((doc) => doc.data().schoolId === schoolId);
}

async function main() {
  const email = arg('email', DEFAULT_EMAIL);
  const schoolId = arg('school', DEFAULT_SCHOOL);
  if (schoolId !== DEFAULT_SCHOOL) throw new Error(`This temporary script is locked to ${DEFAULT_SCHOOL}.`);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = admin.firestore();
  const teacher = await resolveTeacher(db, email);
  const [targetDocs, evaluatorDocs] = await Promise.all([
    readTeacherDocuments(db, 'evaluationTargetAssignments', teacher.personId, schoolId),
    readTeacherDocuments(db, 'evaluationEvaluatorAssignments', teacher.personId, schoolId),
  ]);
  const activeAssignmentPlanIds = new Set(
    [...targetDocs, ...evaluatorDocs]
      .filter((doc) => doc.data().status === 'ACTIVE')
      .map((doc) => planIdFor(doc.data()))
      .filter(Boolean),
  );
  const [plans, submissionDocs] = await Promise.all([
    fetchPlanMap(db, activeAssignmentPlanIds),
    readTeacherDocuments(db, 'evaluationSubmissions', teacher.personId, schoolId),
  ]);

  const targetAssignments = targetDocs.map(compactAssignment);
  const evaluatorAssignments = evaluatorDocs.map(compactAssignment);
  const submissions = submissionDocs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => plans.has(planIdFor(data)));

  const candidatePlanIdsToRemoveFrom = [...plans.keys()].filter((planId) =>
    targetAssignments.some((assignment) => assignment.planId === planId) ||
    evaluatorAssignments.some((assignment) => assignment.planId === planId),
  );

  console.log(JSON.stringify({
    scope: { orgId: EXPECTED_ORG, schoolId, email: email.trim().toLowerCase(), teacherPersonId: teacher.personId, resolvedBy: teacher.source },
    evaluationPlans: [...plans.values()].map((plan) => {
      const planTargets = targetAssignments.filter((assignment) => assignment.planId === plan.id);
      const planEvaluators = evaluatorAssignments.filter((assignment) => assignment.planId === plan.id);
      const planSubmissions = submissions.filter(({ data }) => planIdFor(data) === plan.id);
      const submissionsByStatus = planSubmissions.reduce((counts, { data }) => {
        const status = data.status || 'UNKNOWN';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {});
      return {
        planId: plan.id,
        title: plan.title || null,
        frameworkId: plan.frameworkId || null,
        planKind: plan.planKind || null,
        targetKind: plan.targetKind,
        status: plan.status || null,
        targetAssignments: planTargets,
        evaluatorAssignments: planEvaluators,
        evaluatorPersonId: [...new Set(planEvaluators.map((item) => item.evaluatorPersonId).filter(Boolean))],
        evaluatorRoleKey: [...new Set(planEvaluators.map((item) => item.evaluatorRoleKey).filter(Boolean))],
        cyclesInvolved: [...new Set([
          ...cycleIdsFor(plan),
          ...planTargets.flatMap((item) => item.cycleIds),
          ...planEvaluators.flatMap((item) => item.cycleIds),
          ...planSubmissions.flatMap(({ data }) => cycleIdsFor(data)),
        ])],
        submissionsCountByStatus: submissionsByStatus,
      };
    }),
    candidatePlanIdsToRemoveFrom,
    writesPerformed: false,
    confirmation: 'Read-only inspection complete. No writes were performed.',
  }, null, 2));
}

main().catch((error) => {
  console.error(`Inspection failed: ${error.message}`);
  process.exitCode = 1;
});
