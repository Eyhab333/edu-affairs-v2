import type {
  PerformanceImprovementTriggerReason,
  PerformanceImprovementWeakItem,
} from "@takween/contracts";

type EvaluationRow = Record<string, unknown>;

type WeakItemOccurrence = {
  cycleId: string;
  score: number;
  maxScore: number;
  percentage: number;
  itemTitle: string;
  approvedAt: number;
};

export type PerformanceImprovementDetectionResult = {
  shouldCreateSignal: boolean;
  triggerReasons: PerformanceImprovementTriggerReason[];
  approvedCyclesCount: number;
  lowCyclesCount: number;
  approvedAverageScore: number;
  lastApprovedScore: number;
  lowCycleIds: string[];
  weakItems: PerformanceImprovementWeakItem[];
};

export const DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS = {
  lowScoreThreshold: 70,
  lowCycleCountThreshold: 2,
  weakItemPercentageThreshold: 40,
  weakItemOccurrenceThreshold: 3,
} as const;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readRows(value: unknown): EvaluationRow[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is EvaluationRow =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function clampPercentage(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildPerformanceImprovementDetection(params: {
  cycleSummaries: EvaluationRow[];
  submissions: EvaluationRow[];
  lowScoreThreshold?: number;
  lowCycleCountThreshold?: number;
  weakItemPercentageThreshold?: number;
  weakItemOccurrenceThreshold?: number;
}): PerformanceImprovementDetectionResult {
  const lowScoreThreshold = clampPercentage(
    params.lowScoreThreshold ??
      DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS.lowScoreThreshold,
  );
  const lowCycleCountThreshold = Math.max(
    1,
    Math.floor(
      params.lowCycleCountThreshold ??
        DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS.lowCycleCountThreshold,
    ),
  );
  const weakItemPercentageThreshold = clampPercentage(
    params.weakItemPercentageThreshold ??
      DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS.weakItemPercentageThreshold,
  );
  const weakItemOccurrenceThreshold = Math.max(
    1,
    Math.floor(
      params.weakItemOccurrenceThreshold ??
        DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS.weakItemOccurrenceThreshold,
    ),
  );

  const approvedCycles = params.cycleSummaries
    .filter(
      (row) =>
        row.status === "APPROVED" &&
        row.includedInAverage === true &&
        typeof row.finalScore === "number",
    )
    .map((row) => ({
      cycleId: readString(row.cycleId),
      score: clampPercentage(readNumber(row.finalScore)),
      approvedAt: readNumber(row.approvedAt, readNumber(row.updatedAt)),
    }));

  const lowCycles = approvedCycles.filter(
    (cycle) => cycle.score < lowScoreThreshold,
  );

  const weakOccurrences = new Map<
    string,
    Map<string, WeakItemOccurrence>
  >();

  for (const submission of params.submissions) {
    if (submission.status !== "APPROVED") continue;

    const cycleId = readString(submission.cycleId);
    if (!cycleId) continue;

    const approvedAt = readNumber(
      submission.approvedAt,
      readNumber(submission.updatedAt),
    );

    for (const item of readRows(submission.itemScores)) {
      const itemId = readString(item.itemId);
      const score = readNumber(item.score, Number.NaN);
      const maxScore = readNumber(item.maxScore, Number.NaN);

      if (
        !itemId ||
        !Number.isFinite(score) ||
        !Number.isFinite(maxScore) ||
        maxScore <= 0
      ) {
        continue;
      }

      const percentage = clampPercentage((score / maxScore) * 100);
      if (percentage > weakItemPercentageThreshold) continue;

      const byCycle = weakOccurrences.get(itemId) ?? new Map();
      const previous = byCycle.get(cycleId);

      if (!previous || percentage < previous.percentage) {
        byCycle.set(cycleId, {
          cycleId,
          score,
          maxScore,
          percentage,
          itemTitle: readString(item.itemTitle) || itemId,
          approvedAt,
        });
      }

      weakOccurrences.set(itemId, byCycle);
    }
  }

  const weakItems: PerformanceImprovementWeakItem[] = [];

  for (const [itemId, byCycle] of weakOccurrences) {
    const occurrences = Array.from(byCycle.values()).sort(
      (left, right) => left.approvedAt - right.approvedAt,
    );

    if (occurrences.length < weakItemOccurrenceThreshold) continue;

    const latest = occurrences[occurrences.length - 1];
    weakItems.push({
      itemId,
      itemTitle: latest.itemTitle,
      occurrenceCount: occurrences.length,
      cycleIds: occurrences.map((item) => item.cycleId),
      latestScore: latest.score,
      maxScore: latest.maxScore,
      latestPercentage: latest.percentage,
    });
  }

  weakItems.sort(
    (left, right) =>
      right.occurrenceCount - left.occurrenceCount ||
      left.latestPercentage - right.latestPercentage,
  );

  const triggerReasons: PerformanceImprovementTriggerReason[] = [];

  if (lowCycles.length >= lowCycleCountThreshold) {
    triggerReasons.push("LOW_CYCLE_SCORE");
  }

  if (weakItems.length > 0) {
    triggerReasons.push("REPEATED_LOW_ITEM");
  }

  const latestApprovedCycle = [...approvedCycles].sort(
    (left, right) => right.approvedAt - left.approvedAt,
  )[0];

  return {
    shouldCreateSignal: triggerReasons.length > 0,
    triggerReasons,
    approvedCyclesCount: approvedCycles.length,
    lowCyclesCount: lowCycles.length,
    approvedAverageScore: clampPercentage(
      average(approvedCycles.map((cycle) => cycle.score)),
    ),
    lastApprovedScore: latestApprovedCycle?.score ?? 0,
    lowCycleIds: lowCycles.map((cycle) => cycle.cycleId),
    weakItems,
  };
}
