type SubmittedMeasurementBatchForCorrection = {
  status?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
};

type VisibleMeasurementClass = {
  id: string;
  schoolId?: string;
  academicYearId?: string;
};

/**
 * Resolves whether a batch belongs to the actor's existing class scope.
 * Current batches require the full school/year/class identity. Older batches
 * that lack both school and academic-year context may use classId only, but
 * only when that classId identifies one visible class context unambiguously.
 */
export function isMeasurementBatchInVisibleClassScope(params: {
  batch: SubmittedMeasurementBatchForCorrection;
  visibleClasses: readonly VisibleMeasurementClass[];
}): boolean {
  const { batch, visibleClasses } = params;

  if (!batch.classId) return false;

  const hasExactVisibleClass = visibleClasses.some(
    (classInfo) =>
      classInfo.id === batch.classId &&
      classInfo.schoolId === batch.schoolId &&
      classInfo.academicYearId === batch.academicYearId,
  );

  if (hasExactVisibleClass) return true;

  const isLegacyBatchWithoutClassContext =
    !batch.schoolId && !batch.academicYearId;

  return (
    isLegacyBatchWithoutClassContext &&
    visibleClasses.filter((classInfo) => classInfo.id === batch.classId)
      .length === 1
  );
}

/**
 * Submitted correction follows the same class scope as measurement visibility.
 */
export function canCorrectSubmittedMeasurementBatch(params: {
  batch: SubmittedMeasurementBatchForCorrection;
  visibleClasses: readonly VisibleMeasurementClass[];
}): boolean {
  return (
    params.batch.status === "SUBMITTED" &&
    isMeasurementBatchInVisibleClassScope(params)
  );
}
