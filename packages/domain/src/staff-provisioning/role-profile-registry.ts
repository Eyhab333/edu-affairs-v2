import type { StaffProvisioningRoleKey } from "@takween/contracts";

import { SCHOOL_LEADERSHIP_ROLE_PROFILES } from "./role-profiles/school-leadership";
import type { StaffProvisioningRoleProfile } from "./types";

export const STAFF_PROVISIONING_ROLE_PROFILES = {
  ...SCHOOL_LEADERSHIP_ROLE_PROFILES,
} satisfies Record<StaffProvisioningRoleKey, StaffProvisioningRoleProfile>;

export function getStaffProvisioningRoleProfile(
  roleKey: StaffProvisioningRoleKey,
): StaffProvisioningRoleProfile {
  return STAFF_PROVISIONING_ROLE_PROFILES[roleKey];
}


// وظيفته الوحيدة:
// BOYS_PRINCIPAL
// → ملف صلاحيات وإسنادات الدور
// وأي دور نضيفه لاحقًا سيُجمع هنا دون وضع تفاصيله داخل الملف.


