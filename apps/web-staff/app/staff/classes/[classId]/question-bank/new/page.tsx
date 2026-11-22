"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  QuestionBankItemSchema,
  type QuestionBankItem,
} from "@takween/contracts";
import { validateQuestionBankItem } from "@takween/domain";

import { staffHomework } from "@/lib/staff-homework";
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

type ChoiceDraft = {
  id: string;
  text: string;
};

function normalizeSubjectKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase();
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

function splitTags(value: string) {
  return value
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export default function NewQuestionBankItemPage() {
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

  const [questionType, setQuestionType] =
    useState<QuestionBankItem["questionType"]>("MULTIPLE_CHOICE");

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] =
    useState<QuestionBankItem["difficulty"]>("MEDIUM");
  const [maxScore, setMaxScore] = useState("1");
  const [tagsText, setTagsText] = useState("");

  const [choices, setChoices] = useState<ChoiceDraft[]>([
    { id: "choice-1", text: "" },
    { id: "choice-2", text: "" },
    { id: "choice-3", text: "" },
    { id: "choice-4", text: "" },
  ]);

  const [correctChoiceId, setCorrectChoiceId] = useState("");
  const [trueFalseAnswer, setTrueFalseAnswer] = useState<"true" | "false">(
    "true",
  );
  const [shortAnswer, setShortAnswer] = useState("");

  const [shortAnswerGradingMode, setShortAnswerGradingMode] =
    useState<QuestionBankItem["gradingMode"]>("MIXED");

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

  const gradingMode: QuestionBankItem["gradingMode"] =
    questionType === "SHORT_ANSWER" ? shortAnswerGradingMode : "AUTO";

  function updateChoiceText(choiceId: string, text: string) {
    setChoices((current) =>
      current.map((choice) =>
        choice.id === choiceId ? { ...choice, text } : choice,
      ),
    );
  }

  function addChoice() {
    setChoices((current) => [
      ...current,
      {
        id: `choice-${current.length + 1}-${Date.now()}`,
        text: "",
      },
    ]);
  }

  function removeChoice(choiceId: string) {
    setChoices((current) => current.filter((choice) => choice.id !== choiceId));

    if (correctChoiceId === choiceId) {
      setCorrectChoiceId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!actor?.orgId) {
      setError("تعذر تحديد المؤسسة الحالية.");
      return;
    }

    if (!visibleClass) {
      setError("لا يمكن إنشاء سؤال لفصل غير موجود ضمن نطاق المستخدم.");
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

    const numericMaxScore = Number(maxScore);

    if (!Number.isFinite(numericMaxScore) || numericMaxScore <= 0) {
      setError("درجة السؤال يجب أن تكون رقمًا أكبر من صفر.");
      return;
    }

    const now = Date.now();

    const normalizedChoices =
      questionType === "MULTIPLE_CHOICE"
        ? choices
            .map((choice, index) => ({
              id: choice.id,
              text: choice.text.trim(),
              order: index,
            }))
            .filter((choice) => choice.text.length > 0)
        : [];

    const correctChoiceIds =
      questionType === "MULTIPLE_CHOICE" && correctChoiceId
        ? [correctChoiceId]
        : [];

    const correctAnswer =
      questionType === "TRUE_FALSE"
        ? trueFalseAnswer
        : questionType === "SHORT_ANSWER"
          ? shortAnswer.trim()
          : "";

    const rawItem = {
      id: "pending",

      orgId: actor.orgId,
      schoolId: resolvedSchoolId || "",
      schoolType: currentSchool?.profile?.schoolType,
      academicYearId: resolvedAcademicYearId || "",

      termId: currentTerm.id,
      termTitle: currentTerm.title ?? "",
      termShortTitle: currentTerm.shortTitle ?? "",

      subjectKey,
      gradeId: resolvedGradeId || "",
      classSubjectOfferingId,

      questionType,
      title: title.trim(),
      prompt: prompt.trim(),

      choices: normalizedChoices,

      correctAnswer,
      correctChoiceIds,

      explanation: explanation.trim(),
      difficulty,
      tags: splitTags(tagsText),

      maxScore: numericMaxScore,
      gradingMode,

      createdByPersonId: actor.personId || actor.uid,

      isActive: true,
      isArchived: false,

      createdAt: now,
      updatedAt: now,
    };

    const parsedItem = QuestionBankItemSchema.parse(rawItem);
    const validation = validateQuestionBankItem(parsedItem);

    if (!validation.ok) {
      setError(validation.errors.join("\n"));
      return;
    }

    setSaving(true);

    try {
      await staffHomework({
        action: "createQuestion",
        orgId: actor.orgId,
        offeringId: classSubjectOfferingId,
        item: stripUndefined(parsedItem),
      });
      router.push(questionBankHref);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "حدث خطأ أثناء حفظ السؤال.";
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
                يجب فتح صفحة إضافة السؤال من بنك أسئلة المادة حتى يصل subjectKey
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
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Plus className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              إضافة سؤال جديد
            </p>
            <button
              type="submit"
              form="new-question-bank-item-form"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-green-600  "
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ السؤال
            </button>
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
              <h2 className="font-bold">تعذر حفظ السؤال</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7">
                {error}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <form
        id="new-question-bank-item-form"
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5">
            <div>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                نوع السؤال
              </label>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(
                  ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as const
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setQuestionType(type);
                      setError(null);
                    }}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      questionType === type
                        ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {getQuestionTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="title"
                className="text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                عنوان مختصر اختياري
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثال: جمع عددين من رقمين"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
              />
            </div>

            <div>
              <label
                htmlFor="prompt"
                className="text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                نص السؤال
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="اكتب نص السؤال هنا..."
                rows={5}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                required
              />
            </div>

            {questionType === "MULTIPLE_CHOICE" ? (
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold">الاختيارات</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      أضف اختيارين على الأقل، وحدد الإجابة الصحيحة.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addChoice}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    اختيار
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {choices.map((choice, index) => (
                    <div
                      key={choice.id}
                      className="grid gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-[auto_1fr_auto]"
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <input
                          type="radio"
                          name="correctChoice"
                          checked={correctChoiceId === choice.id}
                          onChange={() => setCorrectChoiceId(choice.id)}
                          className="h-4 w-4"
                        />
                        صحيح
                      </label>

                      <input
                        value={choice.text}
                        onChange={(event) =>
                          updateChoiceText(choice.id, event.target.value)
                        }
                        placeholder={`الاختيار ${index + 1}`}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-900 dark:focus:border-violet-800"
                      />

                      <button
                        type="button"
                        onClick={() => removeChoice(choice.id)}
                        disabled={choices.length <= 2}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {questionType === "TRUE_FALSE" ? (
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <h2 className="font-bold">الإجابة الصحيحة</h2>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTrueFalseAnswer("true")}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      trueFalseAnswer === "true"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    صح
                  </button>

                  <button
                    type="button"
                    onClick={() => setTrueFalseAnswer("false")}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      trueFalseAnswer === "false"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    خطأ
                  </button>
                </div>
              </div>
            ) : null}

            {questionType === "SHORT_ANSWER" ? (
              <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                <h2 className="font-bold">الإجابة القصيرة</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      طريقة التصحيح
                    </label>
                    <select
                      value={shortAnswerGradingMode}
                      onChange={(event) =>
                        setShortAnswerGradingMode(
                          event.target.value as QuestionBankItem["gradingMode"],
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                    >
                      <option value="MIXED">مختلط</option>
                      <option value="AUTO">آلي</option>
                      <option value="MANUAL">يدوي</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      الإجابة النموذجية
                    </label>
                    <input
                      value={shortAnswer}
                      onChange={(event) => setShortAnswer(event.target.value)}
                      placeholder="مثال: 25"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label
                htmlFor="explanation"
                className="text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                شرح الإجابة اختياري
              </label>
              <textarea
                id="explanation"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                placeholder="اكتب شرحًا يظهر للمعلم أو للطالب لاحقًا..."
                rows={4}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
              />
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
              <h2 className="font-bold">إعدادات السؤال</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    درجة السؤال
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={maxScore}
                    onChange={(event) => setMaxScore(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    مستوى الصعوبة
                  </label>
                  <select
                    value={difficulty}
                    onChange={(event) =>
                      setDifficulty(
                        event.target.value as QuestionBankItem["difficulty"],
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                  >
                    <option value="EASY">سهل</option>
                    <option value="MEDIUM">متوسط</option>
                    <option value="HARD">صعب</option>
                    <option value="CHALLENGE">تحدي</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    الوسوم
                  </label>
                  <input
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder="مثال: جمع، مهارة أساسية"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-violet-800"
                  />
                  <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    افصل الوسوم بفاصلة.
                  </p>
                </div>
              </div>
            </div>

            {/* <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              سيتم حفظ السؤال داخل بنك الأسئلة مع سياق المادة والفصل الدراسي
              الحالي. وعند إنشاء واجب لاحقًا، سنأخذ Snapshot من السؤال داخل
              الواجب.
            </div> */}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ السؤال
            </button>
          </aside>
        </div>
      </form>
    </main>
  );
}
