import { randomUUID } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { SchoolAnnouncementSchema, SchoolAnnouncementStoredFileSchema } from "@takween/contracts";
import { isActiveMembership, membershipRoleKey } from "../staff-chat/shared";

const types = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png", "image/webp",
]);
const maximum = 10 * 1024 * 1024;
const db = () => getFirestore();
const identifier = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 200 || value.includes("/")) throw new HttpsError("invalid-argument", "Invalid identifier.");
  return value;
};

async function discardFile(path: string, fileId: string) {
  const grantRef = db().doc(`announcementUploadGrants/${fileId}`);
  await grantRef.set({ storagePath: path, state: "CLEANUP", expiresAt: Date.now() }, { merge: true });
  try {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    await grantRef.delete();
  } catch {
    // The scheduled cleanup will retry the unreferenced object.
  }
}

export const staffAnnouncementFiles = onCall(
  { region: "me-central2", memory: "512MiB", minInstances: 0, cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const input = request.data as Record<string, unknown>;
    const orgId = identifier(input.orgId);
    const announcementId = identifier(input.announcementId);
    const membership = (await db().doc(`users/${uid}/orgMemberships/${orgId}`).get()).data();
    if (!membership || !isActiveMembership(membership) || membershipRoleKey(membership) !== "platform_owner") throw new HttpsError("permission-denied", "Platform owner access is required.");
    const ref = db().doc(`orgs/${orgId}/schoolAnnouncements/${announcementId}`);
    const readAnnouncement = async () => {
      const snapshot = await ref.get();
      const parsed = SchoolAnnouncementSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
      if (!snapshot.exists || !parsed.success || parsed.data.orgId !== orgId) throw new HttpsError("not-found", "Announcement not found.");
      if (parsed.data.status === "ARCHIVED") throw new HttpsError("failed-precondition", "Archived announcements cannot be modified.");
      return parsed.data;
    };
    if (input.action === "begin") {
      const announcement = await readAnnouncement();
      const kind = input.kind;
      const contentType = typeof input.contentType === "string" ? input.contentType : "";
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const sizeBytes = input.sizeBytes;
      if ((kind !== "image" && kind !== "attachment") || !types.has(contentType) || (kind === "image" && !contentType.startsWith("image/")) || !name || name.length > 200 || typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maximum) throw new HttpsError("invalid-argument", "Invalid file type or size.");
      if (kind === "attachment" && announcement.storedAttachments.length + announcement.attachments.length >= 5) throw new HttpsError("failed-precondition", "Maximum of five attachments.");
      const grantId = randomUUID();
      const storagePath = `orgs/${orgId}/schoolAnnouncements/${announcementId}/uploads/${grantId}`;
      await db().doc(`announcementUploadGrants/${grantId}`).create({ orgId, announcementId, uid, kind, storagePath, name, contentType, sizeBytes, state: "PENDING", expiresAt: Date.now() + 60 * 60 * 1000 });
      return { grantId, storagePath };
    }
    if (input.action === "finish") {
      const grantId = identifier(input.grantId);
      const grantRef = db().doc(`announcementUploadGrants/${grantId}`);
      const grant = (await grantRef.get()).data();
      if (!grant || grant.uid !== uid || grant.orgId !== orgId || grant.announcementId !== announcementId || grant.state !== "PENDING" || grant.expiresAt < Date.now()) throw new HttpsError("permission-denied", "Upload grant is invalid or expired.");
      const file = getStorage().bucket().file(grant.storagePath);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) !== grant.sizeBytes || metadata.contentType !== grant.contentType) throw new HttpsError("failed-precondition", "Uploaded file does not match its grant.");
      const stored = SchoolAnnouncementStoredFileSchema.parse({ id: grantId, storagePath: grant.storagePath, name: grant.name, contentType: grant.contentType, sizeBytes: grant.sizeBytes });
      const previousPath = await db().runTransaction(async (tx) => {
        const [snap, currentGrant] = await Promise.all([tx.get(ref), tx.get(grantRef)]);
        const parsed = SchoolAnnouncementSchema.safeParse({ ...snap.data(), id: snap.id });
        if (!parsed.success || parsed.data.orgId !== orgId || parsed.data.status === "ARCHIVED") throw new HttpsError("failed-precondition", "Announcement is unavailable.");
        if (currentGrant.data()?.state !== "PENDING" || currentGrant.data()?.expiresAt < Date.now()) throw new HttpsError("failed-precondition", "Upload grant expired.");
        if (grant.kind === "attachment" && parsed.data.storedAttachments.length + parsed.data.attachments.length >= 5) throw new HttpsError("failed-precondition", "Maximum of five attachments.");
        tx.update(ref, grant.kind === "image" ? { mainImageFile: stored, updatedAt: Date.now() } : { storedAttachments: [...parsed.data.storedAttachments, stored], updatedAt: Date.now() });
        tx.update(grantRef, { state: "COMPLETE", expiresAt: FieldValue.delete() });
        return grant.kind === "image" ? parsed.data.mainImageFile : undefined;
      });
      if (previousPath && previousPath.storagePath !== grant.storagePath && previousPath.storagePath.startsWith(`orgs/${orgId}/schoolAnnouncements/${announcementId}/uploads/`)) await discardFile(previousPath.storagePath, previousPath.id);
      return { file: stored };
    }
    if (input.action === "remove" || input.action === "preview") {
      const fileId = identifier(input.fileId);
      const announcement = await readAnnouncement();
      const file = [announcement.mainImageFile, ...announcement.storedAttachments].find((item) => item?.id === fileId);
      if (!file || !file.storagePath.startsWith(`orgs/${orgId}/schoolAnnouncements/${announcementId}/uploads/`)) throw new HttpsError("not-found", "File not found.");
      if (input.action === "preview") {
        const [url] = await getStorage().bucket().file(file.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
        return { url };
      }
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const parsed = SchoolAnnouncementSchema.safeParse({ ...snap.data(), id: snap.id });
        if (!parsed.success || parsed.data.orgId !== orgId || parsed.data.status === "ARCHIVED") throw new HttpsError("failed-precondition", "Announcement is unavailable.");
        if (parsed.data.mainImageFile?.id === fileId) tx.update(ref, { mainImageFile: FieldValue.delete(), updatedAt: Date.now() });
        else tx.update(ref, { storedAttachments: parsed.data.storedAttachments.filter((item) => item.id !== fileId), updatedAt: Date.now() });
      });
      await discardFile(file.storagePath, file.id);
      return { ok: true };
    }
    throw new HttpsError("invalid-argument", "Unknown file action.");
  },
);

export const cleanupAnnouncementUploads = onSchedule(
  { schedule: "every 24 hours", region: "me-central2", memory: "512MiB", minInstances: 0 },
  async () => {
    const expired = await db().collection("announcementUploadGrants").where("expiresAt", "<=", Date.now()).limit(100).get();
    for (const grant of expired.docs) {
      const data = grant.data();
      if (!["PENDING", "CLEANUP"].includes(data.state) || typeof data.storagePath !== "string") continue;
      await getStorage().bucket().file(data.storagePath).delete({ ignoreNotFound: true });
      await grant.ref.delete();
    }
  },
);
