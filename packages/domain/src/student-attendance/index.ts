import {
  resolveTermContext,
  type TermContextInput,
} from "../term-context";

import type {
  MembershipRole,
  OperationPermission,
  OperationScopeType,
  StudentAttendanceBatch,
  StudentAttendanceBatchRecordRef,
  StudentAttendanceBatchStudentRow,
  StudentAttendanceRecord,
  StudentAttendanceStatus,
} from "@takween/contracts";

import {
  canRunOperation,
  type ActorAccessContext,
} from "../access";

export type AttendanceStudentInput = {
  studentId: string;
  studentDisplayName?: string;
  enrollmentId?: string;
};

export type BuildAttendanceRowsInput = {
  students: AttendanceStudentInput[];
  defaultStatus?: StudentAttendanceStatus;
};

export type BuildAttendanceBatchDraftInput = {
  id: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  schoolDayId: string;
termContext?: TermContextInput;
  gradeId?: string;
  classId: string;

  scopeType?: OperationScopeType;
  scopeId?: string;

  createdByPersonId: string;
  createdByRoleKey: MembershipRole;

  operationalAssignmentId?: string;

  students: AttendanceStudentInput[];

  now: number;
  notes?: string;
  defaultStatus?: StudentAttendanceStatus;
};

export type AttendanceBatchSummary = Pick<
  StudentAttendanceBatch,
  | "targetCount"
  | "completedCount"
  | "missingCount"
  | "notRecordedCount"
  | "presentCount"
  | "absentCount"
  | "lateCount"
  | "excusedLateCount"
  | "excusedAbsentCount"
  | "leftEarlyCount"
  | "remotePresentCount"
  | "remoteAbsentCount"
  | "studySuspendedCount"
>;

export type AttendanceValidationOptions = {
  requireAllRowsRecorded?: boolean;
  requireLateMinutes?: boolean;
  requireLeftEarlyMinutes?: boolean;
  requireExcuseReason?: boolean;
};

export type AttendanceValidationResult = {
  ok: boolean;
  errors: string[];
  rowErrors: Record<string, string[]>;
};

export type BuildAttendanceRecordsOptions = {
  now: number;
  includeNotRecorded?: boolean;
  recordIdFactory?: (
    batch: StudentAttendanceBatch,
    row: StudentAttendanceBatchStudentRow,
  ) => string;
};

export type BuildAttendanceRecordsResult = {
  records: StudentAttendanceRecord[];
  recordRefs: StudentAttendanceBatchRecordRef[];
};

export type SubmitAttendanceBatchResult = BuildAttendanceRecordsResult & {
  batch: StudentAttendanceBatch;
};

function isActiveAdminAssistantMembershipForSchool(params: {
  context: ActorAccessContext;
  schoolId: string;
  nowMs: number;
}): boolean {
  return (params.context.memberships ?? []).some((membership) => {
    const roleKey = membership.roleKey ?? membership.role;

    if (roleKey !== "ADMIN_ASSISTANT") return false;
    if (membership.orgId !== params.context.orgId) return false;
    if (
      membership.personId &&
      membership.personId !== params.context.actorPersonId
    ) {
      return false;
    }
    if (membership.isActive === false) return false;
    if (
      typeof membership.startAt === "number" &&
      membership.startAt > params.nowMs
    ) {
      return false;
    }
    if (
      typeof membership.endAt === "number" &&
      membership.endAt < params.nowMs
    ) {
      return false;
    }

    return (
      membership.scopes?.schoolIds?.includes(params.schoolId) === true ||
      (membership.scopeType === "SCHOOL" &&
        membership.scopeId === params.schoolId)
    );
  });
}

/**
 * Authorizes a student-attendance action at one school. Operational
 * assignments retain their existing semantics; an active, explicitly
 * school-scoped administrative assistant membership is the narrow role-based
 * fallback for school attendance management.
 */
export function canManageStudentAttendance(params: {
  context: ActorAccessContext;
  schoolId: string;
  permission?: OperationPermission;
  nowMs?: number;
}): boolean {
  if (!params.schoolId) return false;

  const permission = params.permission ?? "SUBMIT";

  if (
    canRunOperation({
      context: params.context,
      operationKind: "STUDENT_ATTENDANCE",
      permission,
      scopeType: "SCHOOL",
      scopeId: params.schoolId,
      nowMs: params.nowMs,
    })
  ) {
    return true;
  }

  return isActiveAdminAssistantMembershipForSchool({
    context: params.context,
    schoolId: params.schoolId,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export function isAttendanceRecordedStatus(
  status: StudentAttendanceStatus,
): boolean {
  return status !== "NOT_RECORDED";
}

export function resolveAttendanceRowStatus(
  status: StudentAttendanceStatus,
): StudentAttendanceBatchStudentRow["rowStatus"] {
  if (status === "NOT_RECORDED") return "PENDING";
  return "COMPLETED";
}

export function buildAttendanceRowsForStudents({
  students,
  defaultStatus = "NOT_RECORDED",
}: BuildAttendanceRowsInput): StudentAttendanceBatchStudentRow[] {
  return students.map((student) => {
    const completed = isAttendanceRecordedStatus(defaultStatus);

    return {
      studentId: student.studentId,
      studentDisplayName: student.studentDisplayName ?? "",
      enrollmentId: student.enrollmentId ?? "",
      status: defaultStatus,
      rowStatus: resolveAttendanceRowStatus(defaultStatus),
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "",
      completed,
      recordId: "",
    };
  });
}

export function updateAttendanceRowStatus(
  row: StudentAttendanceBatchStudentRow,
  status: StudentAttendanceStatus,
  options: {
    lateMinutes?: number;
    leftEarlyMinutes?: number;
    excuseReason?: string;
    note?: string;
  } = {},
): StudentAttendanceBatchStudentRow {
  const usesLateMinutes = status === "LATE" || status === "EXCUSED_LATE";
  const usesLeftEarlyMinutes = status === "LEFT_EARLY";
  const usesExcuseReason =
    status === "EXCUSED_LATE" ||
    status === "EXCUSED_ABSENT" ||
    status === "LEFT_EARLY";

  const completed = isAttendanceRecordedStatus(status);

  return {
    ...row,
    status,
    rowStatus: resolveAttendanceRowStatus(status),
    lateMinutes: usesLateMinutes
      ? (options.lateMinutes ?? row.lateMinutes ?? 0)
      : 0,
    leftEarlyMinutes: usesLeftEarlyMinutes
      ? (options.leftEarlyMinutes ?? row.leftEarlyMinutes ?? 0)
      : 0,
    excuseReason: usesExcuseReason
      ? (options.excuseReason ?? row.excuseReason ?? "")
      : "",
    note: options.note ?? row.note ?? "",
    completed,
  };
}

export function markAllAttendanceRows(
  rows: StudentAttendanceBatchStudentRow[],
  status: StudentAttendanceStatus,
): StudentAttendanceBatchStudentRow[] {
  return rows.map((row) => updateAttendanceRowStatus(row, status));
}

export function calculateAttendanceBatchSummary(
  rows: StudentAttendanceBatchStudentRow[],
): AttendanceBatchSummary {
  const summary: AttendanceBatchSummary = {
    targetCount: rows.length,
    completedCount: 0,
    missingCount: 0,

    notRecordedCount: 0,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    excusedLateCount: 0,
    excusedAbsentCount: 0,
    leftEarlyCount: 0,
    remotePresentCount: 0,
    remoteAbsentCount: 0,
    studySuspendedCount: 0,
  };

  for (const row of rows) {
    if (isAttendanceRecordedStatus(row.status)) {
      summary.completedCount += 1;
    } else {
      summary.missingCount += 1;
    }

    switch (row.status) {
      case "NOT_RECORDED":
        summary.notRecordedCount += 1;
        break;
      case "PRESENT":
        summary.presentCount += 1;
        break;
      case "ABSENT":
        summary.absentCount += 1;
        break;
      case "LATE":
        summary.lateCount += 1;
        break;
      case "EXCUSED_LATE":
        summary.excusedLateCount += 1;
        break;
      case "EXCUSED_ABSENT":
        summary.excusedAbsentCount += 1;
        break;
      case "LEFT_EARLY":
        summary.leftEarlyCount += 1;
        break;
      case "REMOTE_PRESENT":
        summary.remotePresentCount += 1;
        break;
      case "REMOTE_ABSENT":
        summary.remoteAbsentCount += 1;
        break;
      case "STUDY_SUSPENDED":
        summary.studySuspendedCount += 1;
        break;
    }
  }

  return summary;
}

export function withAttendanceBatchSummary(
  batch: StudentAttendanceBatch,
): StudentAttendanceBatch {
  return {
    ...batch,
    ...calculateAttendanceBatchSummary(batch.studentRows),
  };
}

export function buildAttendanceBatchDraft(
  input: BuildAttendanceBatchDraftInput,
): StudentAttendanceBatch {
  const studentRows = buildAttendanceRowsForStudents({
    students: input.students,
    defaultStatus: input.defaultStatus ?? "NOT_RECORDED",
  });

  const batch: StudentAttendanceBatch = {
    id: input.id,

    orgId: input.orgId,
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
...resolveTermContext(input.termContext),

    schoolDayId: input.schoolDayId,

    gradeId: input.gradeId ?? "",
    classId: input.classId,

    scopeType: input.scopeType ?? "CLASS",
    scopeId: input.scopeId ?? input.classId,

    status: "DRAFT",
    source: "MANUAL",

    createdByPersonId: input.createdByPersonId,
    createdByRoleKey: input.createdByRoleKey,

    operationalAssignmentId: input.operationalAssignmentId ?? "",

    createdAt: input.now,
    updatedAt: input.now,

    targetStudentIds: studentRows.map((row) => row.studentId),

    targetCount: 0,
    completedCount: 0,
    missingCount: 0,

    notRecordedCount: 0,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    excusedLateCount: 0,
    excusedAbsentCount: 0,
    leftEarlyCount: 0,
    remotePresentCount: 0,
    remoteAbsentCount: 0,
    studySuspendedCount: 0,

    studentRows,
    recordRefs: [],

    notes: input.notes ?? "",
  };

  return withAttendanceBatchSummary(batch);
}

function addRowError(
  rowErrors: Record<string, string[]>,
  studentId: string,
  message: string,
) {
  rowErrors[studentId] = rowErrors[studentId] ?? [];
  rowErrors[studentId].push(message);
}

export function canSubmitAttendanceBatch(
  batch: StudentAttendanceBatch,
  options: AttendanceValidationOptions = {},
): AttendanceValidationResult {
  const {
    requireAllRowsRecorded = true,
    requireLateMinutes = true,
    requireLeftEarlyMinutes = true,
    requireExcuseReason = false,
  } = options;

  const errors: string[] = [];
  const rowErrors: Record<string, string[]> = {};

  if (batch.status === "LOCKED") {
    errors.push("لا يمكن إرسال دفعة حضور مقفلة.");
  }

  if (batch.status === "CANCELLED") {
    errors.push("لا يمكن إرسال دفعة حضور ملغاة.");
  }

  if (!batch.studentRows.length) {
    errors.push("لا توجد صفوف طلاب داخل دفعة الحضور.");
  }

  for (const row of batch.studentRows) {
    if (requireAllRowsRecorded && row.status === "NOT_RECORDED") {
      addRowError(rowErrors, row.studentId, "لم يتم تسجيل حالة حضور الطالب.");
    }

    if (
      requireLateMinutes &&
      (row.status === "LATE" || row.status === "EXCUSED_LATE") &&
      (!row.lateMinutes || row.lateMinutes <= 0)
    ) {
      addRowError(rowErrors, row.studentId, "يجب إدخال دقائق التأخر.");
    }

    if (
      requireLeftEarlyMinutes &&
      row.status === "LEFT_EARLY" &&
      (!row.leftEarlyMinutes || row.leftEarlyMinutes <= 0)
    ) {
      addRowError(rowErrors, row.studentId, "يجب إدخال دقائق الانصراف المبكر.");
    }

    if (
      requireExcuseReason &&
      (row.status === "EXCUSED_LATE" ||
        row.status === "EXCUSED_ABSENT" ||
        row.status === "LEFT_EARLY") &&
      !row.excuseReason.trim()
    ) {
      addRowError(rowErrors, row.studentId, "يجب إدخال سبب العذر.");
    }
  }

  return {
    ok: errors.length === 0 && Object.keys(rowErrors).length === 0,
    errors,
    rowErrors,
  };
}

function defaultAttendanceRecordId(
  batch: StudentAttendanceBatch,
  row: StudentAttendanceBatchStudentRow,
) {
  return `${batch.id}_${row.studentId}`;
}

export function buildAttendanceRecordsFromBatch(
  batch: StudentAttendanceBatch,
  options: BuildAttendanceRecordsOptions,
): BuildAttendanceRecordsResult {
  const records: StudentAttendanceRecord[] = [];
  const recordRefs: StudentAttendanceBatchRecordRef[] = [];

  for (const row of batch.studentRows) {
    if (!options.includeNotRecorded && row.status === "NOT_RECORDED") {
      recordRefs.push({
        studentId: row.studentId,
        recordId: "",
        status: "MISSING",
      });
      continue;
    }

    const recordId =
      row.recordId ||
      options.recordIdFactory?.(batch, row) ||
      defaultAttendanceRecordId(batch, row);

    const record: StudentAttendanceRecord = {
      id: recordId,

      orgId: batch.orgId,
      schoolId: batch.schoolId,
      academicYearId: batch.academicYearId,

...resolveTermContext(batch),

      schoolDayId: batch.schoolDayId,

      studentId: row.studentId,
      enrollmentId: row.enrollmentId ?? "",
      gradeId: batch.gradeId ?? "",
      classId: batch.classId ?? "",

      status: row.status,
      source: batch.source,

      batchId: batch.id,

      recordedByPersonId: batch.createdByPersonId,
      recorderRoleKey: batch.createdByRoleKey,

      recordedAt: batch.recordedAt ?? options.now,

      lateMinutes: row.lateMinutes ?? 0,
      leftEarlyMinutes: row.leftEarlyMinutes ?? 0,
      excuseReason: row.excuseReason ?? "",

      note: row.note ?? "",

      createdAt: options.now,
      updatedAt: options.now,
    };

    records.push(record);

    recordRefs.push({
      studentId: row.studentId,
      recordId,
      status: "COMPLETED",
    });
  }

  return {
    records,
    recordRefs,
  };
}

export function submitAttendanceBatch(
  batch: StudentAttendanceBatch,
  options: BuildAttendanceRecordsOptions & AttendanceValidationOptions,
): SubmitAttendanceBatchResult {
  const validation = canSubmitAttendanceBatch(batch, options);

  if (!validation.ok) {
    throw new Error("لا يمكن إرسال دفعة الحضور قبل اكتمال بياناتها.");
  }

  const { records, recordRefs } = buildAttendanceRecordsFromBatch(
    batch,
    options,
  );

  const nextRows = batch.studentRows.map((row) => {
    const ref = recordRefs.find((item) => item.studentId === row.studentId);

    return {
      ...row,
      rowStatus:
        row.status === "NOT_RECORDED"
          ? "PENDING"
          : ("COMPLETED" as StudentAttendanceBatchStudentRow["rowStatus"]),
      completed: row.status !== "NOT_RECORDED",
      recordId: ref?.recordId ?? row.recordId ?? "",
    };
  });

  const submittedBatch = withAttendanceBatchSummary({
    ...batch,
    status: "SUBMITTED",
    recordedAt: batch.recordedAt ?? options.now,
    submittedAt: options.now,
    updatedAt: options.now,
    studentRows: nextRows,
    recordRefs,
  });

  return {
    batch: submittedBatch,
    records,
    recordRefs,
  };
}
