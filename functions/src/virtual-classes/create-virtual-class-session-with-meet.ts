import { randomUUID } from "crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  resolveGoogleMeetCalendarOwner,
} from "../google-workspace/config";
import { createGoogleMeetCalendarEvent } from "../google-workspace/calendar";

type CreateVirtualClassSessionWithMeetInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId: string;
  termTitle: string;
  termShortTitle: string;

  classId: string;
  gradeId?: string;
  streamId?: string;

  subjectKey?: string;
  subjectTitle?: string;
  classSubjectOfferingId?: string;

  title: string;
  description?: string;

  startsAt: number;
  endsAt: number;

  teacherEmail?: string;

  createdByPersonId?: string;
  createdByRoleKey?: string;
};

type StudentEnrollmentRow = {
  id: string;
  studentId?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  status?: string;
};

type GuardianLinkRow = {
  id: string;
  studentId?: string;
  guardianId?: string;
  guardianUid?: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  userId?: string;
  active?: boolean;
};

type GuardianRow = {
  id: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  userId?: string;
};

type GuardianRefsByStudentId = Record<
  string,
  {
    guardianIds: string[];
    guardianUids: string[];
  }
>;

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError(
      "invalid-argument",
      `Missing or invalid field: ${fieldName}`,
    );
  }

  return value.trim();
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireTimestampMs(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new HttpsError(
      "invalid-argument",
      `Missing or invalid timestamp: ${fieldName}`,
    );
  }

  return value;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function readGuardianUid(data: {
  guardianUid?: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  userId?: string;
}) {
  return (
    data.guardianUid?.trim() ||
    data.uid?.trim() ||
    data.authUid?.trim() ||
    data.userUid?.trim() ||
    data.userId?.trim() ||
    ""
  );
}

function buildSessionNotificationBody(params: {
  subjectTitle: string;
  subjectKey: string;
  startsAt: number;
}) {
  const subjectLabel = params.subjectTitle || params.subjectKey || "المادة";

  const startsAtText = new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(params.startsAt));

  return `تم جدولة حصة افتراضية في ${subjectLabel}، موعدها ${startsAtText}.`;
}

async function loadTargetStudentIds(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/studentEnrollments`)
    .where("classId", "==", params.classId)
    .get();

  return uniqueStrings(
    snap.docs
      .map((docSnap) => {
        return {
          id: docSnap.id,
          ...(docSnap.data() as Omit<StudentEnrollmentRow, "id">),
        };
      })
      .filter((item) => item.schoolId === params.schoolId)
      .filter((item) => item.academicYearId === params.academicYearId)
      .filter((item) => !item.status || item.status === "ACTIVE")
      .map((item) => item.studentId ?? ""),
  );
}

async function loadGuardianRefsByStudentId(
  orgId: string,
  studentIds: string[],
): Promise<GuardianRefsByStudentId> {
  const db = getFirestore();

  const result: GuardianRefsByStudentId = {};
  const guardianUidCache: Record<string, string> = {};

  if (studentIds.length === 0) return result;

  const guardianLinksRef = db.collection(`orgs/${orgId}/guardianLinks`);

  for (const chunk of chunkArray(studentIds, 30)) {
    const snap = await guardianLinksRef.where("studentId", "in", chunk).get();

    for (const docSnap of snap.docs) {
      const row = {
        id: docSnap.id,
        ...(docSnap.data() as Omit<GuardianLinkRow, "id">),
      };

      if (!row.studentId || !row.guardianId) continue;
      if (row.active === false) continue;

      const current = result[row.studentId] ?? {
        guardianIds: [],
        guardianUids: [],
      };

      current.guardianIds = uniqueStrings([
        ...current.guardianIds,
        row.guardianId,
      ]);

      const directUid = readGuardianUid(row);

      if (directUid) {
        current.guardianUids = uniqueStrings([
          ...current.guardianUids,
          directUid,
        ]);

        result[row.studentId] = current;
        continue;
      }

      if (!(row.guardianId in guardianUidCache)) {
        const guardianSnap = await db
          .doc(`orgs/${orgId}/guardians/${row.guardianId}`)
          .get();

        if (guardianSnap.exists) {
          const guardianData = {
            id: guardianSnap.id,
            ...(guardianSnap.data() as Omit<GuardianRow, "id">),
          };

          guardianUidCache[row.guardianId] = readGuardianUid(guardianData);
        } else {
          guardianUidCache[row.guardianId] = "";
        }
      }

      const guardianUid = guardianUidCache[row.guardianId];

      if (guardianUid) {
        current.guardianUids = uniqueStrings([
          ...current.guardianUids,
          guardianUid,
        ]);
      }

      result[row.studentId] = current;
    }
  }

  return result;
}

export const createVirtualClassSessionWithMeet = onCall(
  {
    region: "me-central2",
    cors: true,
    secrets: [GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input =
      request.data as Partial<CreateVirtualClassSessionWithMeetInput>;

    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const schoolId = requireNonEmptyString(input.schoolId, "schoolId");
    const academicYearId = requireNonEmptyString(
      input.academicYearId,
      "academicYearId",
    );

    const termId = requireNonEmptyString(input.termId, "termId");
    const termTitle = requireNonEmptyString(input.termTitle, "termTitle");
    const termShortTitle = requireNonEmptyString(
      input.termShortTitle,
      "termShortTitle",
    );

    const classId = requireNonEmptyString(input.classId, "classId");
    const title = requireNonEmptyString(input.title, "title");

    const startsAt = requireTimestampMs(input.startsAt, "startsAt");
    const endsAt = requireTimestampMs(input.endsAt, "endsAt");

    if (endsAt <= startsAt) {
      throw new HttpsError(
        "invalid-argument",
        "endsAt must be greater than startsAt.",
      );
    }

    const createdByPersonId =
      optionalString(input.createdByPersonId) || request.auth.uid;

    const subjectKey = optionalString(input.subjectKey);
    const subjectTitle = optionalString(input.subjectTitle);

    const ownerDecision = resolveGoogleMeetCalendarOwner({
      teacherEmail: input.teacherEmail,
    });

    const targetStudentIds = await loadTargetStudentIds({
      orgId,
      schoolId,
      academicYearId,
      classId,
    });

    const guardianRefsByStudentId = await loadGuardianRefsByStudentId(
      orgId,
      targetStudentIds,
    );

    const db = getFirestore();
    const sessionRef = db
      .collection(`orgs/${orgId}/virtualClassSessions`)
      .doc();

    const batch = db.batch();
    const now = Date.now();

    const conferenceRequestId = `virtual-class-${sessionRef.id}`;

    const notificationTitle = "تم جدولة حصة افتراضية";
    const notificationBody = buildSessionNotificationBody({
      subjectTitle,
      subjectKey,
      startsAt,
    });

    batch.set(sessionRef, {
      id: sessionRef.id,

      orgId,
      schoolId,
      academicYearId,

      termId,
      termTitle,
      termShortTitle,

      classId,
      gradeId: optionalString(input.gradeId),
      streamId: optionalString(input.streamId),

      subjectKey,
      subjectTitle,
      classSubjectOfferingId: optionalString(input.classSubjectOfferingId),

      title,
      description: optionalString(input.description),

      provider: "GOOGLE_MEET",
      providerProvisioningStatus: "PENDING",
      providerProvisioningErrorCode: "",
      providerProvisioningErrorMessage: "",
      providerProvisioningUpdatedAt: now,

      providerMeetingCode: "",
      providerSpaceName: "",
      providerConferenceRecordName: "",

      providerCalendarEventId: "",
      providerCalendarId: "",
      providerCalendarHtmlLink: "",
      providerCalendarOwnerEmail: ownerDecision.calendarOwnerEmail,
      providerOrganizerEmail: "",
      providerConferenceRequestId: conferenceRequestId,

      googleMeetProvisioningMode: ownerDecision.mode,
      googleMeetFallbackReason: ownerDecision.fallbackReason,

      joinUrl: "",

      startsAt,
      endsAt,

      status: "SCHEDULED",

      createdByPersonId,
      createdByRoleKey: optionalString(input.createdByRoleKey),

      targetStudentIds,
      targetCount: targetStudentIds.length,

      attendanceImportStatus: "PENDING",
      attendanceReviewedByPersonId: "",

      recordingUrl: "",
      summaryText: "",

      isArchived: false,

      createdAt: now,
      updatedAt: now,
    });

    targetStudentIds.forEach((studentId) => {
      const participantRef = db
        .collection(`orgs/${orgId}/virtualClassParticipants`)
        .doc();

      batch.set(participantRef, {
        id: participantRef.id,

        orgId,
        sessionId: sessionRef.id,

        studentId,
        guardianIds: guardianRefsByStudentId[studentId]?.guardianIds ?? [],
        guardianUids: guardianRefsByStudentId[studentId]?.guardianUids ?? [],

        joinToken: randomUUID(),
        joinClickedByGuardianId: "",
        joinClickedDeviceId: "",

        providerParticipantName: "",
        providerParticipantEmail: "",
        providerParticipantId: "",

        platformJoinStatus: "SCHEDULED",
        providerAttendanceStatus: "UNKNOWN",
        finalAttendanceStatus: "UNKNOWN",

        reviewedByPersonId: "",
        teacherNote: "",

        createdAt: now,
        updatedAt: now,
      });

      const guardianIds = guardianRefsByStudentId[studentId]?.guardianIds ?? [];
      const guardianUids =
        guardianRefsByStudentId[studentId]?.guardianUids ?? [];

      guardianIds.forEach((guardianId, index) => {
        const notificationRef = db
          .collection(`orgs/${orgId}/virtualClassNotificationLogs`)
          .doc();

        batch.set(notificationRef, {
          id: notificationRef.id,

          orgId,
          sessionId: sessionRef.id,

          studentId,
          guardianId,
          guardianUid: guardianUids[index] ?? "",

          type: "SESSION_SCHEDULED",
          title: notificationTitle,
          body: notificationBody,

          status: "PENDING",

          targetRoute: "STUDENT_VIRTUAL_CLASSES",
          targetStudentId: studentId,
          targetSessionId: sessionRef.id,

          sentAt: now,
          createdAt: now,
          updatedAt: now,
        });
      });
    });

    await batch.commit();

    try {
      const calendarEvent = await createGoogleMeetCalendarEvent({
        calendarOwnerEmail: ownerDecision.calendarOwnerEmail,
        title,
        description: optionalString(input.description),
        startsAt,
        endsAt,
        conferenceRequestId,
        timeZone: "Asia/Riyadh",
      });

      await sessionRef.update({
        providerProvisioningStatus: calendarEvent.ready ? "READY" : "PENDING",
        providerProvisionedAt: calendarEvent.ready ? Date.now() : undefined,
        providerProvisioningUpdatedAt: Date.now(),

        providerMeetingCode: calendarEvent.meetingCode,
        providerCalendarEventId: calendarEvent.eventId,
        providerCalendarId: calendarEvent.calendarId,
        providerCalendarHtmlLink: calendarEvent.htmlLink,
        providerOrganizerEmail: calendarEvent.organizerEmail,

        joinUrl: calendarEvent.meetUrl,

        updatedAt: Date.now(),
      });

      return {
        ok: true,
        sessionId: sessionRef.id,
        targetCount: targetStudentIds.length,
        providerProvisioningStatus: calendarEvent.ready ? "READY" : "PENDING",
        joinUrl: calendarEvent.meetUrl,
        googleMeetProvisioningMode: ownerDecision.mode,
        providerCalendarOwnerEmail: ownerDecision.calendarOwnerEmail,
        googleMeetFallbackReason: ownerDecision.fallbackReason,
      };
    } catch (calendarError: unknown) {
      const message =
        calendarError instanceof Error
          ? calendarError.message
          : "Failed to create Google Meet event.";

      await sessionRef.update({
        providerProvisioningStatus: "FAILED",
        providerProvisioningErrorCode: "GOOGLE_CALENDAR_CREATE_FAILED",
        providerProvisioningErrorMessage: message,
        providerProvisioningUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      });

      return {
        ok: false,
        sessionId: sessionRef.id,
        targetCount: targetStudentIds.length,
        providerProvisioningStatus: "FAILED",
        errorMessage: message,
        googleMeetProvisioningMode: ownerDecision.mode,
        providerCalendarOwnerEmail: ownerDecision.calendarOwnerEmail,
        googleMeetFallbackReason: ownerDecision.fallbackReason,
      };
    }
  },
);
