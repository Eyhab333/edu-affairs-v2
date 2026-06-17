import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import type { Message, Thread } from "./types";

const REGION = "me-central2";

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

    await db.runTransaction(async (transaction) => {
      const threadSnap = await transaction.get(threadRef);

      if (!threadSnap.exists) {
        logger.warn("onThreadMessageCreated skipped: thread not found", {
          orgId,
          threadId,
          messageId,
        });
        return;
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
    });
  },
);