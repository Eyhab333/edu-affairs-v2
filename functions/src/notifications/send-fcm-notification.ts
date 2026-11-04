import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

type NotificationLogData = {
  id: string;
  orgId: string;

  eventId?: string;

  schoolId?: string;
  academicYearId?: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  gradeId?: string;
  classId?: string;
  targetClassId?: string;

  subjectKey?: string;
  classSubjectOfferingId?: string;

  audienceKind?: string;
  audienceScopeType?: string;
  audienceScopeId?: string;

  recipientKind: string;
  recipientUid?: string;
  recipientPersonId?: string;
  guardianId?: string;
  staffPersonId?: string;
  studentId?: string;

  type: string;

  title: string;
  body: string;

  sourceType?: string;
  sourceId?: string;
  sourcePath?: string;

  targetRoute?: string;
  targetParams?: Record<string, unknown>;

  data?: Record<string, string>;

  channels?: string[];

  status?: string;
};

type DeviceTokenData = {
  id?: string;
  uid?: string;
  personId?: string;
  guardianId?: string;
  staffPersonId?: string;
  fcmToken?: string;
  isActive?: boolean;
};

type ResolvedDeviceToken = {
  id: string;
  fcmToken: string;
  data: DeviceTokenData;
};

const FCM_TOKEN_LIMIT = 500;

export async function sendFcmNotification(
  notification: NotificationLogData,
): Promise<{
  successCount: number;
  failureCount: number;
}> {
  const channels = notification.channels ?? [];

  if (!channels.includes("PUSH")) {
    logger.info("Notification does not include PUSH channel, skipping FCM", {
      orgId: notification.orgId,
      notificationId: notification.id,
    });

    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  const tokens = await resolveDeviceTokens(notification);

  if (!tokens.length) {
    await markNotificationFailed(notification, {
      errorCode: "NO_DEVICE_TOKENS",
      errorMessage: "No active device tokens found for this recipient.",
    });

    logger.info("No device tokens found for notification", {
      orgId: notification.orgId,
      notificationId: notification.id,
      recipientKind: notification.recipientKind,
    });

    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  let successCount = 0;
  let failureCount = 0;

  for (const chunk of chunkArray(tokens, FCM_TOKEN_LIMIT)) {
    const result = await sendFcmChunk(notification, chunk);

    successCount += result.successCount;
    failureCount += result.failureCount;
  }

  const db = getFirestore();
  const notificationRef = db.doc(
    `orgs/${notification.orgId}/notificationLogs/${notification.id}`,
  );

  const now = Date.now();

  const updateData: Record<string, unknown> = {
    status: successCount > 0 ? "SENT" : "FAILED",
    errorCode: successCount > 0 ? "" : "FCM_ALL_FAILED",
    errorMessage: successCount > 0 ? "" : "All FCM delivery attempts failed.",
    updatedAt: now,
  };

  if (successCount > 0) {
    updateData.sentAt = now;
  } else {
    updateData.failedAt = now;
  }

  await notificationRef.update(updateData);

  return {
    successCount,
    failureCount,
  };
}

async function sendFcmChunk(
  notification: NotificationLogData,
  tokens: ResolvedDeviceToken[],
): Promise<{
  successCount: number;
  failureCount: number;
}> {
  const db = getFirestore();

  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((item) => item.fcmToken),
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: {
      ...(notification.data ?? {}),
      notificationId: notification.id,
      eventId: notification.eventId ?? "",
      type: notification.type,
      sourceType: notification.sourceType ?? "",
      sourceId: notification.sourceId ?? "",
      targetRoute: notification.targetRoute ?? "",
    },
    webpush: {
      fcmOptions: {
        link: buildParentWebLink(notification),
      },
    },
  });

  const batch = db.batch();
  const attemptsRef = db.collection(
    `orgs/${notification.orgId}/notificationDeliveryAttempts`,
  );

  response.responses.forEach((item, index) => {
    const token = tokens[index];
    const attemptRef = attemptsRef.doc();

    const errorCode = item.error?.code ?? "";
    const errorMessage = item.error?.message ?? "";

    batch.set(attemptRef, {
      id: attemptRef.id,
      orgId: notification.orgId,

      eventId: notification.eventId ?? "",
      notificationId: notification.id,

      recipientUid: notification.recipientUid ?? "",
      recipientPersonId: notification.recipientPersonId ?? "",

      channel: "PUSH",

      deviceTokenId: token.id,
      fcmToken: token.fcmToken,

      status: item.success ? "SUCCESS" : "FAILED",

      providerMessageId: item.messageId ?? "",

      errorCode,
      errorMessage,

      attemptedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (shouldDisableToken(errorCode)) {
      const tokenRef = db.doc(
        `orgs/${notification.orgId}/deviceTokens/${token.id}`,
      );

      batch.update(tokenRef, {
        isActive: false,
        disabledAt: Date.now(),
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        updatedAt: Date.now(),
      });
    }
  });

  await batch.commit();

  logger.info("FCM chunk sent", {
    orgId: notification.orgId,
    notificationId: notification.id,
    successCount: response.successCount,
    failureCount: response.failureCount,
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

function buildParentWebLink(notification: NotificationLogData): string {
  const base = "https://takween-parent.vercel.app/#";
  const params = notification.targetParams ?? {};
  const read = (key: string) => {
    const value = params[key] ?? notification.data?.[key];
    return typeof value === "string" ? value.trim() : "";
  };

  switch (notification.targetRoute) {
    case "CHAT_CONVERSATION": {
      const threadId = read("threadId");
      return threadId ? `${base}/messages/${encodeURIComponent(threadId)}` : `${base}/messages`;
    }
    case "STUDENT_TRANSPORT": {
      const studentId = read("studentId");
      if (!studentId) return `${base}/notifications`;
      const serviceDate = read("serviceDate");
      const query = serviceDate
        ? `?tab=transport&serviceDate=${encodeURIComponent(serviceDate)}`
        : "?tab=transport";
      return `${base}/students/${encodeURIComponent(studentId)}${query}`;
    }
    case "ANNOUNCEMENT":
      return `${base}/announcements`;
    case "VIRTUAL_CLASS_SESSION": {
      const studentId = read("studentId");
      return studentId ? `${base}/students/${encodeURIComponent(studentId)}` : `${base}/notifications`;
    }
    default:
      return `${base}/notifications`;
  }
}

async function resolveDeviceTokens(
  notification: NotificationLogData,
): Promise<ResolvedDeviceToken[]> {
  const db = getFirestore();
  const collectionRef = db.collection(
    `orgs/${notification.orgId}/deviceTokens`,
  );

  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

  if (notification.recipientUid) {
    queries.push(
      collectionRef.where("uid", "==", notification.recipientUid).get(),
    );
  }

  if (notification.recipientPersonId) {
    queries.push(
      collectionRef
        .where("personId", "==", notification.recipientPersonId)
        .get(),
    );
  }

  if (notification.guardianId) {
    queries.push(
      collectionRef.where("guardianId", "==", notification.guardianId).get(),
    );
  }

  if (notification.staffPersonId) {
    queries.push(
      collectionRef
        .where("staffPersonId", "==", notification.staffPersonId)
        .get(),
    );
  }

  if (!queries.length) return [];

  const snapshots = await Promise.all(queries);
  const byToken = new Map<string, ResolvedDeviceToken>();

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const data = doc.data() as DeviceTokenData;

      if (data.isActive === false) continue;
      if (!data.fcmToken) continue;

      byToken.set(data.fcmToken, {
        id: doc.id,
        fcmToken: data.fcmToken,
        data: {
          ...data,
          id: doc.id,
        },
      });
    }
  }

  return Array.from(byToken.values());
}

async function markNotificationFailed(
  notification: NotificationLogData,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) {
  const db = getFirestore();

  await db
    .doc(`orgs/${notification.orgId}/notificationLogs/${notification.id}`)
    .update({
      status: "FAILED",
      failedAt: Date.now(),
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      updatedAt: Date.now(),
    });
}

function shouldDisableToken(errorCode: string) {
  return [
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ].includes(errorCode);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
