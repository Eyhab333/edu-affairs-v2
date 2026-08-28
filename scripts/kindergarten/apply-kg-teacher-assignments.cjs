"use strict";

const { applyPlan, buildPlan, initAdmin, publicReport } = require("./kg-teacher-assignment-reconciler-core.cjs");

const APPLY_TOKEN = "APPLY_KG_TEACHER_ASSIGNMENTS";

async function main() {
  const applyArguments = process.argv.filter((argument) => argument.startsWith("--apply="));
  if (applyArguments.length > 1 || (applyArguments.length === 1 && applyArguments[0] !== `--apply=${APPLY_TOKEN}`)) {
    throw new Error(`Refusing to apply: use --apply=${APPLY_TOKEN}`);
  }

  initAdmin();
  const report = await buildPlan();
  const applying = applyArguments.length === 1;
  if (applying) {
    const count = await applyPlan(report);
    report.metadata.mode = "APPLY";
    report.metadata.firestoreWritesPerformed = true;
    report.metadata.firestoreWriteCount = count;
  } else {
    report.metadata.mode = "DRY_RUN";
    report.metadata.firestoreWritesPerformed = false;
  }
  console.log(JSON.stringify(publicReport(report), null, 2));
  if (report.blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "BLOCKED", blockers: [error.message] }, null, 2));
  process.exitCode = 1;
});
