"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers3,
  Plus,
  RefreshCw,
  School,
  Search,
  Target,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { StudentMeasurementBatch } from "@takween/contracts";

import { db } from "@/lib/firebase";
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
  classSubjectOfferingId?: string;
  teacherAssignmentId?: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
  compensationReason?: string;
};

type BatchWithClass = {
  batch: MeasurementBatchDoc;
  classInfo: StaffVisibleClass | null;
};

type LoadingState = "idle" | "loading" | "success" | "error";

type BatchFilter = "ALL" | "DRAFTS" | "SUBMITTED" | "COMPENSATION";

type QuickActionCard = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  actionLabel: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getClassTitle(item: StaffVisibleClass) {
  return item.title || item.code || item.id;
}

function getStudentCount(item: StaffVisibleClass) {
  return (
    item.studentCount ?? item.studentsCount ?? item.enrolledStudentCount ?? null
  );
}

function getClassKey(item: {
  id?: string;
  classId?: string;
  schoolId?: string;
  academicYearId?: string;
}) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.id || item.classId || "NO_CLASS",
  ].join(":");
}

function dedupeVisibleClasses(classes: StaffVisibleClass[]) {
  const byKey = new Map<string, StaffVisibleClass>();

  for (const item of classes) {
    const key = getClassKey(item);

    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const schoolCompare = (a.schoolName || a.schoolId || "").localeCompare(
      b.schoolName || b.schoolId || "",
      "ar",
    );

    if (schoolCompare !== 0) return schoolCompare;

    return (a.order ?? 0) - (b.order ?? 0);
  });
}

function isSameClassContext(
  batch: MeasurementBatchDoc,
  classInfo: StaffVisibleClass,
) {
  if (batch.classId !== classInfo.id) return false;

  if (
    classInfo.schoolId &&
    batch.schoolId &&
    batch.schoolId !== classInfo.schoolId
  ) {
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

function buildClassMeasurementsHref(item: StaffVisibleClass) {
  return `/staff/classes/${encodeURIComponent(
    item.id,
  )}/measurements${buildClassQuery(item)}`;
}

function buildBatchViewHref(batchId: string) {
  return `/staff/measurements/batches/${batchId}`;
}

function buildBatchEditHref(batch: MeasurementBatchDoc) {
  const params = new URLSearchParams();

  if (batch.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", batch.classSubjectOfferingId);
  }

  if (batch.subjectKey) {
    params.set("subjectKey", batch.subjectKey);
  }

  if (batch.teacherAssignmentId) {
    params.set("teacherAssignmentId", batch.teacherAssignmentId);
  }

  const queryString = params.toString();

  return `/staff/measurements/batches/${batch.id}/edit${
    queryString ? `?${queryString}` : ""
  }`;
}

function buildLearningLossHref(item?: StaffVisibleClass | null) {
  if (!item) return "/staff/learning-loss";

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
      return value || "غير محدد";
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
      return value || "غير محدد";
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

function getBatchDate(batch: MeasurementBatchDoc) {
  return batch.updatedAt ?? batch.createdAt ?? batch.measuredAt ?? 0;
}

function getBatchSearchText(item: BatchWithClass) {
  const { batch, classInfo } = item;

  return [
    batch.id,
    batch.templateTitle,
    batch.templateId,
    batch.assessmentKind,
    batch.assessmentSlot,
    batch.trackerKind,
    batch.subjectKey,
    batch.classSubjectOfferingId,
    batch.teacherAssignmentId,
    batch.status,
    batch.batchKind,
    classInfo?.id,
    classInfo?.title,
    classInfo?.code,
    classInfo?.schoolName,
    classInfo?.schoolId,
    classInfo?.gradeTitle,
    classInfo?.gradeId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterBatch(item: BatchWithClass, filter: BatchFilter) {
  const { batch } = item;

  if (filter === "ALL") return true;

  if (filter === "DRAFTS") {
    return batch.status === "DRAFT" || batch.status === "IN_PROGRESS";
  }

  if (filter === "SUBMITTED") {
    return (
      batch.status === "SUBMITTED" ||
      batch.status === "REVIEWED" ||
      batch.status === "LOCKED"
    );
  }

  if (filter === "COMPENSATION") {
    return batch.isCompensationBatch === true;
  }

  return true;
}

export default function StaffMeasurementsPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;

  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<BatchWithClass[]>([]);
  const [activeFilter, setActiveFilter] = useState<BatchFilter>("ALL");
  const [searchText, setSearchText] = useState("");

  const orgId = staffActor?.orgId || "";

  const visibleClasses = useMemo(() => {
    return dedupeVisibleClasses(staffActor?.visibleClasses ?? []);
  }, [staffActor?.visibleClasses]);

  const classMap = useMemo(() => {
    return new Map(visibleClasses.map((item) => [getClassKey(item), item]));
  }, [visibleClasses]);

  const quickActions = useMemo<QuickActionCard[]>(() => {
    return [
      {
        title: "ابدأ من فصولي",
        description:
          "اختيار الفصل ثم المادة هو الطريق الصحيح لبدء دفعة قياس جديدة بسياق أكاديمي كامل.",
        icon: School,
        href: "/staff/classes",
        actionLabel: "فتح فصولي",
      },
      {
        title: "الفاقد التعليمي",
        description:
          "متابعة خطط الفاقد المفتوحة والطلاب الذين يحتاجون خطة أو قياس أول/ثانٍ.",
        icon: Target,
        href: "/staff/learning-loss",
        actionLabel: "فتح الفاقد",
      },
      {
        title: "مهامي",
        description:
          "لاحقًا ستظهر مسودات القياس والدفعات غير المكتملة كمهام تشغيلية ضمن صفحة مهامي.",
        icon: ClipboardList,
        href: "/staff/tasks",
        actionLabel: "فتح مهامي",
      },
    ];
  }, []);

  const loadBatches = useCallback(async () => {
    if (!orgId) return;

    if (visibleClasses.length === 0) {
      setBatches([]);
      setStatus("success");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const batchesRef = collection(
        db,
        "orgs",
        orgId,
        "studentMeasurementBatches",
      );

      const snapGroups = await Promise.all(
        visibleClasses.map(async (classInfo) => {
          const batchesQuery = query(
            batchesRef,
            where("schoolId", "==", classInfo.schoolId),
            where("academicYearId", "==", classInfo.academicYearId),
            where("classId", "==", classInfo.id),
          );

          const snap = await getDocs(batchesQuery);

          return snap.docs.map((item) => {
            return {
              id: item.id,
              ...(item.data() as Omit<MeasurementBatchDoc, "id">),
            };
          });
        }),
      );

      const byBatchId = new Map<string, BatchWithClass>();

      for (const batch of snapGroups.flat()) {
        const exactClass = classMap.get(getClassKey(batch));

        const fallbackClass =
          exactClass ??
          visibleClasses.find((classInfo) =>
            isSameClassContext(batch, classInfo),
          ) ??
          visibleClasses.find((classInfo) => classInfo.id === batch.classId) ??
          null;

        if (!fallbackClass) continue;

        if (!isSameClassContext(batch, fallbackClass)) continue;

        byBatchId.set(batch.id, {
          batch,
          classInfo: fallbackClass,
        });
      }

      const loadedBatches = Array.from(byBatchId.values()).sort((a, b) => {
        return getBatchDate(b.batch) - getBatchDate(a.batch);
      });

      setBatches(loadedBatches);
      setStatus("success");
    } catch (error: unknown) {
      setBatches([]);
      setError(getErrorMessage(error));
      setStatus("error");
    }
  }, [orgId, visibleClasses, classMap]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const summary = useMemo(() => {
    const total = batches.length;

    const drafts = batches.filter(({ batch }) => {
      return batch.status === "DRAFT" || batch.status === "IN_PROGRESS";
    }).length;

    const submitted = batches.filter(({ batch }) => {
      return batch.status === "SUBMITTED" || batch.status === "REVIEWED";
    }).length;

    const locked = batches.filter(({ batch }) => {
      return batch.status === "LOCKED";
    }).length;

    const compensation = batches.filter(({ batch }) => {
      return batch.isCompensationBatch === true;
    }).length;

    const withSubjectContext = batches.filter(({ batch }) => {
      return Boolean(batch.classSubjectOfferingId || batch.subjectKey);
    }).length;

    const totalTargets = batches.reduce((sum, { batch }) => {
      return (
        sum + (typeof batch.targetCount === "number" ? batch.targetCount : 0)
      );
    }, 0);

    const completedTargets = batches.reduce((sum, { batch }) => {
      return (
        sum +
        (typeof batch.completedCount === "number" ? batch.completedCount : 0)
      );
    }, 0);

    return {
      total,
      drafts,
      submitted,
      locked,
      compensation,
      withSubjectContext,
      totalTargets,
      completedTargets,
    };
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return batches
      .filter((item) => filterBatch(item, activeFilter))
      .filter((item) => {
        if (!normalizedSearch) return true;

        return getBatchSearchText(item).includes(normalizedSearch);
      });
  }, [activeFilter, batches, searchText]);

  if (!staffActor) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل بيانات المستخدم...
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرئيسية
          </Link>

          <Link
            href="/staff/classes"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <School className="h-4 w-4" />
            فصولي
          </Link>

          <Link
            href="/staff/learning-loss"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Target className="h-4 w-4" />
            الفاقد التعليمي
          </Link>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  <Layers3 className="h-3.5 w-3.5" />
                  مركز القياسات العام
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                    القياسات والمتابعات
                  </h1>

                  <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                    هذه الصفحة تجمع دفعات القياس لكل الفصول المرئية لك. بدء
                    القياس الجديد يتم من صفحة الفصل ثم من كارت المادة، حتى تحفظ
                    الدفعة سياق المادة والإسناد.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/classes"
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                >
                  <Plus className="h-4 w-4" />
                  اختيار فصل ومادة
                </Link>

                <button
                  type="button"
                  onClick={() => void loadBatches()}
                  disabled={status === "loading"}
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                >
                  <RefreshCw className="h-4 w-4" />
                  {status === "loading" ? "جاري التحديث..." : "تحديث"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={School}
              label="الفصول المرئية"
              value={`${visibleClasses.length.toLocaleString("ar-SA")} فصل`}
            />

            <SummaryCard
              icon={FileText}
              label="دفعات القياس"
              value={`${summary.total.toLocaleString("ar-SA")} دفعة`}
            />

            <SummaryCard
              icon={ClipboardList}
              label="المسودات"
              value={`${summary.drafts.toLocaleString("ar-SA")} مسودة`}
            />

            <SummaryCard
              icon={BookOpen}
              label="بسياق مادة"
              value={`${summary.withSubjectContext.toLocaleString("ar-SA")} دفعة`}
            />
          </div>
        </div>

        {error ? (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
            حدث خطأ أثناء قراءة دفعات القياس: {error}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-8">
          <MetricCard label="إجمالي الدفعات" value={summary.total} />
          <MetricCard label="مسودات" value={summary.drafts} />
          <MetricCard label="مرسلة / مراجعة" value={summary.submitted} />
          <MetricCard label="مقفلة" value={summary.locked} />
          <MetricCard label="تعويضية" value={summary.compensation} />
          <MetricCard label="بسياق مادة" value={summary.withSubjectContext} />
          <MetricCard label="طلاب مستهدفون" value={summary.totalTargets} />
          <MetricCard label="مكتملون" value={summary.completedTargets} />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">معنى هذه الصفحة</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  متابعة عامة وليست مكان إنشاء القياس
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm leading-7 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <p>
                القياس الجديد يبدأ من <span className="font-semibold">فصل</span>{" "}
                ثم <span className="font-semibold">مادة مفعّلة</span>، حتى لا
                تضيع علاقة الدفعة بالمادة والإسناد.
              </p>

              <p className="mt-3">
                أما هنا فتتابع كل الدفعات الموجودة بالفعل، سواء كانت مسودة أو
                مرسلة أو تعويضية.
              </p>

              <p className="mt-3">
                أي دفعة يمكن فتحها للعرض، وإذا كانت مسودة أو قيد الإدخال يمكن
                تعديلها وإرسالها.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <BookOpen className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">اختصارات القياس</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  روابط سريعة للبدء أو المتابعة.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {quickActions.map((item) => (
                <QuickActionCard key={item.title} item={item} />
              ))}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">دفعات القياس</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  كل الدفعات المرتبطة بالفصول المرئية لك.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="بحث باسم الدفعة أو الفصل أو المادة..."
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-white pr-10 pl-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950"
                />
              </div>

              <select
                value={activeFilter}
                onChange={(event) =>
                  setActiveFilter(event.target.value as BatchFilter)
                }
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950"
              >
                <option value="ALL">كل الدفعات</option>
                <option value="DRAFTS">المسودات</option>
                <option value="SUBMITTED">المرسلة / المراجعة</option>
                <option value="COMPENSATION">التعويضية</option>
              </select>
            </div>
          </div>

          {status === "loading" ? (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : visibleClasses.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="لا توجد فصول مرئية"
              description="لا توجد فصول ضمن نطاقك الحالي، لذلك لا يمكن عرض دفعات قياس."
              href="/staff"
              actionLabel="الرجوع للرئيسية"
            />
          ) : batches.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد دفعات قياس بعد"
              description="ابدأ من فصولي، اختر فصلًا، ثم اختر المادة من داخل كارت المادة لإنشاء أول دفعة قياس."
              href="/staff/classes"
              actionLabel="فتح فصولي"
            />
          ) : filteredBatches.length === 0 ? (
            <EmptyState
              icon={Search}
              title="لا توجد نتائج مطابقة"
              description="غيّر الفلتر أو نص البحث لعرض دفعات أخرى."
              actionLabel=""
            />
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {filteredBatches.map((item) => (
                <BatchCard key={item.batch.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <School className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">ابدأ قياسًا من فصل ومادة</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  افتح الفصل أولًا، ثم اختر المادة من قسم “موادّي في هذا الفصل”.
                </p>
              </div>
            </div>
          </div>

          {visibleClasses.length === 0 ? (
            <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
              لا توجد فصول متاحة.
            </div>
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleClasses.slice(0, 12).map((classInfo) => (
                <ClassStartCard key={getClassKey(classInfo)} item={classInfo} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 truncate font-bold text-slate-950 dark:text-slate-50">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-slate-50">
        {value.toLocaleString("ar-SA")}
      </p>
    </div>
  );
}

function QuickActionCard({ item }: { item: QuickActionCard }) {
  const Icon = item.icon;

  const content = (
    <div className="group h-full rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-900 dark:hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>

        {item.href ? (
          <ChevronLeft className="mt-1 h-4 w-4 text-slate-300 transition group-hover:text-emerald-500" />
        ) : null}
      </div>

      <h3 className="mt-4 font-bold">{item.title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {item.description}
      </p>

      <span className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
        {item.actionLabel}
      </span>
    </div>
  );

  if (!item.href) return content;

  return <Link href={item.href}>{content}</Link>;
}

function BatchCard({ item }: { item: BatchWithClass }) {
  const { batch, classInfo } = item;
  const editable = isEditableBatch(batch);
  const latestDate = getBatchDate(batch);

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
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

            {batch.classSubjectOfferingId || batch.subjectKey ? (
              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
                مرتبطة بمادة
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                بدون سياق مادة
              </span>
            )}
          </div>

          <h3 className="mt-3 truncate text-lg font-bold">
            {batch.templateTitle || batch.templateId || "دفعة قياس"}
          </h3>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {getBatchKindLabel(batch.batchKind)} —{" "}
            {batch.assessmentSlot ||
              batch.assessmentKind ||
              batch.trackerKind ||
              "غير محدد"}
          </p>
        </div>

        <div className="text-sm text-slate-500 dark:text-slate-400">
          {formatDate(latestDate)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniInfo label="المستهدفون" value={batch.targetCount ?? 0} />
        <MiniInfo label="المكتمل" value={batch.completedCount ?? 0} />
        <MiniInfo label="الناقص" value={batch.missingCount ?? 0} />
      </div>

      <div className="mt-4 rounded-2xl bg-white p-3 text-sm leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <div className="flex flex-col gap-1">
          <span>
            الفصل:{" "}
            <span className="font-semibold">
              {classInfo
                ? getClassTitle(classInfo)
                : batch.classId || "غير محدد"}
            </span>
          </span>

          <span>
            المدرسة:{" "}
            <span className="font-semibold">
              {classInfo?.schoolName || batch.schoolId || "غير محدد"}
            </span>
          </span>

          <span>
            المادة:{" "}
            <span className="font-semibold">
              {batch.subjectKey || "غير محدد"}
            </span>
          </span>

          <span>
            ClassSubjectOffering:{" "}
            <span className="font-mono text-xs">
              {batch.classSubjectOfferingId || "—"}
            </span>
          </span>

          <span>
            TeacherAssignment:{" "}
            <span className="font-mono text-xs">
              {batch.teacherAssignmentId || "—"}
            </span>
          </span>
        </div>
      </div>

      {batch.isCompensationBatch === true && batch.originalBatchId ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
          دفعة تعويضية عن:{" "}
          <span className="font-mono">{batch.originalBatchId}</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildBatchViewHref(batch.id)}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          عرض التفاصيل
        </Link>

        {editable ? (
          <Link
            href={buildBatchEditHref(batch)}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            تعديل / إرسال
          </Link>
        ) : null}

        <Link
          href={buildLearningLossHref(classInfo)}
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          الفاقد
        </Link>
      </div>
    </div>
  );
}

function ClassStartCard({ item }: { item: StaffVisibleClass }) {
  const studentCount = getStudentCount(item);

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{getClassTitle(item)}</h3>

          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
            {item.schoolName || item.schoolId || "مدرسة غير محددة"}
          </p>

          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
            {item.gradeTitle || item.gradeId || "صف غير محدد"}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
          <GraduationCap className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        الطلاب:{" "}
        <span className="font-semibold">
          {studentCount !== null
            ? `${studentCount.toLocaleString("ar-SA")} طالب`
            : "يربط من التسجيلات"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={buildClassHref(item)}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          اختيار مادة
        </Link>

        <Link
          href={buildClassMeasurementsHref(item)}
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          عرض دفعات الفصل
        </Link>
      </div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950 dark:text-slate-50">
        {value.toLocaleString("ar-SA")}
      </p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  href,
  actionLabel,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href?: string;
  actionLabel: string;
}) {
  return (
    <div className="p-5">
      <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-6 w-6" />
        </div>

        <h3 className="mt-4 font-bold">{title}</h3>

        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {description}
        </p>

        {href && actionLabel ? (
          <Link
            href={href}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
