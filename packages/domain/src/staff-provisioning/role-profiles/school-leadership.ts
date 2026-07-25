import type { StaffProvisioningRoleProfile } from "../types";
import {
  SCHOOL_PRINCIPAL_OPERATIONS,
  SCHOOL_VP_OPERATIONS,
  SCHOOL_EDU_VP_OPERATIONS
} from "../shared/operation-presets";
import {
   SCHOOL_PRINCIPAL_PERMISSIONS,
   SCHOOL_EDU_VP_PERMISSIONS
} from "../shared/permission-presets";
import { SINGLE_SCHOOL_SCOPE } from "../shared/scope-presets";

export const BOYS_PRINCIPAL_ROLE_PROFILE = {
  roleKey: "BOYS_PRINCIPAL",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "SELF",
  },

  permissions: SCHOOL_PRINCIPAL_PERMISSIONS,

  operations: SCHOOL_PRINCIPAL_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const BOYS_VP_ROLE_PROFILE = {
  ...BOYS_PRINCIPAL_ROLE_PROFILE,

  roleKey: "BOYS_VP",

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },
  operations: SCHOOL_VP_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;


export const BOYS_EDU_VP_ROLE_PROFILE = {
  roleKey: "BOYS_EDU_VP",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },

  permissions: SCHOOL_EDU_VP_PERMISSIONS,

  operations: SCHOOL_EDU_VP_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;


export const SCHOOL_LEADERSHIP_ROLE_PROFILES = {
  BOYS_PRINCIPAL: BOYS_PRINCIPAL_ROLE_PROFILE,
  BOYS_VP: BOYS_VP_ROLE_PROFILE,
  BOYS_EDU_VP: BOYS_EDU_VP_ROLE_PROFILE,  
} as const;
