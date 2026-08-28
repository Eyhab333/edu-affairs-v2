const {
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
} = require("./guardian-links-core.cjs");

async function main() {
  const config = getConfig();
  const excel = await readExcelRows(config);
  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  const { results } = await resolveRows({ config, rows: excel.rows });
  printResults("GuardianLink preview (dry run; no Firestore writes)", results);
  results.filter((result) => result.action === "BLOCKED").forEach((result) => console.error(`Row ${result.rowNumber}: ${result.conflicts.join(" | ")}`));
  if (results.some((result) => result.action === "BLOCKED")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("GuardianLink preview failed:", error);
  process.exitCode = 1;
});
