import assert from "node:assert/strict";
import { buildPerformanceImprovementDetection } from "./build-performance-improvement-signal";

function cycle(cycleId: string, finalScore: number, approvedAt: number) {
  return {
    cycleId,
    finalScore,
    approvedAt,
    updatedAt: approvedAt,
    status: "APPROVED",
    includedInAverage: true,
  };
}

function submission(cycleId: string, score: number, approvedAt: number) {
  return {
    cycleId,
    approvedAt,
    updatedAt: approvedAt,
    status: "APPROVED",
    itemScores: [
      {
        itemId: "preparation",
        itemTitle: "التحضير",
        score,
        maxScore: 5,
      },
    ],
  };
}

const singleLowCycle = buildPerformanceImprovementDetection({
  cycleSummaries: [cycle("week-01", 60, 1)],
  submissions: [],
});
assert.equal(singleLowCycle.shouldCreateSignal, false);

const repeatedLowCycles = buildPerformanceImprovementDetection({
  cycleSummaries: [cycle("week-01", 60, 1), cycle("week-02", 69, 2)],
  submissions: [],
});
assert.equal(repeatedLowCycles.shouldCreateSignal, true);
assert.deepEqual(repeatedLowCycles.triggerReasons, ["LOW_CYCLE_SCORE"]);

const repeatedWeakItem = buildPerformanceImprovementDetection({
  cycleSummaries: [
    cycle("week-01", 80, 1),
    cycle("week-02", 82, 2),
    cycle("week-03", 85, 3),
  ],
  submissions: [
    submission("week-01", 2, 1),
    submission("week-02", 1, 2),
    submission("week-03", 2, 3),
  ],
});
assert.equal(repeatedWeakItem.shouldCreateSignal, true);
assert.deepEqual(repeatedWeakItem.triggerReasons, ["REPEATED_LOW_ITEM"]);
assert.equal(repeatedWeakItem.weakItems[0]?.occurrenceCount, 3);

const duplicateEvaluatorsInOneCycle = buildPerformanceImprovementDetection({
  cycleSummaries: [cycle("week-01", 80, 1)],
  submissions: [
    submission("week-01", 2, 1),
    submission("week-01", 1, 2),
    submission("week-01", 2, 3),
  ],
});
assert.equal(duplicateEvaluatorsInOneCycle.shouldCreateSignal, false);

console.log("Performance improvement detection tests passed.");
