import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { StaffProvisioningInputSchema } from "@takween/contracts";

import { applyStaffProvisioning } from "./apply-staff-provisioning";
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

  console.log("سيتم تجهيز المستخدم:");
  console.log(`${input.displayName} · ${input.email}`);
  console.log(`${input.roleKey} · ${input.schoolId}`);

  const result = await applyStaffProvisioning(input);

  console.log(
    JSON.stringify(
      {
        success: true,
        uid: result.uid,
        personId: result.personId,
        authAction: result.authAction,
        membershipPath: result.membershipPath,
        operationalAssignmentIds: result.operationalAssignmentIds,
        deactivatedAssignmentIds: result.deactivatedAssignmentIds,
        initialPassword: result.initialPassword ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
