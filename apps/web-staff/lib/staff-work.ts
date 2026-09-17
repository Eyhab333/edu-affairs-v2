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
export type StaffWorkActivityDetails =
  | {
      kind: "EVALUATION";
      action: "SUBMITTED" | "APPROVED";
      evaluationTitle: string;
      targetName: string;
      status: string;
      submittedAt: number | null;
      approvedAt: number | null;
      totalScore: number | null;
      maxScore: number | null;
      percentage: number | null;
      criteria: Array<{
        itemId: string;
        sectionId: string;
        itemTitle: string;
        sectionTitle: string;
        score: number | null;
        maxScore: number | null;
        valueText: string;
        level: string;
        order: number;
      }>;
    }
  | {
      kind: "PERFORMANCE_IMPROVEMENT";
      targetName: string;
      objective: string;
      status: string;
      createdAt: number | null;
      startsAt: number | null;
      endsAt: number | null;
      actions: Array<{ title: string; status: string; dueAt: number | null; completedAt: number | null }>;
      followUps: Array<{ score: number | null; recordedAt: number | null; note: string }>;
      closedAt: number | null;
      closureNote: string;
      escalatedAt: number | null;
      escalationReason: string;
    }
  | {
      kind: "STUDENT_CASE";
      studentDisplayName: string;
      classLabel: string;
      eventType: string;
      status: string;
      statusBefore: string;
      statusAfter: string;
      occurredAt: number | null;
    }
  | {
      kind: "ATTENDANCE";
      classLabel: string;
      schoolDayId: string;
      status: string;
      recordedAt: number | null;
      submittedAt: number | null;
      counts: { target: number | null; completed: number | null; missing: number | null; present: number | null; absent: number | null; late: number | null; excusedLate: number | null; excusedAbsent: number | null; leftEarly: number | null; studySuspended: number | null; notRecorded: number | null };
    }
  | {
      kind: "LESSON_PREP_REVIEW";
      action: "APPROVED" | "RETURNED";
      teacherName: string;
      lessonTitle: string;
      subjectLabel: string;
      classLabel: string;
      lessonDate: string;
      status: string;
      approvedAt: number | null;
      returnedAt: number | null;
      reviewNote: string;
    }
  | {
      kind: "WORK_DOCUMENTATION";
      templateTitle: string;
      templateKey: string;
      instanceMode: string;
      createdAt: number | null;
      updatedAt: number | null;
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
  /** Optional while deployed Functions catches up with the inline-details payload. */
  details?: StaffWorkActivityDetails;
  href?: string;
};

export type StaffWorkDocumentationReadOnlyValue =
  | { kind: "SCALAR"; key: string; value: string | number }
  | {
      kind: "TABLE";
      key: string;
      rows: Array<Array<{ key: string; value: string | number }>>;
    };

export type StaffWorkDocumentationReadOnlyRecord = {
  id: string;
  templateKey: string;
  templateTitle: string;
  instanceMode: "SINGLE" | "MULTIPLE";
  instanceId?: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  createdAt: number | null;
  updatedAt: number | null;
  isSecret: boolean;
  canViewRecord: boolean;
  values?: StaffWorkDocumentationReadOnlyValue[];
};

type Input = { orgId: string; academicYearId?: string; period?: StaffWorkPeriod };
const overview = httpsCallable<Input, { staff: StaffWorkSummary[] }>(functions, "getStaffWorkOverview");
const detail = httpsCallable<Input & { personId: string }, { staff: StaffWorkSummary; activities: StaffWorkActivity[] }>(functions, "getStaffWorkDetail");
const documentationRecord = httpsCallable<
  { orgId: string; staffPersonId: string; sourceEntityId: string },
  StaffWorkDocumentationReadOnlyRecord
>(functions, "getStaffWorkDocumentationRecord");

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

export async function loadStaffWorkDocumentationRecord(params: {
  orgId: string;
  staffPersonId: string;
  sourceEntityId: string;
}) {
  return (await documentationRecord(params)).data;
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
