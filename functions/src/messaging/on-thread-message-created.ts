// import { getFirestore } from "firebase-admin/firestore";
// import { logger } from "firebase-functions";
// import { onDocumentCreated } from "firebase-functions/v2/firestore";

// import type { Message, Thread } from "./types";

// const REGION = "me-central2";

// function buildMessageSummary(message: Message): string {
//   if (message.isDeleted) return "رسالة محذوفة";

//   if (message.type && message.type !== "TEXT") {
//     switch (message.type) {
//       case "IMAGE":
//         return "صورة";
//       case "FILE":
//         return "ملف";
//       case "VOICE":
//         return "رسالة صوتية";
//       case "SYSTEM":
//         return "رسالة نظام";
//       default:
//         return "رسالة";
//     }
//   }

//   const body = (message.body ?? "").trim();

//   if (body.length <= 120) return body;

//   return `${body.slice(0, 117)}...`;
// }

// export const onThreadMessageCreated = onDocumentCreated(
//   {
//     region: REGION,
//     document: "orgs/{orgId}/threads/{threadId}/messages/{messageId}",
//   },
//   async (event) => {
//     const snap = event.data;

//     if (!snap) {
//       logger.warn("onThreadMessageCreated skipped: missing snapshot", {
//         params: event.params,
//       });
//       return;
//     }

//     const { orgId, threadId, messageId } = event.params;

//     const message = snap.data() as Message;

//     const db = getFirestore();
//     const threadRef = db.doc(`orgs/${orgId}/threads/${threadId}`);

//     await db.runTransaction(async (transaction) => {
//       const threadSnap = await transaction.get(threadRef);

//       if (!threadSnap.exists) {
//         logger.warn("onThreadMessageCreated skipped: thread not found", {
//           orgId,
//           threadId,
//           messageId,
//         });
//         return;
//       }

//       const thread = threadSnap.data() as Thread;

//       const senderUid = message.senderUid ?? "";
//       const createdAt = message.createdAt ?? Date.now();
//       const summary = buildMessageSummary(message);

//       const participants = Array.isArray(thread.participants)
//         ? thread.participants
//         : [];

//       const nextParticipants = participants.map((participant) => {
//         if (!participant.uid || participant.uid === senderUid) {
//           return participant;
//         }

//         return {
//           ...participant,
//           unreadCount: (participant.unreadCount ?? 0) + 1,
//         };
//       });

//       transaction.update(threadRef, {
//         lastMessageSummary: summary,
//         lastMessageAt: createdAt,
//         lastMessageSenderUid: senderUid,
//         lastMessageSenderPersonId: message.senderPersonId ?? "",
//         lastMessageType: message.type ?? "TEXT",

//         participants: nextParticipants,
//         updatedAt: Date.now(),
//       });
//     });
//   },
// );


import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import type { Message, Thread } from "./types";
import { signalUrgentResponsibleReplied } from "./urgent-temporal-signal";

const REGION = "me-central2";

type UrgentSignalCandidate = {
  workflowId: string;
  level: "TEACHER" | "COUNSELOR" | "PRINCIPAL" | "SUPERVISION_HEAD";
  actorUid: string;
  actorPersonId?: string;
  actorRoleKey?: string;
  actorDisplayName?: string;
  messageId: string;
};

type UrgentReplyCandidate = {
  requestId: string;
  actorUid: string;
  actorPersonId: string;
  actorRoleKey: string;
  actorDisplayName: string;
  messageId: string;
  signal?: UrgentSignalCandidate;
};

function buildMessageSummary(message: Message): string {
  if (message.isDeleted) return "رسالة محذوفة";

  if (message.type && message.type !== "TEXT") {
    switch (message.type) {
      case "IMAGE":
        return "صورة";
      case "FILE":
        return "ملف";
      case "VOICE":
        return "رسالة صوتية";
      case "SYSTEM":
        return "رسالة نظام";
      default:
        return "رسالة";
    }
  }

  const body = (message.body ?? "").trim();

  if (body.length <= 120) return body;

  return `${body.slice(0, 117)}...`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readUrgentLevel(
  value: unknown,
): "TEACHER" | "COUNSELOR" | "PRINCIPAL" | "SUPERVISION_HEAD" | "" {
  const level = readString(value);

  if (
    level === "TEACHER" ||
    level === "COUNSELOR" ||
    level === "PRINCIPAL" ||
    level === "SUPERVISION_HEAD"
  ) {
    return level;
  }

  return "";
}

function buildUrgentReplyCandidate(input: {
  thread: Thread;
  message: Message;
  messageId: string;
}): UrgentReplyCandidate | undefined {
  const threadRecord = input.thread as unknown as Record<string, unknown>;
  const messageRecord = input.message as unknown as Record<string, unknown>;

  const requestId = readString(threadRecord.activeUrgentRequestId);
  const currentAssigneeUid = readString(threadRecord.urgentCurrentAssigneeUid);
  const senderUid = readString(input.message.senderUid);

  if (
    threadRecord.hasActiveUrgentRequest !== true ||
    !requestId ||
    !senderUid ||
    senderUid !== currentAssigneeUid
  ) {
    return undefined;
  }

  const workflowId = readString(threadRecord.activeUrgentTemporalWorkflowId);
  const level = readUrgentLevel(threadRecord.urgentCurrentLevel);
  const actorPersonId = readString(input.message.senderPersonId);
  const actorRoleKey = readString(messageRecord.senderRoleKey);
  const actorDisplayName = readString(messageRecord.senderDisplayName);
  const resolvedMessageId = readString(messageRecord.id) || input.messageId;

  return {
    requestId,
    actorUid: senderUid,
    actorPersonId,
    actorRoleKey,
    actorDisplayName,
    messageId: resolvedMessageId,
    signal:
      workflowId && level
        ? {
            workflowId,
            level,
            actorUid: senderUid,
            actorPersonId: actorPersonId || undefined,
            actorRoleKey: actorRoleKey || undefined,
            actorDisplayName: actorDisplayName || undefined,
            messageId: resolvedMessageId,
          }
        : undefined,
  };
}

async function closeUrgentRequestForResponsibleReply(input: {
  orgId: string;
  threadId: string;
  message: Message;
  candidate: UrgentReplyCandidate;
}) {
  const db = getFirestore();
  const threadRef = db.doc(`orgs/${input.orgId}/threads/${input.threadId}`);

  return db.runTransaction(async (transaction) => {
    const threadSnap = await transaction.get(threadRef);

    if (!threadSnap.exists) return false;

    const threadRecord = threadSnap.data() as Record<string, unknown>;
    const requestId = readString(threadRecord.activeUrgentRequestId);
    const currentAssigneeUid = readString(threadRecord.urgentCurrentAssigneeUid);
    const senderUid = readString(input.message.senderUid);

    if (
      threadRecord.hasActiveUrgentRequest !== true ||
      requestId !== input.candidate.requestId ||
      !senderUid ||
      senderUid !== currentAssigneeUid ||
      senderUid !== input.candidate.actorUid
    ) {
      return false;
    }

    const requestRef = db.doc(
      `orgs/${input.orgId}/urgentCommunicationRequests/${requestId}`,
    );
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists) return false;

    if (readString(requestSnap.data()?.status) === "RESPONDED") {
      return false;
    }

    const now = Date.now();
    const repliedAt =
      typeof input.message.createdAt === "number"
        ? input.message.createdAt
        : now;
    const level = readString(threadRecord.urgentCurrentLevel);
    const timelineRef = requestRef.collection("timelineEvents").doc();

    transaction.update(requestRef, {
      status: "RESPONDED",
      respondedAt: repliedAt,
      respondedByUid: input.candidate.actorUid,
      respondedByPersonId: input.candidate.actorPersonId,
      respondedByRoleKey: input.candidate.actorRoleKey,
      currentLevel: level,
      currentDeadlineAt: 0,
      updatedAt: now,
    });
    transaction.update(threadRef, {
      hasActiveUrgentRequest: false,
      urgentStatus: "RESPONDED",
      urgentCurrentLevel: level,
      urgentCurrentAssigneeUid: "",
      urgentCurrentDeadlineAt: 0,
      updatedAt: now,
    });
    transaction.set(timelineRef, {
      id: timelineRef.id,
      orgId: input.orgId,
      requestId,
      threadId: input.threadId,
      type: "RESPONSIBLE_REPLIED",
      level,
      actorUid: input.candidate.actorUid,
      actorPersonId: input.candidate.actorPersonId,
      actorRoleKey: input.candidate.actorRoleKey,
      actorDisplayName: input.candidate.actorDisplayName,
      messageId: input.candidate.messageId,
      title: "تم الرد على الطلب العاجل",
      details: { repliedAt },
      createdAt: now,
    });

    return true;
  });
}

export const onThreadMessageCreated = onDocumentCreated(
  {
    region: REGION,
    document: "orgs/{orgId}/threads/{threadId}/messages/{messageId}",
  },
  async (event) => {
    const snap = event.data;

    if (!snap) {
      logger.warn("onThreadMessageCreated skipped: missing snapshot", {
        params: event.params,
      });
      return;
    }

    const { orgId, threadId, messageId } = event.params;

    const message = snap.data() as Message;

    const db = getFirestore();
    const threadRef = db.doc(`orgs/${orgId}/threads/${threadId}`);

    const urgentReplyCandidate = await db.runTransaction(
      async (transaction) => {
        const threadSnap = await transaction.get(threadRef);

        if (!threadSnap.exists) {
          logger.warn("onThreadMessageCreated skipped: thread not found", {
            orgId,
            threadId,
            messageId,
          });
          return undefined;
        }

        const thread = threadSnap.data() as Thread;

        const senderUid = message.senderUid ?? "";
        const createdAt = message.createdAt ?? Date.now();
        const summary = buildMessageSummary(message);

        const participants = Array.isArray(thread.participants)
          ? thread.participants
          : [];

        const nextParticipants = participants.map((participant) => {
          if (!participant.uid || participant.uid === senderUid) {
            return participant;
          }

          return {
            ...participant,
            unreadCount: (participant.unreadCount ?? 0) + 1,
          };
        });

        transaction.update(threadRef, {
          lastMessageSummary: summary,
          lastMessageAt: createdAt,
          lastMessageSenderUid: senderUid,
          lastMessageSenderPersonId: message.senderPersonId ?? "",
          lastMessageType: message.type ?? "TEXT",

          participants: nextParticipants,
          updatedAt: Date.now(),
        });

        return buildUrgentReplyCandidate({
          thread,
          message,
          messageId,
        });
      },
    );

    if (!urgentReplyCandidate) {
      return;
    }

    try {
      await closeUrgentRequestForResponsibleReply({
        orgId,
        threadId,
        message,
        candidate: urgentReplyCandidate,
      });
    } catch (error) {
      logger.error("Failed to close urgent request after responsible reply", {
        orgId,
        threadId,
        messageId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }

    const signalCandidate = urgentReplyCandidate.signal;

    if (!signalCandidate) {
      return;
    }

    try {
      await signalUrgentResponsibleReplied({
        workflowId: signalCandidate.workflowId,
        payload: {
          actorUid: signalCandidate.actorUid,
          actorPersonId: signalCandidate.actorPersonId,
          actorRoleKey: signalCandidate.actorRoleKey,
          actorDisplayName: signalCandidate.actorDisplayName,
          level: signalCandidate.level,
          messageId: signalCandidate.messageId,
          repliedAt: Date.now(),
        },
      });
    } catch (error) {
      logger.error("Failed to signal urgent responsible reply", {
        orgId,
        threadId,
        messageId,
        workflowId: signalCandidate.workflowId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  },
);
