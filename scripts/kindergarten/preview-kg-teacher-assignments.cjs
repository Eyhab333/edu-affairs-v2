"use strict";

const { buildPlan, initAdmin, publicReport } = require("./kg-teacher-assignment-reconciler-core.cjs");

async function main() {
  initAdmin();
  const report = await buildPlan();
  console.log(JSON.stringify(publicReport(report), null, 2));
  if (report.blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "BLOCKED", blockers: [error.message] }, null, 2));
  process.exitCode = 1;
});
