const {
  initAdmin,
  loadConfig,
  inspectTarget,
  buildPreviewAction,
  publicState,
  writeReport,
} = require("./_shared.cjs");

async function main() {
  const context = initAdmin();
  const config = loadConfig();

  console.log("PLATFORM OWNER PREVIEW - READ ONLY");
  console.log(`Project: ${context.projectId}`);
  console.log(`Org: ${config.orgId}`);
  console.log("");

  const states = [];
  const actions = [];

  for (const target of config.targets) {
    const state = await inspectTarget(context, config, target);
    const action = buildPreviewAction(state, target);

    states.push(publicState(state));
    actions.push(action);

    console.dir(action, { depth: 8 });
  }

  const blocked = actions.filter((item) => !item.safeToApply);

  const reportPath = writeReport("preview-platform-owners", {
    mode: "PREVIEW",
    writesPerformed: false,
    orgId: config.orgId,
    safeToApply: blocked.length === 0,
    blockedCount: blocked.length,
    states,
    actions,
  });

  console.log("");
  console.log(`Report: ${reportPath}`);

  if (blocked.length) {
    console.error(
      `PREVIEW BLOCKED: ${blocked.length} target(s) have blocking issues.`,
    );
    process.exitCode = 2;
    return;
  }

  console.log("SAFE_PREVIEW");
  console.log("No writes performed.");
}

main().catch((error) => {
  console.error("Preview failed:");
  console.error(error);
  process.exit(1);
});
