import { Connection, Client } from "@temporalio/client";

import { URGENT_SLA_TASK_QUEUE } from "./shared";
import { urgentTimelineSpikeWorkflow } from "./workflows";

function getArg(name: string, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

async function main() {
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";

  const connection = await Connection.connect({
    address,
  });

  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  const orgId = getArg("orgId", "takween");
  const requestId = getArg("requestId", `urgent-spike-${Date.now()}`);
  const threadId = getArg("threadId", "temporal-spike-thread");
  const studentId = getArg("studentId", "student-1777289315910");
  const waitMs = Number(getArg("waitMs", "60000"));

  const handle = await client.workflow.start(urgentTimelineSpikeWorkflow, {
    taskQueue: URGENT_SLA_TASK_QUEUE,
    workflowId: `urgentTimelineSpike:${orgId}:${requestId}`,
    args: [
      {
        orgId,
        requestId,
        threadId,
        studentId,
        waitMs,
      },
    ],
  });

  console.log("Started Temporal spike workflow ✅");
  console.log({
    workflowId: handle.workflowId,
    requestId,
    waitMs,
  });

  const result = await handle.result();

  console.log("Workflow completed ✅");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to start spike workflow");
  console.error(error);
  process.exit(1);
});