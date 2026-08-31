"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  GraduationCap,
  Plus,
  RefreshCw,
  School,
  Search,
  Target,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { StudentMeasurementBatch } from "@takween/contracts";

import { db } from "@/lib/firebase";
import {
  getFriendlyMeasurementLabel,
  getFriendlySubjectLabel,
} from "@/lib/measurement-presentation";
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

type TeacherAssignmentScope = {
  personId?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  subjectKey?: string;
};

type StaffActorLike = {
  orgId?: string;
  personId?: string;
  roleKeys?: string[];
  roles?: string[];
  teacherAssignments?: TeacherAssignmentScope[];
  visibleClasses?: StaffVisibleClass[];
};

function isTeacherOnlyActor(actor: StaffActorLike | null) {
  const roleKeys = [...(actor?.roleKeys ?? []), ...(actor?.roles ?? [])].map(
    (role) => role.trim().toUpperCase(),
  );
  const hasTeacherRole = roleKeys.includes("TEACHER");
  const hasSupervisorOrAdminRole = roleKeys.some(
    (role) =>
      role.includes("SUPERVIS") ||
      role.includes("ADMIN") ||
      role === "OWNER" ||
      role === "ORG_OWNER",
  );

  return hasTeacherRole && !hasSupervisorOrAdminRole;
}

function getTeacherSubjectKeysForClass(
  teacherAssignments: TeacherAssignmentScope[],
  teacherPersonId: string,
  classInfo: StaffVisibleClass,
) {
  return Array.from(
    new Set(
      teacherAssignments
        .filter((assignment) => {
          if (
            assignment.personId &&
            assignment.personId !== teacherPersonId
          ) {
            return false;
          }

          if (assignment.classId && assignment.classId !== classInfo.id) {
            return false;
          }

          if (
            assignment.schoolId &&
            assignment.schoolId !== classInfo.schoolId
          ) {
            return false;
          }

          if (
            assignment.academicYearId &&
            assignment.academicYearId !== classInfo.academicYearId
          ) {
            return false;
          }

          return Boolean(assignment.subjectKey);
        })
        .map((assignment) => assignment.subjectKey!.trim())
        .filter(Boolean),
    ),
  );
}

function chunkValues<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getClassTitle(item: StaffVisibleClass) {
  return item.title || item.code || "فصل دراسي";
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
  const teacherPersonId = staffActor?.personId?.trim() || "";
  const shouldScopeToTeacher = isTeacherOnlyActor(staffActor);
  const teacherAssignments = staffActor?.teacherAssignments ?? [];

  const visibleClasses = useMemo(() => {
    return dedupeVisibleClasses(staffActor?.visibleClasses ?? []);
  }, [staffActor?.visibleClasses]);

  const classMap = useMemo(() => {
    return new Map(visibleClasses.map((item) => [getClassKey(item), item]));
  }, [visibleClasses]);

  const loadBatches = useCallback(async () => {
    if (!orgId) return;

    if (shouldScopeToTeacher && !teacherPersonId) {
      setBatches([]);
      setStatus("success");
      return;
    }

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
          const subjectKeyChunks = shouldScopeToTeacher
            ? chunkValues(
                getTeacherSubjectKeysForClass(
                  teacherAssignments,
                  teacherPersonId,
                  classInfo,
                ),
                30,
              )
            : [[]];

          if (subjectKeyChunks.length === 0) return [];

          const snaps = await Promise.all(
            subjectKeyChunks.map((subjectKeys) => {
              const batchesQuery = query(
                batchesRef,
                where("schoolId", "==", classInfo.schoolId),
                where("academicYearId", "==", classInfo.academicYearId),
                where("classId", "==", classInfo.id),
                ...(shouldScopeToTeacher
                  ? [
                      where("createdByPersonId", "==", teacherPersonId),
                      where("subjectKey", "in", subjectKeys),
                    ]
                  : []),
              );

              return getDocs(batchesQuery);
            }),
          );

          return snaps.flatMap((snap) =>
            snap.docs.map((item) => ({
              id: item.id,
              ...(item.data() as Omit<MeasurementBatchDoc, "id">),
            })),
          );
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
  }, [
    orgId,
    visibleClasses,
    classMap,
    shouldScopeToTeacher,
    teacherAssignments,
    teacherPersonId,
  ]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

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

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background p-4 text-foreground sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff"
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" />
            الرئيسية
          </Link>

          <Link
            href="/staff/classes"
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <School className="h-4 w-4" />
            فصولي
          </Link>

          <Link
            href="/staff/learning-loss"
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <Target className="h-4 w-4" />
            الفاقد التعليمي
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <div className="border-b bg-muted/20 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  القياسات والمتابعات
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  دفعات القياس والمتابعة ضمن فصولك.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/staff/classes"
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  اختيار فصل ومادة
                </Link>

                <button
                  type="button"
                  onClick={() => void loadBatches()}
                  disabled={status === "loading"}
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  {status === "loading" ? "جاري التحديث..." : "تحديث"}
                </button>
              </div>
            </div>
          </div>

        </div>

        {error ? (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-7 text-destructive">
            حدث خطأ أثناء قراءة دفعات القياس: {error}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">دفعات القياس</h2>
                <p className="text-sm text-muted-foreground">
                  كل الدفعات المرتبطة بالفصول المرئية لك.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="بحث باسم الدفعة أو الفصل أو المادة..."
                  className="h-10 w-full rounded-xl border bg-background pr-10 pl-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                />
              </div>

              <select
                value={activeFilter}
                onChange={(event) =>
                  setActiveFilter(event.target.value as BatchFilter)
                }
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring sm:w-48"
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
                  className="h-44 animate-pulse rounded-2xl bg-muted"
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

        <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <div className="border-b p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <School className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">ابدأ قياسًا من فصل ومادة</h2>
                <p className="text-sm text-muted-foreground">
                  افتح الفصل أولًا، ثم اختر المادة من قسم “موادّي في هذا الفصل”.
                </p>
              </div>
            </div>
          </div>

          {visibleClasses.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
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

function BatchCard({ item }: { item: BatchWithClass }) {
  const { batch, classInfo } = item;
  const editable = isEditableBatch(batch);
  const latestDate = getBatchDate(batch);

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

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>الفصل: {classInfo ? getClassTitle(classInfo) : "غير محدد"}</span>
        {classInfo?.schoolName ? <span>المدرسة: {classInfo.schoolName}</span> : null}
        {getFriendlySubjectLabel(batch.subjectKey) ? (
          <span>المادة: {getFriendlySubjectLabel(batch.subjectKey)}</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildBatchViewHref(batch.id)}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          عرض التفاصيل
        </Link>

        {editable ? (
          <Link
            href={buildBatchEditHref(batch)}
            className="inline-flex h-10 items-center justify-center rounded-xl border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            تعديل / إرسال
          </Link>
        ) : null}

        <Link
          href={buildLearningLossHref(classInfo)}
          className="inline-flex h-10 items-center justify-center rounded-xl border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
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
    <div className="rounded-2xl border bg-muted/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{getClassTitle(item)}</h3>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {item.schoolName || "مدرسة غير محددة"}
          </p>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {item.gradeTitle || "صف غير محدد"}
          </p>
        </div>

        <div className="rounded-xl bg-background p-3 text-primary shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-background p-3 text-sm text-muted-foreground">
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
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          اختيار مادة
        </Link>

        <Link
          href={buildClassMeasurementsHref(item)}
          className="inline-flex h-10 items-center justify-center rounded-xl border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          عرض دفعات الفصل
        </Link>
      </div>
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
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>

        <h3 className="mt-4 font-bold">{title}</h3>

        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
          {description}
        </p>

        {href && actionLabel ? (
          <Link
            href={href}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
