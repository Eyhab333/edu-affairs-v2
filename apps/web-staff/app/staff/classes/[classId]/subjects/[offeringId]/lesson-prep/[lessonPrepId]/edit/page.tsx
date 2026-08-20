"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers3,
  Save,
  School,
} from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  hasActiveLessonPrepWorkspaceAccess,
  type LessonPrepWorkspaceActor,
} from "@/lib/lesson-prep-workspace-access";
import { useStaffActor } from "@/components/staff/staff-actor-provider";

import {
  buildSubjectLessonPrepEditPatch,
  canEditSubjectLessonPrep,
  getSubjectLessonPrepStatusLabel,
} from "@takween/domain";

type StaffActorLike = LessonPrepWorkspaceActor & {
  orgId?: string;
};

type SubjectLessonPrepStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "RETURNED"
  | "LOCKED"
  | "CANCELLED";

type SubjectLessonPrep = {
  id: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;

  termId: string;
  termTitle: string;
  termShortTitle: string;

  classId: string;
  classSubjectOfferingId: string;
  subjectKey: string;

  teacherPersonId: string;
  teacherAssignmentId: string;

  lessonTitle: string;
  unitTitle: string;
  weekLabel: string;
  lessonDate: string;
  durationMinutes: string;
  lessonNumber: string;

  objectives: string;
  learningOutcomes: string;
  warmup: string;
  lessonSteps: string;
  strategies: string;
  resources: string;
  assessment: string;
  homeworkNote: string;

  status: SubjectLessonPrepStatus;

  createdAt?: number;
  updatedAt?: number;
  submittedAt?: number | null;
  approvedAt?: number | null;
  approvedByPersonId?: string;
  returnedAt?: number | null;
  returnedByPersonId?: string;
  returnReason?: string;
};

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getSafeText(
  value: string | number | null | undefined,
  fallback = "غير محدد",
) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function buildQueryString(searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export default function EditSubjectLessonPrepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { actor } = useStaffActor();

  const staffActor = actor as StaffActorLike | null;

  const classId = decodeURIComponent(getParamValue(params.classId));
  const offeringId = decodeURIComponent(getParamValue(params.offeringId));
  const lessonPrepId = decodeURIComponent(getParamValue(params.lessonPrepId));

  const orgId = staffActor?.orgId || searchParams.get("orgId") || "";
  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");
  const termId = searchParams.get("termId");
  const hasActiveWorkspaceAccess = useMemo(() => {
    return hasActiveLessonPrepWorkspaceAccess({
      actor: staffActor,
      classId,
      offeringId,
      schoolId,
      academicYearId,
      termId,
    });
  }, [staffActor, classId, offeringId, schoolId, academicYearId, termId]);

  const [prep, setPrep] = useState<SubjectLessonPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const preservedQuery = useMemo(() => {
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const detailsHref = `/staff/classes/${encodeURIComponent(
    classId,
  )}/subjects/${encodeURIComponent(
    offeringId,
  )}/lesson-prep/${encodeURIComponent(lessonPrepId)}${buildQueryString(
    preservedQuery,
  )}`;

  const loadPrep = useCallback(async () => {
    if (!orgId || !hasActiveWorkspaceAccess) {
      setPrep(null);
      setLoadError("هذا الفصل أو المادة خارج نطاق إسنادك الحالي.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const ref = doc(db, "orgs", orgId, "subjectLessonPreps", lessonPrepId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setPrep(null);
        setLoadError("لم يتم العثور على هذا التحضير.");
        return;
      }

      const data = {
        id: snap.id,
        ...snap.data(),
      } as SubjectLessonPrep;

      if (
        data.classId !== classId ||
        data.classSubjectOfferingId !== offeringId
      ) {
        setPrep(null);
        setLoadError("هذا التحضير لا يطابق سياق الفصل أو المادة الحالية.");
        return;
      }

      const editPermission = canEditSubjectLessonPrep(
        data,
        staffActor
          ? {
              uid: staffActor.uid,
              personId: staffActor.personId,
            }
          : null,
      );

      if (!editPermission.allowed) {
        setPrep(null);
        setLoadError(
          editPermission.reason ||
            `لا يمكن تعديل هذا التحضير لأن حالته الحالية: ${getSubjectLessonPrepStatusLabel(
              data.status,
            )}.`,
        );
        return;
      }

      setPrep(data);
    } catch (error) {
      setPrep(null);
      setLoadError(
        error instanceof Error ? error.message : "فشل تحميل التحضير للتعديل.",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, hasActiveWorkspaceAccess, lessonPrepId, classId, offeringId]);

  useEffect(() => {
    void loadPrep();
  }, [loadPrep]);

  if (!hasActiveWorkspaceAccess) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <h1 className="font-bold">لا يمكن تعديل هذا التحضير</h1>
          <p className="mt-2 text-sm leading-7">
            هذا الفصل أو المادة خارج نطاق إسنادك الحالي.
          </p>
        </section>
      </main>
    );
  }

  async function handleSaveEdit(formData: FormData) {
    if (!orgId) {
      setSaveError("لم يتم تحديد orgId من بيانات المستخدم.");
      return;
    }

    if (!prep) {
      setSaveError("لم يتم تحميل التحضير بعد.");
      return;
    }

    const editPermission = canEditSubjectLessonPrep(prep, {
      uid: staffActor?.uid,
      personId: staffActor?.personId,
    });

    if (!editPermission.allowed) {
      setSaveError(editPermission.reason || "لا يمكن تعديل هذا التحضير.");
      return;
    }

    const lessonTitle = String(formData.get("lessonTitle") || "").trim();

    if (!lessonTitle) {
      setSaveError("عنوان الدرس مطلوب.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    const now = Date.now();

    try {
      const ref = doc(db, "orgs", orgId, "subjectLessonPreps", lessonPrepId);

      const patch = buildSubjectLessonPrepEditPatch(
        {
          lessonTitle,
          unitTitle: String(formData.get("unitTitle") || ""),
          weekLabel: String(formData.get("weekLabel") || ""),
          lessonDate: String(formData.get("lessonDate") || ""),
          durationMinutes: String(formData.get("durationMinutes") || ""),
          lessonNumber: String(formData.get("lessonNumber") || ""),

          objectives: String(formData.get("objectives") || ""),
          learningOutcomes: String(formData.get("learningOutcomes") || ""),
          warmup: String(formData.get("warmup") || ""),
          lessonSteps: String(formData.get("lessonSteps") || ""),
          strategies: String(formData.get("strategies") || ""),
          resources: String(formData.get("resources") || ""),
          assessment: String(formData.get("assessment") || ""),
          homeworkNote: String(formData.get("homeworkNote") || ""),
        },
        now,
      );

      await updateDoc(ref, patch);

      setPrep((current) => {
        if (!current) return current;

        return {
          ...current,
          ...patch,
        };
      });

      setSaveMessage("تم حفظ تعديلات التحضير بنجاح.");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "فشل حفظ تعديلات التحضير.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Link
            href={detailsHref}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى تفاصيل التحضير
          </Link>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    Milestone 15H-2
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                      تعديل التحضير
                    </h1>

                    <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                      يمكن تعديل التحضير إذا كان في حالة مسودة أو معادًا
                      للتعديل. بعد التعديل يمكن إعادة إرساله من صفحة التفاصيل.
                    </p>
                  </div>
                </div>

                <div className="w-fit rounded-3xl bg-slate-950 px-5 py-3 text-white dark:bg-slate-50 dark:text-slate-950">
                  <p className="text-xs opacity-70">الحالة</p>
                  <p className="text-2xl font-bold">
                    {prep
                      ? getSubjectLessonPrepStatusLabel(prep.status)
                      : "غير محدد"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <ContextCard
                icon={School}
                label="المدرسة"
                value={getSafeText(prep?.schoolId)}
              />

              <ContextCard
                icon={CalendarDays}
                label="السنة الدراسية"
                value={getSafeText(prep?.academicYearId)}
              />

              <ContextCard
                icon={GraduationCap}
                label="الصف"
                value={getSafeText(prep?.gradeId)}
              />

              <ContextCard
                icon={Layers3}
                label="المادة"
                value={getSafeText(prep?.subjectKey)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل التحضير...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
            {loadError}
          </div>
        ) : prep ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <form
              action={handleSaveEdit}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <ClipboardList className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="font-bold">تعديل بيانات التحضير</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    عدّل الحقول المطلوبة ثم احفظ التغييرات.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <TextField
                  label="عنوان الدرس"
                  name="lessonTitle"
                  defaultValue={prep.lessonTitle}
                />

                <TextField
                  label="الوحدة"
                  name="unitTitle"
                  defaultValue={prep.unitTitle}
                />

                <TextField
                  label="الأسبوع"
                  name="weekLabel"
                  defaultValue={prep.weekLabel}
                />

                <TextField
                  label="تاريخ الدرس"
                  name="lessonDate"
                  type="date"
                  defaultValue={prep.lessonDate}
                />

                <TextField
                  label="زمن الحصة"
                  name="durationMinutes"
                  defaultValue={prep.durationMinutes}
                />

                <TextField
                  label="رقم الحصة / الدرس"
                  name="lessonNumber"
                  defaultValue={prep.lessonNumber}
                />
              </div>

              <div className="mt-6 grid gap-4">
                <TextareaField
                  label="أهداف الدرس"
                  name="objectives"
                  defaultValue={prep.objectives}
                />

                <TextareaField
                  label="نواتج التعلم"
                  name="learningOutcomes"
                  defaultValue={prep.learningOutcomes}
                />

                <TextareaField
                  label="التمهيد"
                  name="warmup"
                  defaultValue={prep.warmup}
                />

                <TextareaField
                  label="خطوات عرض الدرس"
                  name="lessonSteps"
                  rows={6}
                  defaultValue={prep.lessonSteps}
                />

                <TextareaField
                  label="الاستراتيجيات المستخدمة"
                  name="strategies"
                  defaultValue={prep.strategies}
                />

                <TextareaField
                  label="الوسائل التعليمية"
                  name="resources"
                  defaultValue={prep.resources}
                />

                <TextareaField
                  label="التقويم"
                  name="assessment"
                  defaultValue={prep.assessment}
                />

                <TextareaField
                  label="الواجب / الملاحظات"
                  name="homeworkNote"
                  defaultValue={prep.homeworkNote}
                />
              </div>

              {saveError ? (
                <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
                  {saveError}
                </div>
              ) : null}

              {saveMessage ? (
                <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  {saveMessage}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(detailsHref)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  العودة للتفاصيل
                </button>
              </div>
            </form>

            <aside className="flex flex-col gap-4">
              {prep.status === "RETURNED" && prep.returnReason ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-bold">
                    <FileText className="h-4 w-4" />
                    سبب الإعادة
                  </div>

                  <p className="mt-2">{prep.returnReason}</p>
                </div>
              ) : null}

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  بعد الحفظ
                </div>

                <p className="mt-2">
                  ارجع إلى صفحة التفاصيل واضغط إعادة إرسال التحضير إذا كان
                  معادًا للتعديل.
                </p>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ContextCard({
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

function TextField({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-700 dark:focus:ring-emerald-950"
      />
    </label>
  );
}

function TextareaField({
  label,
  name,
  defaultValue,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-700 dark:focus:ring-emerald-950"
      />
    </label>
  );
}
