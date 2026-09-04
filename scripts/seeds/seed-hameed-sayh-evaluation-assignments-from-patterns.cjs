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
const SCHOOL_ID = "mrb-boys-sayh";
const EMAIL = "hameed-s@qz.org.sa";

const PLAN_CONFIGS = [
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
    evaluatorPersonId: "p-a-s-alkmays",
    evaluatorRoleKey: "BOYS_PRINCIPAL",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-director-weekly-teacher-evaluation",
    evaluatorPersonId: "p-a-s-alkmays",
    evaluatorRoleKey: "BOYS_PRINCIPAL",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
    evaluatorPersonId: "p-s-sayed",
    evaluatorRoleKey: "EDU_SUPERVISOR",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
    evaluatorPersonId: "p-s-sayed",
    evaluatorRoleKey: "EDU_SUPERVISOR",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
    evaluatorPersonId: "p-m-alateeq",
    evaluatorRoleKey: "BOYS_EDU_VP",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
    evaluatorPersonId: "p-m-alateeq",
    evaluatorRoleKey: "BOYS_EDU_VP",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-school-vice-principal-weekly-teacher-evaluation",
    evaluatorPersonId: "p-r-almutawa",
    evaluatorRoleKey: "BOYS_VP",
  },
  {
    planId: "mrb-boys-sayh-ay-1448-term-1-student-guide-weekly-teacher-evaluation",
    evaluatorPersonId: "p-students-mentor-syeh",
    evaluatorRoleKey: "BOYS_STUDENT_GUIDE",
  },
];

function isActive(row) {
  return row.status === "ACTIVE" || row.active === true;
}

async function resolveTeacher() {
  const snap = await db.collection("users").where("email", "==", EMAIL).limit(5).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected exactly one user for ${EMAIL}, found ${users.length}`);
  }

  const user = users[0];

  if (!user.personId) {
    throw new Error(`User has no personId for ${EMAIL}`);
  }

  return {
    uid: user.uid || user.id,
    email: user.email,
    personId: user.personId,
    displayName: user.displayName || "",
  };
}

function buildEvaluatorAssignmentIdFromPattern(pattern, targetPersonId) {
  if (pattern.id && pattern.targetPersonId && pattern.id.includes(pattern.targetPersonId)) {
    return pattern.id.replace(pattern.targetPersonId, targetPersonId);
  }

  return `${pattern.cycleId}-${targetPersonId}-${pattern.evaluatorPersonId}`;
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const teacher = await resolveTeacher();

  const teacherAssignmentsSnap = await orgRef
    .collection("teacherAssignments")
    .where("teacherPersonId", "==", teacher.personId)
    .get();

  const activeTeacherAssignments = teacherAssignmentsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const submissionsSnap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const blockingSubmissions = submissionsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => {
      return (
        row.schoolId === SCHOOL_ID &&
        ["SUBMITTED", "APPROVED"].includes(String(row.status || ""))
      );
    });

  const targetCreates = [];
  const evaluatorCreates = [];
  const alreadyExistingTargets = [];
  const alreadyExistingEvaluators = [];
  const conflicts = [];
  const byPlan = {};

  if (activeTeacherAssignments.length === 0) {
    conflicts.push({
      reason: "NO_ACTIVE_TEACHER_ASSIGNMENTS_IN_SAYH",
      teacherPersonId: teacher.personId,
      schoolId: SCHOOL_ID,
    });
  }

  if (blockingSubmissions.length > 0) {
    conflicts.push({
      reason: "BLOCKING_SUBMISSIONS_FOUND",
      count: blockingSubmissions.length,
      submissionIds: blockingSubmissions.map((x) => x.id),
    });
  }

  for (const config of PLAN_CONFIGS) {
    const { planId, evaluatorPersonId, evaluatorRoleKey } = config;

    byPlan[planId] = {
      evaluatorPersonId,
      evaluatorRoleKey,
      targetToCreate: 0,
      evaluatorToCreate: 0,
      alreadyExistingTargets: 0,
      alreadyExistingEvaluators: 0,
      cyclesCount: 0,
    };

    const planDoc = await orgRef.collection("evaluationPlans").doc(planId).get();

    if (!planDoc.exists) {
      conflicts.push({ reason: "MISSING_PLAN", planId });
      continue;
    }

    const plan = { id: planDoc.id, ...planDoc.data() };

    if (plan.schoolId !== SCHOOL_ID || plan.targetKind !== "TEACHER" || plan.status !== "ACTIVE") {
      conflicts.push({
        reason: "INVALID_PLAN",
        planId,
        schoolId: plan.schoolId,
        targetKind: plan.targetKind,
        status: plan.status,
      });
      continue;
    }

    const cyclesSnap = await orgRef
      .collection("evaluationCycles")
      .where("planId", "==", planId)
      .get();

    const cycles = cyclesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((cycle) => cycle.status !== "REMOVED" && cycle.status !== "ARCHIVED");

    byPlan[planId].cyclesCount = cycles.length;

    if (cycles.length === 0) {
      conflicts.push({ reason: "NO_CYCLES", planId });
      continue;
    }

    const targetPatternSnap = await orgRef
      .collection("evaluationTargetAssignments")
      .where("planId", "==", planId)
      .get();

    const targetPattern = targetPatternSnap.docs
      .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
      .find((row) => {
        return (
          row.schoolId === SCHOOL_ID &&
          row.status === "ACTIVE" &&
          row.targetPersonId !== teacher.personId
        );
      });

    if (!targetPattern) {
      conflicts.push({ reason: "NO_TARGET_PATTERN", planId });
      continue;
    }

    const targetId = `${planId}-target-${teacher.personId}`;
    const targetRef = orgRef.collection("evaluationTargetAssignments").doc(targetId);
    const targetDoc = await targetRef.get();

    if (targetDoc.exists && targetDoc.data().status === "ACTIVE") {
      alreadyExistingTargets.push(targetId);
      byPlan[planId].alreadyExistingTargets++;
    } else if (targetDoc.exists) {
      conflicts.push({
        reason: "TARGET_DOC_EXISTS_NOT_ACTIVE",
        planId,
        targetId,
        status: targetDoc.data().status,
      });
      continue;
    } else {
      const { ref, id, ...patternData } = targetPattern;

      targetCreates.push({
        ref: targetRef,
        data: {
          ...patternData,
          id: targetId,
          orgId: ORG_ID,
          schoolId: SCHOOL_ID,
          planId,
          targetPersonId: teacher.personId,
          targetKind: "TEACHER",
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
      });

      byPlan[planId].targetToCreate++;
    }

    const evaluatorPatternsSnap = await orgRef
      .collection("evaluationEvaluatorAssignments")
      .where("planId", "==", planId)
      .get();

    const evaluatorPatterns = evaluatorPatternsSnap.docs
      .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
      .filter((row) => {
        return (
          row.schoolId === SCHOOL_ID &&
          row.status === "ACTIVE" &&
          row.targetPersonId !== teacher.personId &&
          row.evaluatorPersonId === evaluatorPersonId &&
          row.evaluatorRoleKey === evaluatorRoleKey
        );
      });

    for (const cycle of cycles) {
      const pattern = evaluatorPatterns.find((row) => row.cycleId === cycle.id);

      if (!pattern) {
        conflicts.push({
          reason: "NO_EVALUATOR_PATTERN_FOR_CYCLE",
          planId,
          cycleId: cycle.id,
          evaluatorPersonId,
          evaluatorRoleKey,
        });
        continue;
      }

      const evaluatorId = buildEvaluatorAssignmentIdFromPattern(pattern, teacher.personId);
      const evaluatorRef = orgRef.collection("evaluationEvaluatorAssignments").doc(evaluatorId);
      const evaluatorDoc = await evaluatorRef.get();

      if (evaluatorDoc.exists && evaluatorDoc.data().status === "ACTIVE") {
        alreadyExistingEvaluators.push(evaluatorId);
        byPlan[planId].alreadyExistingEvaluators++;
        continue;
      }

      if (evaluatorDoc.exists) {
        conflicts.push({
          reason: "EVALUATOR_DOC_EXISTS_NOT_ACTIVE",
          planId,
          cycleId: cycle.id,
          evaluatorId,
          status: evaluatorDoc.data().status,
        });
        continue;
      }

      const { ref, id, ...patternData } = pattern;

      evaluatorCreates.push({
        ref: evaluatorRef,
        data: {
          ...patternData,
          id: evaluatorId,
          orgId: ORG_ID,
          schoolId: SCHOOL_ID,
          planId,
          cycleId: cycle.id,
          targetPersonId: teacher.personId,
          evaluatorPersonId,
          evaluatorRoleKey,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
      });

      byPlan[planId].evaluatorToCreate++;
    }
  }

  const safe =
    conflicts.length === 0 &&
    blockingSubmissions.length === 0 &&
    activeTeacherAssignments.length > 0 &&
    (targetCreates.length > 0 || evaluatorCreates.length > 0);

  console.dir(
    {
      teacher,
      schoolId: SCHOOL_ID,
      activeTeacherAssignmentsInSayh: activeTeacherAssignments.length,
      counts: {
        targetAssignmentsToCreate: targetCreates.length,
        evaluatorAssignmentsToCreate: evaluatorCreates.length,
        alreadyExistingTargets: alreadyExistingTargets.length,
        alreadyExistingEvaluators: alreadyExistingEvaluators.length,
        blockingSubmissions: blockingSubmissions.length,
        conflicts: conflicts.length,
      },
      byPlan,
      conflicts,
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

  const batch = db.batch();

  for (const row of targetCreates) {
    batch.set(row.ref, row.data);
  }

  for (const row of evaluatorCreates) {
    batch.set(row.ref, row.data);
  }

  await batch.commit();

  console.dir({
    decision: "APPLIED",
    createdTargetAssignments: targetCreates.length,
    createdEvaluatorAssignments: evaluatorCreates.length,
  });
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});