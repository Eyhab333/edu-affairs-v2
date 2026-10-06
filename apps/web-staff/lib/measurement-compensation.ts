import type { StudentMeasurementBatchStudentRow } from "@takween/contracts";

export type MeasurementCompensationBatch = {
  id: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
  status?: string;
  submittedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  studentRows?: StudentMeasurementBatchStudentRow[];
};

function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getSubmittedAt(batch: MeasurementCompensationBatch) {
  return batch.submittedAt ?? batch.updatedAt ?? batch.createdAt ?? 0;
}

/**
 * Produces calculation-only rows for an original batch. It deliberately leaves
 * stored original rows untouched so absence history remains intact.
 */
export function getEffectiveMeasurementRows(params: {
  originalBatchId: string;
  originalRows: StudentMeasurementBatchStudentRow[];
  compensationBatches: MeasurementCompensationBatch[];
}): StudentMeasurementBatchStudentRow[] {
  const latestCompletedCompensationByStudentId = new Map<
    string,
    { batchId: string; submittedAt: number; row: StudentMeasurementBatchStudentRow }
  >();

  for (const batch of params.compensationBatches) {
    if (
      batch.isCompensationBatch !== true ||
      batch.originalBatchId !== params.originalBatchId ||
      batch.status !== "SUBMITTED"
    ) {
      continue;
    }

    const submittedAt = getSubmittedAt(batch);

    for (const row of batch.studentRows ?? []) {
      if (row.status !== "COMPLETED" || !isFiniteScore(row.score)) continue;

      const existing = latestCompletedCompensationByStudentId.get(row.studentId);
      if (
        !existing ||
        submittedAt > existing.submittedAt ||
        (submittedAt === existing.submittedAt && batch.id > existing.batchId)
      ) {
        latestCompletedCompensationByStudentId.set(row.studentId, {
          batchId: batch.id,
          submittedAt,
          row,
        });
      }
    }
  }

  return params.originalRows.map((originalRow) => {
    if (
      originalRow.status !== "ABSENT" &&
      originalRow.status !== "EXCUSED"
    ) {
      return originalRow;
    }

    const compensation = latestCompletedCompensationByStudentId.get(
      originalRow.studentId,
    )?.row;
    if (!compensation) return originalRow;

    return {
      ...originalRow,
      status: "COMPLETED",
      score: compensation.score,
      maxScore: compensation.maxScore ?? originalRow.maxScore,
      itemScores: compensation.itemScores ?? originalRow.itemScores,
      note: compensation.note ?? originalRow.note,
      recordType: compensation.recordType ?? originalRow.recordType,
      recordId: compensation.recordId ?? originalRow.recordId,
      completed: true,
    };
  });
}
