import type {
  PersonSupervisionCapability,
  PersonSupervisionScope,
} from "@takween/contracts";

export type PersonSupervisionScopeRequest = {
  orgId: string;
  personId: string;
  capability: PersonSupervisionCapability;
  schoolId: string;
  nowMs?: number;
};

function isMatchingScope(
  scope: PersonSupervisionScope,
  request: PersonSupervisionScopeRequest,
) {
  return (
    scope.orgId === request.orgId &&
    scope.personId === request.personId &&
    scope.capability === request.capability &&
    scope.schoolId === request.schoolId &&
    isPersonSupervisionScopeActive(scope, request.nowMs)
  );
}

export function isPersonSupervisionScopeActive(
  scope: Pick<PersonSupervisionScope, "isActive" | "startAt" | "endAt">,
  nowMs = Date.now(),
) {
  if (!scope.isActive) return false;
  if (typeof scope.startAt === "number" && scope.startAt > nowMs) return false;
  if (typeof scope.endAt === "number" && scope.endAt < nowMs) return false;
  return true;
}

export function hasPersonSupervisionSchoolAccess(params: {
  scopes: readonly PersonSupervisionScope[];
  request: PersonSupervisionScopeRequest;
}) {
  return params.scopes.some((scope) => isMatchingScope(scope, params.request));
}

export function hasPersonSupervisionSubjectAccess(params: {
  scopes: readonly PersonSupervisionScope[];
  request: PersonSupervisionScopeRequest & { subjectKey: string };
}) {
  const subjectKey = params.request.subjectKey.trim();
  if (!subjectKey) return false;

  return params.scopes.some(
    (scope) =>
      isMatchingScope(scope, params.request) &&
      (scope.subjectScope === "ALL_SUBJECTS" ||
        scope.subjectKeys.includes(subjectKey)),
  );
}

export function getPersonSupervisionSchoolIds(params: {
  scopes: readonly PersonSupervisionScope[];
  orgId: string;
  personId: string;
  capability: PersonSupervisionCapability;
  nowMs?: number;
}) {
  return Array.from(
    new Set(
      params.scopes
        .filter((scope) =>
          isMatchingScope(scope, {
            orgId: params.orgId,
            personId: params.personId,
            capability: params.capability,
            schoolId: scope.schoolId,
            nowMs: params.nowMs,
          }),
        )
        .map((scope) => scope.schoolId),
    ),
  );
}

export function getPersonSupervisionSubjectScope(params: {
  scopes: readonly PersonSupervisionScope[];
  request: PersonSupervisionScopeRequest;
}) {
  const matchingScopes = params.scopes.filter((scope) =>
    isMatchingScope(scope, params.request),
  );

  return {
    allSubjects: matchingScopes.some(
      (scope) => scope.subjectScope === "ALL_SUBJECTS",
    ),
    subjectKeys: Array.from(
      new Set(
        matchingScopes.flatMap((scope) =>
          scope.subjectScope === "SUBJECT_KEYS" ? scope.subjectKeys : [],
        ),
      ),
    ),
  };
}
