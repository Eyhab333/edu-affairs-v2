import { HttpsError } from "firebase-functions/v2/https";

export type EvaluationRow = Record<string, unknown>;

const FULL_EVALUATION_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

export function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  return value.trim();
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export function readRecord(value: unknown): EvaluationRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EvaluationRow)
    : {};
}

function readOptionalTimestamp(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMembershipActive(data: EvaluationRow, now: number): boolean {
  if (data.isActive === false || data.active === false) return false;

  const startAt = readOptionalTimestamp(data.startAt);
  const endAt = readOptionalTimestamp(data.endAt);

  if (startAt !== undefined && startAt > now) return false;
  if (endAt !== undefined && endAt < now) return false;

  return true;
}

function membershipCanAccessSchool(params: {
  membership: EvaluationRow;
  roleKey: string;
  schoolId: string;
}): boolean {
  if (FULL_EVALUATION_ROLES.has(params.roleKey)) return true;

  const scopes = readRecord(params.membership.scopes);
  const scopeType = readString(params.membership.scopeType);
  const scopeId = readString(params.membership.scopeId);

  if (scopeType === "ORG" || scopes.canAccessAllSchools === true) return true;
  if (scopeType === "SCHOOL" && scopeId === params.schoolId) return true;

  return readStringArray(scopes.schoolIds).includes(params.schoolId);
}

function hasEvaluationPermission(
  membership: EvaluationRow,
  roleKey: string,
): boolean {
  if (FULL_EVALUATION_ROLES.has(roleKey)) return true;
  return readRecord(membership.permissions).manageEvaluations === true;
}

export function resolvePerformanceImprovementActor(params: {
  user: EvaluationRow;
  membership: EvaluationRow;
  schoolId: string;
  now: number;
}): { personId: string; roleKey: string } {
  if (!isMembershipActive(params.membership, params.now)) {
    throw new HttpsError(
      "permission-denied",
      "Active organization membership is required.",
    );
  }

  const personId =
    readString(params.membership.personId) || readString(params.user.personId);
  const roleKey =
    readString(params.membership.roleKey) ||
    readString(params.membership.role);

  if (!personId || !roleKey) {
    throw new HttpsError(
      "permission-denied",
      "The user is not linked to an evaluation actor.",
    );
  }

  if (
    !hasEvaluationPermission(params.membership, roleKey) ||
    !membershipCanAccessSchool({
      membership: params.membership,
      roleKey,
      schoolId: params.schoolId,
    })
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not have performance improvement access for this school.",
    );
  }

  return { personId, roleKey };
}

export function assertSafeDocumentId(value: string, fieldName: string): void {
  if (value.includes("/")) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} cannot contain '/'.`,
    );
  }
}
