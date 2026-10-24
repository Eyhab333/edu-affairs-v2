"use strict";

const { buildPlan, writeReport } = require("./config.cjs");

if (process.argv.some((argument) => argument.startsWith("--apply"))) {
  throw new Error("Preview is read-only and does not accept --apply.");
}

async function main() {
  const { report } = await buildPlan();
  const reportPath = writeReport("preview", report);
  console.log("KG1 VALUES/CORNERS preview — Firestore writes: 0");
  console.table(report.targets.map((target) => ({ schoolId: target.target.schoolId, classId: target.target.classId, subjectKey: target.target.subjectKey, teacherPersonId: target.target.teacherPersonId, status: Array.isArray(target.status) ? target.status.join(", ") : target.status, archivedLegacyOfferings: target.archivedLegacyOfferings.length })));
  console.log("Planned creates:", report.summary.writeCounts);
  console.log("Conflicts:", report.summary.conflictsCount, "Review required:", report.summary.reviewRequiredCount, "Blockers:", report.summary.blockersCount);
  console.log("Safe to apply:", report.summary.safeToApply);
  console.log("Report:", reportPath);
  if (!report.summary.safeToApply) process.exitCode = 1;
}

main().catch((error) => { console.error("KG1 VALUES/CORNERS preview failed:", error.stack || error); process.exitCode = 1; });
