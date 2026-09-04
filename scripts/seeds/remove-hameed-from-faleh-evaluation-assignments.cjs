const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-faleh";
const EMAIL = "hameed-s@qz.org.sa";

const PLAN_IDS = [
  "mrb-boys-faleh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-director-weekly-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-school-vice-principal-weekly-teacher-evaluation",
  "mrb-boys-faleh-ay-1448-term-1-student-guide-weekly-teacher-evaluation",
];

async function resolveTeacher() {
  const snap = await db.collection("users").where("email", "==", EMAIL).limit(5).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected exactly one user for ${EMAIL}, found ${users.length}`);
  }

  const user = users[0];

  if (!user.personId) {
    throw new Error(`User has no personId: ${EMAIL}`);
  }

  return {
    uid: user.uid || user.id,
    email: user.email,
    personId: user.personId,
    displayName: user.displayName || "",
  };
}

function isActive(row) {
  return row.status === "ACTIVE";
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "Preview mode (read-only)");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const teacher = await resolveTeacher();

  const targetSnap = await orgRef
    .collection("evaluationTargetAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const evaluatorSnap = await orgRef
    .collection("evaluationEvaluatorAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const submissionsSnap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const activeTargets = targetSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => {
      return (
        isActive(row) &&
        row.schoolId === SCHOOL_ID &&
        PLAN_IDS.includes(row.planId)
      );
    });

  const activeEvaluators = evaluatorSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => {
      return (
        isActive(row) &&
        row.schoolId === SCHOOL_ID &&
        PLAN_IDS.includes(row.planId)
      );
    });

  const submissions = submissionsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && PLAN_IDS.includes(row.planId));

  const blockingSubmissions = submissions.filter((row) =>
    ["SUBMITTED", "APPROVED"].includes(String(row.status || ""))
  );

  const wrongSchoolTargets = activeTargets.filter((row) => row.schoolId !== SCHOOL_ID);
  const wrongSchoolEvaluators = activeEvaluators.filter((row) => row.schoolId !== SCHOOL_ID);

  const safe =
    blockingSubmissions.length === 0 &&
    wrongSchoolTargets.length === 0 &&
    wrongSchoolEvaluators.length === 0 &&
    (activeTargets.length > 0 || activeEvaluators.length > 0);

  const byPlan = {};

  for (const planId of PLAN_IDS) {
    byPlan[planId] = {
      targetAssignmentsToRemove: activeTargets.filter((x) => x.planId === planId).length,
      evaluatorAssignmentsToRemove: activeEvaluators.filter((x) => x.planId === planId).length,
      submissions: submissions.filter((x) => x.planId === planId).length,
    };
  }

  console.dir(
    {
      teacher,
      schoolId: SCHOOL_ID,
      planIds: PLAN_IDS,
      counts: {
        targetAssignmentsToRemove: activeTargets.length,
        evaluatorAssignmentsToRemove: activeEvaluators.length,
        submissionsFound: submissions.length,
        blockingSubmissions: blockingSubmissions.length,
      },
      byPlan,
      targetAssignmentIdsToRemove: activeTargets.map((x) => x.id),
      evaluatorAssignmentIdsToRemove: activeEvaluators.map((x) => x.id),
      decision: safe ? "SAFE TO APPLY" : "NOT SAFE TO APPLY",
    },
    { depth: 20 }
  );

  if (!APPLY) {
    console.log("No writes performed.");
    return;
  }

  if (!safe) {
    console.log("Not safe. No writes performed.");
    return;
  }

  const now = Date.now();
  const batch = db.batch();

  for (const row of activeTargets) {
    batch.update(row.ref, {
      status: "REMOVED",
      removedAt: now,
      updatedAt: now,
    });
  }

  for (const row of activeEvaluators) {
    batch.update(row.ref, {
      status: "REMOVED",
      removedAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();

  console.dir({
    decision: "APPLIED",
    removedTargetAssignments: activeTargets.length,
    removedEvaluatorAssignments: activeEvaluators.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});