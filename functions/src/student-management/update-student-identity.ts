import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  UpdateStudentIdentityRequestSchema,
  type UpdateStudentIdentityChanges,
  type UpdateStudentIdentityRequest,
  type UpdateStudentIdentityResult,
} from "@takween/contracts";

import {
  canManageOrg,
  getActiveMembership,
  membershipRoleKey,
  readString,
  type FirestoreRecord,
} from "../staff-chat/shared";

const REGION = "me-central2";
const OPERATION_TYPE = "UPDATE_STUDENT_IDENTITY";

const EDITABLE_FIELDS = [
  "displayName",
  "nationalId",
  "phone",
  "email",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
type IdentityValues = Record<EditableField, string>;

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function parseInput(value: unknown): UpdateStudentIdentityRequest {
  const parsed = UpdateStudentIdentityRequestSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues[0]?.message ?? "Student identity update is invalid.",
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

function personValues(data: FirestoreRecord): IdentityValues {
  return {
    displayName: readString(data.displayName),
    nationalId: readString(data.nationalId),
    phone: readString(data.phone),
    email: readString(data.email),
  };
}

function requestedFields(changes: UpdateStudentIdentityChanges): EditableField[] {
  return EDITABLE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(changes, field),
  );
}

function changedFields(params: {
  changes: UpdateStudentIdentityChanges;
  current: IdentityValues;
}): EditableField[] {
  return requestedFields(params.changes).filter(
    (field) => params.changes[field] !== params.current[field],
  );
}

function assertNationalIdIsAvailable(params: {
  documents: Array<{ id: string }>;
  personId: string;
}): void {
  const otherPersonExists = params.documents.some(
    (document) => document.id !== params.personId,
  );

  if (params.documents.length > 1 || otherPersonExists) {
    throw new HttpsError(
      "already-exists",
      "The requested national ID is already linked to another person.",
      { reason: "NATIONAL_ID_CONFLICT" },
    );
  }
}

function operationMatchesRequest(params: {
  operation: FirestoreRecord;
  orgId: string;
  studentId: string;
  personId: string;
  uid: string;
  changes: UpdateStudentIdentityChanges;
  reason: string;
}): boolean {
  const requestedChanges = readRecord(params.operation.requestedChanges);
  const requestedFieldsForOperation = requestedFields(params.changes);
  const operationFields = Object.keys(requestedChanges).filter((field) =>
    EDITABLE_FIELDS.includes(field as EditableField),
  );

  return (
    readString(params.operation.operationType) === OPERATION_TYPE &&
    readString(params.operation.orgId) === params.orgId &&
    readString(params.operation.studentId) === params.studentId &&
    readString(params.operation.personId) === params.personId &&
    readString(params.operation.actorUid) === params.uid &&
    readString(params.operation.reason) === params.reason &&
    operationFields.length === requestedFieldsForOperation.length &&
    requestedFieldsForOperation.every(
      (field) => readString(requestedChanges[field]) === params.changes[field],
    )
  );
}

function operationUpdatedFields(operation: FirestoreRecord): EditableField[] {
  return Array.isArray(operation.updatedFields)
    ? operation.updatedFields.filter(
        (field): field is EditableField =>
          typeof field === "string" &&
          EDITABLE_FIELDS.includes(field as EditableField),
      )
    : [];
}

function operationResult(params: {
  operation: FirestoreRecord;
  studentId: string;
  personId: string;
  operationId: string;
}): UpdateStudentIdentityResult {
  const updatedFields = operationUpdatedFields(params.operation);

  return {
    updated: params.operation.updated === true,
    noChange: params.operation.noChange === true || updatedFields.length === 0,
    studentId: params.studentId,
    personId: params.personId,
    updatedFields,
    operationId: params.operationId,
  };
}

export const updateStudentIdentity = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<UpdateStudentIdentityResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = parseInput(request.data);
    const db = getFirestore();

    // This preflight check intentionally uses a trusted membership document;
    // the same authority is read again inside the write transaction.
    const membership = await getActiveMembership({
      db,
      orgId: input.orgId,
      uid,
    });
    if (!canManageOrg(membership)) {
      throw new HttpsError(
        "permission-denied",
        "Organization administrator access is required.",
      );
    }

    const studentRef = db.doc(`orgs/${input.orgId}/students/${input.studentId}`);
    const initialStudentSnapshot = await studentRef.get();
    if (!initialStudentSnapshot.exists) {
      throw new HttpsError("not-found", "Student was not found.");
    }

    const initialStudent = readRecord(initialStudentSnapshot.data());
    if (readString(initialStudent.orgId) !== input.orgId) {
      throw new HttpsError(
        "failed-precondition",
        "The student record does not belong to the requested organization.",
      );
    }
    if (initialStudent.isArchived === true) {
      throw new HttpsError(
        "failed-precondition",
        "Archived students cannot have their identity updated.",
      );
    }

    const personId = readString(initialStudent.personId);
    assertStoredDocumentId(personId, "student.personId");

    const personRef = db.doc(`orgs/${input.orgId}/people/${personId}`);
    const people = db.collection(`orgs/${input.orgId}/people`);
    const requestedNationalId = input.changes.nationalId;

    // Firestore has no unique constraint for a field. This preflight yields a
    // prompt, deterministic conflict response; the query is repeated inside
    // the transaction immediately before the write.
    if (requestedNationalId) {
      const matches = await people
        .where("nationalId", "==", requestedNationalId)
        .get();
      assertNationalIdIsAvailable({
        documents: matches.docs,
        personId,
      });
    }

    const operationId =
      input.operationId ??
      db.collection(`orgs/${input.orgId}/studentManagementOperations`).doc().id;
    const operationRef = db.doc(
      `orgs/${input.orgId}/studentManagementOperations/${operationId}`,
    );
    const reason = input.reason ?? "";
    const now = Date.now();

    try {
      return await db.runTransaction(async (transaction) => {
        const nationalIdQuery = requestedNationalId
          ? people.where("nationalId", "==", requestedNationalId)
          : null;

        const [
          membershipSnapshot,
          userSnapshot,
          studentSnapshot,
          personSnapshot,
          operationSnapshot,
          nationalIdMatches,
        ] = await Promise.all([
          transaction.get(db.doc(`users/${uid}/orgMemberships/${input.orgId}`)),
          transaction.get(db.doc(`users/${uid}`)),
          transaction.get(studentRef),
          transaction.get(personRef),
          transaction.get(operationRef),
          nationalIdQuery ? transaction.get(nationalIdQuery) : Promise.resolve(null),
        ]);

        const membershipData = readRecord(membershipSnapshot.data());
        if (!membershipSnapshot.exists || !canManageOrg(membershipData)) {
          throw new HttpsError(
            "permission-denied",
            "Organization administrator access is required.",
          );
        }

        if (!studentSnapshot.exists) {
          throw new HttpsError("not-found", "Student was not found.");
        }

        const studentData = readRecord(studentSnapshot.data());
        if (readString(studentData.orgId) !== input.orgId) {
          throw new HttpsError(
            "failed-precondition",
            "The student record does not belong to the requested organization.",
          );
        }
        if (studentData.isArchived === true) {
          throw new HttpsError(
            "failed-precondition",
            "Archived students cannot have their identity updated.",
          );
        }

        if (readString(studentData.personId) !== personId) {
          throw new HttpsError(
            "failed-precondition",
            "The student's canonical person link changed during this operation.",
          );
        }

        if (!personSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "The student's linked person record was not found.",
          );
        }

        const personData = readRecord(personSnapshot.data());
        if (readString(personData.id) !== personId) {
          throw new HttpsError(
            "failed-precondition",
            "The linked person record is not canonical.",
          );
        }

        if (nationalIdMatches) {
          assertNationalIdIsAvailable({
            documents: nationalIdMatches.docs,
            personId,
          });
        }

        if (operationSnapshot.exists) {
          const operation = readRecord(operationSnapshot.data());
          if (
            !operationMatchesRequest({
              operation,
              orgId: input.orgId,
              studentId: input.studentId,
              personId,
              uid,
              changes: input.changes,
              reason,
            })
          ) {
            throw new HttpsError(
              "failed-precondition",
              "This operation ID has already been used for a different request.",
              { reason: "OPERATION_ID_REUSED" },
            );
          }

          return operationResult({
            operation,
            studentId: input.studentId,
            personId,
            operationId,
          });
        }

        const current = personValues(personData);
        if (!current.displayName) {
          throw new HttpsError(
            "failed-precondition",
            "The linked person record is missing a display name.",
          );
        }

        const updatedFields = changedFields({
          changes: input.changes,
          current,
        });

        if (updatedFields.length === 0) {
          return {
            updated: false,
            noChange: true,
            studentId: input.studentId,
            personId,
            updatedFields: [],
          };
        }

        const next = {
          ...current,
          ...input.changes,
        } as IdentityValues;
        const personUpdate: Record<string, unknown> = { updatedAt: now };

        updatedFields.forEach((field) => {
          if ((field === "nationalId" || field === "phone") && !next[field]) {
            personUpdate[field] = FieldValue.delete();
            return;
          }

          personUpdate[field] = next[field];
        });

        const actorPersonId =
          readString(membershipData.personId) ||
          readString(readRecord(userSnapshot.data()).personId);
        const actorRoleKey = membershipRoleKey(membershipData);
        const fieldChanges = Object.fromEntries(
          updatedFields.map((field) => [
            field,
            { oldValue: current[field], newValue: next[field] },
          ]),
        );

        transaction.update(personRef, personUpdate);
        transaction.create(operationRef, {
          id: operationId,
          orgId: input.orgId,
          operationType: OPERATION_TYPE,
          status: "COMPLETED",
          studentId: input.studentId,
          personId,
          actorUid: uid,
          actorPersonId,
          actorRoleKey,
          actorMembershipId: membershipSnapshot.id,
          reason,
          requestedChanges: input.changes,
          fieldChanges,
          updatedFields,
          updated: true,
          noChange: false,
          createdAt: now,
          completedAt: now,
        });

        return {
          updated: true,
          noChange: false,
          studentId: input.studentId,
          personId,
          updatedFields,
          operationId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "internal",
        "Unable to update the student identity.",
      );
    }
  },
);
