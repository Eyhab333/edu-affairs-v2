import type { StaffProvisioningOperationProfile } from "../types";

const STUDENT_ATTENDANCE_OPERATION = {
  operationKind: "STUDENT_ATTENDANCE",
  title: "إدارة حضور طلاب المدرسة",
  coverageMode: "ALL_CLASSES_IN_SCOPE",
  targetKind: "STUDENT",
  permissions: [
    "VIEW",
    "CREATE",
    "UPDATE_DRAFT",
    "SUBMIT",
    "REVIEW",
    "APPROVE",
  ],
} satisfies StaffProvisioningOperationProfile;

const STUDENT_CASE_HANDLING_OPERATION = {
  operationKind: "STUDENT_CASE_HANDLING",
  title: "متابعة إحالات وحالات الطلاب",
  coverageMode: "ALL_CLASSES_IN_SCOPE",
  targetKind: "CASE",
  permissions: [
    "VIEW",
    "CREATE",
    "UPDATE_DRAFT",
    "SUBMIT",
    "REVIEW",
    "APPROVE",
  ],
} satisfies StaffProvisioningOperationProfile;

const STAFF_EVALUATION_OPERATION = {
  operationKind: "STAFF_EVALUATION",
  title: "تقييم موظفي المدرسة",
  coverageMode: "SINGLE_SCOPE",
  targetKind: "STAFF",
  permissions: [
    "VIEW",
    "CREATE",
    "UPDATE_DRAFT",
    "SUBMIT",
    "REVIEW",
    "APPROVE",
  ],
} satisfies StaffProvisioningOperationProfile;

export const SCHOOL_PRINCIPAL_OPERATIONS = [
  STUDENT_CASE_HANDLING_OPERATION,
  STAFF_EVALUATION_OPERATION,
] satisfies StaffProvisioningOperationProfile[];

export const SCHOOL_VP_OPERATIONS = [
  STUDENT_ATTENDANCE_OPERATION,
  STUDENT_CASE_HANDLING_OPERATION,
  STAFF_EVALUATION_OPERATION,
] satisfies StaffProvisioningOperationProfile[];

export const SCHOOL_EDU_VP_OPERATIONS = [
  STUDENT_CASE_HANDLING_OPERATION,
  STAFF_EVALUATION_OPERATION,
] satisfies StaffProvisioningOperationProfile[];