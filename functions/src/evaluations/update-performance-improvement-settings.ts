import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { PerformanceImprovementSettingsSchema } from "@takween/contracts";
import {
  assertSafeDocumentId,
  readNumber,
  requireNonEmptyString,
  resolvePerformanceImprovementActor,
} from "./performance-improvement-access";

const REGION = "me-central2";

type UpdateSettingsInput = {
  orgId?: unknown;
  schoolId?: unknown;
  lowScoreThreshold?: unknown;
  lowCycleCountThreshold?: unknown;
  weakItemPercentageThreshold?: unknown;
  weakItemOccurrenceThreshold?: unknown;
  defaultTargetScore?: unknown;
  defaultDurationDays?: unknown;
};

export const updatePerformanceImprovementSettings = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<{ ok: true; schoolId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as UpdateSettingsInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const schoolId = requireNonEmptyString(input.schoolId, "schoolId");

    assertSafeDocumentId(orgId, "orgId");
    assertSafeDocumentId(schoolId, "schoolId");

    const values = {
      lowScoreThreshold: readNumber(input.lowScoreThreshold, Number.NaN),
      lowCycleCountThreshold: readNumber(
        input.lowCycleCountThreshold,
        Number.NaN,
      ),
      weakItemPercentageThreshold: readNumber(
        input.weakItemPercentageThreshold,
        Number.NaN,
      ),
      weakItemOccurrenceThreshold: readNumber(
        input.weakItemOccurrenceThreshold,
        Number.NaN,
      ),
      defaultTargetScore: readNumber(input.defaultTargetScore, Number.NaN),
      defaultDurationDays: readNumber(
        input.defaultDurationDays,
        Number.NaN,
      ),
    };

    const db = getFirestore();
    const now = Date.now();
    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
    const settingsRef = db.doc(
      `orgs/${orgId}/performanceImprovementSettings/${schoolId}`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [userSnapshot, membershipSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(membershipRef),
        ]);

        if (!membershipSnapshot.exists) {
          throw new HttpsError(
            "permission-denied",
            "Active organization membership is required.",
          );
        }

        const actor = resolvePerformanceImprovementActor({
          user: userSnapshot.data() ?? {},
          membership: membershipSnapshot.data() ?? {},
          schoolId,
          now,
        });
        const settings = PerformanceImprovementSettingsSchema.parse({
          id: schoolId,
          orgId,
          schoolId,
          ...values,
          updatedAt: now,
          updatedByPersonId: actor.personId,
        });

        transaction.set(settingsRef, settings);
        return { ok: true, schoolId };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "invalid-argument",
        error instanceof Error
          ? error.message
          : "Failed to update performance improvement settings.",
      );
    }
  },
);
