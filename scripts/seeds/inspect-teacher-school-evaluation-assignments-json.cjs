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
const EMAIL = getArg("email");
const SCHOOL_ID = getArg("school");

if (!EMAIL || !SCHOOL_ID) {
  console.error(`
Missing args.

Usage:
node .\\scripts\\seeds\\inspect-teacher-school-evaluation-assignments-json.cjs --email=hameed-s@qz.org.sa --school=mrb-boys-faleh
`);
  process.exit(1);
}

function isActive(row) {
  return row.status === "ACTIVE";
}

async function resolveTeacher() {
  const snap = await db.collection("users").where("email", "==", EMAIL).limit(10).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected exactly one user for ${EMAIL}, found ${users.length}`);
  }

  const user = users[0];

  if (!user.personId) {
    throw new Error(`User has no personId: ${EMAIL}`);
  }

  return {
    email: user.email,
    uid: user.uid || user.id,
    personId: user.personId,
    displayName: user.displayName || "",
  };
}

async function main() {
  console.log("Inspect mode only - no writes");

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

  const submissionSnap = await orgRef
    .collection("evaluationSubmissions")
    .where("targetPersonId", "==", teacher.personId)
    .get();

  const activeTargets = targetSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const activeEvaluators = evaluatorSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID && isActive(row));

  const submissions = submissionSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => row.schoolId === SCHOOL_ID);

  const planIds = [
    ...new Set([
      ...activeTargets.map((x) => x.planId).filter(Boolean),
      ...activeEvaluators.map((x) => x.planId).filter(Boolean),
    ]),
  ];

  const plans = [];

  for (const planId of planIds) {
    const planDoc = await orgRef.collection("evaluationPlans").doc(planId).get();
    const plan = planDoc.exists ? { id: planDoc.id, ...planDoc.data() } : null;

    const planTargets = activeTargets.filter((x) => x.planId === planId);
    const planEvaluators = activeEvaluators.filter((x) => x.planId === planId);
    const planSubmissions = submissions.filter((x) => x.planId === planId);

    const submissionsByStatus = {};
    for (const sub of planSubmissions) {
      const key = sub.status || "MISSING_STATUS";
      submissionsByStatus[key] = (submissionsByStatus[key] || 0) + 1;
    }

    const evaluatorMap = {};
    for (const ev of planEvaluators) {
      const key = `${ev.evaluatorPersonId || "MISSING"}__${ev.evaluatorRoleKey || "MISSING"}`;
      evaluatorMap[key] ??= {
        evaluatorPersonId: ev.evaluatorPersonId || null,
        evaluatorRoleKey: ev.evaluatorRoleKey || null,
        count: 0,
        cycleIds: [],
      };
      evaluatorMap[key].count++;
      if (ev.cycleId && !evaluatorMap[key].cycleIds.includes(ev.cycleId)) {
        evaluatorMap[key].cycleIds.push(ev.cycleId);
      }
    }

    plans.push({
      planId,
      planExists: !!plan,
      title: plan?.title || null,
      shortTitle: plan?.shortTitle || null,
      frameworkId: plan?.frameworkId || null,
      planKind: plan?.planKind || null,
      targetKind: plan?.targetKind || null,
      status: plan?.status || null,
      schoolId: plan?.schoolId || null,
      academicYearId: plan?.academicYearId || null,
      termId: plan?.termId || null,
      activeTargetAssignmentsCount: planTargets.length,
      activeEvaluatorAssignmentsCount: planEvaluators.length,
      evaluators: Object.values(evaluatorMap),
      cycleIds: [...new Set(planEvaluators.map((x) => x.cycleId).filter(Boolean))],
      submissionsByStatus,
      activeTargetAssignmentIds: planTargets.map((x) => x.id),
      activeEvaluatorAssignmentIds: planEvaluators.map((x) => x.id),
      recommendedAction:
        plan?.targetKind === "TEACHER" || !plan
          ? "Candidate for REMOVED if no submitted/approved submissions"
          : "Skip: not TEACHER plan",
    });
  }

  const candidatePlanIdsToRemoveFrom = plans
    .filter((p) => p.targetKind === "TEACHER" || !p.planExists)
    .map((p) => p.planId);

  const report = {
    scope: {
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      email: EMAIL,
    },
    teacher,
    totals: {
      activeTargetAssignmentsCount: activeTargets.length,
      activeEvaluatorAssignmentsCount: activeEvaluators.length,
      submissionsCount: submissions.length,
      plansCount: plans.length,
    },
    plans,
    candidatePlanIdsToRemoveFrom,
    writesPerformed: false,
    generatedAt: new Date().toISOString(),
  };

  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const safeEmail = EMAIL.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(
    reportsDir,
    `${safeEmail}_${SCHOOL_ID}_evaluation_assignments_report.json`
  );

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");

  console.dir(
    {
      teacher,
      schoolId: SCHOOL_ID,
      activeTargetAssignmentsCount: activeTargets.length,
      activeEvaluatorAssignmentsCount: activeEvaluators.length,
      plansCount: plans.length,
      candidatePlanIdsToRemoveFrom,
      reportFile: filePath,
      writesPerformed: false,
    },
    { depth: 10 }
  );

  console.log("Done. JSON report created. No writes performed.");
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});