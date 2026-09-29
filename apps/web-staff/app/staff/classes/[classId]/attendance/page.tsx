"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import type {
  Class as SchoolClass,
  MembershipRole,
  StudentAttendanceBatch,
  StudentAttendanceStatus,
} from "@takween/contracts";
import {
  buildAttendanceBatchDraft,
  calculateAttendanceBatchSummary,
} from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { getErrorMessage } from "@/lib/error-message";
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
import { getClassRoster } from "@/lib/class-roster";
import { getStaffActorPrimaryRole } from "@/lib/staff-actor";
import {
  ATTENDANCE_STATUS_OPTIONS,
  AttendanceBatchWorkflowActions,
  needsExcuseReason,
  needsLateMinutes,
  needsLeftEarlyMinutes,
  useAttendanceBatchWorkflow,
} from "@/components/staff/attendance/attendance-batch-workflow";

type AttendanceStudentInput = {
  studentId: string;
  studentDisplayName: string;
  enrollmentId?: string;
};

type LoadState = {
  loading: boolean;
  error: string | null;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

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

async function loadClassStudents(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}): Promise<AttendanceStudentInput[]> {
  const roster = await getClassRoster(params);

  return roster.rows.map((row) => ({
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    studentDisplayName: row.displayName || row.studentId,
  })).sort((a, b) =>
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
  const [draft, setDraft] = useState<StudentAttendanceBatch | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });
  const attendanceLoadRequestRef = useRef(0);
  const workflow = useAttendanceBatchWorkflow({
    batch: draft,
    setBatch: setDraft,
  });

  const classInfo =
    actor.visibleClasses.find((item) => item.id === classId) ?? null;

  const roleKey = (getStaffActorPrimaryRole(actor) ||
    actor.roles[0] ||
    "staff") as MembershipRole;

  const classTitle = getClassLabel(classInfo, classId);

  const canViewClass = !!classInfo;

  const handleDateChange = useCallback((nextDateInput: string) => {
    attendanceLoadRequestRef.current += 1;
    setDraft(null);
    setDateInput(nextDateInput);
  }, []);

  const summary = useMemo(() => {
    if (!draft) {
      return calculateAttendanceBatchSummary([]);
    }

    return calculateAttendanceBatchSummary(draft.studentRows);
  }, [draft]);

  const loadPage = useCallback(async () => {
    const requestId = ++attendanceLoadRequestRef.current;

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
      const dayKey = toCompactDateKey(dateInput);
      const batchId = `attendance_${classInfo.schoolId}_${classInfo.academicYearId}_${classId}_${dayKey}`;
      const batchRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
        batchId,
      );
      const existingBatchSnap = await getDoc(batchRef);

      if (requestId !== attendanceLoadRequestRef.current) return;

      if (existingBatchSnap.exists()) {
        setDraft({
          id: existingBatchSnap.id,
          ...(existingBatchSnap.data() as Omit<StudentAttendanceBatch, "id">),
        });
        setLoadState({
          loading: false,
          error: null,
        });
        return;
      }

      const loadedStudents = await loadClassStudents({
        orgId: actor.orgId,
        schoolId: classInfo.schoolId,
        academicYearId: classInfo.academicYearId,
        classId,
      });

      if (requestId !== attendanceLoadRequestRef.current) return;

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

      setDraft(
        buildAttendanceBatchDraft({
          id: batchId,
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
          students: loadedStudents,
          now,
          defaultStatus: "NOT_RECORDED",
        }),
      );

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== attendanceLoadRequestRef.current) return;

      console.error("Failed to load class attendance:", error);
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [
    actor.currentTermsByAcademicYear,
    actor.orgId,
    actor.personId,
    actor.uid,
    classId,
    classInfo,
    dateInput,
    roleKey,
  ]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

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

              <AttendanceBatchWorkflowActions
                batch={draft}
                workflow={workflow}
              />
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
                onChange={(event) => handleDateChange(event.target.value)}
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
                          disabled={!workflow.canEditAttendance}
                          onChange={(event) =>
                              workflow.handleRowStatusChange(
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
                          disabled={
                            !workflow.canEditAttendance ||
                            !needsLateMinutes(row.status)
                          }
                          value={
                            needsLateMinutes(row.status)
                              ? String(row.lateMinutes || "")
                              : ""
                          }
                          onChange={(event) =>
                              workflow.handleRowFieldChange(
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
                          disabled={
                            !workflow.canEditAttendance ||
                            !needsLeftEarlyMinutes(row.status)
                          }
                          value={
                            needsLeftEarlyMinutes(row.status)
                              ? String(row.leftEarlyMinutes || "")
                              : ""
                          }
                          onChange={(event) =>
                              workflow.handleRowFieldChange(
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
                          disabled={
                            !workflow.canEditAttendance ||
                            !needsExcuseReason(row.status)
                          }
                          value={
                            needsExcuseReason(row.status)
                              ? row.excuseReason
                              : ""
                          }
                          onChange={(event) =>
                              workflow.handleRowFieldChange(
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
                          disabled={!workflow.canEditAttendance}
                          value={row.note}
                          onChange={(event) =>
                              workflow.handleRowFieldChange(
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

      {workflow.saveState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            تعذر حفظ المسودة: {workflow.saveState.error}
          </CardContent>
        </Card>
      ) : workflow.saveState.savedAt ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
            تم حفظ مسودة الحضور بنجاح.
          </CardContent>
        </Card>
      ) : null}

      {workflow.submitState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm leading-6 text-destructive">
            تعذر إرسال الدفعة: {workflow.submitState.error}
          </CardContent>
        </Card>
      ) : workflow.submitState.submittedAt ? (
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
