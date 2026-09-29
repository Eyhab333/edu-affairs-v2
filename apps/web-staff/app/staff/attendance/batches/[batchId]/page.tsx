"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  School,
  Users,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import type {
  StudentAttendanceBatch,
  StudentAttendanceStatus,
} from "@takween/contracts";

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
import {
  ATTENDANCE_STATUS_OPTIONS,
  AttendanceBatchWorkflowActions,
  needsExcuseReason,
  needsLateMinutes,
  needsLeftEarlyMinutes,
  useAttendanceBatchWorkflow,
} from "@/components/staff/attendance/attendance-batch-workflow";

type LoadState = {
  loading: boolean;
  error: string | null;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ATTENDANCE_STATUS_LABELS: Record<StudentAttendanceStatus, string> = {
  NOT_RECORDED: "لم يسجل",
  PRESENT: "حاضر",
  ABSENT: "غائب",
  LATE: "متأخر",
  EXCUSED_LATE: "متأخر بعذر",
  EXCUSED_ABSENT: "غائب بعذر",
  LEFT_EARLY: "انصراف مبكر",
  REMOTE_PRESENT: "حاضر عن بعد",
  REMOTE_ABSENT: "غائب عن بعد",
  STUDY_SUSPENDED: "تعليق دراسة",
};

function formatDateTime(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAttendanceDate(batch: StudentAttendanceBatch) {
  const match = batch.schoolDayId.match(/(\d{4})(\d{2})(\d{2})$/);

  if (match) {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
    }).format(
      new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  const fallbackTimestamp = batch.recordedAt ?? batch.createdAt;

  if (!fallbackTimestamp) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(fallbackTimestamp));
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

function getBatchStatusLabel(status: StudentAttendanceBatch["status"]) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "IN_PROGRESS":
      return "قيد الإدخال";
    case "SUBMITTED":
      return "مرسلة";
    case "REVIEWED":
      return "تمت مراجعتها";
    case "LOCKED":
      return "مقفلة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

function getBatchStatusVariant(
  status: StudentAttendanceBatch["status"]
): BadgeVariant {
  if (status === "SUBMITTED" || status === "REVIEWED") return "default";
  if (status === "CANCELLED") return "destructive";
  if (status === "LOCKED") return "outline";
  return "secondary";
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

export default function AttendanceBatchViewPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;

  const { actor } = useStaffActor();

  const [batch, setBatch] = useState<StudentAttendanceBatch | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });
  const workflow = useAttendanceBatchWorkflow({ batch, setBatch });

  const classInfo = useMemo(() => {
    if (!batch) return null;
    return (
      actor.visibleClasses.find((item) => item.id === batch.classId) ?? null
    );
  }, [actor.visibleClasses, batch]);

  const classTitle =
    classInfo?.title || classInfo?.code || batch?.classId || "فصل غير محدد";

  const loadBatch = useCallback(async () => {
    setLoadState({
      loading: true,
      error: null,
    });

    try {
      const batchRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
        batchId
      );

      const snap = await getDoc(batchRef);

      if (!snap.exists()) {
        setBatch(null);
        setLoadState({
          loading: false,
          error: "لم يتم العثور على دفعة الحضور.",
        });
        return;
      }

      const nextBatch = {
        id: snap.id,
        ...(snap.data() as Omit<StudentAttendanceBatch, "id">),
      };

      if (nextBatch.orgId !== actor.orgId) {
        setBatch(null);
        setLoadState({
          loading: false,
          error: "دفعة الحضور لا تتبع المؤسسة الحالية.",
        });
        return;
      }

      setBatch(nextBatch);

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("Failed to load attendance batch:", error);
      setBatch(null);
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, batchId]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  if (loadState.loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ تحميل دفعة الحضور...
        </CardContent>
      </Card>
    );
  }

  if (loadState.error || !batch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>تعذر عرض دفعة الحضور</CardTitle>
          <CardDescription>
            {loadState.error ?? "حدث خطأ أثناء تحميل الدفعة."}
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
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getBatchStatusVariant(batch.status)}>
                  {getBatchStatusLabel(batch.status)}
                </Badge>
              </div>

              <h1 className="text-2xl font-bold">
                دفعة حضور — {classTitle}
              </h1>

              <p className="text-sm leading-6 text-muted-foreground">
                عرض دفعة الحضور المحفوظة، مع صفوف الطلاب والعدادات الناتجة من
                الدفعة.
              </p>

              <p className="text-sm text-muted-foreground">
                تاريخ الحضور: {formatAttendanceDate(batch)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <AttendanceBatchWorkflowActions
                batch={batch}
                workflow={workflow}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="إجمالي الطلاب"
          value={batch.targetCount}
          icon={<Users className="size-5" />}
        />

        <SummaryCard
          title="تم تسجيلهم"
          value={batch.completedCount}
          icon={<CheckCircle2 className="size-5" />}
        />

        <SummaryCard
          title="لم يسجل"
          value={batch.notRecordedCount}
          icon={<Clock3 className="size-5" />}
        />

        <SummaryCard
          title="تعليق دراسة"
          value={batch.studySuspendedCount ?? 0}
          icon={<School className="size-5" />}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="حاضر" value={batch.presentCount} />
        <SummaryCard title="غائب" value={batch.absentCount} />
        <SummaryCard title="متأخر" value={batch.lateCount} />
        <SummaryCard title="متأخر بعذر" value={batch.excusedLateCount} />
        <SummaryCard title="غائب بعذر" value={batch.excusedAbsentCount} />
        <SummaryCard title="انصراف مبكر" value={batch.leftEarlyCount} />
      </section>

      

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
          <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
            تم إرسال دفعة الحضور وإنشاء السجلات الفردية بنجاح.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>صفوف الطلاب</CardTitle>
          <CardDescription>
            حدد حالة الحضور لكل طالب، ثم احفظ المسودة أو أرسل الدفعة.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!batch.studentRows.length ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              لا توجد صفوف طلاب داخل هذه الدفعة.
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
                  {batch.studentRows.map((row, index) => (
                    <tr key={row.studentId} className="border-t border-border">
                      <td className="px-3 py-3 text-muted-foreground">
                        {index + 1}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {row.studentDisplayName || row.studentId}
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
                          {ATTENDANCE_STATUS_LABELS[row.status]}
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





<details className="rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 font-semibold">
          تفاصيل تقنية
        </summary>

        <div className="grid gap-3 border-t border-border p-5 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">معرّف الدفعة</p>
            <p className="mt-1 break-all font-medium">{batch.id}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">اليوم الدراسي</p>
            <p className="mt-1 break-all font-medium">{batch.schoolDayId}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">معرّف الفصل</p>
            <p className="mt-1 break-all font-medium">{batch.classId}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">معرّف المدرسة</p>
            <p className="mt-1 break-all font-medium">{batch.schoolId}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">معرّف العام الدراسي</p>
            <p className="mt-1 break-all font-medium">{batch.academicYearId}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">الحالة الداخلية</p>
            <p className="mt-1 font-medium">{batch.status}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">وقت الإنشاء</p>
            <p className="mt-1 font-medium">{formatDateTime(batch.createdAt)}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">وقت الإرسال</p>
            <p className="mt-1 font-medium">{formatDateTime(batch.submittedAt)}</p>
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs text-muted-foreground">آخر تحديث</p>
            <p className="mt-1 font-medium">{formatDateTime(batch.updatedAt)}</p>
          </div>
        </div>

        <div className="border-t border-border p-5 text-sm">
          <p className="font-medium">معرّفات سجلات الطلاب</p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border p-3 text-xs">
            {batch.studentRows.map((row) => (
              <div key={row.studentId} className="break-all">
                {row.studentDisplayName || row.studentId}: الطالب {row.studentId}
                {row.recordId ? ` — السجل ${row.recordId}` : ""}
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
