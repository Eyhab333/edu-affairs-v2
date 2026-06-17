import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import type { CreateOrGetStudentContextThreadInput, Thread } from "./types";

const REGION = "me-central2";

type CreateOrGetStudentContextThreadResult = {
  ok: true;
  threadId: string;
  created: boolean;
};

type FirestoreRecord = {
  id: string;
} & Record<string, unknown>;

function readNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return trimmed;
}

function readOptionalString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function safeIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildStudentContextThreadId(params: {
  schoolId: string;
  academicYearId: string;
  studentId: string;
  guardianUid: string;
  targetUid: string;
}) {
  return [
    "student-context",
    safeIdPart(params.schoolId),
    safeIdPart(params.academicYearId),
    safeIdPart(params.studentId),
    safeIdPart(params.guardianUid),
    safeIdPart(params.targetUid),
  ].join("__");
}

function isActiveRecord(data: Record<string, unknown>) {
  if (data.isActive === false) return false;
  if (data.active === false) return false;
  if (data.isArchived === true) return false;
  return true;
}

async function findActiveGuardianLink(params: {
  orgId: string;
  guardianUid: string;
  studentId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/guardianLinks`)
    .where("guardianUid", "==", params.guardianUid)
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (
      data.studentId === params.studentId &&
      data.active === true &&
      data.isArchived !== true
    ) {
      return {
        id: doc.id,
        ...data,
      } as FirestoreRecord;
    }
  }

  return null;
}

async function findActiveTargetMembership(params: {
  orgId: string;
  targetUid: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/memberships`)
    .where("uid", "==", params.targetUid)
    .limit(10)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (isActiveRecord(data)) {
      return {
        id: doc.id,
        ...data,
      } as FirestoreRecord;
    }
  }

  return null;
}

async function findActiveEnrollment(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/studentEnrollments`)
    .where("studentId", "==", params.studentId)
    .limit(20)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (
      data.schoolId === params.schoolId &&
      data.academicYearId === params.academicYearId &&
      data.status === "ACTIVE"
    ) {
      return {
        id: doc.id,
        ...data,
      } as FirestoreRecord;
    }
  }

  return null;
}

export const createOrGetStudentContextThread = onCall(
  {
    region: REGION,
  },
  async (request): Promise<CreateOrGetStudentContextThreadResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to create a thread.",
      );
    }

    const input = request.data as Partial<CreateOrGetStudentContextThreadInput>;

    const orgId = readNonEmptyString(input.orgId, "orgId");
    const schoolId = readNonEmptyString(input.schoolId, "schoolId");
    const academicYearId = readNonEmptyString(
      input.academicYearId,
      "academicYearId",
    );
    const studentId = readNonEmptyString(input.studentId, "studentId");
    const targetUid = readNonEmptyString(input.targetUid, "targetUid");

    const requestedGuardianUid = readOptionalString(input.guardianUid);

    if (requestedGuardianUid && requestedGuardianUid !== uid) {
      throw new HttpsError(
        "permission-denied",
        "guardianUid must match the signed-in user.",
      );
    }

    if (targetUid === uid) {
      throw new HttpsError(
        "invalid-argument",
        "targetUid cannot be the same as guardianUid.",
      );
    }

    const db = getFirestore();

    const studentRef = db.doc(`orgs/${orgId}/students/${studentId}`);
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "Student not found.");
    }

    const studentData = studentSnap.data() as Record<string, unknown>;

    if (studentData.isArchived === true) {
      throw new HttpsError("failed-precondition", "Student is archived.");
    }

    const guardianLink = await findActiveGuardianLink({
      orgId,
      guardianUid: uid,
      studentId,
    });

    if (!guardianLink) {
      throw new HttpsError(
        "permission-denied",
        "You are not linked to this student.",
      );
    }

    const targetMembership = await findActiveTargetMembership({
      orgId,
      targetUid,
    });

    if (!targetMembership) {
      throw new HttpsError("not-found", "Target staff membership not found.");
    }

    const enrollment = await findActiveEnrollment({
      orgId,
      schoolId,
      academicYearId,
      studentId,
    });

    if (!enrollment) {
      throw new HttpsError(
        "failed-precondition",
        "No active enrollment found for this student in the selected school/year.",
      );
    }

    const guardianPersonId =
      readOptionalString(input.guardianPersonId) ||
      readOptionalString(guardianLink["guardianPersonId"]);

    const guardianDisplayName =
      readOptionalString(input.guardianDisplayName) || "ولي الأمر";

    const targetPersonId =
      readOptionalString(input.targetPersonId) ||
      readOptionalString(targetMembership["personId"]) ||
      targetUid;

    const targetRoleKey =
      readOptionalString(input.targetRoleKey) ||
      readOptionalString(targetMembership["roleKey"]) ||
      readOptionalString(targetMembership["role"]);

    const targetDisplayName =
      readOptionalString(input.targetDisplayName) ||
      readOptionalString(targetMembership["title"]) ||
      targetRoleKey ||
      "الموظف";

    const gradeId =
      readOptionalString(input.gradeId) ||
      readOptionalString(enrollment["gradeId"]);

    const classId =
      readOptionalString(input.classId) ||
      readOptionalString(enrollment["classId"]);

    const termId = readOptionalString(input.termId);
    const subjectKey = readOptionalString(input.subjectKey);
    const classSubjectOfferingId = readOptionalString(
      input.classSubjectOfferingId,
    );

    const threadId = buildStudentContextThreadId({
      schoolId,
      academicYearId,
      studentId,
      guardianUid: uid,
      targetUid,
    });

    const threadRef = db.doc(`orgs/${orgId}/threads/${threadId}`);

    const result = await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(threadRef);

      if (existingSnap.exists) {
        return {
          ok: true as const,
          threadId,
          created: false,
        };
      }

      const now = Date.now();

      const thread: Thread = {
        id: threadId,
        orgId,

        type: "STUDENT_CONTEXT",
        status: "ACTIVE",

        isInternal: false,

        scopeType: "STUDENT",
        scopeId: studentId,

        schoolId,
        academicYearId,
        termId,
        gradeId,
        classId,

        subjectKey,
        classSubjectOfferingId,

        studentId,
        caseId: "",

        createdByUid: uid,
        createdByPersonId: guardianPersonId || uid,
        createdByRoleKey: "GUARDIAN",

        allowedRoleKeys: targetRoleKey ? [targetRoleKey] : [],

        participantPersonIds: [guardianPersonId || uid, targetPersonId],
        participantUids: [uid, targetUid],

        participants: [
          {
            uid,
            personId: guardianPersonId || uid,
            kind: "GUARDIAN",
            roleKey: "GUARDIAN",
            displayName: guardianDisplayName,
            unreadCount: 0,
            muted: false,
          },
          {
            uid: targetUid,
            personId: targetPersonId,
            kind: "STAFF",
            roleKey: targetRoleKey,
            displayName: targetDisplayName,
            unreadCount: 0,
            muted: false,
          },
        ],

        lastMessageSummary: "",
        lastMessageSenderUid: "",
        lastMessageSenderPersonId: "",
        lastMessageType: "TEXT",

        createdAt: now,
        updatedAt: now,
      };

      transaction.set(threadRef, thread);

      return {
        ok: true as const,
        threadId,
        created: true,
      };
    });

    logger.info("createOrGetStudentContextThread completed", {
      orgId,
      schoolId,
      academicYearId,
      studentId,
      threadId,
      created: result.created,
    });

    return result;
  },
);
