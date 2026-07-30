/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation";

const CYCLE_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation-week-02";

const TARGET_PERSON_ID = "p-a-brakat";
const TARGET_EMAIL = "a.brakat@qz.org.sa";

const EVALUATOR_PERSON_ID = "oyVunHzwNwdYV5HMyJKsUwaeCfW2";
const EVALUATOR_EMAIL = "e.ahmad@qz.org.sa";
const EVALUATOR_ROLE_KEY = "platform_owner";

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

async function assertDoc(db, pathValue, label) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    throw new Error(`${label} not found: ${pathValue}`);
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const ts = Date.now();

  console.log("Seeding evaluation week 02...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    targetPersonId: TARGET_PERSON_ID,
    evaluatorPersonId: EVALUATOR_PERSON_ID,
  });

  await assertDoc(db, `orgs/${ORG_ID}/evaluationPlans/${PLAN_ID}`, "Plan");

  await assertDoc(
    db,
    `orgs/${ORG_ID}/evaluationTargetAssignments/${PLAN_ID}-target-${TARGET_PERSON_ID}`,
    "Target assignment"
  );

  const cycle = {
    id: CYCLE_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    cycleNumber: 2,
    title: "الأسبوع الثاني",
    cycleKind: "WEEK",
    status: "OPEN",
    isIncludedInAverage: true,
    createdAt: ts,
    updatedAt: ts,
  };

  const evaluatorAssignmentId = `${PLAN_ID}-${CYCLE_ID}-${TARGET_PERSON_ID}-${EVALUATOR_PERSON_ID}`;

  const evaluatorAssignment = {
    id: evaluatorAssignmentId,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    targetPersonId: TARGET_PERSON_ID,
    evaluatorPersonId: EVALUATOR_PERSON_ID,
    evaluatorEmail: EVALUATOR_EMAIL,
    evaluatorRoleKey: EVALUATOR_ROLE_KEY,
    weight: 100,
    sourceType: "SEED",
    status: "ACTIVE",
    createdAt: ts,
    updatedAt: ts,
  };

  await db
    .doc(`orgs/${ORG_ID}/evaluationCycles/${CYCLE_ID}`)
    .set(cycle, { merge: true });

  await db
    .doc(
      `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`
    )
    .set(evaluatorAssignment, { merge: true });

  console.log("✅ Week 02 seed completed successfully.");
  console.log({
    cycleId: CYCLE_ID,
    evaluatorAssignmentId,
  });
}

main().catch((error) => {
  console.error("❌ Week 02 seed failed:");
  console.error(error);
  process.exit(1);
});