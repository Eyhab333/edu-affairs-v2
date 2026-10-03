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

/**
 * Legacy student-case records are still used by the admin case-management
 * screens. Keep these contracts separate from the event-based model above so
 * existing Firestore documents remain valid while that UI is migrated.
 */
export const CaseStatus = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "REFERRED",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const CasePriority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type CasePriority = z.infer<typeof CasePriority>;

export const StudentCaseOriginKind = z.enum([
  "TEACHER_REFERRAL",
  "STUDENT_AFFAIRS_REFERRAL",
  "COUNSELOR_REFERRAL",
  "GUARDIAN_REQUEST",
  "MANUAL",
]);
export type StudentCaseOriginKind = z.infer<typeof StudentCaseOriginKind>;

export const StudentCaseRoutingActionType = z.enum([
  "CREATE",
  "ASSIGN",
  "FORWARD",
  "RETURN",
  "ESCALATE",
  "RESOLVE",
  "CLOSE",
  "CANCEL",
  "REOPEN",
]);
export type StudentCaseRoutingActionType = z.infer<
  typeof StudentCaseRoutingActionType
>;

export const StudentCaseLogActionType = z.enum([
  "NOTE",
  "MEETING",
  "CALL_GUARDIAN",
  "NOTIFY_GUARDIAN",
  "ATTACHMENT",
  "STATUS_CHANGE",
]);
export type StudentCaseLogActionType = z.infer<typeof StudentCaseLogActionType>;

const LegacyAuditFieldsSchema = z.object({
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});

export const StudentCaseTypeSchema = LegacyAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    schoolType: z.enum(["KG", "PRIMARY"]),
    defaultOwnerRoleKey: z.string().min(1),
    allowedForwardToRoleKeys: z.array(z.string()).default([]),
    allowTeacherCreate: z.boolean().default(true),
    allowGuardianCreate: z.boolean().default(false),
    notifyGuardianOnCreate: z.boolean().default(false),
    notifyGuardianOnForward: z.boolean().default(false),
    notifyGuardianOnClose: z.boolean().default(false),
    autoCloseWhenResolved: z.boolean().default(false),
    isActive: z.boolean().default(true),
  }),
);
export type StudentCaseType = z.infer<typeof StudentCaseTypeSchema>;

export const LegacyStudentCaseSchema = LegacyAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1),
    orgId: z.string().min(1),
    schoolId: z.string().min(1),
    academicYearId: z.string().min(1),
    studentId: z.string().min(1),
    caseTypeId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(""),
    status: CaseStatus.default("OPEN"),
    priority: CasePriority.default("MEDIUM"),
    originKind: StudentCaseOriginKind.default("MANUAL"),
    currentOwnerRoleKey: z.string().min(1),
    currentAssignedPersonId: z.string().default(""),
    createdByPersonId: z.string().min(1),
    createdByRoleKey: z.string().optional(),
    latestNote: z.string().default(""),
    guardianNotifiedOnCreate: z.boolean().default(false),
    guardianNotifiedOnForward: z.boolean().default(false),
    guardianNotifiedOnClose: z.boolean().default(false),
    resolvedAt: z.number().int().nonnegative().optional(),
    resolvedByPersonId: z.string().default(""),
    closedAt: z.number().int().nonnegative().optional(),
    closedByPersonId: z.string().default(""),
    cancelledAt: z.number().int().nonnegative().optional(),
    cancelledByPersonId: z.string().default(""),
  }),
);
export type LegacyStudentCase = z.infer<typeof LegacyStudentCaseSchema>;

export const StudentCaseRoutingEventSchema = LegacyAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1),
    caseId: z.string().min(1),
    orgId: z.string().min(1),
    actionType: StudentCaseRoutingActionType,
    fromOwnerRoleKey: z.string().optional(),
    fromAssignedPersonId: z.string().default(""),
    toOwnerRoleKey: z.string().optional(),
    toAssignedPersonId: z.string().default(""),
    performedByPersonId: z.string().min(1),
    performedByRoleKey: z.string().optional(),
    performedAt: z.number().int().nonnegative(),
    note: z.string().default(""),
  }),
);

export const StudentCaseLogEntrySchema = LegacyAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1),
    caseId: z.string().min(1),
    orgId: z.string().min(1),
    actionType: StudentCaseLogActionType,
    createdByPersonId: z.string().min(1),
    createdByRoleKey: z.string().optional(),
    note: z.string().default(""),
    attachmentRefId: z.string().default(""),
  }),
);
