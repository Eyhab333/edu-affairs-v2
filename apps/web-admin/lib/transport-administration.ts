import { httpsCallable } from "firebase/functions";

import type {
  StudentTransportEnrollment,
  TransportRoute,
  TransportRouteStop,
  TransportVehicle,
} from "@takween/contracts";

import { functions } from "@/lib/firebase";

export type TransportAdminSchool = { id: string; title: string };
export type TransportAdminAcademicYear = {
  id: string;
  schoolId?: string;
  title: string;
};
export type TransportAdminStaff = {
  personId: string;
  displayName: string;
  roleKey: string;
  positionTitle: string;
  schoolIds: string[];
};
export type TransportAdminEmployee = TransportAdminStaff & {
  assignedRouteIds: string[];
  isAssignedToRoute: boolean;
};
export type TransportAdminAssignment = {
  id: string;
  actorPersonId: string;
  scopeId: string;
  status: string;
  isActive: boolean;
  permissions: string[];
};
export type TransportAdminWorkspace = {
  schools: TransportAdminSchool[];
  academicYears: TransportAdminAcademicYear[];
  vehicles: TransportVehicle[];
  routes: TransportRoute[];
  stops: TransportRouteStop[];
  enrollments: StudentTransportEnrollment[];
  assignments: TransportAdminAssignment[];
  staff: TransportAdminStaff[];
};

export type TransportStudentSearchRow = {
  studentId: string;
  studentPersonId: string;
  displayName: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  classTitle: string;
  academicEnrollmentId: string;
  transportEnrollment?: StudentTransportEnrollment;
};

export type TransportAdminAction =
  | "UPSERT_VEHICLE"
  | "UPSERT_ROUTE"
  | "SET_ROUTE_SUPERVISORS"
  | "UPSERT_STOP"
  | "ARCHIVE_STOP"
  | "CREATE_ENROLLMENT"
  | "CREATE_ENROLLMENTS_BULK"
  | "CHANGE_ENROLLMENT_STATUS"
  | "TRANSFER_ENROLLMENT";

const workspaceCallable = httpsCallable<
  { orgId: string },
  TransportAdminWorkspace
>(functions, "getTransportAdminWorkspace");

const studentSearchCallable = httpsCallable<
  { orgId: string; schoolId: string; classId?: string; query?: string },
  TransportStudentSearchRow[]
>(functions, "searchTransportAdminStudents");

const employeeSearchCallable = httpsCallable<
  {
    orgId: string;
    schoolId?: string;
    query?: string;
    position?: string;
    assignmentStatus?: "ALL" | "ASSIGNED" | "UNASSIGNED";
    routeId?: string;
    cursor?: string;
  },
  { employees: TransportAdminEmployee[]; nextCursor?: string }
>(functions, "searchTransportAdminEmployees");

const bulkEnrollmentCallable = httpsCallable<
  {
    orgId: string;
    action: "CREATE_ENROLLMENTS_BULK";
    payload: Record<string, unknown>;
  },
  {
    succeeded: Array<{ studentId: string; id: string }>;
    skipped: Array<{ studentId: string; code: string; message: string }>;
  }
>(functions, "manageTransportAdministration");

const mutationCallable = httpsCallable<
  { orgId: string; action: TransportAdminAction; payload: Record<string, unknown> },
  { id: string }
>(functions, "manageTransportAdministration");

export async function getTransportAdminWorkspace(orgId: string) {
  const response = await workspaceCallable({ orgId });
  return response.data;
}

export async function searchTransportAdminStudents(params: {
  orgId: string;
  schoolId: string;
  classId?: string;
  query?: string;
}) {
  const response = await studentSearchCallable(params);
  return response.data;
}

export async function searchTransportAdminEmployees(params: {
  orgId: string;
  schoolId?: string;
  query?: string;
  position?: string;
  assignmentStatus?: "ALL" | "ASSIGNED" | "UNASSIGNED";
  routeId?: string;
  cursor?: string;
}) {
  const response = await employeeSearchCallable(params);
  return response.data;
}

export async function bulkEnrollTransportStudents(params: {
  orgId: string;
  payload: Record<string, unknown>;
}) {
  const response = await bulkEnrollmentCallable({
    orgId: params.orgId,
    action: "CREATE_ENROLLMENTS_BULK",
    payload: JSON.parse(JSON.stringify(params.payload)) as Record<string, unknown>,
  });
  return response.data;
}

export async function mutateTransportAdministration(params: {
  orgId: string;
  action: TransportAdminAction;
  payload: Record<string, unknown>;
}) {
  const response = await mutationCallable({
    ...params,
    payload: JSON.parse(JSON.stringify(params.payload)) as Record<string, unknown>,
  });
  return response.data;
}

export function transportAdminErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "functions/permission-denied") {
    return "لا تملك صلاحية إدارة النقل المدرسي في هذه المؤسسة.";
  }
  if (code === "functions/already-exists") {
    return "توجد بيانات نقل نشطة متداخلة. راجع اشتراكات الطالب الحالية.";
  }
  if (code === "functions/failed-precondition") {
    return error instanceof Error ? error.message : "لا يمكن تنفيذ العملية في الحالة الحالية.";
  }
  if (code === "functions/invalid-argument") {
    return "تحقق من الحقول المطلوبة والقيم المدخلة.";
  }
  return error instanceof Error ? error.message : "تعذر تنفيذ عملية إدارة النقل.";
}
