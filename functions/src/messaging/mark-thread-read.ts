import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import type { Thread } from "./types";

const REGION = "me-central2";

type MarkThreadReadInput = {
  orgId: string;
  threadId: string;
};

type MarkThreadReadResult = {
  ok: true;
  threadId: string;
  unreadCount: 0;
  lastReadAt: number;
};

function readNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return trimmed;
}

export const markThreadRead = onCall(
  {
    region: REGION,
  },
  async (request): Promise<MarkThreadReadResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to mark a thread as read.",
      );
    }

    const input = request.data as Partial<MarkThreadReadInput>;

    const orgId = readNonEmptyString(input.orgId, "orgId");
    const threadId = readNonEmptyString(input.threadId, "threadId");

    const db = getFirestore();
    const threadRef = db.doc(`orgs/${orgId}/threads/${threadId}`);

    const now = Date.now();

    await db.runTransaction(async (transaction) => {
      const threadSnap = await transaction.get(threadRef);

      if (!threadSnap.exists) {
        throw new HttpsError("not-found", "Thread not found.");
      }

      const thread = threadSnap.data() as Thread;

      if (thread.orgId && thread.orgId !== orgId) {
        throw new HttpsError("permission-denied", "Thread org mismatch.");
      }

      const participantUids = Array.isArray(thread.participantUids)
        ? thread.participantUids
        : [];

      if (!participantUids.includes(uid)) {
        throw new HttpsError(
          "permission-denied",
          "You are not a participant in this thread.",
        );
      }

      const participants = Array.isArray(thread.participants)
        ? thread.participants
        : [];

      let foundParticipant = false;

      const nextParticipants = participants.map((participant) => {
        if (participant.uid !== uid) {
          return participant;
        }

        foundParticipant = true;

        return {
          ...participant,
          lastReadAt: now,
          unreadCount: 0,
        };
      });

      if (!foundParticipant) {
        throw new HttpsError(
          "failed-precondition",
          "Thread participant summary not found.",
        );
      }

      transaction.update(threadRef, {
        participants: nextParticipants,
        updatedAt: now,
      });
    });

    return {
      ok: true,
      threadId,
      unreadCount: 0,
      lastReadAt: now,
    };
  },
);