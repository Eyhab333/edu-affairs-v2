"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";

import {
  StudentHomeworkAssignmentSchema,
  type StudentHomeworkAssignment,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";
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
};

function normalizeSubjectKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function formatNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

function formatDateTime(value?: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getHomeworkStatusLabel(status: StudentHomeworkAssignment["status"]) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "PUBLISHED":
      return "منشور";
    case "CLOSED":
      return "مغلق";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغى";
    default:
      return status;
  }
}

function getHomeworkStatusClass(status: StudentHomeworkAssignment["status"]) {
  switch (status) {
    case "DRAFT":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "PUBLISHED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
    case "CLOSED":
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
    case "LOCKED":
      return "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
  }
}

function findVisibleClass(params: {
  classes: StaffVisibleClass[];
  classId: string;
  schoolId?: string;
  academicYearId?: string;
}) {
  const { classes, classId, schoolId, academicYearId } = params;

  return (
    classes.find((item) => {
      if (item.id !== classId) return false;
      if (schoolId && item.schoolId !== schoolId) return false;
      if (academicYearId && item.academicYearId !== academicYearId)
        return false;
      return true;
    }) ??
    classes.find((item) => {
      if (item.id !== classId) return false;
      if (schoolId && item.schoolId !== schoolId) return false;
      return true;
    }) ??
    classes.find((item) => item.id === classId) ??
    null
  );
}

function buildQuestionBankHref(params: {
  classId: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  subjectKey: string;
  classSubjectOfferingId: string;
}) {
  const queryParams = new URLSearchParams();

  if (params.schoolId) queryParams.set("schoolId", params.schoolId);
  if (params.academicYearId) {
    queryParams.set("academicYearId", params.academicYearId);
  }
  if (params.gradeId) queryParams.set("gradeId", params.gradeId);

  queryParams.set("subjectKey", params.subjectKey);
  queryParams.set("classSubjectOfferingId", params.classSubjectOfferingId);

  const queryString = queryParams.toString();

  return `/staff/classes/${encodeURIComponent(params.classId)}/question-bank${
    queryString ? `?${queryString}` : ""
  }`;
}

function buildNewHomeworkHref(params: {
  classId: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  subjectKey: string;
  classSubjectOfferingId: string;
}) {
  const queryParams = new URLSearchParams();

  if (params.schoolId) queryParams.set("schoolId", params.schoolId);
  if (params.academicYearId) {
    queryParams.set("academicYearId", params.academicYearId);
  }
  if (params.gradeId) queryParams.set("gradeId", params.gradeId);

  queryParams.set("subjectKey", params.subjectKey);
  queryParams.set("classSubjectOfferingId", params.classSubjectOfferingId);

  const queryString = queryParams.toString();

  return `/staff/classes/${encodeURIComponent(
    params.classId,
  )}/homework/new${queryString ? `?${queryString}` : ""}`;
}

function buildHomeworkDetailsHref(params: {
  classId: string;
  homeworkId: string;
}) {
  return `/staff/classes/${encodeURIComponent(
    params.classId,
  )}/homework/${encodeURIComponent(params.homeworkId)}`;
}

export default function StaffClassHomeworkListPage() {
  const params = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const classId = String(params.classId || "");

  const subjectKey = normalizeSubjectKey(searchParams.get("subjectKey"));
  const classSubjectOfferingId = String(
    searchParams.get("classSubjectOfferingId") || "",
  );

  const querySchoolId = String(searchParams.get("schoolId") || "");
  const queryAcademicYearId = String(searchParams.get("academicYearId") || "");
  const queryGradeId = String(searchParams.get("gradeId") || "");

  const visibleClass = useMemo(() => {
    if (!actor) return null;

    return findVisibleClass({
      classes: (actor.visibleClasses ?? []) as StaffVisibleClass[],
      classId,
      schoolId: querySchoolId || undefined,
      academicYearId: queryAcademicYearId || undefined,
    });
  }, [actor, classId, querySchoolId, queryAcademicYearId]);

  const resolvedSchoolId = visibleClass?.schoolId || querySchoolId;
  const resolvedAcademicYearId =
    visibleClass?.academicYearId || queryAcademicYearId;
  const resolvedGradeId = visibleClass?.gradeId || queryGradeId;

  const currentTerm = useMemo(() => {
    if (!actor) return null;

    const termByYear = resolvedAcademicYearId
      ? actor.currentTermsByAcademicYear?.[resolvedAcademicYearId]
      : null;

    return termByYear ?? actor.currentTerm ?? null;
  }, [actor, resolvedAcademicYearId]);

  const loadHomeworkAssignments = useCallback(async (): Promise<
    StudentHomeworkAssignment[]
  > => {
    if (
      !actor?.orgId ||
      !subjectKey ||
      !resolvedSchoolId ||
      !resolvedAcademicYearId ||
      !currentTerm?.id ||
      !classSubjectOfferingId
    ) {
      return [];
    }

    const ref = collection(
      db,
      "orgs",
      actor.orgId,
      "studentHomeworkAssignments",
    );

    const snap = await getDocs(
      query(
        ref,
        where("schoolId", "==", resolvedSchoolId),
        where("academicYearId", "==", resolvedAcademicYearId),
        where("termId", "==", currentTerm.id),
        where("classId", "==", classId),
        where("subjectKey", "==", subjectKey),
        where("classSubjectOfferingId", "==", classSubjectOfferingId),
      ),
    );

    return snap.docs.map((docSnap) => {
      return StudentHomeworkAssignmentSchema.parse({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });
  }, [actor?.orgId, subjectKey]);

  const {
    data: rawAssignments,
    loading,
    error,
    reload,
  } = useDocumentLoader<StudentHomeworkAssignment[]>({
    enabled: Boolean(actor?.orgId && subjectKey),
    loader: loadHomeworkAssignments,
    deps: [actor?.orgId, subjectKey],
  });

  const homeworkAssignments = useMemo(() => {
    if (!actor?.orgId || !subjectKey) return [];

    return (rawAssignments ?? [])
      .filter((item) => item.orgId === actor.orgId)
      .filter((item) => item.schoolId === resolvedSchoolId)
      .filter((item) => item.academicYearId === resolvedAcademicYearId)
      .filter((item) => item.classId === classId)
      .filter((item) => item.subjectKey === subjectKey)
      .filter((item) => item.classSubjectOfferingId === classSubjectOfferingId)
      .filter((item) => {
        if (!currentTerm?.id) return true;
        return item.termId === currentTerm.id;
      })
      .sort((a, b) => {
        const aTime = a.updatedAt ?? a.createdAt ?? 0;
        const bTime = b.updatedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
      });
  }, [
    actor?.orgId,
    resolvedSchoolId,
    resolvedAcademicYearId,
    currentTerm?.id,
    classId,
    subjectKey,
    classSubjectOfferingId,
  ]);

  const stats = useMemo(() => {
    const draftCount = homeworkAssignments.filter(
      (item) => item.status === "DRAFT",
    ).length;

    const publishedCount = homeworkAssignments.filter(
      (item) => item.status === "PUBLISHED",
    ).length;

    const totalTargetCount = homeworkAssignments.reduce(
      (total, item) => total + item.targetCount,
      0,
    );

    const totalSubmittedCount = homeworkAssignments.reduce(
      (total, item) => total + item.submittedCount,
      0,
    );

    return {
      total: homeworkAssignments.length,
      draftCount,
      publishedCount,
      totalTargetCount,
      totalSubmittedCount,
    };
  }, [homeworkAssignments]);

  const questionBankHref = buildQuestionBankHref({
    classId,
    schoolId: resolvedSchoolId,
    academicYearId: resolvedAcademicYearId,
    gradeId: resolvedGradeId,
    subjectKey,
    classSubjectOfferingId,
  });

  const newHomeworkHref = buildNewHomeworkHref({
    classId,
    schoolId: resolvedSchoolId,
    academicYearId: resolvedAcademicYearId,
    gradeId: resolvedGradeId,
    subjectKey,
    classSubjectOfferingId,
  });

  if (!actor) {
    return (
      <main className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تحميل بيانات المستخدم...
          </div>
        </div>
      </main>
    );
  }

  if (!subjectKey || !classSubjectOfferingId) {
    return (
      <main className="space-y-5">
        <Link
          href={`/staff/classes/${encodeURIComponent(classId)}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للفصل
        </Link>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="font-bold">سياق المادة غير مكتمل</h1>
              <p className="mt-2 text-sm leading-7">
                يجب فتح صفحة الواجبات من كارت المادة حتى يصل subjectKey و
                classSubjectOfferingId بشكل صحيح.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!visibleClass) {
    return (
      <main className="space-y-5">
        <Link
          href="/staff/classes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لفصولي
        </Link>

        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="font-bold">لا يمكن فتح هذا الفصل</h1>
              <p className="mt-2 text-sm leading-7">
                لم يتم العثور على الفصل ضمن الفصول المسموحة لهذا المستخدم.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/staff/classes/${encodeURIComponent(classId)}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للفصل
        </Link>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>

          <Link
            href={questionBankHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <BookOpenCheck className="h-4 w-4" />
            بنك الأسئلة
          </Link>

          <Link
            href={newHomeworkHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            إنشاء واجب
          </Link>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ClipboardList className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                واجبات المادة
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                {visibleClass.title || visibleClass.code || classId}
              </h1>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  المادة: {subjectKey}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  الفصل الدراسي:{" "}
                  {currentTerm?.shortTitle ||
                    currentTerm?.title ||
                    currentTerm?.id ||
                    "غير محدد"}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {classSubjectOfferingId}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[42rem]">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الإجمالي
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.total)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                المسودات
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.draftCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                المنشورة
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.publishedCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                المستهدفون
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.totalTargetCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                التسليمات
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.totalSubmittedCount)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-bold">تعذر تحميل الواجبات</h2>
              <p className="mt-2 text-sm leading-7">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">قائمة الواجبات</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              تعرض الواجبات المرتبطة بهذه المادة داخل هذا الفصل.
            </p>
          </div>

          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              تحميل
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : null}

        {!loading && homeworkAssignments.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <ClipboardList className="h-6 w-6" />
            </div>

            <h3 className="mt-4 font-bold">لا توجد واجبات لهذه المادة بعد</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              أنشئ أول واجب من بنك الأسئلة، ثم سيظهر هنا كمسودة أو كواجب منشور.
            </p>

            <Link
              href={newHomeworkHref}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              إنشاء أول واجب
            </Link>
          </div>
        ) : null}

        {!loading && homeworkAssignments.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {homeworkAssignments.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-900 dark:hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {item.subjectKey}
                    </p>

                    <h3 className="mt-2 line-clamp-2 font-bold leading-7 text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getHomeworkStatusClass(
                      item.status,
                    )}`}
                  >
                    {getHomeworkStatusLabel(item.status)}
                  </span>
                </div>

                {item.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {item.description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-slate-400">
                    لا يوجد وصف للواجب.
                  </p>
                )}

                <div className="mt-4 grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      الأسئلة
                    </span>
                    <span className="font-semibold">
                      {formatNumber(item.questions.length)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      الدرجة
                    </span>
                    <span className="font-semibold">
                      {formatNumber(item.maxScore)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      المستهدفون
                    </span>
                    <span className="font-semibold">
                      {formatNumber(item.targetCount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      التسليمات
                    </span>
                    <span className="font-semibold">
                      {formatNumber(item.submittedCount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      موعد التسليم
                    </span>
                    <span className="font-semibold">
                      {formatDateTime(item.dueAt)}
                    </span>
                  </div>
                </div>

                <Link
                  href={buildHomeworkDetailsHref({
                    classId: item.classId,
                    homeworkId: item.id,
                  })}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  فتح التفاصيل
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
