const {
  APPLY_REPORT_FILE,
  buildOffboardingPlan,
  isActiveClassLink,
  isActiveEvaluationAssignment,
  isActiveMembership,
  isActiveProjectRecord,
  parseArgs,
  readApplyReport,
} = require("./teacher-offboarding-core.cjs");

async function main() {
  const plan = await buildOffboardingPlan({ args: parseArgs() });

  if (plan.blockers.length > 0) {
    console.table(plan.totals);
    console.error("Verification is blocked because the identity or scope cannot be proven safe.");
    process.exitCode = 1;
    return;
  }

  const state = plan.state;
  const activeTeacherAssignments = state.teacherAssignments.filter((item) =>
    isActiveProjectRecord(item.data),
  );
  const activeClassLinks = state.classLinks.filter((item) =>
    isActiveClassLink(item.data),
  );
  const activeOperationalAssignments = state.operationalAssignments.filter((item) =>
    isActiveProjectRecord(item.data),
  );
  const activeEvaluationWorkItems = [
    ...state.evaluationTargetAssignments,
    ...state.evaluationEvaluatorAssignments,
  ].filter((item) => isActiveEvaluationAssignment(item.data));

  const applyReport = readApplyReport();
  const reportMatchesIdentity =
    applyReport &&
    applyReport.uid === state.uid &&
    applyReport.personId === state.personId;
  const historicalPaths = reportMatchesIdentity
    ? applyReport.historicalEvaluationPaths || []
    : [];
  const historicalSnapshots = await Promise.all(
    historicalPaths.map((item) => plan.db.doc(item).get()),
  );
  const missingHistoricalPaths = historicalSnapshots
    .filter((item) => !item.exists)
    .map((item) => item.ref.path);

  const checks = [
    { check: "AUTH_DISABLED", passed: state.authUser.disabled === true, value: state.authUser.disabled },
    {
      check: "MEMBERSHIP_INACTIVE",
      passed:
        !isActiveMembership(state.userMembership.data) &&
        !isActiveMembership(state.orgMembership.data),
      value: `${state.userMembership.data.isActive}/${state.orgMembership.data.isActive}`,
    },
    { check: "ACTIVE_TEACHER_ASSIGNMENTS", passed: activeTeacherAssignments.length === 0, value: activeTeacherAssignments.length },
    { check: "ACTIVE_CLASS_LINKS", passed: activeClassLinks.length === 0, value: activeClassLinks.length },
    { check: "ACTIVE_OPERATIONAL_ASSIGNMENTS", passed: activeOperationalAssignments.length === 0, value: activeOperationalAssignments.length },
    { check: "ACTIVE_EVALUATION_WORK_ITEMS", passed: activeEvaluationWorkItems.length === 0, value: activeEvaluationWorkItems.length },
    {
      check: "HISTORICAL_EVALUATION_DATA_PRESERVED",
      passed: Boolean(reportMatchesIdentity) && missingHistoricalPaths.length === 0,
      value: reportMatchesIdentity
        ? `${historicalPaths.length - missingHistoricalPaths.length}/${historicalPaths.length}`
        : `Apply report not found or does not match identity: ${APPLY_REPORT_FILE}`,
    },
  ];

  console.table(checks);

  if (checks.some((item) => !item.passed)) {
    process.exitCode = 1;
    return;
  }

  console.log("Teacher offboarding verification passed.");
}

main().catch((error) => {
  console.error("Teacher offboarding verification failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
