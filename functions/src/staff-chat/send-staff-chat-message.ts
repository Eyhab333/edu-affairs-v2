import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  getActiveMembership,
  isActiveMembership,
  matchesStaffChatGroup,
  membershipRoleKey,
  readRequiredString,
  readString,
} from "./shared";

const REGION = "me-central2";
const MAX_MESSAGE_LENGTH = 4_000;

export const sendStaffChatMessage = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const input = (request.data ?? {}) as Record<string, unknown>;
    const orgId = readRequiredString(input.orgId, "orgId");
    const groupId = readRequiredString(input.groupId, "groupId");
    const body = readRequiredString(input.body, "body");
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `body must be ${MAX_MESSAGE_LENGTH} characters or less.`,
      );
    }

    const db = getFirestore();
    const membership = await getActiveMembership({ db, orgId, uid });
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const user = userSnapshot.data() ?? {};
    const senderPersonId = readString(membership.personId) || uid;
    const senderDisplayName =
      readString(user.displayName) ||
      readString(user.email) ||
      readString(membership.title) ||
      "موظف";
    const groupRef = db.doc(`orgs/${orgId}/staffChatGroups/${groupId}`);
    const messageRef = groupRef.collection("messages").doc();

    await db.runTransaction(async (transaction) => {
      const currentMembership = await transaction.get(
        db.doc(`users/${uid}/orgMemberships/${orgId}`),
      );
      const groupSnapshot = await transaction.get(groupRef);
      const currentMembershipData = currentMembership.data() ?? {};

      if (
        !currentMembership.exists ||
        !isActiveMembership(currentMembershipData)
      ) {
        throw new HttpsError(
          "permission-denied",
          "An active organization membership is required.",
        );
      }

      if (!groupSnapshot.exists) {
        throw new HttpsError("not-found", "Staff chat group not found.");
      }

      const group = groupSnapshot.data() ?? {};
      if (group.orgId !== orgId || group.type !== "STAFF_GROUP") {
        throw new HttpsError(
          "permission-denied",
          "Staff chat group org mismatch.",
        );
      }

      if (
        !matchesStaffChatGroup({
          uid,
          membership: currentMembershipData,
          group,
        })
      ) {
        throw new HttpsError(
          "permission-denied",
          "You are not a member of this staff chat group.",
        );
      }

      const now = Date.now();
      transaction.create(messageRef, {
        id: messageRef.id,
        orgId,
        groupId,
        type: "TEXT",
        status: "SENT",
        senderUid: uid,
        senderPersonId,
        senderRoleKey: membershipRoleKey(currentMembershipData),
        senderDisplayName,
        body,
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(groupRef, {
        lastMessageSummary:
          body.length <= 120 ? body : `${body.slice(0, 117)}...`,
        lastMessageAt: now,
        lastMessageSenderUid: uid,
        lastMessageSenderPersonId: senderPersonId,
        lastMessageType: "TEXT",
        updatedAt: now,
      });
    });

    return { ok: true, groupId, messageId: messageRef.id };
  },
);
