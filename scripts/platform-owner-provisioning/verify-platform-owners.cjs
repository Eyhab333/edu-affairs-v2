const {
  initAdmin,
  loadConfig,
  verifyTarget,
  writeReport,
} = require("./_shared.cjs");

async function main() {
  const context = initAdmin();
  const config = loadConfig();

  console.log("PLATFORM OWNER VERIFY - READ ONLY");
  console.log(`Project: ${context.projectId}`);
  console.log(`Org: ${config.orgId}`);
  console.log("");

  const results = [];

  for (const target of config.targets) {
    const result = await verifyTarget(context, config, target);
    results.push(result);
    console.dir(result, { depth: 8 });
  }

  const failed = results.filter((item) => !item.ok);

  const reportPath = writeReport("verify-platform-owners", {
    mode: "VERIFY",
    writesPerformed: false,
    orgId: config.orgId,
    allPassed: failed.length === 0,
    results,
  });

  console.log("");
  console.log(`Report: ${reportPath}`);

  if (failed.length) {
    console.error(`VERIFY FAILED: ${failed.length} target(s).`);
    process.exitCode = 2;
    return;
  }

  console.log("VERIFY PASSED.");
}

main().catch((error) => {
  console.error("Verify failed:");
  console.error(error);
  process.exit(1);
});
