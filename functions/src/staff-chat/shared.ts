import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type FirestoreRecord = Record<string, unknown>;

export type StaffChatGroupDefinition = {
  id: string;
  displayName: string;
  groupKind: "SCHOOL" | "SPECIAL";
  schoolId: string;
  automaticRule: {
    orgUnitIds: string[];
    positionCodes: string[];
    roleKeys: string[];
  };
};

const SCHOOL_GROUPS: Array<[string, string]> = [
  ["mrb-boys-sayh", "منار الريادة بنين - السيح"],
  ["mrb-boys-faleh", "منار الريادة بنين - الفالح"],
  ["mrb-girls", "منار الريادة بنات"],
  ["kg-01", "واحة الرياحين 1"],
  ["kg-02", "واحة الرياحين 2"],
  ["kg-03", "واحة الرياحين 3"],
  ["kg-04", "واحة الرياحين 4"],
];

/**
 * Only canonical role keys already defined by MembershipRole are included.
 * orgUnitId and positionCode are left ready for populated org data; neither
 * field exists in the current production membership shape yet.
 */
export const STAFF_CHAT_GROUP_DEFINITIONS: StaffChatGroupDefinition[] = [
  ...SCHOOL_GROUPS.map(([schoolId, displayName]) => ({
    id: `school:${schoolId}`,
    displayName,
    groupKind: "SCHOOL" as const,
    schoolId,
    automaticRule: { orgUnitIds: [], positionCodes: [], roleKeys: [] },
  })),
  {
    id: "special:supervision",
    displayName: "الإشراف",
    groupKind: "SPECIAL",
    schoolId: "",
    automaticRule: {
      orgUnitIds: ["supervision"],
      positionCodes: [
        "supervisor",
        "educational_supervisor",
        "administrative_supervisor",
        "supervision_head",
      ],
      roleKeys: [
        "ORG_SUPERVISION_HEAD",
        "EDU_SUPERVISOR",
        "BOYS_SUPERVISION_HEAD",
        "BOYS_EDU_SUPERVISOR",
        "GIRLS_EDU_SUPERVISOR",
        "KG_EDU_SUPERVISOR",
      ],
    },
  },
  {
    id: "special:leaders",
    displayName: "القادة",
    groupKind: "SPECIAL",
    schoolId: "",
    automaticRule: {
      orgUnitIds: [],
      positionCodes: ["principal", "ceo", "chairman"],
      roleKeys: [
        "ORG_CHAIR",
        "ORG_CEO",
        "BOYS_PRINCIPAL",
        "GIRLS_PRINCIPAL",
        "KG_PRINCIPAL",
      ],
    },
  },
];

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(readString).filter((item) => item.length > 0)),
  );
}

export function isActiveMembership(membership: FirestoreRecord): boolean {
  // Keep server authorization aligned with the canonical Firestore-rule
  // membership predicate used by the rest of the workspace.
  return membership.isActive === true || membership.active === true;
}

export function membershipRoleKey(membership: FirestoreRecord): string {
  return readString(membership.roleKey) || readString(membership.role);
}

export function membershipSchoolIds(membership: FirestoreRecord): string[] {
  const scopes = isRecord(membership.scopes) ? membership.scopes : {};
  const schoolIds = readStringArray(scopes.schoolIds);

  if (
    readString(membership.scopeType) === "SCHOOL" &&
    readString(membership.scopeId)
  ) {
    schoolIds.push(readString(membership.scopeId));
  }

  return Array.from(new Set(schoolIds));
}

function isRecord(value: unknown): value is FirestoreRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function matchesStaffChatGroup(params: {
  uid: string;
  membership: FirestoreRecord;
  group: FirestoreRecord;
}): boolean {
  const { uid, membership, group } = params;
  if (
    !isActiveMembership(membership) ||
    membershipRoleKey(membership) === "GUARDIAN" ||
    readString(group.status) !== "ACTIVE"
  ) {
    return false;
  }

  const manuallyExcluded = readStringArray(group.manualExcludedUids);
  if (manuallyExcluded.includes(uid)) return false;

  if (readStringArray(group.manualIncludedUids).includes(uid)) return true;

  if (readString(group.groupKind) === "SCHOOL") {
    const schoolId = readString(group.schoolId);
    // School chat membership is intentionally narrower than data access.
    // Only a direct school scope qualifies; canAccessAllSchools never does.
    return !!schoolId && membershipSchoolIds(membership).includes(schoolId);
  }

  if (readString(group.groupKind) !== "SPECIAL") return false;

  const rule = isRecord(group.automaticRule) ? group.automaticRule : {};
  const roleKey = membershipRoleKey(membership);
  const orgUnitId = readString(membership.orgUnitId);
  const positionCode = readString(membership.positionCode);

  return (
    readStringArray(rule.roleKeys).includes(roleKey) ||
    (!!orgUnitId && readStringArray(rule.orgUnitIds).includes(orgUnitId)) ||
    (!!positionCode &&
      readStringArray(rule.positionCodes).includes(positionCode))
  );
}

export function canManageOrg(membership: FirestoreRecord): boolean {
  return (
    isActiveMembership(membership) &&
    ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(
      membershipRoleKey(membership),
    )
  );
}

export function readRequiredString(value: unknown, fieldName: string): string {
  const result = readString(value);
  if (!result) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return result;
}

export async function getActiveMembership(params: {
  db: Firestore;
  orgId: string;
  uid: string;
}): Promise<FirestoreRecord> {
  const snapshot = await params.db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();

  if (!snapshot.exists || !isActiveMembership(snapshot.data() ?? {})) {
    throw new HttpsError(
      "permission-denied",
      "An active organization membership is required.",
    );
  }

  return snapshot.data() ?? {};
}

export async function ensureStaffChatGroupDefinitions(params: {
  db: Firestore;
  orgId: string;
}): Promise<void> {
  const refs = STAFF_CHAT_GROUP_DEFINITIONS.map((definition) =>
    params.db.doc(`orgs/${params.orgId}/staffChatGroups/${definition.id}`),
  );
  await params.db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const now = Date.now();

    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) return;

      const definition = STAFF_CHAT_GROUP_DEFINITIONS[index];
      transaction.create(refs[index], {
        id: definition.id,
        orgId: params.orgId,
        type: "STAFF_GROUP",
        status: "ACTIVE",
        isInternal: true,
        groupKind: definition.groupKind,
        displayName: definition.displayName,
        schoolId: definition.schoolId,
        automaticRule: definition.automaticRule,
        manualIncludedUids: [],
        manualExcludedUids: [],
        lastMessageSummary: "",
        lastMessageSenderUid: "",
        lastMessageSenderPersonId: "",
        lastMessageType: "TEXT",
        createdAt: now,
        updatedAt: now,
      });
    });
  });
}

export function validateOverrideUids(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must contain at most 500 Firebase Auth UIDs.`,
    );
  }

  const uids = readStringArray(value);
  if (uids.length !== value.length) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must contain non-empty Firebase Auth UIDs.`,
    );
  }

  return uids;
}
