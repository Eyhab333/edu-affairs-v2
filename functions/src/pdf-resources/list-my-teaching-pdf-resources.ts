import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  MembershipRole,
  PdfResourceSchema,
  TeacherAssignmentClassLinkSchema,
  TeacherAssignmentSchema,
  type MembershipRole as MembershipRoleType,
  type TeacherAssignment,
  type TeacherAssignmentClassLink,
} from "@takween/contracts";
import {
  isTeacherTargetedByPdfResource,
  resolveActiveTeacherOfferingIds,
  TEACHER_PDF_RESOURCE_ROLE_KEYS,
} from "@takween/domain";

const REGION = "me-central2";
type DataRow = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  const parsed = MembershipRole.safeParse(
    readString(membership.roleKey) || readString(membership.role),
  );
  return parsed.success ? parsed.data : undefined;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export const listMyTeachingPdfResources = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request) => {
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
    if (
      !isActiveMembership(membership, now) ||
      !role ||
      !personId ||
      !TEACHER_PDF_RESOURCE_ROLE_KEYS.has(role)
    ) {
      throw new HttpsError("permission-denied", "An active teacher membership is required.");
    }

    const assignmentsSnapshot = await db
      .collection(`orgs/${orgId}/teacherAssignments`)
      .where("teacherPersonId", "==", personId)
      .get();
    const assignments: TeacherAssignment[] = assignmentsSnapshot.docs.flatMap((item) => {
      const parsed = TeacherAssignmentSchema.safeParse({ id: item.id, ...item.data() });
      return parsed.success ? [parsed.data] : [];
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const linkSnapshots = await Promise.all(
      chunk(assignmentIds, 10).map((assignmentChunk) =>
        db
          .collection(`orgs/${orgId}/teacherAssignmentClassLinks`)
          .where("assignmentId", "in", assignmentChunk)
          .get(),
      ),
    );
    const classLinks: TeacherAssignmentClassLink[] = linkSnapshots.flatMap((snapshot) =>
      snapshot.docs.flatMap((item) => {
        const parsed = TeacherAssignmentClassLinkSchema.safeParse({ id: item.id, ...item.data() });
        return parsed.success ? [parsed.data] : [];
      }),
    );

    const activeAssignments = assignments.filter(
      (assignment) =>
        assignment.status === "ACTIVE" &&
        assignment.startAt <= now &&
        (!assignment.endAt || assignment.endAt >= now),
    );
    const resourcesSnapshot = await db
      .collection(`orgs/${orgId}/pdfResources`)
      .where("kind", "in", ["ENRICHMENT_MATERIAL", "CURRICULUM_DISTRIBUTION"])
      .get();
    const resources = resourcesSnapshot.docs.flatMap((item) => {
      const parsed = PdfResourceSchema.safeParse({ id: item.id, orgId, ...item.data() });
      return parsed.success ? [parsed.data] : [];
    });

    return resources
      .filter((resource) =>
        isTeacherTargetedByPdfResource(resource, {
          orgId,
          personId,
          roleKeys: [role],
          schoolIds: Array.from(new Set(activeAssignments.map((item) => item.schoolId))),
          academicYearIds: Array.from(new Set(activeAssignments.map((item) => item.academicYearId))),
          termIds: Array.from(new Set(activeAssignments.map((item) => item.termId).filter(Boolean))),
          teacherOfferingIds: resolveActiveTeacherOfferingIds({ assignments, classLinks, now }),
        }),
      )
      .sort((left, right) => right.publishedAt - left.publishedAt);
  },
);
