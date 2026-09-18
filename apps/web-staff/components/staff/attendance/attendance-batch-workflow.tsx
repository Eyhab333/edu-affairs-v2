"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { CheckCircle, Loader2, Save, SendHorizontal } from "lucide-react";
import { doc, setDoc, writeBatch } from "firebase/firestore";

import type {
  StudentAttendanceBatch,
  StudentAttendanceBatchStudentRow,
  StudentAttendanceStatus,
} from "@takween/contracts";
import {
  canManageStudentAttendance,
  canSubmitAttendanceBatch,
  submitAttendanceBatch,
  updateAttendanceRowStatus,
  withAttendanceBatchSummary,
} from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { db } from "@/lib/firebase";

type SaveState = {
  saving: boolean;
  error: string | null;
  savedAt: number | null;
};

type SubmitState = {
  submitting: boolean;
  error: string | null;
  submittedAt: number | null;
};

export const ATTENDANCE_STATUS_OPTIONS: Array<{
  value: StudentAttendanceStatus;
  label: string;
}> = [
  { value: "NOT_RECORDED", label: "لم يسجل" },
  { value: "PRESENT", label: "حاضر" },
  { value: "ABSENT", label: "غائب" },
  { value: "LATE", label: "متأخر" },
  { value: "EXCUSED_LATE", label: "متأخر بعذر" },
  { value: "EXCUSED_ABSENT", label: "غائب بعذر" },
  { value: "LEFT_EARLY", label: "انصراف مبكر" },
  { value: "REMOTE_PRESENT", label: "حاضر عن بعد" },
  { value: "REMOTE_ABSENT", label: "غائب عن بعد" },
  { value: "STUDY_SUSPENDED", label: "تعليق دراسة" },
];

function compactForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function summarizeSubmitErrors(params: {
  generalErrors: string[];
  rowErrors: Record<string, string[]>;
  batch: StudentAttendanceBatch;
}) {
  const messages: string[] = [...params.generalErrors];
  const studentNameById = new Map(
    params.batch.studentRows.map((row) => [
      row.studentId,
      row.studentDisplayName || row.studentId,
    ]),
  );

  for (const [studentId, errors] of Object.entries(params.rowErrors)) {
    const studentName = studentNameById.get(studentId) ?? studentId;

    for (const error of errors) {
      messages.push(`${studentName}: ${error}`);
    }
  }

  return messages.slice(0, 8).join(" — ");
}

export function needsLateMinutes(status: StudentAttendanceStatus) {
  return status === "LATE" || status === "EXCUSED_LATE";
}

export function needsLeftEarlyMinutes(status: StudentAttendanceStatus) {
  return status === "LEFT_EARLY";
}

export function needsExcuseReason(status: StudentAttendanceStatus) {
  return (
    status === "EXCUSED_LATE" ||
    status === "EXCUSED_ABSENT" ||
    status === "LEFT_EARLY"
  );
}

export function useAttendanceBatchWorkflow({
  batch,
  setBatch,
}: {
  batch: StudentAttendanceBatch | null;
  setBatch: Dispatch<SetStateAction<StudentAttendanceBatch | null>>;
}) {
  const { actor } = useStaffActor();
  const [saveState, setSaveState] = useState<SaveState>({
    saving: false,
    error: null,
    savedAt: null,
  });
  const [submitState, setSubmitState] = useState<SubmitState>({
    submitting: false,
    error: null,
    submittedAt: null,
  });

  const canSubmitAttendance = useMemo(() => {
    if (!batch) return false;

    return canManageStudentAttendance({
      context: {
        actorPersonId: actor.personId || actor.uid,
        orgId: actor.orgId,
        memberships: actor.memberships,
        operationalAssignments: actor.operationalAssignments,
      },
      permission: "SUBMIT",
      schoolId: batch.schoolId,
    });
  }, [
    actor.operationalAssignments,
    actor.memberships,
    actor.orgId,
    actor.personId,
    actor.uid,
    batch,
  ]);

  const updateRows = useCallback(
    (
      updater: (
        rows: StudentAttendanceBatchStudentRow[],
      ) => StudentAttendanceBatchStudentRow[],
    ) => {
      setBatch((current) => {
        if (!current) return current;

        return withAttendanceBatchSummary({
          ...current,
          updatedAt: Date.now(),
          studentRows: updater(current.studentRows),
        });
      });
    },
    [setBatch],
  );

  const handleRowStatusChange = useCallback(
    (studentId: string, status: StudentAttendanceStatus) => {
      updateRows((rows) =>
        rows.map((row) =>
          row.studentId === studentId
            ? updateAttendanceRowStatus(row, status)
            : row,
        ),
      );
    },
    [updateRows],
  );

  const handleRowFieldChange = useCallback(
    (
      studentId: string,
      field: "lateMinutes" | "leftEarlyMinutes" | "excuseReason" | "note",
      value: string,
    ) => {
      updateRows((rows) =>
        rows.map((row) => {
          if (row.studentId !== studentId) return row;

          if (field === "lateMinutes" || field === "leftEarlyMinutes") {
            return {
              ...row,
              [field]: Number.parseInt(value || "0", 10),
            };
          }

          return {
            ...row,
            [field]: value,
          };
        }),
      );
    },
    [updateRows],
  );

  const markAllAsPresent = useCallback(() => {
    updateRows((rows) =>
      rows.map((row) => updateAttendanceRowStatus(row, "PRESENT")),
    );
  }, [updateRows]);

  const resetAllRows = useCallback(() => {
    updateRows((rows) =>
      rows.map((row) => updateAttendanceRowStatus(row, "NOT_RECORDED")),
    );
  }, [updateRows]);

  const markAllAsStudySuspended = useCallback(() => {
    updateRows((rows) =>
      rows.map((row) => updateAttendanceRowStatus(row, "STUDY_SUSPENDED")),
    );
  }, [updateRows]);

  const handleSaveDraft = useCallback(async () => {
    if (!batch) return;

    setSaveState({ saving: true, error: null, savedAt: null });

    try {
      const now = Date.now();
      const nextBatch = withAttendanceBatchSummary({
        ...batch,
        status: "DRAFT",
        updatedAt: now,
      });
      const batchRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
        nextBatch.id,
      );

      await setDoc(batchRef, compactForFirestore(nextBatch), { merge: true });
      setBatch(nextBatch);
      setSaveState({ saving: false, error: null, savedAt: now });
    } catch (error) {
      console.error("Failed to save attendance draft:", error);
      setSaveState({
        saving: false,
        error: getErrorMessage(error),
        savedAt: null,
      });
    }
  }, [actor.orgId, batch, setBatch]);

  const handleSubmitBatch = useCallback(async () => {
    if (!batch) return;

    if (!canSubmitAttendance) {
      setSubmitState({
        submitting: false,
        error: "لا تملك صلاحية إرسال حضور هذا الفصل.",
        submittedAt: null,
      });
      return;
    }

    const validation = canSubmitAttendanceBatch(batch, {
      requireAllRowsRecorded: true,
      requireLateMinutes: true,
      requireLeftEarlyMinutes: true,
      requireExcuseReason: true,
    });

    if (!validation.ok) {
      setSubmitState({
        submitting: false,
        error: summarizeSubmitErrors({
          generalErrors: validation.errors,
          rowErrors: validation.rowErrors,
          batch,
        }),
        submittedAt: null,
      });
      return;
    }

    setSubmitState({ submitting: true, error: null, submittedAt: null });

    try {
      const now = Date.now();
      const result = submitAttendanceBatch(batch, {
        now,
        requireAllRowsRecorded: true,
        requireLateMinutes: true,
        requireLeftEarlyMinutes: true,
        requireExcuseReason: true,
      });
      const firestoreBatch = writeBatch(db);
      const batchRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
        result.batch.id,
      );

      firestoreBatch.set(batchRef, compactForFirestore(result.batch), {
        merge: true,
      });

      for (const record of result.records) {
        const recordRef = doc(
          db,
          "orgs",
          actor.orgId,
          "studentAttendanceRecords",
          record.id,
        );
        firestoreBatch.set(recordRef, compactForFirestore(record), {
          merge: true,
        });
      }

      await firestoreBatch.commit();
      setBatch(result.batch);
      setSaveState({ saving: false, error: null, savedAt: now });
      setSubmitState({ submitting: false, error: null, submittedAt: now });
    } catch (error) {
      console.error("Failed to submit attendance:", error);
      setSubmitState({
        submitting: false,
        error: getErrorMessage(error),
        submittedAt: null,
      });
    }
  }, [actor.orgId, batch, canSubmitAttendance, setBatch]);

  return {
    handleRowFieldChange,
    handleRowStatusChange,
    handleSaveDraft,
    handleSubmitBatch,
    markAllAsPresent,
    markAllAsStudySuspended,
    resetAllRows,
    saveState,
    submitState,
  };
}

export function AttendanceBatchWorkflowActions({
  batch,
  workflow,
}: {
  batch: StudentAttendanceBatch | null;
  workflow: ReturnType<typeof useAttendanceBatchWorkflow>;
}) {
  return (
    <>
      <Button type="button" onClick={workflow.markAllAsPresent}>
        <CheckCircle className="size-4" />
        اعتبار الجميع حاضر
      </Button>

      <Button type="button" variant="outline" onClick={workflow.resetAllRows}>
        تصفير الحالات
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={workflow.markAllAsStudySuspended}
      >
        تعليق الدراسة
      </Button>

      <Button
        type="button"
        variant="secondary"
        onClick={workflow.handleSaveDraft}
        disabled={!batch || workflow.saveState.saving}
      >
        {workflow.saveState.saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        حفظ المسودة
      </Button>

      <Button
        type="button"
        onClick={workflow.handleSubmitBatch}
        disabled={
          !batch ||
          batch.status === "SUBMITTED" ||
          workflow.saveState.saving ||
          workflow.submitState.submitting
        }
      >
        {workflow.submitState.submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <SendHorizontal className="size-4" />
        )}
        إرسال الدفعة
      </Button>
    </>
  );
}
