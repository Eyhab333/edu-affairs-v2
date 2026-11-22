"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  ChevronLeft,
  CircleHelp,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import {
  QuestionBankItemSchema,
  type QuestionBankItem,
} from "@takween/contracts";
import { filterQuestionBankForSubjectContext } from "@takween/domain";

import { staffHomework, staffHomeworkItems } from "@/lib/staff-homework";
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

function getQuestionTypeLabel(type: QuestionBankItem["questionType"]) {
  switch (type) {
    case "TRUE_FALSE":
      return "صح / خطأ";
    case "MULTIPLE_CHOICE":
      return "اختيار من متعدد";
    case "SHORT_ANSWER":
      return "إجابة قصيرة";
    default:
      return type;
  }
}

function getDifficultyLabel(difficulty: QuestionBankItem["difficulty"]) {
  switch (difficulty) {
    case "EASY":
      return "سهل";
    case "MEDIUM":
      return "متوسط";
    case "HARD":
      return "صعب";
    case "CHALLENGE":
      return "تحدي";
    default:
      return difficulty;
  }
}

function formatNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

function formatDate(value?: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function buildQuestionBankNewHref(params: {
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
  )}/question-bank/new${queryString ? `?${queryString}` : ""}`;
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

export default function StaffClassQuestionBankPage() {
  const params = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();
  const [scopeError, setScopeError] = useState("");
  const [scoping, setScoping] = useState<string | null>(null);

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

  const currentSchool = useMemo(() => {
    if (!actor || !resolvedSchoolId) return null;

    return (
      actor.schools?.find((school) => school.id === resolvedSchoolId) ?? null
    );
  }, [actor, resolvedSchoolId]);

  const currentTerm = useMemo(() => {
    if (!actor) return null;

    const termByYear = resolvedAcademicYearId
      ? actor.currentTermsByAcademicYear?.[resolvedAcademicYearId]
      : null;

    return termByYear ?? actor.currentTerm ?? null;
  }, [actor, resolvedAcademicYearId]);

  const loadQuestionBankItems = useCallback(async (): Promise<
    QuestionBankItem[]
  > => {
    if (!actor?.orgId || !subjectKey || !currentTerm?.id || !classSubjectOfferingId) return [];

    const result = await staffHomeworkItems({ action: "listQuestions", orgId: actor.orgId, offeringId: classSubjectOfferingId, termId: currentTerm.id });
    return result.map((item) => QuestionBankItemSchema.parse(item));
  }, [actor?.orgId, subjectKey, classSubjectOfferingId, currentTerm?.id]);

  const {
    data: rawItems,
    loading,
    error,
    reload,
  } = useDocumentLoader<QuestionBankItem[]>({
    enabled: Boolean(actor?.orgId && subjectKey),
    loader: loadQuestionBankItems,
    deps: [actor?.orgId, subjectKey, classSubjectOfferingId, currentTerm?.id],
  });

  const filteredItems = useMemo(() => {
    if (!actor?.orgId || !subjectKey) return [];

    return filterQuestionBankForSubjectContext({
      items: rawItems ?? [],
      context: {
        orgId: actor.orgId,
        schoolId: resolvedSchoolId,
        schoolType: currentSchool?.profile?.schoolType,
        academicYearId: resolvedAcademicYearId,
        termId: currentTerm?.id ?? "",
        gradeId: resolvedGradeId,
        subjectKey,
        classSubjectOfferingId,
      },
    });
  }, [
    actor?.orgId,
    rawItems,
    resolvedSchoolId,
    currentSchool?.profile?.schoolType,
    resolvedAcademicYearId,
    currentTerm?.id,
    resolvedGradeId,
    subjectKey,
    classSubjectOfferingId,
  ]);

  const legacyItems = (rawItems ?? []).filter((item) => !item.schoolId || !item.academicYearId || !item.classSubjectOfferingId);
  const isAdmin = actor?.roles?.some((role) => ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(role)) ?? false;

  async function scopeLegacy(questionId: string, termId: string) {
    if (!actor?.orgId || !window.confirm("ربط السؤال بسياق هذه المادة والفصل؟")) return;
    setScoping(questionId); setScopeError("");
    try {
      await staffHomework({ action: "scopeLegacyQuestion", orgId: actor.orgId, offeringId: classSubjectOfferingId, termId, questionId });
      await reload();
    } catch (error) {
      setScopeError(error instanceof Error ? error.message : "تعذر ربط السؤال.");
    } finally { setScoping(null); }
  }

  const stats = useMemo(() => {
    const activeCount = filteredItems.filter((item) => item.isActive).length;

    const autoCount = filteredItems.filter(
      (item) => item.gradingMode === "AUTO",
    ).length;

    const manualOrMixedCount = filteredItems.filter(
      (item) => item.gradingMode !== "AUTO",
    ).length;

    return {
      total: filteredItems.length,
      activeCount,
      autoCount,
      manualOrMixedCount,
    };
  }, [filteredItems]);

  const newQuestionHref = buildQuestionBankNewHref({
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
                يجب فتح بنك الأسئلة من كارت المادة حتى يصل subjectKey و
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
                لم يتم العثور على الفصل ضمن الفصول المسموحة لهذا المستخدم، أو أن
                schoolId / academicYearId لا يطابقان سياق الفصل.
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
          href={`/staff/classes/${encodeURIComponent(classId)}${
            resolvedSchoolId || resolvedAcademicYearId
              ? `?${new URLSearchParams({
                  ...(resolvedSchoolId ? { schoolId: resolvedSchoolId } : {}),
                  ...(resolvedAcademicYearId
                    ? { academicYearId: resolvedAcademicYearId }
                    : {}),
                }).toString()}`
              : ""
          }`}
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
            href={newHomeworkHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950"
          >
            <BookOpenCheck className="h-4 w-4" />
            إنشاء واجب
          </Link>

          <Link
            href={newQuestionHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            إضافة سؤال
          </Link>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <BookOpenCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                بنك أسئلة المادة
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

          <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[34rem]">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                إجمالي الأسئلة
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.total)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                النشطة
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.activeCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تصحيح آلي
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.autoCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يدوي/مختلط
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(stats.manualOrMixedCount)}
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
              <h2 className="font-bold">تعذر تحميل بنك الأسئلة</h2>
              <p className="mt-2 text-sm leading-7">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      {isAdmin && legacyItems.length > 0 && <section className="rounded-3xl border border-amber-300 p-5">
        <h2 className="font-bold">أسئلة قديمة تحتاج إلى تحديد نطاق</h2>
        <p className="mt-1 text-sm">تظهر للمسؤول فقط حتى تُربط بسياق هذه المادة والفصل.</p>
        {scopeError && <p role="alert" className="text-red-600">{scopeError}</p>}
        {legacyItems.map((item) => <div key={item.id} className="mt-3 flex items-center justify-between gap-3">
          <span>{item.prompt} — {item.termTitle || item.termId}</span>
          <button type="button" disabled={scoping !== null} onClick={() => void scopeLegacy(item.id, item.termId)} className="rounded-xl border px-3 py-2">ربط بهذا الفصل</button>
        </div>)}
      </section>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">الأسئلة المتاحة</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              تظهر هنا الأسئلة المطابقة للمادة والصف والفصل الدراسي وسياق
              المادة.
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
                className="h-52 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : null}

        {!loading && filteredItems.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <CircleHelp className="h-6 w-6" />
            </div>

            <h3 className="mt-4 font-bold">لا توجد أسئلة لهذه المادة بعد</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              أضف أول سؤال في بنك الأسئلة، ثم سنستخدم هذه الأسئلة لاحقًا عند
              إنشاء الواجبات مع حفظ Snapshot داخل كل واجب.
            </p>

            <Link
              href={newQuestionHref}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              إضافة أول سؤال
            </Link>
          </div>
        ) : null}

        {!loading && filteredItems.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-violet-900 dark:hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                      {getQuestionTypeLabel(item.questionType)}
                    </p>

                    <h3 className="mt-2 line-clamp-2 font-bold leading-7 text-slate-950 dark:text-white">
                      {item.title || item.prompt}
                    </h3>
                  </div>

                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                    {getDifficultyLabel(item.difficulty)}
                  </span>
                </div>

                <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {item.prompt}
                </p>

                <div className="mt-4 grid gap-2 text-xs">
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
                      التصحيح
                    </span>
                    <span className="font-semibold">{item.gradingMode}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      آخر تحديث
                    </span>
                    <span className="font-semibold">
                      {formatDate(item.updatedAt || item.createdAt)}
                    </span>
                  </div>
                </div>

                {item.questionType === "MULTIPLE_CHOICE" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <ListChecks className="h-4 w-4" />
                      الاختيارات
                    </div>

                    <div className="space-y-1">
                      {item.choices.slice(0, 4).map((choice) => {
                        const isCorrect = item.correctChoiceIds.includes(
                          choice.id,
                        );

                        return (
                          <div
                            key={choice.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="line-clamp-1 text-slate-600 dark:text-slate-300">
                              {choice.text}
                            </span>

                            {isCorrect ? (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                صحيح
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {item.questionType !== "MULTIPLE_CHOICE" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      الإجابة الصحيحة:
                    </span>
                    <span className="ms-2 font-semibold text-slate-800 dark:text-slate-100">
                      {item.questionType === "TRUE_FALSE"
                        ? item.correctAnswer === "true"
                          ? "صح"
                          : "خطأ"
                        : item.correctAnswer || "—"}
                    </span>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {item.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <Link
                  href="#"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  عرض التفاصيل لاحقًا
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
