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


const STUDENT_ACTIVITY_MANAGEMENT_OPERATION = {
  operationKind: "STUDENT_ACTIVITY_MANAGEMENT",
  title: "إدارة الأنشطة الطلابية",
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



export const SCHOOL_EVALUATION_ONLY_OPERATIONS = [
  STAFF_EVALUATION_OPERATION,
] satisfies StaffProvisioningOperationProfile[];

// رائد النشاط 
export const SCHOOL_ACTIVITY_COORD_OPERATIONS = [
  STUDENT_ACTIVITY_MANAGEMENT_OPERATION,
  
] satisfies StaffProvisioningOperationProfile[];

export const SCHOOL_STUDENT_GUIDE_OPERATIONS = [
  STUDENT_CASE_HANDLING_OPERATION,
  STAFF_EVALUATION_OPERATION,
] satisfies StaffProvisioningOperationProfile[];

// المراقبة
// بحيث تكون المراقبة لها:

// الحضور ✅
// تقييماتي ✅ تلقائي
// الرسائل ✅ تلقائي
// التقييمات ❌
// الإحالات ❌
export const SCHOOL_MONITOR_OPERATIONS = [
  STUDENT_ATTENDANCE_OPERATION,
];





