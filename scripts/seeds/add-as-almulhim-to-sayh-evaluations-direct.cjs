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
  email: "as.almulhim@qz.org.sa",
  personId: "p-as-almulhim",
  displayName: "عبدالله سعود عبدالله الملحم",
  roleKey: "BOYS_TEACHER",
  roleLabel: "معلم",
};

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

function cleanPattern(row) {
  const cleaned = { ...row };
  delete cleaned.ref;
  delete cleaned.id;
  delete cleaned.targetPersonId;
  delete cleaned.targetEmail;
  delete cleaned.targetDisplayName;
  delete cleaned.targetName;
  delete cleaned.teacherEmail;
  delete cleaned.teacherName;
  delete cleaned.teacherDisplayName;
  return cleaned;
}

function buildEvaluatorAssignmentId(pattern, targetPersonId) {
  if (pattern.id && pattern.targetPersonId && pattern.id.includes(pattern.targetPersonId)) {
    return pattern.id.replace(pattern.targetPersonId, targetPersonId);
  }

  return `${pattern.planId}-${pattern.cycleId}-${targetPersonId}-${pattern.evaluatorPersonId}`;
}

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const writes = [];
  const skippedExisting = [];
  const errors = [];

  for (const config of PLAN_CONFIGS) {
    const { planId, evaluatorPersonId, evaluatorRoleKey } = config;

    const planDoc = await orgRef.collection("evaluationPlans").doc(planId).get();

    if (!planDoc.exists) {
      errors.push({ planId, reason: "MISSING_PLAN" });
      continue;
    }

    const plan = { id: planDoc.id, ...planDoc.data() };

    const cyclesSnap = await orgRef
      .collection("evaluationCycles")
      .where("planId", "==", planId)
      .get();

    const cycles = cyclesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((cycle) => cycle.status !== "REMOVED" && cycle.status !== "ARCHIVED");

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
          row.targetPersonId !== TEACHER.personId
        );
      });

    if (!targetPattern) {
      errors.push({ planId, reason: "NO_TARGET_PATTERN" });
      continue;
    }

    const targetId = `${planId}-target-${TEACHER.personId}`;
    const targetRef = orgRef.collection("evaluationTargetAssignments").doc(targetId);
    const targetDoc = await targetRef.get();

    if (targetDoc.exists && targetDoc.data().status === "ACTIVE") {
      skippedExisting.push(targetId);
    } else {
      writes.push({
        ref: targetRef,
        data: {
          ...cleanPattern(targetPattern),
          id: targetId,
          orgId: ORG_ID,
          schoolId: SCHOOL_ID,
          academicYearId: plan.academicYearId,
          termId: plan.termId,
          planId,
          targetKind: "TEACHER",
          targetPersonId: TEACHER.personId,
          targetEmail: TEACHER.email,
          targetDisplayName: TEACHER.displayName,
          targetRoleKey: TEACHER.roleKey,
          targetRoleLabel: TEACHER.roleLabel,
          status: "ACTIVE",
          createdAt: targetDoc.exists ? targetDoc.data().createdAt || now : now,
          updatedAt: now,
        },
      });
    }

    const evaluatorPatternSnap = await orgRef
      .collection("evaluationEvaluatorAssignments")
      .where("planId", "==", planId)
      .get();

    const evaluatorPatterns = evaluatorPatternSnap.docs
      .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
      .filter((row) => {
        return (
          row.schoolId === SCHOOL_ID &&
          row.status === "ACTIVE" &&
          row.targetPersonId !== TEACHER.personId &&
          row.evaluatorPersonId === evaluatorPersonId &&
          row.evaluatorRoleKey === evaluatorRoleKey
        );
      });

    for (const cycle of cycles) {
      const pattern = evaluatorPatterns.find((row) => row.cycleId === cycle.id);

      if (!pattern) {
        errors.push({
          planId,
          cycleId: cycle.id,
          reason: "NO_EVALUATOR_PATTERN_FOR_CYCLE",
          evaluatorPersonId,
          evaluatorRoleKey,
        });
        continue;
      }

      const evaluatorId = buildEvaluatorAssignmentId(pattern, TEACHER.personId);
      const evaluatorRef = orgRef.collection("evaluationEvaluatorAssignments").doc(evaluatorId);
      const evaluatorDoc = await evaluatorRef.get();

      if (evaluatorDoc.exists && evaluatorDoc.data().status === "ACTIVE") {
        skippedExisting.push(evaluatorId);
        continue;
      }

      writes.push({
        ref: evaluatorRef,
        data: {
          ...cleanPattern(pattern),
          id: evaluatorId,
          orgId: ORG_ID,
          schoolId: SCHOOL_ID,
          academicYearId: plan.academicYearId,
          termId: plan.termId,
          planId,
          cycleId: cycle.id,
          targetKind: "TEACHER",
          targetPersonId: TEACHER.personId,
          targetEmail: TEACHER.email,
          targetDisplayName: TEACHER.displayName,
          targetRoleKey: TEACHER.roleKey,
          targetRoleLabel: TEACHER.roleLabel,
          evaluatorPersonId,
          evaluatorRoleKey,
          status: "ACTIVE",
          createdAt: evaluatorDoc.exists ? evaluatorDoc.data().createdAt || now : now,
          updatedAt: now,
        },
      });
    }
  }

  if (errors.length > 0) {
    console.dir(
      {
        decision: "STOPPED",
        reason: "Missing plan/cycle patterns. No writes performed.",
        errors,
        plannedWrites: writes.length,
      },
      { depth: 20 }
    );
    process.exit(1);
  }

  const batch = db.batch();

  for (const write of writes) {
    batch.set(write.ref, write.data, { merge: true });
  }

  await batch.commit();

  console.dir(
    {
      decision: "APPLIED",
      teacher: TEACHER,
      schoolId: SCHOOL_ID,
      createdOrUpdatedDocs: writes.length,
      skippedExisting: skippedExisting.length,
      skippedExistingIds: skippedExisting,
      excludedPlans: [
        "educational-supervisor-diagnostic-teacher-evaluation",
        "educational-supervisor-periodic-teacher-evaluation",
      ],
    },
    { depth: 20 }
  );
}

main().catch((err) => {
  console.error("Direct add failed:", err);
  process.exit(1);
});