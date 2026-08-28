import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type TeacherWorkPeriod = "WEEK" | "MONTH" | "ALL";

export type TeacherWorkMetricKey =
  | "measurements"
  | "learningLoss"
  | "notes"
  | "gamification"
  | "homework"
  | "lessonPrep";

export type TeacherWorkMetric = {
  count: number;
  latestActivityAt: number | null;
  uniqueStudents?: number;
  submittedCount?: number;
  activeCount?: number;
  closedCount?: number;
  draftCount?: number;
  publishedCount?: number;
  approvedCount?: number;
  returnedCount?: number;
  classLabels: string[];
  subjectLabels: string[];
};

export type TeacherWorkSummary = {
  teacherPersonId: string;
  displayName: string;
  schoolIds: string[];
  schoolNames: string[];
  classLabels: string[];
  subjectLabels: string[];
  metrics: Record<TeacherWorkMetricKey, TeacherWorkMetric>;
};

export type TeacherWorkLessonPrep = {
  id: string;
  lessonTitle: string;
  subjectLabel: string;
  classLabel: string;
  lessonDate: string;
  status: string;
  unitTitle: string;
  weekLabel: string;
  durationMinutes: string;
  lessonNumber: string;
  objectives: string;
  learningOutcomes: string;
  warmup: string;
  lessonSteps: string;
  strategies: string;
  resources: string;
  assessment: string;
  homeworkNote: string;
  approvalNote: string;
  returnReason: string;
};

export type TeacherWorkDrillDownKey = Exclude<
  TeacherWorkMetricKey,
  "lessonPrep"
>;

export type TeacherWorkDrillDownItem = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  classLabel: string;
  subjectLabel: string;
};

export type TeacherWorkDrillDowns = Record<
  TeacherWorkDrillDownKey,
  TeacherWorkDrillDownItem[]
>;

type TeacherWorkCallableInput = {
  orgId: string;
  academicYearId?: string;
  period?: TeacherWorkPeriod;
};

type TeacherWorkOverviewResponse = {
  academicYearId: string;
  period: TeacherWorkPeriod;
  teachers: TeacherWorkSummary[];
};

type TeacherWorkDetailInput = TeacherWorkCallableInput & {
  teacherPersonId: string;
};

type TeacherWorkDetailResponse = {
  academicYearId: string;
  period: TeacherWorkPeriod;
  teacher: TeacherWorkSummary;
  lessonPreps: TeacherWorkLessonPrep[];
  drillDowns: TeacherWorkDrillDowns;
};

const getTeacherWorkOverview = httpsCallable<
  TeacherWorkCallableInput,
  TeacherWorkOverviewResponse
>(functions, "getTeacherWorkOverview");

const getTeacherWorkDetail = httpsCallable<
  TeacherWorkDetailInput,
  TeacherWorkDetailResponse
>(functions, "getTeacherWorkDetail");

export async function loadTeacherWorkSummaries(params: {
  orgId: string;
  academicYearId?: string;
  period?: TeacherWorkPeriod;
}) {
  const result = await getTeacherWorkOverview({
    orgId: params.orgId,
    academicYearId: params.academicYearId || undefined,
    period: params.period ?? "ALL",
  });

  return result.data.teachers;
}

export async function loadTeacherWorkSummary(params: {
  orgId: string;
  academicYearId?: string;
  teacherPersonId: string;
  period: TeacherWorkPeriod;
}) {
  const result = await loadTeacherWorkDetail(params);
  return result?.teacher ?? null;
}

export async function loadTeacherWorkDetail(params: {
  orgId: string;
  academicYearId?: string;
  teacherPersonId: string;
  period: TeacherWorkPeriod;
}) {
  try {
    const result = await getTeacherWorkDetail({
      orgId: params.orgId,
      academicYearId: params.academicYearId || undefined,
      teacherPersonId: params.teacherPersonId,
      period: params.period,
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

export const teacherWorkMetricLabels: Record<TeacherWorkMetricKey, string> = {
  measurements: "القياسات",
  learningLoss: "الفاقد التعليمي",
  notes: "الملاحظات",
  gamification: "التحفيز",
  homework: "الواجبات",
  lessonPrep: "تحضير الدروس",
};

export const teacherWorkMetricOrder: TeacherWorkMetricKey[] = [
  "measurements",
  "learningLoss",
  "notes",
  "gamification",
  "homework",
  "lessonPrep",
];
