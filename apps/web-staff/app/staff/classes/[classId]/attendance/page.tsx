"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  School,
  Users,
  Save,
  SendHorizontal,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import type {
  Class as SchoolClass,
  MembershipRole,
  Person,
  Student,
  StudentAttendanceBatch,
  StudentAttendanceBatchStudentRow,
  StudentAttendanceStatus,
  StudentEnrollment,
} from "@takween/contracts";
import {
  buildAttendanceBatchDraft,
  calculateAttendanceBatchSummary,
  canSubmitAttendanceBatch,
  canRunOperation,
  submitAttendanceBatch,
  updateAttendanceRowStatus,
  withAttendanceBatchSummary,
} from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { getStaffActorPrimaryRole } from "@/lib/staff-actor";

type AttendanceStudentInput = {
  studentId: string;
  studentDisplayName: string;
  enrollmentId?: string;
};

type LoadState = {
  loading: boolean;
  error: string | null;
};

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

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ATTENDANCE_STATUS_OPTIONS: Array<{
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
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function compactForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function summarizeSubmitErrors(params: {
  generalErrors: string[];
  rowErrors: Record<string, string[]>;
  students: AttendanceStudentInput[];
}) {
  const messages: string[] = [...params.generalErrors];

  const studentNameById = new Map(
    params.students.map((student) => [
      student.studentId,
      student.studentDisplayName || student.studentId,
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

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toDayStartTimestamp(dateInput: string) {
  return new Date(`${dateInput}T00:00:00`).getTime();
}

function toCompactDateKey(dateInput: string) {
  return dateInput.replaceAll("-", "");
}

function getAttendanceStatusLabel(status: StudentAttendanceStatus) {
  return (
    ATTENDANCE_STATUS_OPTIONS.find((item) => item.value === status)?.label ??
    status
  );
}

function getStatusBadgeVariant(status: StudentAttendanceStatus): BadgeVariant {
  if (status === "PRESENT" || status === "REMOTE_PRESENT") return "default";
  if (
    status === "ABSENT" ||
    status === "REMOTE_ABSENT" ||
    status === "NOT_RECORDED"
  ) {
    return "destructive";
  }
  if (
    status === "EXCUSED_ABSENT" ||
    status === "EXCUSED_LATE" ||
    status === "LEFT_EARLY"
  ) {
    return "outline";
  }

  return "secondary";
}

function needsLateMinutes(status: StudentAttendanceStatus) {
  return status === "LATE" || status === "EXCUSED_LATE";
}

function needsLeftEarlyMinutes(status: StudentAttendanceStatus) {
  return status === "LEFT_EARLY";
}

function needsExcuseReason(status: StudentAttendanceStatus) {
  return (
    status === "EXCUSED_LATE" ||
    status === "EXCUSED_ABSENT" ||
    status === "LEFT_EARLY"
  );
}

function normalizeEnrollment(
  id: string,
  data: Record<string, unknown>,
): StudentEnrollment {
  return {
    id,
    ...(data as Omit<StudentEnrollment, "id">),
  };
}

async function loadEnrollmentsFromCollection(params: {
  orgId: string;
  schoolId: string;
  classId: string;
  collectionName: string;
}): Promise<StudentEnrollment[]> {
  try {
    const ref = collection(db, "orgs", params.orgId, params.collectionName);

    const snap = await getDocs(
      query(
        ref,
        where("schoolId", "==", params.schoolId),
        where("classId", "==", params.classId),
      ),
    );

    return snap.docs
      .map((item) => normalizeEnrollment(item.id, item.data()))
      .filter((item) => item.orgId === params.orgId)
      .filter((item) => item.schoolId === params.schoolId)
      .filter((item) => item.classId === params.classId)
      .filter((item) => item.status === "ACTIVE");
  } catch (error) {
    console.warn(`Failed to load ${params.collectionName}`, error);
    return [];
  }
}

async function loadClassEnrollments(params: {
  orgId: string;
  schoolId: string;
  classId: string;
}): Promise<StudentEnrollment[]> {

  const sources = [
  await loadEnrollmentsFromCollection({
    ...params,
    collectionName: "studentEnrollments",
  }),
];

  const unique = new Map<string, StudentEnrollment>();

  for (const list of sources) {
    for (const enrollment of list) {
      unique.set(enrollment.id || enrollment.studentId, enrollment);
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.studentId.localeCompare(b.studentId, "ar"),
  );
}

async function loadPersonName(params: {
  orgId: string;
  personId: string;
}): Promise<string> {
  if (!params.personId) return "";

  try {
    const personRef = doc(db, "orgs", params.orgId, "people", params.personId);

    const personSnap = await getDoc(personRef);

    if (!personSnap.exists()) return "";

    const person = {
      id: personSnap.id,
      ...(personSnap.data() as Omit<Person, "id">),
    };

    return person.displayName || "";
  } catch (error) {
    console.warn("Failed to load person name", error);
    return "";
  }
}

async function loadStudentDisplayName(params: {
  orgId: string;
  schoolId: string;
  studentId: string;
  fallbackName?: string;
}): Promise<string> {
  try {
    const studentRef = doc(
      db,
      "orgs",
      params.orgId,
      "schools",
      params.schoolId,
      "studentDirectory",
      params.studentId,
    );

    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return params.fallbackName || params.studentId;
    }

    const data = studentSnap.data() as Record<string, unknown>;

    const displayName =
      (typeof data.displayName === "string" && data.displayName) ||
      (typeof data.studentDisplayName === "string" &&
        data.studentDisplayName) ||
      (typeof data.name === "string" && data.name) ||
      (typeof data.fullName === "string" && data.fullName) ||
      "";

    return displayName || params.fallbackName || params.studentId;
  } catch (error) {
    console.warn("Failed to load student directory name", error);
    return params.fallbackName || params.studentId;
  }
}

async function loadStudentsDirectly(params: {
  orgId: string;
  schoolId: string;
  classId: string;
}): Promise<AttendanceStudentInput[]> {
  try {
    const studentsRef = collection(db, "orgs", params.orgId, "students");

    const snap = await getDocs(
      query(studentsRef, where("classId", "==", params.classId)),
    );

    return snap.docs.map((item) => {
      const data = item.data() as Omit<Student, "id"> & {
        displayName?: string;
        name?: string;
        enrollmentId?: string;
      };

      return {
        studentId: item.id,
        studentDisplayName: data.displayName || data.name || item.id,
        enrollmentId: data.enrollmentId || "",
      };
    });
  } catch (error) {
    console.warn("Failed to load students directly", error);
    return [];
  }
}

async function loadClassStudents(params: {
  orgId: string;
  schoolId: string;
  classId: string;
}): Promise<AttendanceStudentInput[]> {
  const enrollments = await loadClassEnrollments(params);

  if (enrollments.length) {
    const students = await Promise.all(
      enrollments.map(async (enrollment) => {
        const displayName = await loadStudentDisplayName({
          orgId: params.orgId,
          schoolId: params.schoolId,
          studentId: enrollment.studentId,
        });

        return {
          studentId: enrollment.studentId,
          studentDisplayName: displayName,
          enrollmentId: enrollment.id,
        };
      }),
    );

    return students.sort((a, b) =>
      a.studentDisplayName.localeCompare(b.studentDisplayName, "ar"),
    );
  }

  const directStudents = await loadStudentsDirectly(params);

  return directStudents.sort((a, b) =>
    a.studentDisplayName.localeCompare(b.studentDisplayName, "ar"),
  );
}

function getClassLabel(classInfo: SchoolClass | null, classId: string) {
  return classInfo?.title || classInfo?.code || classId;
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>

        {icon ? (
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ClassAttendancePage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;

  const { actor } = useStaffActor();

  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date()));
  const [students, setStudents] = useState<AttendanceStudentInput[]>([]);
  const [draft, setDraft] = useState<StudentAttendanceBatch | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });

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

  const classInfo =
    actor.visibleClasses.find((item) => item.id === classId) ?? null;

  const roleKey = (getStaffActorPrimaryRole(actor) ||
    actor.roles[0] ||
    "staff") as MembershipRole;

  const classTitle = getClassLabel(classInfo, classId);

  const canViewClass = !!classInfo;

  const canSubmitAttendance = useMemo(() => {
    if (!classInfo) return false;

    return canRunOperation({
      context: {
        actorPersonId: actor.personId || actor.uid,
        orgId: actor.orgId,
        operationalAssignments: actor.operationalAssignments,
      },
      operationKind: "STUDENT_ATTENDANCE",
      permission: "SUBMIT",
      scopeType: "SCHOOL",
      scopeId: classInfo.schoolId,
    });
  }, [
    actor.operationalAssignments,
    actor.orgId,
    actor.personId,
    actor.uid,
    classInfo,
  ]);

  const summary = useMemo(() => {
    if (!draft) {
      return calculateAttendanceBatchSummary([]);
    }

    return calculateAttendanceBatchSummary(draft.studentRows);
  }, [draft]);

  const rebuildDraft = useCallback(
    (nextStudents: AttendanceStudentInput[]) => {
      if (!classInfo) {
        setDraft(null);
        return;
      }

      const dayKey = toCompactDateKey(dateInput);
      const now = Date.now();

      const currentTerm =
        actor.currentTermsByAcademicYear[classInfo.academicYearId];

      const termContext = currentTerm
        ? {
            termId: currentTerm.id,
            termTitle: currentTerm.title,
            termShortTitle: currentTerm.shortTitle,
          }
        : undefined;

      const nextDraft = buildAttendanceBatchDraft({
        id: `attendance_${classInfo.schoolId}_${classInfo.academicYearId}_${classId}_${dayKey}`,

        orgId: actor.orgId,
        schoolId: classInfo.schoolId,
        academicYearId: classInfo.academicYearId,

        termContext,
        schoolDayId: `schoolDay_${classInfo.schoolId}_${classInfo.academicYearId}_${dayKey}`,

        gradeId: classInfo.gradeId ?? "",
        classId,

        scopeType: "CLASS",
        scopeId: classId,

        createdByPersonId: actor.personId || actor.uid,
        createdByRoleKey: roleKey,

        students: nextStudents,

        now,
        defaultStatus: "NOT_RECORDED",
      });

      setDraft(nextDraft);
    },
    [
      actor.orgId,
      actor.personId,
      actor.uid,
      classId,
      classInfo,
      dateInput,
      roleKey,
    ],
  );

  const loadPage = useCallback(async () => {
    if (!classInfo) {
      setLoadState({
        loading: false,
        error: "لا يمكنك فتح حضور هذا الفصل أو أن الفصل غير موجود ضمن نطاقك.",
      });
      return;
    }

    setLoadState({
      loading: true,
      error: null,
    });

    try {
      const loadedStudents = await loadClassStudents({
        orgId: actor.orgId,
        schoolId: classInfo.schoolId,
        classId,
      });

      setStudents(loadedStudents);
      rebuildDraft(loadedStudents);

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, classId, classInfo, rebuildDraft]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    rebuildDraft(students);
  }, [dateInput, rebuildDraft, students]);

  function updateDraftRows(
    updater: (
      rows: StudentAttendanceBatchStudentRow[],
    ) => StudentAttendanceBatchStudentRow[],
  ) {
    setDraft((current) => {
      if (!current) return current;

      return withAttendanceBatchSummary({
        ...current,
        updatedAt: Date.now(),
        studentRows: updater(current.studentRows),
      });
    });
  }

  function handleRowStatusChange(
    studentId: string,
    status: StudentAttendanceStatus,
  ) {
    updateDraftRows((rows) =>
      rows.map((row) =>
        row.studentId === studentId
          ? updateAttendanceRowStatus(row, status)
          : row,
      ),
    );
  }

  function handleRowFieldChange(
    studentId: string,
    field: "lateMinutes" | "leftEarlyMinutes" | "excuseReason" | "note",
    value: string,
  ) {
    updateDraftRows((rows) =>
      rows.map((row) => {
        if (row.studentId !== studentId) return row;

        if (field === "lateMinutes") {
          return {
            ...row,
            lateMinutes: Number.parseInt(value || "0", 10),
          };
        }

        if (field === "leftEarlyMinutes") {
          return {
            ...row,
            leftEarlyMinutes: Number.parseInt(value || "0", 10),
          };
        }

        return {
          ...row,
          [field]: value,
        };
      }),
    );
  }

  function markAllAsPresent() {
    updateDraftRows((rows) =>
      rows.map((row) => updateAttendanceRowStatus(row, "PRESENT")),
    );
  }

  function resetAllRows() {
    updateDraftRows((rows) =>
      rows.map((row) => updateAttendanceRowStatus(row, "NOT_RECORDED")),
    );
  }

  async function handleSaveDraft() {
    if (!draft) return;

    setSaveState({
      saving: true,
      error: null,
      savedAt: null,
    });

    try {
      const now = Date.now();

      const nextDraft = withAttendanceBatchSummary({
        ...draft,
        status: "DRAFT",
        updatedAt: now,
      });

      const batchRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
        nextDraft.id,
      );

      await setDoc(batchRef, compactForFirestore(nextDraft), {
        merge: true,
      });

      setDraft(nextDraft);

      setSaveState({
        saving: false,
        error: null,
        savedAt: now,
      });
    } catch (error) {
      setSaveState({
        saving: false,
        error: getErrorMessage(error),
        savedAt: null,
      });
    }
  }

  async function handleSubmitBatch() {
    if (!draft) return;

    if (!canSubmitAttendance) {
      setSubmitState({
        submitting: false,
        error: "لا تملك صلاحية إرسال حضور هذا الفصل.",
        submittedAt: null,
      });

      return;
    }

    const validation = canSubmitAttendanceBatch(draft, {
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
          students,
        }),
        submittedAt: null,
      });

      return;
    }

    setSubmitState({
      submitting: true,
      error: null,
      submittedAt: null,
    });

    try {
      const now = Date.now();

      const result = submitAttendanceBatch(draft, {
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

      setDraft(result.batch);

      setSaveState({
        saving: false,
        error: null,
        savedAt: now,
      });

      setSubmitState({
        submitting: false,
        error: null,
        submittedAt: now,
      });
    } catch (error) {
      setSubmitState({
        submitting: false,
        error: getErrorMessage(error),
        submittedAt: null,
      });
    }
  }

  if (!canViewClass) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>لا يمكن فتح حضور هذا الفصل</CardTitle>
          <CardDescription>
            الفصل غير موجود ضمن الفصول المرئية لهذا المستخدم.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button asChild variant="outline">
            <Link href="/staff/classes">
              <ArrowRight className="size-4" />
              العودة إلى فصولي
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Milestone 9</Badge>
                <Badge variant="outline">حضور الفصل</Badge>
              </div>

              <h1 className="text-2xl font-bold text-foreground">
                حضور {classTitle}
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/staff/classes/${classId}`}>
                  <ArrowRight className="size-4" />
                  الرجوع للفصل
                </Link>
              </Button>

              <Button type="button" onClick={markAllAsPresent}>
                <CheckCircle2 className="size-4" />
                اعتبار الجميع حاضر
              </Button>

              <Button type="button" variant="outline" onClick={resetAllRows}>
                تصفير الحالات
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={!draft || saveState.saving}
              >
                {saveState.saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                حفظ المسودة
              </Button>

              <Button
                type="button"
                onClick={handleSubmitBatch}
                disabled={
                  !draft ||
                  draft.status === "SUBMITTED" ||
                  saveState.saving ||
                  submitState.submitting
                }
              >
                {submitState.submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <SendHorizontal className="size-4" />
                )}
                إرسال الدفعة
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <CalendarDays className="size-5" />
            </div>

            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                تاريخ الحضور
              </label>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        <SummaryCard
          title="إجمالي الطلاب"
          value={summary.targetCount}
          icon={<Users className="size-5" />}
        />

        <SummaryCard
          title="تم تسجيلهم"
          value={summary.completedCount}
          icon={<CheckCircle2 className="size-5" />}
        />

        <SummaryCard
          title="لم يسجل"
          value={summary.notRecordedCount}
          icon={<Clock3 className="size-5" />}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="حاضر" value={summary.presentCount} />
        <SummaryCard title="غائب" value={summary.absentCount} />
        <SummaryCard title="متأخر" value={summary.lateCount} />
        <SummaryCard title="متأخر بعذر" value={summary.excusedLateCount} />
        <SummaryCard title="غائب بعذر" value={summary.excusedAbsentCount} />
        <SummaryCard title="انصراف مبكر" value={summary.leftEarlyCount} />
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <School className="size-5 text-primary" />
            <CardTitle>طلاب الفصل</CardTitle>
          </div>

          <CardDescription>
            الحالة الافتراضية هي “لم يسجل”، حتى لا يُحسب الطالب حاضرًا قبل إثبات
            الحالة.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loadState.loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل طلاب الفصل...
            </div>
          ) : loadState.error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {loadState.error}
            </div>
          ) : !draft || !draft.studentRows.length ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              لا توجد بيانات طلاب لهذا الفصل حتى الآن.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="px-3 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">الطالب</th>
                    <th className="px-3 py-3 font-medium">الحالة</th>
                    <th className="px-3 py-3 font-medium">الوضع</th>
                    <th className="px-3 py-3 font-medium">دقائق التأخر</th>
                    <th className="px-3 py-3 font-medium">دقائق الانصراف</th>
                    <th className="px-3 py-3 font-medium">سبب العذر</th>
                    <th className="px-3 py-3 font-medium">ملاحظة</th>
                  </tr>
                </thead>

                <tbody>
                  {draft.studentRows.map((row, index) => (
                    <tr key={row.studentId} className="border-t border-border">
                      <td className="px-3 py-3 text-muted-foreground">
                        {index + 1}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {row.studentDisplayName || row.studentId}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.studentId}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={row.status}
                          onChange={(event) =>
                            handleRowStatusChange(
                              row.studentId,
                              event.target.value as StudentAttendanceStatus,
                            )
                          }
                          className="w-18 rounded-xl border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                        >
                          {ATTENDANCE_STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant={getStatusBadgeVariant(row.status)}>
                          {getAttendanceStatusLabel(row.status)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          disabled={!needsLateMinutes(row.status)}
                          value={
                            needsLateMinutes(row.status)
                              ? String(row.lateMinutes || "")
                              : ""
                          }
                          onChange={(event) =>
                            handleRowFieldChange(
                              row.studentId,
                              "lateMinutes",
                              event.target.value,
                            )
                          }
                          placeholder="0"
                          className="w-13 rounded-xl border border-border bg-background px-3 py-2 outline-none disabled:opacity-40 focus:ring-2 focus:ring-ring"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          disabled={!needsLeftEarlyMinutes(row.status)}
                          value={
                            needsLeftEarlyMinutes(row.status)
                              ? String(row.leftEarlyMinutes || "")
                              : ""
                          }
                          onChange={(event) =>
                            handleRowFieldChange(
                              row.studentId,
                              "leftEarlyMinutes",
                              event.target.value,
                            )
                          }
                          placeholder="0"
                          className="w-10 rounded-xl border border-border bg-background px-3 py-2 outline-none disabled:opacity-40 focus:ring-2 focus:ring-ring"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="text"
                          disabled={!needsExcuseReason(row.status)}
                          value={
                            needsExcuseReason(row.status)
                              ? row.excuseReason
                              : ""
                          }
                          onChange={(event) =>
                            handleRowFieldChange(
                              row.studentId,
                              "excuseReason",
                              event.target.value,
                            )
                          }
                          placeholder="سبب العذر"
                          className="w-44 rounded-xl border border-border bg-background px-3 py-2 outline-none disabled:opacity-40 focus:ring-2 focus:ring-ring"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={row.note}
                          onChange={(event) =>
                            handleRowFieldChange(
                              row.studentId,
                              "note",
                              event.target.value,
                            )
                          }
                          placeholder="ملاحظة اختيارية"
                          className="w-52 rounded-xl border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {saveState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            تعذر حفظ المسودة: {saveState.error}
          </CardContent>
        </Card>
      ) : saveState.savedAt ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
            تم حفظ مسودة الحضور بنجاح.
          </CardContent>
        </Card>
      ) : null}

      {submitState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm leading-6 text-destructive">
            تعذر إرسال الدفعة: {submitState.error}
          </CardContent>
        </Card>
      ) : submitState.submittedAt ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-emerald-700 dark:text-emerald-300 md:flex-row md:items-center md:justify-between">
            <span>تم إرسال دفعة الحضور وإنشاء السجلات الفردية بنجاح.</span>

            {draft?.id ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/staff/attendance/batches/${draft.id}`}>
                  عرض الدفعة
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      
    </div>
  );
}
