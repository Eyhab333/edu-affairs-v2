import type { StaffProvisioningInput } from "@takween/contracts";
import {
  buildStaffProvisioningPlan,
  type StaffProvisioningPlan,
} from "@takween/domain";

import {
  resolveStaffProvisioningIdentity,
  type StaffProvisioningIdentityResolution,
} from "./resolve-staff-provisioning-identity";

export type StaffProvisioningPreviewStatus =
  | "READY_TO_CREATE"
  | "READY_TO_UPDATE";

export type StaffProvisioningPreview = {
  status: StaffProvisioningPreviewStatus;

  identity: StaffProvisioningIdentityResolution;

  plan: StaffProvisioningPlan | null;

  pendingAuthCreation: boolean;
  pendingPersonCreation: boolean;
};

export async function previewStaffProvisioning(
  input: StaffProvisioningInput,
): Promise<StaffProvisioningPreview> {
  const identity = await resolveStaffProvisioningIdentity(input);

  const pendingAuthCreation = !identity.authExists;
  const pendingPersonCreation = !identity.personExists;

  /*
   * لا نستطيع بناء الخطة النهائية قبل معرفة uid.
   * إنشاء uid يحدث فقط عند إنشاء Firebase Auth user.
   */
  if (!identity.uid) {
    return {
      status: "READY_TO_CREATE",
      identity,
      plan: null,
      pendingAuthCreation,
      pendingPersonCreation,
    };
  }

  const plan = buildStaffProvisioningPlan({
    input,
    uid: identity.uid,
    personId: identity.personId,
  });

  return {
    status:
      identity.authExists || identity.personExists
        ? "READY_TO_UPDATE"
        : "READY_TO_CREATE",

    identity,
    plan,

    pendingAuthCreation,
    pendingPersonCreation,
  };
}