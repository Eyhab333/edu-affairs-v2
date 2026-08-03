import type { StaffProvisioningInput } from "@takween/contracts";

import {
  buildStaffProvisioningPlan,
  type StaffProvisioningPlan,
} from "@takween/domain";

import {
  resolveStaffProvisioningIdentity,
  type StaffProvisioningIdentityResolution,
} from "./resolve-staff-provisioning-identity";

import {
  resolveStaffProvisioningScope,
  type ResolvedStaffProvisioningScope,
} from "./resolve-staff-provisioning-scope";

export type StaffProvisioningPreviewStatus =
  | "READY_TO_CREATE"
  | "READY_TO_UPDATE";

export type StaffProvisioningPreview = {
  status: StaffProvisioningPreviewStatus;

  identity: StaffProvisioningIdentityResolution;

  scope: ResolvedStaffProvisioningScope;

  plan: StaffProvisioningPlan;

  pendingAuthCreation: boolean;
  pendingPersonCreation: boolean;
};

export async function previewStaffProvisioning(
  rawInput: StaffProvisioningInput,
): Promise<StaffProvisioningPreview> {
  /*
   * نحل مجموعات المدارس أولًا، ثم نمرر Input النهائي
   * إلى الهوية والـDomain.
   */
  const scope = await resolveStaffProvisioningScope(rawInput);

  const input = scope.input;

  const identity =
    await resolveStaffProvisioningIdentity(input);

  const pendingAuthCreation = !identity.authExists;
  const pendingPersonCreation = !identity.personExists;

  const plan = buildStaffProvisioningPlan({
    input,

    uid:
      identity.uid ||
      "__PENDING_AUTH_UID__",

    personId:
      identity.personId ||
      "__PENDING_PERSON_ID__",
  });

  return {
    status: identity.authExists
      ? "READY_TO_UPDATE"
      : "READY_TO_CREATE",

    identity,
    scope,
    plan,

    pendingAuthCreation,
    pendingPersonCreation,
  };
}