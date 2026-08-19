import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

export const getMyGuardianAttendance = onCall({ region: REGION }, async (request) => {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const snapshot = await context.db
    .collection(`orgs/${context.orgId}/studentAttendanceRecords`)
    .where("studentId", "==", context.studentId)
    .get();

  return {
    ok: true,
    records: snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })),
  };
});
