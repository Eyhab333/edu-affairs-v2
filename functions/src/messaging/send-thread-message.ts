import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import type {
  SendThreadMessageInput,
  SendThreadMessageResult,
  Thread,
} from "./types";

const REGION = "me-central2";

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

export const sendThreadMessage = onCall(
  {
    region: REGION,
  },
  async (request): Promise<SendThreadMessageResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to send a message.",
      );
    }

    const input = request.data as Partial<SendThreadMessageInput>;

    const orgId = readNonEmptyString(input.orgId, "orgId");
    const threadId = readNonEmptyString(input.threadId, "threadId");
    const body = readNonEmptyString(input.body, "body");

    const db = getFirestore();

    const threadRef = db.doc(`orgs/${orgId}/threads/${threadId}`);
    const threadSnap = await threadRef.get();

    if (!threadSnap.exists) {
      throw new HttpsError("not-found", "Thread not found.");
    }

    const thread = threadSnap.data() as Thread;

    if (thread.orgId && thread.orgId !== orgId) {
      throw new HttpsError("permission-denied", "Thread org mismatch.");
    }

    if (thread.status !== "ACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Thread is not active.",
      );
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

    const senderParticipant = (thread.participants ?? []).find(
      (participant) => participant.uid === uid,
    );

    const now = Date.now();
    const messageRef = threadRef.collection("messages").doc();

    await messageRef.set({
      id: messageRef.id,
      orgId,
      threadId,

      schoolId: thread.schoolId ?? "",

      type: "TEXT",

      senderUid: uid,
      senderPersonId: senderParticipant?.personId || uid,
      senderRoleKey: senderParticipant?.roleKey ?? "",
      senderParticipantKind: senderParticipant?.kind ?? "STAFF",

      body,

      createdAt: now,
      updatedAt: now,

      isDeleted: false,
    });

    return {
      ok: true,
      threadId,
      messageId: messageRef.id,
    };
  },
);