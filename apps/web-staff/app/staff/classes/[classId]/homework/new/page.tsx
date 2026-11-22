"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Save,
} from "lucide-react";

import {
  QuestionBankItemSchema,
  StudentHomeworkAssignmentSchema,
  type QuestionBankItem,
} from "@takween/contracts";
import {
  buildHomeworkQuestionSnapshot,
  calculateHomeworkMaxScore,
  filterQuestionBankForSubjectContext,
  validateHomeworkQuestions,
} from "@takween/domain";

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

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function parseDatetimeLocalToMs(value: string) {
  if (!value) return undefined;

  const ms = new Date(value).getTime();

  return Number.isFinite(ms) ? ms : undefined;
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

function buildHomeworkDetailsHref(params: {
  classId: string;
  homeworkId: string;
}) {
  return `/staff/classes/${encodeURIComponent(
    params.classId,
  )}/homework/${encodeURIComponent(params.homeworkId)}`;
}

export default function NewHomeworkAssignmentPage() {
  const params = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { actor } = useStaffActor();

  const classId = String(params.classId || "");

  const subjectKey = normalizeSubjectKey(searchParams.get("subjectKey"));
  const classSubjectOfferingId = String(
    searchParams.get("classSubjectOfferingId") || "",
  );

  const querySchoolId = String(searchParams.get("schoolId") || "");
  const queryAcademicYearId = String(searchParams.get("academicYearId") || "");
  const queryGradeId = String(searchParams.get("gradeId") || "");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAtText, setDueAtText] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const questionBankHref = buildQuestionBankHref({
    classId,
    schoolId: resolvedSchoolId,
    academicYearId: resolvedAcademicYearId,
    gradeId: resolvedGradeId,
    subjectKey,
    classSubjectOfferingId,
  });

  const loadQuestionBankItems = useCallback(async (): Promise<
    QuestionBankItem[]
  > => {
    if (
      !actor?.orgId ||
      !subjectKey ||
      !currentTerm?.id ||
      !classSubjectOfferingId
    )
      return [];

    const result = await staffHomeworkItems({
      action: "listQuestions",
      orgId: actor.orgId,
      offeringId: classSubjectOfferingId,
      termId: currentTerm.id,
    });
    return result.map((item) => QuestionBankItemSchema.parse(item));
  }, [actor?.orgId, subjectKey, classSubjectOfferingId, currentTerm?.id]);

  const {
    data: rawItems,
    loading,
    error: loadError,
    reload,
  } = useDocumentLoader<QuestionBankItem[]>({
    enabled: Boolean(actor?.orgId && subjectKey),
    loader: loadQuestionBankItems,
    deps: [actor?.orgId, subjectKey, classSubjectOfferingId, currentTerm?.id],
  });

  const questionBankItems = useMemo(() => {
    if (!actor?.orgId || !subjectKey) return [];

    return filterQuestionBankForSubjectContext({
      items: (rawItems ?? []).filter(
        (item) =>
          item.schoolId && item.academicYearId && item.classSubjectOfferingId,
      ),
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

  const selectedQuestions = useMemo(() => {
    const selectedIds = new Set(selectedQuestionIds);

    return questionBankItems.filter((item) => selectedIds.has(item.id));
  }, [questionBankItems, selectedQuestionIds]);

  const selectedMaxScore = useMemo(() => {
    const snapshots = selectedQuestions.map((item, index) =>
      buildHomeworkQuestionSnapshot(item, {
        id: `q-${index + 1}-${item.id}`,
        order: index,
      }),
    );

    return calculateHomeworkMaxScore(snapshots);
  }, [selectedQuestions]);

  function toggleQuestion(questionId: string) {
    setSelectedQuestionIds((current) => {
      if (current.includes(questionId)) {
        return current.filter((id) => id !== questionId);
      }

      return [...current, questionId];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!actor?.orgId) {
      setError("تعذر تحديد المؤسسة الحالية.");
      return;
    }

    if (!visibleClass) {
      setError("لا يمكن إنشاء واجب لفصل غير موجود ضمن نطاق المستخدم.");
      return;
    }

    if (!subjectKey || !classSubjectOfferingId) {
      setError("سياق المادة غير مكتمل.");
      return;
    }

    if (!currentTerm?.id) {
      setError("لا يوجد فصل دراسي حالي لهذا العام الدراسي.");
      return;
    }

    if (!title.trim()) {
      setError("عنوان الواجب مطلوب.");
      return;
    }

    if (selectedQuestions.length === 0) {
      setError("يجب اختيار سؤال واحد على الأقل لإنشاء الواجب.");
      return;
    }

    const questions = selectedQuestions.map((item, index) =>
      buildHomeworkQuestionSnapshot(item, {
        id: `q-${index + 1}-${item.id}`,
        order: index,
      }),
    );

    const questionsValidation = validateHomeworkQuestions(questions);

    if (!questionsValidation.ok) {
      setError(questionsValidation.errors.join("\n"));
      return;
    }

    const now = Date.now();

    const maxScore = calculateHomeworkMaxScore(questions);
    const dueAt = parseDatetimeLocalToMs(dueAtText);

    const rawAssignment = {
      id: "pending",

      orgId: actor.orgId,
      schoolId: resolvedSchoolId || "",
      academicYearId: resolvedAcademicYearId || "",

      termId: currentTerm.id,
      termTitle: currentTerm.title ?? "",
      termShortTitle: currentTerm.shortTitle ?? "",

      gradeId: resolvedGradeId || "",
      classId: visibleClass.id,

      subjectKey,
      classSubjectOfferingId,

      title: title.trim(),
      description: description.trim(),

      status: "DRAFT",
      publishMode: "DRAFT_ONLY",
      gradingMode: "MIXED",

      questions,
      maxScore,

      targetStudentIds: [],
      targetCount: 0,

      submittedCount: 0,
      gradedCount: 0,
      missingCount: 0,

      dueAt,

      createdByPersonId: actor.personId || actor.uid,

      operationalAssignmentId: "",
      teacherAssignmentId: "",

      note: "",

      createdAt: now,
      updatedAt: now,
    };

    const parsedAssignment =
      StudentHomeworkAssignmentSchema.parse(rawAssignment);

    setSaving(true);

    try {
      const result = await staffHomework<{ id: string }>({
        action: "createAssignment",
        orgId: actor.orgId,
        offeringId: classSubjectOfferingId,
        item: stripUndefined(parsedAssignment),
        questionIds: selectedQuestions.map((item) => item.id),
      });

      router.push(
        buildHomeworkDetailsHref({
          classId: visibleClass.id,
          homeworkId: result.id,
        }),
      );
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "حدث خطأ أثناء حفظ الواجب.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

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
                يجب فتح إنشاء الواجب من صفحة بنك أسئلة المادة حتى يصل subjectKey
                و classSubjectOfferingId بشكل صحيح.
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
          href={questionBankHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لبنك الأسئلة
        </Link>

        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          تحديث الأسئلة
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <BookOpenCheck className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              إنشاء واجب من بنك الأسئلة
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
      </section>

      {error ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-bold">تعذر حفظ الواجب</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7">
                {error}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {loadError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-bold">تعذر تحميل الأسئلة</h2>
              <p className="mt-2 text-sm leading-7">{loadError}</p>
            </div>
          </div>
        </section>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid gap-5 xl:grid-cols-[1fr_24rem]"
      >
        <section className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-violet-700 dark:text-violet-300" />
              <h2 className="font-bold">بيانات الواجب</h2>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label
                  htmlFor="title"
                  className="text-sm font-bold text-slate-800 dark:text-slate-100"
                >
                  عنوان الواجب
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="مثال: واجب درس جمع الكسور"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="text-sm font-bold text-slate-800 dark:text-slate-100"
                >
                  وصف الواجب اختياري
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="تعليمات مختصرة للطلاب..."
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                />
              </div>

              <div>
                <label
                  htmlFor="dueAt"
                  className="text-sm font-bold text-slate-800 dark:text-slate-100"
                >
                  موعد التسليم اختياري
                </label>
                <input
                  id="dueAt"
                  type="datetime-local"
                  value={dueAtText}
                  onChange={(event) => setDueAtText(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-bold">اختر أسئلة الواجب</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  سيتم حفظ نسخة Snapshot من الأسئلة المختارة داخل الواجب.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                المختار: {formatNumber(selectedQuestions.length)}
              </div>
            </div>

            {loading ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : null}

            {!loading && questionBankItems.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <h3 className="font-bold">لا توجد أسئلة متاحة</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
                  أضف أسئلة أولًا في بنك الأسئلة، ثم ارجع لإنشاء الواجب.
                </p>

                <Link
                  href={questionBankHref}
                  className="mt-5 inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  فتح بنك الأسئلة
                </Link>
              </div>
            ) : null}

            {!loading && questionBankItems.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {questionBankItems.map((item) => {
                  const checked = selectedQuestionIds.includes(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleQuestion(item.id)}
                      className={`rounded-3xl border p-4 text-start transition ${
                        checked
                          ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40"
                          : "border-slate-200 bg-slate-50 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                      }`}
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

                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                            checked
                              ? "bg-violet-600 text-white"
                              : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                          }`}
                        >
                          {checked ? "مختار" : "اختيار"}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {item.prompt}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                          الدرجة: {formatNumber(item.maxScore)}
                        </span>

                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                          {getDifficultyLabel(item.difficulty)}
                        </span>

                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                          {item.gradingMode}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        آخر تحديث:{" "}
                        {formatDate(item.updatedAt || item.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold">ملخص المسودة</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  عدد الأسئلة
                </span>
                <span className="font-bold">
                  {formatNumber(selectedQuestions.length)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  الدرجة الكلية
                </span>
                <span className="font-bold">
                  {formatNumber(selectedMaxScore)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  الحالة
                </span>
                <span className="font-bold">مسودة</span>
              </div>
            </div>
          </section>

          {/* <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <div className="mb-3 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ماذا يحدث عند الحفظ؟
            </div>
            سيتم إنشاء واجب بحالة DRAFT داخل studentHomeworkAssignments، وتُحفظ
            الأسئلة المختارة كنسخة Snapshot داخل الواجب.
          </section> */}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-black transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ كمسودة
          </button>
        </aside>
      </form>
    </main>
  );
}
