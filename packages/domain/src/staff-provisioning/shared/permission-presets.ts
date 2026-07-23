import type { MembershipPermissions } from "@takween/contracts";

export const NO_MEMBERSHIP_PERMISSIONS = {
  manageOrg: false,
  manageSchools: false,
  manageAcademicYears: false,
  manageGrades: false,
  manageClasses: false,
  manageSubjects: false,
  manageUsers: false,
  manageDirectory: false,
  manageAssignments: false,
  manageCases: false,
  manageEvaluations: false,
  manageDisplay: false,
  sendNotifications: false,

  viewGuardianFinance: false,
  manageGuardianFinance: false,
  recordGuardianPayments: false,
  applyGuardianFinanceAdjustments: false,
  voidGuardianPayments: false,
  viewGuardianFinanceReports: false,
  manageGuardianFinanceSettings: false,
} satisfies MembershipPermissions;

export const SCHOOL_PRINCIPAL_PERMISSIONS = {
  ...NO_MEMBERSHIP_PERMISSIONS,

  manageClasses: true,
  manageAssignments: true,
  manageCases: true,
  manageEvaluations: true,
} satisfies MembershipPermissions;