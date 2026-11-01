import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import {
  StudentTransportAttendanceRecordSchema,
  TransportAttendanceBatchSchema,
} from "@takween/contracts";

const REGION = "me-central2";
const FINAL_BATCH_STATUSES = new Set(["SUBMITTED", "REVIEWED", "LOCKED"]);

/** Creates one deterministic guardian-notification event for each final trip record. */
export const onStudentTransportAttendanceRecordCreated = onDocumentCreated(
  {
    region: REGION,
    document: "orgs/{orgId}/studentTransportAttendanceRecords/{recordId}",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const orgId = event.params.orgId;
    const recordId = event.params.recordId;
    const recordResult = StudentTransportAttendanceRecordSchema.safeParse({
      id: recordId,
      ...snapshot.data(),
    });
    if (!recordResult.success || recordResult.data.status === "PENDING") {
      logger.warn("Transport notification skipped for invalid or pending record", {
        orgId,
        recordId,
      });
      return;
    }

    const record = recordResult.data;
    const db = getFirestore();
    const batchSnapshot = await db
      .doc(`orgs/${orgId}/transportAttendanceBatches/${record.batchId}`)
      .get();
    const batchResult = batchSnapshot.exists
      ? TransportAttendanceBatchSchema.safeParse({
          id: batchSnapshot.id,
          ...batchSnapshot.data(),
        })
      : undefined;
    if (
      !batchResult?.success ||
      batchResult.data.orgId !== orgId ||
      !FINAL_BATCH_STATUSES.has(batchResult.data.status)
    ) {
      logger.warn("Transport notification skipped because batch is not final", {
        orgId,
        recordId,
        batchId: record.batchId,
      });
      return;
    }

    const eventId = `transport-attendance_${record.id}`;
    const notificationEventRef = db.doc(
      `orgs/${orgId}/notificationEvents/${eventId}`,
    );
    const now = Date.now();

    try {
      await notificationEventRef.create({
        id: eventId,
        orgId,
        schoolId: record.schoolId,
        academicYearId: record.academicYearId,
        termId: record.termId ?? "",
        termTitle: record.termTitle ?? "",
        termShortTitle: record.termShortTitle ?? "",
        type: "STUDENT_TRANSPORT_ATTENDANCE_RECORDED",
        sourceType: "TRANSPORT_ATTENDANCE_RECORD",
        sourceId: record.id,
        sourcePath: snapshot.ref.path,
        targetStudentId: record.studentId,
        targetRouteId: record.routeId,
        audienceKind: "DIRECT_RECIPIENTS",
        audienceScopeType: "STUDENT",
        audienceScopeId: record.studentId,
        payload: {
          studentName: record.studentDisplayName ?? "الطالب",
          tripKind: record.tripKind,
          status: record.status,
          serviceDate: record.serviceDate,
        },
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });
      logger.info("Transport notification event created", {
        orgId,
        eventId,
        recordId: record.id,
        studentId: record.studentId,
        tripKind: record.tripKind,
      });
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code === 6 || code === "already-exists") {
        logger.info("Transport notification event already exists", {
          orgId,
          eventId,
        });
        return;
      }

      logger.error("Transport notification event creation failed", {
        orgId,
        eventId,
        recordId,
        error,
      });
      throw error;
    }
  },
);
