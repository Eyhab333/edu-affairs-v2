import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  ReEnrollStudentRequestSchema,
  type ReEnrollStudentRequest,
  type ReEnrollStudentResult,
} from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  membershipRoleKey,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";
import {
  baseEnrollmentId,
  resolveEnrollmentEpisodeId,
} from "./enrollment-episode-id";

const REGION = "me-central2";
const OPERATION_TYPE = "REENROLL_STUDENT";

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function parseInput(value: unknown): ReEnrollStudentRequest {
  const parsed = ReEnrollStudentRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Student re-enrollment is invalid.",
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
  input: ReEnrollStudentRequest;
  uid: string;
}) {
  const { input, uid } = params;
  return createHash("sha256")
    .update(
      JSON.stringify({
        uid,
        orgId: input.orgId,
        studentId: input.studentId,
        target: input.target,
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
}): ReEnrollStudentResult {
  const studentId = readString(params.operation.studentId);
  const enrollmentId =
    readString(params.operation.targetEnrollmentId) ||
    readString(params.operation.newEnrollmentId);
  if (!studentId || !enrollmentId) {
    throw new HttpsError(
      "failed-precondition",
      "The existing student re-enrollment operation is incomplete.",
    );
  }

  return {
    reenrolled: true,
    studentId,
    enrollmentId,
    operationId: params.operationId,
  };
}

function targetPlacementConflicts(params: {
  orgId: string;
  target: ReEnrollStudentRequest["target"];
  school: FirestoreRecord;
  academicYear: FirestoreRecord;
  classData: FirestoreRecord;
  grade: FirestoreRecord | null;
  stream: FirestoreRecord | null;
  gradeId: string;
  streamId: string;
}) {
  const {
    orgId,
    target,
    school,
    academicYear,
    classData,
    grade,
    stream,
    gradeId,
    streamId,
  } = params;
  const conflicts: string[] = [];

  if (readString(school.orgId) && readString(school.orgId) !== orgId) {
    conflicts.push("Target school does not belong to this organization.");
  }
  if (readString(school.id) && readString(school.id) !== target.schoolId) {
    conflicts.push("Target school document is not canonical.");
  }
  if (school.isArchived === true) conflicts.push("Target school is archived.");

  if (readString(academicYear.orgId) && readString(academicYear.orgId) !== orgId) {
    conflicts.push("Target academic year does not belong to this organization.");
  }
  if (
    readString(academicYear.schoolId) &&
    readString(academicYear.schoolId) !== target.schoolId
  ) {
    conflicts.push("Target academic year does not belong to the selected school.");
  }
  if (
    readString(academicYear.id) &&
    readString(academicYear.id) !== target.academicYearId
  ) {
    conflicts.push("Target academic year document is not canonical.");
  }
  if (academicYear.isActive === false) conflicts.push("Target academic year is inactive.");

  if (readString(classData.orgId) && readString(classData.orgId) !== orgId) {
    conflicts.push("Target class does not belong to this organization.");
  }
  if (readString(classData.schoolId) && readString(classData.schoolId) !== target.schoolId) {
    conflicts.push("Target class does not belong to the selected school.");
  }
  if (
    readString(classData.academicYearId) &&
    readString(classData.academicYearId) !== target.academicYearId
  ) {
    conflicts.push("Target class does not belong to the selected academic year.");
  }
  if (readString(classData.id) && readString(classData.id) !== target.classId) {
    conflicts.push("Target class document is not canonical.");
  }
  if (
    classData.isArchived === true ||
    classData.isActive === false ||
    (readString(classData.status) && readString(classData.status) !== "ACTIVE")
  ) {
    conflicts.push("Target class is not active.");
  }

  if (gradeId) {
    if (!grade) {
      conflicts.push("Target class grade does not exist.");
    } else {
      if (readString(grade.orgId) && readString(grade.orgId) !== orgId) {
        conflicts.push("Target grade does not belong to this organization.");
      }
      if (readString(grade.schoolId) && readString(grade.schoolId) !== target.schoolId) {
        conflicts.push("Target grade does not belong to the selected school.");
      }
      if (
        readString(grade.academicYearId) &&
        readString(grade.academicYearId) !== target.academicYearId
      ) {
        conflicts.push("Target grade does not belong to the selected academic year.");
      }
      if (readString(grade.id) && readString(grade.id) !== gradeId) {
        conflicts.push("Target grade document is not canonical.");
      }
      if (grade.isArchived === true) conflicts.push("Target grade is archived.");
    }
  }

  if (streamId) {
    if (!stream) {
      conflicts.push("Target class stream does not exist.");
    } else {
      if (readString(stream.orgId) && readString(stream.orgId) !== orgId) {
        conflicts.push("Target stream does not belong to this organization.");
      }
      if (readString(stream.schoolId) && readString(stream.schoolId) !== target.schoolId) {
        conflicts.push("Target stream does not belong to the selected school.");
      }
      if (
        readString(stream.academicYearId) &&
        readString(stream.academicYearId) !== target.academicYearId
      ) {
        conflicts.push("Target stream does not belong to the selected academic year.");
      }
      if (readString(stream.id) && readString(stream.id) !== streamId) {
        conflicts.push("Target stream document is not canonical.");
      }
      if (stream.isArchived === true || stream.isActive === false) {
        conflicts.push("Target stream is inactive or archived.");
      }
    }
  }

  return conflicts;
}

export const reEnrollStudent = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<ReEnrollStudentResult> => {
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
    const enrollmentCollection = db.collection(`orgs/${input.orgId}/studentEnrollments`);
    const baseEnrollmentIdForTarget = baseEnrollmentId({
      ...input.target,
      studentId: input.studentId,
    });
    const baseEnrollmentRef = enrollmentCollection.doc(baseEnrollmentIdForTarget);
    const operationRef = db.doc(
      `orgs/${input.orgId}/studentManagementOperations/${input.operationId}`,
    );
    const schoolRef = db.doc(`orgs/${input.orgId}/schools/${input.target.schoolId}`);
    const academicYearRef = db.doc(
      `${schoolRef.path}/academicYears/${input.target.academicYearId}`,
    );
    const classRef = db.doc(`${academicYearRef.path}/classes/${input.target.classId}`);
    const fingerprint = requestFingerprint({ input, uid });
    const now = Date.now();

    try {
      return await db.runTransaction<ReEnrollStudentResult>(async (transaction) => {
        const [
          membershipSnapshot,
          userSnapshot,
          operationSnapshot,
          studentSnapshot,
          enrollmentsSnapshot,
          baseEnrollmentSnapshot,
          schoolSnapshot,
          academicYearSnapshot,
          classSnapshot,
        ] = await Promise.all([
          transaction.get(db.doc(`users/${uid}/orgMemberships/${input.orgId}`)),
          transaction.get(db.doc(`users/${uid}`)),
          transaction.get(operationRef),
          transaction.get(studentRef),
          transaction.get(
            enrollmentCollection.where("studentId", "==", input.studentId),
          ),
          transaction.get(baseEnrollmentRef),
          transaction.get(schoolRef),
          transaction.get(academicYearRef),
          transaction.get(classRef),
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

        const activeSameYear = enrollmentsSnapshot.docs.filter((snapshot) => {
          const data = readRecord(snapshot.data());
          return (
            readString(data.academicYearId) === input.target.academicYearId &&
            readString(data.status) === "ACTIVE"
          );
        });
        if (activeSameYear.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            "The student already has an active enrollment in the target academic year.",
            { reason: "ACTIVE_ENROLLMENT_EXISTS" },
          );
        }

        if (!schoolSnapshot.exists || !academicYearSnapshot.exists || !classSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The target school, academic year, or class no longer exists.",
            { reason: "INVALID_TARGET_PLACEMENT" },
          );
        }
        const classData = readRecord(classSnapshot.data());
        const gradeId = readString(classData.gradeId);
        const streamId = readString(classData.streamId);
        const gradeRef = gradeId ? db.doc(`${academicYearRef.path}/grades/${gradeId}`) : null;
        const streamRef = streamId
          ? db.doc(`${academicYearRef.path}/streams/${streamId}`)
          : null;
        const [gradeSnapshot, streamSnapshot] = await Promise.all([
          gradeRef ? transaction.get(gradeRef) : Promise.resolve(null),
          streamRef ? transaction.get(streamRef) : Promise.resolve(null),
        ]);
        const targetConflicts = targetPlacementConflicts({
          orgId: input.orgId,
          target: input.target,
          school: readRecord(schoolSnapshot.data()),
          academicYear: readRecord(academicYearSnapshot.data()),
          classData,
          grade: gradeSnapshot?.exists ? readRecord(gradeSnapshot.data()) : null,
          stream: streamSnapshot?.exists ? readRecord(streamSnapshot.data()) : null,
          gradeId,
          streamId,
        });
        if (targetConflicts.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            targetConflicts[0],
            { reason: "INVALID_TARGET_PLACEMENT" },
          );
        }
        const enrollmentId = resolveEnrollmentEpisodeId({
          baseEnrollmentId: baseEnrollmentIdForTarget,
          operationId: input.operationId,
          baseDocumentExists: baseEnrollmentSnapshot.exists,
        });
        const enrollmentRef = baseEnrollmentSnapshot.exists
          ? enrollmentCollection.doc(enrollmentId)
          : baseEnrollmentRef;
        const enrollmentSnapshot = baseEnrollmentSnapshot.exists
          ? await transaction.get(enrollmentRef)
          : baseEnrollmentSnapshot;
        if (enrollmentSnapshot.exists) {
          throw new HttpsError(
            "already-exists",
            "The target enrollment episode already exists.",
            { reason: "TARGET_ENROLLMENT_EXISTS" },
          );
        }

        const actorPersonId =
          readString(membershipData.personId) ||
          readString(readRecord(userSnapshot.data()).personId);
        transaction.create(enrollmentRef, {
          id: enrollmentId,
          orgId: input.orgId,
          schoolId: input.target.schoolId,
          academicYearId: input.target.academicYearId,
          studentId: input.studentId,
          ...(gradeId ? { gradeId } : {}),
          streamId,
          classId: input.target.classId,
          status: "ACTIVE",
          startAt: now,
          createdAt: now,
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
          targetEnrollmentId: enrollmentId,
          schoolId: input.target.schoolId,
          academicYearId: input.target.academicYearId,
          gradeId,
          streamId,
          classId: input.target.classId,
          reason: input.reason,
          requestFingerprint: fingerprint,
          reenrolled: true,
          createdAt: now,
          completedAt: now,
        });

        return {
          reenrolled: true,
          studentId: input.studentId,
          enrollmentId,
          operationId: input.operationId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Unable to re-enroll the student.");
    }
  },
);
