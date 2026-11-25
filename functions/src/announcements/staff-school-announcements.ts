import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  SchoolAnnouncementSchema,
  SchoolAnnouncementStatusSchema,
  type SchoolAnnouncement,
  type SchoolAnnouncementAudience,
} from "@takween/contracts";
import { isActiveMembership, membershipRoleKey } from "../staff-chat/shared";
import { createHash } from "node:crypto";

const options = {
  region: "me-central2",
  cors: true,
  memory: "512MiB" as const,
  minInstances: 0,
};
const QUERY_LIMIT = 200;
const AUDIENCE_PAGE_SIZE = 100;

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Invalid input.");
  }
  return value as Row;
}

function id(value: unknown, field = "identifier") {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || normalized.length > 200) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return normalized;
}

function optionalId(value: unknown) {
  if (value == null || value === "") return "";
  return id(value);
}

function stringList(value: unknown, field: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  const values = value.map((item) => id(item, field));
  return [...new Set(values)];
}

function text(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function active(data: Record<string, unknown>) {
  return (
    data.isActive !== false &&
    data.active !== false &&
    data.isArchived !== true &&
    (!data.status || data.status === "ACTIVE")
  );
}

function recordOrNull(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function isPlatformOwner(membership: Row) {
  return isActiveMembership(membership) && membershipRoleKey(membership) === "platform_owner";
}

async function resolveStaffActor(uid: string | undefined, orgId: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");

  const db = getFirestore();
  const [membershipSnapshot, userSnapshot] = await Promise.all([
    db.doc(`users/${uid}/orgMemberships/${orgId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const membership = recordOrNull(membershipSnapshot.data());
  const user = recordOrNull(userSnapshot.data());
  if (!membership || !isPlatformOwner(membership)) {
    throw new HttpsError("permission-denied", "Platform owner access is required.");
  }

  const personId = text(user?.personId, 200) || text(membership.personId, 200) || uid;

  return {
    db,
    orgId,
    uid,
    personId,
    roleKey: membershipRoleKey(membership),
    displayName:
      text(user?.displayName, 200) || text(user?.email, 200) || text(membership.displayName, 200),
  };
}

function isActiveSchool(data: Row) {
  return (
    data.isArchived !== true &&
    data.isActive !== false &&
    data.active !== false &&
    (!data.status || data.status === "ACTIVE")
  );
}

async function assertActiveSchools(
  actor: Awaited<ReturnType<typeof resolveStaffActor>>,
  schoolIds: string[],
) {
  if (!schoolIds.length) {
    throw new HttpsError("invalid-argument", "Select at least one school.");
  }
  const snapshots = await actor.db.getAll(
    ...schoolIds.map((schoolId) => actor.db.doc(`orgs/${actor.orgId}/schools/${schoolId}`)),
  );
  if (snapshots.some((school) => !school.exists || !isActiveSchool(school.data() as Row))) {
    throw new HttpsError("invalid-argument", "One or more selected schools are unavailable.");
  }
}

async function listAccessibleSchools(actor: Awaited<ReturnType<typeof resolveStaffActor>>) {
  const snapshots = (await actor.db.collection(`orgs/${actor.orgId}/schools`).limit(QUERY_LIMIT).get()).docs;
  return snapshots
    .filter((snapshot) => isActiveSchool(snapshot.data() as Row))
    .map((snapshot) => ({ id: snapshot.id, name: text(snapshot.data()?.name, 200) || snapshot.id }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
}

function normalizeAudience(input: Row): SchoolAnnouncementAudience {
  const scope = input.scope;
  if (!["SCHOOL", "GRADES", "CLASSES", "STUDENTS"].includes(String(scope))) {
    throw new HttpsError("invalid-argument", "Invalid announcement audience.");
  }
  const selectedScope = scope as SchoolAnnouncementAudience["scope"];
  const audience: SchoolAnnouncementAudience = {
    scope: selectedScope,
    schoolIds: stringList(input.schoolIds ?? [], "schoolIds", 200),
    gradeIds: selectedScope === "GRADES" ? stringList(input.gradeIds ?? [], "gradeIds", 100) : [],
    classIds: selectedScope === "CLASSES" ? stringList(input.classIds ?? [], "classIds", 300) : [],
    studentIds: selectedScope === "STUDENTS" ? stringList(input.studentIds ?? [], "studentIds", 500) : [],
  };
  if (
    audience.schoolIds.length === 0 ||
    (audience.scope === "GRADES" && audience.gradeIds.length === 0) ||
    (audience.scope === "CLASSES" && audience.classIds.length === 0) ||
    (audience.scope === "STUDENTS" && audience.studentIds.length === 0)
  ) {
    throw new HttpsError("invalid-argument", "Select at least one audience target.");
  }
  return audience;
}

async function validateAudienceTargets(params: {
  actor: Awaited<ReturnType<typeof resolveStaffActor>>;
  schoolIds: string[];
  audience: SchoolAnnouncementAudience;
}) {
  const { actor, schoolIds, audience } = params;
  const selectedSchoolIds = new Set(schoolIds);
  const enrollmentCollection = actor.db.collection(
    `orgs/${actor.orgId}/studentEnrollments`,
  );
  const assertFound = async (field: "gradeId" | "classId" | "studentId", values: string[]) => {
    if (!values.length) return;
    const found = new Set<string>();
    for (let index = 0; index < values.length; index += 10) {
      const snapshots = await enrollmentCollection
        .where(field, "in", values.slice(index, index + 10))
        .limit(QUERY_LIMIT)
        .get();
      for (const snapshot of snapshots.docs) {
        const enrollment = snapshot.data() as Row;
        const value = text(enrollment[field], 200);
        if (
          active(enrollment) &&
          enrollment.orgId === actor.orgId &&
          typeof enrollment.schoolId === "string" &&
          selectedSchoolIds.has(enrollment.schoolId) &&
          values.includes(value)
        ) {
          found.add(value);
        }
      }
    }
    if (found.size !== values.length) {
      throw new HttpsError("invalid-argument", "One or more audience targets are not active in this school.");
    }
  };
  await assertFound("gradeId", audience.gradeIds);
  await assertFound("classId", audience.classIds);
  await assertFound("studentId", audience.studentIds);
}

function parseDraftFields(input: Row) {
  const audience = normalizeAudience(record(input.audience));
  const publicationStartsAt = input.publicationStartsAt == null ? undefined : Number(input.publicationStartsAt);
  const publicationEndsAt = input.publicationEndsAt == null ? undefined : Number(input.publicationEndsAt);
  if (
    (publicationStartsAt != null && (!Number.isInteger(publicationStartsAt) || publicationStartsAt < 0)) ||
    (publicationEndsAt != null && (!Number.isInteger(publicationEndsAt) || publicationEndsAt < 0)) ||
    (publicationStartsAt != null && publicationEndsAt != null && publicationStartsAt > publicationEndsAt)
  ) {
    throw new HttpsError("invalid-argument", "Invalid publication dates.");
  }
  return {
    title: text(input.title, 200),
    content: text(input.content, 20_000),
    priority: input.priority,
    imageUrl: text(input.imageUrl, 2_000) || undefined,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    audience,
    publicationStartsAt,
    publicationEndsAt,
    academicYearId: optionalId(input.academicYearId),
    termId: optionalId(input.termId),
  };
}

function parseForStatus(params: {
  id: string;
  actor: Awaited<ReturnType<typeof resolveStaffActor>>;
  schoolId: string;
  fields: ReturnType<typeof parseDraftFields>;
  status: SchoolAnnouncement["status"];
  createdAt: number;
  creator?: Pick<
    SchoolAnnouncement,
    "createdByUid" | "createdByPersonId" | "createdByRoleKey" | "createdByDisplayName"
  >;
  publishedAt?: number;
  archivedAt?: number;
}) {
  const now = Date.now();
  const parsed = SchoolAnnouncementSchema.safeParse({
    id: params.id,
    orgId: params.actor.orgId,
    schoolId: params.schoolId,
    ...params.fields,
    status: params.status,
    createdByUid: params.creator?.createdByUid ?? params.actor.uid,
    createdByPersonId: params.creator?.createdByPersonId ?? params.actor.personId,
    createdByRoleKey: params.creator?.createdByRoleKey ?? params.actor.roleKey,
    createdByDisplayName: params.creator?.createdByDisplayName ?? params.actor.displayName,
    createdAt: params.createdAt,
    updatedAt: now,
    publishedAt: params.publishedAt,
    archivedAt: params.archivedAt,
  });
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Announcement fields are incomplete or invalid.");
  }
  return parsed.data;
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefined(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, omitUndefined(item)]),
    );
  }
  return value;
}

function firestoreAnnouncementPayload(announcement: SchoolAnnouncement) {
  return omitUndefined(announcement) as FirebaseFirestore.DocumentData;
}

function announcementSchoolIds(announcement: SchoolAnnouncement) {
  const selected = announcement.audience.schoolIds ?? [];
  return [...new Set(selected.length ? selected : [announcement.schoolId])];
}

function toAnnouncement(snapshot: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const parsed = SchoolAnnouncementSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  return parsed.success ? parsed.data : null;
}

export const staffSchoolAnnouncements = onCall(options, async (request) => {
  const input = record(request.data);
  const orgId = id(input.orgId, "orgId");
  const actor = await resolveStaffActor(request.auth?.uid, orgId);
  const collection = actor.db.collection(`orgs/${orgId}/schoolAnnouncements`);

  switch (input.action) {
    case "listSchools":
      return { schools: await listAccessibleSchools(actor) };

    case "list": {
      const schoolId = optionalId(input.schoolId);
      const status = input.status == null || input.status === "" ? null : SchoolAnnouncementStatusSchema.parse(input.status);
      const snapshots = schoolId
        ? await Promise.all([
            collection.where("schoolId", "==", schoolId).limit(QUERY_LIMIT).get(),
            collection.where("audience.schoolIds", "array-contains", schoolId).limit(QUERY_LIMIT).get(),
          ])
        : [await collection.limit(QUERY_LIMIT).get()];
      const documents = new Map(
        snapshots.flatMap((snapshot) => snapshot.docs).map((document) => [document.id, document]),
      );
      const rows = [...documents.values()]
        .map(toAnnouncement)
        .filter((item): item is SchoolAnnouncement => !!item)
        .filter((item) => !schoolId || announcementSchoolIds(item).includes(schoolId))
        .filter((item) => !status || item.status === status)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      return { items: rows };
    }

    case "audienceOptions": {
      const schoolIds = stringList(input.schoolIds ?? [], "schoolIds", 200);
      await assertActiveSchools(actor, schoolIds);
      const snapshots = await Promise.all(
        schoolIds.map((schoolId) =>
          actor.db
            .collection(`orgs/${orgId}/studentEnrollments`)
            .where("schoolId", "==", schoolId)
            .limit(AUDIENCE_PAGE_SIZE)
            .get(),
        ),
      );
      const entries: Array<Row & { id: string }> = snapshots.flatMap((snapshot) => snapshot.docs)
        .map((document): Row & { id: string } => ({
          id: document.id,
          ...(document.data() as Row),
        }))
        .filter((item) => active(item) && item.orgId === orgId)
        .filter((item) => text(item.studentId, 200) && text(item.classId, 200) && text(item.gradeId, 200));
      const grades = new Map<string, string>();
      const classes = new Map<string, { id: string; label: string; gradeId: string }>();
      const students = new Map<string, { id: string; name: string; classId: string; gradeId: string }>();
      for (const entry of entries) {
        const gradeId = text(entry.gradeId, 200);
        const classId = text(entry.classId, 200);
        const studentId = text(entry.studentId, 200);
        grades.set(gradeId, text(entry.gradeTitle, 200) || gradeId);
        classes.set(classId, { id: classId, label: text(entry.classTitle, 200) || classId, gradeId });
        students.set(studentId, {
          id: studentId,
          name: text(entry.studentDisplayName, 200) || text(entry.studentName, 200) || studentId,
          classId,
          gradeId,
        });
      }
      return {
        grades: [...grades].map(([id, name]) => ({ id, name })),
        classes: [...classes.values()],
        students: [...students.values()],
        nextCursor: null,
      };
    }

    case "create": {
      const fields = parseDraftFields(record(input.item));
      const schoolIds = fields.audience.schoolIds;
      await assertActiveSchools(actor, schoolIds);
      await validateAudienceTargets({ actor, schoolIds, audience: fields.audience });
      const ref = collection.doc();
      const announcement = parseForStatus({
        id: ref.id,
        actor,
        schoolId: schoolIds[0],
        fields,
        status: "DRAFT",
        createdAt: Date.now(),
      });
      if (announcement.attachments.length > 5) throw new HttpsError("invalid-argument", "Maximum of five attachments.");
      await ref.create(firestoreAnnouncementPayload(announcement));
      return { item: firestoreAnnouncementPayload(announcement) };
    }

    case "update": {
      const ref = collection.doc(id(input.announcementId, "announcementId"));
      const existingSnapshot = await ref.get();
      const existing = toAnnouncement(existingSnapshot);
      if (!existing) throw new HttpsError("not-found", "Announcement not found.");
      if (existing.status !== "DRAFT") {
        throw new HttpsError("failed-precondition", "Only draft announcements can be edited.");
      }
      const fields = parseDraftFields(record(input.item));
      const schoolIds = fields.audience.schoolIds;
      await assertActiveSchools(actor, schoolIds);
      await validateAudienceTargets({ actor, schoolIds, audience: fields.audience });
      const announcement = parseForStatus({
        id: existing.id,
        actor,
        schoolId: schoolIds[0],
        fields,
        status: "DRAFT",
        createdAt: existing.createdAt,
        creator: existing,
      });
      return actor.db.runTransaction(async (transaction) => {
        const fresh = toAnnouncement(await transaction.get(ref));
        if (!fresh || fresh.status !== "DRAFT") throw new HttpsError("failed-precondition", "Only draft announcements can be edited.");
        if (announcement.attachments.length + fresh.storedAttachments.length > Math.max(5, fresh.attachments.length + fresh.storedAttachments.length)) throw new HttpsError("invalid-argument", "Maximum of five attachments.");
        const preserved = { ...announcement, mainImageFile: fresh.mainImageFile, storedAttachments: fresh.storedAttachments };
        transaction.set(ref, firestoreAnnouncementPayload(preserved));
        return { item: firestoreAnnouncementPayload(preserved) };
      });
    }

    case "publish": {
      const ref = collection.doc(id(input.announcementId, "announcementId"));
      return actor.db.runTransaction(async (transaction) => {
        const existingSnapshot = await transaction.get(ref);
        const existing = toAnnouncement(existingSnapshot);
        if (!existing) throw new HttpsError("not-found", "Announcement not found.");
        if (existing.status === "PUBLISHED") return { item: existing };
        if (existing.status !== "DRAFT") {
          throw new HttpsError("failed-precondition", "Announcement cannot be published.");
        }
        const schoolIds = announcementSchoolIds(existing);
        await assertActiveSchools(actor, schoolIds);
        await validateAudienceTargets({ actor, schoolIds, audience: existing.audience });
        const publishedAt = Date.now();
        const announcement = SchoolAnnouncementSchema.parse({
          ...existing,
          status: "PUBLISHED",
          publishedAt,
          updatedAt: publishedAt,
        });
        transaction.set(ref, firestoreAnnouncementPayload(announcement));
        const jobId = createHash("sha256").update(`${orgId}\u0000${ref.id}`).digest("hex");
        const jobRef = actor.db.collection("schoolAnnouncementNotificationJobs").doc(jobId);
        transaction.create(jobRef, {
          orgId,
          announcementId: ref.id,
          state: "DISCOVERING",
          schoolIndex: 0,
          cursor: "",
          nextRunAt: Math.max(publishedAt, announcement.publicationStartsAt ?? publishedAt),
          createdAt: publishedAt,
          updatedAt: publishedAt,
        });
        return { item: announcement };
      });
    }

    case "archive": {
      const ref = collection.doc(id(input.announcementId, "announcementId"));
      return actor.db.runTransaction(async (transaction) => {
        const existingSnapshot = await transaction.get(ref);
        const existing = toAnnouncement(existingSnapshot);
        if (!existing) throw new HttpsError("not-found", "Announcement not found.");
        if (existing.status === "ARCHIVED") return { item: existing };
        const archivedAt = Date.now();
        const announcement = SchoolAnnouncementSchema.parse({
          ...existing,
          status: "ARCHIVED",
          archivedAt,
          updatedAt: archivedAt,
        });
        transaction.set(ref, firestoreAnnouncementPayload(announcement));
        return { item: announcement };
      });
    }

    default:
      throw new HttpsError("invalid-argument", "Unknown announcement action.");
  }
});
