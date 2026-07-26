import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { StaffProvisioningInputSchema } from "@takween/contracts";

import { verifyStaffProvisioning } from "./verify-staff-provisioning";
import { initializeStaffProvisioningAdmin } from "./initialize-staff-provisioning-admin";

async function main() {
  initializeStaffProvisioningAdmin();

  const inputPath = resolve(
    process.cwd(),
    "staff-provisioning-input.local.json",
  );

  const input = StaffProvisioningInputSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );

  const result = await verifyStaffProvisioning(input);

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
