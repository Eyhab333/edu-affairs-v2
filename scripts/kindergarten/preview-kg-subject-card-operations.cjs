"use strict";

/*
 * Read-only end-to-end preview for the KG subject-card rollout.
 *
 * It overlays the offering updates planned by the class-repair preview onto
 * the teacher-assignment preview in memory. No Firestore write is possible.
 */

const fs = require("node:fs");
const path = require("node:path");
const { runRepair } = require("./kg-class-repair-core.cjs");
const { buildPlan, publicReport } = require("./kg-teacher-assignment-reconciler-core.cjs");

if (process.argv.some((argument) => argument.startsWith("--apply"))) {
  throw new Error("This preview is read-only and does not accept --apply.");
}

const REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "kindergarten",
  "kg-subject-card-operations-preview-report.json",
);

const VISIBLE_CARD_OPERATIONS = [
  "STUDENT_MEASUREMENTS",
  "LEARNING_LOSS",
  "LESSON_PREP",
  "QUESTION_BANK",
  "HOMEWORK",
  "GAMIFICATION",
  "VIRTUAL_CLASSES",
];

async function main() {
  const repairReport = await runRepair({ apply: false });
  const offeringOverrides = (repairReport._writes || [])
    .filter((write) => write.path.startsWith("orgs/takween/classSubjectOfferings/"))
    .map((write) => write.payload);
  const teacherReport = await buildPlan({ offeringOverrides });
  const operations = teacherReport.actions.filter((action) => action.collection === "operationalAssignments");
  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: "DRY_RUN",
      firestoreWritesPerformed: false,
      offeringOverridesAppliedInMemory: offeringOverrides.length,
    },
    expectedVisibleCardOperations: VISIBLE_CARD_OPERATIONS,
    offeringRepair: {
      summary: repairReport.summary,
      blockers: repairReport.blockers,
      configuredOfferingWrites: offeringOverrides.length,
    },
    teacherProvisioningAfterOfferingNormalization: publicReport(teacherReport),
    operationalAssignmentSummary: {
      create: operations.filter((action) => action.action === "CREATE").length,
      keep: operations.filter((action) => action.action === "KEEP").length,
      end: operations.filter((action) => action.action === "END").length,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    mode: report.metadata.mode,
    firestoreWritesPerformed: false,
    expectedVisibleCardOperations: report.expectedVisibleCardOperations,
    offeringRepair: report.offeringRepair,
    operationalAssignmentSummary: report.operationalAssignmentSummary,
    teacherProvisioningSummary: teacherReport.summary,
    blockers: [...repairReport.blockers, ...teacherReport.blockers],
    reportPath: REPORT_PATH,
  }, null, 2));
  if (repairReport.blockers.length > 0 || teacherReport.blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("KG subject-card operations preview failed:", error.stack || error);
  process.exitCode = 1;
});
