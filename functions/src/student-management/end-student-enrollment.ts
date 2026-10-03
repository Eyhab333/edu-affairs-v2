import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  EndStudentEnrollmentRequestSchema,
  type EndStudentEnrollmentRequest,
  type EndStudentEnrollmentResult,
} from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  membershipRoleKey,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";

const REGION = "me-central2";
const OPERATION_TYPE = "END_STUDENT_ENROLLMENT";

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function parseInput(value: unknown): EndStudentEnrollmentRequest {
  const parsed = EndStudentEnrollmentRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Ending the student enrollment is invalid.",
    );
  }

  return parsed.data;
}

function assertStoredDocumentId(value: string, fieldName: string): void {
  if (!value || value.includes("/")) {
    throw new HttpsError(
      "failed-precondition",
      `${fieldName} is not a valid canonical document identifier.`,
    );
  }
}

function requestFingerprint(params: {
  input: EndStudentEnrollmentRequest;
  uid: string;
}) {
  const { input, uid } = params;
  return createHash("sha256")
    .update(
      JSON.stringify({
        uid,
        orgId: input.orgId,
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        reason: input.reason,
      }),
    )
    .digest("hex");
}

function operationMatchesRequest(params: {
  operation: FirestoreRecord;
  orgId: string;
  studentId: string;
  uid: string;
  fingerprint: string;
}) {
  return (
    readString(params.operation.operationType) === OPERATION_TYPE &&
    readString(params.operation.status) === "COMPLETED" &&
    readString(params.operation.orgId) === params.orgId &&
    readString(params.operation.studentId) === params.studentId &&
    readString(params.operation.actorUid) === params.uid &&
    readString(params.operation.requestFingerprint) === params.fingerprint
  );
}

function operationResult(params: {
  operation: FirestoreRecord;
  operationId: string;
}): EndStudentEnrollmentResult {
  const studentId = readString(params.operation.studentId);
  const sourceEnrollmentId = readString(params.operation.sourceEnrollmentId);
  if (!studentId || !sourceEnrollmentId) {
    throw new HttpsError(
      "failed-precondition",
      "The existing enrollment end operation is incomplete.",
    );
  }

  return {
    ended: true,
    studentId,
    sourceEnrollmentId,
    operationId: params.operationId,
  };
}

export const endStudentEnrollment = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<EndStudentEnrollmentResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = parseInput(request.data);
    const db = getFirestore();
    const membership = await getActiveMembership({ db, orgId: input.orgId, uid });
    if (!canManageOrg(membership)) {
      throw new HttpsError(
        "permission-denied",
        "Organization administrator access is required.",
      );
    }

    const studentRef = db.doc(`orgs/${input.orgId}/students/${input.studentId}`);
    const operationRef = db.doc(
      `orgs/${input.orgId}/studentManagementOperations/${input.operationId}`,
    );
    const enrollmentCollection = db.collection(`orgs/${input.orgId}/studentEnrollments`);
    const fingerprint = requestFingerprint({ input, uid });
    const now = Date.now();

    try {
      return await db.runTransaction<EndStudentEnrollmentResult>(async (transaction) => {
        const [
          membershipSnapshot,
          userSnapshot,
          operationSnapshot,
          studentSnapshot,
          enrollmentsSnapshot,
        ] = await Promise.all([
          transaction.get(db.doc(`users/${uid}/orgMemberships/${input.orgId}`)),
          transaction.get(db.doc(`users/${uid}`)),
          transaction.get(operationRef),
          transaction.get(studentRef),
          transaction.get(
            enrollmentCollection.where("studentId", "==", input.studentId),
          ),
        ]);

        const membershipData = readRecord(membershipSnapshot.data());
        if (!membershipSnapshot.exists || !canManageOrg(membershipData)) {
          throw new HttpsError(
            "permission-denied",
            "Organization administrator access is required.",
          );
        }

        if (operationSnapshot.exists) {
          const operation = readRecord(operationSnapshot.data());
          if (
            !operationMatchesRequest({
              operation,
              orgId: input.orgId,
              studentId: input.studentId,
              uid,
              fingerprint,
            })
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This operation ID has already been used for a different request.",
              { reason: "OPERATION_ID_REUSED" },
            );
          }

          return operationResult({ operation, operationId: input.operationId });
        }

        if (!studentSnapshot.exists) {
          throw new HttpsError("not-found", "Student was not found.", {
            reason: "STUDENT_NOT_FOUND",
          });
        }

        const studentData = readRecord(studentSnapshot.data());
        if (readString(studentData.orgId) !== input.orgId || studentData.isArchived === true) {
          throw new HttpsError(
            "failed-precondition",
            "The student is not eligible for enrollment changes.",
            { reason: "STUDENT_NOT_ELIGIBLE" },
          );
        }

        const personId = readString(studentData.personId);
        assertStoredDocumentId(personId, "student.personId");
        const personSnapshot = await transaction.get(
          db.doc(`orgs/${input.orgId}/people/${personId}`),
        );
        if (
          !personSnapshot.exists ||
          readString(readRecord(personSnapshot.data()).id) !== personId
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The student's linked person record is not canonical.",
            { reason: "STUDENT_NOT_ELIGIBLE" },
          );
        }

        const activeEnrollments = enrollmentsSnapshot.docs.filter((snapshot) => {
          const data = readRecord(snapshot.data());
          return (
            readString(data.academicYearId) === input.academicYearId &&
            readString(data.status) === "ACTIVE"
          );
        });
        if (activeEnrollments.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "The student has no active enrollment in the requested academic year.",
            { reason: "NO_ACTIVE_ENROLLMENT" },
          );
        }
        if (activeEnrollments.length > 1) {
          throw new HttpsError(
            "failed-precondition",
            "The student has multiple active enrollments in the requested academic year.",
            { reason: "MULTIPLE_ACTIVE_ENROLLMENTS" },
          );
        }

        const sourceEnrollmentSnapshot = activeEnrollments[0];
        const sourceEnrollmentId = sourceEnrollmentSnapshot.id;
        const source = readRecord(sourceEnrollmentSnapshot.data());
        if (
          readString(source.studentId) !== input.studentId ||
          (readString(source.orgId) && readString(source.orgId) !== input.orgId) ||
          readString(source.status) !== "ACTIVE"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The active enrollment is not canonical for this student.",
            { reason: "SOURCE_ENROLLMENT_INVALID" },
          );
        }

        const actorPersonId =
          readString(membershipData.personId) ||
          readString(readRecord(userSnapshot.data()).personId);
        transaction.update(sourceEnrollmentSnapshot.ref, {
          status: "WITHDRAWN",
          endAt: now,
          updatedAt: now,
        });
        transaction.create(operationRef, {
          id: input.operationId,
          orgId: input.orgId,
          operationType: OPERATION_TYPE,
          status: "COMPLETED",
          actorUid: uid,
          actorPersonId,
          actorRoleKey: membershipRoleKey(membershipData),
          actorMembershipId: membershipSnapshot.id,
          personId,
          studentId: input.studentId,
          sourceEnrollmentId,
          schoolId: readString(source.schoolId),
          academicYearId: readString(source.academicYearId),
          gradeId: readString(source.gradeId),
          streamId: readString(source.streamId),
          classId: readString(source.classId),
          previousStatus: "ACTIVE",
          newStatus: "WITHDRAWN",
          reason: input.reason,
          requestFingerprint: fingerprint,
          ended: true,
          createdAt: now,
          completedAt: now,
        });

        return {
          ended: true,
          studentId: input.studentId,
          sourceEnrollmentId,
          operationId: input.operationId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Unable to end the student enrollment.");
    }
  },
);
