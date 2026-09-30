export type NormalizedEvaluatorAssignment<T> = {
  assignment: T;
  effectiveWeight: number;
};

function usableWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function readAssignmentWeight(assignment: object): unknown {
  return Reflect.get(assignment, "weight");
}

/**
 * Converts stored relative evaluator weights into effective shares. Invalid,
 * zero, and negative weights do not contribute; if none are usable, every
 * active evaluator receives an equal share so evaluation workflows continue.
 */
export function normalizeEvaluatorWeights<T extends object>(
  assignments: T[],
): Array<NormalizedEvaluatorAssignment<T>> {
  const weights = assignments.map((assignment) =>
    usableWeight(readAssignmentWeight(assignment)),
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const equalWeight = assignments.length > 0 ? 1 / assignments.length : 0;

  return assignments.map((assignment, index) => ({
    assignment,
    effectiveWeight:
      totalWeight > 0 ? weights[index] / totalWeight : equalWeight,
  }));
}
