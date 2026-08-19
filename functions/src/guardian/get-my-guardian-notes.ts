import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

function guardianVisible(data: FirebaseFirestore.DocumentData): boolean {
  return data.visibility === "PARENT_VISIBLE" ||
    data.visibility === "GUARDIAN_VISIBLE" ||
    data.guardianVisibility === "VISIBLE" ||
    data.visibleToGuardian === true;
}

export const getMyGuardianNotes = onCall({ region: REGION }, async (request) => {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const snapshot = await context.db
    .collection(`orgs/${context.orgId}/studentNotes`)
    .where("studentId", "==", context.studentId)
    .get();

  return {
    ok: true,
    notes: snapshot.docs
      .filter((document) => guardianVisible(document.data()))
      .map((document) => ({ id: document.id, ...document.data() })),
  };
});
