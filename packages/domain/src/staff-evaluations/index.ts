import type {
  EvaluationApplicabilityAssignmentContext,
  EvaluationApplicabilityPolicy,
  EvaluationApplicabilityPolicyScope,
  EvaluationApplicabilityResolution,
} from "@takween/contracts";

const APPLICABLE_RESOLUTION: EvaluationApplicabilityResolution = {
  applicabilityStatus: "APPLICABLE",
  excludedFromAggregation: false,
};

function matchesScopeValue(
  expected: string | undefined,
  actual: string | undefined,
): boolean {
  return expected === undefined || expected === actual;
}

function matchesPolicyScope(
  scope: EvaluationApplicabilityPolicyScope,
  context: EvaluationApplicabilityAssignmentContext,
): boolean {
  return (
    matchesScopeValue(scope.planId, context.planId) &&
    matchesScopeValue(scope.frameworkId, context.frameworkId) &&
    matchesScopeValue(scope.frameworkKind, context.frameworkKind) &&
    matchesScopeValue(scope.planKind, context.planKind) &&
    matchesScopeValue(scope.cycleId, context.cycleId) &&
    matchesScopeValue(scope.evaluatorRoleKey, context.evaluatorRoleKey) &&
    matchesScopeValue(scope.evaluatorPersonId, context.evaluatorPersonId) &&
    matchesScopeValue(scope.targetRoleKey, context.targetRoleKey) &&
    matchesScopeValue(scope.targetKind, context.targetKind)
  );
}

function scopeSpecificity(scope: EvaluationApplicabilityPolicyScope): number {
  return Object.values(scope).filter((value) => value !== undefined).length;
}

function isEffectiveAt(
  policy: EvaluationApplicabilityPolicy,
  effectiveAt: number,
): boolean {
  if (
    typeof policy.effectiveFrom === "number" &&
    effectiveAt < policy.effectiveFrom
  ) {
    return false;
  }

  if (
    typeof policy.effectiveUntil === "number" &&
    effectiveAt > policy.effectiveUntil
  ) {
    return false;
  }

  return true;
}

function comparePolicies(
  left: EvaluationApplicabilityPolicy,
  right: EvaluationApplicabilityPolicy,
): number {
  const specificityDifference =
    scopeSpecificity(right.scope) - scopeSpecificity(left.scope);

  if (specificityDifference !== 0) return specificityDifference;

  const versionDifference = right.policyVersion - left.policyVersion;
  if (versionDifference !== 0) return versionDifference;

  const effectiveFromDifference =
    (right.effectiveFrom ?? -1) - (left.effectiveFrom ?? -1);

  if (effectiveFromDifference !== 0) return effectiveFromDifference;

  const updatedAtDifference = right.updatedAt - left.updatedAt;
  if (updatedAtDifference !== 0) return updatedAtDifference;

  return left.id.localeCompare(right.id);
}

/**
 * Resolves a school-scoped applicability decision without reading storage or
 * changing persisted evaluation data. Callers provide the evaluation context,
 * policies, and the timestamp at which applicability is being evaluated.
 */
export function resolveEvaluationApplicability(params: {
  context: EvaluationApplicabilityAssignmentContext;
  policies: EvaluationApplicabilityPolicy[];
  effectiveAt: number;
}): EvaluationApplicabilityResolution {
  const matchedPolicy = params.policies
    .filter((policy) => {
      return (
        policy.status === "ACTIVE" &&
        policy.orgId === params.context.orgId &&
        policy.schoolId === params.context.schoolId &&
        policy.academicYearId === params.context.academicYearId &&
        policy.termId === params.context.termId &&
        isEffectiveAt(policy, params.effectiveAt) &&
        matchesPolicyScope(policy.scope, params.context)
      );
    })
    .sort(comparePolicies)[0];

  if (!matchedPolicy) return APPLICABLE_RESOLUTION;

  const isNotApplicable = matchedPolicy.decision === "NOT_APPLICABLE";

  return {
    applicabilityStatus: matchedPolicy.decision,
    excludedFromAggregation: isNotApplicable,
    matchedPolicyId: matchedPolicy.id,
    matchedPolicyVersion: matchedPolicy.policyVersion,
    ...(isNotApplicable && matchedPolicy.reason
      ? { exclusionReason: matchedPolicy.reason }
      : {}),
  };
}
