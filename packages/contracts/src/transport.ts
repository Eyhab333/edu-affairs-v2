import { z } from "zod";

export const TransportRouteStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);

export type TransportRouteStatus = z.infer<
  typeof TransportRouteStatusSchema
>;

export const TransportVehicleStatusSchema = z.enum([
  "ACTIVE",
  "MAINTENANCE",
  "INACTIVE",
  "ARCHIVED",
]);

export type TransportVehicleStatus = z.infer<
  typeof TransportVehicleStatusSchema
>;

export const TransportRouteStopKindSchema = z.enum([
  "PICKUP",
  "DROPOFF",
  "BOTH",
]);

export type TransportRouteStopKind = z.infer<
  typeof TransportRouteStopKindSchema
>;

export const StudentTransportEnrollmentStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "CANCELLED",
]);

export type StudentTransportEnrollmentStatus = z.infer<
  typeof StudentTransportEnrollmentStatusSchema
>;

export const TransportTripKindSchema = z.enum([
  "MORNING_PICKUP",
  "MORNING_ARRIVAL",
  "AFTERNOON_BOARDING",
  "AFTERNOON_DROPOFF",
]);

export type TransportTripKind = z.infer<typeof TransportTripKindSchema>;

export const TransportAttendanceBatchStatusSchema = z.enum([
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVIEWED",
  "LOCKED",
  "CANCELLED",
]);

export type TransportAttendanceBatchStatus = z.infer<
  typeof TransportAttendanceBatchStatusSchema
>;

export const StudentTransportAttendanceStatusSchema = z.enum([
  "PENDING",
  "BOARDED",
  "NOT_BOARDED",
  "ARRIVED",
  "DROPPED_OFF",
  "ABSENT",
  "EXCUSED",
  "LATE",
  "ISSUE",
]);

export type StudentTransportAttendanceStatus = z.infer<
  typeof StudentTransportAttendanceStatusSchema
>;

export const TransportNoteVisibilitySchema = z.enum([
  "INTERNAL",
  "STAFF",
  "GUARDIAN_VISIBLE",
]);

export type TransportNoteVisibility = z.infer<
  typeof TransportNoteVisibilitySchema
>;

export const TransportNoteSeveritySchema = z.enum([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export type TransportNoteSeverity = z.infer<
  typeof TransportNoteSeveritySchema
>;

export const TransportRouteSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  schoolId: z.string().optional(),
  academicYearId: z.string().optional(),

  code: z.string().optional(),
  title: z.string(),
  shortTitle: z.string().optional(),
  description: z.string().optional(),

  vehicleId: z.string().optional(),
  driverPersonId: z.string().optional(),
  supervisorPersonIds: z.array(z.string()).optional(),

  areaLabel: z.string().optional(),
  startsFromLabel: z.string().optional(),
  endsAtLabel: z.string().optional(),

  status: TransportRouteStatusSchema,

  order: z.number().optional(),
  isArchived: z.boolean().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type TransportRoute = z.infer<typeof TransportRouteSchema>;

export const TransportVehicleSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  code: z.string().optional(),
  plateNumber: z.string().optional(),
  title: z.string(),
  model: z.string().optional(),
  capacity: z.number().int().nonnegative().optional(),

  driverPersonId: z.string().optional(),
  status: TransportVehicleStatusSchema,

  notes: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type TransportVehicle = z.infer<typeof TransportVehicleSchema>;

export const TransportRouteStopSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  routeId: z.string(),

  title: z.string(),
  description: z.string().optional(),
  kind: TransportRouteStopKindSchema,

  areaLabel: z.string().optional(),
  addressText: z.string().optional(),

  latitude: z.number().optional(),
  longitude: z.number().optional(),

  order: z.number().optional(),
  estimatedMorningTime: z.string().optional(),
  estimatedAfternoonTime: z.string().optional(),

  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type TransportRouteStop = z.infer<typeof TransportRouteStopSchema>;

export const StudentTransportEnrollmentSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  studentId: z.string(),
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),
  guardianPhone: z.string().optional(),

  routeId: z.string(),
  routeTitle: z.string().optional(),

  pickupStopId: z.string().optional(),
  pickupStopTitle: z.string().optional(),

  dropoffStopId: z.string().optional(),
  dropoffStopTitle: z.string().optional(),

  status: StudentTransportEnrollmentStatusSchema,

  startsAt: z.number().optional(),
  endsAt: z.number().optional(),

  notes: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type StudentTransportEnrollment = z.infer<
  typeof StudentTransportEnrollmentSchema
>;

export const TransportAttendanceBatchStudentRowSchema = z.object({
  studentId: z.string(),
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string(),

  enrollmentId: z.string().optional(),

  status: StudentTransportAttendanceStatusSchema,

  stopId: z.string().optional(),
  stopTitle: z.string().optional(),

  recordedAt: z.number().optional(),
  recordedByPersonId: z.string().optional(),

  note: z.string().optional(),
  recordId: z.string().optional(),
});

export type TransportAttendanceBatchStudentRow = z.infer<
  typeof TransportAttendanceBatchStudentRowSchema
>;

export const TransportAttendanceBatchSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  routeId: z.string(),
  routeTitle: z.string().optional(),

  vehicleId: z.string().optional(),
  driverPersonId: z.string().optional(),
  supervisorPersonId: z.string().optional(),

  tripKind: TransportTripKindSchema,
  serviceDate: z.string(),

  status: TransportAttendanceBatchStatusSchema,

  createdByPersonId: z.string(),
  createdByRoleKey: z.string().optional(),
  operationalAssignmentId: z.string().optional(),

  targetStudentIds: z.array(z.string()),
  targetCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative().optional(),

  studentRows: z.array(TransportAttendanceBatchStudentRowSchema),

  submittedAt: z.number().optional(),
  reviewedAt: z.number().optional(),
  lockedAt: z.number().optional(),
  cancelledAt: z.number().optional(),

  note: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type TransportAttendanceBatch = z.infer<
  typeof TransportAttendanceBatchSchema
>;

export const StudentTransportAttendanceRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  routeId: z.string(),
  routeTitle: z.string().optional(),

  batchId: z.string(),
  enrollmentId: z.string().optional(),

  studentId: z.string(),
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  tripKind: TransportTripKindSchema,
  serviceDate: z.string(),

  status: StudentTransportAttendanceStatusSchema,

  stopId: z.string().optional(),
  stopTitle: z.string().optional(),

  recordedAt: z.number(),
  recordedByPersonId: z.string(),
  recordedByRoleKey: z.string().optional(),

  note: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type StudentTransportAttendanceRecord = z.infer<
  typeof StudentTransportAttendanceRecordSchema
>;

export const TransportNoteSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string().optional(),
  academicYearId: z.string().optional(),
  termId: z.string().optional(),

  routeId: z.string().optional(),
  batchId: z.string().optional(),
  recordId: z.string().optional(),

  studentId: z.string().optional(),
  studentPersonId: z.string().optional(),

  title: z.string(),
  body: z.string(),

  severity: TransportNoteSeveritySchema,
  visibility: TransportNoteVisibilitySchema,

  createdByPersonId: z.string(),
  createdByRoleKey: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type TransportNote = z.infer<typeof TransportNoteSchema>;

/** Legacy transport documents retained for the existing web-admin workflow. */
export const StudentTransportDirection = z.enum([
  "TO_SCHOOL",
  "FROM_SCHOOL",
  "ROUND_TRIP",
]);

export const TransportAttendanceStatus = z.enum([
  "BOARDED",
  "NOT_BOARDED",
  "DROPPED_OFF",
  "NOT_DROPPED_OFF",
  "EXCUSED",
]);
export const TransportTripDirection = z.enum([
  "MORNING_TO_SCHOOL",
  "AFTERNOON_FROM_SCHOOL",
]);

export const StudentTransportEnrollmentStatus =
  StudentTransportEnrollmentStatusSchema;

export const LegacyStudentTransportEnrollmentSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),
  studentId: z.string().min(1),
  enrollmentId: z.string().default(""),
  routeId: z.string().min(1),
  direction: StudentTransportDirection.default("ROUND_TRIP"),
  status: StudentTransportEnrollmentStatus.default("ACTIVE"),
  startAt: z.number().int().nonnegative(),
  endAt: z.number().int().nonnegative().optional(),
  note: z.string().default(""),
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});

export const LegacyStudentTransportAttendanceRecordSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),
  schoolDayId: z.string().min(1),
  studentId: z.string().min(1),
  enrollmentId: z.string().default(""),
  transportEnrollmentId: z.string().min(1),
  routeId: z.string().min(1),
  tripDirection: TransportTripDirection,
  status: TransportAttendanceStatus,
  batchId: z.string().default(""),
  recordedByPersonId: z.string().min(1),
  recorderRoleKey: z.string().min(1),
  recordedAt: z.number().int().nonnegative(),
  note: z.string().default(""),
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});
