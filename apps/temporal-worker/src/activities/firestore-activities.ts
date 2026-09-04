import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

import type {
  UrgentEscalationAssignee,
  UrgentEscalationLevel,
} from "../shared";

let firebaseAdminReady = false;

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    path.resolve(process.cwd(), "scripts/service-account.json"),
    path.resolve(process.cwd(), "../../scripts/service-account.json"),
    path.resolve(__dirname, "../../../../scripts/service-account.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

function ensureFirebaseAdmin() {
  if (firebaseAdminReady && getApps().length > 0) {
    return;
  }

  const serviceAccountPath = resolveServiceAccountPath();

  if (getApps().length === 0) {
    if (serviceAccountPath) {
      const rawServiceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8"),
      ) as {
        type?: string;
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };

      console.log("[temporal-worker] Using Firebase service account file:");
      console.log({
        path: serviceAccountPath,
        type: rawServiceAccount.type,
        project_id: rawServiceAccount.project_id,
        client_email: rawServiceAccount.client_email,
        has_private_key: !!rawServiceAccount.private_key,
      });

      if (rawServiceAccount.type !== "service_account") {
        throw new Error(
          `Invalid service account file: type=${rawServiceAccount.type}`,
        );
      }

      if (!rawServiceAccount.project_id) {
        throw new Error("Invalid service account file: missing project_id");
      }

      if (!rawServiceAccount.client_email) {
        throw new Error("Invalid service account file: missing client_email");
      }

      if (!rawServiceAccount.private_key) {
        throw new Error("Invalid service account file: missing private_key");
      }

      const serviceAccount: ServiceAccount = {
        projectId: rawServiceAccount.project_id,
        clientEmail: rawServiceAccount.client_email,
        privateKey: rawServiceAccount.private_key,
      };

      initializeApp({
        credential: cert(serviceAccount),
        projectId: rawServiceAccount.project_id,
      });
    } else {
      const projectId =
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        "edu-affairs-dev";

      console.log(
        "[temporal-worker] Using Firebase application default credentials:",
      );
      console.log({
        projectId,
        hasGoogleCloudProject: !!process.env.GOOGLE_CLOUD_PROJECT,
        hasGcloudProject: !!process.env.GCLOUD_PROJECT,
      });

      initializeApp({
        projectId,
      });
    }
  }

  firebaseAdminReady = true;
}

export async function writeTimelineEvent(input: {
  orgId: string;
  requestId: string;
  type: string;
  title: string;
  details?: Record<string, unknown>;
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();

  const eventRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId)
    .collection("timelineEvents")
    .doc();

  await eventRef.set({
    id: eventRef.id,
    orgId: input.orgId,
    requestId: input.requestId,
    type: input.type,
    title: input.title,
    details: input.details ?? {},
    createdAt: now,
  });

  return {
    ok: true as const,
    eventId: eventRef.id,
    createdAt: now,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item)
    : [];
}

function readParticipantArray(value: unknown) {
  return Array.isArray(value) ? value.map(readRecord).filter(Boolean) : [];
}

function uniqueNonEmptyStrings(values: string[]) {
  return Array.from(new Set(values.map(readString).filter(Boolean)));
}

function isEscalationLevel(value: string): value is UrgentEscalationLevel {
  return ["COUNSELOR", "PRINCIPAL", "SUPERVISION_HEAD"].includes(value);
}

async function resolveUrgentEscalationAssignee(input: {
  orgId: string;
  requestId: string;
  level: UrgentEscalationLevel;
}): Promise<UrgentEscalationAssignee | undefined> {
  const db = getFirestore();
  const requestSnap = await db
    .doc(`orgs/${input.orgId}/urgentCommunicationRequests/${input.requestId}`)
    .get();
  const schoolId = readString(requestSnap.data()?.schoolId);

  if (!schoolId) return undefined;

  const routingSnap = await db
    .doc(`orgs/${input.orgId}/urgentCommunicationRouting/${schoolId}`)
    .get();
  const route = readRecord(routingSnap.data()?.[input.level]);

  const assignee: UrgentEscalationAssignee = {
    uid: readString(route.uid),
    personId: readString(route.personId),
    roleKey: readString(route.roleKey),
    displayName: readString(route.displayName),
  };

  return assignee.uid && assignee.personId && assignee.roleKey && assignee.displayName
    ? assignee
    : undefined;
}

function buildThreadParticipantUpdate(input: {
  thread: Record<string, unknown>;
  assignee: UrgentEscalationAssignee;
}) {
  const participantUids = uniqueNonEmptyStrings([
    ...readStringArray(input.thread.participantUids),
    input.assignee.uid,
  ]);
  const participantPersonIds = uniqueNonEmptyStrings([
    ...readStringArray(input.thread.participantPersonIds),
    input.assignee.personId,
  ]);
  const allowedRoleKeys = uniqueNonEmptyStrings([
    ...readStringArray(input.thread.allowedRoleKeys),
    input.assignee.roleKey,
  ]);

  const participantsByUid = new Map<string, Record<string, unknown>>();

  for (const participant of readParticipantArray(input.thread.participants)) {
    const uid = readString(participant.uid);
    if (uid && !participantsByUid.has(uid)) {
      participantsByUid.set(uid, participant);
    }
  }

  const existingAssignee = participantsByUid.get(input.assignee.uid) ?? {};
  participantsByUid.set(input.assignee.uid, {
    ...existingAssignee,
    uid: input.assignee.uid,
    personId: input.assignee.personId,
    kind: "STAFF",
    roleKey: input.assignee.roleKey,
    displayName: input.assignee.displayName,
    unreadCount:
      typeof existingAssignee.unreadCount === "number"
        ? existingAssignee.unreadCount
        : 0,
    muted:
      typeof existingAssignee.muted === "boolean"
        ? existingAssignee.muted
        : false,
  });

  return {
    participantUids,
    participantPersonIds,
    allowedRoleKeys,
    participants: [...participantsByUid.values()],
  };
}

export async function updateUrgentRequestStatus(input: {
  orgId: string;
  requestId: string;
  threadId?: string;
  status: string;
  currentLevel: string;
  currentDeadlineAt?: number;
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();
  const escalationLevel = isEscalationLevel(input.currentLevel)
    ? input.currentLevel
    : undefined;
  const shouldResolveEscalationAssignee =
    !!input.threadId &&
    input.status === "ESCALATED" &&
    !!escalationLevel;
  const assignee =
    shouldResolveEscalationAssignee
      ? await resolveUrgentEscalationAssignee({
          orgId: input.orgId,
          requestId: input.requestId,
          level: escalationLevel!,
        })
      : undefined;

  const requestRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId);

  const threadRef = input.threadId
    ? db.collection(`orgs/${input.orgId}/threads`).doc(input.threadId)
    : null;

  await db.runTransaction(async (transaction) => {
    const threadSnap = threadRef ? await transaction.get(threadRef) : null;
    const requestUpdate: Record<string, unknown> = {
      id: input.requestId,
      orgId: input.orgId,
      status: input.status,
      currentLevel: input.currentLevel,
      currentDeadlineAt: input.currentDeadlineAt ?? 0,
      updatedAt: now,
    };

    if (assignee) {
      requestUpdate.currentAssignee = assignee;
    }

    transaction.set(requestRef, requestUpdate, { merge: true });

    if (threadRef && threadSnap?.exists) {
      const threadUpdate: Record<string, unknown> = {
        urgentStatus: input.status,
        urgentCurrentLevel: input.currentLevel,
        urgentCurrentAssigneeUid: assignee?.uid ?? (
          shouldResolveEscalationAssignee ? "" : undefined
        ),
        urgentCurrentDeadlineAt: input.currentDeadlineAt ?? 0,
        updatedAt: now,
      };

      if (
        !shouldResolveEscalationAssignee &&
        threadUpdate.urgentCurrentAssigneeUid === undefined
      ) {
        delete threadUpdate.urgentCurrentAssigneeUid;
      }

      if (assignee) {
        Object.assign(
          threadUpdate,
          buildThreadParticipantUpdate({
            thread: readRecord(threadSnap.data()),
            assignee,
          }),
        );
      }

      transaction.set(threadRef, threadUpdate, { merge: true });
    }

    if (shouldResolveEscalationAssignee && !assignee) {
      const timelineRef = requestRef.collection("timelineEvents").doc();

      transaction.set(timelineRef, {
        id: timelineRef.id,
        orgId: input.orgId,
        requestId: input.requestId,
        threadId: input.threadId ?? "",
        type: "SYSTEM_NOTE",
        level: input.currentLevel,
        title: "تعذر تحديد المسؤول عن مستوى التصعيد",
        details: {
          level: input.currentLevel,
        },
        createdAt: now,
      });
    }
  });

  return {
    ok: true as const,
    updatedAt: now,
    assignee,
  };
}

export async function markUrgentRequestResponded(input: {
  orgId: string;
  requestId: string;
  threadId: string;
  level: string;
  actorUid: string;
  actorPersonId?: string;
  actorRoleKey?: string;
  actorDisplayName?: string;
  messageId?: string;
  repliedAt?: number;
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();
  const repliedAt = input.repliedAt ?? now;

  const requestRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId);

  const threadRef = db
    .collection(`orgs/${input.orgId}/threads`)
    .doc(input.threadId);

  const timelineRef = requestRef.collection("timelineEvents").doc();

  await db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);

    if (readString(requestSnap.data()?.status) === "RESPONDED") {
      return;
    }

    transaction.set(
      requestRef,
      {
        status: "RESPONDED",
        respondedAt: repliedAt,
        respondedByUid: input.actorUid,
        respondedByPersonId: input.actorPersonId ?? "",
        respondedByRoleKey: input.actorRoleKey ?? "",
        currentLevel: input.level,
        currentDeadlineAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      threadRef,
      {
        hasActiveUrgentRequest: false,
        urgentStatus: "RESPONDED",
        urgentCurrentLevel: input.level,
        urgentCurrentAssigneeUid: "",
        urgentCurrentDeadlineAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(timelineRef, {
      id: timelineRef.id,
      orgId: input.orgId,
      requestId: input.requestId,
      threadId: input.threadId,
      type: "RESPONSIBLE_REPLIED",
      level: input.level,

      actorUid: input.actorUid,
      actorPersonId: input.actorPersonId ?? "",
      actorRoleKey: input.actorRoleKey ?? "",
      actorDisplayName: input.actorDisplayName ?? "",

      messageId: input.messageId ?? "",

      title: "تم الرد على الطلب العاجل",
      details: {
        repliedAt,
      },

      createdAt: now,
    });
  });

  return {
    ok: true as const,
    repliedAt,
  };
}
