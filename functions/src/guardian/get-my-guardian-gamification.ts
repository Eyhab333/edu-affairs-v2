import type { StudentGamificationEvent } from "@takween/contracts";
import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

const GUARDIAN_VISIBLE_EVENT_VISIBILITIES = new Set([
  "GUARDIAN_VISIBLE",
  "EVERYONE",
  "STUDENT_AND_GUARDIAN_VISIBLE",
]);

export const getMyGuardianGamification = onCall(
  { region: REGION },
  async (request) => {
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );

    const snapshot = await context.db
      .collection(`orgs/${context.orgId}/studentGamificationEvents`)
      .where("studentId", "==", context.studentId)
      .get();

    const events = snapshot.docs
      .map((document) => ({
        id: document.id,
        ...(document.data() as Omit<StudentGamificationEvent, "id">),
      }))
      .filter(
        (event) =>
          event.status === "ACTIVE" &&
          GUARDIAN_VISIBLE_EVENT_VISIBILITIES.has(event.visibility),
      );

    return {
      ok: true,
      events,
    };
  },
);
