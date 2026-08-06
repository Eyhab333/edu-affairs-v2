import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { PerformanceImprovementPlanSchema } from "@takween/contracts";
import {
  assertSafeDocumentId,
  readNumber,
  readString,
  requireNonEmptyString,
  resolvePerformanceImprovementActor,
} from "./performance-improvement-access";

const REGION = "me-central2";

type PlanMutation =
  | "COMPLETE_ACTION"
  | "RECORD_FOLLOW_UP"
  | "CLOSE_IMPROVED"
  | "ESCALATE";

type UpdatePlanInput = {
  orgId?: unknown;
  planId?: unknown;
  mutation?: unknown;
  actionId?: unknown;
  score?: unknown;
  note?: unknown;
};

type UpdatePlanResult = {
  ok: true;
  planId: string;
  status: string;
};

function parseMutation(value: unknown): PlanMutation {
  if (
    value === "COMPLETE_ACTION" ||
    value === "RECORD_FOLLOW_UP" ||
    value === "CLOSE_IMPROVED" ||
    value === "ESCALATE"
  ) {
    return value;
  }

  throw new HttpsError("invalid-argument", "Unsupported plan mutation.");
}

export const updatePerformanceImprovementPlan = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<UpdatePlanResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as UpdatePlanInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const planId = requireNonEmptyString(input.planId, "planId");
    const mutation = parseMutation(input.mutation);
    const note = readString(input.note);

    assertSafeDocumentId(orgId, "orgId");
    assertSafeDocumentId(planId, "planId");

    if (note.length > 1000) {
      throw new HttpsError(
        "invalid-argument",
        "note must be 1000 characters or fewer.",
      );
    }

    const db = getFirestore();
    const now = Date.now();
    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
    const planRef = db.doc(
      `orgs/${orgId}/performanceImprovementPlans/${planId}`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [userSnapshot, membershipSnapshot, planSnapshot] =
          await Promise.all([
            transaction.get(userRef),
            transaction.get(membershipRef),
            transaction.get(planRef),
          ]);

        if (!membershipSnapshot.exists) {
          throw new HttpsError(
            "permission-denied",
            "Active organization membership is required.",
          );
        }

        if (!planSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "Performance improvement plan was not found.",
          );
        }

        const plan = PerformanceImprovementPlanSchema.parse({
          id: planSnapshot.id,
          ...planSnapshot.data(),
        });
        const actor = resolvePerformanceImprovementActor({
          user: userSnapshot.data() ?? {},
          membership: membershipSnapshot.data() ?? {},
          schoolId: plan.schoolId,
          now,
        });

        if (plan.status !== "ACTIVE" && plan.status !== "FOLLOW_UP") {
          throw new HttpsError(
            "failed-precondition",
            "Only an active plan can be updated.",
          );
        }

        const next = {
          ...plan,
          actions: [...plan.actions],
          followUps: [...plan.followUps],
          history: [...plan.history],
          updatedAt: now,
        };

        if (mutation === "COMPLETE_ACTION") {
          const actionId = requireNonEmptyString(input.actionId, "actionId");
          const actionIndex = next.actions.findIndex(
            (action) => action.id === actionId,
          );

          if (actionIndex < 0) {
            throw new HttpsError("not-found", "Improvement action not found.");
          }

          const action = next.actions[actionIndex];
          if (action.status !== "COMPLETED") {
            next.actions[actionIndex] = {
              ...action,
              status: "COMPLETED",
              completedAt: now,
              completedByPersonId: actor.personId,
            };
            next.history.push({
              id: `action-completed-${actionId}-${now}`,
              eventType: "ACTION_COMPLETED",
              status: next.status,
              actorPersonId: actor.personId,
              note: action.title,
              createdAt: now,
            });
          }
        }

        if (mutation === "RECORD_FOLLOW_UP") {
          const score = readNumber(input.score, Number.NaN);
          if (!Number.isFinite(score) || score < 0 || score > 100) {
            throw new HttpsError(
              "invalid-argument",
              "score must be between 0 and 100.",
            );
          }
          if (!note) {
            throw new HttpsError(
              "invalid-argument",
              "A follow-up note is required.",
            );
          }

          next.status = "FOLLOW_UP";
          next.followUps.push({
            id: `follow-up-${now}`,
            score,
            note,
            recordedAt: now,
            recordedByPersonId: actor.personId,
          });
          next.history.push({
            id: `follow-up-recorded-${now}`,
            eventType: "FOLLOW_UP_RECORDED",
            status: "FOLLOW_UP",
            actorPersonId: actor.personId,
            note,
            createdAt: now,
          });
        }

        if (mutation === "CLOSE_IMPROVED") {
          const latestFollowUp = next.followUps[next.followUps.length - 1];
          if (!latestFollowUp || latestFollowUp.score < next.targetScore) {
            throw new HttpsError(
              "failed-precondition",
              "The latest follow-up score must meet the target score.",
            );
          }

          next.status = "CLOSED_IMPROVED";
          next.closedAt = now;
          next.closedByPersonId = actor.personId;
          if (note) next.closureNote = note;
          next.history.push({
            id: `plan-closed-${now}`,
            eventType: "PLAN_CLOSED_IMPROVED",
            status: "CLOSED_IMPROVED",
            actorPersonId: actor.personId,
            ...(note ? { note } : {}),
            createdAt: now,
          });
        }

        if (mutation === "ESCALATE") {
          if (note.length < 3) {
            throw new HttpsError(
              "invalid-argument",
              "An escalation reason is required.",
            );
          }

          next.status = "ESCALATED";
          next.escalatedAt = now;
          next.escalatedByPersonId = actor.personId;
          next.escalationReason = note;
          next.history.push({
            id: `plan-escalated-${now}`,
            eventType: "PLAN_ESCALATED",
            status: "ESCALATED",
            actorPersonId: actor.personId,
            note,
            createdAt: now,
          });
        }

        const validated = PerformanceImprovementPlanSchema.parse(next);
        transaction.set(planRef, validated);

        return { ok: true, planId, status: validated.status };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error
          ? error.message
          : "Failed to update performance improvement plan.",
      );
    }
  },
);
