import { NativeConnection, Worker } from "@temporalio/worker";

import { URGENT_SLA_TASK_QUEUE } from "./shared";
import * as activities from "./activities/firestore-activities";

function getTemporalConnectionOptions() {
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const apiKey = process.env.TEMPORAL_API_KEY || "";

  if (!apiKey) {
    return {
      address,
      namespace: process.env.TEMPORAL_NAMESPACE || "default",
      connectionOptions: {
        address,
      },
    };
  }

  return {
    address,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    connectionOptions: {
      address,
      tls: true,
      apiKey,
    },
  };
}

async function main() {
  const temporal = getTemporalConnectionOptions();

  const connection = await NativeConnection.connect(
    temporal.connectionOptions,
  );

  const worker = await Worker.create({
    connection,
    namespace: temporal.namespace,
    taskQueue: URGENT_SLA_TASK_QUEUE,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log("Temporal worker started");
  console.log({
    address: temporal.address,
    namespace: temporal.namespace,
    taskQueue: URGENT_SLA_TASK_QUEUE,
    mode: process.env.TEMPORAL_API_KEY ? "cloud" : "local",
  });

  await worker.run();
}

main().catch((error) => {
  console.error("Temporal worker failed");
  console.error(error);
  process.exit(1);
});