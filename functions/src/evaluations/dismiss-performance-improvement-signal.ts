import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { PerformanceImprovementSignalSchema } from "@takween/contracts";
import {
  assertSafeDocumentId,
  readString,
  requireNonEmptyString,
  resolvePerformanceImprovementActor,
} from "./performance-improvement-access";

const REGION = "me-central2";

type DismissSignalInput = {
  orgId?: unknown;
  signalId?: unknown;
  note?: unknown;
};

export const dismissPerformanceImprovementSignal = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<{ ok: true; signalId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as DismissSignalInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const signalId = requireNonEmptyString(input.signalId, "signalId");
    const note = readString(input.note);

    assertSafeDocumentId(orgId, "orgId");
    assertSafeDocumentId(signalId, "signalId");

    if (note.length < 3 || note.length > 1000) {
      throw new HttpsError(
        "invalid-argument",
        "A dismissal note between 3 and 1000 characters is required.",
      );
    }

    const db = getFirestore();
    const now = Date.now();
    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
    const signalRef = db.doc(
      `orgs/${orgId}/performanceImprovementSignals/${signalId}`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [userSnapshot, membershipSnapshot, signalSnapshot] =
          await Promise.all([
            transaction.get(userRef),
            transaction.get(membershipRef),
            transaction.get(signalRef),
          ]);

        if (!membershipSnapshot.exists) {
          throw new HttpsError(
            "permission-denied",
            "Active organization membership is required.",
          );
        }
        if (!signalSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "Performance improvement signal was not found.",
          );
        }

        const signal = PerformanceImprovementSignalSchema.parse({
          id: signalSnapshot.id,
          ...signalSnapshot.data(),
        });
        const actor = resolvePerformanceImprovementActor({
          user: userSnapshot.data() ?? {},
          membership: membershipSnapshot.data() ?? {},
          schoolId: signal.schoolId,
          now,
        });

        if (signal.linkedImprovementPlanId) {
          throw new HttpsError(
            "failed-precondition",
            "A signal linked to a plan cannot be dismissed.",
          );
        }

        transaction.update(signalRef, {
          status: "DISMISSED",
          dismissedAt: now,
          dismissedByPersonId: actor.personId,
          dismissalNote: note,
          updatedAt: now,
        });

        return { ok: true, signalId };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error
          ? error.message
          : "Failed to dismiss performance improvement signal.",
      );
    }
  },
);
