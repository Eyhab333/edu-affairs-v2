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
  printResults("Guardian provisioning preview (dry run; no Auth or Firestore writes)", results);

  for (const result of results.filter((item) => item.conflicts.length > 0)) {
    console.error(`Row ${result.rowNumber}: ${result.conflicts.join(" | ")}`);
  }

  if (results.some((result) => result.action === "BLOCKED")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Guardian provisioning preview failed:", error);
  process.exitCode = 1;
});
