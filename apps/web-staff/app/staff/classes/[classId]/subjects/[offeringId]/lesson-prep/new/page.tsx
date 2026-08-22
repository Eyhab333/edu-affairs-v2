"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { addDoc, collection } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  hasActiveLessonPrepWorkspaceAccess,
  type LessonPrepWorkspaceActor,
} from "@/lib/lesson-prep-workspace-access";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  Save,
} from "lucide-react";

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getSafeText(value: string | null, fallback = "غير محدد") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function buildQueryString(searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export default function NewSubjectLessonPrepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const staffActor = actor as (LessonPrepWorkspaceActor & {
    orgId?: string;
    person?: { displayName?: string } | null;
    userProfile?: { displayName?: string } | null;
  }) | null;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedLessonPrepId, setSavedLessonPrepId] = useState("");

  const classId = decodeURIComponent(getParamValue(params.classId));
  const offeringId = decodeURIComponent(getParamValue(params.offeringId));

  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");
  const gradeId = searchParams.get("gradeId");
  const termId = searchParams.get("termId");
  const termTitle = searchParams.get("termTitle");
  const termShortTitle = searchParams.get("termShortTitle");
  const subjectKey = searchParams.get("subjectKey");
  const subjectTitle = searchParams.get("subjectTitle");
  const teacherAssignmentId = searchParams.get("teacherAssignmentId");
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

  const preservedQuery = new URLSearchParams(searchParams.toString());

  const listHref = `/staff/classes/${encodeURIComponent(
    classId,
  )}/subjects/${encodeURIComponent(offeringId)}/lesson-prep${buildQueryString(
    preservedQuery,
  )}`;

  async function handleSaveDraft(formData: FormData) {
    const orgId = staffActor?.orgId || "";

    setSaveError("");
    setSavedLessonPrepId("");

    if (!orgId) {
      setSaveError("لم يتم تحديد orgId من بيانات المستخدم.");
      return;
    }

    if (!hasActiveWorkspaceAccess) {
      setSaveError("هذا الفصل أو المادة خارج نطاق إسنادك الحالي.");
      return;
    }

    if (!schoolId || !academicYearId || !termId) {
      setSaveError(
        "لا يمكن حفظ التحضير بدون schoolId و academicYearId و termId.",
      );
      return;
    }

    const now = Date.now();

    const lessonTitle = String(formData.get("lessonTitle") || "").trim();

    if (!lessonTitle) {
      setSaveError("عنوان الدرس مطلوب قبل حفظ المسودة.");
      return;
    }

    setSaving(true);

    try {
      const docRef = await addDoc(
        collection(db, "orgs", orgId, "subjectLessonPreps"),
        {
          orgId,
          schoolId,
          academicYearId,
          gradeId: gradeId || "",

          termId,
          termTitle: termTitle || "",
          termShortTitle: termShortTitle || "",

          classId,
          classSubjectOfferingId: offeringId,
          subjectKey: subjectKey || "",

          teacherPersonId: staffActor?.personId || staffActor?.uid || "",
          teacherDisplayName:
            staffActor?.person?.displayName ||
            staffActor?.userProfile?.displayName ||
            "",
          teacherAssignmentId: teacherAssignmentId || "",

          lessonTitle,
          unitTitle: String(formData.get("unitTitle") || "").trim(),
          weekLabel: String(formData.get("weekLabel") || "").trim(),
          lessonDate: String(formData.get("lessonDate") || "").trim(),
          durationMinutes: String(formData.get("durationMinutes") || "").trim(),
          lessonNumber: String(formData.get("lessonNumber") || "").trim(),

          objectives: String(formData.get("objectives") || "").trim(),
          learningOutcomes: String(
            formData.get("learningOutcomes") || "",
          ).trim(),
          warmup: String(formData.get("warmup") || "").trim(),
          lessonSteps: String(formData.get("lessonSteps") || "").trim(),
          strategies: String(formData.get("strategies") || "").trim(),
          resources: String(formData.get("resources") || "").trim(),
          assessment: String(formData.get("assessment") || "").trim(),
          homeworkNote: String(formData.get("homeworkNote") || "").trim(),

          reviewMode: "APPROVAL_REQUIRED",
          approvalRequired: true,

          reviewerPersonId: "",
          // reviewerRoleKey: undefined,
          reviewerSource: "NONE",
          reviewerAssignedAt: null,

          reviewedByPersonId: "",
          reviewedAt: null,

          status: "DRAFT",

          createdAt: now,
          updatedAt: now,
          submittedAt: null,
          approvedAt: null,
          approvedByPersonId: "",
          returnedAt: null,
          returnedByPersonId: "",
          returnReason: "",
          lockedAt: null,
          cancelledAt: null,
          metadata: {},
        },
      );

      setSavedLessonPrepId(docRef.id);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "فشل حفظ مسودة التحضير.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!hasActiveWorkspaceAccess) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <h1 className="font-bold">لا يمكن إنشاء تحضير</h1>
          <p className="mt-2 text-sm leading-7">
            هذا الفصل أو المادة خارج نطاق إسنادك الحالي.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href={listHref}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          الرجوع إلى تحضير الدروس
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <BookOpenCheck className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                تحضير درس جديد
              </h1>

              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
                أضف تفاصيل الدرس واحفظ التحضير كمسودة للعودة إليه لاحقًا.
              </p>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <p>
                  <span className="text-slate-500 dark:text-slate-400">المادة:</span>{" "}
                  <span className="font-semibold">
                    {getSafeText(subjectTitle, "المادة")}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-slate-400">
                    الفصل الدراسي:
                  </span>{" "}
                  <span className="font-semibold">
                    {getSafeText(termShortTitle || termTitle)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </header>

        <form
          action={handleSaveDraft}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ClipboardList className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-bold">بيانات التحضير</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                أدخل عناصر التحضير الأساسية للدرس.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <TextField
              label="عنوان الدرس"
              name="lessonTitle"
              placeholder="مثال: جمع الكسور المتشابهة"
            />

            <TextField
              label="الوحدة"
              name="unitTitle"
              placeholder="مثال: الوحدة الثالثة"
            />

            <TextField
              label="الأسبوع"
              name="weekLabel"
              placeholder="مثال: الأسبوع الخامس"
            />

            <TextField label="تاريخ الدرس" name="lessonDate" type="date" />

            <TextField
              label="زمن الحصة"
              name="durationMinutes"
              placeholder="مثال: 45 دقيقة"
            />

            <TextField
              label="رقم الحصة / الدرس"
              name="lessonNumber"
              placeholder="مثال: الدرس الثاني"
            />
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
            <div className="mb-5">
              <h3 className="font-bold">تفاصيل الدرس</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                وضّح أهداف الدرس وتسلسله وطرق تقويم تعلم الطلاب.
              </p>
            </div>

            <div className="grid gap-5">
              <TextareaField
                label="أهداف الدرس"
                name="objectives"
                placeholder="اكتب الأهداف التعليمية المتوقعة من الدرس..."
              />

              <TextareaField
                label="نواتج التعلم"
                name="learningOutcomes"
                placeholder="ما الذي يتوقع أن يتقنه الطالب بعد نهاية الدرس؟"
              />

              <TextareaField
                label="التمهيد"
                name="warmup"
                placeholder="كيف ستبدأ الدرس؟ سؤال تمهيدي، موقف، مراجعة سريعة..."
              />

              <TextareaField
                label="خطوات عرض الدرس"
                name="lessonSteps"
                placeholder="اكتب تسلسل عرض الدرس والأنشطة الصفية..."
                rows={6}
              />

              <TextareaField
                label="الاستراتيجيات المستخدمة"
                name="strategies"
                placeholder="تعلم تعاوني، عصف ذهني، حل مشكلات، تعلم باللعب..."
              />

              <TextareaField
                label="الوسائل التعليمية"
                name="resources"
                placeholder="كتاب، سبورة، عرض، ورقة عمل، وسيلة محسوسة..."
              />

              <TextareaField
                label="التقويم"
                name="assessment"
                placeholder="أسئلة ختامية، بطاقة خروج، نشاط تطبيقي، ملاحظة أداء..."
              />

              <TextareaField
                label="الواجب / الملاحظات"
                name="homeworkNote"
                placeholder="واجب مرتبط أو ملاحظات للدرس..."
              />
            </div>
          </div>

          {saveError ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
              {saveError}
            </div>
          ) : null}

          {savedLessonPrepId ? (
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold">تم حفظ مسودة التحضير بنجاح.</p>

              <Link
                href={`/staff/classes/${encodeURIComponent(
                  classId,
                )}/subjects/${encodeURIComponent(
                  offeringId,
                )}/lesson-prep/${encodeURIComponent(
                  savedLessonPrepId,
                )}${buildQueryString(preservedQuery)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                فتح التحضير
              </Link>
            </div>
          ) : null}

          <div className="mt-8 flex justify-start border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {saving ? "جاري الحفظ..." : "حفظ مسودة"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function TextField({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-700 dark:focus:ring-emerald-950"
      />
    </label>
  );
}

function TextareaField({
  label,
  name,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-700 dark:focus:ring-emerald-950"
      />
    </label>
  );
}
