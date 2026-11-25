import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { SchoolAnnouncementSchema, isSchoolAnnouncementVisibleAt, type SchoolAnnouncement } from "@takween/contracts";
import { assertGuardianStudentAccess } from "../guardian/guardian-student-access";
import { sendFcmNotification } from "../notifications/send-fcm-notification";

const PAGE = 50;
const LEASE_MS = 5 * 60_000;
const RETRY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
type Row = Record<string, unknown>;
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function eligibleEnrollment(item: Row, announcement: SchoolAnnouncement, schoolId: string) {
  if (item.status !== "ACTIVE" || item.isArchived === true || item.isActive === false || item.active === false) return false;
  if (item.schoolId !== schoolId || (item.orgId && item.orgId !== announcement.orgId)) return false;
  if (announcement.academicYearId && item.academicYearId !== announcement.academicYearId) return false;
  const audience = announcement.audience;
  switch (audience.scope) {
    case "SCHOOL": return true;
    case "GRADES": return audience.gradeIds.includes(str(item.gradeId));
    case "CLASSES": return audience.classIds.includes(str(item.classId));
    case "STUDENTS": return audience.studentIds.includes(str(item.studentId));
  }
}

function activeLink(link: Row, orgId: string, now: number) {
  if (link.isArchived === true || link.isActive === false || link.active === false) return false;
  if (["INACTIVE", "DELETED", "CANCELLED"].includes(str(link.status))) return false;
  if (link.orgId && link.orgId !== orgId) return false;
  return (typeof link.startAt !== "number" || link.startAt <= now) &&
    (typeof link.endAt !== "number" || link.endAt <= 0 || link.endAt >= now);
}

async function discover(jobRef: FirebaseFirestore.DocumentReference, job: Row, announcement: SchoolAnnouncement) {
  const db = getFirestore();
  const schools = announcement.audience.schoolIds.length ? announcement.audience.schoolIds : [announcement.schoolId];
  const schoolIndex = typeof job.schoolIndex === "number" ? job.schoolIndex : 0;
  if (schoolIndex >= schools.length) {
    await jobRef.update({ state: "DELIVERING", cursor: "", nextRunAt: Date.now(), updatedAt: Date.now() });
    return;
  }
  const schoolId = schools[schoolIndex];
  let query = db.collection(`orgs/${announcement.orgId}/studentEnrollments`)
    .where("schoolId", "==", schoolId).orderBy(FieldPath.documentId()).limit(PAGE);
  if (str(job.cursor)) query = query.startAfter(str(job.cursor));
  const page = await query.get();
  for (const enrollment of page.docs) {
    const data = enrollment.data() as Row;
    const studentId = str(data.studentId);
    if (!studentId || !eligibleEnrollment(data, announcement, schoolId)) continue;
    const student = await db.doc(`orgs/${announcement.orgId}/students/${studentId}`).get();
    if (!student.exists || student.data()?.isArchived === true || (student.data()?.orgId && student.data()?.orgId !== announcement.orgId)) continue;
    const links = await db.collection(`orgs/${announcement.orgId}/guardianLinks`).where("studentId", "==", studentId).limit(101).get();
    if (links.size > 100) throw new Error("Guardian link limit exceeded; manual review required.");
    for (const link of links.docs) {
      const linkData = link.data() as Row;
      if (!activeLink(linkData, announcement.orgId, Date.now())) continue;
      const guardianId = str(linkData.guardianId);
      if (!guardianId || guardianId.includes("/")) continue;
      const guardian = (await db.doc(`orgs/${announcement.orgId}/guardians/${guardianId}`).get()).data() as Row | undefined;
      if (!guardian || guardian.isArchived === true || (guardian.orgId && guardian.orgId !== announcement.orgId)) continue;
      const personId = str(guardian.personId);
      if (!personId) continue;
      const users = await db.collection("users").where("personId", "==", personId).limit(101).get();
      if (users.size > 100) throw new Error("Guardian account limit exceeded; manual review required.");
      const declared = [guardian.uid, guardian.authUid, guardian.userUid].map(str).filter(Boolean);
      for (const user of users.docs) {
        const uid = user.id;
        if (declared.length && !declared.includes(uid)) continue;
        if (str(linkData.guardianUid) && linkData.guardianUid !== uid) continue;
        const recipient = jobRef.collection("recipients").doc(digest(uid));
        await db.runTransaction(async (tx) => {
          const previous = await tx.get(recipient);
          if (!previous.exists) tx.create(recipient, { uid, studentIds: [studentId], state: "PENDING", attempts: 0, nextRunAt: Date.now() });
          else tx.update(recipient, { studentIds: FieldValue.arrayUnion(studentId) });
        });
      }
    }
  }
  await jobRef.update({
    schoolIndex: page.size < PAGE ? schoolIndex + 1 : schoolIndex,
    cursor: page.size < PAGE ? "" : page.docs[page.size - 1].id,
    nextRunAt: Date.now(), updatedAt: Date.now(),
  });
}

async function stillEligible(uid: string, studentIds: string[], announcement: SchoolAnnouncement) {
  const db = getFirestore();
  const schools = announcement.audience.schoolIds.length ? announcement.audience.schoolIds : [announcement.schoolId];
  for (const studentId of studentIds) {
    const student = await db.doc(`orgs/${announcement.orgId}/students/${studentId}`).get();
    const studentData = student.data();
    if (!studentData || studentData.isArchived === true || (studentData.orgId && studentData.orgId !== announcement.orgId)) continue;
    const enrollments = await db.collection(`orgs/${announcement.orgId}/studentEnrollments`).where("studentId", "==", studentId).limit(101).get();
    if (enrollments.size > 100) throw new Error("Enrollment limit exceeded; manual review required.");
    const current = enrollments.docs.map((doc) => doc.data() as Row)
      .filter((item) => item.status === "ACTIVE" && item.isArchived !== true && (!item.orgId || item.orgId === announcement.orgId))
      .sort((left, right) => (typeof right.updatedAt === "number" ? right.updatedAt : 0) - (typeof left.updatedAt === "number" ? left.updatedAt : 0))[0];
    if (!current || !schools.some((school) => eligibleEnrollment(current, announcement, school))) continue;
    try {
      const access = await assertGuardianStudentAccess(uid, studentId);
      if (access.orgId === announcement.orgId) return true;
    } catch (error) {
      if (!(error instanceof Error) || !["permission-denied", "failed-precondition"].includes((error as { code?: string }).code ?? "")) throw error;
    }
  }
  return false;
}

async function deliver(jobRef: FirebaseFirestore.DocumentReference, announcement: SchoolAnnouncement) {
  const db = getFirestore();
  const pending = await jobRef.collection("recipients").where("nextRunAt", "<=", Date.now()).orderBy("nextRunAt").limit(PAGE).get();
  for (const doc of pending.docs) {
    const recipient = doc.data() as Row;
    if (recipient.state === "SENDING") {
      // FCM has no idempotency key. The previous outcome is ambiguous; do not
      // resend a push that may already have been delivered.
      await doc.ref.update({ state: "UNKNOWN", nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
      continue;
    }
    const current = await db.doc(`orgs/${announcement.orgId}/schoolAnnouncements/${announcement.id}`).get();
    const parsed = SchoolAnnouncementSchema.safeParse({ ...current.data(), id: current.id });
    if (!parsed.success || !isSchoolAnnouncementVisibleAt(parsed.data, Date.now())) break;
    const uid = str(recipient.uid);
    const studentIds = Array.isArray(recipient.studentIds) ? recipient.studentIds.map(str).filter(Boolean) : [];
    if (!uid || !await stillEligible(uid, studentIds, parsed.data)) {
      await doc.ref.update({ state: "INELIGIBLE", nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
      continue;
    }
    const notificationId = `school-announcement-${digest(`${jobRef.id}:${uid}`)}`;
    const logRef = db.doc(`orgs/${announcement.orgId}/notificationLogs/${notificationId}`);
    const now = Date.now();
    const notification = {
      id: notificationId, orgId: announcement.orgId, eventId: jobRef.id,
      recipientKind: "GUARDIAN", recipientUid: uid,
      type: "GENERAL_ANNOUNCEMENT_PUBLISHED", title: "إعلان مدرسي جديد",
      body: "لديك إعلان مدرسي جديد.", sourceType: "ANNOUNCEMENT", sourceId: announcement.id,
      targetRoute: "ANNOUNCEMENT", targetParams: { announcementId: announcement.id },
      data: { announcementId: announcement.id }, channels: ["IN_APP", "PUSH"], status: "PENDING",
    };
    await db.runTransaction(async (tx) => {
      const [latest, log] = await Promise.all([tx.get(doc.ref), tx.get(logRef)]);
      if (!latest.exists || latest.data()?.state !== "PENDING") throw new Error("Recipient state changed.");
      if (!log.exists) tx.create(logRef, { ...notification, createdAt: now, updatedAt: now });
      tx.update(doc.ref, { state: "SENDING", attempts: FieldValue.increment(1), nextRunAt: now + LEASE_MS, updatedAt: now });
    });
    try {
      const result = await sendFcmNotification(notification);
      const attempts = (typeof recipient.attempts === "number" ? recipient.attempts : 0) + 1;
      if (result.successCount > 0) {
        await doc.ref.update({ state: "SENT", successCount: result.successCount, failureCount: result.failureCount, nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
      } else if (attempts < MAX_ATTEMPTS) {
        await doc.ref.update({ state: "PENDING", failureCount: result.failureCount, nextRunAt: Date.now() + RETRY_MS, updatedAt: Date.now() });
      } else {
        await doc.ref.update({ state: "FAILED", failureCount: result.failureCount, nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
      }
    } catch (error) {
      // A thrown transport or persistence error can happen after FCM accepted
      // the push. Preserve the ambiguity instead of duplicating a delivery.
      await doc.ref.update({ state: "UNKNOWN", nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
      logger.error("Announcement push outcome unknown", { jobId: jobRef.id, error });
    }
  }
  const next = await jobRef.collection("recipients").orderBy("nextRunAt").limit(1).get();
  if (next.empty) await jobRef.update({ state: "COMPLETE", nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
  else await jobRef.update({ nextRunAt: Math.max(Date.now() + 1000, Number(next.docs[0].data().nextRunAt)), updatedAt: Date.now() });
}

export const processSchoolAnnouncementNotifications = onSchedule(
  { schedule: "every 5 minutes", region: "me-central2", memory: "512MiB", minInstances: 0, timeoutSeconds: 240, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const jobs = await db.collection("schoolAnnouncementNotificationJobs").where("nextRunAt", "<=", Date.now()).orderBy("nextRunAt").limit(10).get();
    for (const job of jobs.docs) {
      const lease = randomUUID();
      const acquired = await db.runTransaction(async (tx) => {
        const current = await tx.get(job.ref);
        const data = current.data();
        if (!data || typeof data.nextRunAt !== "number" || data.nextRunAt > Date.now()) return false;
        tx.update(job.ref, { lease, nextRunAt: Date.now() + LEASE_MS });
        return true;
      });
      if (!acquired) continue;
      try {
        const fresh = await job.ref.get();
        const data = fresh.data() as Row;
        const orgId = str(data.orgId);
        const announcementId = str(data.announcementId);
        const snap = await db.doc(`orgs/${orgId}/schoolAnnouncements/${announcementId}`).get();
        const parsed = SchoolAnnouncementSchema.safeParse({ ...snap.data(), id: snap.id });
        if (!parsed.success || parsed.data.orgId !== orgId || parsed.data.status !== "PUBLISHED" || (parsed.data.publicationEndsAt != null && parsed.data.publicationEndsAt < Date.now())) {
          await job.ref.update({ state: "CANCELLED", nextRunAt: FieldValue.delete(), updatedAt: Date.now() });
        } else if (!isSchoolAnnouncementVisibleAt(parsed.data, Date.now())) {
          await job.ref.update({ nextRunAt: parsed.data.publicationStartsAt ?? Date.now() + RETRY_MS, updatedAt: Date.now() });
        } else if (data.state === "DISCOVERING") {
          await discover(job.ref, data, parsed.data);
        } else if (data.state === "DELIVERING") {
          await deliver(job.ref, parsed.data);
        }
      } catch (error) {
        logger.error("Announcement notification job failed", { jobId: job.id, error });
        await job.ref.update({ nextRunAt: Date.now() + RETRY_MS, lastError: error instanceof Error ? error.message.slice(0, 500) : "Processing failed", updatedAt: Date.now() });
      }
    }
  },
);
