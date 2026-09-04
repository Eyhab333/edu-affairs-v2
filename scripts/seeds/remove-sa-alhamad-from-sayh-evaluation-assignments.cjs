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

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-sayh";

const TEACHER = {
  email: "sa.alhamad@qz.org.sa",
  personId: "p-sa-alhamad",
  displayName: "سعود احمد سعود الحمد",
};

const PLAN_IDS = [
  "mrb-boys-sayh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-school-vice-principal-weekly-teacher-evaluation",
  "mrb-boys-sayh-ay-1448-term-1-student-guide-weekly-teacher-evaluation",
];

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const targetSnap = await orgRef
    .collection("evaluationTargetAssignments")
    .where("targetPersonId", "==", TEACHER.personId)
    .get();

  const evaluatorSnap = await orgRef
    .collection("evaluationEvaluatorAssignments")
    .where("targetPersonId", "==", TEACHER.personId)
    .get();

  const submissionSnap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", TEACHER.personId)
    .get();

  const activeTargets = targetSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => {
      return (
        row.schoolId === SCHOOL_ID &&
        row.status === "ACTIVE" &&
        PLAN_IDS.includes(row.planId)
      );
    });

  const activeEvaluators = evaluatorSnap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((row) => {
      return (
        row.schoolId === SCHOOL_ID &&
        row.status === "ACTIVE" &&
        PLAN_IDS.includes(row.planId)
      );
    });

  const blockingSubmissions = submissionSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => {
      return (
        row.schoolId === SCHOOL_ID &&
        PLAN_IDS.includes(row.planId) &&
        ["SUBMITTED", "APPROVED"].includes(String(row.status || ""))
      );
    });

  if (blockingSubmissions.length > 0) {
    console.dir({
      decision: "STOPPED",
      reason: "Blocking submissions found",
      blockingSubmissions: blockingSubmissions.map((x) => x.id),
    });
    process.exit(1);
  }

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
    teacher: TEACHER,
    schoolId: SCHOOL_ID,
    removedTargetAssignments: activeTargets.length,
    removedEvaluatorAssignments: activeEvaluators.length,
  });
}

main().catch((err) => {
  console.error("Remove failed:", err);
  process.exit(1);
});