import { onCall, HttpsError } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

export const markMyGuardianVirtualClassJoin = onCall({ region: REGION }, async (request) => {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const participantId = typeof request.data?.participantId === "string"
    ? request.data.participantId.trim()
    : "";
  if (!participantId) throw new HttpsError("invalid-argument", "participantId is required.");

  const participantRef = context.db.doc(
    `orgs/${context.orgId}/virtualClassParticipants/${participantId}`,
  );
  const participant = await participantRef.get();
  const data = participant.data() ?? {};
  if (!participant.exists || data.studentId !== context.studentId) {
    throw new HttpsError("permission-denied", "Participant is not linked to this student.");
  }

  const now = Date.now();
  await participantRef.update({
    platformJoinStatus: "JOIN_CLICKED",
    joinClickedAt: now,
    joinClickedByGuardianId: context.uid,
    joinClickedByGuardianUid: context.uid,
    updatedAt: now,
  });
  return { ok: true, joinClickedAt: now };
});
