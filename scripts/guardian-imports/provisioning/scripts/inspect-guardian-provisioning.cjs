const {
  EXPECTED_HEADERS,
  getConfig,
  printResults,
  readExcelRows,
} = require("./guardian-provisioning-core.cjs");

async function main() {
  const config = getConfig();
  const excel = await readExcelRows(config);

  console.log({
    inputFile: config.inputFile,
    worksheet: excel.worksheetName,
    expectedHeaders: EXPECTED_HEADERS,
  });

  if (excel.headerErrors.length > 0) {
    excel.headerErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const rows = excel.rows.map((row) => ({
    ...row,
    action: row.errors.length > 0 ? "BLOCKED" : "KEEP_EXISTING",
    uid: "",
    personId: "",
    guardianId: "",
    conflicts: row.errors,
  }));
  printResults("Guardian provisioning Excel inspection (no Firebase access)", rows);

  if (rows.some((row) => row.errors.length > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Guardian provisioning inspection failed:", error);
  process.exitCode = 1;
});
