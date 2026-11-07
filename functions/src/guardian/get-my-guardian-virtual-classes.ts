import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

export const getMyGuardianVirtualClasses = onCall(
  { region: REGION, cors: true },
  async (request) => {
    const startedAt = Date.now();
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );

    const authorizedAt = Date.now();
    const participants = await context.db
      .collection(`orgs/${context.orgId}/virtualClassParticipants`)
      .where("studentId", "==", context.studentId)
      .get();

    const participantsQueriedAt = Date.now();
    const participantRows = participants.docs
      .map((document) => ({
        id: document.id,
        data: document.data(),
      }))
      .filter(
        (row) =>
          typeof row.data.sessionId === "string" &&
          row.data.sessionId.trim(),
      );

    const sessionIds = [...new Set(participantRows.map((row) => String(row.data.sessionId)))];
    const sessionRefs = sessionIds.map((sessionId) =>
      context.db.doc(
        `orgs/${context.orgId}/virtualClassSessions/${sessionId}`,
      ),
    );

    const sessionQueryStartedAt = Date.now();
    const sessions =
      sessionRefs.length > 0
        ? await context.db.getAll(...sessionRefs)
        : [];

    const sessionsQueriedAt = Date.now();
    const sessionById = new Map(
      sessions
        .filter((session) => session.exists)
        .map((session) => [session.id, session.data() ?? {}]),
    );

    const classes = participantRows.flatMap((row) => {
      const sessionId = String(row.data.sessionId);
      const session = sessionById.get(sessionId);

      if (!session || session.isArchived === true) {
        return [];
      }

      return [
        {
          participantId: row.id,
          sessionId,
          ...session,
          startsAt: session.startsAt ?? null,
          platformJoinStatus: row.data.platformJoinStatus ?? "",
          providerAttendanceStatus:
            row.data.providerAttendanceStatus ?? "",
          finalAttendanceStatus: row.data.finalAttendanceStatus ?? "",
          joinClickedAt: row.data.joinClickedAt ?? null,
        },
      ];
    });

    classes.sort(
      (first, second) =>
        Number(first.startsAt ?? 0) - Number(second.startsAt ?? 0),
    );

    if (Math.random() < 0.05) {
      const finishedAt = Date.now();
      logger.info("guardian_callable_performance", {
        operation: "virtual_classes",
        authorizationMs: authorizedAt - startedAt,
        queryMs: participantsQueriedAt - authorizedAt + sessionsQueriedAt - sessionQueryStartedAt,
        processingMs: sessionQueryStartedAt - participantsQueriedAt + finishedAt - sessionsQueriedAt,
        totalMs: finishedAt - startedAt,
      });
    }
    return {
      ok: true,
      classes,
    };
  },
);
