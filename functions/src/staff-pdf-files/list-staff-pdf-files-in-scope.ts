import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  MembershipSchema,
  OperationalAssignmentSchema,
  PersonSupervisionScopeSchema,
  StaffPdfFileCategoryKey,
  StaffPdfFileSchema,
  TeacherAssignmentSchema,
  type Membership,
  type MembershipRole,
  type PersonSupervisionScope,
  type StaffPdfFile,
  type TeacherAssignment,
} from "@takween/contracts";
import {
  canViewerAccessTargetStaff,
  canViewerBrowseStaffTargets,
  resolveStaffAuthorityPersonIds,
  resolveStaffHomeSchoolIds,
  isStaffMembershipActive,
  type StaffAuthorityTarget,
  type StaffAuthorityViewer,
} from "@takween/domain";

const REGION = "me-central2";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function assertId(value: unknown, field: string) {
  const result = text(value);
  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return result;
}

function chunk<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function resolveMembershipRoles(membership: Membership): MembershipRole[] {
  const role = membership.roleKey ?? membership.role;
  return role ? [role] : [];
}

function parseMembership(params: {
  id: string;
  uid: string;
  orgId: string;
  data: unknown;
}) {
  const data = row(params.data);

  // The user/org document path is canonical. Reject contradictory stored IDs
  // rather than joining a stale membership to another identity.
  if (
    (text(data.uid) && text(data.uid) !== params.uid) ||
    (text(data.orgId) && text(data.orgId) !== params.orgId)
  ) {
    return null;
  }

  const parsed = MembershipSchema.safeParse({
    ...data,
    id: params.id,
    uid: params.uid,
    orgId: params.orgId,
  });

  return parsed.success ? parsed.data : null;
}

function parseTeacherAssignment(params: {
  id: string;
  orgId: string;
  data: unknown;
}) {
  const parsed = TeacherAssignmentSchema.safeParse({
    id: params.id,
    ...row(params.data),
    orgId: params.orgId,
  });
  return parsed.success ? parsed.data : null;
}

function parseOperationalAssignment(params: {
  id: string;
  orgId: string;
  data: unknown;
}) {
  const parsed = OperationalAssignmentSchema.safeParse({
    id: params.id,
    ...row(params.data),
    orgId: params.orgId,
  });
  return parsed.success ? parsed.data : null;
}

function parseSupervisionScope(params: {
  id: string;
  orgId: string;
  data: unknown;
}) {
  const parsed = PersonSupervisionScopeSchema.safeParse({
    id: params.id,
    ...row(params.data),
    orgId: params.orgId,
  });
  return parsed.success ? parsed.data : null;
}

async function loadTeacherAssignmentsByPersonIds(params: {
  orgId: string;
  personIds: readonly string[];
}) {
  const personIds = Array.from(new Set(params.personIds.filter(Boolean)));
  const assignmentsByPersonId = new Map<string, TeacherAssignment[]>();
  if (!personIds.length) return assignmentsByPersonId;

  const db = getFirestore();
  const snapshots = await Promise.all(
    chunk(personIds, 10).map((personIdChunk) =>
      db
        .collection(`orgs/${params.orgId}/teacherAssignments`)
        .where("teacherPersonId", "in", personIdChunk)
        .get(),
    ),
  );

  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      const assignment = parseTeacherAssignment({
        id: document.id,
        orgId: params.orgId,
        data: document.data(),
      });
      if (!assignment) continue;

      const current = assignmentsByPersonId.get(assignment.teacherPersonId) ?? [];
      current.push(assignment);
      assignmentsByPersonId.set(assignment.teacherPersonId, current);
    }
  }

  return assignmentsByPersonId;
}

async function resolveViewer(params: {
  uid: string;
  orgId: string;
  nowMs: number;
}): Promise<StaffAuthorityViewer> {
  const db = getFirestore();
  const membershipSnapshot = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();
  if (!membershipSnapshot.exists) {
    throw new HttpsError("permission-denied", "Organization membership was not found.");
  }

  const membership = parseMembership({
    id: membershipSnapshot.id,
    uid: params.uid,
    orgId: params.orgId,
    data: membershipSnapshot.data(),
  });
  if (
    !membership ||
    !isStaffMembershipActive(membership, params.nowMs) ||
    !membership.personId
  ) {
    throw new HttpsError("permission-denied", "An active staff membership is required.");
  }

  const [operationalAssignmentsSnapshot, supervisionScopesSnapshot, teacherAssignments] =
    await Promise.all([
      db
        .collection(`orgs/${params.orgId}/operationalAssignments`)
        .where("actorPersonId", "==", membership.personId)
        .get(),
      db
        .collection(`orgs/${params.orgId}/personSupervisionScopes`)
        .where("personId", "==", membership.personId)
        .get(),
      loadTeacherAssignmentsByPersonIds({
        orgId: params.orgId,
        personIds: [membership.personId],
      }),
    ]);

  const operationalAssignments = operationalAssignmentsSnapshot.docs.flatMap(
    (document) => {
      const assignment = parseOperationalAssignment({
        id: document.id,
        orgId: params.orgId,
        data: document.data(),
      });
      return assignment ? [assignment] : [];
    },
  );
  const supervisionScopes = supervisionScopesSnapshot.docs.flatMap((document) => {
    const scope = parseSupervisionScope({
      id: document.id,
      orgId: params.orgId,
      data: document.data(),
    });
    return scope ? [scope] : [];
  }) as PersonSupervisionScope[];

  return {
    orgId: params.orgId,
    personId: membership.personId,
    roles: resolveMembershipRoles(membership),
    homeSchoolIds: resolveStaffHomeSchoolIds({
      personId: membership.personId,
      memberships: [membership],
      teacherAssignments: teacherAssignments.get(membership.personId) ?? [],
      nowMs: params.nowMs,
    }),
    operationalAssignments,
    supervisionScopes,
  };
}

async function resolveLiveTargets(params: {
  orgId: string;
  files: readonly StaffPdfFile[];
  nowMs: number;
}) {
  const db = getFirestore();
  const ownerUids = Array.from(new Set(params.files.map((file) => file.ownerUid)));
  const membershipReferences = ownerUids.map((uid) =>
    db.doc(`users/${uid}/orgMemberships/${params.orgId}`),
  );
  const membershipSnapshots = membershipReferences.length
    ? await db.getAll(...membershipReferences)
    : [];

  const membershipByUid = new Map<string, Membership>();
  for (let index = 0; index < membershipSnapshots.length; index += 1) {
    const snapshot = membershipSnapshots[index];
    const uid = ownerUids[index];
    if (!snapshot?.exists || !uid) continue;

    const membership = parseMembership({
      id: snapshot.id,
      uid,
      orgId: params.orgId,
      data: snapshot.data(),
    });
    if (
      !membership ||
      !isStaffMembershipActive(membership, params.nowMs) ||
      !membership.personId
    ) {
      continue;
    }
    membershipByUid.set(uid, membership);
  }

  const activePersonIds = Array.from(
    new Set(Array.from(membershipByUid.values()).map((membership) => membership.personId)),
  );
  const teacherAssignmentsByPersonId = await loadTeacherAssignmentsByPersonIds({
    orgId: params.orgId,
    personIds: activePersonIds,
  });

  const targetsByOwnerUid = new Map<string, StaffAuthorityTarget>();
  for (const [uid, membership] of membershipByUid) {
    targetsByOwnerUid.set(uid, {
      personId: membership.personId,
      roles: resolveMembershipRoles(membership),
      homeSchoolIds: resolveStaffHomeSchoolIds({
        personId: membership.personId,
        memberships: [membership],
        teacherAssignments: teacherAssignmentsByPersonId.get(membership.personId) ?? [],
        nowMs: params.nowMs,
      }),
      authorityPersonIds: resolveStaffAuthorityPersonIds({
        personId: membership.personId,
        memberships: [membership],
        nowMs: params.nowMs,
      }),
    });
  }

  return targetsByOwnerUid;
}

/**
 * Returns only other staff whose CURRENT organizational identity is
 * directionally authorized for the viewer. Historical PDF owner snapshots are
 * intentionally never used for this decision.
 */
export const listStaffPdfFilesInScope = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request): Promise<StaffPdfFile[]> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const orgId = assertId(request.data?.orgId, "orgId");
    const categoryResult = StaffPdfFileCategoryKey.safeParse(
      request.data?.categoryKey,
    );
    if (!categoryResult.success) {
      throw new HttpsError("invalid-argument", "A valid PDF category is required.");
    }

    const nowMs = Date.now();
    const viewer = await resolveViewer({
      uid: request.auth.uid,
      orgId,
      nowMs,
    });
    if (!canViewerBrowseStaffTargets(viewer, nowMs)) {
      throw new HttpsError("permission-denied", "Staff scope access is not available.");
    }

    const db = getFirestore();
    const filesSnapshot = await db
      .collection(`orgs/${orgId}/staffPdfFiles`)
      .where("categoryKey", "==", categoryResult.data)
      .where("status", "==", "ACTIVE")
      .get();
    const files = filesSnapshot.docs.flatMap((document) => {
      const parsed = StaffPdfFileSchema.safeParse({
        id: document.id,
        ...document.data(),
        orgId,
      });
      return parsed.success ? [parsed.data] : [];
    });
    const targetsByOwnerUid = await resolveLiveTargets({ orgId, files, nowMs });

    return files
      .filter((file) => file.ownerPersonId !== viewer.personId && file.ownerUid !== request.auth!.uid)
      .filter((file) => {
        const target = targetsByOwnerUid.get(file.ownerUid);

        // Deny stale, disabled, missing, or UID/person-mismatched memberships.
        if (!target || target.personId !== file.ownerPersonId) return false;
        return canViewerAccessTargetStaff({ viewer, target, nowMs });
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  },
);
