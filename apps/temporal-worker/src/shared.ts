export const URGENT_SLA_TASK_QUEUE = "urgent-sla-task-queue";

export type UrgentTimelineSpikeInput = {
  orgId: string;
  requestId: string;
  threadId: string;
  studentId: string;
  waitMs: number;
};

export type UrgentSlaWorkflowInput = {
  orgId: string;
  requestId: string;
  threadId: string;
  studentId: string;

  teacherWaitMs: number;
  counselorWaitMs: number;
  principalWaitMs: number;
};

export type ResponsibleRepliedSignalInput = {
  actorUid: string;
  actorPersonId?: string;
  actorRoleKey?: string;
  actorDisplayName?: string;
  level: "TEACHER" | "COUNSELOR" | "PRINCIPAL" | "SUPERVISION_HEAD";
  messageId?: string;
  repliedAt?: number;
};
