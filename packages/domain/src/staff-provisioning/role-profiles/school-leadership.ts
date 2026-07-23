import type { StaffProvisioningRoleProfile } from "../types";
import { SCHOOL_PRINCIPAL_OPERATIONS } from "../shared/operation-presets";
import { SCHOOL_PRINCIPAL_PERMISSIONS } from "../shared/permission-presets";
import { SINGLE_SCHOOL_SCOPE } from "../shared/scope-presets";

export const BOYS_PRINCIPAL_ROLE_PROFILE = {
  roleKey: "BOYS_PRINCIPAL",

  scope: SINGLE_SCHOOL_SCOPE,

  permissions: SCHOOL_PRINCIPAL_PERMISSIONS,

  operations: SCHOOL_PRINCIPAL_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const SCHOOL_LEADERSHIP_ROLE_PROFILES = {
  BOYS_PRINCIPAL: BOYS_PRINCIPAL_ROLE_PROFILE,
} as const;