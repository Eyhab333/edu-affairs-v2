import { z } from "zod";

export const StudentCaseStatusSchema = z.enum([
  "OPEN",
  "IN_REVIEW",
  "IN_PROGRESS",
  "WAITING_PARENT",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
]);

export type StudentCaseStatus = z.infer<typeof StudentCaseStatusSchema>;

export const StudentCasePrioritySchema = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);

export type StudentCasePriority = z.infer<typeof StudentCasePrioritySchema>;

export const StudentCaseParentVisibilitySchema = z.enum([
  "INTERNAL_ONLY",
  "SUMMARY_VISIBLE",
  "FULL_VISIBLE",
]);

export type StudentCaseParentVisibility = z.infer<
  typeof StudentCaseParentVisibilitySchema
>;

export const StudentCaseEventTypeSchema = z.enum([
  "CREATED",
  "REFERRED",
  "COMMENT_ADDED",
  "ACTION_ADDED",
  "TRANSFERRED",
  "ESCALATED",
  "RETURNED",
  "PARENT_CONTACTED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
  "VISIBILITY_CHANGED",
]);

export type StudentCaseEventType = z.infer<typeof StudentCaseEventTypeSchema>;

export const StudentCaseSchema = z.object({
  id: z.string().min(1),

  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),

  termId: z.string().min(1).optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  studentId: z.string().min(1),
  studentPersonId: z.string().min(1).optional(),
  studentDisplayName: z.string().min(1),

  gradeId: z.string().min(1).optional(),
  gradeTitle: z.string().optional(),

  classId: z.string().min(1).optional(),
  classTitle: z.string().optional(),

  title: z.string().min(1),
  description: z.string().min(1),

  caseTypeKey: z.string().min(1),
  caseTypeTitle: z.string().optional(),

  priority: StudentCasePrioritySchema.default("NORMAL"),
  status: StudentCaseStatusSchema.default("OPEN"),

  currentAssigneePersonId: z.string().min(1).optional(),
  currentAssigneeRoleKey: z.string().optional(),
  currentAssigneeDisplayName: z.string().optional(),

  createdByPersonId: z.string().min(1),
  createdByRoleKey: z.string().optional(),
  createdByDisplayName: z.string().optional(),

  parentVisibility: StudentCaseParentVisibilitySchema.default("INTERNAL_ONLY"),
  parentVisibleSummary: z.string().optional(),

  isArchived: z.boolean().default(false),

  createdAt: z.number().int(),
  updatedAt: z.number().int(),

  resolvedAt: z.number().int().optional(),
  closedAt: z.number().int().optional(),
  cancelledAt: z.number().int().optional(),
});

export type StudentCase = z.infer<typeof StudentCaseSchema>;

export const StudentCaseEventSchema = z.object({
  id: z.string().min(1),

  caseId: z.string().min(1),

  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),

  eventType: StudentCaseEventTypeSchema,

  createdByPersonId: z.string().min(1),
  createdByRoleKey: z.string().optional(),
  createdByDisplayName: z.string().optional(),

  fromAssigneePersonId: z.string().optional(),
  fromAssigneeRoleKey: z.string().optional(),
  fromAssigneeDisplayName: z.string().optional(),

  toAssigneePersonId: z.string().optional(),
  toAssigneeRoleKey: z.string().optional(),
  toAssigneeDisplayName: z.string().optional(),

  statusBefore: StudentCaseStatusSchema.optional(),
  statusAfter: StudentCaseStatusSchema.optional(),

  note: z.string().optional(),
  internalNote: z.string().optional(),
  parentVisibleNote: z.string().optional(),

  createdAt: z.number().int(),
});

export type StudentCaseEvent = z.infer<typeof StudentCaseEventSchema>;
