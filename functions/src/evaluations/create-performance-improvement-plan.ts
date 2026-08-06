import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  PerformanceImprovementPlanSchema,
  PerformanceImprovementSignalSchema,
} from "@takween/contracts";
import {
  assertSafeDocumentId,
  readNumber,
  readString,
  requireNonEmptyString,
  resolvePerformanceImprovementActor,
} from "./performance-improvement-access";

const REGION = "me-central2";
const DAY_MS = 24 * 60 * 60 * 1000;

type CreatePlanInput = {
  orgId?: unknown;
  signalId?: unknown;
  objective?: unknown;
  actions?: unknown;
  targetScore?: unknown;
  durationDays?: unknown;
};

type CreatePlanResult = {
  ok: true;
  planId: string;
  created: boolean;
};

function parseActions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "At least one improvement action is required.",
    );
  }

  const actions = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

  if (actions.length === 0 || actions.length > 10) {
    throw new HttpsError(
      "invalid-argument",
      "Improvement actions must contain between 1 and 10 items.",
    );
  }

  if (actions.some((action) => action.length > 300)) {
    throw new HttpsError(
      "invalid-argument",
      "Each improvement action must be 300 characters or fewer.",
    );
  }

  return actions;
}

export const createPerformanceImprovementPlan = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<CreatePlanResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as CreatePlanInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const signalId = requireNonEmptyString(input.signalId, "signalId");
    const objective = requireNonEmptyString(input.objective, "objective");
    const actions = parseActions(input.actions);
    const targetScore = readNumber(input.targetScore, 70);
    const durationDays = Math.floor(readNumber(input.durationDays, 28));

    assertSafeDocumentId(orgId, "orgId");
    assertSafeDocumentId(signalId, "signalId");

    if (objective.length < 3 || objective.length > 1000) {
      throw new HttpsError(
        "invalid-argument",
        "objective must contain between 3 and 1000 characters.",
      );
    }

    if (targetScore < 0 || targetScore > 100) {
      throw new HttpsError(
        "invalid-argument",
        "targetScore must be between 0 and 100.",
      );
    }

    if (durationDays < 7 || durationDays > 90) {
      throw new HttpsError(
        "invalid-argument",
        "durationDays must be between 7 and 90.",
      );
    }

    const db = getFirestore();
    const now = Date.now();
    const planId = `performance-plan--${signalId}`;
    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
    const signalRef = db.doc(
      `orgs/${orgId}/performanceImprovementSignals/${signalId}`,
    );
    const planRef = db.doc(
      `orgs/${orgId}/performanceImprovementPlans/${planId}`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [userSnapshot, membershipSnapshot, signalSnapshot, planSnapshot] =
          await Promise.all([
            transaction.get(userRef),
            transaction.get(membershipRef),
            transaction.get(signalRef),
            transaction.get(planRef),
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

        if (planSnapshot.exists) {
          return { ok: true, planId, created: false };
        }

        const signal = PerformanceImprovementSignalSchema.parse({
          id: signalSnapshot.id,
          ...signalSnapshot.data(),
        });

        if (signal.orgId !== orgId) {
          throw new HttpsError(
            "permission-denied",
            "Performance improvement signal organization mismatch.",
          );
        }

        const actor = resolvePerformanceImprovementActor({
          user: userSnapshot.data() ?? {},
          membership: membershipSnapshot.data() ?? {},
          schoolId: signal.schoolId,
          now,
        });

        if (signal.status === "DISMISSED") {
          throw new HttpsError(
            "failed-precondition",
            "A dismissed signal cannot be opened as a plan.",
          );
        }

        if (signal.linkedImprovementPlanId) {
          throw new HttpsError(
            "already-exists",
            "This signal is already linked to an improvement plan.",
          );
        }

        const endsAt = now + durationDays * DAY_MS;
        const plan = PerformanceImprovementPlanSchema.parse({
          id: planId,
          orgId,
          schoolId: signal.schoolId,
          academicYearId: signal.academicYearId,
          termId: signal.termId,
          sourceSignalId: signal.id,
          sourceEvaluationPlanIds: signal.evaluationPlanIds,
          sourceCycleIds: signal.lowCycleIds,
          targetPersonId: signal.targetPersonId,
          ...(signal.targetDisplayName
            ? { targetDisplayName: signal.targetDisplayName }
            : {}),
          ...(signal.targetEmail ? { targetEmail: signal.targetEmail } : {}),
          status: "ACTIVE",
          baselineScore: signal.approvedAverageScore,
          targetScore,
          objective,
          weakItems: signal.weakItems,
          actions: actions.map((title, index) => ({
            id: `action-${String(index + 1).padStart(2, "0")}`,
            title,
            status: "PENDING",
            dueAt: endsAt,
          })),
          followUps: [],
          history: [
            {
              id: `plan-opened-${now}`,
              eventType: "PLAN_OPENED",
              status: "ACTIVE",
              actorPersonId: actor.personId,
              createdAt: now,
            },
          ],
          ownerPersonId: actor.personId,
          createdByPersonId: actor.personId,
          startsAt: now,
          endsAt,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        transaction.create(planRef, plan);
        transaction.update(signalRef, {
          status: "PLAN_OPEN",
          linkedImprovementPlanId: planId,
          updatedAt: now,
        });

        return { ok: true, planId, created: true };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error
          ? error.message
          : "Failed to create performance improvement plan.",
      );
    }
  },
);
