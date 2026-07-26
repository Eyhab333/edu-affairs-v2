import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeStaffProvisioningAdmin } from "./initialize-staff-provisioning-admin";

import { StaffProvisioningInputSchema } from "@takween/contracts";

import { previewStaffProvisioning } from "./preview-staff-provisioning";

async function main() {
  initializeStaffProvisioningAdmin();

  const inputPath = resolve(
    process.cwd(),
    "staff-provisioning-input.local.json",
  );

  const rawInput = JSON.parse(readFileSync(inputPath, "utf8"));

  const input = StaffProvisioningInputSchema.parse(rawInput);

  const preview = await previewStaffProvisioning(input);

  console.log(
    JSON.stringify(
      {
        status: preview.status,

        identity: {
          authExists: preview.identity.authExists,
          personExists: preview.identity.personExists,
          personMatchSource: preview.identity.personMatchSource,
          uid: preview.identity.uid || null,
          personId: preview.identity.personId || null,
        },

        pendingAuthCreation: preview.pendingAuthCreation,

        pendingPersonCreation: preview.pendingPersonCreation,

        plannedMembership: preview.plan
          ? {
              roleKey: preview.plan.membership.roleKey,
              scopeType: preview.plan.membership.scopeType,
              scopeId: preview.plan.membership.scopeId,
              schoolIds: preview.plan.membership.scopes?.schoolIds,
              principalPersonId: preview.plan.membership.principalPersonId,
            }
          : null,

        plannedOperations:
          preview.plan?.operationalAssignments.map((assignment) => ({
            id: assignment.id,
            operationKind: assignment.operationKind,
            scopeId: assignment.scopeId,
          })) ?? [],
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
