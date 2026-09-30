const {
  initAdmin,
  loadConfig,
  inspectTarget,
  buildPreviewAction,
  applyTarget,
  publicState,
  writeReport,
} = require("./_shared.cjs");

function hasConfirmation() {
  return process.argv.includes("--confirm=PLATFORM_OWNER");
}

async function main() {
  if (!hasConfirmation()) {
    throw new Error(
      [
        "Apply requires explicit confirmation.",
        "Run:",
        "node scripts/platform-owner-provisioning/apply-platform-owners.cjs --confirm=PLATFORM_OWNER",
      ].join("\n"),
    );
  }

  const context = initAdmin();
  const config = loadConfig();

  console.log("PLATFORM OWNER APPLY");
  console.log(`Project: ${context.projectId}`);
  console.log(`Org: ${config.orgId}`);
  console.log("");

  // Safety gate: inspect every target first. No writes if any target is blocked.
  const beforeStates = [];
  const previewActions = [];

  for (const target of config.targets) {
    const state = await inspectTarget(context, config, target);
    const action = buildPreviewAction(state, target);

    beforeStates.push({ target, state });
    previewActions.push(action);
  }

  const blocked = previewActions.filter((item) => !item.safeToApply);

  const beforeReportPath = writeReport("before-apply-platform-owners", {
    mode: "BEFORE_APPLY",
    writesPerformed: false,
    orgId: config.orgId,
    states: beforeStates.map(({ state }) => publicState(state)),
    actions: previewActions,
  });

  console.log(`Before-apply report: ${beforeReportPath}`);

  if (blocked.length) {
    console.dir(blocked, { depth: 10 });
    throw new Error(
      `Apply aborted. ${blocked.length} target(s) have blocking issues.`,
    );
  }

  const results = [];

  for (const { target, state } of beforeStates) {
    const result = await applyTarget(context, config, target, state);
    results.push(result);
    console.dir(result, { depth: 8 });
  }

  const applyReportPath = writeReport("apply-platform-owners", {
    mode: "APPLY",
    writesPerformed: true,
    orgId: config.orgId,
    results,
  });

  console.log("");
  console.log(`Apply report: ${applyReportPath}`);
  console.log("Apply completed.");
  console.log(
    "Next: node scripts/platform-owner-provisioning/verify-platform-owners.cjs",
  );
}

main().catch((error) => {
  console.error("Apply failed:");
  console.error(error);
  process.exit(1);
});
