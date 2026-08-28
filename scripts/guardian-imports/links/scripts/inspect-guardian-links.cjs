const {
  EXPECTED_HEADERS,
  getConfig,
  printResults,
  readExcelRows,
} = require("./guardian-links-core.cjs");

async function main() {
  const config = getConfig();
  const excel = await readExcelRows(config);
  console.log({ inputFile: config.inputFile, worksheet: excel.worksheetName, expectedHeaders: EXPECTED_HEADERS });
  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  const rows = excel.rows.map((row) => ({ ...row, action: row.errors.length > 0 ? "BLOCKED" : "VALID", guardian: "", student: "", guardianLink: "", guardianId: "", studentId: "", guardianLinkId: "", conflicts: row.errors }));
  printResults("GuardianLink Excel inspection (no Firebase access)", rows);
  if (rows.some((row) => row.errors.length > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("GuardianLink inspection failed:", error);
  process.exitCode = 1;
});
