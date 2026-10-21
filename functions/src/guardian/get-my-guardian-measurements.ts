import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";
const GUARDIAN_VISIBLE_BATCH_STATUSES = new Set([
  "SUBMITTED",
  "REVIEWED",
  "LOCKED",
]);

type FirestoreData = Record<string, unknown>;

function readString(data: FirestoreData, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(data: FirestoreData, key: string): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRows(data: FirestoreData): FirestoreData[] {
  return Array.isArray(data.studentRows)
    ? data.studentRows.filter(
        (row): row is FirestoreData => Boolean(row) && typeof row === "object",
      )
    : [];
}

/** Returns finalized batch results only; drafts and incomplete student rows stay staff-only. */
export const getMyGuardianMeasurements = onCall(
  { region: REGION },
  async (request) => {
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );

    const snapshot = await context.db
      .collection(`orgs/${context.orgId}/studentMeasurementBatches`)
      .where("targetStudentIds", "array-contains", context.studentId)
      .get();

    const measurements = snapshot.docs.flatMap((document) => {
      const batch = document.data() as FirestoreData;
      const batchStatus = readString(batch, "status");
      if (!GUARDIAN_VISIBLE_BATCH_STATUSES.has(batchStatus)) return [];

      const row = readRows(batch).find(
        (candidate) => readString(candidate, "studentId") === context.studentId,
      );
      if (!row || readString(row, "status") !== "COMPLETED") return [];

      const score = readNumber(row, "score");
      const maxScore = readNumber(row, "maxScore");
      const percentage =
        score !== null && maxScore !== null && maxScore > 0
          ? (score / maxScore) * 100
          : null;

      return [{
        batchId: document.id,
        recordId: readString(row, "recordId"),
        date:
          readNumber(batch, "measuredAt") ??
          readNumber(batch, "submittedAt") ??
          readNumber(batch, "reviewedAt") ??
          readNumber(batch, "lockedAt") ??
          readNumber(batch, "updatedAt") ??
          readNumber(batch, "createdAt"),
        title: readString(batch, "templateTitle"),
        type:
          readString(batch, "assessmentKind") ||
          readString(batch, "trackerKind") ||
          readString(batch, "batchKind"),
        subject: readString(batch, "subjectKey"),
        batchKind: readString(batch, "batchKind"),
        assessmentKind: readString(batch, "assessmentKind"),
        trackerKind: readString(batch, "trackerKind"),
        assessmentSlot: readString(batch, "assessmentSlot"),
        subjectKey: readString(batch, "subjectKey"),
        score,
        maxScore,
        percentage,
        level: readString(row, "level"),
        result: readString(row, "valueText"),
        valueText: readString(row, "valueText"),
        status: batchStatus,
        isCompensation: batch.isCompensationBatch === true,
      }];
    });

    measurements.sort((first, second) => (second.date ?? 0) - (first.date ?? 0));

    return { ok: true, measurements };
  },
);
