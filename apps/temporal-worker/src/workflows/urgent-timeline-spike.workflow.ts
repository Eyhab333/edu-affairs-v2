import { proxyActivities, sleep } from "@temporalio/workflow";

import type { UrgentTimelineSpikeInput } from "../shared";

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
}>({
  startToCloseTimeout: "1 minute",
});

export async function urgentTimelineSpikeWorkflow(
  input: UrgentTimelineSpikeInput,
) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + input.waitMs;

  await activities.updateUrgentRequestStatus({
    orgId: input.orgId,
    requestId: input.requestId,
    status: "ACTIVE",
    currentLevel: "TEACHER",
    currentDeadlineAt: deadlineAt,
  });

  await activities.writeTimelineEvent({
    orgId: input.orgId,
    requestId: input.requestId,
    type: "SLA_STARTED",
    title: "بدأ الخط الزمني التجريبي",
    details: {
      threadId: input.threadId,
      studentId: input.studentId,
      currentLevel: "TEACHER",
      waitMs: input.waitMs,
    },
  });

  await sleep(input.waitMs);

  await activities.updateUrgentRequestStatus({
    orgId: input.orgId,
    requestId: input.requestId,
    status: "ESCALATED",
    currentLevel: "COUNSELOR",
  });

  await activities.writeTimelineEvent({
    orgId: input.orgId,
    requestId: input.requestId,
    type: "ESCALATED",
    title: "تم التصعيد التجريبي بعد انتهاء المهلة",
    details: {
      from: "TEACHER",
      to: "COUNSELOR",
    },
  });

  return {
    ok: true,
    requestId: input.requestId,
    finalStatus: "ESCALATED",
  };
}