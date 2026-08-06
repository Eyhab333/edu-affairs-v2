import { z } from "zod";

export const PerformanceImprovementSignalStatusSchema = z.enum([
  "NEEDS_REVIEW",
  "PLAN_OPEN",
  "DISMISSED",
]);

export type PerformanceImprovementSignalStatus = z.infer<
  typeof PerformanceImprovementSignalStatusSchema
>;

export const PerformanceImprovementSettingsSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  lowScoreThreshold: z.number().min(0).max(100).default(70),
  lowCycleCountThreshold: z.number().int().positive().default(2),
  weakItemPercentageThreshold: z.number().min(0).max(100).default(40),
  weakItemOccurrenceThreshold: z.number().int().positive().default(3),
  defaultTargetScore: z.number().min(0).max(100).default(70),
  defaultDurationDays: z.number().int().min(7).max(90).default(28),
  updatedAt: z.number(),
  updatedByPersonId: z.string().optional(),
});

export type PerformanceImprovementSettings = z.infer<
  typeof PerformanceImprovementSettingsSchema
>;

export const PerformanceImprovementTriggerReasonSchema = z.enum([
  "LOW_CYCLE_SCORE",
  "REPEATED_LOW_ITEM",
]);

export type PerformanceImprovementTriggerReason = z.infer<
  typeof PerformanceImprovementTriggerReasonSchema
>;

export const PerformanceImprovementWeakItemSchema = z.object({
  itemId: z.string().min(1),
  itemTitle: z.string().min(1),
  occurrenceCount: z.number().int().positive(),
  cycleIds: z.array(z.string()).default([]),
  latestScore: z.number().min(0),
  maxScore: z.number().positive(),
  latestPercentage: z.number().min(0).max(100),
});

export type PerformanceImprovementWeakItem = z.infer<
  typeof PerformanceImprovementWeakItemSchema
>;

export const PerformanceImprovementSignalSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),
  termId: z.string().min(1),

  evaluationPlanIds: z.array(z.string().min(1)).min(1),
  frameworkIds: z.array(z.string().min(1)).min(1),

  targetPersonId: z.string().min(1),
  targetDisplayName: z.string().optional(),
  targetEmail: z.string().email().optional(),

  status: PerformanceImprovementSignalStatusSchema.default("NEEDS_REVIEW"),
  triggerReasons: z.array(PerformanceImprovementTriggerReasonSchema).min(1),

  lowScoreThreshold: z.number().min(0).max(100),
  lowCycleCountThreshold: z.number().int().positive(),
  weakItemPercentageThreshold: z.number().min(0).max(100),
  weakItemOccurrenceThreshold: z.number().int().positive(),

  approvedCyclesCount: z.number().int().min(0),
  lowCyclesCount: z.number().int().min(0),
  approvedAverageScore: z.number().min(0).max(100),
  lastApprovedScore: z.number().min(0).max(100),
  lowCycleIds: z.array(z.string()).default([]),
  weakItems: z.array(PerformanceImprovementWeakItemSchema).default([]),

  linkedImprovementPlanId: z.string().optional(),
  dismissedAt: z.number().optional(),
  dismissedByPersonId: z.string().optional(),
  dismissalNote: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type PerformanceImprovementSignal = z.infer<
  typeof PerformanceImprovementSignalSchema
>;

export const PerformanceImprovementPlanStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "FOLLOW_UP",
  "CLOSED_IMPROVED",
  "ESCALATED",
  "CANCELLED",
]);

export type PerformanceImprovementPlanStatus = z.infer<
  typeof PerformanceImprovementPlanStatusSchema
>;

export const PerformanceImprovementActionStatusSchema = z.enum([
  "PENDING",
  "COMPLETED",
]);

export const PerformanceImprovementActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: PerformanceImprovementActionStatusSchema.default("PENDING"),
  dueAt: z.number().optional(),
  completedAt: z.number().optional(),
  completedByPersonId: z.string().optional(),
});

export type PerformanceImprovementAction = z.infer<
  typeof PerformanceImprovementActionSchema
>;

export const PerformanceImprovementFollowUpSchema = z.object({
  id: z.string().min(1),
  score: z.number().min(0).max(100),
  note: z.string().min(1),
  recordedAt: z.number(),
  recordedByPersonId: z.string().min(1),
});

export type PerformanceImprovementFollowUp = z.infer<
  typeof PerformanceImprovementFollowUpSchema
>;

export const PerformanceImprovementHistoryEventSchema = z.object({
  id: z.string().min(1),
  eventType: z.enum([
    "PLAN_OPENED",
    "ACTION_COMPLETED",
    "FOLLOW_UP_RECORDED",
    "PLAN_CLOSED_IMPROVED",
    "PLAN_ESCALATED",
  ]),
  status: PerformanceImprovementPlanStatusSchema,
  actorPersonId: z.string().min(1),
  note: z.string().optional(),
  createdAt: z.number(),
});

export type PerformanceImprovementHistoryEvent = z.infer<
  typeof PerformanceImprovementHistoryEventSchema
>;

export const PerformanceImprovementPlanSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  schoolId: z.string().min(1),
  academicYearId: z.string().min(1),
  termId: z.string().min(1),

  sourceSignalId: z.string().min(1),
  sourceEvaluationPlanIds: z.array(z.string().min(1)).min(1),
  sourceCycleIds: z.array(z.string()).default([]),

  targetPersonId: z.string().min(1),
  targetDisplayName: z.string().optional(),
  targetEmail: z.string().email().optional(),

  status: PerformanceImprovementPlanStatusSchema.default("ACTIVE"),
  baselineScore: z.number().min(0).max(100),
  targetScore: z.number().min(0).max(100),
  objective: z.string().min(3),

  weakItems: z.array(PerformanceImprovementWeakItemSchema).default([]),
  actions: z.array(PerformanceImprovementActionSchema).min(1),
  followUps: z.array(PerformanceImprovementFollowUpSchema).default([]),
  history: z.array(PerformanceImprovementHistoryEventSchema).default([]),

  ownerPersonId: z.string().min(1),
  createdByPersonId: z.string().min(1),
  startsAt: z.number(),
  endsAt: z.number(),

  closedAt: z.number().optional(),
  closedByPersonId: z.string().optional(),
  closureNote: z.string().optional(),
  escalatedAt: z.number().optional(),
  escalatedByPersonId: z.string().optional(),
  escalationReason: z.string().optional(),

  version: z.number().int().positive().default(1),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type PerformanceImprovementPlan = z.infer<
  typeof PerformanceImprovementPlanSchema
>;
