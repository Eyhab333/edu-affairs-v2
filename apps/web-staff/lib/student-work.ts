import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type StudentWorkPeriod = "WEEK" | "MONTH" | "ALL";

export type StudentWorkMetricKey =
  | "attendance"
  | "measurements"
  | "learningLoss"
  | "gamification";

export type StudentWorkModuleKey =
  | StudentWorkMetricKey
  | "homework"
  | "notes";

export type StudentWorkMetric = {
  count: number;
  latestActivityAt: number | null;
  value?: number;
};

export type StudentWorkSummary = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  gradeId: string;
  streamId: string;
  metrics: Record<StudentWorkMetricKey, StudentWorkMetric>;
};

export type StudentWorkDrillDownItem = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  summary: string[];
  details: Array<{
    label: string;
    value: string;
  }>;
};

export type StudentWorkDrillDowns = Record<
  StudentWorkModuleKey,
  StudentWorkDrillDownItem[]
>;

type StudentWorkOverviewInput = {
  orgId: string;
  period?: StudentWorkPeriod;
};

type StudentWorkDetailInput = StudentWorkOverviewInput & {
  studentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
};

export type StudentWorkOverviewResponse = {
  orgId: string;
  period: StudentWorkPeriod;
  students: StudentWorkSummary[];
};

export type StudentWorkDetailResponse = {
  orgId: string;
  period: StudentWorkPeriod;
  student: StudentWorkSummary;
  drillDowns: StudentWorkDrillDowns;
};

const getStudentWorkOverviewCallable = httpsCallable<
  StudentWorkOverviewInput,
  StudentWorkOverviewResponse
>(functions, "getStudentWorkOverview");

const getStudentWorkDetailCallable = httpsCallable<
  StudentWorkDetailInput,
  StudentWorkDetailResponse
>(functions, "getStudentWorkDetail");

export async function loadStudentWorkOverview(params: StudentWorkOverviewInput) {
  const result = await getStudentWorkOverviewCallable({
    orgId: params.orgId,
    period: params.period ?? "MONTH",
  });
  return result.data;
}

export async function loadStudentWorkDetail(params: StudentWorkDetailInput) {
  try {
    const result = await getStudentWorkDetailCallable({
      ...params,
      period: params.period ?? "MONTH",
    });
    return result.data;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "functions/not-found"
    ) {
      return null;
    }
    throw error;
  }
}

export const studentWorkMetricLabels: Record<StudentWorkMetricKey, string> = {
  attendance: "الغياب",
  measurements: "القياسات",
  learningLoss: "خطط الفاقد",
  gamification: "نقاط التحفيز",
};

export const studentWorkModuleLabels: Record<StudentWorkModuleKey, string> = {
  ...studentWorkMetricLabels,
  homework: "الواجبات",
  notes: "الملاحظات والمتابعة",
};

export const studentWorkModuleOrder: StudentWorkModuleKey[] = [
  "attendance",
  "measurements",
  "learningLoss",
  "homework",
  "gamification",
  "notes",
];
