import { z } from "zod";

export const UrgentCommunicationPrioritySchema = z.enum([
  "NORMAL",
  "URGENT",
]);

export type UrgentCommunicationPriority = z.infer<
  typeof UrgentCommunicationPrioritySchema
>;

export const UrgentCommunicationStatusSchema = z.enum([
  "ACTIVE",
  "RESPONDED",
  "ESCALATED",
  "CLOSED",
  "CANCELLED",
]);

export type UrgentCommunicationStatus = z.infer<
  typeof UrgentCommunicationStatusSchema
>;

export const UrgentCommunicationLevelSchema = z.enum([
  "TEACHER",
  "COUNSELOR",
  "PRINCIPAL",
  "SUPERVISION_HEAD",
]);

export type UrgentCommunicationLevel = z.infer<
  typeof UrgentCommunicationLevelSchema
>;

export const UrgentCommunicationTimelineEventTypeSchema = z.enum([
  "URGENT_REQUEST_CREATED",
  "SLA_STARTED",
  "ASSIGNED",
  "MESSAGE_SENT",
  "RESPONSIBLE_REPLIED",
  "DEADLINE_MISSED",
  "ESCALATED",
  "CLOSED",
  "CANCELLED",
  "SYSTEM_NOTE",
]);

export type UrgentCommunicationTimelineEventType = z.infer<
  typeof UrgentCommunicationTimelineEventTypeSchema
>;

export const UrgentCommunicationAssigneeSchema = z.object({
  uid: z.string().min(1),
  personId: z.string().min(1).optional(),
  roleKey: z.string().min(1),
  displayName: z.string().min(1),
});

export type UrgentCommunicationAssignee = z.infer<
  typeof UrgentCommunicationAssigneeSchema
>;

export const UrgentCommunicationLevelStateSchema = z.object({
  level: UrgentCommunicationLevelSchema,
  assignee: UrgentCommunicationAssigneeSchema.optional(),

  startedAt: z.number().int().min(0).optional(),
  deadlineAt: z.number().int().min(0).optional(),
  completedAt: z.number().int().min(0).optional(),

  status: z.enum(["PENDING", "ACTIVE", "RESPONDED", "MISSED", "SKIPPED"]),
});

export type UrgentCommunicationLevelState = z.infer<
  typeof UrgentCommunicationLevelStateSchema
>;

export const UrgentCommunicationRequestSchema = z.object({
  id: z.string().min(1),

  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),

  gradeId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  studentId: z.string().min(1),

  threadId: z.string().min(1),

  priority: UrgentCommunicationPrioritySchema.default("URGENT"),
  status: UrgentCommunicationStatusSchema.default("ACTIVE"),

  currentLevel: UrgentCommunicationLevelSchema,
  currentAssignee: UrgentCommunicationAssigneeSchema.optional(),
  currentDeadlineAt: z.number().int().min(0).optional(),

  requestedByUid: z.string().min(1),
  requestedByPersonId: z.string().min(1).optional(),
  requestedByRoleKey: z.string().min(1).optional(),
  requestedByDisplayName: z.string().min(1).optional(),

  title: z.string().min(1).optional(),
  initialMessageId: z.string().min(1).optional(),

  levelStates: z.array(UrgentCommunicationLevelStateSchema).default([]),

  respondedAt: z.number().int().min(0).optional(),
  respondedByUid: z.string().min(1).optional(),
  respondedByPersonId: z.string().min(1).optional(),
  respondedByRoleKey: z.string().min(1).optional(),

  closedAt: z.number().int().min(0).optional(),
  closedByUid: z.string().min(1).optional(),
  closeReason: z.string().optional(),

  cancelledAt: z.number().int().min(0).optional(),
  cancelledByUid: z.string().min(1).optional(),
  cancelReason: z.string().optional(),

  temporalWorkflowId: z.string().min(1).optional(),
  temporalRunId: z.string().min(1).optional(),

  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
});

export type UrgentCommunicationRequest = z.infer<
  typeof UrgentCommunicationRequestSchema
>;

export const UrgentCommunicationTimelineEventSchema = z.object({
  id: z.string().min(1),

  orgId: z.string().min(1),
  requestId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),

  type: UrgentCommunicationTimelineEventTypeSchema,

  level: UrgentCommunicationLevelSchema.optional(),
  fromLevel: UrgentCommunicationLevelSchema.optional(),
  toLevel: UrgentCommunicationLevelSchema.optional(),

  actorUid: z.string().min(1).optional(),
  actorPersonId: z.string().min(1).optional(),
  actorRoleKey: z.string().min(1).optional(),
  actorDisplayName: z.string().min(1).optional(),

  assignee: UrgentCommunicationAssigneeSchema.optional(),

  messageId: z.string().min(1).optional(),

  title: z.string().min(1),
  details: z.record(z.unknown()).default({}),

  createdAt: z.number().int().min(0),
});

export type UrgentCommunicationTimelineEvent = z.infer<
  typeof UrgentCommunicationTimelineEventSchema
>;