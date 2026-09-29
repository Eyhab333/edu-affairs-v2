export type MeasurementClassSummaryRow = {
  status?: string;
  score?: number | null;
};

export type MeasurementClassSummary = {
  totalStudentCount: number;
  includedCount: number;
  averageScore: number | null;
  percentage: number | null;
  maxScore: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Derives class-level measurement statistics from the rows already in memory.
 * Only completed rows with a finite effective score are included; in particular,
 * a score of zero remains a valid included score.
 */
export function calculateMeasurementClassSummary(params: {
  rows: MeasurementClassSummaryRow[];
  maxScore?: number | null;
}): MeasurementClassSummary {
  const scores = params.rows.flatMap((row) => {
    if (row.status !== "COMPLETED" || !isFiniteNumber(row.score)) return [];
    return [row.score];
  });

  const includedCount = scores.length;
  const averageScore =
    includedCount > 0
      ? scores.reduce((sum, score) => sum + score, 0) / includedCount
      : null;
  const maxScore = isFiniteNumber(params.maxScore) ? params.maxScore : null;
  const percentage =
    averageScore !== null && maxScore !== null && maxScore > 0
      ? (averageScore / maxScore) * 100
      : null;

  return {
    totalStudentCount: params.rows.length,
    includedCount,
    averageScore,
    percentage,
    maxScore,
  };
}

export function formatMeasurementClassSummaryNumber(value: number): string {
  return new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 1,
  }).format(value);
}
