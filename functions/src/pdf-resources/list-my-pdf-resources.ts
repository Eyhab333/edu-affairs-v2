import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  MembershipRole,
  PdfResourceSchema,
  type MembershipRole as MembershipRoleType,
  type PdfResource,
} from "@takween/contracts";
import { filterPdfResourcesForStaff } from "@takween/domain";

const REGION = "me-central2";

type DataRow = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)),
      )
    : [];
}

function readRecord(value: unknown): DataRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DataRow)
    : {};
}

function readTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function isActiveMembership(membership: DataRow, now: number) {
  if (membership.isActive === false || membership.active === false) return false;
  const startAt = readTimestamp(membership.startAt);
  const endAt = readTimestamp(membership.endAt);
  return !(startAt !== undefined && startAt > now) && !(endAt !== undefined && endAt < now);
}

function resolveRole(membership: DataRow): MembershipRoleType | undefined {
  const parsed = MembershipRole.safeParse(readString(membership.roleKey) || readString(membership.role));
  return parsed.success ? parsed.data : undefined;
}

function resolveSchoolIds(membership: DataRow) {
  const schoolIds = readStringArray(readRecord(membership.scopes).schoolIds);
  if (readString(membership.scopeType) === "SCHOOL" && readString(membership.scopeId)) {
    schoolIds.push(readString(membership.scopeId));
  }
  return Array.from(new Set(schoolIds));
}

function canAccessAllSchools(membership: DataRow, role: MembershipRoleType) {
  return (
    ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(role) ||
    readRecord(membership.scopes).canAccessAllSchools === true ||
    readString(membership.scopeType) === "ORG"
  );
}

/**
 * Server-mediated list avoids Firestore's unsupported two-array client query
 * while applying the same domain targeting rules before returning any resource.
 */
export const listMyPdfResources = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<PdfResource[]> => {
    const uid = request.auth?.uid;
    const orgId = readString(request.data?.orgId);
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!orgId || orgId.includes("/")) {
      throw new HttpsError("invalid-argument", "A valid organization identifier is required.");
    }

    const db = getFirestore();
    const now = Date.now();
    const membershipSnapshot = await db.doc(`users/${uid}/orgMemberships/${orgId}`).get();
    if (!membershipSnapshot.exists) {
      throw new HttpsError("permission-denied", "Organization membership was not found.");
    }

    const membership = membershipSnapshot.data() ?? {};
    const role = resolveRole(membership);
    const personId = readString(membership.personId);
    if (!isActiveMembership(membership, now) || !role || !personId) {
      throw new HttpsError("permission-denied", "An active staff membership is required.");
    }

    const resourcesSnapshot = await db.collection(`orgs/${orgId}/pdfResources`).get();
    const resources = resourcesSnapshot.docs.flatMap((resource) => {
      const parsed = PdfResourceSchema.safeParse({ id: resource.id, orgId, ...resource.data() });
      return parsed.success ? [parsed.data] : [];
    });

    return filterPdfResourcesForStaff({
      resources,
      staff: {
        orgId,
        personId,
        roleKeys: [role],
        schoolIds: resolveSchoolIds(membership),
        canAccessAllSchools: canAccessAllSchools(membership, role),
      },
    }).sort((left, right) => right.publishedAt - left.publishedAt);
  },
);
