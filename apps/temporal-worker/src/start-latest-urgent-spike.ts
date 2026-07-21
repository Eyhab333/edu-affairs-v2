import { Connection, Client } from "@temporalio/client";
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

import { URGENT_SLA_TASK_QUEUE } from "./shared";
import { urgentTimelineSpikeWorkflow } from "./workflows";

function getArg(name: string, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    path.resolve(process.cwd(), "scripts/service-account.json"),
    path.resolve(process.cwd(), "../../scripts/service-account.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `service-account.json not found. Checked: ${candidates.join(", ")}`,
  );
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountPath = resolveServiceAccountPath();

  const rawServiceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  ) as {
    type?: string;
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (rawServiceAccount.type !== "service_account") {
    throw new Error(`Invalid service account type: ${rawServiceAccount.type}`);
  }

  if (!rawServiceAccount.project_id) {
    throw new Error("Missing project_id in service-account.json");
  }

  if (!rawServiceAccount.client_email) {
    throw new Error("Missing client_email in service-account.json");
  }

  if (!rawServiceAccount.private_key) {
    throw new Error("Missing private_key in service-account.json");
  }

  const serviceAccount: ServiceAccount = {
    projectId: rawServiceAccount.project_id,
    clientEmail: rawServiceAccount.client_email,
    privateKey: rawServiceAccount.private_key,
  };

  initializeApp({
    credential: cert(serviceAccount),
    projectId: rawServiceAccount.project_id,
  });
}

async function main() {
  ensureFirebaseAdmin();

  const orgId = getArg("orgId", "takween");
  const waitMs = Number(getArg("waitMs", "60000"));

  const db = getFirestore();

  const snapshot = await db
    .collection(`orgs/${orgId}/urgentCommunicationRequests`)
    .where("status", "==", "ACTIVE")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error("No ACTIVE urgentCommunicationRequests found");
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  const requestId = doc.id;
  const threadId = String(data.threadId || "");
  const studentId = String(data.studentId || "");

  if (!threadId) {
    throw new Error(`Urgent request ${requestId} is missing threadId`);
  }

  if (!studentId) {
    throw new Error(`Urgent request ${requestId} is missing studentId`);
  }

  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";

  const connection = await Connection.connect({
    address,
  });

  const client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  const workflowId = `urgentTimelineSpike:${orgId}:${requestId}:${Date.now()}`;

  const handle = await client.workflow.start(urgentTimelineSpikeWorkflow, {
    taskQueue: URGENT_SLA_TASK_QUEUE,
    workflowId,
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

  console.log("Started Temporal workflow for latest urgent request ✅");
  console.log({
    workflowId: handle.workflowId,
    requestId,
    threadId,
    studentId,
    waitMs,
  });

  const result = await handle.result();

  console.log("Workflow completed ✅");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to start latest urgent spike");
  console.error(error);
  process.exit(1);
});