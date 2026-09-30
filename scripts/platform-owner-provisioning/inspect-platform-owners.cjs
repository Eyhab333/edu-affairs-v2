const {
  initAdmin,
  loadConfig,
  inspectTarget,
  publicState,
  writeReport,
} = require("./_shared.cjs");

async function main() {
  const context = initAdmin();
  const config = loadConfig();

  console.log("PLATFORM OWNER INSPECT - READ ONLY");
  console.log(`Project: ${context.projectId}`);
  console.log(`Org: ${config.orgId}`);
  console.log("");

  const results = [];

  for (const target of config.targets) {
    const state = await inspectTarget(context, config, target);
    results.push(publicState(state));

    console.dir(
      {
        key: state.key,
        email: state.email,
        authExists: state.auth.exists,
        uid: state.auth.uid || null,
        userPersonId: state.user.personId || null,
        resolvedPersonId: state.identity.resolvedPersonId || null,
        identitySource: state.identity.source,
        currentRoleKey: state.membership.roleKey || null,
        guardianRecords: state.guardian.guardianRecords,
        guardianLinks: state.guardian.guardianLinks,
        blockingIssues: state.blockingIssues,
      },
      { depth: 8 },
    );
  }

  const reportPath = writeReport("inspect-platform-owners", {
    mode: "INSPECT",
    writesPerformed: false,
    orgId: config.orgId,
    results,
  });

  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log("No writes performed.");
}

main().catch((error) => {
  console.error("Inspect failed:");
  console.error(error);
  process.exit(1);
});
