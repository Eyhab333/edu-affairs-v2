import { getFirestore } from "firebase-admin/firestore";

import {
  NotificationEventData,
  ResolvedNotificationRecipient,
} from "./types";

/**
 * Skeleton فقط.
 *
 * الآن نحل المستلمين المباشرين فقط:
 * - targetGuardianId
 * - targetStaffPersonId
 * - targetPersonId
 *
 * لاحقًا سنضيف:
 * - أولياء أمور طلاب فصل كامل
 * - أعضاء محادثة الشات
 * - المعلمين المسندين
 * - مشرفي الباص
 */
export async function resolveRecipients(
  eventData: NotificationEventData,
): Promise<ResolvedNotificationRecipient[]> {
  const recipients: ResolvedNotificationRecipient[] = [];

  if (eventData.targetGuardianId) {
    recipients.push({
      recipientKind: "GUARDIAN",
      guardianId: eventData.targetGuardianId,
      studentId: eventData.targetStudentId ?? "",
    });
  }

  if (
    eventData.type === "STUDENT_TRANSPORT_ATTENDANCE_RECORDED" &&
    eventData.orgId &&
    eventData.targetStudentId
  ) {
    const guardians = await resolveActiveStudentGuardians({
      orgId: eventData.orgId,
      studentId: eventData.targetStudentId,
    });
    recipients.push(...guardians);
  }

  if (eventData.targetStaffPersonId) {
    recipients.push({
      recipientKind: "STAFF",
      staffPersonId: eventData.targetStaffPersonId,
      recipientPersonId: eventData.targetStaffPersonId,
    });
  }

  if (eventData.targetPersonId) {
    recipients.push({
      recipientKind: "PERSON",
      recipientPersonId: eventData.targetPersonId,
    });
  }

  if (eventData.actorUid && eventData.type === "CUSTOM") {
    recipients.push({
      recipientKind: "USER",
      recipientUid: eventData.actorUid,
      recipientPersonId: eventData.actorPersonId ?? "",
    });
  }

  return dedupeRecipients(recipients);
}

async function resolveActiveStudentGuardians(params: {
  orgId: string;
  studentId: string;
}): Promise<ResolvedNotificationRecipient[]> {
  const db = getFirestore();
  const now = Date.now();
  const linksSnapshot = await db
    .collection(`orgs/${params.orgId}/guardianLinks`)
    .where("studentId", "==", params.studentId)
    .limit(20)
    .get();

  const activeLinks = linksSnapshot.docs.filter((document) => {
    const data = document.data();
    if (data.active === false || data.isActive === false || data.isArchived === true) {
      return false;
    }
    if (["INACTIVE", "DELETED", "CANCELLED"].includes(String(data.status ?? ""))) {
      return false;
    }
    const startAt = typeof data.startAt === "number" ? data.startAt : 0;
    const endAt = typeof data.endAt === "number" ? data.endAt : 0;
    return startAt <= now && (endAt <= 0 || endAt >= now);
  });
  const guardianIds = Array.from(
    new Set(
      activeLinks
        .map((document) => document.data().guardianId)
        .filter((guardianId): guardianId is string => typeof guardianId === "string" && guardianId.trim().length > 0),
    ),
  );

  if (!guardianIds.length) return [];

  const guardianSnapshots = await db.getAll(
    ...guardianIds.map((guardianId) =>
      db.doc(`orgs/${params.orgId}/guardians/${guardianId}`),
    ),
  );

  return guardianSnapshots.flatMap((snapshot) => {
    const guardian = snapshot.data();
    if (!snapshot.exists || guardian?.isArchived === true) return [];
    if (typeof guardian?.orgId === "string" && guardian.orgId !== params.orgId) {
      return [];
    }

    return [{
      recipientKind: "GUARDIAN" as const,
      guardianId: snapshot.id,
      studentId: params.studentId,
    }];
  });
}

function dedupeRecipients(
  recipients: ResolvedNotificationRecipient[],
): ResolvedNotificationRecipient[] {
  const seen = new Set<string>();

  return recipients.filter((recipient) => {
    const key = [
      recipient.recipientKind,
      recipient.recipientUid ?? "",
      recipient.recipientPersonId ?? "",
      recipient.guardianId ?? "",
      recipient.staffPersonId ?? "",
      recipient.studentId ?? "",
    ].join(":");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
