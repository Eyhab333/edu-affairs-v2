/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation";

const TARGET_EMAIL = (
  process.env.TARGET_EMAIL || "a.brakat@qz.org.sa"
).toLowerCase();

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const WEEK_FROM = Number(process.env.WEEK_FROM || 2);
const WEEK_TO = Number(process.env.WEEK_TO || 3);

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

function padWeek(value) {
  return String(value).padStart(2, "0");
}

function weekTitle(value) {
  const titles = {
    1: "الأسبوع الأول",
    2: "الأسبوع الثاني",
    3: "الأسبوع الثالث",
    4: "الأسبوع الرابع",
    5: "الأسبوع الخامس",
    6: "الأسبوع السادس",
    7: "الأسبوع السابع",
    8: "الأسبوع الثامن",
    9: "الأسبوع التاسع",
    10: "الأسبوع العاشر",
    11: "الأسبوع الحادي عشر",
    12: "الأسبوع الثاني عشر",
    13: "الأسبوع الثالث عشر",
    14: "الأسبوع الرابع عشر",
    15: "الأسبوع الخامس عشر",
    16: "الأسبوع السادس عشر",
    17: "الأسبوع السابع عشر",
    18: "الأسبوع الثامن عشر",
    19: "الأسبوع التاسع عشر",
  };

  return titles[value] || `الأسبوع ${value}`;
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

  return null;
}

async function getUserRoleKey(db, userId) {
  if (!userId) return "";

  const snap = await db.doc(`users/${userId}/orgMemberships/${ORG_ID}`).get();

  if (!snap.exists) return "";

  const data = snap.data() || {};

  return data.roleKey || data.role || "";
}

async function assertDoc(db, pathValue, label) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    throw new Error(`${label} not found: ${pathValue}`);
  }

  return dataWithId(snap);
}

async function main() {
  initAdmin();

  if (!Number.isInteger(WEEK_FROM) || !Number.isInteger(WEEK_TO)) {
    throw new Error("WEEK_FROM and WEEK_TO must be integers.");
  }

  if (WEEK_FROM < 1 || WEEK_TO < WEEK_FROM) {
    throw new Error("Invalid week range.");
  }

  const db = admin.firestore();
  const ts = Date.now();

  console.log("Generating director weekly evaluation cycles...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    targetEmail: TARGET_EMAIL,
    evaluatorEmail: EVALUATOR_EMAIL,
    weekFrom: WEEK_FROM,
    weekTo: WEEK_TO,
  });

  const plan = await assertDoc(
    db,
    `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`,
    "Evaluation plan"
  );

  console.log("Plan:", plan.title || plan.id);

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

  await assertDoc(
    db,
    `orgs/${ORG_ID}/evaluationTargetAssignments/${PLAN_ID}-target-${targetPerson.id}`,
    "Target assignment"
  );

  const writes = [];

  for (let week = WEEK_FROM; week <= WEEK_TO; week += 1) {
    const weekNo = padWeek(week);

    const cycleId = `${PLAN_ID}-week-${weekNo}`;

    const cycle = {
      id: cycleId,
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,

      planId: PLAN_ID,
      cycleNumber: week,
      title: weekTitle(week),
      cycleKind: "WEEK",
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

      evaluatorPersonId: evaluatorPerson.id,
      evaluatorEmail: EVALUATOR_EMAIL,
      evaluatorRoleKey,

      weight: 100,
      sourceType: "AUTO_GENERATED",
      status: "ACTIVE",

      createdAt: ts,
      updatedAt: ts,
    };

    writes.push(
      db
        .doc(`orgs/${ORG_ID}/evaluationCycles/${cycleId}`)
        .set(cycle, { merge: true })
    );

    writes.push(
      db
        .doc(
          `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`
        )
        .set(evaluatorAssignment, { merge: true })
    );
  }

  await Promise.all(writes);

  console.log("\n✅ Weekly cycles generated successfully.");
  console.log({
    cyclesCreatedOrUpdated: WEEK_TO - WEEK_FROM + 1,
    evaluatorAssignmentsCreatedOrUpdated: WEEK_TO - WEEK_FROM + 1,
    weekFrom: WEEK_FROM,
    weekTo: WEEK_TO,
    targetPersonId: targetPerson.id,
    evaluatorPersonId: evaluatorPerson.id,
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to generate weekly cycles:");
  console.error(error);
  process.exit(1);
});