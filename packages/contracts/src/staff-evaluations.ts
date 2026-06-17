import { z } from "zod";

export const EvaluationTargetKindSchema = z.enum([
  "TEACHER",
  "STAFF",
  "ADMIN",
  "KG_TEACHER",
  "SUPERVISOR",
  "TRANSPORT_STAFF",
  "CUSTOM",
]);

export type EvaluationTargetKind = z.infer<typeof EvaluationTargetKindSchema>;

export const EvaluationFrameworkKindSchema = z.enum([
  "WEEKLY_TEACHER_EVALUATION",
  "CLASSROOM_VISIT",
  "PERIODIC_STAFF_EVALUATION",
  "KG_TEACHER_EVALUATION",
  "ADMIN_EVALUATION",
  "CUSTOM",
]);

export type EvaluationFrameworkKind = z.infer<
  typeof EvaluationFrameworkKindSchema
>;

export const EvaluationPlanKindSchema = z.enum([
  "WEEKLY",
  "MONTHLY",
  "PERIODIC",
  "VISIT_BASED",
  "ONE_TIME",
  "CUSTOM",
]);

export type EvaluationPlanKind = z.infer<typeof EvaluationPlanKindSchema>;

export const EvaluationPlanStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
]);

export type EvaluationPlanStatus = z.infer<
  typeof EvaluationPlanStatusSchema
>;

export const EvaluationCycleKindSchema = z.enum([
  "WEEK",
  "MONTH",
  "PERIOD",
  "VISIT",
  "CUSTOM",
]);

export type EvaluationCycleKind = z.infer<typeof EvaluationCycleKindSchema>;

export const EvaluationCycleStatusSchema = z.enum([
  "DRAFT",
  "OPEN",
  "CLOSED",
  "APPROVED",
  "LOCKED",
  "CANCELLED",
]);

export type EvaluationCycleStatus = z.infer<
  typeof EvaluationCycleStatusSchema
>;

export const EvaluationAssignmentStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "REMOVED",
]);

export type EvaluationAssignmentStatus = z.infer<
  typeof EvaluationAssignmentStatusSchema
>;

export const EvaluationEvaluatorAssignmentSourceTypeSchema = z.enum([
  "PLAN_POLICY",
  "OPERATIONAL_ASSIGNMENT",
  "MANUAL",
  "AUTO_DISTRIBUTION",
  "SEED",
]);

export type EvaluationEvaluatorAssignmentSourceType = z.infer<
  typeof EvaluationEvaluatorAssignmentSourceTypeSchema
>;

export const EvaluationSubmissionStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED",
  "APPROVED",
  "LOCKED",
  "CANCELLED",
]);

export type EvaluationSubmissionStatus = z.infer<
  typeof EvaluationSubmissionStatusSchema
>;

export const EvaluationScoreInputTypeSchema = z.enum([
  "SCORE",
  "LEVEL",
  "YES_NO",
  "TEXT",
  "RATING",
]);

export type EvaluationScoreInputType = z.infer<
  typeof EvaluationScoreInputTypeSchema
>;

export const EvaluationFrameworkSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  title: z.string(),
  description: z.string().optional(),

  targetKind: EvaluationTargetKindSchema,
  frameworkKind: EvaluationFrameworkKindSchema,

  schoolTypes: z.array(z.string()).default([]),

  isActive: z.boolean().default(true),
  version: z.number().int().positive().default(1),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationFramework = z.infer<typeof EvaluationFrameworkSchema>;

export const EvaluationRubricSectionSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  frameworkId: z.string(),

  title: z.string(),
  description: z.string().optional(),

  order: z.number().int().default(0),
  weight: z.number().min(0).max(100).optional(),

  isActive: z.boolean().default(true),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationRubricSection = z.infer<
  typeof EvaluationRubricSectionSchema
>;

export const EvaluationRubricItemSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  frameworkId: z.string(),
  sectionId: z.string(),

  title: z.string(),
  description: z.string().optional(),

  order: z.number().int().default(0),

  maxScore: z.number().positive(),
  weight: z.number().min(0).max(100).optional(),

  scoreInputType: EvaluationScoreInputTypeSchema.default("SCORE"),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationRubricItem = z.infer<
  typeof EvaluationRubricItemSchema
>;

export const EvaluationPlanSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  title: z.string(),
  description: z.string().optional(),

  frameworkId: z.string(),

  planKind: EvaluationPlanKindSchema,
  targetKind: EvaluationTargetKindSchema,
  status: EvaluationPlanStatusSchema.default("DRAFT"),

  startsAt: z.number().optional(),
  endsAt: z.number().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationPlan = z.infer<typeof EvaluationPlanSchema>;

export const EvaluatorPolicySchema = z.object({
  id: z.string(),
  orgId: z.string(),

  planId: z.string(),

  evaluatorRoleKey: z.string(),
  evaluatorLabel: z.string(),

  weight: z.number().min(0).max(100),

  required: z.boolean().default(true),
  canSubmit: z.boolean().default(true),
  canReview: z.boolean().default(false),
  canApprove: z.boolean().default(false),

  order: z.number().int().default(0),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluatorPolicy = z.infer<typeof EvaluatorPolicySchema>;

export const EvaluationCycleSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),

  cycleNumber: z.number().int().positive(),
  title: z.string(),
  cycleKind: EvaluationCycleKindSchema.default("WEEK"),

  status: EvaluationCycleStatusSchema.default("DRAFT"),

  startsAt: z.number().optional(),
  endsAt: z.number().optional(),

  isIncludedInAverage: z.boolean().default(true),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationCycle = z.infer<typeof EvaluationCycleSchema>;

export const EvaluationTargetAssignmentSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),

  targetPersonId: z.string(),
  targetEmail: z.string().email().optional(),
  targetDisplayName: z.string().optional(),
  targetRoleKey: z.string().optional(),
  targetKind: EvaluationTargetKindSchema,

  status: EvaluationAssignmentStatusSchema.default("ACTIVE"),

  assignedAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationTargetAssignment = z.infer<
  typeof EvaluationTargetAssignmentSchema
>;

export const EvaluationEvaluatorAssignmentSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),
  cycleId: z.string(),

  targetPersonId: z.string(),

  evaluatorPersonId: z.string(),
  evaluatorEmail: z.string().email().optional(),
  evaluatorRoleKey: z.string().optional(),

  weight: z.number().min(0).max(100),

  sourceType: EvaluationEvaluatorAssignmentSourceTypeSchema.default("MANUAL"),
  status: EvaluationAssignmentStatusSchema.default("ACTIVE"),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationEvaluatorAssignment = z.infer<
  typeof EvaluationEvaluatorAssignmentSchema
>;

export const EvaluationSubmissionItemScoreSchema = z.object({
  itemId: z.string(),
  sectionId: z.string(),

  itemTitle: z.string(),
  sectionTitle: z.string().optional(),

  score: z.number().min(0).optional(),
  maxScore: z.number().positive(),

  level: z.string().optional(),
  valueText: z.string().optional(),
  note: z.string().optional(),

  order: z.number().int().default(0),
});

export type EvaluationSubmissionItemScore = z.infer<
  typeof EvaluationSubmissionItemScoreSchema
>;

export const EvaluationSubmissionSchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),
  cycleId: z.string(),
  frameworkId: z.string(),

  targetPersonId: z.string(),
  targetEmail: z.string().email().optional(),

  evaluatorPersonId: z.string(),
  evaluatorEmail: z.string().email().optional(),
  evaluatorRoleKey: z.string().optional(),

  status: EvaluationSubmissionStatusSchema.default("DRAFT"),

  itemScores: z.array(EvaluationSubmissionItemScoreSchema).default([]),

  rawScore: z.number().min(0).optional(),
  maxScore: z.number().positive().optional(),
  normalizedScore: z.number().min(0).max(100).optional(),
  weightedScore: z.number().min(0).max(100).optional(),

  generalNote: z.string().optional(),

  submittedAt: z.number().optional(),
  approvedAt: z.number().optional(),
  approvedByPersonId: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type EvaluationSubmission = z.infer<
  typeof EvaluationSubmissionSchema
>;

export const EvaluationCycleTargetSummaryStatusSchema = z.enum([
  "PENDING",
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "LOCKED",
  "CANCELLED",
]);

export type EvaluationCycleTargetSummaryStatus = z.infer<
  typeof EvaluationCycleTargetSummaryStatusSchema
>;

export const EvaluationCycleTargetSummarySchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),
  cycleId: z.string(),

  targetPersonId: z.string(),
  targetEmail: z.string().email().optional(),

  finalScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().positive().optional(),

  status: EvaluationCycleTargetSummaryStatusSchema.default("PENDING"),
  includedInAverage: z.boolean().default(false),

  completedSubmissionsCount: z.number().int().min(0).default(0),
  missingSubmissionsCount: z.number().int().min(0).default(0),

  submittedAt: z.number().optional(),
  approvedAt: z.number().optional(),

  updatedAt: z.number(),
});

export type EvaluationCycleTargetSummary = z.infer<
  typeof EvaluationCycleTargetSummarySchema
>;

export const EvaluationStaffSummaryStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "HAS_SUBMITTED_RESULTS",
  "HAS_APPROVED_RESULTS",
  "COMPLETED",
]);

export type EvaluationStaffSummaryStatus = z.infer<
  typeof EvaluationStaffSummaryStatusSchema
>;

export const EvaluationStaffSummarySchema = z.object({
  id: z.string(),
  orgId: z.string(),

  schoolId: z.string(),
  academicYearId: z.string(),
  termId: z.string(),

  planId: z.string(),

  targetPersonId: z.string(),
  targetEmail: z.string().email().optional(),

  approvedAverageScore: z.number().min(0).max(100).optional(),
  submittedAverageScore: z.number().min(0).max(100).optional(),

  approvedCyclesCount: z.number().int().min(0).default(0),
  submittedCyclesCount: z.number().int().min(0).default(0),
  missingCyclesCount: z.number().int().min(0).default(0),

  lastApprovedScore: z.number().min(0).max(100).optional(),
  lastSubmittedScore: z.number().min(0).max(100).optional(),

  status: EvaluationStaffSummaryStatusSchema.default("PENDING"),

  updatedAt: z.number(),
});

export type EvaluationStaffSummary = z.infer<
  typeof EvaluationStaffSummarySchema
>;