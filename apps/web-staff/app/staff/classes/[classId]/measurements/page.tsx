"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  FileText,
  Plus,
  RefreshCw,
  Target,
  UsersRound,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import type { StudentMeasurementBatch } from "@takween/contracts";

import { db } from "@/lib/firebase";
import { getFriendlyMeasurementLabel } from "@/lib/measurement-presentation";
import { useStaffActor } from "@/components/staff/staff-actor-provider";

type StaffVisibleClass = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  streamId?: string;
  code?: string;
  title?: string;
  sectionLabel?: string;
  order?: number;
  capacity?: number;
  studentCount?: number;
  studentsCount?: number;
  enrolledStudentCount?: number;
  schoolName?: string;
  gradeTitle?: string;
  academicYearTitle?: string;
};

type StaffActorLike = {
  orgId?: string;
  visibleClasses?: StaffVisibleClass[];
};

type MeasurementBatchDoc = StudentMeasurementBatch & {
  id: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
  compensationReason?: string;
};

type LoadingState = "idle" | "loading" | "success" | "error";

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getClassTitle(item: StaffVisibleClass) {
  return item.title || item.code || "فصل دراسي";
}

function matchesRequestedClass(
  item: StaffVisibleClass,
  classId: string,
  schoolId: string | null,
  academicYearId: string | null,
) {
  if (item.id !== classId) return false;

  if (schoolId && item.schoolId !== schoolId) return false;
  if (academicYearId && item.academicYearId !== academicYearId) return false;

  return true;
}

function buildClassQuery(item: StaffVisibleClass) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const queryString = params.toString();

  return queryString ? `?${queryString}` : "";
}

function buildClassHref(item: StaffVisibleClass) {
  return `/staff/classes/${encodeURIComponent(item.id)}${buildClassQuery(item)}`;
}

function buildStudentsHref() {
  return "/staff/students";
}

function buildBatchNewHref(item: StaffVisibleClass) {
  return `/staff/classes/${encodeURIComponent(
    item.id,
  )}/measurements/batches/new${buildClassQuery(item)}`;
}

function buildBatchViewHref(batchId: string) {
  return `/staff/measurements/batches/${batchId}`;
}

function buildBatchEditHref(batchId: string) {
  return `/staff/measurements/batches/${batchId}/edit`;
}

function buildLearningLossHref(item: StaffVisibleClass) {
  const params = new URLSearchParams();

  if (item.id) params.set("classId", item.id);
  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const queryString = params.toString();

  return `/staff/learning-loss${queryString ? `?${queryString}` : ""}`;
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function getBatchKindLabel(value?: string) {
  switch (value) {
    case "ASSESSMENT":
      return "قياس رسمي";
    case "TRACKER":
      return "متابعة";
    case "KG_VALUES":
      return "قيم";
    case "KG_CORNERS":
      return "أركان";
    case "KG_QURAN":
      return "قرآن";
    case "LEARNING_LOSS_TRACKER":
      return "متابعة فاقد";
    case "CUSTOM":
      return "مخصص";
    default:
      return "قياس أو متابعة";
  }
}

function getBatchStatusLabel(value?: string) {
  switch (value) {
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
      return "غير محدد";
  }
}

function getBatchStatusTone(value?: string) {
  switch (value) {
    case "DRAFT":
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "SUBMITTED":
    case "REVIEWED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
    case "LOCKED":
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
    case "CANCELLED":
      return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

function isEditableBatch(batch: MeasurementBatchDoc) {
  return batch.status === "DRAFT" || batch.status === "IN_PROGRESS";
}

function isSameClassContext(batch: MeasurementBatchDoc, classInfo: StaffVisibleClass) {
  if (batch.classId !== classInfo.id) return false;

  if (classInfo.schoolId && batch.schoolId && batch.schoolId !== classInfo.schoolId) {
    return false;
  }

  if (
    classInfo.academicYearId &&
    batch.academicYearId &&
    batch.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  return true;
}

export default function StaffClassMeasurementsPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;

  const classId = decodeURIComponent(getParamValue(params.classId));
  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");

  const [batchesStatus, setBatchesStatus] = useState<LoadingState>("idle");
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [batches, setBatches] = useState<MeasurementBatchDoc[]>([]);

  const classes = useMemo(() => {
    return staffActor?.visibleClasses ?? [];
  }, [staffActor]);

  const classInfo = useMemo(() => {
    return (
      classes.find((item) =>
        matchesRequestedClass(item, classId, schoolId, academicYearId),
      ) ??
      classes.find((item) => item.id === classId) ??
      null
    );
  }, [classes, classId, schoolId, academicYearId]);

  const resolvedOrgId = classInfo?.orgId || staffActor?.orgId || "";

  const loadBatches = useCallback(async () => {
    if (!resolvedOrgId || !classInfo) return;

    setBatchesStatus("loading");
    setBatchesError(null);

    try {
      const batchesRef = collection(
        db,
        "orgs",
        resolvedOrgId,
        "studentMeasurementBatches",
      );

      const batchesQuery = query(
        batchesRef,
        where("classId", "==", classInfo.id),
      );

      const batchesSnap = await getDocs(batchesQuery);

      const loadedBatches = batchesSnap.docs
        .map((item) => {
          return {
            id: item.id,
            ...(item.data() as Omit<MeasurementBatchDoc, "id">),
          };
        })
        .filter((item) => isSameClassContext(item, classInfo))
        .sort((a, b) => {
          const aDate = a.updatedAt ?? a.createdAt ?? a.measuredAt ?? 0;
          const bDate = b.updatedAt ?? b.createdAt ?? b.measuredAt ?? 0;

          return bDate - aDate;
        });

      setBatches(loadedBatches);
      setBatchesStatus("success");
    } catch (error: unknown) {
      setBatches([]);
      setBatchesError(getErrorMessage(error));
      setBatchesStatus("error");
    }
  }, [resolvedOrgId, classInfo]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  if (!staffActor) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-background p-4 text-foreground sm:p-6"
      >
        <section className="mx-auto max-w-7xl">
          <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
            <p className="text-sm text-muted-foreground">
              جاري تحميل بيانات المستخدم...
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!classInfo) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-background p-4 text-foreground sm:p-6"
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-6">
          <Link
            href="/staff/classes"
            className="inline-flex w-fit items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى فصولي
          </Link>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <h1 className="mt-4 text-xl font-bold">الفصل غير موجود</h1>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-amber-900 dark:text-amber-100">
              تعذر العثور على الفصل ضمن الفصول المتاحة لك. تحقق من المدرسة والسنة الدراسية ثم حاول مجددًا.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background p-4 text-foreground sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildClassHref(classInfo)}
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى الفصل
          </Link>

          <Link
            href="/staff/classes"
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <BookOpen className="h-4 w-4" />
            فصولي
          </Link>

          <Link
            href={buildStudentsHref()}
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <UsersRound className="h-4 w-4" />
            طلابي
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <div className="border-b bg-muted/20 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  قياسات ومتابعات {getClassTitle(classInfo)}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  إدخال النتائج ومراجعة دفعات الفصل.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildBatchNewHref(classInfo)}
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  إدخال نتائج قياس
                </Link>

                <Link
                  href={buildLearningLossHref(classInfo)}
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
                >
                  <Target className="h-4 w-4" />
                  الفاقد التعليمي
                </Link>
              </div>
            </div>
          </div>

        </div>

        <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">دفعات القياس السابقة</h2>
                <p className="text-sm text-muted-foreground">
                  المسودات والدفعات المرسلة والدفعات التعويضية الخاصة بهذا
                  الفصل.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadBatches()}
              disabled={batchesStatus === "loading"}
              className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {batchesStatus === "loading" ? "جاري التحديث..." : "تحديث"}
            </button>
          </div>

          {batchesError ? (
            <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
              حدث خطأ أثناء قراءة الدفعات: {batchesError}
            </div>
          ) : null}

          {batchesStatus === "loading" ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="p-5">
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <FileText className="h-6 w-6" />
                </div>

                <h3 className="mt-4 font-bold">لا توجد دفعات قياس بعد</h3>

                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
                  ابدأ أول دفعة قياس أو متابعة لهذا الفصل، ثم ستظهر هنا
                  المسودات والدفعات المرسلة والدفعات التعويضية.
                </p>

                <Link
                  href={buildBatchNewHref(classInfo)}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  إنشاء أول دفعة
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {batches.map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
function BatchCard({ batch }: { batch: MeasurementBatchDoc }) {
  const latestDate = batch.updatedAt ?? batch.createdAt ?? batch.measuredAt;
  const editable = isEditableBatch(batch);

  return (
    <div className="rounded-2xl border bg-muted/40 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getBatchStatusTone(
                batch.status,
              )}`}
            >
              {getBatchStatusLabel(batch.status)}
            </span>

            {batch.isCompensationBatch === true ? (
              <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900">
                دفعة تعويضية
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 truncate text-lg font-bold">
            {getFriendlyMeasurementLabel(batch.templateTitle) ||
              batch.templateTitle ||
              getFriendlyMeasurementLabel(batch.assessmentSlot) ||
              getFriendlyMeasurementLabel(batch.assessmentKind) ||
              getFriendlyMeasurementLabel(batch.trackerKind) ||
              getBatchKindLabel(batch.batchKind)}
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {getFriendlyMeasurementLabel(batch.assessmentSlot) ||
              getFriendlyMeasurementLabel(batch.assessmentKind) ||
              getFriendlyMeasurementLabel(batch.trackerKind) ||
              getBatchKindLabel(batch.batchKind)}
          </p>
        </div>

        <div className="text-sm text-muted-foreground">
          {formatDate(latestDate)}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        المستهدفون: {(batch.targetCount ?? 0).toLocaleString("ar-SA")} · المكتمل: {" "}
        {(batch.completedCount ?? 0).toLocaleString("ar-SA")} · الناقص: {" "}
        {(batch.missingCount ?? 0).toLocaleString("ar-SA")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={buildBatchViewHref(batch.id)}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          عرض الدفعة
        </Link>

        <Link
          href={buildBatchEditHref(batch.id)}
            className="inline-flex h-10 items-center justify-center rounded-xl border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          {editable ? "إدخال / تعديل" : "فتح صفحة الإدخال"}
        </Link>
      </div>
    </div>
  );
}

