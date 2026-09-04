const {
  applyOffboardingPlan,
  buildOffboardingPlan,
  parseArgs,
  printPlan,
} = require("./teacher-offboarding-core.cjs");

const APPLY_CONFIRMATION = "APPLY_TEACHER_OFFBOARDING";

async function main() {
  const args = parseArgs();
  const applyMode = args.apply === APPLY_CONFIRMATION;

  if (args.apply && !applyMode) {
    throw new Error(`Invalid apply confirmation. Expected --apply=${APPLY_CONFIRMATION}.`);
  }

  const plan = await buildOffboardingPlan({ args });
  printPlan(plan);

  if (plan.blockers.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!applyMode) {
    console.log("DRY_RUN complete. No Firebase writes were performed.");
    console.log(`Apply with --apply=${APPLY_CONFIRMATION}`);
    return;
  }

  const appliedActions = await applyOffboardingPlan(plan);
  console.log({ appliedActions: appliedActions.length });
  console.log("Teacher offboarding applied successfully.");
}

main().catch((error) => {
  console.error("Teacher offboarding apply failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
