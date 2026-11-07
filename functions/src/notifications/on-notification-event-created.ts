import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { buildNotificationContent } from "./build-notification-content";
import { resolveRecipients } from "./resolve-recipients";
import { NotificationEventData } from "./types";
import { sendFcmNotification } from "./send-fcm-notification";

try {
  initializeApp();
} catch {
  // initializeApp may already be called from index.ts
}

const REGION = "me-central2";

export const onNotificationEventCreated = onDocumentCreated(
  {
    region: REGION,
    memory: "512MiB",
    minInstances: 0,
    document: "orgs/{orgId}/notificationEvents/{eventId}",
  },
  async (event) => {
    const snap = event.data;

    if (!snap) {
      logger.warn("Notification event trigger fired without snapshot", {
        params: event.params,
      });
      return;
    }

    const db = getFirestore();

    const orgId = event.params.orgId;
    const eventId = event.params.eventId;
    const eventRef = snap.ref;

    const rawData = snap.data() as NotificationEventData;
    const eventData: NotificationEventData = {
      ...rawData,
      id: eventId,
      orgId,
    };

    const canProcess = await db.runTransaction(async (tx) => {
      const latestSnap = await tx.get(eventRef);

      if (!latestSnap.exists) return false;

      const latest = latestSnap.data() as NotificationEventData;

      if (latest.status && latest.status !== "PENDING") {
        logger.info("Notification event skipped because it is not pending", {
          orgId,
          eventId,
          status: latest.status,
        });

        return false;
      }

      tx.update(eventRef, {
        status: "PROCESSING",
        processingStartedAt: Date.now(),
        attemptsCount: FieldValue.increment(1),
        updatedAt: Date.now(),
      });

      return true;
    });

    if (!canProcess) return;

    try {
      if (!eventData.type || !eventData.sourceType || !eventData.sourceId) {
        throw new Error(
          "NotificationEvent is missing type, sourceType, or sourceId.",
        );
      }

      const content = buildNotificationContent(eventData);
      const recipients = await resolveRecipients(eventData);

      if (!recipients.length) {
        await eventRef.update({
          status: "SKIPPED",
          processedAt: Date.now(),
          generatedNotificationCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,
          errorCode: "NO_RECIPIENTS",
          errorMessage:
            "No recipients were resolved for this notification event.",
          updatedAt: Date.now(),
        });

        logger.info("Notification event skipped because no recipients found", {
          orgId,
          eventId,
          type: eventData.type,
        });

        return;
      }

      const notificationsToSend: Array<{
        id: string;
        orgId: string;
        eventId: string;

        schoolId: string;
        academicYearId: string;

        termId: string;
        termTitle: string;
        termShortTitle: string;

        gradeId: string;
        classId: string;
        targetClassId: string;

        subjectKey: string;
        classSubjectOfferingId: string;

        audienceKind: string;
        audienceScopeType: string;
        audienceScopeId: string;

        recipientKind: string;
        recipientUid: string;
        recipientPersonId: string;
        guardianId: string;
        staffPersonId: string;
        studentId: string;
        type: string;
        title: string;
        body: string;
        sourceType: string;
        sourceId: string;
        sourcePath: string;
        targetRoute: string;
        targetParams: Record<string, unknown>;
        data: Record<string, string>;
        channels: string[];
        status: string;
      }> = [];

      const batch = db.batch();
      const logsCollection = db.collection(`orgs/${orgId}/notificationLogs`);

      for (const recipient of recipients) {
        const notificationRef = logsCollection.doc();

        const notificationLog = {
          id: notificationRef.id,
          orgId,

          eventId,

          schoolId: eventData.schoolId ?? "",
          academicYearId: eventData.academicYearId ?? "",

          termId: eventData.termId ?? "",
          termTitle: eventData.termTitle ?? "",
          termShortTitle: eventData.termShortTitle ?? "",

          gradeId: eventData.gradeId ?? "",
          classId: eventData.classId ?? "",
          targetClassId: eventData.targetClassId ?? "",

          subjectKey: eventData.subjectKey ?? "",
          classSubjectOfferingId: eventData.classSubjectOfferingId ?? "",

          audienceKind: eventData.audienceKind ?? "DIRECT_RECIPIENTS",
          audienceScopeType: eventData.audienceScopeType ?? "",
          audienceScopeId: eventData.audienceScopeId ?? "",

          recipientKind: recipient.recipientKind,
          recipientUid: recipient.recipientUid ?? "",
          recipientPersonId: recipient.recipientPersonId ?? "",
          guardianId: recipient.guardianId ?? "",
          staffPersonId: recipient.staffPersonId ?? "",
          studentId: recipient.studentId ?? "",

          type: eventData.type,

          title: content.title,
          body: content.body,

          sourceType: eventData.sourceType,
          sourceId: eventData.sourceId,
          sourcePath: eventData.sourcePath ?? "",

          targetRoute: content.targetRoute,
          targetParams: content.targetParams,

          data: content.data,
          channels: content.channels,

          status: "PENDING",

          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        batch.set(notificationRef, notificationLog);
        notificationsToSend.push(notificationLog);
      }

      batch.update(eventRef, {
        status: "PROCESSED",
        processedAt: Date.now(),
        generatedNotificationCount: recipients.length,
        successfulDeliveryCount: 0,
        failedDeliveryCount: 0,
        errorCode: "",
        errorMessage: "",
        updatedAt: Date.now(),
      });

      await batch.commit();
      let successfulDeliveryCount = 0;
      let failedDeliveryCount = 0;

      for (const notification of notificationsToSend) {
        const result = await sendFcmNotification(notification);

        successfulDeliveryCount += result.successCount;
        failedDeliveryCount += result.failureCount;
      }

      await eventRef.update({
        successfulDeliveryCount,
        failedDeliveryCount,
        updatedAt: Date.now(),
      });
      logger.info("Notification event processed", {
        orgId,
        eventId,
        type: eventData.type,
        recipientsCount: recipients.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown notification error";

      await eventRef.update({
        status: "FAILED",
        failedAt: Date.now(),
        errorCode: "ORCHESTRATOR_FAILED",
        errorMessage: message,
        updatedAt: Date.now(),
      });

      logger.error("Notification event processing failed", {
        orgId,
        eventId,
        error,
      });
    }
  },
);
