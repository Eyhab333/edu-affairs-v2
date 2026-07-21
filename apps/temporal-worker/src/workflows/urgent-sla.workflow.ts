import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

import type {
  ResponsibleRepliedSignalInput,
  UrgentSlaWorkflowInput,
} from "../shared";

type UrgentLevel =
  | "TEACHER"
  | "COUNSELOR"
  | "PRINCIPAL"
  | "SUPERVISION_HEAD";

export const responsibleRepliedSignal = defineSignal<
  [ResponsibleRepliedSignalInput]
>("responsibleReplied");

const activities = proxyActivities<{
  writeTimelineEvent(input: {
    orgId: string;
    requestId: string;
    type: string;
    title: string;
    details?: Record<string, unknown>;
  }): Promise<{ ok: true; eventId: string; createdAt: number }>;

  updateUrgentRequestStatus(input: {
    orgId: string;
    requestId: string;
    status: string;
    currentLevel: string;
    currentDeadlineAt?: number;
  }): Promise<{ ok: true; updatedAt: number }>;

  markUrgentRequestResponded(input: {
    orgId: string;
    requestId: string;
    threadId: string;
    level: string;
    actorUid: string;
    actorPersonId?: string;
    actorRoleKey?: string;
    actorDisplayName?: string;
    messageId?: string;
    repliedAt?: number;
  }): Promise<{ ok: true; repliedAt: number }>;
}>({
  startToCloseTimeout: "1 minute",
});

async function activateLevel(input: {
  orgId: string;
  requestId: string;
  threadId: string;
  studentId: string;
  level: UrgentLevel;
  status: "ACTIVE" | "ESCALATED";
  deadlineAt?: number;
  fromLevel?: string;
  durationMs?: number;
}) {
  await activities.updateUrgentRequestStatus({
    orgId: input.orgId,
    requestId: input.requestId,
    status: input.status,
    currentLevel: input.level,
    currentDeadlineAt: input.deadlineAt,
  });

  await activities.writeTimelineEvent({
    orgId: input.orgId,
    requestId: input.requestId,
    type: input.fromLevel ? "ESCALATED" : "SLA_STARTED",
    title: input.fromLevel
      ? `تم التصعيد إلى ${input.level}`
      : "بدأ خط الطلب العاجل",
    details: {
      threadId: input.threadId,
      studentId: input.studentId,
      fromLevel: input.fromLevel ?? "",
      toLevel: input.level,
      deadlineAt: input.deadlineAt ?? 0,
      durationMs: input.durationMs ?? 0,
    },
  });
}

export async function urgentSlaWorkflow(input: UrgentSlaWorkflowInput) {
  let responsibleReply: ResponsibleRepliedSignalInput | undefined;

  setHandler(responsibleRepliedSignal, (payload) => {
    if (responsibleReply) return;

    responsibleReply = {
      ...payload,
      repliedAt: payload.repliedAt ?? Date.now(),
    };
  });

  async function waitForReplyOrTimeout(waitMs: number) {
    const replied = await condition(() => responsibleReply !== undefined, waitMs);
    return replied ? responsibleReply : undefined;
  }

  async function stopAsResponded(reply: ResponsibleRepliedSignalInput) {
    await activities.markUrgentRequestResponded({
      orgId: input.orgId,
      requestId: input.requestId,
      threadId: input.threadId,
      level: reply.level,
      actorUid: reply.actorUid,
      actorPersonId: reply.actorPersonId,
      actorRoleKey: reply.actorRoleKey,
      actorDisplayName: reply.actorDisplayName,
      messageId: reply.messageId,
      repliedAt: reply.repliedAt,
    });

    return {
      ok: true,
      requestId: input.requestId,
      finalStatus: "RESPONDED",
      finalLevel: reply.level,
      respondedByUid: reply.actorUid,
    };
  }

  const teacherDeadlineAt = Date.now() + input.teacherWaitMs;

  await activateLevel({
    orgId: input.orgId,
    requestId: input.requestId,
    threadId: input.threadId,
    studentId: input.studentId,
    level: "TEACHER",
    status: "ACTIVE",
    deadlineAt: teacherDeadlineAt,
    durationMs: input.teacherWaitMs,
  });

  const teacherReply = await waitForReplyOrTimeout(input.teacherWaitMs);

  if (teacherReply) {
    return stopAsResponded(teacherReply);
  }

  const counselorDeadlineAt = Date.now() + input.counselorWaitMs;

  await activateLevel({
    orgId: input.orgId,
    requestId: input.requestId,
    threadId: input.threadId,
    studentId: input.studentId,
    level: "COUNSELOR",
    status: "ESCALATED",
    deadlineAt: counselorDeadlineAt,
    fromLevel: "TEACHER",
    durationMs: input.counselorWaitMs,
  });

  const counselorReply = await waitForReplyOrTimeout(input.counselorWaitMs);

  if (counselorReply) {
    return stopAsResponded(counselorReply);
  }

  const principalDeadlineAt = Date.now() + input.principalWaitMs;

  await activateLevel({
    orgId: input.orgId,
    requestId: input.requestId,
    threadId: input.threadId,
    studentId: input.studentId,
    level: "PRINCIPAL",
    status: "ESCALATED",
    deadlineAt: principalDeadlineAt,
    fromLevel: "COUNSELOR",
    durationMs: input.principalWaitMs,
  });

  const principalReply = await waitForReplyOrTimeout(input.principalWaitMs);

  if (principalReply) {
    return stopAsResponded(principalReply);
  }

  await activateLevel({
    orgId: input.orgId,
    requestId: input.requestId,
    threadId: input.threadId,
    studentId: input.studentId,
    level: "SUPERVISION_HEAD",
    status: "ESCALATED",
    fromLevel: "PRINCIPAL",
  });

  return {
    ok: true,
    requestId: input.requestId,
    finalStatus: "ESCALATED",
    finalLevel: "SUPERVISION_HEAD",
  };
}