import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type GuardianFinancePermissionKey =
  | "viewGuardianFinance"
  | "manageGuardianFinance"
  | "recordGuardianPayments"
  | "applyGuardianFinanceAdjustments"
  | "voidGuardianPayments"
  | "viewGuardianFinanceReports"
  | "manageGuardianFinanceSettings";

type FinanceMembershipRecord = {
  id: string;
  uid: string;
  personId: string;
  orgId: string;

  roleKey: string;

  scopeType: string;
  scopeId: string;

  schoolIds: string[];
  canAccessAllSchools: boolean;

  permissions: Record<string, boolean>;

  isActive: boolean;
  startAt?: number;
  endAt?: number;
};

export type GuardianFinanceActor = {
  uid: string;
  personId: string;
  roleKey: string;
  membershipId: string;

  scopeType: string;
  scopeId: string;

  canAccessAllSchools: boolean;
  schoolIds: string[];
};

const FULL_FINANCE_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

const COLLECTOR_PERMISSIONS = new Set<GuardianFinancePermissionKey>([
  "viewGuardianFinance",
  "manageGuardianFinance",
  "recordGuardianPayments",
  "applyGuardianFinanceAdjustments",
  "voidGuardianPayments",
  "viewGuardianFinanceReports",
]);

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function readBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, boolean> = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "boolean") {
      result[key] = item;
    }
  }

  return result;
}

function resolveIsActive(data: Record<string, unknown>): boolean {
  if (typeof data.isActive === "boolean") return data.isActive;
  if (typeof data.active === "boolean") return data.active;

  return true;
}

function normalizeMembership(params: {
  id: string;
  uid: string;
  orgId: string;
  data: Record<string, unknown>;
}): FinanceMembershipRecord {
  const scopes =
    params.data.scopes &&
    typeof params.data.scopes === "object" &&
    !Array.isArray(params.data.scopes)
      ? (params.data.scopes as Record<string, unknown>)
      : {};

  return {
    id: params.id,
    uid: readString(params.data.uid) || params.uid,
    personId: readString(params.data.personId),
    orgId: readString(params.data.orgId) || params.orgId,

    roleKey:
      readString(params.data.roleKey) ||
      readString(params.data.role),

    scopeType: readString(params.data.scopeType),
    scopeId: readString(params.data.scopeId),

    schoolIds: readStringArray(scopes.schoolIds),
    canAccessAllSchools: scopes.canAccessAllSchools === true,

    permissions: readBooleanRecord(params.data.permissions),

    isActive: resolveIsActive(params.data),
    startAt: readOptionalNumber(params.data.startAt),
    endAt: readOptionalNumber(params.data.endAt),
  };
}

function isMembershipActive(
  membership: FinanceMembershipRecord,
  now: number,
): boolean {
  if (!membership.isActive) return false;

  if (
    typeof membership.startAt === "number" &&
    membership.startAt > now
  ) {
    return false;
  }

  if (
    typeof membership.endAt === "number" &&
    membership.endAt < now
  ) {
    return false;
  }

  return true;
}

function hasFinancePermission(params: {
  membership: FinanceMembershipRecord;
  permission: GuardianFinancePermissionKey;
}): boolean {
  if (FULL_FINANCE_ROLES.has(params.membership.roleKey)) {
    return true;
  }

  if (
    params.membership.roleKey === "FINANCE_COLLECTOR" &&
    COLLECTOR_PERMISSIONS.has(params.permission)
  ) {
    return true;
  }

  return params.membership.permissions[params.permission] === true;
}

function membershipCanAccessSchool(params: {
  membership: FinanceMembershipRecord;
  schoolId?: string;
}): boolean {
  const { membership, schoolId } = params;

  if (FULL_FINANCE_ROLES.has(membership.roleKey)) {
    return true;
  }

  if (
    membership.scopeType === "ORG" ||
    membership.canAccessAllSchools
  ) {
    return true;
  }

  /**
   * العملية غير مرتبطة بمدرسة محددة،
   * ولذلك تحتاج نطاقًا مؤسسيًا.
   */
  if (!schoolId) {
    return false;
  }

  if (
    membership.scopeType === "SCHOOL" &&
    membership.scopeId === schoolId
  ) {
    return true;
  }

  return membership.schoolIds.includes(schoolId);
}

async function loadFinanceMemberships(params: {
  uid: string;
  orgId: string;
}): Promise<FinanceMembershipRecord[]> {
  const db = getFirestore();

  const userRef = db.doc(`users/${params.uid}`);
  const directMembershipRef = db.doc(
    `users/${params.uid}/orgMemberships/${params.orgId}`,
  );

  const [userSnap, directMembershipSnap] = await Promise.all([
    userRef.get(),
    directMembershipRef.get(),
  ]);

  const memberships: FinanceMembershipRecord[] = [];

  if (directMembershipSnap.exists) {
    memberships.push(
      normalizeMembership({
        id: directMembershipSnap.id,
        uid: params.uid,
        orgId: params.orgId,
        data: directMembershipSnap.data() ?? {},
      }),
    );
  }

  const directPersonId = directMembershipSnap.exists
    ? readString(directMembershipSnap.data()?.personId)
    : "";

  const userPersonId = userSnap.exists
    ? readString(userSnap.data()?.personId)
    : "";

  const personId = directPersonId || userPersonId;

  const orgMembershipsRef = db.collection(
    `orgs/${params.orgId}/memberships`,
  );

  const queries = [
    orgMembershipsRef.where("uid", "==", params.uid).get(),
  ];

  if (personId) {
    queries.push(
      orgMembershipsRef.where("personId", "==", personId).get(),
    );
  }

  const querySnapshots = await Promise.all(queries);

  for (const snapshot of querySnapshots) {
    for (const membershipDoc of snapshot.docs) {
      memberships.push(
        normalizeMembership({
          id: membershipDoc.id,
          uid: params.uid,
          orgId: params.orgId,
          data: membershipDoc.data(),
        }),
      );
    }
  }

  const uniqueMemberships = new Map<
    string,
    FinanceMembershipRecord
  >();

  for (const membership of memberships) {
    const uniqueKey = [
      membership.id,
      membership.roleKey,
      membership.scopeType,
      membership.scopeId,
    ].join("|");

    uniqueMemberships.set(uniqueKey, membership);
  }

  return Array.from(uniqueMemberships.values());
}

export async function requireGuardianFinanceAccess(params: {
  uid: string;
  orgId: string;
  permission: GuardianFinancePermissionKey;
  schoolId?: string;
}): Promise<GuardianFinanceActor> {
  const now = Date.now();

  const memberships = await loadFinanceMemberships({
    uid: params.uid,
    orgId: params.orgId,
  });

  const membership = memberships
    .filter((item) => item.orgId === params.orgId)
    .filter((item) => isMembershipActive(item, now))
    .find((item) => {
      return (
        hasFinancePermission({
          membership: item,
          permission: params.permission,
        }) &&
        membershipCanAccessSchool({
          membership: item,
          schoolId: params.schoolId,
        })
      );
    });

  if (!membership) {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to perform this financial operation.",
    );
  }

  return {
    uid: params.uid,

    personId: membership.personId || params.uid,
    roleKey: membership.roleKey,
    membershipId: membership.id,

    scopeType: membership.scopeType,
    scopeId: membership.scopeId,

    canAccessAllSchools:
      FULL_FINANCE_ROLES.has(membership.roleKey) ||
      membership.scopeType === "ORG" ||
      membership.canAccessAllSchools,

    schoolIds: membership.schoolIds,
  };
}