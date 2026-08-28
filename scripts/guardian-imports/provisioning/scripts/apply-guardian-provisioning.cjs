const {
  APPLY_TOKEN,
  applyGuardianResult,
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
} = require("./guardian-provisioning-core.cjs");

async function main() {
  const config = getConfig();
  const isApply = config.args.apply === APPLY_TOKEN;
  const excel = await readExcelRows(config);

  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const { auth, db, results } = await resolveRows({ config, rows: excel.rows });
  printResults(
    isApply
      ? "Guardian provisioning apply plan"
      : `Guardian provisioning dry run (pass --apply=${APPLY_TOKEN} to write)`,
    results,
  );

  if (!isApply) {
    process.exitCode = results.some((result) => result.action === "BLOCKED") ? 1 : 0;
    return;
  }

  const applied = [];
  for (const result of results) {
    applied.push(await applyGuardianResult({ auth, db, orgId: config.orgId, result }));
  }

  console.table(applied);
  if (applied.some((item) => item.action === "BLOCKED")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Guardian provisioning apply failed:", error);
  process.exitCode = 1;
});
