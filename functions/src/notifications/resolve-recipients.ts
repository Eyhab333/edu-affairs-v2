import { getFirestore } from "firebase-admin/firestore";

import { NotificationEventData, ResolvedNotificationRecipient } from "./types";

type FirestoreData = Record<string, unknown>;

function readString(data: FirestoreData | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isActiveGuardianLink(data: FirestoreData, now: number): boolean {
  if (data.active === false || data.isActive === false || data.isArchived === true) return false;
  if (["INACTIVE", "DELETED", "CANCELLED"].includes(readString(data, "status"))) return false;
  const startAt = typeof data.startAt === "number" ? data.startAt : 0;
  const endAt = typeof data.endAt === "number" ? data.endAt : 0;
  return startAt <= now && (endAt <= 0 || endAt >= now);
}

async function resolveGuardianRecipient(params: {
  orgId: string;
  guardianId: string;
  studentId?: string;
  linkAlreadyValidated?: boolean;
}): Promise<ResolvedNotificationRecipient[]> {
  const db = getFirestore();
  const guardianSnap = await db.doc(`orgs/${params.orgId}/guardians/${params.guardianId}`).get();
  const guardian = guardianSnap.data() as FirestoreData | undefined;
  if (!guardianSnap.exists || guardian?.isArchived === true) return [];
  if (readString(guardian, "orgId") && readString(guardian, "orgId") !== params.orgId) return [];

  if (params.studentId && !params.linkAlreadyValidated) {
    const links = await db.collection(`orgs/${params.orgId}/guardianLinks`)
      .where("guardianId", "==", params.guardianId).get();
    const now = Date.now();
    if (!links.docs.some((link) => {
      const data = link.data() as FirestoreData;
      return readString(data, "studentId") === params.studentId && isActiveGuardianLink(data, now);
    })) return [];
  }

  const personId = readString(guardian, "personId");
  const declaredUid = ["uid", "authUid", "userUid"]
    .map((key) => readString(guardian, key)).find(Boolean) ?? "";
  let recipientUid = declaredUid;
  if (!recipientUid && personId) {
    const users = await db.collection("users").where("personId", "==", personId).limit(1).get();
    recipientUid = users.docs[0]?.id ?? "";
  }

  return [{
    recipientKind: "GUARDIAN",
    guardianId: params.guardianId,
    recipientPersonId: personId,
    recipientUid,
    studentId: params.studentId ?? "",
  }];
}

async function resolveGuardianRecipientsByPerson(params: {
  orgId: string;
  personId: string;
  studentId?: string;
}): Promise<{ recipients: ResolvedNotificationRecipient[]; hasGuardianRecord: boolean }> {
  const db = getFirestore();
  const guardians = await db.collection(`orgs/${params.orgId}/guardians`)
    .where("personId", "==", params.personId).get();
  const resolved = await Promise.all(guardians.docs.map((guardian) => resolveGuardianRecipient({
    orgId: params.orgId,
    guardianId: guardian.id,
    studentId: params.studentId,
  })));
  return { recipients: resolved.flat(), hasGuardianRecord: !guardians.empty };
}

export async function resolveRecipients(eventData: NotificationEventData): Promise<ResolvedNotificationRecipient[]> {
  const recipients: ResolvedNotificationRecipient[] = [];
  const orgId = eventData.orgId ?? "";
  const studentId = eventData.targetStudentId ?? "";

  if (orgId && eventData.targetGuardianId) {
    recipients.push(...await resolveGuardianRecipient({ orgId, guardianId: eventData.targetGuardianId, studentId }));
  }
  if (orgId && eventData.targetPersonId) {
    const guardians = await resolveGuardianRecipientsByPerson({ orgId, personId: eventData.targetPersonId, studentId });
    recipients.push(...guardians.recipients);
    if (!guardians.recipients.length && !guardians.hasGuardianRecord) {
      recipients.push({ recipientKind: "PERSON", recipientPersonId: eventData.targetPersonId });
    }
  }
  if (eventData.type === "STUDENT_TRANSPORT_ATTENDANCE_RECORDED" && orgId && studentId) {
    recipients.push(...await resolveActiveStudentGuardians({ orgId, studentId }));
  }
  if (eventData.targetStaffPersonId) {
    recipients.push({ recipientKind: "STAFF", staffPersonId: eventData.targetStaffPersonId, recipientPersonId: eventData.targetStaffPersonId });
  }
  if (eventData.actorUid && eventData.type === "CUSTOM") {
    recipients.push({ recipientKind: "USER", recipientUid: eventData.actorUid, recipientPersonId: eventData.actorPersonId ?? "" });
  }
  return dedupeRecipients(recipients);
}

async function resolveActiveStudentGuardians(params: { orgId: string; studentId: string }): Promise<ResolvedNotificationRecipient[]> {
  const db = getFirestore();
  const now = Date.now();
  const links = await db.collection(`orgs/${params.orgId}/guardianLinks`).where("studentId", "==", params.studentId).limit(20).get();
  const guardianIds = [...new Set(links.docs
    .filter((document) => isActiveGuardianLink(document.data() as FirestoreData, now))
    .map((document) => readString(document.data() as FirestoreData, "guardianId"))
    .filter(Boolean))];
  const resolved = await Promise.all(guardianIds.map((guardianId) => resolveGuardianRecipient({
    orgId: params.orgId,
    guardianId,
    studentId: params.studentId,
    linkAlreadyValidated: true,
  })));
  return resolved.flat();
}

function dedupeRecipients(recipients: ResolvedNotificationRecipient[]): ResolvedNotificationRecipient[] {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = [recipient.recipientKind, recipient.recipientUid ?? "", recipient.recipientPersonId ?? "", recipient.guardianId ?? "", recipient.staffPersonId ?? "", recipient.studentId ?? ""].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
