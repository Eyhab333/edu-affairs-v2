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

export const EvaluationApplicabilityPolicyStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
]);

export type EvaluationApplicabilityPolicyStatus = z.infer<
  typeof EvaluationApplicabilityPolicyStatusSchema
>;

export const EvaluationApplicabilityStatusSchema = z.enum([
  "APPLICABLE",
  "NOT_APPLICABLE",
]);

export type EvaluationApplicabilityStatus = z.infer<
  typeof EvaluationApplicabilityStatusSchema
>;

export const EvaluationApplicabilityPolicyScopeSchema = z.object({
  planId: z.string().min(1).optional(),
  frameworkId: z.string().min(1).optional(),
  frameworkKind: EvaluationFrameworkKindSchema.optional(),
  planKind: EvaluationPlanKindSchema.optional(),
  cycleId: z.string().min(1).optional(),
  evaluatorRoleKey: z.string().min(1).optional(),
  evaluatorPersonId: z.string().min(1).optional(),
  targetRoleKey: z.string().min(1).optional(),
  targetKind: EvaluationTargetKindSchema.optional(),
});

export type EvaluationApplicabilityPolicyScope = z.infer<
  typeof EvaluationApplicabilityPolicyScopeSchema
>;

export const EvaluationApplicabilityPolicySchema = z
  .object({
    id: z.string().min(1),
    orgId: z.string().min(1),
    schoolId: z.string().min(1),
    academicYearId: z.string().min(1),
    termId: z.string().min(1),

    status: EvaluationApplicabilityPolicyStatusSchema.default("ACTIVE"),
    decision: EvaluationApplicabilityStatusSchema,
    scope: EvaluationApplicabilityPolicyScopeSchema.default({}),

    reason: z.string().min(1).optional(),
    policyVersion: z.number().int().positive(),
    effectiveFrom: z.number().int().nonnegative().optional(),
    effectiveUntil: z.number().int().nonnegative().optional(),

    createdBy: z.string().min(1).optional(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((policy, context) => {
    if (
      typeof policy.effectiveFrom === "number" &&
      typeof policy.effectiveUntil === "number" &&
      policy.effectiveUntil < policy.effectiveFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effectiveUntil cannot be before effectiveFrom.",
        path: ["effectiveUntil"],
      });
    }
  });

export type EvaluationApplicabilityPolicy = z.infer<
  typeof EvaluationApplicabilityPolicySchema
>;

export type EvaluationApplicabilityAssignmentContext = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;

  planId: string;
  cycleId: string;

  evaluatorRoleKey?: string;
  evaluatorPersonId?: string;
  targetRoleKey?: string;
  targetKind?: EvaluationTargetKind;

  frameworkId?: string;
  frameworkKind?: EvaluationFrameworkKind;
  planKind?: EvaluationPlanKind;
};

export type EvaluationApplicabilityResolution = {
  applicabilityStatus: EvaluationApplicabilityStatus;
  excludedFromAggregation: boolean;
  matchedPolicyId?: string;
  matchedPolicyVersion?: number;
  exclusionReason?: string;
};

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

/** Trusted web-admin operations for one existing evaluation plan. */
export const EvaluationAdminPlanChangeActionSchema = z.enum([
  "ADD_TARGET",
  "REMOVE_TARGET",
  "REPLACE_TARGET",
  "SET_CYCLE_COUNT",
]);

export type EvaluationAdminPlanChangeAction = z.infer<
  typeof EvaluationAdminPlanChangeActionSchema
>;

export const EvaluationAdminPlanChangeInputSchema = z
  .object({
    orgId: z.string().min(1),
    planId: z.string().min(1),
    action: EvaluationAdminPlanChangeActionSchema,
    targetPersonId: z.string().min(1).optional(),
    evaluatorPersonId: z.string().min(1).optional(),
    replacementTargetPersonId: z.string().min(1).optional(),
    cycleCount: z.number().int().min(0).max(100).optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (
      ["ADD_TARGET", "REMOVE_TARGET", "REPLACE_TARGET"].includes(
        value.action,
      ) &&
      !value.targetPersonId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetPersonId"],
        message: "targetPersonId is required for this action.",
      });
    }

    if (value.action === "ADD_TARGET" && !value.evaluatorPersonId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evaluatorPersonId"],
        message: "evaluatorPersonId is required when adding a target.",
      });
    }

    if (
      value.action === "REPLACE_TARGET" &&
      !value.replacementTargetPersonId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replacementTargetPersonId"],
        message: "replacementTargetPersonId is required when replacing a target.",
      });
    }

    if (value.action === "SET_CYCLE_COUNT" && value.cycleCount === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cycleCount"],
        message: "cycleCount is required when changing the cycle count.",
      });
    }
  });

export type EvaluationAdminPlanChangeInput = z.infer<
  typeof EvaluationAdminPlanChangeInputSchema
>;

export type EvaluationAdminPlanChangeItem = {
  id: string;
  action: "CREATE" | "UPDATE" | "REMOVE" | "REACTIVATE";
  label: string;
  cycleId?: string;
  targetPersonId?: string;
  evaluatorPersonId?: string;
};

export type EvaluationAdminPlanChangePreview = {
  action: EvaluationAdminPlanChangeAction;
  fingerprint: string;
  canApply: boolean;
  plan: {
    id: string;
    title: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    frameworkId: string;
  };
  targetAssignments: EvaluationAdminPlanChangeItem[];
  evaluatorAssignments: EvaluationAdminPlanChangeItem[];
  cycles: EvaluationAdminPlanChangeItem[];
  planUpdates: EvaluationAdminPlanChangeItem[];
  historicalSubmissionCount: number;
  warnings: string[];
  conflicts: string[];
  totalWrites: number;
};

export type EvaluationAdminPlanChangeApplyResult = {
  ok: true;
  auditEventId: string;
  appliedWrites: number;
  preview: EvaluationAdminPlanChangePreview;
};

/** Legacy evaluation documents retained for the existing web-admin workflow. */
export const LegacyEvaluationFrameworkStatus = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const LegacyEvaluationFrequencyType = z.enum([
  "WEEKLY", "VISITS", "PERIODIC_ANALYSIS", "MONTHLY", "TERM", "CUSTOM",
]);
export const LegacyEvaluationCycleType = z.enum([
  "WEEK", "VISIT", "MONTH", "TERM", "PERIODIC_ANALYSIS", "CUSTOM",
]);
export const LegacyEvaluationSubmissionStatus = z.enum([
  "DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "RETURNED", "LOCKED", "CANCELLED",
]);
export const LegacyEvaluationApprovalMode = z.enum([
  "NONE", "OPTIONAL_APPROVAL", "REQUIRED_APPROVAL",
]);
export const LegacyEvaluationTargetKind = z.enum(["TEACHER", "STAFF", "LEADER", "ADMIN"]);

const LegacyEvaluationAuditFieldsSchema = z.object({
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});

export const LegacyEvaluationFrameworkSchema = LegacyEvaluationAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1), orgId: z.string().min(1), schoolId: z.string().default(""),
    title: z.string().min(1), targetRoleKey: z.string().optional(),
    targetKind: LegacyEvaluationTargetKind.default("TEACHER"),
    status: LegacyEvaluationFrameworkStatus.default("DRAFT"),
    version: z.number().int().positive().default(1), description: z.string().default(""),
    isActive: z.boolean().default(true),
  }),
);

export const LegacyEvaluationPlanSchema = LegacyEvaluationAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1), frameworkId: z.string().optional(), orgId: z.string().default(""),
    schoolId: z.string().default(""), evaluatorRoleKey: z.string().optional(),
    targetRoleKey: z.string().optional(), targetKind: LegacyEvaluationTargetKind.default("TEACHER"),
    templateKey: z.string().default(""), title: z.string().min(1),
    frequencyType: LegacyEvaluationFrequencyType, cycleType: LegacyEvaluationCycleType.optional(),
    weeksCount: z.number().int().min(0).default(0), visitsCount: z.number().int().min(0).default(0),
    monthsCount: z.number().int().min(0).default(0), termsCount: z.number().int().min(0).default(0),
    approvalMode: LegacyEvaluationApprovalMode.default("NONE"), tags: z.array(z.string()).default([]),
    isActive: z.boolean().default(true), description: z.string().default(""),
  }),
);

export const LegacyEvaluationCycleSchema = LegacyEvaluationAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1), planId: z.string().min(1), orgId: z.string().default(""),
    schoolId: z.string().default(""), academicYearId: z.string().min(1),
    cycleType: LegacyEvaluationCycleType, label: z.string().min(1),
    order: z.number().int().min(0).default(0), startsAt: z.number().int().nonnegative().optional(),
    endsAt: z.number().int().nonnegative().optional(), isOpen: z.boolean().default(true),
    isLocked: z.boolean().default(false),
  }),
);

export const LegacyEvaluationSubmissionSchema = LegacyEvaluationAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1), planId: z.string().min(1), cycleId: z.string().default(""),
    orgId: z.string().default(""), schoolId: z.string().min(1), academicYearId: z.string().min(1),
    evaluatorPersonId: z.string().min(1), evaluatorRoleKey: z.string().optional(),
    targetPersonId: z.string().default(""), targetTeacherPersonId: z.string().default(""),
    targetRoleKey: z.string().optional(), cycleLabel: z.string().min(1), templateKey: z.string().default(""),
    status: LegacyEvaluationSubmissionStatus.default("DRAFT"),
    submittedAt: z.number().int().nonnegative().optional(), reviewedAt: z.number().int().nonnegative().optional(),
    approvedAt: z.number().int().nonnegative().optional(), lockedAt: z.number().int().nonnegative().optional(),
    reviewedByPersonId: z.string().default(""), approvedByPersonId: z.string().default(""),
    totalScore: z.number().min(0).default(0), maxScore: z.number().min(0).default(0),
    weightedScore: z.number().min(0).default(0), summary: z.string().default(""),
    recommendations: z.string().default(""),
  }),
);

export const LegacyEvaluationSubmissionItemScoreSchema = LegacyEvaluationAuditFieldsSchema.merge(
  z.object({
    id: z.string().min(1), submissionId: z.string().min(1), rubricItemId: z.string().min(1),
    title: z.string().min(1), category: z.string().default(""), score: z.number().min(0).default(0),
    maxScore: z.number().min(0).default(0), weight: z.number().min(0).default(1),
    comment: z.string().default(""),
  }),
);
