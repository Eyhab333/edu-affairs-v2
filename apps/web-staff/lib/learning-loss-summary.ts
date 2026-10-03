import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type LearningLossSummarySkill = {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: string;
};

export type LearningLossSummaryRemediationAction = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueAt: number | null;
  completedAt: number | null;
  note: string;
};

export type LearningLossSummaryRow = {
  id: string;
  teacherPersonId: string;
  teacherDisplayName: string;
  studentId: string;
  studentDisplayName: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  classId: string;
  classTitle: string;
  subjectKey: string;
  subjectTitle: string;
  classSubjectOfferingId: string;
  status: string;
  sourceType: string;
  sourceTitle: string;
  sourceKind: string;
  planTitle: string;
  planText: string;
  planStartAt: number | null;
  planEndAt: number | null;
  lostSkills: LearningLossSummarySkill[];
  remediationActions: LearningLossSummaryRemediationAction[];
  baselineScore: number | null;
  baselineMaxScore: number | null;
  baselineMeasuredAt: number | null;
  firstCheckScore: number | null;
  firstCheckMaxScore: number | null;
  firstCheckMeasuredAt: number | null;
  firstCheckNote: string;
  secondCheckScore: number | null;
  secondCheckMaxScore: number | null;
  secondCheckMeasuredAt: number | null;
  secondCheckNote: string;
  improvementIndicator: string;
  improvementDelta: number | null;
  improvementPercentage: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastFollowUpAt: number | null;
};

type LearningLossSummaryResponse = {
  rows: LearningLossSummaryRow[];
};

const getLearningLossSummary = httpsCallable<
  { orgId: string },
  LearningLossSummaryResponse
>(functions, "getLearningLossSummary");

export async function loadLearningLossSummary(params: { orgId: string }) {
  const response = await getLearningLossSummary({ orgId: params.orgId });
  return response.data;
}
