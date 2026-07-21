/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const FRAMEWORK_ID = "director-weekly-teacher-evaluation-v1";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation";

const CYCLE_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation-week-01";

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const TARGET_EMAIL = (
  process.env.TARGET_EMAIL || "a.brakat@qz.org.sa"
).toLowerCase();

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json"
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function now() {
  return Date.now();
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

async function findPersonByEmail(db, email) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  const allSnap = await db.collection(`orgs/${ORG_ID}/people`).get();

  return (
    allSnap.docs
      .map(dataWithId)
      .find((person) => String(person.email || "").toLowerCase() === email) ||
    null
  );
}

async function findUserByEmail(db, email) {
  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  const allSnap = await db.collection("users").get();

  return (
    allSnap.docs
      .map(dataWithId)
      .find((user) => String(user.email || "").toLowerCase() === email) ||
    null
  );
}

async function getUserRoleKey(db, userId) {
  if (!userId) return "";

  const snap = await db
    .doc(`users/${userId}/orgMemberships/${ORG_ID}`)
    .get();

  if (!snap.exists) return "";

  const data = snap.data() || {};

  return data.roleKey || data.role || "";
}

async function getTargetRoleKey(db, targetPersonId) {
  const membershipSnap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .where("personId", "==", targetPersonId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!membershipSnap.empty) {
    const data = membershipSnap.docs[0].data();
    return data.roleKey || "TEACHER";
  }

  const teacherSnap = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("teacherPersonId", "==", targetPersonId)
    .where("status", "==", "ACTIVE")
    .limit(1)
    .get();

  if (!teacherSnap.empty) return "BOYS_TEACHER";

  return "TEACHER";
}

async function assertDoc(db, pathValue, label) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    throw new Error(`${label} not found: ${pathValue}`);
  }

  return dataWithId(snap);
}

async function upsert(db, pathValue, data) {
  await db.doc(pathValue).set(data, { merge: true });
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = now();

  console.log("Seeding director weekly evaluation demo...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    frameworkId: FRAMEWORK_ID,
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    evaluatorEmail: EVALUATOR_EMAIL,
    targetEmail: TARGET_EMAIL,
  });

  const [school, academicYear, framework] = await Promise.all([
    assertDoc(db, `orgs/${ORG_ID}/schools/${SCHOOL_ID}`, "School"),
    assertDoc(
      db,
      `orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}`,
      "Academic year"
    ),
    assertDoc(
      db,
      `orgs/${ORG_ID}/evaluationFrameworks/${FRAMEWORK_ID}`,
      "Evaluation framework"
    ),
  ]);

  console.log("School:", school.name || school.id);
  console.log("Academic year:", academicYear.title || academicYear.id);
  console.log("Framework:", framework.title || framework.id);

  const evaluatorPerson = await findPersonByEmail(db, EVALUATOR_EMAIL);
  if (!evaluatorPerson) {
    throw new Error(`Evaluator person not found: ${EVALUATOR_EMAIL}`);
  }

  const targetPerson = await findPersonByEmail(db, TARGET_EMAIL);
  if (!targetPerson) {
    throw new Error(`Target person not found: ${TARGET_EMAIL}`);
  }

  const evaluatorUser = await findUserByEmail(db, EVALUATOR_EMAIL);
  const evaluatorRoleKey =
    (evaluatorUser && (await getUserRoleKey(db, evaluatorUser.id))) ||
    "platform_owner";

  const targetRoleKey = await getTargetRoleKey(db, targetPerson.id);

  console.log("Evaluator:");
  console.log({
    personId: evaluatorPerson.id,
    displayName: evaluatorPerson.displayName,
    email: evaluatorPerson.email,
    roleKey: evaluatorRoleKey,
  });

  console.log("Target:");
  console.log({
    personId: targetPerson.id,
    displayName: targetPerson.displayName,
    email: targetPerson.email,
    roleKey: targetRoleKey,
  });

  const plan = {
    id: PLAN_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    title: "تقييم المدير الأسبوعي لمعلمي منار الريادة بنين السيح - الفصل الأول",
    description:
      "خطة تجريبية لتطبيق القالب الرسمي لتقييم المدير الأسبوعي للمعلمين.",

    frameworkId: FRAMEWORK_ID,
    planKind: "WEEKLY",
    targetKind: "TEACHER",
    status: "ACTIVE",

    createdAt: ts,
    updatedAt: ts,
  };

  const evaluatorPolicy = {
    id: `${PLAN_ID}-policy-director`,
    orgId: ORG_ID,
    planId: PLAN_ID,

    evaluatorRoleKey,
    evaluatorLabel: "مدير المدرسة / المقيم التجريبي",
    weight: 100,

    required: true,
    canSubmit: true,
    canReview: false,
    canApprove: true,

    order: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  const cycle = {
    id: CYCLE_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    planId: PLAN_ID,
    cycleNumber: 1,
    title: "الأسبوع الأول",
    cycleKind: "WEEK",
    status: "OPEN",
    isIncludedInAverage: true,

    createdAt: ts,
    updatedAt: ts,
  };

  const targetAssignment = {
    id: `${PLAN_ID}-target-${targetPerson.id}`,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    planId: PLAN_ID,

    targetPersonId: targetPerson.id,
    targetEmail: TARGET_EMAIL,
    targetDisplayName: targetPerson.displayName || TARGET_EMAIL,
    targetRoleKey,
    targetKind: "TEACHER",

    status: "ACTIVE",
    assignedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const evaluatorAssignmentId = `${PLAN_ID}-${CYCLE_ID}-${targetPerson.id}-${evaluatorPerson.id}`;

  const evaluatorAssignment = {
    id: evaluatorAssignmentId,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    planId: PLAN_ID,
    cycleId: CYCLE_ID,

    targetPersonId: targetPerson.id,

    evaluatorPersonId: evaluatorPerson.id,
    evaluatorEmail: EVALUATOR_EMAIL,
    evaluatorRoleKey,

    weight: 100,
    sourceType: "MANUAL",
    status: "ACTIVE",

    createdAt: ts,
    updatedAt: ts,
  };

  await Promise.all([
    upsert(db, `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`, plan),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluatorPolicies/${evaluatorPolicy.id}`,
      evaluatorPolicy
    ),
    upsert(db, `orgs/${ORG_ID}/evaluationCycles/${CYCLE_ID}`, cycle),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationTargetAssignments/${targetAssignment.id}`,
      targetAssignment
    ),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
      evaluatorAssignment
    ),
  ]);

  console.log("\n✅ Director weekly evaluation demo seed completed successfully.");
  console.log({
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    targetAssignmentId: targetAssignment.id,
    evaluatorAssignmentId,
  });
}

main().catch((error) => {
  console.error("\n❌ Director weekly evaluation demo seed failed:");
  console.error(error);
  process.exit(1);
});