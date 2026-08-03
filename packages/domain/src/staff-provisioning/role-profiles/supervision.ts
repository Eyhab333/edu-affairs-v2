import type { StaffProvisioningRoleProfile } from "../types";

import {
  SCHOOL_EVALUATION_ONLY_OPERATIONS,
} from "../shared/operation-presets";

import {
  NO_MEMBERSHIP_PERMISSIONS,
  SCHOOL_EVALUATION_STAFF_PERMISSIONS,
} from "../shared/permission-presets";

import { SINGLE_SCHOOL_SCOPE } from "../shared/scope-presets";

const SUPERVISION_SCOPE = SINGLE_SCHOOL_SCOPE;

export const ORG_SUPERVISION_HEAD_ROLE_PROFILE = {
  roleKey: "ORG_SUPERVISION_HEAD",

  scope: SUPERVISION_SCOPE,

  hierarchy: {
    principalPersonIdSource: "NONE",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const BOYS_EDU_SUPERVISOR_ROLE_PROFILE = {
  roleKey: "BOYS_EDU_SUPERVISOR",

  scope: SUPERVISION_SCOPE,

  hierarchy: {
    principalPersonIdSource: "NONE",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const ADMIN_SUPERVISOR_ROLE_PROFILE = {
  roleKey: "ADMIN_SUPERVISOR",

  scope: SUPERVISION_SCOPE,

  hierarchy: {
    principalPersonIdSource: "NONE",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const EDU_SUPERVISOR_ROLE_PROFILE = {
  roleKey: "EDU_SUPERVISOR",

  scope: SUPERVISION_SCOPE,

  hierarchy: {
    principalPersonIdSource: "NONE",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;



export const VALUES_COORD_ROLE_PROFILE = {
  roleKey: "VALUES_COORD",

  scope: SUPERVISION_SCOPE,

  hierarchy: {
    principalPersonIdSource: "NONE",
  },

  permissions: SCHOOL_EVALUATION_STAFF_PERMISSIONS,

  operations: SCHOOL_EVALUATION_ONLY_OPERATIONS,
} satisfies StaffProvisioningRoleProfile;

export const SUPERVISION_ROLE_PROFILES = {
  ORG_SUPERVISION_HEAD:
    ORG_SUPERVISION_HEAD_ROLE_PROFILE,

  BOYS_EDU_SUPERVISOR:
    BOYS_EDU_SUPERVISOR_ROLE_PROFILE,

  ADMIN_SUPERVISOR:
    ADMIN_SUPERVISOR_ROLE_PROFILE,

  EDU_SUPERVISOR:
    EDU_SUPERVISOR_ROLE_PROFILE,

  VALUES_COORD:
    VALUES_COORD_ROLE_PROFILE,
} as const;