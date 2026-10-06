import { z } from "zod";

/** Filters accepted by the read-only Staff evaluation reporting callables. */
export const EvaluationReportStatusFilterSchema = z.enum([
  "PENDING",
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED",
  "APPROVED",
  "LOCKED",
  "CANCELLED",
]);

export type EvaluationReportStatusFilter = z.infer<
  typeof EvaluationReportStatusFilterSchema
>;

const OptionalIdSchema = z.string().trim().min(1).optional();

export const EvaluationReportRequestSchema = z.object({
  orgId: z.string().trim().min(1),
  academicYearId: OptionalIdSchema,
  termId: OptionalIdSchema,
  schoolId: OptionalIdSchema,
  targetRoleKey: OptionalIdSchema,
  targetPersonId: OptionalIdSchema,
  evaluationType: OptionalIdSchema,
  status: EvaluationReportStatusFilterSchema.optional(),
});

export type EvaluationReportRequest = z.infer<
  typeof EvaluationReportRequestSchema
>;

export type EvaluationReportOption = {
  id: string;
  label: string;
};

export type EvaluationReportFilterOptions = {
  schools: EvaluationReportOption[];
  academicYears: EvaluationReportOption[];
  terms: EvaluationReportOption[];
  roles: EvaluationReportOption[];
  people: EvaluationReportOption[];
  evaluationTypes: EvaluationReportOption[];
  statuses: EvaluationReportOption[];
};

export type EvaluationReportKpis = {
  employeesCount: number;
  approvedAverageScore?: number;
  plansCount: number;
  totalCycles: number;
  completedCycles: number;
  remainingCycles: number;
};

export type EvaluationReportEmployee = {
  targetPersonId: string;
  displayName: string;
  email?: string;
  roleKeys: string[];
  schoolIds: string[];
  schoolNames: string[];
  planCount: number;
  totalCycles: number;
  completedCycles: number;
  remainingCycles: number;
  approvedAverageScore?: number;
  lastScore?: number;
  status: EvaluationReportStatusFilter;
  latestActivityAt?: number;
};

export type EvaluationReportSchool = {
  schoolId: string;
  schoolName: string;
  employeesCount: number;
  plansCount: number;
  totalCycles: number;
  completedCycles: number;
  remainingCycles: number;
  approvedAverageScore?: number;
  completionPercentage?: number;
};

export type EvaluationReportOverview = {
  filters: EvaluationReportFilterOptions;
  kpis: EvaluationReportKpis;
  employees: EvaluationReportEmployee[];
  schools: EvaluationReportSchool[];
};

export type EvaluationReportCycleEvaluator = {
  personId: string;
  displayName: string;
  email?: string;
  roleKey?: string;
  weight?: number;
};

export type EvaluationReportPersonCycle = {
  cycleId: string;
  cycleTitle: string;
  cycleNumber?: number;
  cycleKind?: string;
  cycleStatus: string;
  status: EvaluationReportStatusFilter;
  evaluators: EvaluationReportCycleEvaluator[];
  finalScore?: number;
  includedInAverage: boolean;
  submittedAt?: number;
  approvedAt?: number;
  updatedAt?: number;
};

export type EvaluationReportPersonPlan = {
  planId: string;
  planTitle: string;
  schoolId: string;
  schoolName: string;
  frameworkId?: string;
  frameworkTitle?: string;
  frameworkKind?: string;
  planKind?: string;
  targetRoleKey?: string;
  planStatus: string;
  totalCycles: number;
  completedCycles: number;
  remainingCycles: number;
  approvedAverageScore?: number;
  cycles: EvaluationReportPersonCycle[];
};

export type EvaluationReportPersonDetail = {
  employee: EvaluationReportEmployee;
  overallApprovedAverageScore?: number;
  plans: EvaluationReportPersonPlan[];
};
