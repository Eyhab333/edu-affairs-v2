import { z } from "zod";

const IdSchema = z.string().min(1);
const TimestampSchema = z.number().int().nonnegative();

const OptionalIdSchema = z.string().min(1).optional();
const OptionalTextSchema = z.string().optional();

export const SchoolActivityKindSchema = z.enum([
  "COMPETITION",
  "EVENT",
  "TRIP",
  "CLUB",
  "WORKSHOP",
  "CAMPAIGN",
  "SPORTS",
  "CULTURAL",
  "VOLUNTEERING",
  "CEREMONY",
  "OTHER",
]);
export type SchoolActivityKind = z.infer<typeof SchoolActivityKindSchema>;

export const SchoolActivityStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "PUBLISHED",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
]);
export type SchoolActivityStatus = z.infer<typeof SchoolActivityStatusSchema>;

export const SchoolActivityVisibilitySchema = z.enum([
  "PARENT_VISIBLE",
  "STAFF_ONLY",
  "INVITED_ONLY",
]);
export type SchoolActivityVisibility = z.infer<
  typeof SchoolActivityVisibilitySchema
>;

export const SchoolActivityRegistrationModeSchema = z.enum([
  "GUARDIAN_REGISTRATION",
  "STAFF_REGISTRATION",
  "NO_REGISTRATION",
]);
export type SchoolActivityRegistrationMode = z.infer<
  typeof SchoolActivityRegistrationModeSchema
>;

export const SchoolActivityRegistrationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "REJECTED",
  "CANCELLED",
  "ATTENDED",
  "ABSENT",
  "COMPLETED",
]);
export type SchoolActivityRegistrationStatus = z.infer<
  typeof SchoolActivityRegistrationStatusSchema
>;

export const SchoolActivityAttendanceStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "EXCUSED",
  "LATE",
  "LEFT_EARLY",
]);
export type SchoolActivityAttendanceStatus = z.infer<
  typeof SchoolActivityAttendanceStatusSchema
>;

export const SchoolActivityResultTypeSchema = z.enum([
  "PARTICIPATION",
  "WINNER",
  "RANK",
  "SCORE",
  "CERTIFICATE",
  "HONORABLE_MENTION",
  "OTHER",
]);
export type SchoolActivityResultType = z.infer<
  typeof SchoolActivityResultTypeSchema
>;

export const SchoolActivityNotificationTypeSchema = z.enum([
  "ACTIVITY_PUBLISHED",
  "ACTIVITY_REGISTRATION_CONFIRMED",
  "ACTIVITY_REGISTRATION_WAITLISTED",
  "ACTIVITY_REMINDER",
  "ACTIVITY_CANCELLED",
  "ACTIVITY_RESULT_PUBLISHED",
]);
export type SchoolActivityNotificationType = z.infer<
  typeof SchoolActivityNotificationTypeSchema
>;

export const SchoolActivityOperationKindSchema = z.enum([
  "STUDENT_ACTIVITY_MANAGEMENT",
]);
export type SchoolActivityOperationKind = z.infer<
  typeof SchoolActivityOperationKindSchema
>;

export const SchoolActivityTargetAudienceSchema = z.object({
  schoolIds: z.array(IdSchema).default([]),
  gradeIds: z.array(IdSchema).default([]),
  streamIds: z.array(IdSchema).default([]),
  classIds: z.array(IdSchema).default([]),
  studentIds: z.array(IdSchema).default([]),
});
export type SchoolActivityTargetAudience = z.infer<
  typeof SchoolActivityTargetAudienceSchema
>;

export const SchoolActivityAttachmentSchema = z.object({
  title: z.string().optional(),
  url: z.string().min(1),
  contentType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type SchoolActivityAttachment = z.infer<
  typeof SchoolActivityAttachmentSchema
>;

export const SchoolActivityQuestionSchema = z.object({
  key: IdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  kind: z
    .enum(["TEXT", "NUMBER", "YES_NO", "CHOICE", "MULTI_CHOICE"])
    .default("TEXT"),
  options: z.array(z.string()).default([]),
  order: z.number().int().min(0).default(0),
});
export type SchoolActivityQuestion = z.infer<
  typeof SchoolActivityQuestionSchema
>;

export const SchoolActivitySchema = z.object({
  id: IdSchema,

  orgId: IdSchema,
  schoolId: IdSchema,
  academicYearId: IdSchema,

  termId: OptionalIdSchema,
  termTitle: OptionalTextSchema,
  termShortTitle: OptionalTextSchema,

  title: z.string().min(1),
  shortDescription: z.string().optional(),
  description: z.string().default(""),

  activityKind: SchoolActivityKindSchema.default("EVENT"),
  status: SchoolActivityStatusSchema.default("DRAFT"),
  visibility: SchoolActivityVisibilitySchema.default("PARENT_VISIBLE"),
  registrationMode: SchoolActivityRegistrationModeSchema.default(
    "GUARDIAN_REGISTRATION",
  ),

  organizerPersonId: OptionalIdSchema,
  organizerRoleKey: OptionalIdSchema,
  organizerDisplayName: OptionalTextSchema,

  targetAudience: SchoolActivityTargetAudienceSchema.default({
    schoolIds: [],
    gradeIds: [],
    streamIds: [],
    classIds: [],
    studentIds: [],
  }),

  startsAt: TimestampSchema.optional(),
  endsAt: TimestampSchema.optional(),

  registrationOpensAt: TimestampSchema.optional(),
  registrationClosesAt: TimestampSchema.optional(),

  locationTitle: OptionalTextSchema,
  locationUrl: OptionalTextSchema,

  capacity: z.number().int().positive().optional(),
  allowWaitlist: z.boolean().default(true),

  registeredCount: z.number().int().min(0).default(0),
  confirmedCount: z.number().int().min(0).default(0),
  waitlistedCount: z.number().int().min(0).default(0),
  attendedCount: z.number().int().min(0).default(0),

  requiresGuardianConsent: z.boolean().default(true),
  consentText: OptionalTextSchema,

  requiresApproval: z.boolean().default(false),
  approvedByPersonId: OptionalIdSchema,
  approvedAt: TimestampSchema.optional(),

  imageUrl: OptionalTextSchema,
  attachments: z.array(SchoolActivityAttachmentSchema).default([]),
  questions: z.array(SchoolActivityQuestionSchema).default([]),
  tags: z.array(z.string()).default([]),

  cancellationReason: OptionalTextSchema,
  completionNote: OptionalTextSchema,

  createdByPersonId: OptionalIdSchema,
  createdByRoleKey: OptionalIdSchema,

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  publishedAt: TimestampSchema.optional(),
  cancelledAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  archivedAt: TimestampSchema.optional(),

  metadata: z.record(z.unknown()).default({}),
});
export type SchoolActivity = z.infer<typeof SchoolActivitySchema>;

export const SchoolActivityRegistrationAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const SchoolActivityRegistrationAnswerSchema = z.object({
  questionKey: IdSchema,
  questionTitle: z.string().optional(),
  value: SchoolActivityRegistrationAnswerValueSchema,
});
export type SchoolActivityRegistrationAnswer = z.infer<
  typeof SchoolActivityRegistrationAnswerSchema
>;

export const SchoolActivityRegistrationSchema = z.object({
  id: IdSchema,

  orgId: IdSchema,
  schoolId: IdSchema,
  academicYearId: IdSchema,

  termId: OptionalIdSchema,

  activityId: IdSchema,

  studentId: IdSchema,
  studentDisplayName: OptionalTextSchema,

  gradeId: OptionalIdSchema,
  classId: OptionalIdSchema,

  guardianUserId: OptionalIdSchema,
  guardianPersonId: OptionalIdSchema,
  guardianDisplayName: OptionalTextSchema,

  status: SchoolActivityRegistrationStatusSchema.default("PENDING"),

  consentAccepted: z.boolean().default(false),
  consentAcceptedAt: TimestampSchema.optional(),

  answers: z.array(SchoolActivityRegistrationAnswerSchema).default([]),
  guardianNote: OptionalTextSchema,
  internalNote: OptionalTextSchema,

  registeredAt: TimestampSchema.optional(),
  confirmedAt: TimestampSchema.optional(),
  waitlistedAt: TimestampSchema.optional(),
  rejectedAt: TimestampSchema.optional(),
  cancelledAt: TimestampSchema.optional(),

  reviewedByPersonId: OptionalIdSchema,
  cancellationReason: OptionalTextSchema,
  rejectionReason: OptionalTextSchema,

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  metadata: z.record(z.unknown()).default({}),
});
export type SchoolActivityRegistration = z.infer<
  typeof SchoolActivityRegistrationSchema
>;

export const SchoolActivityAttendanceRecordSchema = z.object({
  id: IdSchema,

  orgId: IdSchema,
  schoolId: IdSchema,
  academicYearId: IdSchema,

  termId: OptionalIdSchema,

  activityId: IdSchema,
  registrationId: OptionalIdSchema,

  /**
   * اختياري الآن.
   * نستخدمه لاحقًا لو النشاط أكثر من يوم أو أكثر من جلسة.
   */
  sessionId: OptionalIdSchema,

  studentId: IdSchema,
  studentDisplayName: OptionalTextSchema,

  status: SchoolActivityAttendanceStatusSchema,

  recordedByPersonId: OptionalIdSchema,
  recordedByRoleKey: OptionalIdSchema,
  recordedAt: TimestampSchema,

  note: OptionalTextSchema,

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  metadata: z.record(z.unknown()).default({}),
});
export type SchoolActivityAttendanceRecord = z.infer<
  typeof SchoolActivityAttendanceRecordSchema
>;

export const SchoolActivityResultSchema = z.object({
  id: IdSchema,

  orgId: IdSchema,
  schoolId: IdSchema,
  academicYearId: IdSchema,

  termId: OptionalIdSchema,

  activityId: IdSchema,
  registrationId: OptionalIdSchema,

  studentId: IdSchema,
  studentDisplayName: OptionalTextSchema,

  resultType: SchoolActivityResultTypeSchema.default("PARTICIPATION"),

  title: OptionalTextSchema,
  rank: z.number().int().positive().optional(),
  score: z.number().min(0).optional(),
  maxScore: z.number().positive().optional(),

  note: OptionalTextSchema,
  certificateUrl: OptionalTextSchema,

  publishedToGuardian: z.boolean().default(false),
  publishedAt: TimestampSchema.optional(),

  createdByPersonId: OptionalIdSchema,
  createdByRoleKey: OptionalIdSchema,

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  metadata: z.record(z.unknown()).default({}),
});
export type SchoolActivityResult = z.infer<typeof SchoolActivityResultSchema>;