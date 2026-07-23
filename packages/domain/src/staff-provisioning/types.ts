import type {
  MembershipPermissions,
  MembershipRole,
  MembershipScopeType,
  OperationalAssignmentCoverageMode,
  OperationKind,
  OperationPermission,
  OperationTargetKind,
  OperationScopeType,
} from "@takween/contracts";

export type StaffProvisioningScopeProfile = {
  scopeType: Extract<MembershipScopeType, OperationScopeType>;
  canAccessAllSchools: boolean;
};

export type StaffProvisioningOperationProfile = {
  operationKind: OperationKind;
  title: string;
  description?: string;

  coverageMode: OperationalAssignmentCoverageMode;
  targetKind: OperationTargetKind;
  permissions: OperationPermission[];
};

export type StaffProvisioningRoleProfile = {
  roleKey: MembershipRole;

  scope: StaffProvisioningScopeProfile;
  permissions: MembershipPermissions;
  operations: StaffProvisioningOperationProfile[];
};