import { onCall, HttpsError } from "firebase-functions/v2/https";

import {
  StudentTransportAttendanceRecordSchema,
  StudentTransportEnrollmentSchema,
  TransportRouteSchema,
  type StudentTransportAttendanceRecord,
} from "@takween/contracts";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";
const RIYADH_TIME_ZONE = "Asia/Riyadh";
const PAGE_DAYS = 3;
const MAX_RECORDS_PER_PAGE = PAGE_DAYS * 4 + 1;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidServiceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function shiftServiceDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function riyadhServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function activeEnrollment(
  data: { status: string; startsAt?: number; endsAt?: number },
  now: number,
): boolean {
  if (data.status !== "ACTIVE") return false;
  if (typeof data.startsAt === "number" && data.startsAt > now) return false;
  if (typeof data.endsAt === "number" && data.endsAt < now) return false;
  return true;
}

function daysForPage(params: {
  beforeDate: unknown;
  anchorDate: unknown;
}): string[] {
  if (params.beforeDate !== undefined && params.anchorDate !== undefined) {
    throw new HttpsError(
      "invalid-argument",
      "beforeDate and anchorDate cannot be combined.",
    );
  }

  const endDate = params.anchorDate !== undefined
    ? isValidServiceDate(params.anchorDate)
      ? params.anchorDate
      : ""
    : params.beforeDate === undefined
      ? riyadhServiceDate()
      : isValidServiceDate(params.beforeDate)
        ? shiftServiceDate(params.beforeDate, -1)
        : "";

  if (!endDate) {
    throw new HttpsError("invalid-argument", "beforeDate is invalid.");
  }

  return Array.from(
    { length: PAGE_DAYS },
    (_, index) => shiftServiceDate(endDate, -index),
  );
}

function serializeRecord(record: StudentTransportAttendanceRecord) {
  return {
    id: record.id,
    tripKind: record.tripKind,
    status: record.status,
    stopTitle: record.stopTitle ?? "",
    recordedAt: record.recordedAt,
  };
}

/** Reads only submitted transport records for a guardian-linked child. */
export const getMyGuardianTransport = onCall(
  { region: REGION, cors: true },
  async (request) => {
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );
    const serviceDates = daysForPage({
      beforeDate: request.data?.beforeDate,
      anchorDate: request.data?.anchorDate,
    });
    const newestDate = serviceDates[0] ?? "";
    const oldestDate = serviceDates[serviceDates.length - 1] ?? "";
    if (!newestDate || !oldestDate) {
      throw new HttpsError("internal", "Transport date window is unavailable.");
    }
    const db = context.db;

    const [enrollmentsSnapshot, recordsSnapshot, olderRecordsSnapshot] =
      await Promise.all([
        db
          .collection(`orgs/${context.orgId}/studentTransportEnrollments`)
          .where("studentId", "==", context.studentId)
          .limit(20)
          .get(),
        db
          .collection(`orgs/${context.orgId}/studentTransportAttendanceRecords`)
          .where("studentId", "==", context.studentId)
          .where("serviceDate", ">=", oldestDate)
          .where("serviceDate", "<=", newestDate)
          .orderBy("serviceDate", "desc")
          .limit(MAX_RECORDS_PER_PAGE)
          .get(),
        db
          .collection(`orgs/${context.orgId}/studentTransportAttendanceRecords`)
          .where("studentId", "==", context.studentId)
          .where("serviceDate", "<", oldestDate)
          .orderBy("serviceDate", "desc")
          .limit(1)
          .get(),
      ]);

    const now = Date.now();
    const enrollment = enrollmentsSnapshot.docs
      .flatMap((document) => {
        const parsed = StudentTransportEnrollmentSchema.safeParse({
          id: document.id,
          ...document.data(),
        });
        return parsed.success ? [parsed.data] : [];
      })
      .filter((item) => activeEnrollment(item, now))
      .sort((first, second) => second.updatedAt - first.updatedAt)[0];

    const routeSnapshot = enrollment
      ? await db
          .doc(`orgs/${context.orgId}/transportRoutes/${enrollment.routeId}`)
          .get()
      : undefined;
    const parsedRoute = routeSnapshot?.exists
      ? TransportRouteSchema.safeParse({
          id: routeSnapshot.id,
          ...routeSnapshot.data(),
        })
      : undefined;
    const route = parsedRoute?.success ? parsedRoute.data : undefined;
    const supervisorIds = (route?.supervisorPersonIds ?? []).slice(0, 5);
    const supervisorSnapshots = supervisorIds.length
      ? await db.getAll(
          ...supervisorIds.map((personId) =>
            db.doc(`orgs/${context.orgId}/people/${personId}`),
          ),
        )
      : [];
    const supervisorNames = supervisorSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => readString(snapshot.data()?.displayName))
      .filter(Boolean);

    const recordsByDate = new Map<string, StudentTransportAttendanceRecord[]>();
    for (const document of recordsSnapshot.docs) {
      const parsed = StudentTransportAttendanceRecordSchema.safeParse({
        id: document.id,
        ...document.data(),
      });
      if (!parsed.success || parsed.data.studentId !== context.studentId) continue;
      if (parsed.data.status === "PENDING") continue;

      const records = recordsByDate.get(parsed.data.serviceDate) ?? [];
      const existingIndex = records.findIndex(
        (record) => record.tripKind === parsed.data.tripKind,
      );
      const existingRecord =
        existingIndex >= 0 ? records[existingIndex] : undefined;
      if (
        !existingRecord ||
        existingRecord.recordedAt < parsed.data.recordedAt
      ) {
        if (existingIndex >= 0) {
          records[existingIndex] = parsed.data;
        } else {
          records.push(parsed.data);
        }
      }
      recordsByDate.set(parsed.data.serviceDate, records);
    }

    return {
      ok: true,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            routeId: enrollment.routeId,
            routeTitle: enrollment.routeTitle ?? route?.title ?? "",
            pickupStopTitle: enrollment.pickupStopTitle ?? "",
            dropoffStopTitle: enrollment.dropoffStopTitle ?? "",
            supervisorNames,
          }
        : null,
      days: serviceDates.map((serviceDate) => ({
        serviceDate,
        trips: (recordsByDate.get(serviceDate) ?? []).map(serializeRecord),
      })),
      hasMore: !olderRecordsSnapshot.empty,
      nextBeforeDate: !olderRecordsSnapshot.empty ? oldestDate : null,
    };
  },
);
