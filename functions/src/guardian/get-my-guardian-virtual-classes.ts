import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

export const getMyGuardianVirtualClasses = onCall(
  { region: REGION },
  async (request) => {
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );

    const participants = await context.db
      .collection(`orgs/${context.orgId}/virtualClassParticipants`)
      .where("studentId", "==", context.studentId)
      .get();

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

    const sessionRefs = participantRows.map((row) =>
      context.db.doc(
        `orgs/${context.orgId}/virtualClassSessions/${row.data.sessionId}`,
      ),
    );

    const sessions =
      sessionRefs.length > 0
        ? await context.db.getAll(...sessionRefs)
        : [];

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

    return {
      ok: true,
      classes,
    };
  },
);