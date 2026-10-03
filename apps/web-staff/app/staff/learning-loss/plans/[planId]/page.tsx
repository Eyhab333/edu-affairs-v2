"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import type {
  LearningLossRemediationAction,
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

type TreatmentPlanForm = {
  title: string;
  text: string;
  startAt: string;
  endAt: string;
};

type RemediationActionForm = {
  id: string;
  title: string;
  description: string;
  status: LearningLossRemediationAction["status"];
  dueAt: string;
  completedAt: string;
  note: string;
};

type PlanTimelineItem = {
  id: string;
  date: number;
  title: string;
  detail?: string;
  order: number;
};

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
    case "DONE":
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

function buildTreatmentPlanForm(
  plan?: Pick<
    LearningLossPlanDoc,
    "planTitle" | "planText" | "planStartAt" | "planEndAt"
  > | null,
): TreatmentPlanForm {
  return {
    title: plan?.planTitle || "",
    text: plan?.planText || "",
    startAt: toDateInputValue(plan?.planStartAt),
    endAt: toDateInputValue(plan?.planEndAt),
  };
}

function buildRemediationActionForm(
  action?: LearningLossRemediationAction,
): RemediationActionForm {
  return {
    id: action?.id || "",
    title: action?.title || "",
    description: action?.description || "",
    status: action?.status || "PLANNED",
    dueAt: toDateInputValue(action?.dueAt),
    completedAt: toDateInputValue(action?.completedAt),
    note: action?.note || "",
  };
}

function createRemediationActionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `action-${crypto.randomUUID()}`;
  }

  return `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCompletedActionStatus(
  status: LearningLossRemediationAction["status"],
) {
  return status === "COMPLETED" || status === "DONE";
}

function buildPlanTimeline(plan: LearningLossPlanDoc): PlanTimelineItem[] {
  const timeline: PlanTimelineItem[] = [];

  if (typeof plan.planStartAt === "number") {
    timeline.push({
      id: "plan-start",
      date: plan.planStartAt,
      title: "بدء الخطة العلاجية",
      order: 0,
    });
  }

  (plan.remediationActions ?? []).forEach((action, index) => {
    const actionId = action.id || `legacy-action-${index}`;
    if (typeof action.dueAt === "number") {
      timeline.push({
        id: `${actionId}-due`,
        date: action.dueAt,
        title: `موعد مستهدف: ${action.title}`,
        detail: action.description || undefined,
        order: 1,
      });
    }
    if (typeof action.completedAt === "number") {
      timeline.push({
        id: `${actionId}-completed`,
        date: action.completedAt,
        title: `تنفيذ إجراء علاجي: ${action.title}`,
        detail: action.note || action.description || undefined,
        order: 2,
      });
    }
  });

  if (typeof plan.firstCheckMeasuredAt === "number") {
    timeline.push({
      id: "first-check",
      date: plan.firstCheckMeasuredAt,
      title: "قياس نتيجة الخطة الأول",
      detail: formatScore(plan.firstCheckScore, plan.firstCheckMaxScore),
      order: 3,
    });
  }

  if (typeof plan.secondCheckMeasuredAt === "number") {
    timeline.push({
      id: "second-check",
      date: plan.secondCheckMeasuredAt,
      title: "قياس نتيجة الخطة الثاني",
      detail: formatScore(plan.secondCheckScore, plan.secondCheckMaxScore),
      order: 4,
    });
  }

  if (typeof plan.planEndAt === "number") {
    timeline.push({
      id: "plan-end",
      date: plan.planEndAt,
      title: "نهاية الخطة / التاريخ المستهدف للانتهاء",
      order: 5,
    });
  }

  return timeline.sort((left, right) => left.date - right.date || left.order - right.order);
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
  const [treatmentPlanForm, setTreatmentPlanForm] =
    useState<TreatmentPlanForm>(buildTreatmentPlanForm());
  const [actionForm, setActionForm] = useState<RemediationActionForm>(
    buildRemediationActionForm(),
  );
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(
    null,
  );
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [savingTreatmentPlan, setSavingTreatmentPlan] = useState(false);
  const [savingAction, setSavingAction] = useState(false);

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

  const remediationActions = useMemo(
    () => plan?.remediationActions ?? [],
    [plan],
  );

  const planTimeline = useMemo(
    () => (plan ? buildPlanTimeline(plan) : []),
    [plan],
  );

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
      setTreatmentPlanForm(buildTreatmentPlanForm(loadedPlan));
      setActionForm(buildRemediationActionForm());
      setEditingActionIndex(null);
      setIsAddingAction(false);

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

  const saveTreatmentPlan = useCallback(async () => {
    if (!currentActor?.orgId || !plan) return;

    const planTitle = treatmentPlanForm.title.trim();
    const planText = treatmentPlanForm.text.trim();
    const planStartAt = dateInputToMs(treatmentPlanForm.startAt);
    const planEndAt = dateInputToMs(treatmentPlanForm.endAt);

    if (!planText) {
      setError("اكتب الخطة العلاجية.");
      return;
    }
    if (!planStartAt) {
      setError("أدخل تاريخ بدء الخطة.");
      return;
    }
    if (treatmentPlanForm.endAt && !planEndAt) {
      setError("أدخل التاريخ المستهدف للانتهاء بشكل صحيح.");
      return;
    }
    if (planEndAt && planEndAt < planStartAt) {
      setError("تاريخ نهاية الخطة لا يمكن أن يسبق تاريخ البداية.");
      return;
    }

    setSavingTreatmentPlan(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedAt = nowMs();
      const planRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentLearningLossPlans",
        plan.id,
      );
      await updateDoc(planRef, {
        planTitle,
        planText,
        planStartAt,
        planEndAt: planEndAt ?? deleteField(),
        updatedAt,
      });

      setPlan({
        ...plan,
        planTitle,
        planText,
        planStartAt,
        planEndAt,
        updatedAt,
      });
      setSuccessMessage("تم حفظ الخطة العلاجية بنجاح.");
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError));
    } finally {
      setSavingTreatmentPlan(false);
    }
  }, [currentActor?.orgId, plan, treatmentPlanForm]);

  const startActionEdit = useCallback(
    (action: LearningLossRemediationAction, index: number) => {
      setActionForm(buildRemediationActionForm(action));
      setEditingActionIndex(index);
      setIsAddingAction(true);
      setError(null);
      setSuccessMessage(null);
    },
    [],
  );

  const cancelActionEdit = useCallback(() => {
    setActionForm(buildRemediationActionForm());
    setEditingActionIndex(null);
    setIsAddingAction(false);
  }, []);

  const startNewAction = useCallback(() => {
    setActionForm(buildRemediationActionForm());
    setEditingActionIndex(null);
    setIsAddingAction(true);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const saveRemediationAction = useCallback(async () => {
    if (!currentActor?.orgId || !plan) return;

    const title = actionForm.title.trim();
    const dueAt = dateInputToMs(actionForm.dueAt);
    const completedAt = dateInputToMs(actionForm.completedAt);

    if (!title) {
      setError("اكتب عنوان الحدث.");
      return;
    }
    if (actionForm.dueAt && !dueAt) {
      setError("أدخل التاريخ المستهدف بشكل صحيح.");
      return;
    }
    if (actionForm.completedAt && !completedAt) {
      setError("أدخل تاريخ التنفيذ بشكل صحيح.");
      return;
    }
    if (isCompletedActionStatus(actionForm.status) && !completedAt) {
      setError('أدخل تاريخ التنفيذ عند اختيار الحالة "مكتملة".');
      return;
    }

    const nextAction: LearningLossRemediationAction = {
      id: actionForm.id || createRemediationActionId(),
      title,
      description: actionForm.description.trim(),
      status: actionForm.status,
      ...(dueAt ? { dueAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      note: actionForm.note.trim(),
    };
    const nextActions =
      editingActionIndex === null
        ? [...remediationActions, nextAction]
        : remediationActions.map((action, index) =>
            index === editingActionIndex ? nextAction : action,
          );

    setSavingAction(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedAt = nowMs();
      const planRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentLearningLossPlans",
        plan.id,
      );
      await updateDoc(planRef, { remediationActions: nextActions, updatedAt });
      setPlan({ ...plan, remediationActions: nextActions, updatedAt });
      cancelActionEdit();
      setSuccessMessage(
        editingActionIndex === null
          ? "تمت إضافة الحدث العلاجي بنجاح."
          : "تم حفظ الحدث العلاجي بنجاح.",
      );
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError));
    } finally {
      setSavingAction(false);
    }
  }, [
    actionForm,
    cancelActionEdit,
    currentActor?.orgId,
    editingActionIndex,
    plan,
    remediationActions,
  ]);

  const deleteRemediationAction = useCallback(
    async (index: number) => {
      if (!currentActor?.orgId || !plan) return;
      const action = remediationActions[index];
      if (!action || !window.confirm(`هل تريد حذف الحدث "${action.title}"؟`)) {
        return;
      }

      setSavingAction(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const updatedAt = nowMs();
        const nextActions = remediationActions.filter((_, actionIndex) => actionIndex !== index);
        const planRef = doc(
          db,
          "orgs",
          currentActor.orgId,
          "studentLearningLossPlans",
          plan.id,
        );
        await updateDoc(planRef, { remediationActions: nextActions, updatedAt });
        setPlan({ ...plan, remediationActions: nextActions, updatedAt });
        if (editingActionIndex === index) cancelActionEdit();
        setSuccessMessage("تم حذف الحدث العلاجي.");
      } catch (nextError: unknown) {
        setError(getErrorMessage(nextError));
      } finally {
        setSavingAction(false);
      }
    },
    [
      cancelActionEdit,
      currentActor?.orgId,
      editingActionIndex,
      plan,
      remediationActions,
    ],
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
          <section className="order-5 rounded-2xl border bg-card p-5 shadow-sm">
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

          <section className="order-4 rounded-2xl border bg-card p-5 shadow-sm">
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

          <TreatmentPlanEditor
            planForm={treatmentPlanForm}
            onPlanChange={setTreatmentPlanForm}
            onSavePlan={() => void saveTreatmentPlan()}
            savingPlan={savingTreatmentPlan}
            actions={remediationActions}
            actionForm={actionForm}
            onActionChange={setActionForm}
            editingActionIndex={editingActionIndex}
            showActionForm={isAddingAction}
            onSaveAction={() => void saveRemediationAction()}
            onStartNewAction={startNewAction}
            onStartActionEdit={startActionEdit}
            onCancelActionEdit={cancelActionEdit}
            onDeleteAction={(index) => void deleteRemediationAction(index)}
            savingAction={savingAction}
          />

          <section className="order-3 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">السجل الزمني للخطة</h2>

            {planTimeline.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                لا توجد تواريخ تعليمية مسجلة للخطة بعد.
              </p>
            ) : (
              <ol className="mt-4 space-y-3 border-r-2 border-muted pr-4">
                {planTimeline.map((item) => (
                  <li key={item.id} className="relative rounded-xl border bg-background p-3">
                    <span className="absolute -right-[1.58rem] top-5 size-3 rounded-full bg-primary" />
                    <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                    <p className="mt-1 font-medium">{item.title}</p>
                    {item.detail ? <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="order-2 hidden rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">الخطة العلاجية</h2>

            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-7 text-muted-foreground">
              {plan.planText}
            </p>

            <h3 className="mt-5 font-semibold">إجراءات المعالجة</h3>

            {remediationActions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                لا توجد إجراءات معالجة مسجلة.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {remediationActions.map((action, index) => (
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
            <h2 className="text-lg font-semibold">قياس نتيجة الخطة الأول</h2>

            <CheckFormFields
              form={firstCheck}
              onChange={setFirstCheck}
              disabled={saving !== null}
            />

            <FollowUpMeasurementResult
              score={plan.firstCheckScore}
              maxScore={plan.firstCheckMaxScore}
              indicator={plan.improvementIndicator}
            />

            <button
              type="button"
              onClick={() => void saveCheck("first")}
              disabled={saving !== null}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "first" ? "جاري الحفظ..." : "حفظ قياس النتيجة الأول"}
            </button>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">قياس نتيجة الخطة الثاني</h2>

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

            <FollowUpMeasurementResult
              score={plan.secondCheckScore}
              maxScore={plan.secondCheckMaxScore}
              indicator={plan.improvementIndicator}
            />

            <button
              type="button"
              onClick={() => void saveCheck("second")}
              disabled={saving !== null || !canRecordSecondCheck}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving === "second" ? "جاري الحفظ..." : "حفظ قياس النتيجة الثاني"}
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

function TreatmentPlanEditor({
  planForm,
  onPlanChange,
  onSavePlan,
  savingPlan,
  actions,
  actionForm,
  onActionChange,
  editingActionIndex,
  showActionForm,
  onSaveAction,
  onStartNewAction,
  onStartActionEdit,
  onCancelActionEdit,
  onDeleteAction,
  savingAction,
}: {
  planForm: TreatmentPlanForm;
  onPlanChange: Dispatch<SetStateAction<TreatmentPlanForm>>;
  onSavePlan: () => void;
  savingPlan: boolean;
  actions: LearningLossRemediationAction[];
  actionForm: RemediationActionForm;
  onActionChange: Dispatch<SetStateAction<RemediationActionForm>>;
  editingActionIndex: number | null;
  showActionForm: boolean;
  onSaveAction: () => void;
  onStartNewAction: () => void;
  onStartActionEdit: (
    action: LearningLossRemediationAction,
    index: number,
  ) => void;
  onCancelActionEdit: () => void;
  onDeleteAction: (index: number) => void;
  savingAction: boolean;
}) {
  const disabled = savingPlan || savingAction;

  return (
    <section className="order-2 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">الخطة العلاجية</h2>

      <div className="mt-4 space-y-4">
        <label className="space-y-2">
          <span className="text-sm font-medium">عنوان الخطة العلاجية</span>
          <input
            type="text"
            value={planForm.title}
            disabled={disabled}
            onChange={(event) =>
              onPlanChange((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">الخطة العلاجية</span>
          <textarea
            value={planForm.text}
            disabled={disabled}
            rows={7}
            onChange={(event) =>
              onPlanChange((current) => ({
                ...current,
                text: event.target.value,
              }))
            }
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm leading-7 outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">تاريخ بدء الخطة</span>
            <input
              type="date"
              value={planForm.startAt}
              disabled={disabled}
              onChange={(event) =>
                onPlanChange((current) => ({
                  ...current,
                  startAt: event.target.value,
                }))
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">التاريخ المستهدف للانتهاء</span>
            <input
              type="date"
              value={planForm.endAt}
              disabled={disabled}
              onChange={(event) =>
                onPlanChange((current) => ({
                  ...current,
                  endAt: event.target.value,
                }))
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onSavePlan}
          disabled={disabled}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingPlan ? "جارٍ الحفظ..." : "حفظ الخطة العلاجية"}
        </button>
      </div>

      <div className="mt-8 border-t pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">أحداث وإجراءات الخطة العلاجية</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              وثّق الإجراء وتاريخه المخطط وتاريخ تنفيذه الفعلي.
            </p>
          </div>
          {!showActionForm ? (
            <button
              type="button"
              onClick={onStartNewAction}
              disabled={disabled}
              className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              إضافة حدث علاجي
            </button>
          ) : null}
        </div>

        {showActionForm ? <div className="mt-4 rounded-xl border bg-muted/20 p-4">
          <h4 className="font-medium">
            {editingActionIndex === null ? "إضافة حدث علاجي" : "تعديل حدث علاجي"}
          </h4>
          <div className="mt-4 space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">العنوان</span>
              <input
                type="text"
                value={actionForm.title}
                disabled={disabled}
                onChange={(event) =>
                  onActionChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">الوصف</span>
              <textarea
                value={actionForm.description}
                disabled={disabled}
                rows={3}
                onChange={(event) =>
                  onActionChange((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-medium">الحالة</span>
                <select
                  value={actionForm.status}
                  disabled={disabled}
                  onChange={(event) =>
                    onActionChange((current) => ({
                      ...current,
                      status: event.target.value as LearningLossRemediationAction["status"],
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="PLANNED">مخطط لها</option>
                  <option value="IN_PROGRESS">قيد التنفيذ</option>
                  <option value="COMPLETED">مكتملة</option>
                  <option value="CANCELLED">ملغاة</option>
                  {actionForm.status === "DONE" ? <option value="DONE">مكتملة (سابقاً)</option> : null}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">التاريخ المستهدف</span>
                <input
                  type="date"
                  value={actionForm.dueAt}
                  disabled={disabled}
                  onChange={(event) =>
                    onActionChange((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">تاريخ التنفيذ</span>
                <input
                  type="date"
                  value={actionForm.completedAt}
                  disabled={disabled}
                  onChange={(event) =>
                    onActionChange((current) => ({
                      ...current,
                      completedAt: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">ملاحظة</span>
              <textarea
                value={actionForm.note}
                disabled={disabled}
                rows={3}
                onChange={(event) =>
                  onActionChange((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSaveAction}
                disabled={disabled}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAction ? "جارٍ الحفظ..." : "حفظ الحدث"}
              </button>
              <button
                type="button"
                onClick={onCancelActionEdit}
                disabled={disabled}
                className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editingActionIndex !== null ? "إلغاء التعديل" : "إلغاء"}
              </button>
            </div>
          </div>
        </div> : null}

        {actions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">لا توجد أحداث علاجية مسجلة.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {actions.map((action, index) => (
              <article key={action.id || `legacy-action-${index}`} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{action.title}</h4>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        {getRemediationActionStatusLabel(action.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description || "لا يوجد وصف."}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onStartActionEdit(action, index)} disabled={disabled} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">تعديل</button>
                    <button type="button" onClick={() => onDeleteAction(index)} disabled={disabled} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60">حذف</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">التاريخ المستهدف: </span>{formatDate(action.dueAt)}</p>
                  <p><span className="text-muted-foreground">تاريخ التنفيذ: </span>{formatDate(action.completedAt)}</p>
                </div>
                {action.note ? <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm"><span className="text-muted-foreground">ملاحظة: </span>{action.note}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
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

function FollowUpMeasurementResult({
  score,
  maxScore,
  indicator,
}: {
  score?: number;
  maxScore?: number;
  indicator?: string;
}) {
  if (typeof score !== "number" || typeof maxScore !== "number") {
    return null;
  }

  return (
    <div className="mt-4 grid gap-2 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-3">
      <p><span className="text-muted-foreground">النتيجة: </span>{formatScore(score, maxScore)}</p>
      <p><span className="text-muted-foreground">النسبة: </span>{formatPercentage(score, maxScore)}</p>
      <p><span className="text-muted-foreground">مؤشر التحسن: </span>{getIndicatorLabel(indicator)}</p>
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
