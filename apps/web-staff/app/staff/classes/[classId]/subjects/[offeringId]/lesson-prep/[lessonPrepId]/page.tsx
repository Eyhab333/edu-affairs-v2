"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  RotateCcw,
  Send,
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
import { loadPersonSupervisionScopes } from "@/lib/person-supervision-scopes";
import type { PersonSupervisionScope } from "@takween/contracts";

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
  approvalNote?: string;

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
  const termId = searchParams.get("termId");
  const termTitle = searchParams.get("termTitle");
  const termShortTitle = searchParams.get("termShortTitle");
  const subjectTitle = searchParams.get("subjectTitle");
  const actorPersonId = staffActor?.personId || "";
  const [supervisionScopes, setSupervisionScopes] = useState<
    PersonSupervisionScope[]
  >([]);
  const [scopesLoading, setScopesLoading] = useState(true);
  const reviewSchoolIds = useMemo(
    () =>
      getLessonPrepReviewSchoolIds({
        orgId,
        personId: actorPersonId,
        scopes: supervisionScopes,
      }),
    [actorPersonId, orgId, supervisionScopes],
  );
  const canAttemptReviewerAccess =
    scopesLoading || reviewSchoolIds.length > 0;
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
  const [approvalNote, setApprovalNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [showReturnReason, setShowReturnReason] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadScopes() {
      if (!orgId || !actorPersonId) {
        if (!cancelled) {
          setSupervisionScopes([]);
          setScopesLoading(false);
        }
        return;
      }

      setScopesLoading(true);
      try {
        const nextScopes = await loadPersonSupervisionScopes({
          orgId,
          personId: actorPersonId,
        });
        if (!cancelled) setSupervisionScopes(nextScopes);
      } catch {
        if (!cancelled) setSupervisionScopes([]);
      } finally {
        if (!cancelled) setScopesLoading(false);
      }
    }

    void loadScopes();
    return () => {
      cancelled = true;
    };
  }, [actorPersonId, orgId]);

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
    if (scopesLoading) {
      setLoading(true);
      return;
    }

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
          orgId,
          personId: actorPersonId,
          schoolId: data.schoolId,
          subjectKey: data.subjectKey,
          scopes: supervisionScopes,
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
    scopesLoading,
    supervisionScopes,
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
        orgId,
        personId: actorPersonId,
        schoolId: prep.schoolId,
        subjectKey: prep.subjectKey,
        scopes: supervisionScopes,
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
        orgId,
        personId: actorPersonId,
        schoolId: current.schoolId,
        subjectKey: current.subjectKey,
        scopes: supervisionScopes,
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
        approvalNote,
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

      setApprovalNote("");
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

          <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {prep?.lessonTitle || "تفاصيل التحضير"}
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {[subjectTitle, termTitle || termShortTitle || prep?.termTitle]
                    .filter(Boolean)
                    .join(" · ") || "تحضير درس"}
                </p>
                {prep ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>{getSafeText(prep.weekLabel, "الأسبوع غير محدد")}</span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {getSafeText(prep.lessonDate, "التاريخ غير محدد")}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-4 w-4" />
                      {prep.durationMinutes
                        ? `${prep.durationMinutes} دقيقة`
                        : "المدة غير محددة"}
                    </span>
                  </div>
                ) : null}
              </div>

              <span
                className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${getStatusClassName(
                  prep?.status || "DRAFT",
                )}`}
              >
                {prep ? getSubjectLessonPrepStatusLabel(prep.status) : "غير محدد"}
              </span>
            </div>
          </header>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل تفاصيل التحضير...
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
            {loadError}
          </div>
        ) : prep ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-2xl bg-white px-5 py-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:px-7">
              {prep.status === "RETURNED" && prep.returnReason ? (
                <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-bold">أعيد التحضير للتعديل</p>
                  <p className="mt-1">{prep.returnReason}</p>
                </div>
              ) : null}

              <section>
                <SectionHeading title="بيانات الدرس" />
                <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DisplayField label="الوحدة" value={prep.unitTitle} />
                  <DisplayField label="الأسبوع" value={prep.weekLabel} />
                  <DisplayField label="تاريخ الدرس" value={prep.lessonDate} />
                  <DisplayField
                    label="رقم الحصة / الدرس"
                    value={prep.lessonNumber}
                  />
                  <DisplayField label="زمن الحصة" value={`${prep.durationMinutes} دقيقة`} />
                </div>
              </section>

              <section className="mt-10 border-t border-slate-100 pt-8 dark:border-slate-800">
                <SectionHeading title="الأهداف ونواتج التعلم" />
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <DisplayTextArea label="أهداف الدرس" value={prep.objectives} />
                  <DisplayTextArea
                    label="نواتج التعلم"
                    value={prep.learningOutcomes}
                  />
                </div>
              </section>

              <section className="mt-10 border-t border-slate-100 pt-8 dark:border-slate-800">
                <SectionHeading title="تنفيذ الدرس" />
                <div className="mt-4 grid gap-5 md:grid-cols-2">
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
                </div>
              </section>

              <section className="mt-10 border-t border-slate-100 pt-8 dark:border-slate-800">
                <SectionHeading title="التقويم والمتابعة" />
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <DisplayTextArea label="التقويم" value={prep.assessment} />
                  <DisplayTextArea
                    label="الواجب / الملاحظات"
                    value={prep.homeworkNote}
                  />
                </div>
              </section>
            </div>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-bold">إجراءات التحضير</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      اختر الإجراء المناسب لحالة التحضير.
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

                <div className="mt-5 space-y-3">
                  {prep.status === "DRAFT" || prep.status === "RETURNED" ? (
                    <Link
                      href={`/staff/classes/${encodeURIComponent(
                        classId,
                      )}/subjects/${encodeURIComponent(
                        offeringId,
                      )}/lesson-prep/${encodeURIComponent(lessonPrepId)}/edit${buildQueryString(
                        preservedQuery,
                      )}`}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                      تعديل التحضير
                    </Link>
                  ) : null}

                  {prep.status === "DRAFT" || prep.status === "RETURNED" ? (
                    <button
                      type="button"
                      onClick={() => void handleSubmitPrep()}
                      disabled={actionLoading}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      {actionLoading
                        ? "جاري الإرسال..."
                        : prep.status === "RETURNED"
                          ? "إعادة إرسال التحضير"
                          : "إرسال للاعتماد"}
                    </button>
                  ) : prep.status === "SUBMITTED" && canReviewCurrentPrep ? (
                    <div className="space-y-3 text-sm leading-7">
                      <p className="font-bold">مراجعة التحضير</p>
                      <label className="block">
                        <span className="mb-1 block font-medium">ملاحظة الاعتماد (اختيارية)</span>
                        <textarea
                          value={approvalNote}
                          onChange={(event) => setApprovalNote(event.target.value)}
                          rows={3}
                          placeholder="اكتب ملاحظة اختيارية للمعلم"
                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-slate-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleApprovePrep()}
                        disabled={actionLoading}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {actionLoading ? "جارٍ الاعتماد..." : "اعتماد التحضير"}
                      </button>

                      {!showReturnReason ? (
                        <button
                          type="button"
                          onClick={() => setShowReturnReason(true)}
                          disabled={actionLoading}
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
                        >
                          <RotateCcw className="h-4 w-4" />
                          إعادة إلى المعلم
                        </button>
                      ) : (
                        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                          <label className="block">
                            <span className="mb-1 block font-medium">سبب الإعادة</span>
                            <textarea
                              value={returnReason}
                              onChange={(event) => setReturnReason(event.target.value)}
                              rows={3}
                              placeholder="اكتب الملاحظات المطلوبة من المعلم"
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-amber-500 dark:border-amber-900/60 dark:bg-slate-900 dark:text-slate-50"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => void handleReturnPrep()}
                            disabled={actionLoading || !returnReason.trim()}
                            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-amber-300 bg-amber-100 px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950/70"
                          >
                            {actionLoading ? "جارٍ الإعادة..." : "تأكيد الإعادة"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : prep.status === "SUBMITTED" ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                      <p className="font-bold">بانتظار المراجعة</p>
                      <p className="mt-1">
                        تم إرسال التحضير بنجاح، وهو الآن بانتظار مراجعة المشرف.
                      </p>
                    </div>
                  ) : prep.status === "APPROVED" ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                      <p className="font-bold">تم اعتماد التحضير</p>
                      <p className="mt-1">تمت مراجعة هذا التحضير واعتماده بنجاح.</p>
                      {prep.approvalNote?.trim() ? (
                        <div className="mt-3 border-t border-emerald-200 pt-3 dark:border-emerald-900/60">
                          <p className="font-bold">ملاحظة المشرف</p>
                          <p className="mt-1 whitespace-pre-wrap">{prep.approvalNote}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      حالة التحضير الحالية: {" "}
                      <span className="font-bold">
                        {getSubjectLessonPrepStatusLabel(prep.status)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50">
      {title}
    </h2>
  );
}

function DisplayField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 font-semibold text-slate-950 dark:text-slate-50">
        {getSafeText(value)}
      </p>
    </div>
  );
}

function DisplayTextArea({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 min-h-16 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
        {getSafeText(value)}
      </p>
    </div>
  );
}
