const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim().replace("\\@", "@") : "";
}

const ORG_ID = getArg("org") || "takween";
const SCHOOL_ID = getArg("school") || "mrb-boys-sayh";
const EMAIL = getArg("email") || "hameed-s@qz.org.sa";

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
    throw new Error(`User has no personId: ${EMAIL}`);
  }

  return {
    uid: user.uid || user.id,
    email: user.email,
    personId: user.personId,
    displayName: user.displayName || "",
  };
}

function groupEvaluatorPatterns(assignments) {
  const map = new Map();

  for (const row of assignments) {
    const key = `${row.evaluatorPersonId || "MISSING"}__${row.evaluatorRoleKey || "MISSING"}`;

    if (!map.has(key)) {
      map.set(key, {
        evaluatorPersonId: row.evaluatorPersonId || null,
        evaluatorRoleKey: row.evaluatorRoleKey || null,
        cyclesCovered: 0,
        targetSamples: [],
      });
    }

    const item = map.get(key);
    item.cyclesCovered += 1;

    if (
      row.targetPersonId &&
      item.targetSamples.length < 3 &&
      !item.targetSamples.includes(row.targetPersonId)
    ) {
      item.targetSamples.push(row.targetPersonId);
    }
  }

  return [...map.values()];
}

async function main() {
  console.log("Inspect Sayh evaluation context only - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const teacher = await resolveTeacher();

  const teacherAssignmentsSnap = await orgRef
    .collection("teacherAssignments")
    .where("teacherPersonId", "==", teacher.personId)
    .get();

  const activeTeacherAssignments = teacherAssignmentsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const targetAssignmentsSnap = await orgRef
    .collection("evaluationTargetAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const evaluatorAssignmentsSnap = await orgRef
    .collection("evaluationEvaluatorAssignments")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const existingTeacherTargetsInSayh = targetAssignmentsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID);

  const existingTeacherEvaluatorsInSayh = evaluatorAssignmentsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID);

  const submissionsSnap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const submissionsInSayh = submissionsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID);

  const plansSnap = await orgRef
    .collection("evaluationPlans")
    .where("schoolId", "==", SCHOOL_ID)
    .get();

  const teacherPlans = plansSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((plan) => plan.targetKind === "TEACHER" && plan.status === "ACTIVE")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const plans = [];

  for (const plan of teacherPlans) {
    const cyclesSnap = await orgRef
      .collection("evaluationCycles")
      .where("planId", "==", plan.id)
      .get();

    const cycles = cyclesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((cycle) => cycle.status !== "REMOVED" && cycle.status !== "ARCHIVED")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const allPlanEvaluatorAssignmentsSnap = await orgRef
      .collection("evaluationEvaluatorAssignments")
      .where("planId", "==", plan.id)
      .get();

    const activePatterns = allPlanEvaluatorAssignmentsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((row) => {
        return (
          row.schoolId === SCHOOL_ID &&
          row.status === "ACTIVE" &&
          row.targetPersonId !== teacher.personId
        );
      });

    const teacherTargetRows = existingTeacherTargetsInSayh.filter((row) => row.planId === plan.id);
    const teacherEvaluatorRows = existingTeacherEvaluatorsInSayh.filter((row) => row.planId === plan.id);
    const teacherSubmissions = submissionsInSayh.filter((row) => row.planId === plan.id);

    const submissionsByStatus = {};
    for (const sub of teacherSubmissions) {
      const status = sub.status || "MISSING_STATUS";
      submissionsByStatus[status] = (submissionsByStatus[status] || 0) + 1;
    }

    const cyclesWithPattern = new Set(activePatterns.map((row) => row.cycleId).filter(Boolean));
    const missingPatternCycleIds = cycles
      .map((cycle) => cycle.id)
      .filter((cycleId) => !cyclesWithPattern.has(cycleId));

    plans.push({
      planId: plan.id,
      title: plan.title || null,
      frameworkId: plan.frameworkId || null,
      planKind: plan.planKind || null,
      status: plan.status || null,
      targetKind: plan.targetKind || null,

      cyclesCount: cycles.length,
      cycleIds: cycles.map((cycle) => cycle.id),

      teacherAlreadyHasTargetAssignments: teacherTargetRows.length,
      teacherActiveTargetAssignments: teacherTargetRows.filter((row) => row.status === "ACTIVE").length,
      teacherAlreadyHasEvaluatorAssignments: teacherEvaluatorRows.length,
      teacherActiveEvaluatorAssignments: teacherEvaluatorRows.filter((row) => row.status === "ACTIVE").length,

      evaluatorPatterns: groupEvaluatorPatterns(activePatterns),
      missingPatternCycleIds,

      submissionsByStatus,
      canSeedFromExistingPatterns:
        cycles.length > 0 &&
        missingPatternCycleIds.length === 0 &&
        teacherTargetRows.filter((row) => row.status === "ACTIVE").length === 0 &&
        teacherEvaluatorRows.filter((row) => row.status === "ACTIVE").length === 0,
    });
  }

  const report = {
    scope: {
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      email: EMAIL,
    },
    teacher,
    teacherAssignmentsInSchool: {
      activeCount: activeTeacherAssignments.length,
      subjects: [...new Set(activeTeacherAssignments.map((x) => x.subjectKey).filter(Boolean))],
      classIds: [...new Set(activeTeacherAssignments.map((x) => x.classId).filter(Boolean))],
    },
    totals: {
      teacherPlansCount: plans.length,
      existingTargetAssignmentsInSayh: existingTeacherTargetsInSayh.length,
      activeTargetAssignmentsInSayh: existingTeacherTargetsInSayh.filter((row) => row.status === "ACTIVE").length,
      existingEvaluatorAssignmentsInSayh: existingTeacherEvaluatorsInSayh.length,
      activeEvaluatorAssignmentsInSayh: existingTeacherEvaluatorsInSayh.filter((row) => row.status === "ACTIVE").length,
      submissionsInSayh: submissionsInSayh.length,
    },
    plans,
    writesPerformed: false,
    generatedAt: new Date().toISOString(),
  };

  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const safeEmail = EMAIL.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(
    reportsDir,
    `${safeEmail}_${SCHOOL_ID}_evaluation_context_report.json`
  );

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");

  console.dir(
    {
      teacher: report.teacher,
      schoolId: SCHOOL_ID,
      activeTeacherAssignments: report.teacherAssignmentsInSchool.activeCount,
      teacherPlansCount: report.totals.teacherPlansCount,
      activeTargetAssignmentsInSayh: report.totals.activeTargetAssignmentsInSayh,
      activeEvaluatorAssignmentsInSayh: report.totals.activeEvaluatorAssignmentsInSayh,
      submissionsInSayh: report.totals.submissionsInSayh,
      reportFile: filePath,
      writesPerformed: false,
    },
    { depth: 10 }
  );

  console.log("Done. Small JSON report created. No writes performed.");
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});