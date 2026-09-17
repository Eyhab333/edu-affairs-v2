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

export type TeacherWorkDirectoryEntry = {
  teacherPersonId: string;
  displayName: string;
  schoolIds: string[];
  schoolNames: string[];
  classLabels: string[];
  subjectLabels: string[];
};

export type TeacherWorkSummary = TeacherWorkDirectoryEntry & {
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

type TeacherWorkDrillDownBase = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  classLabel: string;
  subjectLabel: string;
};

export type TeacherWorkMeasurementStudentResult = {
  studentDisplayName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  level: string;
  valueText: string;
};

export type TeacherWorkMeasurementItemScore = {
  itemKey: string;
  itemId: string;
  itemTitle: string;
  category: string;
  valueType: string;
  score: number | null;
  maxScore: number | null;
  weight: number | null;
  level: string;
  valueText: string;
  passed: boolean | null;
  note: string;
  order: number;
};

export type TeacherWorkMeasurementStudentItemDetail =
  TeacherWorkMeasurementStudentResult & {
    studentId: string;
    itemScores: TeacherWorkMeasurementItemScore[];
  };

export type TeacherWorkMeasurementDetail = {
  id: string;
  title: string;
  templateTitle: string;
  classLabel: string;
  subjectLabel: string;
  status: string;
  studentResults: TeacherWorkMeasurementStudentItemDetail[];
};

export type TeacherWorkMeasurementDrillDown = TeacherWorkDrillDownBase & {
  kind: "measurements";
  details: {
    batchKind: string;
    templateTitle: string;
    assessmentKind: string;
    trackerKind: string;
    measuredAt: number | null;
    submittedAt: number | null;
    targetCount: number | null;
    completedCount: number | null;
    missingCount: number | null;
    studentResults: TeacherWorkMeasurementStudentResult[];
  };
};

export type TeacherWorkLearningLossDrillDown = TeacherWorkDrillDownBase & {
  kind: "learningLoss";
  details: {
    sourceTitle: string;
    planText: string;
    planStartAt: number | null;
    planEndAt: number | null;
    closedAt: number | null;
    improvementIndicator: string;
    lostSkillTitles: string[];
    remediationActionTitles: string[];
  };
};

export type TeacherWorkNoteDrillDown = TeacherWorkDrillDownBase & {
  kind: "notes";
  details: {
    category: string;
    priority: string;
    visibility: string;
    recordedAt: number | null;
    followUpStatus: string;
    followUpAt: number | null;
    body: string;
    bodyVisible: boolean;
  };
};

export type TeacherWorkGamificationDrillDown = TeacherWorkDrillDownBase & {
  kind: "gamification";
  details: {
    eventType: string;
    value: number | null;
    valueKind: string;
    reasonTitle: string;
    categoryTitle: string;
    badgeTitle: string;
    occurredAt: number | null;
    visibility: string;
  };
};

export type TeacherWorkHomeworkDrillDown = TeacherWorkDrillDownBase & {
  kind: "homework";
  details: {
    description: string;
    publishedAt: number | null;
    scheduledPublishAt: number | null;
    dueAt: number | null;
    closedAt: number | null;
    maxScore: number | null;
    questionCount: number | null;
    targetCount: number | null;
    submittedCount: number | null;
    gradedCount: number | null;
    missingCount: number | null;
  };
};

export type TeacherWorkDrillDownItem =
  | TeacherWorkMeasurementDrillDown
  | TeacherWorkLearningLossDrillDown
  | TeacherWorkNoteDrillDown
  | TeacherWorkGamificationDrillDown
  | TeacherWorkHomeworkDrillDown;

export type TeacherWorkDrillDowns = {
  measurements: TeacherWorkMeasurementDrillDown[];
  learningLoss: TeacherWorkLearningLossDrillDown[];
  notes: TeacherWorkNoteDrillDown[];
  gamification: TeacherWorkGamificationDrillDown[];
  homework: TeacherWorkHomeworkDrillDown[];
};

type TeacherWorkCallableInput = {
  orgId: string;
  academicYearId?: string;
  period?: TeacherWorkPeriod;
};

type TeacherWorkOverviewResponse = {
  academicYearId: string;
  teachers: TeacherWorkDirectoryEntry[];
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

const getTeacherWorkMeasurementDetail = httpsCallable<
  {
    orgId: string;
    teacherPersonId: string;
    measurementBatchId: string;
    academicYearId?: string;
  },
  TeacherWorkMeasurementDetail
>(functions, "getTeacherWorkMeasurementDetail");

export async function loadTeacherWorkDirectory(params: {
  orgId: string;
  academicYearId?: string;
}) {
  const result = await getTeacherWorkOverview({
    orgId: params.orgId,
    academicYearId: params.academicYearId || undefined,
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

export async function loadTeacherWorkMeasurementDetail(params: {
  orgId: string;
  teacherPersonId: string;
  measurementBatchId: string;
  academicYearId?: string;
}) {
  const result = await getTeacherWorkMeasurementDetail(params);
  return result.data;
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
