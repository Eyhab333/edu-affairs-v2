import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type StaffWorkPeriod = "WEEK" | "MONTH" | "ALL";
export type StaffWorkMetricKey =
  | "evaluations"
  | "performanceImprovement"
  | "studentCases"
  | "attendance"
  | "lessonPrepReview"
  | "workDocumentation";

export type StaffWorkMetric = { count: number; latestActivityAt: number | null };
export type StaffWorkSummary = {
  personId: string;
  displayName: string;
  roleKey: string;
  roleLabel: string;
  schoolIds: string[];
  schoolNames: string[];
  totalActivityCount: number;
  latestActivityAt: number | null;
  metrics: Record<StaffWorkMetricKey, StaffWorkMetric>;
};
export type StaffWorkActivity = {
  id: string;
  type: string;
  metricKey: StaffWorkMetricKey;
  personId: string;
  schoolId: string;
  activityAt: number;
  title: string;
  description: string;
  status: string;
  targetName: string;
  classLabel: string;
  sourceEntityId: string;
  href?: string;
};

type Input = { orgId: string; academicYearId?: string; period?: StaffWorkPeriod };
const overview = httpsCallable<Input, { staff: StaffWorkSummary[] }>(functions, "getStaffWorkOverview");
const detail = httpsCallable<Input & { personId: string }, { staff: StaffWorkSummary; activities: StaffWorkActivity[] }>(functions, "getStaffWorkDetail");

export async function loadStaffWorkOverview(params: Input) {
  return (await overview({ ...params, period: params.period ?? "ALL" })).data.staff;
}
export async function loadStaffWorkDetail(params: Input & { personId: string }) {
  try { return (await detail(params)).data; }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "functions/not-found") return null;
    throw error;
  }
}

export const staffWorkMetricLabels: Record<StaffWorkMetricKey, string> = {
  evaluations: "التقييمات",
  performanceImprovement: "خطط التحسين",
  studentCases: "الحالات الطلابية",
  attendance: "الحضور",
  lessonPrepReview: "مراجعة التحاضير",
  workDocumentation: "توثيق العمل",
};
export const staffWorkMetricOrder: StaffWorkMetricKey[] = ["evaluations", "performanceImprovement", "studentCases", "attendance", "lessonPrepReview", "workDocumentation"];
