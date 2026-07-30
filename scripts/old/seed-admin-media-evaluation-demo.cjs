/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const FRAMEWORK_ID = "director-admin-media-evaluation-v1";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-admin-media-evaluation";

const TARGET_EMAIL = String(process.env.TARGET_EMAIL || "").toLowerCase();

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const TARGET_ROLE_KEY = "MEDIA_SPECIALIST";
const TARGET_ROLE_LABEL = "الإعلامي";

const CYCLE_COUNT = 9;

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

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function evaluationTitle(value) {
  const titles = {
    1: "التقييم الأول",
    2: "التقييم الثاني",
    3: "التقييم الثالث",
    4: "التقييم الرابع",
    5: "التقييم الخامس",
    6: "التقييم السادس",
    7: "التقييم السابع",
    8: "التقييم الثامن",
    9: "التقييم التاسع",
  };

  return titles[value] || `التقييم ${value}`;
}

async function assertDoc(db, pathValue, label) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    throw new Error(`${label} not found: ${pathValue}`);
  }

  return dataWithId(snap);
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

  return null;
}

async function getUserRoleKey(db, userId) {
  if (!userId) return "";

  const snap = await db.doc(`users/${userId}/orgMemberships/${ORG_ID}`).get();

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
    return data.roleKey || TARGET_ROLE_KEY;
  }

  return TARGET_ROLE_KEY;
}

async function upsert(db, pathValue, data) {
  await db.doc(pathValue).set(data, { merge: true });
}

async function main() {
  if (!TARGET_EMAIL) {
    throw new Error(
      "TARGET_EMAIL is required. Example: $env:TARGET_EMAIL='media@qz.org.sa'; node scripts/seed-admin-media-evaluation-demo.cjs"
    );
  }

  initAdmin();

  const db = admin.firestore();
  const ts = Date.now();

  console.log("Seeding admin media evaluation demo...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    frameworkId: FRAMEWORK_ID,
    planId: PLAN_ID,
    targetEmail: TARGET_EMAIL,
    evaluatorEmail: EVALUATOR_EMAIL,
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

  const targetPerson = await findPersonByEmail(db, TARGET_EMAIL);
  if (!targetPerson) {
    throw new Error(`Target person not found: ${TARGET_EMAIL}`);
  }

  const evaluatorPerson = await findPersonByEmail(db, EVALUATOR_EMAIL);
  if (!evaluatorPerson) {
    throw new Error(`Evaluator person not found: ${EVALUATOR_EMAIL}`);
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

    title: "تقييم المدير للإعلامي - منار الريادة بنين السيح - الفصل الأول",
    description:
      "خطة تطبيق تقييم المدير للإعلامي 9 مرات داخل الفصل الدراسي.",

    frameworkId: FRAMEWORK_ID,
    planKind: "PERIODIC",
    targetKind: "ADMIN_STAFF",
    targetRoleKey,
    targetRoleLabel: TARGET_ROLE_LABEL,

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
    targetRoleLabel: TARGET_ROLE_LABEL,
    targetKind: "ADMIN_STAFF",

    status: "ACTIVE",
    assignedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const writes = [
    upsert(db, `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`, plan),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluatorPolicies/${evaluatorPolicy.id}`,
      evaluatorPolicy
    ),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationTargetAssignments/${targetAssignment.id}`,
      targetAssignment
    ),
  ];

  for (let index = 1; index <= CYCLE_COUNT; index += 1) {
    const cycleId = `${PLAN_ID}-evaluation-${pad(index)}`;

    const cycle = {
      id: cycleId,
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,

      planId: PLAN_ID,
      cycleNumber: index,
      title: evaluationTitle(index),
      cycleKind: "CUSTOM",
      status: "OPEN",
      isIncludedInAverage: true,

      createdAt: ts,
      updatedAt: ts,
    };

    const evaluatorAssignmentId = `${PLAN_ID}-${cycleId}-${targetPerson.id}-${evaluatorPerson.id}`;

    const evaluatorAssignment = {
      id: evaluatorAssignmentId,
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,

      planId: PLAN_ID,
      cycleId,

      targetPersonId: targetPerson.id,
      targetRoleKey,
      targetRoleLabel: TARGET_ROLE_LABEL,

      evaluatorPersonId: evaluatorPerson.id,
      evaluatorEmail: EVALUATOR_EMAIL,
      evaluatorRoleKey,

      weight: 100,
      sourceType: "AUTO_GENERATED",
      status: "ACTIVE",

      createdAt: ts,
      updatedAt: ts,
    };

    writes.push(upsert(db, `orgs/${ORG_ID}/evaluationCycles/${cycleId}`, cycle));

    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
        evaluatorAssignment
      )
    );
  }

  await Promise.all(writes);

  console.log("\n✅ Admin media evaluation demo seed completed.");
  console.log({
    planId: PLAN_ID,
    cyclesCreatedOrUpdated: CYCLE_COUNT,
    targetPersonId: targetPerson.id,
    evaluatorPersonId: evaluatorPerson.id,
  });
}

main().catch((error) => {
  console.error("\n❌ Admin media evaluation demo seed failed:");
  console.error(error);
  process.exit(1);
});