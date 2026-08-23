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
  try {
    const result = await getTeacherWorkDetail({
      orgId: params.orgId,
      academicYearId: params.academicYearId || undefined,
      teacherPersonId: params.teacherPersonId,
      period: params.period,
    });

    return result.data.teacher;
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
  lessonPrep: "التحضير",
};

export const teacherWorkMetricOrder: TeacherWorkMetricKey[] = [
  "measurements",
  "learningLoss",
  "notes",
  "gamification",
  "homework",
  "lessonPrep",
];
