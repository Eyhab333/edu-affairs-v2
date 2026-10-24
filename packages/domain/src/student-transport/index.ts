// import type {
//   MembershipRole,
//   OperationalAssignment,
//   StudentTransportAttendanceRecord,
//   StudentTransportEnrollment,
//   TransportAttendanceBatch,
//   TransportAttendanceBatchRecordRef,
//   TransportAttendanceBatchRecordRefStatus,
//   TransportAttendanceBatchStatus,
//   TransportAttendanceBatchStudentRow,
//   TransportAttendanceBatchStudentRowStatus,
//   TransportAttendanceStatus,
//   TransportTripDirection,
// } from "@takween/contracts";

// export type TransportRouteLike = {
//   id: string;
//   orgId: string;
//   schoolId?: string;
//   title?: string;
//   name?: string;
//   isArchived?: boolean;
// };

// export type TransportTargetStudent = {
//   studentId: string;
//   studentDisplayName?: string;
//   enrollmentId?: string;
//   transportEnrollmentId?: string;
// };

// export type BuildTransportAttendanceBatchParams = {
//   id: string;
//   orgId: string;
//   schoolId: string;
//   academicYearId: string;
//   schoolDayId: string;

//   routeId: string;
//   tripDirection: TransportTripDirection;

//   scopeId?: string;

//   status?: TransportAttendanceBatchStatus;

//   createdByPersonId: string;
//   createdByRoleKey: MembershipRole;

//   operationalAssignmentId?: string;

//   recordedAt?: number;
//   submittedAt?: number;
//   reviewedAt?: number;
//   lockedAt?: number;
//   cancelledAt?: number;

//   students: TransportTargetStudent[];
//   rows?: TransportAttendanceBatchStudentRow[];

//   notes?: string;

//   nowMs?: number;
// };

// export type TransportAttendanceStatusCounts = Record<
//   TransportAttendanceStatus,
//   number
// >;

// export type TransportAttendanceBatchSummary = {
//   targetCount: number;
//   completedCount: number;
//   missingCount: number;
//   pendingCount: number;

//   boardedCount: number;
//   notBoardedCount: number;
//   droppedOffCount: number;
//   notDroppedOffCount: number;
//   excusedCount: number;

//   completionPercentage: number;
//   successPercentage: number;
//   issuePercentage: number;

//   statusCounts: TransportAttendanceStatusCounts;
// };

// function createEmptyTransportStatusCounts(): TransportAttendanceStatusCounts {
//   return {
//     BOARDED: 0,
//     NOT_BOARDED: 0,
//     DROPPED_OFF: 0,
//     NOT_DROPPED_OFF: 0,
//     EXCUSED: 0,
//   };
// }

// function getExpectedCompletedStatus(
//   tripDirection: TransportTripDirection,
// ): TransportAttendanceStatus {
//   return tripDirection === "MORNING_TO_SCHOOL"
//     ? "BOARDED"
//     : "DROPPED_OFF";
// }

// function getExpectedIssueStatus(
//   tripDirection: TransportTripDirection,
// ): TransportAttendanceStatus {
//   return tripDirection === "MORNING_TO_SCHOOL"
//     ? "NOT_BOARDED"
//     : "NOT_DROPPED_OFF";
// }

// function isCompletedTransportRow(row: TransportAttendanceBatchStudentRow) {
//   return row.completed === true || row.rowStatus === "COMPLETED";
// }

// function isMissingTransportRow(row: TransportAttendanceBatchStudentRow) {
//   return row.rowStatus === "EXCUSED" || row.rowStatus === "SKIPPED";
// }

// function normalizeTransportRow(params: {
//   student: TransportTargetStudent;
//   tripDirection: TransportTripDirection;
// }): TransportAttendanceBatchStudentRow {
//   return {
//     studentId: params.student.studentId,
//     studentDisplayName: params.student.studentDisplayName ?? "",
//     enrollmentId: params.student.enrollmentId ?? "",
//     transportEnrollmentId: params.student.transportEnrollmentId ?? "",

//     status: getExpectedCompletedStatus(params.tripDirection),
//     rowStatus: "PENDING",

//     note: "",

//     completed: false,
//     recordId: "",
//   };
// }

// function buildTransportRecordRef(params: {
//   row: TransportAttendanceBatchStudentRow;
//   status: TransportAttendanceBatchRecordRefStatus;
// }): TransportAttendanceBatchRecordRef {
//   return {
//     studentId: params.row.studentId,
//     transportEnrollmentId: params.row.transportEnrollmentId ?? "",
//     recordId: params.row.recordId ?? "",
//     status: params.status,
//   };
// }

// export function getVisibleRoutesForActor(params: {
//   actorPersonId: string;
//   routes: TransportRouteLike[];
//   operationalAssignments: OperationalAssignment[];
//   nowMs?: number;
// }): TransportRouteLike[] {
//   const nowMs = params.nowMs ?? Date.now();

//   const routeIds = new Set<string>();

//   for (const assignment of params.operationalAssignments) {
//     if (assignment.actorPersonId !== params.actorPersonId) continue;
//     if (assignment.isActive === false) continue;
//     if (assignment.status === "ENDED" || assignment.status === "SUSPENDED") {
//       continue;
//     }

//     if (typeof assignment.startAt === "number" && assignment.startAt > nowMs) {
//       continue;
//     }

//     if (typeof assignment.endAt === "number" && assignment.endAt < nowMs) {
//       continue;
//     }

//     if (assignment.operationKind !== "TRANSPORT_ATTENDANCE") continue;

//     if (assignment.scopeType === "ROUTE" && assignment.scopeId) {
//       routeIds.add(assignment.scopeId);
//     }

//     for (const routeId of assignment.targetRouteIds) {
//       routeIds.add(routeId);
//     }
//   }

//   return params.routes
//     .filter((route) => routeIds.has(route.id))
//     .filter((route) => route.isArchived !== true);
// }

// export function getRouteStudents(params: {
//   routeId: string;
//   enrollments: StudentTransportEnrollment[];
//   students?: TransportTargetStudent[];
//   nowMs?: number;
// }): TransportTargetStudent[] {
//   const nowMs = params.nowMs ?? Date.now();
//   const studentMap = new Map<string, TransportTargetStudent>();

//   for (const student of params.students ?? []) {
//     studentMap.set(student.studentId, student);
//   }

//   return params.enrollments
//     .filter((enrollment) => {
//       if (enrollment.routeId !== params.routeId) return false;
//       if (enrollment.status !== "ACTIVE") return false;
//       if (typeof enrollment.startAt === "number" && enrollment.startAt > nowMs) {
//         return false;
//       }
//       if (typeof enrollment.endAt === "number" && enrollment.endAt < nowMs) {
//         return false;
//       }

//       return true;
//     })
//     .map((enrollment) => {
//       const student = studentMap.get(enrollment.studentId);

//       return {
//         studentId: enrollment.studentId,
//         studentDisplayName: student?.studentDisplayName ?? "",
//         enrollmentId: enrollment.enrollmentId,
//         transportEnrollmentId: enrollment.id,
//       };
//     });
// }

// export function canRecordTransportAttendance(params: {
//   actorPersonId: string;
//   routeId: string;
//   operationalAssignments: OperationalAssignment[];
//   nowMs?: number;
// }): boolean {
//   const visibleRoutes = getVisibleRoutesForActor({
//     actorPersonId: params.actorPersonId,
//     routes: [
//       {
//         id: params.routeId,
//         orgId: "",
//       },
//     ],
//     operationalAssignments: params.operationalAssignments,
//     nowMs: params.nowMs,
//   });

//   return visibleRoutes.some((route) => route.id === params.routeId);
// }

// export function buildTransportAttendanceBatch(
//   params: BuildTransportAttendanceBatchParams,
// ): TransportAttendanceBatch {
//   const nowMs = params.nowMs ?? Date.now();

//   const rows =
//     params.rows ??
//     params.students.map((student) =>
//       normalizeTransportRow({
//         student,
//         tripDirection: params.tripDirection,
//       }),
//     );

//   const summary = calculateTransportBatchSummary({
//     rows,
//     targetCount: params.students.length,
//   });

//   const recordRefs = rows.map((row) => {
//     if (isCompletedTransportRow(row)) {
//       return buildTransportRecordRef({
//         row,
//         status: "COMPLETED",
//       });
//     }

//     if (isMissingTransportRow(row)) {
//       return buildTransportRecordRef({
//         row,
//         status: "MISSING",
//       });
//     }

//     return buildTransportRecordRef({
//       row,
//       status: "PENDING",
//     });
//   });

//   return {
//     id: params.id,
//     orgId: params.orgId,
//     schoolId: params.schoolId,
//     academicYearId: params.academicYearId,
//     schoolDayId: params.schoolDayId,

//     routeId: params.routeId,
//     tripDirection: params.tripDirection,

//     scopeType: "ROUTE",
//     scopeId: params.scopeId ?? params.routeId,

//     status: params.status ?? "DRAFT",

//     createdByPersonId: params.createdByPersonId,
//     createdByRoleKey: params.createdByRoleKey,

//     operationalAssignmentId: params.operationalAssignmentId ?? "",

//     recordedAt: params.recordedAt,
//     submittedAt: params.submittedAt,
//     reviewedAt: params.reviewedAt,
//     lockedAt: params.lockedAt,
//     cancelledAt: params.cancelledAt,

//     targetStudentIds: params.students.map((student) => student.studentId),
//     targetCount: summary.targetCount,
//     completedCount: summary.completedCount,
//     missingCount: summary.missingCount,

//     studentRows: rows,
//     recordRefs,

//     notes: params.notes ?? "",

//     createdAt: nowMs,
//     updatedAt: nowMs,
//   };
// }

// export function buildTransportRecordsFromBatch(params: {
//   batch: TransportAttendanceBatch;
//   rows?: TransportAttendanceBatchStudentRow[];
//   recordedAt?: number;
//   nowMs?: number;
// }): StudentTransportAttendanceRecord[] {
//   const nowMs = params.nowMs ?? Date.now();
//   const recordedAt = params.recordedAt ?? params.batch.recordedAt ?? nowMs;
//   const rows = params.rows ?? params.batch.studentRows;

//   return rows
//     .filter((row) => isCompletedTransportRow(row))
//     .map((row) => {
//       return {
//         id: row.recordId || `${params.batch.id}-${row.studentId}`,
//         orgId: params.batch.orgId,
//         schoolId: params.batch.schoolId,
//         academicYearId: params.batch.academicYearId,
//         schoolDayId: params.batch.schoolDayId,

//         studentId: row.studentId,
//         enrollmentId: row.enrollmentId,
//         transportEnrollmentId: row.transportEnrollmentId,
//         routeId: params.batch.routeId,

//         tripDirection: params.batch.tripDirection,
//         status: row.status,
//         batchId: params.batch.id,

//         recordedByPersonId: params.batch.createdByPersonId,
//         recorderRoleKey: params.batch.createdByRoleKey,
//         recordedAt,

//         note: row.note,

//         createdAt: nowMs,
//         updatedAt: nowMs,
//       };
//     });
// }

// export function calculateTransportBatchSummary(params: {
//   rows: TransportAttendanceBatchStudentRow[];
//   targetCount?: number;
// }): TransportAttendanceBatchSummary {
//   const statusCounts = createEmptyTransportStatusCounts();

//   let completedCount = 0;
//   let missingCount = 0;

//   for (const row of params.rows) {
//     if (isCompletedTransportRow(row)) {
//       completedCount += 1;
//       statusCounts[row.status] += 1;
//       continue;
//     }

//     if (isMissingTransportRow(row)) {
//       missingCount += 1;
//     }
//   }

//   const targetCount = Math.max(params.targetCount ?? params.rows.length, 0);
//   const pendingCount = Math.max(0, targetCount - completedCount - missingCount);

//   const boardedCount = statusCounts.BOARDED;
//   const notBoardedCount = statusCounts.NOT_BOARDED;
//   const droppedOffCount = statusCounts.DROPPED_OFF;
//   const notDroppedOffCount = statusCounts.NOT_DROPPED_OFF;
//   const excusedCount = statusCounts.EXCUSED;

//   const successCount = boardedCount + droppedOffCount;
//   const issueCount = notBoardedCount + notDroppedOffCount;

//   const completionPercentage =
//     targetCount === 0 ? 0 : Math.round((completedCount / targetCount) * 100);

//   const successPercentage =
//     targetCount === 0 ? 0 : Math.round((successCount / targetCount) * 100);

//   const issuePercentage =
//     targetCount === 0 ? 0 : Math.round((issueCount / targetCount) * 100);

//   return {
//     targetCount,
//     completedCount,
//     missingCount,
//     pendingCount,

//     boardedCount,
//     notBoardedCount,
//     droppedOffCount,
//     notDroppedOffCount,
//     excusedCount,

//     completionPercentage,
//     successPercentage,
//     issuePercentage,

//     statusCounts,
//   };
// }

// export function calculateTransportStatusCounts(params: {
//   records: StudentTransportAttendanceRecord[];
// }): TransportAttendanceStatusCounts {
//   const statusCounts = createEmptyTransportStatusCounts();

//   for (const record of params.records) {
//     statusCounts[record.status] += 1;
//   }

//   return statusCounts;
// }

// export function updateTransportRow(params: {
//   row: TransportAttendanceBatchStudentRow;
//   status: TransportAttendanceStatus;
//   rowStatus?: TransportAttendanceBatchStudentRowStatus;
//   note?: string;
// }): TransportAttendanceBatchStudentRow {
//   return {
//     ...params.row,
//     status: params.status,
//     rowStatus: params.rowStatus ?? "COMPLETED",
//     note: params.note ?? params.row.note,
//     completed: true,
//   };
// }

// export function markTransportRowAsIssue(params: {
//   row: TransportAttendanceBatchStudentRow;
//   tripDirection: TransportTripDirection;
//   note?: string;
// }): TransportAttendanceBatchStudentRow {
//   return updateTransportRow({
//     row: params.row,
//     status: getExpectedIssueStatus(params.tripDirection),
//     note: params.note,
//   });
// }

// export function markTransportRowAsSuccess(params: {
//   row: TransportAttendanceBatchStudentRow;
//   tripDirection: TransportTripDirection;
//   note?: string;
// }): TransportAttendanceBatchStudentRow {
//   return updateTransportRow({
//     row: params.row,
//     status: getExpectedCompletedStatus(params.tripDirection),
//     note: params.note,
//   });
// }




import type {
  OperationalAssignment,
  StudentTransportAttendanceRecord,
  StudentTransportAttendanceStatus,
  StudentTransportEnrollment,
  TransportAttendanceBatch,
  TransportAttendanceBatchStatus,
  TransportAttendanceBatchStudentRow,
  TransportRoute,
  TransportTripKind,
} from "@takween/contracts";

/** @deprecated Use the canonical OperationalAssignment contract directly. */
export type TransportOperationalAssignmentLike = OperationalAssignment;

export type TransportTermContext = {
  termId?: string;
  termTitle?: string;
  termShortTitle?: string;
};

export type GetVisibleRoutesForTransportSupervisorParams = {
  orgId: string;
  actorPersonId: string;
  routes: TransportRoute[];
  assignments?: OperationalAssignment[];
  now?: number;
};

export type GetRouteTransportEnrollmentsParams = {
  orgId: string;
  schoolId?: string;
  academicYearId?: string;
  routeId: string;
  enrollments: StudentTransportEnrollment[];
  serviceDate?: string;
  now?: number;
};

export type BuildTransportAttendanceBatchDraftParams = {
  id?: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  term?: TransportTermContext;

  route: TransportRoute;
  enrollments: StudentTransportEnrollment[];

  tripKind: TransportTripKind;
  serviceDate: string;

  createdByPersonId: string;
  createdByRoleKey?: string;
  operationalAssignmentId?: string;

  now?: number;
};

export type BuildTransportAttendanceRecordsFromBatchParams = {
  batch: TransportAttendanceBatch;
  recordedByPersonId?: string;
  recordedByRoleKey?: string;
  now?: number;

  /**
   * false = لا ننشئ record للطلاب الذين ما زالوا PENDING.
   * true = ننشئ record لكل الطلاب حتى PENDING.
   */
  includePending?: boolean;
};

export type UpdateTransportBatchRowParams = {
  batch: TransportAttendanceBatch;
  studentId: string;
  status: StudentTransportAttendanceStatus;
  note?: string;
  stopId?: string;
  stopTitle?: string;
  recordedAt?: number;
  recordedByPersonId?: string;
  now?: number;
};

export type TransportBatchSummary = {
  targetCount: number;
  completedCount: number;
  missingCount: number;
  issueCount: number;
  byStatus: Record<StudentTransportAttendanceStatus, number>;
};

export const TRANSPORT_ATTENDANCE_OPERATION_KIND = "TRANSPORT_ATTENDANCE";

export const TRANSPORT_ATTENDANCE_STATUS_LABEL_AR: Record<
  StudentTransportAttendanceStatus,
  string
> = {
  PENDING: "لم يسجل",
  BOARDED: "صعد",
  NOT_BOARDED: "لم يصعد",
  ARRIVED: "وصل",
  DROPPED_OFF: "نزل",
  ABSENT: "غائب",
  EXCUSED: "بعذر",
  LATE: "متأخر",
  ISSUE: "مشكلة",
};

export const TRANSPORT_TRIP_KIND_LABEL_AR: Record<TransportTripKind, string> = {
  MORNING_PICKUP: "صعود صباحي",
  MORNING_ARRIVAL: "وصول للمدرسة",
  AFTERNOON_BOARDING: "صعود الانصراف",
  AFTERNOON_DROPOFF: "نزول عند المنزل",
};

const TRANSPORT_TRIP_STATUS_OPTIONS: Record<
  TransportTripKind,
  readonly StudentTransportAttendanceStatus[]
> = {
  MORNING_PICKUP: [
    "BOARDED",
    "NOT_BOARDED",
    "ABSENT",
    "EXCUSED",
    "LATE",
    "ISSUE",
  ],
  MORNING_ARRIVAL: ["ARRIVED", "ABSENT", "EXCUSED", "LATE", "ISSUE"],
  AFTERNOON_BOARDING: [
    "BOARDED",
    "NOT_BOARDED",
    "ABSENT",
    "EXCUSED",
    "LATE",
    "ISSUE",
  ],
  AFTERNOON_DROPOFF: [
    "DROPPED_OFF",
    "ABSENT",
    "EXCUSED",
    "LATE",
    "ISSUE",
  ],
};

export function getAllowedStatusesForTransportTrip(
  tripKind: TransportTripKind,
  includePending = true
): StudentTransportAttendanceStatus[] {
  return [
    ...(includePending ? (["PENDING"] as const) : []),
    ...TRANSPORT_TRIP_STATUS_OPTIONS[tripKind],
  ];
}

export function isStatusAllowedForTransportTrip(params: {
  tripKind: TransportTripKind;
  status: StudentTransportAttendanceStatus;
  includePending?: boolean;
}) {
  return getAllowedStatusesForTransportTrip(
    params.tripKind,
    params.includePending
  ).includes(params.status);
}

export function getDefaultStatusForTrip(
  tripKind: TransportTripKind
): StudentTransportAttendanceStatus {
  switch (tripKind) {
    case "MORNING_PICKUP":
    case "AFTERNOON_BOARDING":
      return "BOARDED";

    case "MORNING_ARRIVAL":
      return "ARRIVED";

    case "AFTERNOON_DROPOFF":
      return "DROPPED_OFF";

    default:
      return "PENDING";
  }
}

export function buildTransportAttendanceBatchId(params: {
  routeId: string;
  serviceDate: string;
  tripKind: TransportTripKind;
}) {
  return [
    "transport-batch",
    params.routeId,
    params.serviceDate,
    params.tripKind.toLowerCase(),
  ].join("_");
}

export function isActiveTransportRoute(route: TransportRoute) {
  return route.status === "ACTIVE" && route.isArchived !== true;
}

export function isActiveStudentTransportEnrollment(
  enrollment: StudentTransportEnrollment,
  activeRange?: { startsAt: number; endsAt: number }
) {
  if (enrollment.status !== "ACTIVE") return false;
  if (!activeRange) return true;
  if (
    typeof enrollment.startsAt === "number" &&
    enrollment.startsAt > activeRange.endsAt
  ) {
    return false;
  }
  if (
    typeof enrollment.endsAt === "number" &&
    enrollment.endsAt < activeRange.startsAt
  ) {
    return false;
  }
  return true;
}

export function isTransportAssignmentActive(
  assignment: OperationalAssignment,
  now = Date.now()
) {
  if (assignment.isActive === false) return false;
  if (assignment.status !== "ACTIVE") return false;
  if (assignment.operationKind !== TRANSPORT_ATTENDANCE_OPERATION_KIND) {
    return false;
  }

  if (assignment.startAt && assignment.startAt > now) return false;
  if (assignment.endAt && assignment.endAt < now) return false;

  return true;
}

export function getVisibleRoutesForTransportSupervisor({
  orgId,
  actorPersonId,
  routes,
  assignments = [],
  now = Date.now(),
}: GetVisibleRoutesForTransportSupervisorParams): TransportRoute[] {
  const assignedRouteIds = new Set(
    assignments
      .filter((assignment) => assignment.orgId === orgId)
      .filter((assignment) => assignment.actorPersonId === actorPersonId)
      .filter((assignment) => isTransportAssignmentActive(assignment, now))
      .filter((assignment) => assignment.permissions.includes("VIEW"))
      .filter((assignment) => assignment.scopeType === "ROUTE")
      .flatMap((assignment) => [
        assignment.scopeId,
        ...assignment.targetRouteIds,
      ])
      .filter((routeId): routeId is string => Boolean(routeId))
  );

  return routes
    .filter((route) => route.orgId === orgId)
    .filter(isActiveTransportRoute)
    .filter((route) => {
      if (assignedRouteIds.has(route.id)) return true;
      return route.supervisorPersonIds?.includes(actorPersonId) === true;
    })
    .sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0);
      if (byOrder !== 0) return byOrder;
      return a.title.localeCompare(b.title, "ar");
    });
}

export function getRouteTransportEnrollments({
  orgId,
  schoolId,
  academicYearId,
  routeId,
  enrollments,
  serviceDate,
  now = Date.now(),
}: GetRouteTransportEnrollmentsParams): StudentTransportEnrollment[] {
  const serviceDayStart = serviceDate
    ? Date.parse(`${serviceDate}T00:00:00+03:00`)
    : now;
  const activeRange = {
    startsAt: Number.isFinite(serviceDayStart) ? serviceDayStart : now,
    endsAt: Number.isFinite(serviceDayStart)
      ? serviceDayStart + 24 * 60 * 60 * 1000 - 1
      : now,
  };

  return enrollments
    .filter((enrollment) => enrollment.orgId === orgId)
    .filter((enrollment) => enrollment.routeId === routeId)
    .filter((enrollment) => !schoolId || enrollment.schoolId === schoolId)
    .filter(
      (enrollment) =>
        !academicYearId || enrollment.academicYearId === academicYearId
    )
    .filter((enrollment) =>
      isActiveStudentTransportEnrollment(enrollment, activeRange)
    )
    .sort((a, b) => {
      const aStop = a.pickupStopTitle ?? a.dropoffStopTitle ?? "";
      const bStop = b.pickupStopTitle ?? b.dropoffStopTitle ?? "";

      const byStop = aStop.localeCompare(bStop, "ar");
      if (byStop !== 0) return byStop;

      const aName = a.studentDisplayName ?? a.studentId;
      const bName = b.studentDisplayName ?? b.studentId;

      return aName.localeCompare(bName, "ar");
    });
}

export function calculateTransportBatchSummary(
  studentRows: TransportAttendanceBatchStudentRow[]
): TransportBatchSummary {
  const byStatus = {
    PENDING: 0,
    BOARDED: 0,
    NOT_BOARDED: 0,
    ARRIVED: 0,
    DROPPED_OFF: 0,
    ABSENT: 0,
    EXCUSED: 0,
    LATE: 0,
    ISSUE: 0,
  } satisfies Record<StudentTransportAttendanceStatus, number>;

  for (const row of studentRows) {
    byStatus[row.status] += 1;
  }

  const targetCount = studentRows.length;
  const missingCount = byStatus.PENDING;
  const issueCount =
    byStatus.NOT_BOARDED +
    byStatus.ABSENT +
    byStatus.EXCUSED +
    byStatus.LATE +
    byStatus.ISSUE;
  const completedCount = targetCount - missingCount;

  return {
    targetCount,
    completedCount,
    missingCount,
    issueCount,
    byStatus,
  };
}

export function resolveTransportBatchStatus(
  studentRows: TransportAttendanceBatchStudentRow[],
  currentStatus: TransportAttendanceBatchStatus = "DRAFT"
): TransportAttendanceBatchStatus {
  if (["SUBMITTED", "REVIEWED", "LOCKED", "CANCELLED"].includes(currentStatus)) {
    return currentStatus;
  }

  const summary = calculateTransportBatchSummary(studentRows);

  if (summary.completedCount === 0) return "DRAFT";
  if (summary.missingCount > 0) return "IN_PROGRESS";

  return "IN_PROGRESS";
}

export function buildTransportAttendanceBatchDraft({
  id,
  orgId,
  schoolId,
  academicYearId,
  term,
  route,
  enrollments,
  tripKind,
  serviceDate,
  createdByPersonId,
  createdByRoleKey,
  operationalAssignmentId,
  now = Date.now(),
}: BuildTransportAttendanceBatchDraftParams): TransportAttendanceBatch {
  const activeEnrollments = getRouteTransportEnrollments({
    orgId,
    schoolId,
    academicYearId,
    routeId: route.id,
    enrollments,
    serviceDate,
  });

  const studentRows: TransportAttendanceBatchStudentRow[] =
    activeEnrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      studentPersonId: enrollment.studentPersonId,
      studentDisplayName:
        enrollment.studentDisplayName ?? enrollment.studentId,

      enrollmentId: enrollment.id,

      status: "PENDING",

      stopId:
        tripKind === "AFTERNOON_DROPOFF"
          ? enrollment.dropoffStopId
          : enrollment.pickupStopId,
      stopTitle:
        tripKind === "AFTERNOON_DROPOFF"
          ? enrollment.dropoffStopTitle
          : enrollment.pickupStopTitle,
    }));

  const summary = calculateTransportBatchSummary(studentRows);

  return {
    id:
      id ??
      buildTransportAttendanceBatchId({
        routeId: route.id,
        serviceDate,
        tripKind,
      }),

    orgId,
    schoolId,
    academicYearId,

    termId: term?.termId,
    termTitle: term?.termTitle,
    termShortTitle: term?.termShortTitle,

    routeId: route.id,
    routeTitle: route.title,

    vehicleId: route.vehicleId,
    driverPersonId: route.driverPersonId,
    supervisorPersonId: createdByPersonId,

    tripKind,
    serviceDate,

    status: "DRAFT",

    createdByPersonId,
    createdByRoleKey,
    operationalAssignmentId,

    targetStudentIds: studentRows.map((row) => row.studentId),
    targetCount: summary.targetCount,
    completedCount: summary.completedCount,
    missingCount: summary.missingCount,
    issueCount: summary.issueCount,

    studentRows,

    createdAt: now,
    updatedAt: now,
  };
}

export function updateTransportAttendanceBatchRow({
  batch,
  studentId,
  status,
  note,
  stopId,
  stopTitle,
  recordedAt,
  recordedByPersonId,
  now = Date.now(),
}: UpdateTransportBatchRowParams): TransportAttendanceBatch {
  if (!["DRAFT", "IN_PROGRESS"].includes(batch.status)) {
    throw new Error("Only editable transport attendance batches can be changed.");
  }
  if (!isStatusAllowedForTransportTrip({ tripKind: batch.tripKind, status })) {
    throw new Error("Student status is not valid for this transport trip.");
  }

  const nextRows = batch.studentRows.map((row) => {
    if (row.studentId !== studentId) return row;

    return {
      ...row,
      status,
      note,
      stopId: stopId ?? row.stopId,
      stopTitle: stopTitle ?? row.stopTitle,
      recordedAt: recordedAt ?? now,
      recordedByPersonId: recordedByPersonId ?? batch.createdByPersonId,
    };
  });

  const summary = calculateTransportBatchSummary(nextRows);

  return {
    ...batch,
    status: resolveTransportBatchStatus(nextRows, batch.status),
    studentRows: nextRows,
    targetStudentIds: nextRows.map((row) => row.studentId),
    targetCount: summary.targetCount,
    completedCount: summary.completedCount,
    missingCount: summary.missingCount,
    issueCount: summary.issueCount,
    updatedAt: now,
  };
}

export function submitTransportAttendanceBatch(
  batch: TransportAttendanceBatch,
  now = Date.now()
): TransportAttendanceBatch {
  if (!["DRAFT", "IN_PROGRESS"].includes(batch.status)) {
    throw new Error("Only editable transport attendance batches can be submitted.");
  }
  if (batch.studentRows.length === 0) {
    throw new Error("Transport attendance batch has no students.");
  }
  if (batch.studentRows.some((row) => row.status === "PENDING")) {
    throw new Error("All transport attendance rows must be recorded.");
  }
  if (
    batch.studentRows.some(
      (row) =>
        !isStatusAllowedForTransportTrip({
          tripKind: batch.tripKind,
          status: row.status,
          includePending: false,
        })
    )
  ) {
    throw new Error("Transport attendance contains an invalid trip status.");
  }

  const summary = calculateTransportBatchSummary(batch.studentRows);

  return {
    ...batch,
    status: "SUBMITTED",
    targetCount: summary.targetCount,
    completedCount: summary.completedCount,
    missingCount: summary.missingCount,
    issueCount: summary.issueCount,
    submittedAt: now,
    updatedAt: now,
  };
}

export function buildTransportAttendanceRecordsFromBatch({
  batch,
  recordedByPersonId,
  recordedByRoleKey,
  now = Date.now(),
  includePending = false,
}: BuildTransportAttendanceRecordsFromBatchParams): StudentTransportAttendanceRecord[] {
  return batch.studentRows
    .filter((row) => includePending || row.status !== "PENDING")
    .map((row) => {
      const recordedAt = row.recordedAt ?? batch.submittedAt ?? now;

      return {
        id: row.recordId ?? `${batch.id}_${row.studentId}`,
        orgId: batch.orgId,

        schoolId: batch.schoolId,
        academicYearId: batch.academicYearId,
        termId: batch.termId,
        termTitle: batch.termTitle,
        termShortTitle: batch.termShortTitle,

        routeId: batch.routeId,
        routeTitle: batch.routeTitle,

        batchId: batch.id,
        enrollmentId: row.enrollmentId,

        studentId: row.studentId,
        studentPersonId: row.studentPersonId,
        studentDisplayName: row.studentDisplayName,

        tripKind: batch.tripKind,
        serviceDate: batch.serviceDate,

        status: row.status,

        stopId: row.stopId,
        stopTitle: row.stopTitle,

        recordedAt,
        recordedByPersonId:
          row.recordedByPersonId ??
          recordedByPersonId ??
          batch.createdByPersonId,
        recordedByRoleKey: recordedByRoleKey ?? batch.createdByRoleKey,

        note: row.note,

        createdAt: recordedAt,
        updatedAt: now,
      };
    });
}

