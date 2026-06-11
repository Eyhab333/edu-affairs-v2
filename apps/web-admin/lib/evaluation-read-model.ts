export type EvaluationSubmissionLike = {
  id: string;
  orgId?: string;
  planId: string;
  cycleId?: string;
  cycleLabel?: string;
  schoolId: string;
  academicYearId: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
  targetRoleKey?: string;
  status: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  submittedAt?: number;
  approvedAt?: number;
  reviewedAt?: number;
  lockedAt?: number;
  cancelledAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type EvaluationPlanLike = {
  id: string;
  title?: string;
};

export type PersonLike = {
  id: string;
  displayName?: string;
};

export type EvaluationSummaryReadModel = {
  id: string;
  orgId: string;
  targetPersonId: string;
  targetDisplayName: string;
  targetRoleKey: string;
  latestSubmissionId: string;
  latestPlanId: string;
  latestPlanTitle: string;
  latestCycleId: string;
  latestCycleLabel: string;
  latestStatus: string;
  latestSchoolId: string;
  latestAcademicYearId: string;
  latestSubmittedAt?: number;
  latestApprovedAt?: number;
  totalSubmissions: number;
  draftCount: number;
  submittedCount: number;
  underReviewCount: number;
  approvedCount: number;
  returnedCount: number;
  lockedCount: number;
  cancelledCount: number;
  totalScoreSum: number;
  maxScoreSum: number;
  weightedScoreAverage: number;
  overallPercentage: number;
  createdAt: number;
  updatedAt: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function getSubmissionTargetPersonId(
  submission: EvaluationSubmissionLike
) {
  return submission.targetPersonId || submission.targetTeacherPersonId || "";
}

export function getSubmissionActivityAt(
  submission: EvaluationSubmissionLike
) {
  return (
    submission.updatedAt ??
    submission.approvedAt ??
    submission.reviewedAt ??
    submission.submittedAt ??
    submission.createdAt ??
    0
  );
}

export function buildEvaluationSummaryReadModels(args: {
  orgId: string;
  submissions: EvaluationSubmissionLike[];
  plans?: EvaluationPlanLike[];
  people?: PersonLike[];
}) {
  const { orgId, submissions, plans = [], people = [] } = args;

  const planMap = new Map(plans.map((item) => [item.id, item.title || item.id]));
  const peopleMap = new Map(
    people.map((item) => [item.id, item.displayName || item.id])
  );

  const grouped = new Map<string, EvaluationSubmissionLike[]>();

  for (const submission of submissions) {
    const targetPersonId = getSubmissionTargetPersonId(submission);
    if (!targetPersonId) continue;

    if (!grouped.has(targetPersonId)) {
      grouped.set(targetPersonId, []);
    }

    grouped.get(targetPersonId)!.push(submission);
  }

  const summaries: EvaluationSummaryReadModel[] = [];

  for (const [targetPersonId, rows] of grouped.entries()) {
    const sorted = [...rows].sort(
      (a, b) => getSubmissionActivityAt(b) - getSubmissionActivityAt(a)
    );
    const latest = sorted[0];
    if (!latest) continue;

    let draftCount = 0;
    let submittedCount = 0;
    let underReviewCount = 0;
    let approvedCount = 0;
    let returnedCount = 0;
    let lockedCount = 0;
    let cancelledCount = 0;

    let totalScoreSum = 0;
    let maxScoreSum = 0;
    let weightedScoreSum = 0;

    for (const row of rows) {
      const totalScore = Number(row.totalScore || 0);
      const maxScore = Number(row.maxScore || 0);
      const weightedScore = Number(row.weightedScore || 0);

      totalScoreSum += totalScore;
      maxScoreSum += maxScore;
      weightedScoreSum += weightedScore;

      switch (row.status) {
        case "DRAFT":
          draftCount += 1;
          break;
        case "SUBMITTED":
          submittedCount += 1;
          break;
        case "UNDER_REVIEW":
          underReviewCount += 1;
          break;
        case "APPROVED":
          approvedCount += 1;
          break;
        case "RETURNED":
          returnedCount += 1;
          break;
        case "LOCKED":
          lockedCount += 1;
          break;
        case "CANCELLED":
          cancelledCount += 1;
          break;
        default:
          break;
      }
    }

    const totalSubmissions = rows.length;
    const weightedScoreAverage =
      totalSubmissions > 0 ? round2(weightedScoreSum / totalSubmissions) : 0;

    const overallPercentage =
      maxScoreSum > 0 ? round2((totalScoreSum / maxScoreSum) * 100) : 0;

    const createdAt = Math.min(
      ...rows.map((item) => item.createdAt ?? Date.now())
    );
    const updatedAt = getSubmissionActivityAt(latest);

    summaries.push({
      id: targetPersonId,
      orgId,
      targetPersonId,
      targetDisplayName: peopleMap.get(targetPersonId) || targetPersonId,
      targetRoleKey: latest.targetRoleKey || "",
      latestSubmissionId: latest.id,
      latestPlanId: latest.planId,
      latestPlanTitle: planMap.get(latest.planId) || latest.planId,
      latestCycleId: latest.cycleId || "",
      latestCycleLabel: latest.cycleLabel || "",
      latestStatus: latest.status,
      latestSchoolId: latest.schoolId,
      latestAcademicYearId: latest.academicYearId,
      latestSubmittedAt: latest.submittedAt,
      latestApprovedAt: latest.approvedAt,
      totalSubmissions,
      draftCount,
      submittedCount,
      underReviewCount,
      approvedCount,
      returnedCount,
      lockedCount,
      cancelledCount,
      totalScoreSum: round2(totalScoreSum),
      maxScoreSum: round2(maxScoreSum),
      weightedScoreAverage,
      overallPercentage,
      createdAt,
      updatedAt,
    });
  }

  return summaries.sort((a, b) => {
    if (b.overallPercentage !== a.overallPercentage) {
      return b.overallPercentage - a.overallPercentage;
    }
    return b.updatedAt - a.updatedAt;
  });
}