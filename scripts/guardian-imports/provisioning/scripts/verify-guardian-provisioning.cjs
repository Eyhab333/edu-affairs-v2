const {
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
} = require("./guardian-provisioning-core.cjs");

async function main() {
  const config = getConfig();
  const excel = await readExcelRows(config);

  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const { results } = await resolveRows({ config, rows: excel.rows });
  printResults("Guardian provisioning verification (read only)", results);

  const unresolved = results.filter(
    (result) => result.action !== "KEEP_EXISTING" && result.action !== "EXISTING_STAFF",
  );
  if (unresolved.length > 0) {
    unresolved.forEach((result) => {
      console.error(`Row ${result.rowNumber} remains ${result.action}: ${result.conflicts.join(" | ")}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Guardian provisioning verification failed:", error);
  process.exitCode = 1;
});
