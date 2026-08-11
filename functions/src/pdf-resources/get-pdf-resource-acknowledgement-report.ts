import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GetPdfResourceAcknowledgementReportInputSchema,
  MembershipRole,
  PdfResourceAcknowledgementReportSchema,
  PdfResourceAcknowledgementSchema,
  PdfResourceSchema,
  type MembershipRole as MembershipRoleType,
  type PdfResourceAcknowledgement,
  type PdfResourceAcknowledgementReport,
} from "@takween/contracts";

import {
  buildPdfResourceAcknowledgementReport,
  type PdfResourceReportStaffMember,
} from "@takween/domain";

const REGION = "me-central2";

const ADMIN_ROLES = new Set<string>([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

type DataRow = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRecord(value: unknown): DataRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DataRow)
    : {};
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

function readTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function isMembershipActive(membership: DataRow, now: number): boolean {
  if (membership.isActive === false || membership.active === false) {
    return false;
  }

  const startAt = readTimestamp(membership.startAt);
  const endAt = readTimestamp(membership.endAt);

  if (startAt !== undefined && startAt > now) {
    return false;
  }

  if (endAt !== undefined && endAt < now) {
    return false;
  }

  return true;
}

function resolveMembershipRole(
  membership: DataRow,
): MembershipRoleType | undefined {
  const roleKey = readString(membership.roleKey) || readString(membership.role);

  const parsed = MembershipRole.safeParse(roleKey);

  return parsed.success ? parsed.data : undefined;
}

function resolveMembershipSchoolIds(membership: DataRow): string[] {
  const scopes = readRecord(membership.scopes);

  const schoolIds = readStringArray(scopes.schoolIds);

  const scopeType = readString(membership.scopeType);
  const scopeId = readString(membership.scopeId);

  if (scopeType === "SCHOOL" && scopeId) {
    schoolIds.push(scopeId);
  }

  return Array.from(new Set(schoolIds));
}

function canAccessAllSchools(
  membership: DataRow,
  roleKey: MembershipRoleType,
): boolean {
  if (ADMIN_ROLES.has(roleKey)) return true;

  const scopes = readRecord(membership.scopes);

  return (
    scopes.canAccessAllSchools === true ||
    readString(membership.scopeType) === "ORG"
  );
}

export const getPdfResourceAcknowledgementReport = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<PdfResourceAcknowledgementReport> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const parsedInput =
      GetPdfResourceAcknowledgementReportInputSchema.safeParse(request.data);

    if (!parsedInput.success) {
      throw new HttpsError("invalid-argument", "Invalid report request.");
    }

    const { orgId, resourceId } = parsedInput.data;

    if (orgId.includes("/") || resourceId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "Document identifiers cannot contain '/'.",
      );
    }

    const db = getFirestore();
    const now = Date.now();

    const callerMembershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);

    const callerMembershipSnapshot = await callerMembershipRef.get();

    if (!callerMembershipSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "Organization membership was not found.",
      );
    }

    const callerMembership = callerMembershipSnapshot.data() ?? {};

    if (!isMembershipActive(callerMembership, now)) {
      throw new HttpsError(
        "permission-denied",
        "Organization membership is inactive.",
      );
    }

    const callerRole = resolveMembershipRole(callerMembership);

    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "Organization administration permission is required.",
      );
    }

    const resourceRef = db.doc(`orgs/${orgId}/pdfResources/${resourceId}`);

    const acknowledgementsRef = db.collection(
      `orgs/${orgId}/pdfResources/${resourceId}/acknowledgements`,
    );

    const membershipsQuery = db
      .collectionGroup("orgMemberships")
      .where("orgId", "==", orgId);

    const [resourceSnapshot, acknowledgementsSnapshot, membershipsSnapshot] =
      await Promise.all([
        resourceRef.get(),
        acknowledgementsRef.get(),
        membershipsQuery.get(),
      ]);

    if (!resourceSnapshot.exists) {
      throw new HttpsError("not-found", "PDF resource was not found.");
    }

    const parsedResource = PdfResourceSchema.safeParse({
      ...resourceSnapshot.data(),
      id: resourceId,
      orgId,
    });

    if (!parsedResource.success) {
      throw new HttpsError(
        "failed-precondition",
        "PDF resource data is invalid.",
      );
    }

    const resource = parsedResource.data;

    if (resource.audience.kind !== "STAFF_ROLES") {
      throw new HttpsError(
        "failed-precondition",
        "Acknowledgement reports currently support staff resources only.",
      );
    }

    if (!resource.requiresAcknowledgement) {
      throw new HttpsError(
        "failed-precondition",
        "This PDF resource does not require acknowledgement.",
      );
    }

    const membershipRows: Array<
      Omit<PdfResourceReportStaffMember, "displayName">
    > = membershipsSnapshot.docs.flatMap((document) => {
      const membership = document.data();

      const membershipUid =
        readString(membership.uid) || document.ref.parent.parent?.id || "";

      const personId = readString(membership.personId);
      const roleKey = resolveMembershipRole(membership);

      if (
        !membershipUid ||
        !personId ||
        !roleKey ||
        !isMembershipActive(membership, now)
      ) {
        return [];
      }

      return [
        {
          uid: membershipUid,
          personId,
          roleKey,
          schoolIds: resolveMembershipSchoolIds(membership),
          canAccessAllSchools: canAccessAllSchools(membership, roleKey),
        },
      ];
    });

    const uniqueUidList = Array.from(
      new Set(membershipRows.map((membership) => membership.uid)),
    );

    const uniquePersonIdList = Array.from(
      new Set(membershipRows.map((membership) => membership.personId)),
    );

    const userSnapshots =
      uniqueUidList.length > 0
        ? await db.getAll(
            ...uniqueUidList.map((memberUid) => db.doc(`users/${memberUid}`)),
          )
        : [];

    const personSnapshots =
      uniquePersonIdList.length > 0
        ? await db.getAll(
            ...uniquePersonIdList.map((personId) =>
              db.doc(`orgs/${orgId}/people/${personId}`),
            ),
          )
        : [];

    const userDisplayNames = new Map(
      userSnapshots.map((snapshot) => [
        snapshot.id,
        readString(snapshot.data()?.displayName),
      ]),
    );

    const personDisplayNames = new Map(
      personSnapshots.map((snapshot) => [
        snapshot.id,
        readString(snapshot.data()?.displayName),
      ]),
    );

    const staffMembers: PdfResourceReportStaffMember[] = membershipRows.map(
      (membership) => ({
        ...membership,

        displayName:
          personDisplayNames.get(membership.personId) ||
          userDisplayNames.get(membership.uid) ||
          membership.personId,
      }),
    );

    const acknowledgements: PdfResourceAcknowledgement[] =
      acknowledgementsSnapshot.docs.flatMap((document) => {
        const parsed = PdfResourceAcknowledgementSchema.safeParse({
          ...document.data(),
          id: document.id,
          orgId,
          resourceId,
        });

        return parsed.success ? [parsed.data] : [];
      });

    const report = buildPdfResourceAcknowledgementReport({
      resource,
      staffMembers,
      acknowledgements,
      generatedAt: now,
    });

    return PdfResourceAcknowledgementReportSchema.parse(report);
  },
);
