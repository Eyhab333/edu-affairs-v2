"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers3,
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
  buildSubjectLessonPrepApprovePatch,
  buildSubjectLessonPrepReturnPatch,
  buildSubjectLessonPrepSubmitPatch,
  canSubmitSubjectLessonPrep,
  getSubjectLessonPrepStatusLabel,
} from "@takween/domain";
import {
  canReviewLessonPrepAtSchool,
  getLessonPrepReviewSchoolIds,
} from "@/lib/lesson-prep-review-policy";

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

  lockedAt?: number | null;
  cancelledAt?: number | null;
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

function formatDateTime(value?: number | null) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function getStatusClassName(status: SubjectLessonPrepStatus) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
    case "SUBMITTED":
      return "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
    case "RETURNED":
      return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "LOCKED":
      return "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export default function SubjectLessonPrepDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const staffActor = actor as StaffActorLike | null;

  const classId = decodeURIComponent(getParamValue(params.classId));
  const offeringId = decodeURIComponent(getParamValue(params.offeringId));
  const lessonPrepId = decodeURIComponent(getParamValue(params.lessonPrepId));

  const orgId = staffActor?.orgId || searchParams.get("orgId") || "";
  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");
  const gradeId = searchParams.get("gradeId");
  const termId = searchParams.get("termId");
  const termTitle = searchParams.get("termTitle");
  const termShortTitle = searchParams.get("termShortTitle");
  const subjectKey = searchParams.get("subjectKey");
  const actorPersonId = staffActor?.personId || "";
  const canAttemptReviewerAccess =
    getLessonPrepReviewSchoolIds(actorPersonId).length > 0;
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

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const preservedQuery = useMemo(() => {
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const listHref = hasActiveWorkspaceAccess
    ? `/staff/classes/${encodeURIComponent(
        classId,
      )}/subjects/${encodeURIComponent(offeringId)}/lesson-prep${buildQueryString(
        preservedQuery,
      )}`
    : "/staff/lesson-prep/approvals";

  const loadPrep = useCallback(async () => {
    if (!orgId || (!hasActiveWorkspaceAccess && !canAttemptReviewerAccess)) {
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

      const canReviewThisPrep =
        data.status === "SUBMITTED" &&
        canReviewLessonPrepAtSchool({
          personId: actorPersonId,
          schoolId: data.schoolId,
        });

      if (!hasActiveWorkspaceAccess && !canReviewThisPrep) {
        setPrep(null);
        setLoadError("لا تملك صلاحية فتح هذا التحضير.");
        return;
      }

      setPrep(data);
    } catch (error) {
      setPrep(null);
      setLoadError(
        error instanceof Error ? error.message : "فشل تحميل تفاصيل التحضير.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    orgId,
    hasActiveWorkspaceAccess,
    canAttemptReviewerAccess,
    lessonPrepId,
    classId,
    offeringId,
    actorPersonId,
  ]);

  useEffect(() => {
    void loadPrep();
  }, [loadPrep]);

  if (!hasActiveWorkspaceAccess && !canAttemptReviewerAccess) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6">
        <section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <h1 className="font-bold">لا يمكن فتح هذا التحضير</h1>
          <p className="mt-2 text-sm leading-7">
            هذا الفصل أو المادة خارج نطاق إسنادك الحالي.
          </p>
        </section>
      </main>
    );
  }

  const canReviewCurrentPrep = Boolean(
    prep &&
      prep.status === "SUBMITTED" &&
      canReviewLessonPrepAtSchool({
        personId: actorPersonId,
        schoolId: prep.schoolId,
      }),
  );

  async function getCurrentSubmittedPrep() {
    if (!orgId || !actorPersonId) {
      throw new Error("تعذر تحديد بيانات المراجع.");
    }

    const ref = doc(db, "orgs", orgId, "subjectLessonPreps", lessonPrepId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      throw new Error("لم يتم العثور على هذا التحضير.");
    }

    const current = { id: snap.id, ...snap.data() } as SubjectLessonPrep;

    if (current.status !== "SUBMITTED") {
      throw new Error("تمت مراجعة هذا التحضير بالفعل.");
    }

    if (
      !canReviewLessonPrepAtSchool({
        personId: actorPersonId,
        schoolId: current.schoolId,
      })
    ) {
      throw new Error("لا تملك صلاحية مراجعة هذا التحضير.");
    }

    return { ref, current };
  }

  async function handleSubmitPrep() {
    if (!orgId) {
      setActionError("لم يتم تحديد orgId من بيانات المستخدم.");
      return;
    }

    if (!prep) {
      setActionError("لم يتم تحميل التحضير بعد.");
      return;
    }

    const submitPermission = canSubmitSubjectLessonPrep(prep, {
      uid: staffActor?.uid,
      personId: staffActor?.personId,
    });

    if (!submitPermission.allowed) {
      setActionError(submitPermission.reason || "لا يمكن إرسال هذا التحضير.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    setActionMessage("");
    const now = Date.now();

    try {
      const ref = doc(db, "orgs", orgId, "subjectLessonPreps", lessonPrepId);
      const submitPatch = buildSubjectLessonPrepSubmitPatch(now);
      
      await updateDoc(ref, submitPatch);

      setPrep((current) => {
        if (!current) return current;

        return {
          ...current,
          ...submitPatch,
        };
      });

      setActionMessage("تم إرسال التحضير بنجاح.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "فشل إرسال التحضير.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprovePrep() {
    if (!orgId) {
      setActionError("لم يتم تحديد orgId من بيانات المستخدم.");
      return;
    }

    if (!canReviewCurrentPrep) {
      setActionError("لا تملك صلاحية اعتماد هذا التحضير.");
      return;
    }

    if (!prep) {
      setActionError("لم يتم تحميل التحضير بعد.");
      return;
    }

    if (prep.status !== "SUBMITTED") {
      setActionError("لا يمكن اعتماد التحضير إلا إذا كان في حالة مرسل.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { ref } = await getCurrentSubmittedPrep();
      const approvePatch = buildSubjectLessonPrepApprovePatch({
        actorPersonId,
        now: Date.now(),
      });

      await updateDoc(ref, approvePatch);

      setPrep((current) => {
        if (!current) return current;

        return {
          ...current,
          ...approvePatch,
        };
      });

      setActionMessage("تم اعتماد التحضير بنجاح.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "فشل اعتماد التحضير.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReturnPrep() {
    if (!orgId) {
      setActionError("لم يتم تحديد orgId من بيانات المستخدم.");
      return;
    }

    if (!canReviewCurrentPrep) {
      setActionError("لا تملك صلاحية إعادة هذا التحضير.");
      return;
    }

    if (!prep) {
      setActionError("لم يتم تحميل التحضير بعد.");
      return;
    }

    if (prep.status !== "SUBMITTED") {
      setActionError("لا يمكن إعادة التحضير إلا إذا كان في حالة مرسل.");
      return;
    }

    const normalizedReturnReason = returnReason.trim();

    if (!normalizedReturnReason) {
      setActionError("سبب الإعادة مطلوب.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { ref } = await getCurrentSubmittedPrep();
      const returnPatch = buildSubjectLessonPrepReturnPatch({
        actorPersonId,
        returnReason: normalizedReturnReason,
        now: Date.now(),
      });

      await updateDoc(ref, returnPatch);

      setPrep((current) => {
        if (!current) return current;

        return {
          ...current,
          ...returnPatch,
        };
      });

      setReturnReason("");
      setActionMessage("تمت إعادة التحضير للتعديل.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "فشل إعادة التحضير للتعديل.",
      );
    } finally {
      setActionLoading(false);
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
            href={listHref}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى تحضير الدروس
          </Link>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    Milestone 15F
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                      {prep?.lessonTitle || "تفاصيل التحضير"}
                    </h1>

                    <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                      صفحة عرض تفاصيل تحضير الدرس المحفوظ، مع سياق المادة والفصل
                      الدراسي والحالة الحالية.
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
                value={getSafeText(prep?.schoolId || schoolId)}
              />

              <ContextCard
                icon={CalendarDays}
                label="السنة الدراسية"
                value={getSafeText(prep?.academicYearId || academicYearId)}
              />

              <ContextCard
                icon={GraduationCap}
                label="الصف"
                value={getSafeText(prep?.gradeId || gradeId)}
              />

              <ContextCard
                icon={Layers3}
                label="المادة"
                value={getSafeText(prep?.subjectKey || subjectKey)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل تفاصيل التحضير...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
            {loadError}
          </div>
        ) : prep ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <ClipboardList className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-bold">محتوى التحضير</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      عناصر التحضير المحفوظة في المسودة.
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusClassName(
                    prep.status,
                  )}`}
                >
                  {getSubjectLessonPrepStatusLabel(prep.status)}
                </span>

                {prep.status === "RETURNED" && prep.returnReason ? (
                  <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-bold">سبب الإعادة:</p>
                    <p className="mt-1">{prep.returnReason}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <DisplayField label="عنوان الدرس" value={prep.lessonTitle} />
                <DisplayField label="الوحدة" value={prep.unitTitle} />
                <DisplayField label="الأسبوع" value={prep.weekLabel} />
                <DisplayField label="تاريخ الدرس" value={prep.lessonDate} />
                <DisplayField label="زمن الحصة" value={prep.durationMinutes} />
                <DisplayField
                  label="رقم الحصة / الدرس"
                  value={prep.lessonNumber}
                />
              </div>

              <div className="mt-6 grid gap-4">
                <DisplayTextArea label="أهداف الدرس" value={prep.objectives} />
                <DisplayTextArea
                  label="نواتج التعلم"
                  value={prep.learningOutcomes}
                />
                <DisplayTextArea label="التمهيد" value={prep.warmup} />
                <DisplayTextArea
                  label="خطوات عرض الدرس"
                  value={prep.lessonSteps}
                />
                <DisplayTextArea
                  label="الاستراتيجيات المستخدمة"
                  value={prep.strategies}
                />
                <DisplayTextArea
                  label="الوسائل التعليمية"
                  value={prep.resources}
                />
                <DisplayTextArea label="التقويم" value={prep.assessment} />
                <DisplayTextArea
                  label="الواجب / الملاحظات"
                  value={prep.homeworkNote}
                />
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-bold">بيانات السجل</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      سياق التحضير داخل Firestore.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-2 text-sm">
                  <InfoRow label="lessonPrepId" value={prep.id} />
                  <InfoRow label="orgId" value={prep.orgId} />
                  <InfoRow label="schoolId" value={prep.schoolId} />
                  <InfoRow label="academicYearId" value={prep.academicYearId} />
                  <InfoRow label="termId" value={prep.termId} />
                  <InfoRow label="termTitle" value={prep.termTitle} />
                  <InfoRow label="termShortTitle" value={prep.termShortTitle} />
                  <InfoRow label="classId" value={prep.classId} />
                  <InfoRow
                    label="offeringId"
                    value={prep.classSubjectOfferingId}
                  />
                  <InfoRow label="subjectKey" value={prep.subjectKey} />
                  <InfoRow
                    label="teacherPersonId"
                    value={prep.teacherPersonId}
                  />
                  <InfoRow
                    label="teacherAssignmentId"
                    value={prep.teacherAssignmentId || "غير محدد"}
                  />
                  <InfoRow
                    label="createdAt"
                    value={formatDateTime(prep.createdAt)}
                  />
                  <InfoRow
                    label="updatedAt"
                    value={formatDateTime(prep.updatedAt)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-bold">إجراءات التحضير</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      إرسال التحضير للمراجعة أو الاعتماد.
                    </p>
                  </div>
                </div>

                {actionError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-7 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
                    {actionError}
                  </div>
                ) : null}

                {actionMessage ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                    {actionMessage}
                  </div>
                ) : null}

                <div className="mt-5">
                  {prep.status === "DRAFT" || prep.status === "RETURNED" ? (
                    <Link
                      href={`/staff/classes/${encodeURIComponent(
                        classId,
                      )}/subjects/${encodeURIComponent(
                        offeringId,
                      )}/lesson-prep/${encodeURIComponent(lessonPrepId)}/edit${buildQueryString(
                        preservedQuery,
                      )}`}
                      className="mb-3 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      تعديل التحضير
                    </Link>
                  ) : null}

                  {prep.status === "DRAFT" || prep.status === "RETURNED" ? (
                    <button
                      type="button"
                      onClick={() => void handleSubmitPrep()}
                      disabled={actionLoading}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading
                        ? "جاري الإرسال..."
                        : prep.status === "RETURNED"
                          ? "إعادة إرسال التحضير"
                          : "إرسال التحضير"}
                    </button>
                  ) : prep.status === "SUBMITTED" && canReviewCurrentPrep ? (
                    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-7 text-foreground">
                      <div>
                        <p className="font-bold">مراجعة التحضير</p>
                        <p className="mt-1 text-muted-foreground">
                          يمكنك اعتماد التحضير أو إعادته إلى المعلم مع توضيح المطلوب.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleApprovePrep()}
                        disabled={actionLoading}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading ? "جارٍ الاعتماد..." : "اعتماد التحضير"}
                      </button>

                      <label className="block">
                        <span className="mb-1 block font-medium">سبب الإعادة</span>
                        <textarea
                          value={returnReason}
                          onChange={(event) => setReturnReason(event.target.value)}
                          rows={3}
                          placeholder="اكتب الملاحظات المطلوبة من المعلم"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => void handleReturnPrep()}
                        disabled={actionLoading || !returnReason.trim()}
                        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
                      >
                        {actionLoading ? "جارٍ الإعادة..." : "إعادة إلى المعلم"}
                      </button>
                    </div>
                  ) : prep.status === "SUBMITTED" ? (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                      <p className="font-bold">تم إرسال التحضير</p>
                      <p className="mt-1">
                        التحضير مرسل حاليًا. سيتم تفعيل مسار المراجعة والاعتماد
                        لاحقًا بعد ربط التحضير بالمراجع المسؤول.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      لا توجد إجراءات متاحة حاليًا لأن حالة التحضير هي:{" "}
                      <span className="font-bold">
                        {getSubjectLessonPrepStatusLabel(prep.status)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  المرحلة الحالية
                </div>

                <p className="mt-2">
                  تم تنفيذ إرسال التحضير. الخطوة التالية 15H ستكون اعتماد
                  التحضير أو إعادته للتعديل.
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

function DisplayField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-bold text-slate-950 dark:text-slate-50">
        {getSafeText(value)}
      </p>
    </div>
  );
}

function DisplayTextArea({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
        {getSafeText(value)}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-3 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="max-w-[12rem] truncate text-left font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
