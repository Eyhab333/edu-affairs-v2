import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  TransferStudentRequestSchema,
  type TransferStudentRequest,
  type TransferStudentResult,
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
const OPERATION_TYPE = "TRANSFER_STUDENT";

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function parseInput(value: unknown): TransferStudentRequest {
  const parsed = TransferStudentRequestSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Student transfer is invalid.",
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
  input: TransferStudentRequest;
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
        transferReason: input.transferReason,
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
}): TransferStudentResult {
  const studentId = readString(params.operation.studentId);
  const sourceEnrollmentId = readString(params.operation.sourceEnrollmentId);
  const targetEnrollmentId = readString(params.operation.targetEnrollmentId);

  if (!studentId || !sourceEnrollmentId || !targetEnrollmentId) {
    throw new HttpsError(
      "failed-precondition",
      "The existing student transfer operation is incomplete.",
    );
  }

  return {
    transferred: params.operation.transferred === true,
    noChange: params.operation.noChange === true,
    studentId,
    sourceEnrollmentId,
    targetEnrollmentId,
    operationId: params.operationId,
  };
}

function schoolType(school: FirestoreRecord) {
  const value = readString(readRecord(school.profile).schoolType);
  return value === "KG" || value === "PRIMARY" ? value : "";
}

function targetPlacementConflicts(params: {
  orgId: string;
  target: TransferStudentRequest["target"];
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

function sourcePlacement(data: FirestoreRecord) {
  return {
    schoolId: readString(data.schoolId),
    academicYearId: readString(data.academicYearId),
    gradeId: readString(data.gradeId),
    streamId: readString(data.streamId),
    classId: readString(data.classId),
  };
}

export const transferStudent = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<TransferStudentResult> => {
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
    const baseTargetEnrollmentId = baseEnrollmentId({
      ...input.target,
      studentId: input.studentId,
    });
    const baseTargetEnrollmentRef = enrollmentCollection.doc(baseTargetEnrollmentId);
    const operationRef = db.doc(
      `orgs/${input.orgId}/studentManagementOperations/${input.operationId}`,
    );
    const targetSchoolRef = db.doc(`orgs/${input.orgId}/schools/${input.target.schoolId}`);
    const targetYearRef = db.doc(
      `${targetSchoolRef.path}/academicYears/${input.target.academicYearId}`,
    );
    const targetClassRef = db.doc(`${targetYearRef.path}/classes/${input.target.classId}`);
    const fingerprint = requestFingerprint({ input, uid });
    const now = Date.now();

    try {
      return await db.runTransaction<TransferStudentResult>(async (transaction) => {
        const [
          membershipSnapshot,
          userSnapshot,
          operationSnapshot,
          studentSnapshot,
          enrollmentsSnapshot,
          baseTargetEnrollmentSnapshot,
          targetSchoolSnapshot,
          targetYearSnapshot,
          targetClassSnapshot,
        ] = await Promise.all([
          transaction.get(db.doc(`users/${uid}/orgMemberships/${input.orgId}`)),
          transaction.get(db.doc(`users/${uid}`)),
          transaction.get(operationRef),
          transaction.get(studentRef),
          transaction.get(
            enrollmentCollection.where("studentId", "==", input.studentId),
          ),
          transaction.get(baseTargetEnrollmentRef),
          transaction.get(targetSchoolRef),
          transaction.get(targetYearRef),
          transaction.get(targetClassRef),
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
            "The student is not eligible for transfer.",
            { reason: "STUDENT_NOT_ELIGIBLE" },
          );
        }

        const personId = readString(studentData.personId);
        assertStoredDocumentId(personId, "student.personId");
        const personRef = db.doc(`orgs/${input.orgId}/people/${personId}`);
        const personSnapshot = await transaction.get(personRef);
        if (!personSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The student's linked person record was not found.",
            { reason: "STUDENT_NOT_ELIGIBLE" },
          );
        }
        if (readString(readRecord(personSnapshot.data()).id) !== personId) {
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
        if (activeSameYear.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "The student has no active enrollment in the target academic year.",
            { reason: "NO_ACTIVE_ENROLLMENT" },
          );
        }
        if (activeSameYear.length > 1) {
          throw new HttpsError(
            "failed-precondition",
            "The student has multiple active enrollments in the target academic year.",
            { reason: "MULTIPLE_ACTIVE_ENROLLMENTS" },
          );
        }

        const sourceEnrollmentSnapshot = activeSameYear[0];
        const sourceEnrollmentId = sourceEnrollmentSnapshot.id;
        const sourceData = readRecord(sourceEnrollmentSnapshot.data());
        const source = sourcePlacement(sourceData);
        if (
          readString(sourceData.studentId) !== input.studentId ||
          (readString(sourceData.orgId) && readString(sourceData.orgId) !== input.orgId)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The active enrollment is not canonical for this student.",
            { reason: "SOURCE_ENROLLMENT_INVALID" },
          );
        }
        if (source.academicYearId !== input.target.academicYearId) {
          throw new HttpsError(
            "failed-precondition",
            "Transfers are restricted to the same academic year.",
            { reason: "SAME_ACADEMIC_YEAR_REQUIRED" },
          );
        }

        const alreadyAtTarget =
          source.schoolId === input.target.schoolId &&
          source.academicYearId === input.target.academicYearId &&
          source.classId === input.target.classId;
        const actorPersonId =
          readString(membershipData.personId) ||
          readString(readRecord(userSnapshot.data()).personId);
        if (
          !targetSchoolSnapshot.exists ||
          !targetYearSnapshot.exists ||
          !targetClassSnapshot.exists
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The target school, academic year, or class no longer exists.",
            { reason: "INVALID_TARGET_PLACEMENT" },
          );
        }

        const targetClassData = readRecord(targetClassSnapshot.data());
        const gradeId = readString(targetClassData.gradeId);
        const streamId = readString(targetClassData.streamId);
        const gradeRef = gradeId ? db.doc(`${targetYearRef.path}/grades/${gradeId}`) : null;
        const streamRef = streamId
          ? db.doc(`${targetYearRef.path}/streams/${streamId}`)
          : null;
        const [gradeSnapshot, streamSnapshot] = await Promise.all([
          gradeRef ? transaction.get(gradeRef) : Promise.resolve(null),
          streamRef ? transaction.get(streamRef) : Promise.resolve(null),
        ]);
        const targetConflicts = targetPlacementConflicts({
          orgId: input.orgId,
          target: input.target,
          school: readRecord(targetSchoolSnapshot.data()),
          academicYear: readRecord(targetYearSnapshot.data()),
          classData: targetClassData,
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

        if (alreadyAtTarget) {
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
            targetEnrollmentId: sourceEnrollmentId,
            source,
            target: source,
            transferReason: input.transferReason,
            requestFingerprint: fingerprint,
            transferred: false,
            noChange: true,
            createdAt: now,
            completedAt: now,
          });
          return {
            transferred: false,
            noChange: true,
            studentId: input.studentId,
            sourceEnrollmentId,
            targetEnrollmentId: sourceEnrollmentId,
            operationId: input.operationId,
          };
        }

        const targetEnrollmentId = resolveEnrollmentEpisodeId({
          baseEnrollmentId: baseTargetEnrollmentId,
          operationId: input.operationId,
          baseDocumentExists: baseTargetEnrollmentSnapshot.exists,
        });
        const targetEnrollmentRef = baseTargetEnrollmentSnapshot.exists
          ? enrollmentCollection.doc(targetEnrollmentId)
          : baseTargetEnrollmentRef;
        const targetEnrollmentSnapshot = baseTargetEnrollmentSnapshot.exists
          ? await transaction.get(targetEnrollmentRef)
          : baseTargetEnrollmentSnapshot;
        if (targetEnrollmentSnapshot.exists) {
          throw new HttpsError(
            "already-exists",
            "The target enrollment episode already exists.",
            { reason: "TARGET_ENROLLMENT_EXISTS" },
          );
        }

        if (source.schoolId !== input.target.schoolId) {
          assertStoredDocumentId(source.schoolId, "source enrollment.schoolId");
          const sourceSchoolSnapshot = await transaction.get(
            db.doc(`orgs/${input.orgId}/schools/${source.schoolId}`),
          );
          const sourceType = sourceSchoolSnapshot.exists
            ? schoolType(readRecord(sourceSchoolSnapshot.data()))
            : "";
          const targetType = schoolType(readRecord(targetSchoolSnapshot.data()));
          if (!sourceSchoolSnapshot.exists || !sourceType || !targetType || sourceType !== targetType) {
            throw new HttpsError(
              "failed-precondition",
              "Cross-school transfer school types are not compatible.",
              { reason: "CROSS_SCHOOL_TYPE_MISMATCH" },
            );
          }
        }

        const target = {
          schoolId: input.target.schoolId,
          academicYearId: input.target.academicYearId,
          gradeId,
          streamId,
          classId: input.target.classId,
        };

        transaction.update(sourceEnrollmentSnapshot.ref, {
          status: "TRANSFERRED",
          endAt: now,
          updatedAt: now,
        });
        transaction.create(targetEnrollmentRef, {
          id: targetEnrollmentId,
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
          sourceEnrollmentId,
          targetEnrollmentId,
          source,
          target,
          transferReason: input.transferReason,
          requestFingerprint: fingerprint,
          transferred: true,
          noChange: false,
          createdAt: now,
          completedAt: now,
        });

        return {
          transferred: true,
          noChange: false,
          studentId: input.studentId,
          sourceEnrollmentId,
          targetEnrollmentId,
          operationId: input.operationId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Unable to transfer the student.");
    }
  },
);
