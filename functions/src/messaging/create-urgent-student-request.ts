import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  URGENT_SLA_TASK_QUEUE,
  startUrgentSlaWorkflow,
} from "./start-urgent-sla-workflow";

const TEMPORAL_API_KEY = defineSecret("TEMPORAL_API_KEY");
const TEACHER_WAIT_MS = 60_000;
const COUNSELOR_WAIT_MS = 120_000;
const PRINCIPAL_WAIT_MS = 180_000;

type UrgentAssigneeInput = {
  uid: string;
  personId?: string;
  roleKey: string;
  displayName: string;
};

type CreateUrgentStudentRequestInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  gradeId?: string;
  classId?: string;
  studentId: string;

  threadId: string;
  title?: string;
  initialMessageId?: string;

  teacherAssignee: UrgentAssigneeInput;
};

function readString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `Missing ${fieldName}`);
  }

  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readAssignee(value: unknown, fieldName: string): UrgentAssigneeInput {
  if (!value || typeof value !== "object") {
    throw new HttpsError("invalid-argument", `Missing ${fieldName}`);
  }

  const item = value as Record<string, unknown>;

  return {
    uid: readString(item.uid, `${fieldName}.uid`),
    personId: readOptionalString(item.personId),
    roleKey: readString(item.roleKey, `${fieldName}.roleKey`),
    displayName: readString(item.displayName, `${fieldName}.displayName`),
  };
}

function readInput(data: unknown): CreateUrgentStudentRequestInput {
  if (!data || typeof data !== "object") {
    throw new HttpsError("invalid-argument", "Invalid request data");
  }

  const item = data as Record<string, unknown>;

  return {
    orgId: readString(item.orgId, "orgId"),
    schoolId: readString(item.schoolId, "schoolId"),
    academicYearId: readString(item.academicYearId, "academicYearId"),

    gradeId: readOptionalString(item.gradeId),
    classId: readOptionalString(item.classId),
    studentId: readString(item.studentId, "studentId"),

    threadId: readString(item.threadId, "threadId"),
    title: readOptionalString(item.title),
    initialMessageId: readOptionalString(item.initialMessageId),

    teacherAssignee: readAssignee(item.teacherAssignee, "teacherAssignee"),
  };
}

function isActiveGuardianLink(data: FirebaseFirestore.DocumentData) {
  if (data.isActive === false) return false;
  if (data.status === "INACTIVE") return false;
  if (data.status === "DELETED") return false;
  if (data.status === "CANCELLED") return false;
  return true;
}

export const createUrgentStudentRequest = onCall(
  {
    region: "me-central2",
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: [TEMPORAL_API_KEY],
  },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const input = readInput(request.data);
    const db = getFirestore();
    const now = Date.now();

    const guardianLinksSnapshot = await db
      .collection(`orgs/${input.orgId}/guardianLinks`)
      .where("guardianUid", "==", uid)
      .where("studentId", "==", input.studentId)
      .limit(5)
      .get();

    const hasActiveGuardianLink = guardianLinksSnapshot.docs.some((doc) =>
      isActiveGuardianLink(doc.data()),
    );

    if (!hasActiveGuardianLink) {
      throw new HttpsError(
        "permission-denied",
        "You are not allowed to create an urgent request for this student",
      );
    }

    const threadRef = db
      .collection(`orgs/${input.orgId}/threads`)
      .doc(input.threadId);

    const threadSnap = await threadRef.get();

    if (!threadSnap.exists) {
      throw new HttpsError("not-found", "Thread not found");
    }

    const thread = threadSnap.data() ?? {};
    const participantUids = Array.isArray(thread.participantUids)
      ? thread.participantUids
      : [];

    if (!participantUids.includes(uid)) {
      throw new HttpsError(
        "permission-denied",
        "You are not a participant in this thread",
      );
    }

    const requestRef = db
      .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
      .doc();

    const requestId = requestRef.id;

    const teacherDeadlineAt = now + 60 * 60 * 1000;
    const workflowId = `urgentSla:${input.orgId}:${requestId}:${now}`;

    const timelineRef = requestRef.collection("timelineEvents").doc();

    await db.runTransaction(async (transaction) => {
      transaction.set(requestRef, {
        id: requestId,

        orgId: input.orgId,
        schoolId: input.schoolId,
        academicYearId: input.academicYearId,

        gradeId: input.gradeId ?? "",
        classId: input.classId ?? "",
        studentId: input.studentId,

        threadId: input.threadId,

        priority: "URGENT",
        status: "ACTIVE",

        currentLevel: "TEACHER",
        currentAssignee: input.teacherAssignee,
        currentDeadlineAt: teacherDeadlineAt,

        requestedByUid: uid,
        requestedByPersonId: "",
        requestedByRoleKey: "GUARDIAN",
        requestedByDisplayName: "",

        title: input.title ?? "طلب عاجل",
        initialMessageId: input.initialMessageId ?? "",

        levelStates: [
          {
            level: "TEACHER",
            assignee: input.teacherAssignee,
            startedAt: now,
            deadlineAt: teacherDeadlineAt,
            status: "ACTIVE",
          },
          {
            level: "COUNSELOR",
            status: "PENDING",
          },
          {
            level: "PRINCIPAL",
            status: "PENDING",
          },
          {
            level: "SUPERVISION_HEAD",
            status: "PENDING",
          },
        ],

        temporalWorkflowId: "",
        temporalRunId: "",
        temporalStartStatus: "PENDING",

        createdAt: now,
        updatedAt: now,
      });

      transaction.set(timelineRef, {
        id: timelineRef.id,

        orgId: input.orgId,
        requestId,
        threadId: input.threadId,
        studentId: input.studentId,

        type: "URGENT_REQUEST_CREATED",
        level: "TEACHER",

        actorUid: uid,
        actorRoleKey: "GUARDIAN",

        assignee: input.teacherAssignee,

        title: "تم إنشاء طلب عاجل",
        details: {
          deadlineAt: teacherDeadlineAt,
          initialMessageId: input.initialMessageId ?? "",
        },

        createdAt: now,
      });

      transaction.set(
        threadRef,
        {
          hasActiveUrgentRequest: true,
          activeUrgentRequestId: requestId,
          urgentStatus: "ACTIVE",
          urgentCurrentLevel: "TEACHER",
          urgentCurrentAssigneeUid: input.teacherAssignee.uid,
          urgentCurrentDeadlineAt: teacherDeadlineAt,
          updatedAt: now,
        },
        { merge: true },
      );
    });

    try {
      await startUrgentSlaWorkflow({
        workflowId,
        workflowInput: {
          orgId: input.orgId,
          requestId,
          threadId: input.threadId,
          studentId: input.studentId,
          teacherWaitMs: TEACHER_WAIT_MS,
          counselorWaitMs: COUNSELOR_WAIT_MS,
          principalWaitMs: PRINCIPAL_WAIT_MS,
        },
      });
    } catch {
      const failedAt = Date.now();
      const failedTimelineRef = requestRef.collection("timelineEvents").doc();
      const batch = db.batch();

      batch.set(
        requestRef,
        {
          temporalStartStatus: "FAILED",
          temporalStartError: "Temporal workflow activation failed.",
          updatedAt: failedAt,
        },
        { merge: true },
      );
      batch.set(failedTimelineRef, {
        id: failedTimelineRef.id,
        orgId: input.orgId,
        requestId,
        threadId: input.threadId,
        studentId: input.studentId,
        type: "SYSTEM_NOTE",
        level: "TEACHER",
        title: "تعذر بدء مهلة الرد على الطلب العاجل",
        details: {
          reason: "Temporal workflow activation failed.",
        },
        createdAt: failedAt,
      });

      await batch.commit();

      throw new HttpsError(
        "internal",
        "Urgent workflow activation failed. Please try again.",
      );
    }

    const startedAt = Date.now();
    const startedTimelineRef = requestRef.collection("timelineEvents").doc();
    const startedBatch = db.batch();

    startedBatch.set(
      requestRef,
      {
        temporalWorkflowId: workflowId,
        temporalStartedAt: startedAt,
        temporalStartStatus: "STARTED",
        updatedAt: startedAt,
      },
      { merge: true },
    );
    startedBatch.set(
      threadRef,
      {
        activeUrgentTemporalWorkflowId: workflowId,
        updatedAt: startedAt,
      },
      { merge: true },
    );
    startedBatch.set(startedTimelineRef, {
      id: startedTimelineRef.id,
      orgId: input.orgId,
      requestId,
      threadId: input.threadId,
      studentId: input.studentId,
      type: "SLA_STARTED",
      level: "TEACHER",
      title: "بدأت مهلة الرد على الطلب العاجل",
      details: {
        workflowId,
        taskQueue: URGENT_SLA_TASK_QUEUE,
        teacherWaitMs: TEACHER_WAIT_MS,
        counselorWaitMs: COUNSELOR_WAIT_MS,
        principalWaitMs: PRINCIPAL_WAIT_MS,
      },
      createdAt: startedAt,
    });

    await startedBatch.commit();

    return {
      ok: true,
      requestId,
      threadId: input.threadId,
      status: "ACTIVE",
      currentLevel: "TEACHER",
      currentDeadlineAt: teacherDeadlineAt,
      workflowId,
    };
  },
);
