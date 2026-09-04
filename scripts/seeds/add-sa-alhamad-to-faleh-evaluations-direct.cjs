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
const SCHOOL_ID = "mrb-boys-faleh";

const TEACHER = {
  email: "sa.alhamad@qz.org.sa",
  personId: "p-sa-alhamad",
  displayName: "سعود احمد سعود الحمد",
  roleKey: "BOYS_TEACHER",
  roleLabel: "معلم",
};

const PLAN_CONFIGS = [
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-director-diagnostic-teacher-evaluation",
    evaluatorPersonId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
    evaluatorRoleKey: "BOYS_PRINCIPAL",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-director-weekly-teacher-evaluation",
    evaluatorPersonId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
    evaluatorRoleKey: "BOYS_PRINCIPAL",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
    evaluatorPersonId: "p-s-sayed",
    evaluatorRoleKey: "EDU_SUPERVISOR",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
    evaluatorPersonId: "p-s-sayed",
    evaluatorRoleKey: "EDU_SUPERVISOR",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-diagnostic-teacher-evaluation",
    evaluatorPersonId: "staff-8DVZ68FaCoWqiC3jkSBNIqs4T203",
    evaluatorRoleKey: "BOYS_EDU_VP",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-educational-vice-principal-weekly-teacher-evaluation",
    evaluatorPersonId: "staff-8DVZ68FaCoWqiC3jkSBNIqs4T203",
    evaluatorRoleKey: "BOYS_EDU_VP",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-school-vice-principal-weekly-teacher-evaluation",
    evaluatorPersonId: "p-ralfaiz",
    evaluatorRoleKey: "BOYS_VP",
  },
  {
    planId: "mrb-boys-faleh-ay-1448-term-1-student-guide-weekly-teacher-evaluation",
    evaluatorPersonId: "staff-gm37B5cNxxUyIasU9G70zHgVkEj2",
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
      errors.push({ reason: "MISSING_PLAN", planId });
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
      errors.push({ reason: "NO_TARGET_PATTERN", planId });
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
          reason: "NO_EVALUATOR_PATTERN_FOR_CYCLE",
          planId,
          cycleId: cycle.id,
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
        reason: "Missing pattern. No writes performed.",
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

  console.dir({
    decision: "APPLIED",
    teacher: TEACHER,
    schoolId: SCHOOL_ID,
    createdOrUpdatedDocs: writes.length,
    skippedExisting: skippedExisting.length,
  });
}

main().catch((err) => {
  console.error("Add failed:", err);
  process.exit(1);
});