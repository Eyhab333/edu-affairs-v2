const {
  APPLY_TOKEN,
  applyStudentResult,
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
} = require("./student-provisioning-core.cjs");

async function main() {
  const config = getConfig();
  const isApply = config.args.apply === APPLY_TOKEN;
  const excel = await readExcelRows(config);
  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  const { db, results } = await resolveRows({ config, rows: excel.rows });
  printResults(isApply ? "Student provisioning apply plan" : `Student provisioning dry run (pass --apply=${APPLY_TOKEN} to write)`, results);
  if (!isApply) {
    if (results.some((result) => result.action === "BLOCKED")) process.exitCode = 1;
    return;
  }
  const applied = [];
  for (const result of results) applied.push(await applyStudentResult({ db, orgId: config.orgId, result }));
  console.table(applied);
  if (applied.some((result) => result.action === "BLOCKED")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Student provisioning apply failed:", error);
  process.exitCode = 1;
});
