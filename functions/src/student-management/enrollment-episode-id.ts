export function baseEnrollmentId(params: {
  academicYearId: string;
  schoolId: string;
  classId: string;
  studentId: string;
}) {
  return `${params.academicYearId}*${params.schoolId}*${params.classId}_${params.studentId}`;
}

export function resolveEnrollmentEpisodeId(params: {
  baseEnrollmentId: string;
  operationId: string;
  baseDocumentExists: boolean;
}) {
  return params.baseDocumentExists
    ? `${params.baseEnrollmentId}__${params.operationId}`
    : params.baseEnrollmentId;
}
