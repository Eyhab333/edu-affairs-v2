import { Client, Connection } from "@temporalio/client";
import { logger } from "firebase-functions";

type ResponsibleRepliedSignalInput = {
  actorUid: string;
  actorPersonId?: string;
  actorRoleKey?: string;
  actorDisplayName?: string;
  level: "TEACHER" | "COUNSELOR" | "PRINCIPAL" | "SUPERVISION_HEAD";
  messageId?: string;
  repliedAt?: number;
};

export async function signalUrgentResponsibleReplied(input: {
  workflowId: string;
  payload: ResponsibleRepliedSignalInput;
}) {
  const temporalAddress = process.env.TEMPORAL_ADDRESS;
  const temporalNamespace = process.env.TEMPORAL_NAMESPACE || "default";

  if (!temporalAddress) {
    logger.warn("Temporal signal skipped: TEMPORAL_ADDRESS is not configured", {
      workflowId: input.workflowId,
    });
    return {
      ok: false as const,
      skipped: true as const,
      reason: "TEMPORAL_ADDRESS_NOT_CONFIGURED",
    };
  }

  const connection = await Connection.connect({
    address: temporalAddress,
  });

  const client = new Client({
    connection,
    namespace: temporalNamespace,
  });

  const handle = client.workflow.getHandle(input.workflowId);

  await handle.signal("responsibleReplied", input.payload);

  logger.info("Temporal responsibleReplied signal sent", {
    workflowId: input.workflowId,
    level: input.payload.level,
    actorUid: input.payload.actorUid,
  });

  return {
    ok: true as const,
    skipped: false as const,
  };
}