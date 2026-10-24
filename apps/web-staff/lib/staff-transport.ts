import { httpsCallable } from "firebase/functions";

import type {
  OperationalAssignment,
  StudentTransportEnrollment,
  TransportAttendanceBatch,
  TransportRoute,
  TransportTripKind,
} from "@takween/contracts";
import {
  buildTransportAttendanceBatchDraft,
  buildTransportAttendanceBatchId,
  getRouteTransportEnrollments,
  TRANSPORT_TRIP_KIND_LABEL_AR,
  type TransportTermContext,
} from "@takween/domain";

import { functions } from "@/lib/firebase";

export type StaffTransportContext = {
  orgId: string;
  actorPersonId?: string;
  schoolId?: string;
  academicYearId?: string;
  assignments?: OperationalAssignment[];
};

export type StaffTransportRouteCard = {
  route: TransportRoute;
  studentsCount: number;
  activeBatchesCount: number;
  latestBatch?: TransportAttendanceBatch;
};

export type StaffTransportWorkspace = {
  routes: TransportRoute[];
  enrollments: StudentTransportEnrollment[];
  batches: TransportAttendanceBatch[];
  routeCards: StaffTransportRouteCard[];
};

export type StaffTransportRouteWorkspace = {
  route: TransportRoute;
  enrollments: StudentTransportEnrollment[];
  batches: TransportAttendanceBatch[];
  tripOptions: StaffTransportTripOption[];
};

export type StaffTransportBatchWorkspace = {
  route: TransportRoute;
  batch: TransportAttendanceBatch;
};

export type StaffTransportTripOption = {
  tripKind: TransportTripKind;
  label: string;
};

type TransportWorkspaceResult = {
  routes: TransportRoute[];
  enrollments: StudentTransportEnrollment[];
  batches: TransportAttendanceBatch[];
  batch?: TransportAttendanceBatch;
};

export const STAFF_TRANSPORT_TRIP_OPTIONS: StaffTransportTripOption[] = [
  { tripKind: "MORNING_PICKUP", label: TRANSPORT_TRIP_KIND_LABEL_AR.MORNING_PICKUP },
  { tripKind: "MORNING_ARRIVAL", label: TRANSPORT_TRIP_KIND_LABEL_AR.MORNING_ARRIVAL },
  { tripKind: "AFTERNOON_BOARDING", label: TRANSPORT_TRIP_KIND_LABEL_AR.AFTERNOON_BOARDING },
  { tripKind: "AFTERNOON_DROPOFF", label: TRANSPORT_TRIP_KIND_LABEL_AR.AFTERNOON_DROPOFF },
];

const getWorkspaceCallable = httpsCallable<
  { orgId: string; routeId?: string; batchId?: string },
  TransportWorkspaceResult
>(functions, "getTransportWorkspace");

const saveDraftCallable = httpsCallable<
  { orgId: string; batch: TransportAttendanceBatch; expectedUpdatedAt?: number },
  TransportAttendanceBatch
>(functions, "saveTransportAttendanceDraft");

const submitCallable = httpsCallable<
  { orgId: string; batchId: string; expectedUpdatedAt: number },
  TransportAttendanceBatch
>(functions, "submitTransportAttendance");

const accessSummaryCallable = httpsCallable<
  { orgId: string },
  { hasAccess: boolean }
>(functions, "getTransportAccessSummary");

export function getRiyadhServiceDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (kind: "year" | "month" | "day") =>
    parts.find((part) => part.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function getStaffTransportAccessSummary(orgId: string) {
  const result = await accessSummaryCallable({ orgId });
  return result.data;
}

async function getServerWorkspace(params: {
  orgId: string;
  routeId?: string;
  batchId?: string;
}) {
  const result = await getWorkspaceCallable(params);
  return result.data;
}

function sortBatchesNewestFirst(batches: TransportAttendanceBatch[]) {
  return [...batches].sort(
    (a, b) =>
      b.serviceDate.localeCompare(a.serviceDate) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
}

export async function buildStaffTransportWorkspace(
  context: StaffTransportContext,
): Promise<StaffTransportWorkspace> {
  const workspace = await getServerWorkspace({ orgId: context.orgId });
  const batches = sortBatchesNewestFirst(workspace.batches);
  const routeCards = workspace.routes.map((route) => {
    const routeEnrollments = getRouteTransportEnrollments({
      orgId: context.orgId,
      schoolId: route.schoolId,
      academicYearId: route.academicYearId,
      routeId: route.id,
      enrollments: workspace.enrollments,
    });
    const routeBatches = batches.filter((batch) => batch.routeId === route.id);
    return {
      route,
      studentsCount: routeEnrollments.length,
      activeBatchesCount: routeBatches.filter((batch) =>
        ["DRAFT", "IN_PROGRESS", "SUBMITTED"].includes(batch.status),
      ).length,
      latestBatch: routeBatches[0],
    };
  });
  return { ...workspace, batches, routeCards };
}

export async function buildStaffTransportRouteWorkspace(
  context: StaffTransportContext,
  routeId: string,
): Promise<StaffTransportRouteWorkspace | null> {
  const workspace = await getServerWorkspace({ orgId: context.orgId, routeId });
  const route = workspace.routes[0];
  if (!route) return null;
  return {
    route,
    enrollments: getRouteTransportEnrollments({
      orgId: context.orgId,
      schoolId: route.schoolId,
      academicYearId: route.academicYearId,
      routeId,
      enrollments: workspace.enrollments,
    }),
    batches: sortBatchesNewestFirst(workspace.batches),
    tripOptions: STAFF_TRANSPORT_TRIP_OPTIONS,
  };
}

export async function buildStaffTransportBatchWorkspace(params: {
  orgId: string;
  batchId: string;
}): Promise<StaffTransportBatchWorkspace | null> {
  const workspace = await getServerWorkspace(params);
  const route = workspace.routes[0];
  const batch = workspace.batch;
  return route && batch ? { route, batch } : null;
}

export async function buildStaffTransportBatchDraft(params: {
  context: StaffTransportContext;
  routeId: string;
  tripKind: TransportTripKind;
  serviceDate?: string;
  term?: TransportTermContext;
  createdByRoleKey?: string;
  operationalAssignmentId?: string;
}) {
  const serviceDate = params.serviceDate ?? getRiyadhServiceDate();
  const routeWorkspace = await buildStaffTransportRouteWorkspace(
    params.context,
    params.routeId,
  );
  if (!routeWorkspace) return null;
  const batchId = buildTransportAttendanceBatchId({
    routeId: params.routeId,
    serviceDate,
    tripKind: params.tripKind,
  });
  const existing = routeWorkspace.batches.find((batch) => batch.id === batchId);
  if (existing) return { batch: existing, isPersisted: true };
  if (!params.context.actorPersonId) {
    throw new Error("تعذر تحديد هوية الموظف المرتبطة بالحساب.");
  }
  const batch = buildTransportAttendanceBatchDraft({
    orgId: params.context.orgId,
    schoolId: routeWorkspace.route.schoolId ?? params.context.schoolId ?? "",
    academicYearId:
      routeWorkspace.route.academicYearId ?? params.context.academicYearId ?? "",
    term: params.term,
    route: routeWorkspace.route,
    enrollments: routeWorkspace.enrollments,
    tripKind: params.tripKind,
    serviceDate,
    createdByPersonId: params.context.actorPersonId,
    createdByRoleKey: params.createdByRoleKey,
    operationalAssignmentId: params.operationalAssignmentId,
  });
  return { batch, isPersisted: false };
}

export async function saveStaffTransportDraft(params: {
  orgId: string;
  batch: TransportAttendanceBatch;
  expectedUpdatedAt?: number;
}) {
  const payload = {
    orgId: params.orgId,
    batch: JSON.parse(JSON.stringify(params.batch)) as TransportAttendanceBatch,
    ...(params.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: params.expectedUpdatedAt }),
  };
  const result = await saveDraftCallable(payload);
  return result.data;
}

export async function submitStaffTransportBatch(params: {
  orgId: string;
  batchId: string;
  expectedUpdatedAt: number;
}) {
  const result = await submitCallable(params);
  return result.data;
}
