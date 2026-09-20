import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type AdminWorkPeriod = "WEEK" | "MONTH" | "ALL";
export type AdminWorkMetricKey = "evaluations" | "performanceImprovement" | "studentCases" | "attendance" | "lessonPrepReview" | "workDocumentation" | "schoolActivities";
export type AdminWorkMetric = { count: number; latestActivityAt: number | null };
export type AdminWorkAssignment = { schoolId: string; schoolName: string; roleKey: string; roleLabel: string };
export type AdminWorkSummary = {
  personId: string; displayName: string; roleKey: string; roleLabel: string;
  schoolIds: string[]; schoolNames: string[]; assignments: AdminWorkAssignment[];
  totalActivityCount: number; latestActivityAt: number | null;
  metrics: Record<AdminWorkMetricKey, AdminWorkMetric>;
};
export type AdminWorkActivityDetails =
  | { kind: "EVALUATION"; action: "SUBMITTED" | "APPROVED"; evaluationTitle: string; targetName: string; generalNote: string; status: string; submittedAt: number | null; approvedAt: number | null; totalScore: number | null; maxScore: number | null; percentage: number | null; criteria: Array<{ itemId: string; sectionId: string; itemTitle: string; sectionTitle: string; score: number | null; maxScore: number | null; valueText: string; level: string; order: number }> }
  | { kind: "PERFORMANCE_IMPROVEMENT"; targetName: string; objective: string; status: string; createdAt: number | null; startsAt: number | null; endsAt: number | null; actions: Array<{ title: string; status: string; dueAt: number | null; completedAt: number | null }>; followUps: Array<{ score: number | null; recordedAt: number | null; note: string }>; closedAt: number | null; closureNote: string; escalatedAt: number | null; escalationReason: string }
  | { kind: "STUDENT_CASE"; studentDisplayName: string; classLabel: string; eventType: string; status: string; statusBefore: string; statusAfter: string; occurredAt: number | null }
  | { kind: "ATTENDANCE"; classLabel: string; schoolDayId: string; status: string; recordedAt: number | null; submittedAt: number | null; counts: Record<string, number | null> }
  | { kind: "LESSON_PREP_REVIEW"; action: "APPROVED" | "RETURNED"; teacherName: string; lessonTitle: string; subjectLabel: string; classLabel: string; lessonDate: string; status: string; approvedAt: number | null; returnedAt: number | null; reviewNote: string }
  | { kind: "WORK_DOCUMENTATION"; templateTitle: string; templateKey: string; instanceMode: string; createdAt: number | null; updatedAt: number | null }
  | { kind: "SCHOOL_ACTIVITY"; activityTitle: string; activityKind: string; status: string; startsAt: number | null; endsAt: number | null; locationTitle: string; organizerDisplayName: string };
export type AdminWorkActivity = { id: string; type: string; metricKey: AdminWorkMetricKey; personId: string; schoolId: string; activityAt: number; title: string; description: string; status: string; targetName: string; classLabel: string; sourceEntityId: string; details?: AdminWorkActivityDetails; href?: string };
export type AdminWorkDocumentationReadOnlyValue = { kind: "SCALAR"; key: string; value: string | number } | { kind: "TABLE"; key: string; rows: Array<Array<{ key: string; value: string | number }>> };
export type AdminWorkDocumentationReadOnlyRecord = { id: string; templateKey: string; templateTitle: string; instanceMode: "SINGLE" | "MULTIPLE"; instanceId?: string; schoolId: string; academicYearId: string; termId: string; createdAt: number | null; updatedAt: number | null; isSecret: boolean; canViewRecord: boolean; values?: AdminWorkDocumentationReadOnlyValue[] };

type Input = { orgId: string; academicYearId?: string; period?: AdminWorkPeriod };
const overview = httpsCallable<Input, { staff: AdminWorkSummary[] }>(functions, "getAdminWorkOverview");
const detail = httpsCallable<Input & { personId: string }, { staff: AdminWorkSummary; activities: AdminWorkActivity[] }>(functions, "getAdminWorkDetail");
const documentation = httpsCallable<{ orgId: string; staffPersonId: string; sourceEntityId: string }, AdminWorkDocumentationReadOnlyRecord>(functions, "getAdminWorkDocumentationRecord");

export async function loadAdminWorkOverview(params: Input) { return (await overview({ ...params, period: params.period ?? "ALL" })).data.staff; }
export async function loadAdminWorkDetail(params: Input & { personId: string }) { try { return (await detail(params)).data; } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "functions/not-found") return null; throw error; } }
export async function loadAdminWorkDocumentationRecord(params: { orgId: string; staffPersonId: string; sourceEntityId: string }) { return (await documentation(params)).data; }

export const adminWorkMetricLabels: Record<AdminWorkMetricKey, string> = {
  evaluations: "التقييمات", performanceImprovement: "خطط التحسين", studentCases: "الحالات الطلابية", attendance: "الحضور", lessonPrepReview: "مراجعة التحاضير", workDocumentation: "توثيق العمل", schoolActivities: "الأنشطة المدرسية",
};
export const adminWorkMetricOrder: AdminWorkMetricKey[] = ["evaluations", "performanceImprovement", "studentCases", "attendance", "lessonPrepReview", "workDocumentation", "schoolActivities"];
