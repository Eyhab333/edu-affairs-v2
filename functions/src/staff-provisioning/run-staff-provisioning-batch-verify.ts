import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  StaffProvisioningBatchInputSchema,
  StaffProvisioningInputSchema,
} from "@takween/contracts";

import { initializeStaffProvisioningAdmin } from "./initialize-staff-provisioning-admin";
import { verifyStaffProvisioning } from "./verify-staff-provisioning";

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
  let failed = 0;
  let errors = 0;

  for (const member of batchInput.staff) {
    const input = StaffProvisioningInputSchema.parse({
      ...member,

      orgId: batchInput.orgId,
      schoolId: batchInput.schoolId,
      principalPersonId: batchInput.principalPersonId,
    });

    try {
      const result = await verifyStaffProvisioning(input);

      if (!result.passed) {
        failed += 1;
      }

      results.push({
        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        passed: result.passed,
        uid: result.uid,
        personId: result.personId,

        checks: result.checks,
      });
    } catch (error) {
      errors += 1;

      results.push({
        displayName: input.displayName,
        email: input.email,
        roleKey: input.roleKey,

        passed: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        summary: {
          total: results.length,
          passed: results.length - failed - errors,
          failed,
          errors,
        },

        results,
      },
      null,
      2,
    ),
  );

  if (failed > 0 || errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});