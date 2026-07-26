import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeStaffProvisioningAdmin } from "./initialize-staff-provisioning-admin";

import {
  StaffProvisioningBatchInputSchema,
  StaffProvisioningInputSchema,
} from "@takween/contracts";

import { applyStaffProvisioning } from "./apply-staff-provisioning";

async function main() {
  initializeStaffProvisioningAdmin();

  const inputPath = resolve(
    process.cwd(),
    "staff-provisioning-batch-input.local.json",
  );

  const batchInput = StaffProvisioningBatchInputSchema.parse(
    JSON.parse(readFileSync(inputPath, "utf8")),
  );

  const results: Array<Record<string, unknown>> = [];
  let errors = 0;

  console.log(`سيتم تجهيز ${batchInput.staff.length} موظفين...`);

  for (const member of batchInput.staff) {
    const input = StaffProvisioningInputSchema.parse({
      ...member,

      orgId: batchInput.orgId,
      schoolId: batchInput.schoolId,
      principalPersonId: batchInput.principalPersonId,
    });

    try {
      console.log(`تجهيز: ${input.displayName} · ${input.roleKey}`);

      const result = await applyStaffProvisioning(input);

      results.push({
        success: true,

        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        uid: result.uid,
        personId: result.personId,

        authAction: result.authAction,
        membershipPath: result.membershipPath,

        operationalAssignmentIds: result.operationalAssignmentIds,

        deactivatedAssignmentIds: result.deactivatedAssignmentIds,

        initialPassword: result.initialPassword ?? null,
      });
    } catch (error) {
      errors += 1;

      results.push({
        success: false,

        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          total: results.length,
          succeeded: results.length - errors,
          errors,
        },

        results,
      },
      null,
      2,
    ),
  );

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
