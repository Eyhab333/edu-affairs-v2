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

const TEACHERS = [
  {
    email: "kh-a-atriqi@qz.org.sa",
    fallbackDisplayName: "خالد عبدالله الطريقي",
    subjectNote: "SCIENCE",
    supervisorPersonId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
    supervisorRoleKey: "EDU_SUPERVISOR",
  },
  {
    email: "r-a-atriqi@qz.org.sa",
    fallbackDisplayName: "ريان عبدالرحمن الطريقي",
    subjectNote: "SCIENCE_ENGLISH",
    supervisorPersonId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
    supervisorRoleKey: "EDU_SUPERVISOR",
  },
  {
    email: "b-e-arweshid@qz.org.sa",
    fallbackDisplayName: "بدر إبراهيم الرويشد",
    subjectNote: "ENGLISH",
    supervisorPersonId: "p-n-alshaya",
    supervisorRoleKey: "BOYS_EDU_SUPERVISOR",
  },
  {
    email: "kh-m-asyhemi@qz.org.sa",
    fallbackDisplayName: "خالد محمد السحيمي",
    subjectNote: "QURAN",
    supervisorPersonId: "p-s-sayed",
    supervisorRoleKey: "EDU_SUPERVISOR",
  },
];

const COMMON_PLAN_CONFIGS = [
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

function buildPlanConfigsForTeacher(teacherInput) {
  return [
    ...COMMON_PLAN_CONFIGS,
    {
      planId: "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
      evaluatorPersonId: teacherInput.supervisorPersonId,
      evaluatorRoleKey: teacherInput.supervisorRoleKey,
    },
    {
      planId: "mrb-boys-faleh-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
      evaluatorPersonId: teacherInput.supervisorPersonId,
      evaluatorRoleKey: teacherInput.supervisorRoleKey,
    },
  ];
}

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

  delete cleaned.removedAt;

  return cleaned;
}

function buildEvaluatorAssignmentId(pattern, targetPersonId) {
  if (pattern.id && pattern.targetPersonId && pattern.id.includes(pattern.targetPersonId)) {
    return pattern.id.replace(pattern.targetPersonId, targetPersonId);
  }

  return `${pattern.planId}-${pattern.cycleId}-${targetPersonId}-${pattern.evaluatorPersonId}`;
}

async function resolveTeacher(email, fallbackDisplayName) {
  const snap = await db.collection("users").where("email", "==", email).limit(5).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected exactly one user for ${email}, found ${users.length}`);
  }

  const user = users[0];

  if (!user.personId) {
    throw new Error(`User has no personId for ${email}`);
  }

  return {
    uid: user.uid || user.id,
    email: user.email,
    personId: user.personId,
    displayName: user.displayName || fallbackDisplayName,
    roleKey: user.roleKey || "BOYS_TEACHER",
    roleLabel: "معلم",
  };
}

async function assertNoBlockingSubmissions(orgRef, teacher) {
  const snap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const blocking = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => {
      return (
        row.schoolId === SCHOOL_ID &&
        ["SUBMITTED", "APPROVED"].includes(String(row.status || ""))
      );
    });

  if (blocking.length > 0) {
    throw new Error(
      `Blocking submissions found for ${teacher.email}: ${blocking
        .map((x) => x.id)
        .join(", ")}`
    );
  }
}

function targetDisplayPatch(teacher, now) {
  return {
    targetKind: "TEACHER",
    targetPersonId: teacher.personId,
    targetEmail: teacher.email,
    targetDisplayName: teacher.displayName,
    targetRoleKey: teacher.roleKey,
    targetRoleLabel: teacher.roleLabel,
    status: "ACTIVE",
    removedAt: admin.firestore.FieldValue.delete(),
    updatedAt: now,
  };
}

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const writes = [];
  const repairedExisting = [];
  const skippedExisting = [];
  const errors = [];
  const summary = [];

  for (const teacherInput of TEACHERS) {
    const teacher = await resolveTeacher(
      teacherInput.email,
      teacherInput.fallbackDisplayName
    );

    await assertNoBlockingSubmissions(orgRef, teacher);

    const planConfigs = buildPlanConfigsForTeacher(teacherInput);

    const teacherSummary = {
      teacher,
      subjectNote: teacherInput.subjectNote,
      supervisorPersonId: teacherInput.supervisorPersonId,
      supervisorRoleKey: teacherInput.supervisorRoleKey,
      targetAssignmentsToWrite: 0,
      evaluatorAssignmentsToWrite: 0,
      existingActiveDocsRepaired: 0,
      skippedExisting: 0,
    };

    for (const config of planConfigs) {
      const { planId, evaluatorPersonId, evaluatorRoleKey } = config;

      const planDoc = await orgRef.collection("evaluationPlans").doc(planId).get();

      if (!planDoc.exists) {
        errors.push({ teacher: teacher.email, reason: "MISSING_PLAN", planId });
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

      if (cycles.length === 0) {
        errors.push({ teacher: teacher.email, reason: "NO_CYCLES", planId });
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
        errors.push({ teacher: teacher.email, reason: "NO_TARGET_PATTERN", planId });
        continue;
      }

      const targetId = `${planId}-target-${teacher.personId}`;
      const targetRef = orgRef.collection("evaluationTargetAssignments").doc(targetId);
      const targetDoc = await targetRef.get();

      if (targetDoc.exists && targetDoc.data().status === "ACTIVE") {
        writes.push({
          kind: "REPAIR_EXISTING_TARGET_DISPLAY",
          teacherEmail: teacher.email,
          ref: targetRef,
          data: targetDisplayPatch(teacher, now),
        });
        repairedExisting.push(targetId);
        teacherSummary.existingActiveDocsRepaired++;
      } else {
        writes.push({
          kind: "TARGET",
          teacherEmail: teacher.email,
          ref: targetRef,
          data: {
            ...cleanPattern(targetPattern),
            id: targetId,
            orgId: ORG_ID,
            schoolId: SCHOOL_ID,
            academicYearId: plan.academicYearId,
            termId: plan.termId,
            planId,
            ...targetDisplayPatch(teacher, now),
            createdAt: targetDoc.exists ? targetDoc.data().createdAt || now : now,
          },
        });

        teacherSummary.targetAssignmentsToWrite++;
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
            row.targetPersonId !== teacher.personId &&
            row.evaluatorPersonId === evaluatorPersonId &&
            row.evaluatorRoleKey === evaluatorRoleKey
          );
        });

      for (const cycle of cycles) {
        const pattern = evaluatorPatterns.find((row) => row.cycleId === cycle.id);

        if (!pattern) {
          errors.push({
            teacher: teacher.email,
            reason: "NO_EVALUATOR_PATTERN_FOR_CYCLE",
            planId,
            cycleId: cycle.id,
            evaluatorPersonId,
            evaluatorRoleKey,
          });
          continue;
        }

        const evaluatorId = buildEvaluatorAssignmentId(pattern, teacher.personId);
        const evaluatorRef = orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(evaluatorId);

        const evaluatorDoc = await evaluatorRef.get();

        if (evaluatorDoc.exists && evaluatorDoc.data().status === "ACTIVE") {
          writes.push({
            kind: "REPAIR_EXISTING_EVALUATOR_DISPLAY",
            teacherEmail: teacher.email,
            ref: evaluatorRef,
            data: {
              ...targetDisplayPatch(teacher, now),
              evaluatorPersonId,
              evaluatorRoleKey,
            },
          });
          repairedExisting.push(evaluatorId);
          teacherSummary.existingActiveDocsRepaired++;
          continue;
        }

        writes.push({
          kind: "EVALUATOR",
          teacherEmail: teacher.email,
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
            ...targetDisplayPatch(teacher, now),
            evaluatorPersonId,
            evaluatorRoleKey,
            createdAt: evaluatorDoc.exists ? evaluatorDoc.data().createdAt || now : now,
          },
        });

        teacherSummary.evaluatorAssignmentsToWrite++;
      }
    }

    summary.push(teacherSummary);
  }

  if (errors.length > 0) {
    console.dir(
      {
        decision: "STOPPED",
        reason: "Missing plan/cycle/pattern. No writes performed.",
        errors,
        plannedWrites: writes.length,
        summary,
      },
      { depth: 20 }
    );
    process.exit(1);
  }

  if (writes.length > 500) {
    console.dir({
      decision: "STOPPED",
      reason: "Too many writes for one Firestore batch",
      plannedWrites: writes.length,
    });
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
      schoolId: SCHOOL_ID,
      createdOrUpdatedDocs: writes.length,
      repairedExistingDocs: repairedExisting.length,
      skippedExisting: skippedExisting.length,
      summary,
    },
    { depth: 20 }
  );
}

main().catch((err) => {
  console.error("Bulk add failed:", err);
  process.exit(1);
});