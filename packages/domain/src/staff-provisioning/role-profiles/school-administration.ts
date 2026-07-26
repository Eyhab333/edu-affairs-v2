import type { StaffProvisioningRoleProfile } from "../types";

import {
  SCHOOL_ACTIVITY_COORD_OPERATIONS,
  SCHOOL_EVALUATION_ONLY_OPERATIONS,
  SCHOOL_STUDENT_GUIDE_OPERATIONS,
} from "../shared/operation-presets";

import {
  SCHOOL_EVALUATION_STAFF_PERMISSIONS,
  SCHOOL_STUDENT_GUIDE_PERMISSIONS,
} from "../shared/permission-presets";

import { SINGLE_SCHOOL_SCOPE } from "../shared/scope-presets";

export const ADMIN_ASSISTANT_ROLE_PROFILE = {
  roleKey: "ADMIN_ASSISTANT",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const ACTIVITY_COORD_ROLE_PROFILE = {
  roleKey: "ACTIVITY_COORD",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_ACTIVITY_COORD_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const MEDIA_SPECIALIST_ROLE_PROFILE = {
  roleKey: "MEDIA_SPECIALIST",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const BOYS_STUDENT_GUIDE_ROLE_PROFILE = {
  roleKey: "BOYS_STUDENT_GUIDE",

  scope: SINGLE_SCHOOL_SCOPE,

  hierarchy: {
    principalPersonIdSource: "INPUT_REQUIRED",
  },

  permissions: SCHOOL_STUDENT_GUIDE_PERMISSIONS,

  operations: SCHOOL_STUDENT_GUIDE_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const SCHOOL_ADMINISTRATION_ROLE_PROFILES = {
  ADMIN_ASSISTANT: ADMIN_ASSISTANT_ROLE_PROFILE,
  ACTIVITY_COORD: ACTIVITY_COORD_ROLE_PROFILE,
  MEDIA_SPECIALIST: MEDIA_SPECIALIST_ROLE_PROFILE,
  BOYS_STUDENT_GUIDE: BOYS_STUDENT_GUIDE_ROLE_PROFILE,
} as const;