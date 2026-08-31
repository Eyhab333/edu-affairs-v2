"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import type {
  StudentAssessmentRecord,
  StudentLearningLossPlan,
  StudentTrackerEntry,
} from "@takween/contracts";
import {
  buildLearningLossImprovementUpdateFields,
  calculateLearningLossImprovement,
  getLearningLossFollowUpState,
  getLearningLossFollowUpStateLabel,
  hasLearningLossFirstCheck,
  resolveLearningLossStatus,
} from "@takween/domain";

import { db } from "@/lib/firebase";
import { getClassRoster } from "@/lib/class-roster";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  getFriendlyClassTitle,
  isTechnicalIdentifier,
  normalizeText,
} from "@/lib/class-presentation";

type VisibleClass = {
  id: string;
  title?: string;
  code?: string;
  schoolId?: string;
  schoolName?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
  streamId?: string;
  sectionLabel?: string;
};

type VisibleOffering = {
  id: string;
  classId?: string;
  displayName?: string;
  shortLabel?: string;
  subjectTitleSnapshot?: string;
  subjectKey?: string;
  subjectId?: string;
};

type StaffLearningLossActor = {
  uid?: string;
  orgId: string;
  personId?: string;
  roles?: string[];
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
  classSubjectOfferings?: VisibleOffering[];
};

type LearningLossPlanDoc = StudentLearningLossPlan & {
  id: string;
  classSubjectOfferingId?: string;
  sourceBatchId?: string;
};

type StudentSummary = {
  id: string;
  personId?: string;
  displayName: string;
};

type SourceAssessmentRecord = StudentAssessmentRecord & {
  id: string;
  classSubjectOfferingId?: string;
  batchId?: string;
};

type SourceTrackerEntry = StudentTrackerEntry & {
  id: string;
  classSubjectOfferingId?: string;
  batchId?: string;
};

type LoadingState = "idle" | "loading" | "success" | "error";

type CheckForm = {
  score: string;
  maxScore: string;
  measuredAt: string;
  note: string;
};

type CheckKind = "first" | "second";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function nowMs() {
  return Date.now();
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function toDateInputValue(value?: number) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateInputToMs(value: string) {
  if (!value) return undefined;

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return undefined;

  return date.getTime();
}

function parseOptionalNumber(value: string) {
  if (value.trim() === "") return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return undefined;

  return numberValue;
}

function formatScore(score?: number, maxScore?: number) {
  const safeScore =
    typeof score === "number" ? score.toLocaleString("ar-SA") : "—";

  const safeMaxScore =
    typeof maxScore === "number" ? maxScore.toLocaleString("ar-SA") : "—";

  return `${safeScore} / ${safeMaxScore}`;
}

function calculatePercentage(score?: number, maxScore?: number) {
  if (
    typeof score !== "number" ||
    typeof maxScore !== "number" ||
    maxScore <= 0
  ) {
    return null;
  }

  return (score / maxScore) * 100;
}

function formatPercentage(score?: number, maxScore?: number) {
  const percentage = calculatePercentage(score, maxScore);

  if (percentage === null) return "—";

  return `${percentage.toFixed(1)}%`;
}

function getIndicatorLabel(value?: string) {
  switch (value) {
    case "IMPROVED":
      return "تحسن واضح";
    case "PARTIAL_IMPROVEMENT":
      return "تحسن جزئي";
    case "NO_IMPROVEMENT":
      return "لا يوجد تحسن";
    case "REGRESSED":
      return "تراجع";
    default:
      return "غير محسوب";
  }
}

function getStatusLabel(value?: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "ACTIVE":
      return "نشطة";
    case "IN_PROGRESS":
      return "قيد المتابعة";
    case "IMPROVED":
      return "تحسن";
    case "PARTIALLY_IMPROVED":
      return "تحسن جزئي";
    case "NOT_IMPROVED":
      return "لم يتحسن";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "غير محدد";
  }
}

function getSourceTypeLabel(value?: string) {
  switch (value) {
    case "ASSESSMENT_RECORD":
      return "من قياس";
    case "TRACKER_ENTRY":
      return "من متابعة";
    case "MANUAL":
      return "فتح يدوي";
    default:
      return value || "غير محدد";
  }
}

function getVisibleClassKey(item: VisibleClass) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.id,
  ].join("::");
}

function getPlanClassKey(item: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.classId || "NO_CLASS",
  ].join("::");
}

function getClassLabel(
  classInfo: VisibleClass | null,
  visibleClasses: VisibleClass[],
) {
  if (!classInfo) return "الفصل الحالي";

  return getFriendlyClassTitle(classInfo, visibleClasses) || "الفصل الحالي";
}

function getSubjectLabel(
  plan: LearningLossPlanDoc,
  offerings: VisibleOffering[],
) {
  const offering = offerings.find(
    (item) => item.id === plan.classSubjectOfferingId,
  );

  const candidates = [
    offering?.displayName,
    offering?.shortLabel,
    offering?.subjectTitleSnapshot,
  ];

  return (
    candidates
      .map((value) => normalizeText(value))
      .find(
        (value) =>
          Boolean(value) &&
          !isTechnicalIdentifier(value) &&
          ![
            plan.classSubjectOfferingId,
            offering?.subjectId,
            offering?.subjectKey,
            plan.subjectKey,
          ]
            .filter(Boolean)
            .some(
              (identifier) =>
                value.toLowerCase() === identifier!.toLowerCase(),
            ),
      ) || null
  );
}

function getSkillSeverityLabel(value?: string) {
  switch (value) {
    case "LOW":
      return "منخفضة";
    case "MEDIUM":
      return "متوسطة";
    case "HIGH":
      return "مرتفعة";
    case "CRITICAL":
      return "عاجلة";
    default:
      return value || "غير محددة";
  }
}

function getRemediationActionStatusLabel(value?: string) {
  switch (value) {
    case "PLANNED":
      return "مخطط لها";
    case "IN_PROGRESS":
      return "قيد التنفيذ";
    case "COMPLETED":
      return "مكتملة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "غير محددة";
  }
}

function buildLearningLossListHref(plan: LearningLossPlanDoc) {
  const params = new URLSearchParams();

  if (plan.classId) params.set("classId", plan.classId);
  if (plan.schoolId) params.set("schoolId", plan.schoolId);
  if (plan.academicYearId) {
    params.set("academicYearId", plan.academicYearId);
  }
  if (plan.subjectKey) params.set("subjectKey", plan.subjectKey);
  if (plan.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", plan.classSubjectOfferingId);
  }

  const queryString = params.toString();

  return `/staff/learning-loss${queryString ? `?${queryString}` : ""}`;
}

async function loadStudentName(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  studentId: string;
}): Promise<StudentSummary> {
  if (!params.schoolId || !params.academicYearId || !params.classId) {
    return { id: params.studentId, displayName: "طالب غير محدد" };
  }

  const roster = await getClassRoster({
    orgId: params.orgId,
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    classId: params.classId,
  });
  const displayName = roster.rows.find(
    (row) => row.studentId === params.studentId,
  )?.displayName;

  return {
    id: params.studentId,
    displayName: displayName || "طالب غير محدد",
  };
}

async function loadSourceAssessmentRecord(
  orgId: string,
  recordId: string,
): Promise<SourceAssessmentRecord | null> {
  if (!recordId) return null;

  try {
    const ref = doc(db, "orgs", orgId, "studentAssessmentRecords", recordId);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return {
      id: snap.id,
      ...(snap.data() as Omit<SourceAssessmentRecord, "id">),
    };
  } catch {
    return null;
  }
}

async function loadSourceTrackerEntry(
  orgId: string,
  entryId: string,
): Promise<SourceTrackerEntry | null> {
  if (!entryId) return null;

  try {
    const ref = doc(db, "orgs", orgId, "studentTrackerEntries", entryId);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    return {
      id: snap.id,
      ...(snap.data() as Omit<SourceTrackerEntry, "id">),
    };
  } catch {
    return null;
  }
}

function buildInitialCheckForm(
  score?: number,
  maxScore?: number,
  measuredAt?: number,
  note?: string,
): CheckForm {
  return {
    score: typeof score === "number" ? String(score) : "",
    maxScore: typeof maxScore === "number" ? String(maxScore) : "",
    measuredAt: toDateInputValue(measuredAt),
    note: note || "",
  };
}

export default function LearningLossPlanPage() {
  const params = useParams<{ planId?: string }>();
  const router = useRouter();
  const { actor } = useStaffActor();

  const planId = params?.planId || "";
  const currentActor = actor as StaffLearningLossActor | null;

  const [status, setStatus] = useState<LoadingState>("idle");
  const [saving, setSaving] = useState<CheckKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [plan, setPlan] = useState<LearningLossPlanDoc | null>(null);
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [sourceRecord, setSourceRecord] =
    useState<SourceAssessmentRecord | null>(null);

  const [sourceTrackerEntry, setSourceTrackerEntry] =
    useState<SourceTrackerEntry | null>(null);

  const [firstCheck, setFirstCheck] = useState<CheckForm>(
    buildInitialCheckForm(),
  );
  const [secondCheck, setSecondCheck] = useState<CheckForm>(
    buildInitialCheckForm(),
  );

  const visibleClasses = useMemo(() => {
    return currentActor?.visibleClasses ?? [];
  }, [currentActor]);

  const visibleOfferings = useMemo(() => {
    return currentActor?.classSubjectOfferings ?? [];
  }, [currentActor]);

  const visibleClassMap = useMemo(() => {
    return new Map(
      visibleClasses.map((item) => [getVisibleClassKey(item), item]),
    );
  }, [visibleClasses]);

  const classInfo = useMemo(() => {
    if (!plan?.schoolId || !plan.academicYearId || !plan.classId) return null;

    return visibleClassMap.get(getPlanClassKey(plan)) ?? null;
  }, [plan, visibleClassMap, visibleClasses]);

  const classLabel = useMemo(
    () => getClassLabel(classInfo, visibleClasses),
    [classInfo, visibleClasses],
  );

  const subjectLabel = useMemo(
    () => (plan ? getSubjectLabel(plan, visibleOfferings) : null),
    [plan, visibleOfferings],
  );

  const hasAccessToPlan = useMemo(() => {
    if (!plan) return true;
    if (!plan.schoolId || !plan.academicYearId || !plan.classId) return false;

    return visibleClassMap.has(getPlanClassKey(plan));
  }, [plan, visibleClassMap]);

  const learningLossListHref = useMemo(() => {
    if (!plan) return "/staff/learning-loss";

    return buildLearningLossListHref(plan);
  }, [plan]);

  const improvement = useMemo(() => {
    if (!plan) {
      return {
        delta: undefined,
        percentage: undefined,
        indicator: "UNKNOWN" as const,
        comparisonLabel: "لم يكتمل أساس المقارنة بعد",
      };
    }

    return calculateLearningLossImprovement(plan);
  }, [plan]);

  const followUpState = useMemo(() => {
    if (!plan) return "NEEDS_FIRST_CHECK";

    return getLearningLossFollowUpState(plan);
  }, [plan]);

  const canRecordSecondCheck = useMemo(() => {
    return plan ? hasLearningLossFirstCheck(plan) : false;
  }, [plan]);

  const loadPlan = useCallback(async () => {
    if (!currentActor?.orgId || !planId) return;

    setStatus("loading");
    setError(null);
    setSuccessMessage(null);

    try {
      const planRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentLearningLossPlans",
        planId,
      );

      const planSnap = await getDoc(planRef);

      if (!planSnap.exists()) {
        setPlan(null);
        setStudent(null);
        setSourceRecord(null);
        setError("لم يتم العثور على خطة الفاقد.");
        setStatus("error");
        return;
      }

      const loadedPlan = {
        id: planSnap.id,
        ...(planSnap.data() as Omit<LearningLossPlanDoc, "id">),
      };

      const [loadedStudent, loadedSourceRecord, loadedSourceTrackerEntry] =
        await Promise.all([
          loadStudentName({
            orgId: currentActor.orgId,
            schoolId: loadedPlan.schoolId,
            academicYearId: loadedPlan.academicYearId,
            classId: loadedPlan.classId,
            studentId: loadedPlan.studentId,
          }),
          loadSourceAssessmentRecord(
            currentActor.orgId,
            loadedPlan.sourceAssessmentRecordId || "",
          ),
          loadSourceTrackerEntry(
            currentActor.orgId,
            loadedPlan.sourceTrackerEntryId || "",
          ),
        ]);

      setPlan(loadedPlan);
      setStudent(loadedStudent);
      setSourceRecord(loadedSourceRecord);
      setSourceTrackerEntry(loadedSourceTrackerEntry);

      setFirstCheck(
        buildInitialCheckForm(
          loadedPlan.firstCheckScore,
          loadedPlan.firstCheckMaxScore,
          loadedPlan.firstCheckMeasuredAt,
          loadedPlan.firstCheckNote,
        ),
      );

      setSecondCheck(
        buildInitialCheckForm(
          loadedPlan.secondCheckScore,
          loadedPlan.secondCheckMaxScore,
          loadedPlan.secondCheckMeasuredAt,
          loadedPlan.secondCheckNote,
        ),
      );

      setStatus("success");
    } catch (error: unknown) {
      setError(getErrorMessage(error));
      setStatus("error");
      setSourceTrackerEntry(null);
    }
  }, [currentActor?.orgId, planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const saveCheck = useCallback(
    async (checkKind: CheckKind) => {
      if (!currentActor?.orgId || !plan) return;

      if (checkKind === "second" && !hasLearningLossFirstCheck(plan)) {
        setError("لا يمكن تسجيل القياس الثاني قبل حفظ القياس الأول.");
        return;
      }

      const form = checkKind === "first" ? firstCheck : secondCheck;

      const score = parseOptionalNumber(form.score);
      const maxScore = parseOptionalNumber(form.maxScore);
      const measuredAt = dateInputToMs(form.measuredAt);

      if (typeof score !== "number") {
        setError("أدخل درجة القياس.");
        return;
      }

      if (typeof maxScore !== "number" || maxScore <= 0) {
        setError("أدخل الدرجة الكبرى بشكل صحيح.");
        return;
      }

      if (score < 0) {
        setError("درجة القياس لا يمكن أن تكون أقل من صفر.");
        return;
      }

      if (score > maxScore) {
        setError("درجة القياس لا يمكن أن تكون أكبر من الدرجة الكبرى.");
        return;
      }

      if (!measuredAt) {
        setError("أدخل تاريخ القياس.");
        return;
      }

      setSaving(checkKind);
      setError(null);
      setSuccessMessage(null);

      try {
        const mergedPlan: LearningLossPlanDoc = {
          ...plan,
          ...(checkKind === "first"
            ? {
                firstCheckScore: score,
                firstCheckMaxScore: maxScore,
                firstCheckMeasuredAt: measuredAt,
                firstCheckNote: form.note,
              }
            : {
                secondCheckScore: score,
                secondCheckMaxScore: maxScore,
                secondCheckMeasuredAt: measuredAt,
                secondCheckNote: form.note,
              }),
        };

        const nextImprovement = calculateLearningLossImprovement(mergedPlan);
        const nextStatus = resolveLearningLossStatus(mergedPlan);
        const updatedAt = nowMs();

        const planRef = doc(
          db,
          "orgs",
          currentActor.orgId,
          "studentLearningLossPlans",
          plan.id,
        );

        const improvementFields =
          buildLearningLossImprovementUpdateFields(nextImprovement);

        const updates =
          checkKind === "first"
            ? {
                firstCheckScore: score,
                firstCheckMaxScore: maxScore,
                firstCheckMeasuredAt: measuredAt,
                firstCheckNote: form.note,
                ...improvementFields,
                status: nextStatus,
                updatedAt,
              }
            : {
                secondCheckScore: score,
                secondCheckMaxScore: maxScore,
                secondCheckMeasuredAt: measuredAt,
                secondCheckNote: form.note,
                ...improvementFields,
                status: nextStatus,
                updatedAt,
              };

        await updateDoc(planRef, updates);

        setPlan({
          ...mergedPlan,
          ...improvementFields,
          status: nextStatus,
          updatedAt,
        } as LearningLossPlanDoc);

        setSuccessMessage(
          checkKind === "first"
            ? "تم حفظ القياس الأول بنجاح. يمكنك الآن تسجيل القياس الثاني."
            : "تم حفظ القياس الثاني وتحديث مؤشر التحسن بنجاح.",
        );
      } catch (error: unknown) {
        setError(getErrorMessage(error));
      } finally {
        setSaving(null);
      }
    },
    [currentActor?.orgId, firstCheck, plan, secondCheck],
  );

  if (!currentActor) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">
            جاري تحميل بيانات المستخدم...
          </p>
        </section>
      </main>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">
            جاري تحميل خطة الفاقد...
          </p>
        </section>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-bold">خطة الفاقد غير متاحة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "لم يتم العثور على الخطة المطلوبة."}
          </p>

          <button
            type="button"
            onClick={() => router.push("/staff/learning-loss")}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium hover:bg-muted"
          >
            الرجوع للفاقد
          </button>
        </section>
      </main>
    );
  }

  if (!hasAccessToPlan) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-bold">غير مصرح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه الخطة ليست ضمن الفصول المرئية لك حاليًا.
          </p>

          <button
            type="button"
            onClick={() => router.push("/staff/learning-loss")}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium hover:bg-muted"
          >
            الرجوع للفاقد
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
      <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {student?.displayName || plan.planTitle || "خطة الفاقد"}
            </h1>

            <p className="text-sm text-muted-foreground">
              {[classLabel, subjectLabel].filter(Boolean).join(" · ") ||
                "خطة متابعة تعليمية"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(learningLossListHref)}
            className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
          >
            الرجوع للفاقد
          </button>
        </div>
      </section>

      {successMessage ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>{successMessage}</span>

            <button
              type="button"
              onClick={() => router.push(learningLossListHref)}
              className="inline-flex h-9 w-fit items-center justify-center rounded-xl border border-emerald-500/40 px-3 text-xs font-medium transition hover:bg-emerald-500/10"
            >
              الرجوع للقائمة المفلترة
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 text-sm shadow-sm">
        <SummaryBadge label="حالة الخطة" value={getStatusLabel(plan.status)} />
        <SummaryBadge
          label="المتابعة"
          value={getLearningLossFollowUpStateLabel(followUpState)}
        />
        <SummaryBadge
          label="التحسن"
          value={getIndicatorLabel(plan.improvementIndicator)}
        />
        {typeof improvement.delta === "number" ? (
          <SummaryBadge
            label="فرق الدرجة"
            value={improvement.delta.toLocaleString("ar-SA")}
          />
        ) : null}
        {typeof improvement.percentage === "number" ? (
          <SummaryBadge
            label="فرق النسبة"
            value={`${improvement.percentage.toFixed(1)}%`}
          />
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="order-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">بيانات الطالب والخطة</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <InfoItem
                label="الطالب"
                value={student?.displayName || "غير محدد"}
              />
              <InfoItem label="الفصل" value={classLabel} />
              {subjectLabel ? (
                <InfoItem label="المادة / المجال" value={subjectLabel} />
              ) : null}
              <InfoItem
                label="بداية الخطة"
                value={formatDate(plan.planStartAt)}
              />
              <InfoItem
                label="نهاية الخطة"
                value={formatDate(plan.planEndAt)}
              />
            </div>
          </section>

          <section className="order-3 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">مصدر الفاقد</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <InfoItem
                label="نوع المصدر"
                value={getSourceTypeLabel(plan.sourceType)}
              />
              <InfoItem
                label="عنوان المصدر"
                value={
                  plan.sourceTitle ||
                  sourceRecord?.assessmentSlot ||
                  sourceTrackerEntry?.topicTitle ||
                  sourceTrackerEntry?.lessonTitle ||
                  "غير محدد"
                }
              />
              <InfoItem
                label="تاريخ القياس"
                value={formatDate(
                  plan.baselineMeasuredAt ||
                    sourceRecord?.measuredAt ||
                    sourceTrackerEntry?.recordedAt,
                )}
              />
              <InfoItem
                label="القياس الأساسي"
                value={formatScore(plan.baselineScore, plan.baselineMaxScore)}
              />
              <InfoItem
                label="نسبة القياس الأساسي"
                value={formatPercentage(
                  plan.baselineScore,
                  plan.baselineMaxScore,
                )}
              />
            </div>
          </section>

          <section className="order-1 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">المهارات المفقودة</h2>

            {plan.lostSkills.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                لا توجد مهارات مفقودة مسجلة.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {plan.lostSkills.map((skill, index) => (
                  <div
                    key={skill.id || index}
                    className="rounded-xl border p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold">{skill.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {skill.description || "لا يوجد وصف."}
                        </p>
                      </div>

                      <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {getSkillSeverityLabel(skill.severity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="order-2 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">الخطة العلاجية</h2>

            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-7 text-muted-foreground">
              {plan.planText}
            </p>

            <h3 className="mt-5 font-semibold">إجراءات المعالجة</h3>

            {plan.remediationActions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                لا توجد إجراءات معالجة مسجلة.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {plan.remediationActions.map((action, index) => (
                  <div
                    key={action.id || index}
                    className="rounded-xl border p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold">{action.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {action.description || "لا يوجد وصف."}
                        </p>
                      </div>

                      <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {getRemediationActionStatusLabel(action.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">القياس الأول</h2>

            <CheckFormFields
              form={firstCheck}
              onChange={setFirstCheck}
              disabled={saving !== null}
            />

            <button
              type="button"
              onClick={() => void saveCheck("first")}
              disabled={saving !== null}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "first" ? "جاري الحفظ..." : "حفظ القياس الأول"}
            </button>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">القياس الثاني</h2>

            {!canRecordSecondCheck ? (
              <p className="mt-3 rounded-xl border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
                يجب حفظ القياس الأول قبل تسجيل القياس الثاني.
              </p>
            ) : null}

            <CheckFormFields
              form={secondCheck}
              onChange={setSecondCheck}
              disabled={saving !== null || !canRecordSecondCheck}
            />

            <button
              type="button"
              onClick={() => void saveCheck("second")}
              disabled={saving !== null || !canRecordSecondCheck}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "second" ? "جاري الحفظ..." : "حفظ القياس الثاني"}
            </button>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">ملخص القياسات</h2>

            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="الأساسي"
                value={`${formatScore(
                  plan.baselineScore,
                  plan.baselineMaxScore,
                )} — ${formatPercentage(
                  plan.baselineScore,
                  plan.baselineMaxScore,
                )}`}
              />

              <SummaryRow
                label="الأول"
                value={`${formatScore(
                  plan.firstCheckScore,
                  plan.firstCheckMaxScore,
                )} — ${formatPercentage(
                  plan.firstCheckScore,
                  plan.firstCheckMaxScore,
                )}`}
              />

              <SummaryRow
                label="الثاني"
                value={`${formatScore(
                  plan.secondCheckScore,
                  plan.secondCheckMaxScore,
                )} — ${formatPercentage(
                  plan.secondCheckScore,
                  plan.secondCheckMaxScore,
                )}`}
              />
            </div>
            {improvement.comparisonLabel ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {improvement.comparisonLabel}
              </p>
            ) : null}
          </section>
        </div>
      </section>

      <details className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          تفاصيل تقنية
        </summary>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <TechnicalRow label="معرّف الخطة" value={plan.id} />
          <TechnicalRow label="معرّف الطالب" value={plan.studentId} />
          <TechnicalRow label="معرّف المدرسة" value={plan.schoolId} />
          <TechnicalRow
            label="معرّف السنة الدراسية"
            value={plan.academicYearId}
          />
          <TechnicalRow label="معرّف الفصل" value={plan.classId} />
          <TechnicalRow label="معرّف الفصل الدراسي" value={plan.termId} />
          <TechnicalRow label="مفتاح المادة" value={plan.subjectKey} />
          <TechnicalRow
            label="معرّف عرض المادة"
            value={plan.classSubjectOfferingId}
          />
          <TechnicalRow label="معرّف دفعة المصدر" value={plan.sourceBatchId} />
          <TechnicalRow
            label="معرّف سجل القياس المصدر"
            value={plan.sourceAssessmentRecordId}
          />
          <TechnicalRow
            label="معرّف سجل المتابعة المصدر"
            value={plan.sourceTrackerEntryId}
          />
          <TechnicalRow
            label="معرّف قالب المصدر"
            value={plan.sourceTemplateId}
          />
        </div>
      </details>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function SummaryBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TechnicalRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <code className="break-all text-xs">{value || "—"}</code>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CheckFormFields({
  form,
  onChange,
  disabled,
}: {
  form: CheckForm;
  onChange: Dispatch<SetStateAction<CheckForm>>;
  disabled: boolean;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">الدرجة</span>
          <input
            type="number"
            min="0"
            value={form.score}
            disabled={disabled}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                score: event.target.value,
              }))
            }
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">الدرجة الكبرى</span>
          <input
            type="number"
            min="1"
            value={form.maxScore}
            disabled={disabled}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                maxScore: event.target.value,
              }))
            }
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium">تاريخ القياس</span>
        <input
          type="date"
          value={form.measuredAt}
          disabled={disabled}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              measuredAt: event.target.value,
            }))
          }
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium">ملاحظة</span>
        <textarea
          value={form.note}
          disabled={disabled}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              note: event.target.value,
            }))
          }
          rows={3}
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
    </div>
  );
}
