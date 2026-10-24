#!/usr/bin/env node

const {
  ORG_ID,
  buildPreviewRecords,
  findAssignmentInconsistencies,
  findMembershipRoleFieldInconsistencies,
  initAdmin,
  loadOrganizationState,
  relativeReportPath,
  summarize,
  writeReport,
} = require("./_case-recipient-core.cjs");

async function main() {
  const context = initAdmin();
  const now = Date.now();
  const state = await loadOrganizationState(context.db);
  const records = buildPreviewRecords(state, now);
  const summary = summarize(records);
  const assignmentInconsistencies = findAssignmentInconsistencies(
    state,
    records,
    now,
  );
  const membershipRoleFieldInconsistencies =
    findMembershipRoleFieldInconsistencies(records);

  const report = {
    reportType: "STUDENT_CASE_RECIPIENT_PREVIEW",
    generatedAt: new Date(now).toISOString(),
    reviewed: false,
    reviewedAt: "",
    orgId: ORG_ID,
    projectId: context.projectId,
    sourceCounts: state.counts,
    eligibleRoleKeys: [
      "BOYS_PRINCIPAL",
      "BOYS_VP",
      "BOYS_EDU_VP",
      "BOYS_STUDENTS_VP",
      "BOYS_STUDENT_GUIDE",
      "GIRLS_PRINCIPAL",
      "GIRLS_VP",
      "GIRLS_STUDENT_COUNSELOR",
      "KG_PRINCIPAL",
      "KG_VP",
    ],
    summary,
    assignmentInconsistencies,
    membershipRoleFieldInconsistencies,
    records,
  };
  const reportPath = writeReport("case-recipients-preview", report);

  console.log("");
  console.log("Student case recipient preview (read-only)");
  console.log("Org: " + ORG_ID);
  console.log("Firestore project: " + context.projectId);
  console.log("");
  console.table(
    records.map((item) => ({
      schoolId: item.schoolId || "<none>",
      schoolName: item.schoolName || "<unknown>",
      personId: item.personId || "<missing>",
      employeeName: item.employeeName || "<missing>",
      roleKey: item.roleKey || "<missing>",
      membershipId: item.membershipId,
      existingAssignmentIds: item.existingMatchingAssignments
        .map((assignment) => assignment.id)
        .join(", "),
      action: item.action,
      reason: item.reason,
    })),
  );
  console.log("");
  console.log("Summary by school and role:");
  console.table(summary.bySchoolAndRole);
  console.log("Totals: " + JSON.stringify(summary.totals));
  console.log(
    "Active case-handling assignment inconsistencies: " +
      assignmentInconsistencies.length,
  );
  console.log(
    "Membership role/roleKey field inconsistencies (roleKey takes precedence): " +
      membershipRoleFieldInconsistencies.length,
  );
  console.log("Report: " + relativeReportPath(reportPath));
  console.log("");
  console.log(
    "To apply reviewed CREATE records, set reviewed=true and reviewedAt in a copy of this report, then use apply-case-recipients.cjs --apply --report <reviewed-report-path>.",
  );
}

main().catch((error) => {
  console.error("Preview failed:", error);
  process.exitCode = 1;
});
