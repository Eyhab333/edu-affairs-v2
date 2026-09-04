const {
  buildOffboardingPlan,
  parseArgs,
  printPlan,
} = require("./teacher-offboarding-core.cjs");

async function main() {
  const plan = await buildOffboardingPlan({ args: parseArgs() });
  printPlan(plan);

  if (plan.blockers.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("Preview complete. No Firebase writes were performed.");
}

main().catch((error) => {
  console.error("Teacher offboarding preview failed:");
  console.error(error.message || error);
  process.exitCode = 1;
});
