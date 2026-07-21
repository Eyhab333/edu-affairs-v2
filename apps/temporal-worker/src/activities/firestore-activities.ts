import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

let firebaseAdminReady = false;

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    path.resolve(process.cwd(), "scripts/service-account.json"),
    path.resolve(process.cwd(), "../../scripts/service-account.json"),
    path.resolve(__dirname, "../../../../scripts/service-account.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

function ensureFirebaseAdmin() {
  if (firebaseAdminReady && getApps().length > 0) {
    return;
  }

  const serviceAccountPath = resolveServiceAccountPath();

  if (getApps().length === 0) {
    if (serviceAccountPath) {
      const rawServiceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8"),
      ) as {
        type?: string;
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };

      console.log("[temporal-worker] Using Firebase service account file:");
      console.log({
        path: serviceAccountPath,
        type: rawServiceAccount.type,
        project_id: rawServiceAccount.project_id,
        client_email: rawServiceAccount.client_email,
        has_private_key: !!rawServiceAccount.private_key,
      });

      if (rawServiceAccount.type !== "service_account") {
        throw new Error(
          `Invalid service account file: type=${rawServiceAccount.type}`,
        );
      }

      if (!rawServiceAccount.project_id) {
        throw new Error("Invalid service account file: missing project_id");
      }

      if (!rawServiceAccount.client_email) {
        throw new Error("Invalid service account file: missing client_email");
      }

      if (!rawServiceAccount.private_key) {
        throw new Error("Invalid service account file: missing private_key");
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
    } else {
      const projectId =
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        "edu-affairs-dev";

      console.log(
        "[temporal-worker] Using Firebase application default credentials:",
      );
      console.log({
        projectId,
        hasGoogleCloudProject: !!process.env.GOOGLE_CLOUD_PROJECT,
        hasGcloudProject: !!process.env.GCLOUD_PROJECT,
      });

      initializeApp({
        projectId,
      });
    }
  }

  firebaseAdminReady = true;
}

export async function writeTimelineEvent(input: {
  orgId: string;
  requestId: string;
  type: string;
  title: string;
  details?: Record<string, unknown>;
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();

  const eventRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId)
    .collection("timelineEvents")
    .doc();

  await eventRef.set({
    id: eventRef.id,
    orgId: input.orgId,
    requestId: input.requestId,
    type: input.type,
    title: input.title,
    details: input.details ?? {},
    createdAt: now,
  });

  return {
    ok: true as const,
    eventId: eventRef.id,
    createdAt: now,
  };
}

export async function updateUrgentRequestStatus(input: {
  orgId: string;
  requestId: string;
  status: string;
  currentLevel: string;
  currentDeadlineAt?: number;
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();

  const requestRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId);

  await requestRef.set(
    {
      id: input.requestId,
      orgId: input.orgId,
      status: input.status,
      currentLevel: input.currentLevel,
      currentDeadlineAt: input.currentDeadlineAt ?? 0,
      updatedAt: now,
    },
    { merge: true },
  );

  return {
    ok: true as const,
    updatedAt: now,
  };
}

export async function markUrgentRequestResponded(input: {
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
}) {
  ensureFirebaseAdmin();

  const db = getFirestore();
  const now = Date.now();
  const repliedAt = input.repliedAt ?? now;

  const requestRef = db
    .collection(`orgs/${input.orgId}/urgentCommunicationRequests`)
    .doc(input.requestId);

  const threadRef = db
    .collection(`orgs/${input.orgId}/threads`)
    .doc(input.threadId);

  const timelineRef = requestRef.collection("timelineEvents").doc();

  await db.runTransaction(async (transaction) => {
    transaction.set(
      requestRef,
      {
        status: "RESPONDED",
        respondedAt: repliedAt,
        respondedByUid: input.actorUid,
        respondedByPersonId: input.actorPersonId ?? "",
        respondedByRoleKey: input.actorRoleKey ?? "",
        currentLevel: input.level,
        currentDeadlineAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      threadRef,
      {
        hasActiveUrgentRequest: false,
        urgentStatus: "RESPONDED",
        urgentCurrentLevel: input.level,
        urgentCurrentAssigneeUid: "",
        urgentCurrentDeadlineAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(timelineRef, {
      id: timelineRef.id,
      orgId: input.orgId,
      requestId: input.requestId,
      threadId: input.threadId,
      type: "RESPONSIBLE_REPLIED",
      level: input.level,

      actorUid: input.actorUid,
      actorPersonId: input.actorPersonId ?? "",
      actorRoleKey: input.actorRoleKey ?? "",
      actorDisplayName: input.actorDisplayName ?? "",

      messageId: input.messageId ?? "",

      title: "تم الرد على الطلب العاجل",
      details: {
        repliedAt,
      },

      createdAt: now,
    });
  });

  return {
    ok: true as const,
    repliedAt,
  };
}
