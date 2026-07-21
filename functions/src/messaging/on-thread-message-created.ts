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

function buildUrgentSignalCandidate(input: {
  thread: Thread;
  message: Message;
  messageId: string;
}): UrgentSignalCandidate | undefined {
  const threadRecord = input.thread as unknown as Record<string, unknown>;
  const messageRecord = input.message as unknown as Record<string, unknown>;

  const hasActiveUrgentRequest =
    threadRecord.hasActiveUrgentRequest === true ||
    readString(threadRecord.urgentStatus) === "ACTIVE" ||
    readString(threadRecord.urgentStatus) === "ESCALATED";

  if (!hasActiveUrgentRequest) {
    return undefined;
  }

  const workflowId = readString(threadRecord.activeUrgentTemporalWorkflowId);
  const currentAssigneeUid = readString(threadRecord.urgentCurrentAssigneeUid);
  const senderUid = readString(input.message.senderUid);
  const level = readUrgentLevel(threadRecord.urgentCurrentLevel);

  if (!workflowId) {
    logger.warn("Urgent reply signal skipped: missing workflowId on thread", {
      messageId: input.messageId,
      senderUid,
    });
    return undefined;
  }

  if (!currentAssigneeUid) {
    logger.warn(
      "Urgent reply signal skipped: missing urgentCurrentAssigneeUid",
      {
        messageId: input.messageId,
        workflowId,
      },
    );
    return undefined;
  }

  if (!senderUid || senderUid !== currentAssigneeUid) {
    return undefined;
  }

  if (!level) {
    logger.warn("Urgent reply signal skipped: invalid urgentCurrentLevel", {
      messageId: input.messageId,
      workflowId,
      urgentCurrentLevel: threadRecord.urgentCurrentLevel,
    });
    return undefined;
  }

  return {
    workflowId,
    level,
    actorUid: senderUid,
    actorPersonId: readString(input.message.senderPersonId) || undefined,
    actorRoleKey: readString(messageRecord.senderRoleKey) || undefined,
    actorDisplayName: readString(messageRecord.senderDisplayName) || undefined,
    messageId: input.messageId,
  };
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

    const urgentSignalCandidate = await db.runTransaction(
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

        return buildUrgentSignalCandidate({
          thread,
          message,
          messageId,
        });
      },
    );

    if (!urgentSignalCandidate) {
      return;
    }

    try {
      await signalUrgentResponsibleReplied({
        workflowId: urgentSignalCandidate.workflowId,
        payload: {
          actorUid: urgentSignalCandidate.actorUid,
          actorPersonId: urgentSignalCandidate.actorPersonId,
          actorRoleKey: urgentSignalCandidate.actorRoleKey,
          actorDisplayName: urgentSignalCandidate.actorDisplayName,
          level: urgentSignalCandidate.level,
          messageId: urgentSignalCandidate.messageId,
          repliedAt: Date.now(),
        },
      });
    } catch (error) {
      logger.error("Failed to signal urgent responsible reply", {
        orgId,
        threadId,
        messageId,
        workflowId: urgentSignalCandidate.workflowId,
        error,
      });
    }
  },
);
