"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  School,
  Users,
} from "lucide-react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import type {
  Class as SchoolClass,
  StudentAttendanceBatch,
  StudentAttendanceStatus,
} from "@takween/contracts";

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

type LoadState = {
  loading: boolean;
  error: string | null;
};

type BatchFilter = "ALL" | "DRAFT" | "SUBMITTED" | "INCOMPLETE";

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
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toCompactDateKey(dateInput: string) {
  return dateInput.replaceAll("-", "");
}

function formatDateTime(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  status: StudentAttendanceBatch["status"],
): BadgeVariant {
  if (status === "SUBMITTED" || status === "REVIEWED") return "default";
  if (status === "CANCELLED") return "destructive";
  if (status === "LOCKED") return "outline";
  return "secondary";
}

function getMostImportantIssue(batch: StudentAttendanceBatch) {
  if (batch.notRecordedCount > 0) {
    return `${batch.notRecordedCount} لم يسجل`;
  }

  if (batch.absentCount > 0) {
    return `${batch.absentCount} غياب`;
  }

  if (batch.lateCount > 0) {
    return `${batch.lateCount} تأخر`;
  }

  if (batch.leftEarlyCount > 0) {
    return `${batch.leftEarlyCount} انصراف مبكر`;
  }

  return "مكتملة";
}

function getVisibleClassMap(classes: SchoolClass[]) {
  return new Map(classes.map((item) => [item.id, item]));
}

function getClassLabel(classMap: Map<string, SchoolClass>, classId: string) {
  const classInfo = classMap.get(classId);
  return classInfo?.title || classInfo?.code || classId;
}

function getSchoolLabel(classMap: Map<string, SchoolClass>, classId: string) {
  const classInfo = classMap.get(classId);
  return classInfo?.schoolId || "غير محدد";
}

function isBatchVisibleToActor(
  batch: StudentAttendanceBatch,
  visibleClassIds: Set<string>,
) {
  return visibleClassIds.has(batch.classId);
}

function isBatchForDate(batch: StudentAttendanceBatch, dateInput: string) {
  const dateKey = toCompactDateKey(dateInput);

  return (
    batch.id.includes(dateKey) ||
    batch.schoolDayId.includes(dateKey) ||
    batch.recordedAt?.toString().includes(dateKey) === true
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
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

export default function StaffAttendanceCenterPage() {
  const { actor } = useStaffActor();

  const [batches, setBatches] = useState<StudentAttendanceBatch[]>([]);
  const [dateInput, setDateInput] = useState(() => formatDateInput(new Date()));
  const [filter, setFilter] = useState<BatchFilter>("ALL");
  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });

  const visibleClassIds = useMemo(() => {
    return new Set(actor.visibleClasses.map((item) => item.id));
  }, [actor.visibleClasses]);

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        actor.visibleClasses
          .map((item) => item.schoolId)
          .filter(
            (schoolId): schoolId is string =>
              typeof schoolId === "string" && schoolId.trim().length > 0,
          ),
      ),
    );
  }, [actor.visibleClasses]);

  const classMap = useMemo(() => {
    return getVisibleClassMap(actor.visibleClasses);
  }, [actor.visibleClasses]);

  const loadBatches = useCallback(async () => {
    setLoadState({
      loading: true,
      error: null,
    });

    try {
      if (visibleSchoolIds.length === 0) {
        setBatches([]);
        setLoadState({
          loading: false,
          error: null,
        });
        return;
      }

      const batchesRef = collection(
        db,
        "orgs",
        actor.orgId,
        "studentAttendanceBatches",
      );

      const snapshots = await Promise.all(
        visibleSchoolIds.map((schoolId) =>
          getDocs(
            query(
              batchesRef,

              where("schoolId", "==", schoolId),
              orderBy("updatedAt", "desc"),
              limit(200),
            ),
          ),
        ),
      );

      const loadedBatches = snapshots
        .flatMap((snapshot) => snapshot.docs)
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<StudentAttendanceBatch, "id">),
        }))
        .filter((item) => item.orgId === actor.orgId)
        .filter((item) => visibleSchoolIds.includes(item.schoolId))
        .filter((item) => isBatchVisibleToActor(item, visibleClassIds))
        .sort((a, b) => {
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        })
        .slice(0, 200);

      setBatches(loadedBatches);

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      setBatches([]);

      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, visibleClassIds, visibleSchoolIds]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const dateBatches = useMemo(() => {
    return batches.filter((batch) => isBatchForDate(batch, dateInput));
  }, [batches, dateInput]);

  const filteredBatches = useMemo(() => {
    if (filter === "ALL") return dateBatches;

    if (filter === "DRAFT") {
      return dateBatches.filter((batch) => batch.status === "DRAFT");
    }

    if (filter === "SUBMITTED") {
      return dateBatches.filter(
        (batch) =>
          batch.status === "SUBMITTED" ||
          batch.status === "REVIEWED" ||
          batch.status === "LOCKED",
      );
    }

    return dateBatches.filter(
      (batch) =>
        batch.status !== "CANCELLED" &&
        (batch.notRecordedCount > 0 ||
          batch.completedCount < batch.targetCount),
    );
  }, [dateBatches, filter]);

  const summary = useMemo(() => {
    return dateBatches.reduce(
      (acc, batch) => {
        acc.totalBatches += 1;
        acc.totalStudents += batch.targetCount;
        acc.completedStudents += batch.completedCount;
        acc.notRecorded += batch.notRecordedCount;
        acc.present += batch.presentCount;
        acc.absent += batch.absentCount;
        acc.late += batch.lateCount;
        acc.excusedLate += batch.excusedLateCount;
        acc.excusedAbsent += batch.excusedAbsentCount;
        acc.leftEarly += batch.leftEarlyCount;

        if (batch.status === "DRAFT") acc.drafts += 1;

        if (
          batch.status === "SUBMITTED" ||
          batch.status === "REVIEWED" ||
          batch.status === "LOCKED"
        ) {
          acc.submitted += 1;
        }

        if (
          batch.status !== "CANCELLED" &&
          (batch.notRecordedCount > 0 ||
            batch.completedCount < batch.targetCount)
        ) {
          acc.incomplete += 1;
        }

        return acc;
      },
      {
        totalBatches: 0,
        totalStudents: 0,
        completedStudents: 0,
        notRecorded: 0,
        present: 0,
        absent: 0,
        late: 0,
        excusedLate: 0,
        excusedAbsent: 0,
        leftEarly: 0,
        drafts: 0,
        submitted: 0,
        incomplete: 0,
      },
    );
  }, [dateBatches]);

  const missingClassIds = useMemo(() => {
    const classIdsWithBatch = new Set(
      dateBatches.map((batch) => batch.classId),
    );

    return actor.visibleClasses
      .filter((item) => !classIdsWithBatch.has(item.id))
      .sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id, "ar"));
  }, [actor.visibleClasses, dateBatches]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Milestone 9I</Badge>
                <Badge variant="outline">مركز الحضور</Badge>
              </div>

              <h1 className="text-2xl font-bold">الحضور الدراسي</h1>

              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                مركز عام لمتابعة دفعات الحضور، المسودات، الفصول غير المكتملة،
                والغياب والتأخر حسب الفصول المرئية للمستخدم.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={loadBatches}>
                {loadState.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Clock3 className="size-4" />
                )}
                تحديث
              </Button>

              <Button asChild variant="outline">
                <Link href="/staff/classes">
                  <ArrowRight className="size-4" />
                  فصولي
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="text-sm font-medium">تاريخ الحضور</label>

            <input
              type="date"
              value={dateInput}
              onChange={(event) => setDateInput(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={filter === "ALL" ? "default" : "outline"}
              onClick={() => setFilter("ALL")}
            >
              الكل
            </Button>

            <Button
              type="button"
              variant={filter === "DRAFT" ? "default" : "outline"}
              onClick={() => setFilter("DRAFT")}
            >
              المسودات
            </Button>

            <Button
              type="button"
              variant={filter === "SUBMITTED" ? "default" : "outline"}
              onClick={() => setFilter("SUBMITTED")}
            >
              المرسلة
            </Button>

            <Button
              type="button"
              variant={filter === "INCOMPLETE" ? "default" : "outline"}
              onClick={() => setFilter("INCOMPLETE")}
            >
              غير المكتملة
            </Button>
          </div>
        </CardContent>
      </Card>

      {loadState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            تعذر تحميل دفعات الحضور: {loadState.error}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="دفعات اليوم"
          value={summary.totalBatches}
          description="ضمن الفصول المرئية"
          icon={<FileText className="size-5" />}
        />

        <SummaryCard
          title="مرسلة"
          value={summary.submitted}
          description="SUBMITTED / REVIEWED / LOCKED"
          icon={<CheckCircle2 className="size-5" />}
        />

        <SummaryCard
          title="مسودات"
          value={summary.drafts}
          description="لم ترسل بعد"
          icon={<Clock3 className="size-5" />}
        />

        <SummaryCard
          title="فصول بلا دفعة"
          value={missingClassIds.length}
          description="من الفصول المرئية"
          icon={<School className="size-5" />}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="الطلاب" value={summary.totalStudents} />
        <SummaryCard title="حاضر" value={summary.present} />
        <SummaryCard title="غائب" value={summary.absent} />
        <SummaryCard title="متأخر" value={summary.late} />
        <SummaryCard title="غائب بعذر" value={summary.excusedAbsent} />
        <SummaryCard title="انصراف مبكر" value={summary.leftEarly} />
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            <CardTitle>دفعات الحضور</CardTitle>
          </div>

          <CardDescription>
            يتم عرض آخر 200 دفعة حضور، ثم تصفيتها حسب اليوم والفصول المرئية
            للمستخدم.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loadState.loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل دفعات الحضور...
            </div>
          ) : !filteredBatches.length ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              لا توجد دفعات حضور مطابقة لهذا اليوم أو الفلتر.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="px-3 py-3 font-medium">الفصل</th>
                    <th className="px-3 py-3 font-medium">المدرسة</th>
                    <th className="px-3 py-3 font-medium">الحالة</th>
                    <th className="px-3 py-3 font-medium">الطلاب</th>
                    <th className="px-3 py-3 font-medium">حاضر</th>
                    <th className="px-3 py-3 font-medium">غائب</th>
                    <th className="px-3 py-3 font-medium">متأخر</th>
                    <th className="px-3 py-3 font-medium">الأهم</th>
                    <th className="px-3 py-3 font-medium">آخر تحديث</th>
                    <th className="px-3 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBatches.map((batch) => (
                    <tr key={batch.id} className="border-t border-border">
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {getClassLabel(classMap, batch.classId)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {batch.classId}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {getSchoolLabel(classMap, batch.classId)}
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant={getBatchStatusVariant(batch.status)}>
                          {getBatchStatusLabel(batch.status)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        {batch.completedCount} / {batch.targetCount}
                      </td>

                      <td className="px-3 py-3">{batch.presentCount}</td>
                      <td className="px-3 py-3">{batch.absentCount}</td>
                      <td className="px-3 py-3">{batch.lateCount}</td>

                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            batch.notRecordedCount > 0 || batch.absentCount > 0
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {getMostImportantIssue(batch)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        {formatDateTime(batch.updatedAt)}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/staff/attendance/batches/${batch.id}`}
                            >
                              عرض
                            </Link>
                          </Button>

                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/staff/classes/${batch.classId}/attendance`}
                            >
                              فتح الحضور
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفصول التي لا تملك دفعة لهذا اليوم</CardTitle>
          <CardDescription>
            هذا القسم يساعد الوكيل أو المسؤول على معرفة الفصول التي لم يبدأ
            حضورها بعد.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!missingClassIds.length ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              كل الفصول المرئية لديها دفعة حضور لهذا اليوم.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {missingClassIds.map((item) => (
                <div
                  key={`${item.schoolId}:${item.academicYearId}:${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3"
                >
                  <div>
                    <p className="font-medium">{item.title || item.code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.schoolId} — {item.academicYearId}
                    </p>
                  </div>

                  <Button asChild size="sm" variant="outline">
                    <Link href={`/staff/classes/${item.id}/attendance`}>
                      تسجيل
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حالة الخطوة</CardTitle>
          <CardDescription>
            مركز الحضور العام يعمل الآن للمتابعة اليومية.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">9H عرض دفعة الحضور ✅</Badge>
          <Badge variant="secondary">9I مركز عام للحضور ✅</Badge>
          <Badge variant="outline">Milestone 9 جاهزة للإغلاق التشغيلي</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
