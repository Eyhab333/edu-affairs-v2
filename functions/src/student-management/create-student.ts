import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  CreateStudentRequestSchema,
  type CreateStudentRequest,
  type CreateStudentResult,
} from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  membershipRoleKey,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";

const REGION = "me-central2";
const OPERATION_TYPE = "CREATE_STUDENT";

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function parseInput(value: unknown): CreateStudentRequest {
  const parsed = CreateStudentRequestSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Student creation is invalid.",
    );
  }

  return parsed.data;
}

function operationDocumentId(prefix: "person" | "student", operationId: string) {
  const digest = createHash("sha256").update(operationId).digest("hex");
  return `${prefix}-${digest}`;
}

function enrollmentIdFor(params: {
  academicYearId: string;
  schoolId: string;
  classId: string;
  studentId: string;
}) {
  return `${params.academicYearId}*${params.schoolId}*${params.classId}_${params.studentId}`;
}

function requestFingerprint(params: {
  input: CreateStudentRequest;
  uid: string;
}) {
  const { input, uid } = params;
  return createHash("sha256")
    .update(
      JSON.stringify({
        uid,
        orgId: input.orgId,
        identity: input.identity,
        placement: input.placement,
        reason: input.reason ?? "",
      }),
    )
    .digest("hex");
}

function operationMatchesRequest(params: {
  operation: FirestoreRecord;
  orgId: string;
  uid: string;
  fingerprint: string;
}) {
  return (
    readString(params.operation.operationType) === OPERATION_TYPE &&
    readString(params.operation.status) === "COMPLETED" &&
    readString(params.operation.orgId) === params.orgId &&
    readString(params.operation.actorUid) === params.uid &&
    readString(params.operation.requestFingerprint) === params.fingerprint
  );
}

function operationResult(params: {
  operation: FirestoreRecord;
  operationId: string;
}): CreateStudentResult {
  const personId = readString(params.operation.personId);
  const studentId = readString(params.operation.studentId);
  const enrollmentId = readString(params.operation.enrollmentId);

  if (!personId || !studentId || !enrollmentId) {
    throw new HttpsError(
      "failed-precondition",
      "The existing student creation operation is incomplete.",
    );
  }

  return {
    created: true,
    personId,
    studentId,
    enrollmentId,
    operationId: params.operationId,
  };
}

function placementConflicts(params: {
  orgId: string;
  placement: CreateStudentRequest["placement"];
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
    placement,
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
    conflicts.push("School does not belong to this organization.");
  }
  if (readString(school.id) && readString(school.id) !== placement.schoolId) {
    conflicts.push("School document is not canonical.");
  }
  if (school.isArchived === true) conflicts.push("School is archived.");

  if (readString(academicYear.orgId) && readString(academicYear.orgId) !== orgId) {
    conflicts.push("Academic year does not belong to this organization.");
  }
  if (
    readString(academicYear.schoolId) &&
    readString(academicYear.schoolId) !== placement.schoolId
  ) {
    conflicts.push("Academic year does not belong to the selected school.");
  }
  if (
    readString(academicYear.id) &&
    readString(academicYear.id) !== placement.academicYearId
  ) {
    conflicts.push("Academic year document is not canonical.");
  }
  if (academicYear.isActive === false) conflicts.push("Academic year is inactive.");

  if (readString(classData.orgId) && readString(classData.orgId) !== orgId) {
    conflicts.push("Class does not belong to this organization.");
  }
  if (readString(classData.schoolId) && readString(classData.schoolId) !== placement.schoolId) {
    conflicts.push("Class does not belong to the selected school.");
  }
  if (
    readString(classData.academicYearId) &&
    readString(classData.academicYearId) !== placement.academicYearId
  ) {
    conflicts.push("Class does not belong to the selected academic year.");
  }
  if (readString(classData.id) && readString(classData.id) !== placement.classId) {
    conflicts.push("Class document is not canonical.");
  }
  if (
    classData.isArchived === true ||
    classData.isActive === false ||
    (readString(classData.status) && readString(classData.status) !== "ACTIVE")
  ) {
    conflicts.push("Class is not active.");
  }

  if (gradeId) {
    if (!grade) {
      conflicts.push("Class grade does not exist.");
    } else {
      if (readString(grade.orgId) && readString(grade.orgId) !== orgId) {
        conflicts.push("Class grade does not belong to this organization.");
      }
      if (readString(grade.schoolId) && readString(grade.schoolId) !== placement.schoolId) {
        conflicts.push("Class grade does not belong to the selected school.");
      }
      if (
        readString(grade.academicYearId) &&
        readString(grade.academicYearId) !== placement.academicYearId
      ) {
        conflicts.push("Class grade does not belong to the selected academic year.");
      }
      if (readString(grade.id) && readString(grade.id) !== gradeId) {
        conflicts.push("Class grade document is not canonical.");
      }
      if (grade.isArchived === true) conflicts.push("Class grade is archived.");
    }
  }

  if (streamId) {
    if (!stream) {
      conflicts.push("Class stream does not exist.");
    } else {
      if (readString(stream.orgId) && readString(stream.orgId) !== orgId) {
        conflicts.push("Class stream does not belong to this organization.");
      }
      if (readString(stream.schoolId) && readString(stream.schoolId) !== placement.schoolId) {
        conflicts.push("Class stream does not belong to the selected school.");
      }
      if (
        readString(stream.academicYearId) &&
        readString(stream.academicYearId) !== placement.academicYearId
      ) {
        conflicts.push("Class stream does not belong to the selected academic year.");
      }
      if (readString(stream.id) && readString(stream.id) !== streamId) {
        conflicts.push("Class stream document is not canonical.");
      }
      if (stream.isArchived === true || stream.isActive === false) {
        conflicts.push("Class stream is inactive or archived.");
      }
    }
  }

  return conflicts;
}

export const createStudent = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<CreateStudentResult> => {
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

    const personId = operationDocumentId("person", input.operationId);
    const studentId = operationDocumentId("student", input.operationId);
    const enrollmentId = enrollmentIdFor({ ...input.placement, studentId });
    const fingerprint = requestFingerprint({ input, uid });
    const operationRef = db.doc(
      `orgs/${input.orgId}/studentManagementOperations/${input.operationId}`,
    );
    const personRef = db.doc(`orgs/${input.orgId}/people/${personId}`);
    const studentRef = db.doc(`orgs/${input.orgId}/students/${studentId}`);
    const enrollmentRef = db.doc(
      `orgs/${input.orgId}/studentEnrollments/${enrollmentId}`,
    );
    const schoolRef = db.doc(`orgs/${input.orgId}/schools/${input.placement.schoolId}`);
    const academicYearRef = db.doc(
      `${schoolRef.path}/academicYears/${input.placement.academicYearId}`,
    );
    const classRef = db.doc(`${academicYearRef.path}/classes/${input.placement.classId}`);
    const people = db.collection(`orgs/${input.orgId}/people`);
    const now = Date.now();

    try {
      return await db.runTransaction<CreateStudentResult>(async (transaction) => {
        const [
          membershipSnapshot,
          userSnapshot,
          operationSnapshot,
          personSnapshot,
          studentSnapshot,
          enrollmentSnapshot,
          schoolSnapshot,
          academicYearSnapshot,
          classSnapshot,
          nationalIdMatches,
        ] = await Promise.all([
          transaction.get(db.doc(`users/${uid}/orgMemberships/${input.orgId}`)),
          transaction.get(db.doc(`users/${uid}`)),
          transaction.get(operationRef),
          transaction.get(personRef),
          transaction.get(studentRef),
          transaction.get(enrollmentRef),
          transaction.get(schoolRef),
          transaction.get(academicYearRef),
          transaction.get(classRef),
          transaction.get(people.where("nationalId", "==", input.identity.nationalId)),
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

        if (!schoolSnapshot.exists || !academicYearSnapshot.exists || !classSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The selected school, academic year, or class no longer exists.",
            { reason: "INVALID_PLACEMENT" },
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
        const conflicts = placementConflicts({
          orgId: input.orgId,
          placement: input.placement,
          school: readRecord(schoolSnapshot.data()),
          academicYear: readRecord(academicYearSnapshot.data()),
          classData,
          grade: gradeSnapshot?.exists ? readRecord(gradeSnapshot.data()) : null,
          stream: streamSnapshot?.exists ? readRecord(streamSnapshot.data()) : null,
          gradeId,
          streamId,
        });
        if (conflicts.length > 0) {
          throw new HttpsError(
            "failed-precondition",
            conflicts[0],
            { reason: "INVALID_PLACEMENT" },
          );
        }

        if (!nationalIdMatches.empty) {
          throw new HttpsError(
            "already-exists",
            "The requested national ID is already registered.",
            { reason: "NATIONAL_ID_CONFLICT" },
          );
        }
        if (personSnapshot.exists || studentSnapshot.exists || enrollmentSnapshot.exists) {
          throw new HttpsError(
            "already-exists",
            "A student record already exists for this operation.",
            { reason: "CREATE_TARGET_EXISTS" },
          );
        }

        const actorPersonId =
          readString(membershipData.personId) ||
          readString(readRecord(userSnapshot.data()).personId);
        const reason = input.reason ?? "";

        transaction.create(personRef, {
          id: personId,
          displayName: input.identity.displayName,
          nationalId: input.identity.nationalId,
          phone: input.identity.phone,
          email: input.identity.email,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(studentRef, {
          id: studentId,
          personId,
          orgId: input.orgId,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(enrollmentRef, {
          id: enrollmentId,
          orgId: input.orgId,
          schoolId: input.placement.schoolId,
          academicYearId: input.placement.academicYearId,
          studentId,
          ...(gradeId ? { gradeId } : {}),
          streamId,
          classId: input.placement.classId,
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
          studentId,
          enrollmentId,
          schoolId: input.placement.schoolId,
          academicYearId: input.placement.academicYearId,
          classId: input.placement.classId,
          gradeId,
          streamId,
          reason,
          requestFingerprint: fingerprint,
          createdAt: now,
          completedAt: now,
        });

        return {
          created: true,
          personId,
          studentId,
          enrollmentId,
          operationId: input.operationId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Unable to create the student.");
    }
  },
);
