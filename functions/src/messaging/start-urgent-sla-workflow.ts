import { Client, Connection } from "@temporalio/client";

export const URGENT_SLA_TASK_QUEUE = "urgent-sla-task-queue";

const TEMPORAL_ADDRESS_FALLBACK =
  "quickstart-eahmadq-465a75d9.qa5ir.tmprl.cloud:7233";
const TEMPORAL_NAMESPACE_FALLBACK = "quickstart-eahmadq-465a75d9.qa5ir";

export type UrgentSlaWorkflowInput = {
  orgId: string;
  requestId: string;
  threadId: string;
  studentId: string;
  teacherWaitMs: number;
  counselorWaitMs: number;
  principalWaitMs: number;
};

export async function startUrgentSlaWorkflow(input: {
  workflowId: string;
  workflowInput: UrgentSlaWorkflowInput;
}) {
  const address =
    process.env.TEMPORAL_ADDRESS?.trim() || TEMPORAL_ADDRESS_FALLBACK;
  const namespace =
    process.env.TEMPORAL_NAMESPACE?.trim() || TEMPORAL_NAMESPACE_FALLBACK;
  const apiKey = (process.env.TEMPORAL_API_KEY || "").trim();

  const connection = await Connection.connect(
    apiKey
      ? {
          address,
          tls: true,
          apiKey,
        }
      : {
          address,
        },
  );

  const client = new Client({ connection, namespace });

  await client.workflow.start("urgentSlaWorkflow", {
    taskQueue: URGENT_SLA_TASK_QUEUE,
    workflowId: input.workflowId,
    args: [input.workflowInput],
  });
}
