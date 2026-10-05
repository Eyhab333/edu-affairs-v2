import type { StaffEvaluationTask } from "@/lib/staff-evaluations";

export type PersonTaskGroup = {
  key: string;
  displayName: string;
  email: string;
  roleKey?: string;
  tasks: StaffEvaluationTask[];
  total: number;
  pending: number;
  draft: number;
  submitted: number;
  approved: number;
  performanceImprovementStatus?: "NEEDS_REVIEW" | "PLAN_OPEN";
};

export type EvaluationPlanGroup = {
  id: string;
  title: string;
  frameworkTitle: string;
  tasks: StaffEvaluationTask[];
  people: number;
  total: number;
  pending: number;
  draft: number;
  submitted: number;
  approved: number;
};
