/*
 * Preview-first, narrowly scoped removal of one teacher from Faleh TEACHER plans.
 * It only changes assignment status to REMOVED, and only when invoked with --apply.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../service-account.json');

const DEFAULT_EMAIL = 'hameed-s@qz.org.sa';
const DEFAULT_SCHOOL = 'mrb-boys-faleh';
const EXPECTED_ORG = 'takween';
const TEACHER_TARGET_KIND = 'TEACHER';
const ACTIVE = 'ACTIVE';
const REMOVED = 'REMOVED';
const BLOCKING_SUBMISSION_STATUSES = new Set(['SUBMITTED', 'APPROVED']);

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

async function fetchTeacherPlanIds(db, candidatePlanIds) {
  const documents = await Promise.all(
    [...candidatePlanIds].map((planId) => db.collection('evaluationPlans').doc(planId).get()),
  );
  return new Set(documents
    .filter((doc) => doc.exists)
    .filter((doc) => doc.data().orgId === EXPECTED_ORG && doc.data().targetKind === TEACHER_TARGET_KIND)
    .map((doc) => doc.id));
}

async function findActiveAssignments(db, collection, personId, schoolId) {
  const snapshot = await db.collection(collection).where('targetPersonId', '==', personId).get();
  return snapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.schoolId === schoolId && data.status === ACTIVE;
  });
}

async function findSubmissions(db, personId, schoolId, planIds) {
  const snapshot = await db.collection('evaluationSubmissions').where('targetPersonId', '==', personId).get();
  return snapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.schoolId === schoolId && planIds.has(planIdFor(data));
  });
}

function describeAssignment(doc) {
  const data = doc.data();
  return {
    assignmentId: doc.id,
    planId: planIdFor(data),
    cycleId: field(data, 'evaluationCycleId', 'cycleId') || null,
    status: data.status,
    evaluatorPersonId: data.evaluatorPersonId || null,
    evaluatorRoleKey: data.evaluatorRoleKey || null,
  };
}

async function main() {
  const email = arg('email', DEFAULT_EMAIL);
  const schoolId = arg('school', DEFAULT_SCHOOL);
  const apply = process.argv.includes('--apply');
  if (schoolId !== DEFAULT_SCHOOL) throw new Error(`This temporary script is locked to ${DEFAULT_SCHOOL}.`);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  const db = admin.firestore();
  const teacher = await resolveTeacher(db, email);
  const [targetCandidates, evaluatorCandidates] = await Promise.all([
    findActiveAssignments(db, 'evaluationTargetAssignments', teacher.personId, schoolId),
    findActiveAssignments(db, 'evaluationEvaluatorAssignments', teacher.personId, schoolId),
  ]);
  const candidatePlanIds = new Set(
    [...targetCandidates, ...evaluatorCandidates].map((doc) => planIdFor(doc.data())).filter(Boolean),
  );
  const teacherPlanIds = await fetchTeacherPlanIds(db, candidatePlanIds);
  const targets = targetCandidates.filter((doc) => teacherPlanIds.has(planIdFor(doc.data())));
  const evaluators = evaluatorCandidates.filter((doc) => teacherPlanIds.has(planIdFor(doc.data())));
  const submissions = await findSubmissions(db, teacher.personId, schoolId, teacherPlanIds);
  const submissionsByStatus = submissions.reduce((counts, doc) => {
    const status = doc.data().status || 'UNKNOWN';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const conflicts = submissions
    .filter((doc) => BLOCKING_SUBMISSION_STATUSES.has(String(doc.data().status || '').toUpperCase()))
    .map((doc) => ({ submissionId: doc.id, planId: planIdFor(doc.data()), status: doc.data().status }));
  const safeToApply = conflicts.length === 0;

  const report = {
    scope: { orgId: EXPECTED_ORG, schoolId, email: email.trim().toLowerCase(), teacherPersonId: teacher.personId, resolvedBy: teacher.source },
    mode: apply ? 'APPLY' : 'PREVIEW',
    targetAssignmentsToRemove: targets.map(describeAssignment),
    evaluatorAssignmentsToRemove: evaluators.map(describeAssignment),
    submissionsByStatus,
    conflicts,
    decision: safeToApply ? 'SAFE TO APPLY' : 'NOT SAFE TO APPLY',
  };

  if (!apply) {
    console.log(JSON.stringify({ ...report, writesPerformed: false, confirmation: 'Preview only. Re-run with --apply to mark listed assignments REMOVED.' }, null, 2));
    return;
  }
  if (!safeToApply) {
    console.log(JSON.stringify({ ...report, writesPerformed: false, confirmation: 'Apply refused because submitted or approved submissions exist.' }, null, 2));
    process.exitCode = 2;
    return;
  }

  const assignments = [...targets, ...evaluators];
  for (let index = 0; index < assignments.length; index += 500) {
    const batch = db.batch();
    assignments.slice(index, index + 500).forEach((doc) => batch.update(doc.ref, { status: REMOVED }));
    await batch.commit();
  }
  console.log(JSON.stringify({ ...report, writesPerformed: assignments.length > 0, removedAssignmentCount: assignments.length, confirmation: 'Only the listed assignment status fields were changed to REMOVED.' }, null, 2));
}

main().catch((error) => {
  console.error(`Removal script failed: ${error.message}`);
  process.exitCode = 1;
});
