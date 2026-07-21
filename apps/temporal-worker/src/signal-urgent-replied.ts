import { Connection, Client } from "@temporalio/client";

import { responsibleRepliedSignal } from "./workflows/urgent-sla.workflow";

function getArg(name: string, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

async function main() {
  const workflowId = getArg("workflowId");

  if (!workflowId) {
    throw new Error("Missing --workflowId");
  }

  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const apiKey = process.env.TEMPORAL_API_KEY || "";

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

  const client = new Client({
    connection,
    namespace,
  });

  const handle = client.workflow.getHandle(workflowId);

  await handle.signal(responsibleRepliedSignal, {
    actorUid: getArg("actorUid", "local-teacher-test"),
    actorPersonId: getArg("actorPersonId", "local-teacher-person"),
    actorRoleKey: getArg("actorRoleKey", "teacher"),
    actorDisplayName: getArg("actorDisplayName", "معلم تجريبي"),
    level: getArg("level", "TEACHER") as
      | "TEACHER"
      | "COUNSELOR"
      | "PRINCIPAL"
      | "SUPERVISION_HEAD",
    messageId: getArg("messageId", `local-message-${Date.now()}`),
    repliedAt: Date.now(),
  });

  console.log("Responsible replied signal sent ✅");
  console.log({
    workflowId,
    temporalAddress: address,
    temporalNamespace: namespace,
    temporalMode: apiKey ? "cloud" : "local",
  });
}

main().catch((error) => {
  console.error("Failed to send responsible replied signal");
  console.error(error);
  process.exit(1);
});
