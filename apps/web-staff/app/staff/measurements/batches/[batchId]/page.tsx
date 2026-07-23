"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import type {
  StudentAssessmentTemplate,
  StudentMeasurementBatch,
  StudentMeasurementBatchStudentRow,
  StudentTrackerTemplate,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useStaffActor } from "@/components/staff/staff-actor-provider";

type VisibleClass = {
  id: string;
  title?: string;
  code?: string;
  schoolId?: string;
  schoolName?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
};

type StaffMeasurementsActor = {
  uid?: string;
  orgId: string;
  personId?: string;
  roles?: string[];
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
};

type MeasurementBatchDoc = StudentMeasurementBatch & {
  id: string;
  classSubjectOfferingId?: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
  originalBatchPath?: string;
  compensationReason?: string;
};

type LearningLossTemplateFields = {
  id?: string;
  title?: string;
  subjectKey?: string;
  maxScore?: number;
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
};

type SourceTemplateDoc = LearningLossTemplateFields;

type LoadingState = "idle" | "loading" | "success" | "error";

type StudentSummary = {
  id: string;
  personId?: string;
  displayName: string;
};

type BatchStudentRowView = StudentMeasurementBatchStudentRow & {
  studentDisplayName: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function nowMs() {
  return Date.now();
}

function resolveActorPersonId(actor: StaffMeasurementsActor) {
  return actor.personId || actor.uid || "unknown";
}

function resolveActorRoleKey(actor: StaffMeasurementsActor) {
  return actor.roles?.[0] || actor.roleKeys?.[0] || "staff";
}

function removeUndefinedFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedFields(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (entryValue === undefined) continue;

      result[key] = removeUndefinedFields(entryValue);
    }

    return result;
  }

  return value;
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function getVisibleClassKey(item: VisibleClass) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.id,
  ].join(":");
}

function getBatchClassKey(item: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.classId || "NO_CLASS",
  ].join(":");
}

function getClassLabel(classInfo: VisibleClass | null, classId?: string) {
  if (!classInfo) return classId || "غير محدد";

  return classInfo.title || classInfo.code || classInfo.id;
}

function getSchoolLabel(classInfo: VisibleClass | null, schoolId?: string) {
  if (!classInfo) return schoolId || "غير محدد";

  return classInfo.schoolName || classInfo.schoolId || schoolId || "غير محدد";
}

function getBatchKindLabel(value?: string) {
  switch (value) {
    case "ASSESSMENT":
      return "قياس رسمي";
    case "TRACKER":
      return "متابعة";
    case "KG_VALUES":
      return "قيم";
    case "KG_CORNERS":
      return "أركان";
    case "KG_QURAN":
      return "قرآن";
    case "LEARNING_LOSS_TRACKER":
      return "متابعة فاقد";
    case "CUSTOM":
      return "مخصص";
    default:
      return value || "غير محدد";
  }
}

function getBatchStatusLabel(value?: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "IN_PROGRESS":
      return "قيد الإدخال";
    case "SUBMITTED":
      return "مرسلة";
    case "REVIEWED":
      return "تمت مراجعتها";
    case "LOCKED":
      return "مقفلة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "غير محدد";
  }
}

function getRowStatusLabel(value?: string) {
  switch (value) {
    case "PENDING":
      return "لم يكتمل";
    case "COMPLETED":
      return "مكتمل";
    case "ABSENT":
      return "غائب";
    case "EXCUSED":
      return "معذور";
    case "SKIPPED":
      return "متجاوز";
    default:
      return value || "غير محدد";
  }
}

function getRecordTypeLabel(value: "ASSESSMENT_RECORD" | "TRACKER_ENTRY") {
  switch (value) {
    case "ASSESSMENT_RECORD":
      return "سجل قياس رسمي";
    case "TRACKER_ENTRY":
      return "سجل متابعة";
    default:
      return value;
  }
}

function formatScore(row: StudentMeasurementBatchStudentRow) {
  const score =
    typeof row.score === "number" ? row.score.toLocaleString("ar-SA") : "—";

  const maxScore =
    typeof row.maxScore === "number"
      ? row.maxScore.toLocaleString("ar-SA")
      : "—";

  return `${score} / ${maxScore}`;
}

function calculateRowPercentage(row: StudentMeasurementBatchStudentRow) {
  if (
    typeof row.score !== "number" ||
    typeof row.maxScore !== "number" ||
    row.maxScore <= 0
  ) {
    return null;
  }

  return (row.score / row.maxScore) * 100;
}

function formatRowPercentage(row: StudentMeasurementBatchStudentRow) {
  const percentage = calculateRowPercentage(row);

  if (percentage === null) return "—";

  return `${percentage.toFixed(1)}%`;
}

function isCompensationEligibleRow(row: StudentMeasurementBatchStudentRow) {
  return row.status === "ABSENT" || row.status === "EXCUSED";
}

function isTrackerMeasurementBatch(batch: MeasurementBatchDoc) {
  return (
    Boolean(batch.trackerKind) ||
    [
      "TRACKER",
      "KG_VALUES",
      "KG_CORNERS",
      "KG_QURAN",
      "LEARNING_LOSS_TRACKER",
    ].includes(String(batch.batchKind || ""))
  );
}

function resolveRecordType(batch: MeasurementBatchDoc) {
  return isTrackerMeasurementBatch(batch)
    ? "TRACKER_ENTRY"
    : "ASSESSMENT_RECORD";
}

function getTemplateCollectionName(batch: MeasurementBatchDoc) {
  return isTrackerMeasurementBatch(batch)
    ? "studentTrackerTemplates"
    : "studentAssessmentTemplates";
}

function calculateLearningLossDecisionForRow(params: {
  template?: LearningLossTemplateFields | null;
  row: StudentMeasurementBatchStudentRow;
}) {
  const score = params.row.score;

  const maxScore =
    typeof params.row.maxScore === "number"
      ? params.row.maxScore
      : params.template?.maxScore;

  const scorePercentage =
    typeof score === "number" && typeof maxScore === "number" && maxScore > 0
      ? (score / maxScore) * 100
      : null;

  if (!params.template) {
    return {
      needsLearningLossFollowUp: false,
      reason: "لم يتم العثور على قالب لحساب قرار الفاقد",
      scorePercentage,
    };
  }

  if (!params.template.requiresLearningLossFollowUp) {
    return {
      needsLearningLossFollowUp: false,
      reason: "القالب لا يتطلب متابعة فاقد تعليمي",
      scorePercentage,
    };
  }

  if (params.row.status !== "COMPLETED") {
    return {
      needsLearningLossFollowUp: false,
      reason: "الطالب ليس في حالة مكتمل",
      scorePercentage,
    };
  }

  if (
    typeof params.template.learningLossThresholdScore === "number" &&
    typeof score === "number" &&
    score < params.template.learningLossThresholdScore
  ) {
    return {
      needsLearningLossFollowUp: true,
      reason: "درجة الطالب أقل من حد الفاقد المحدد في القالب",
      scorePercentage,
    };
  }

  if (
    typeof params.template.learningLossThresholdPercentage === "number" &&
    typeof scorePercentage === "number" &&
    scorePercentage < params.template.learningLossThresholdPercentage
  ) {
    return {
      needsLearningLossFollowUp: true,
      reason: "نسبة الطالب أقل من حد الفاقد المحدد في القالب",
      scorePercentage,
    };
  }

  return {
    needsLearningLossFollowUp: false,
    reason: "درجة الطالب لا تستدعي فتح خطة فاقد",
    scorePercentage,
  };
}

function formatPercentageValue(value: number | null) {
  if (typeof value !== "number") return "—";
  return `${value.toFixed(1)}%`;
}

function buildRowsFromBatch(
  batch: MeasurementBatchDoc,
): StudentMeasurementBatchStudentRow[] {
  if (Array.isArray(batch.studentRows) && batch.studentRows.length > 0) {
    return batch.studentRows;
  }

  return (batch.targetStudentIds ?? []).map((studentId) => ({
    studentId,
    studentDisplayName: "",
    enrollmentId: "",
    status: "PENDING",
    level: "",
    valueText: "",
    itemScores: [],
    note: "",
    recordId: "",
  }));
}

function buildEditBatchHref(batch: MeasurementBatchDoc) {
  const params = new URLSearchParams();

  if (batch.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", batch.classSubjectOfferingId);
  }

  if (batch.subjectKey) {
    params.set("subjectKey", batch.subjectKey);
  }

  if (batch.teacherAssignmentId) {
    params.set("teacherAssignmentId", batch.teacherAssignmentId);
  }

  const queryString = params.toString();

  return `/staff/measurements/batches/${batch.id}/edit${
    queryString ? `?${queryString}` : ""
  }`;
}

async function buildRowViews(params: {
  orgId: string;
  batch: MeasurementBatchDoc;
}): Promise<BatchStudentRowView[]> {
  const rows = buildRowsFromBatch(params.batch);
  const schoolId = params.batch.schoolId || "";

  return Promise.all(
    rows.map(async (row) => {
      if (row.studentDisplayName?.trim()) {
        return row;
      }

      if (!schoolId) {
        return {
          ...row,
          studentDisplayName: row.studentId,
        };
      }

      const directoryRef = doc(
        db,
        "orgs",
        params.orgId,
        "schools",
        schoolId,
        "studentDirectory",
        row.studentId,
      );

      const directorySnap = await getDoc(directoryRef);

      const displayName = directorySnap.exists()
        ? String(directorySnap.data().displayName || "").trim()
        : "";

      return {
        ...row,
        studentDisplayName: displayName || row.studentId,
      };
    }),
  );
}

async function loadSourceTemplate(params: {
  orgId: string;
  batch: MeasurementBatchDoc;
}): Promise<LearningLossTemplateFields | null> {
  if (!params.batch.templateId) return null;

  try {
    const templateRef = doc(
      db,
      "orgs",
      params.orgId,
      getTemplateCollectionName(params.batch),
      params.batch.templateId,
    );

    const templateSnap = await getDoc(templateRef);

    if (!templateSnap.exists()) return null;

    const data = templateSnap.data() as LearningLossTemplateFields;

    return {
      id: templateSnap.id,
      title: data.title || "",
      subjectKey: data.subjectKey || "",
      maxScore: data.maxScore,
      requiresLearningLossFollowUp: data.requiresLearningLossFollowUp === true,
      learningLossThresholdScore: data.learningLossThresholdScore,
      learningLossThresholdPercentage: data.learningLossThresholdPercentage,
    };
  } catch {
    return null;
  }
}

async function findExistingCompensationBatch(params: {
  orgId: string;
  schoolId: string;
  originalBatchId: string;
}): Promise<string | null> {
  const batchesRef = collection(
    db,
    "orgs",
    params.orgId,
    "studentMeasurementBatches",
  );

  const compensationQuery = query(
    batchesRef,
    where("schoolId", "==", params.schoolId),
    where("originalBatchId", "==", params.originalBatchId),
  );

  const compensationSnap = await getDocs(compensationQuery);

  const existing = compensationSnap.docs
    .map((item) => {
      const data = item.data() as {
        isCompensationBatch?: boolean;
        status?: string;
        createdAt?: number;
      };

      return {
        id: item.id,
        isCompensationBatch: data.isCompensationBatch === true,
        status: data.status || "",
        createdAt: data.createdAt || 0,
      };
    })
    .filter((item) => item.isCompensationBatch)
    .filter((item) => item.status !== "CANCELLED")
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  return existing?.id || null;
}

export default function StaffMeasurementBatchPage() {
  const params = useParams<{ batchId?: string }>();
  const router = useRouter();
  const { actor } = useStaffActor();

  const batchId = params?.batchId || "";
  const currentActor = actor as StaffMeasurementsActor | null;

  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<MeasurementBatchDoc | null>(null);
  const [rows, setRows] = useState<BatchStudentRowView[]>([]);
  const [sourceTemplate, setSourceTemplate] =
    useState<LearningLossTemplateFields | null>(null);
  const [creatingCompensationBatch, setCreatingCompensationBatch] =
    useState(false);
  const [existingCompensationBatchId, setExistingCompensationBatchId] =
    useState<string | null>(null);

  const visibleClasses = useMemo(() => {
    return currentActor?.visibleClasses ?? [];
  }, [currentActor]);

  const visibleClassMap = useMemo(() => {
    return new Map(
      visibleClasses.map((item) => [getVisibleClassKey(item), item]),
    );
  }, [visibleClasses]);

  const visibleClassIds = useMemo(() => {
    return new Set(visibleClasses.map((item) => item.id));
  }, [visibleClasses]);

  const classInfo = useMemo(() => {
    if (!batch?.classId) return null;

    const exact = visibleClassMap.get(getBatchClassKey(batch));
    if (exact) return exact;

    const matches = visibleClasses.filter((item) => item.id === batch.classId);
    if (matches.length === 1) return matches[0];

    return null;
  }, [batch, visibleClassMap, visibleClasses]);

  const hasAccessToBatch = useMemo(() => {
    if (!batch) return true;
    if (!batch.classId) return true;

    const exactClass = visibleClassMap.get(getBatchClassKey(batch));
    if (exactClass) return true;

    const hasOnlyClassId = !batch.schoolId && !batch.academicYearId;
    if (hasOnlyClassId) return visibleClassIds.has(batch.classId);

    return false;
  }, [batch, visibleClassIds, visibleClassMap]);

  const recordType = useMemo(() => {
    if (!batch) return "ASSESSMENT_RECORD" as const;
    return resolveRecordType(batch);
  }, [batch]);

  const loadBatch = useCallback(async () => {
    if (!currentActor?.orgId || !batchId) return;

    setStatus("loading");
    setError(null);
    setExistingCompensationBatchId(null);
    setSourceTemplate(null);

    try {
      const batchRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentMeasurementBatches",
        batchId,
      );

      const batchSnap = await getDoc(batchRef);

      if (!batchSnap.exists()) {
        setBatch(null);
        setRows([]);
        setSourceTemplate(null);
        setError("لم يتم العثور على دفعة القياس.");
        setStatus("error");
        return;
      }

      const loadedBatch = {
        id: batchSnap.id,
        ...(batchSnap.data() as Omit<MeasurementBatchDoc, "id">),
      };

      const [loadedRows, loadedTemplate] = await Promise.all([
        buildRowViews({
          orgId: currentActor.orgId,
          batch: loadedBatch,
        }),
        loadSourceTemplate({
          orgId: currentActor.orgId,
          batch: loadedBatch,
        }),
      ]);

      setBatch(loadedBatch);
      setRows(loadedRows);
      setSourceTemplate(loadedTemplate);

      if (loadedBatch.isCompensationBatch === true) {
        setExistingCompensationBatchId(loadedBatch.id);
      } else {
        const existingId = await findExistingCompensationBatch({
          orgId: currentActor.orgId,
          schoolId: loadedBatch.schoolId,
          originalBatchId: loadedBatch.id,
        });

        setExistingCompensationBatchId(existingId);
      }

      setStatus("success");
    } catch (error: unknown) {
      setBatch(null);
      setRows([]);
      setSourceTemplate(null);
      setExistingCompensationBatchId(null);
      setError(getErrorMessage(error));
      setStatus("error");
    }
  }, [batchId, currentActor?.orgId]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  const summary = useMemo(() => {
    const total = rows.length;

    const completed = rows.filter((row) => row.status === "COMPLETED").length;
    const absent = rows.filter((row) => row.status === "ABSENT").length;
    const excused = rows.filter((row) => row.status === "EXCUSED").length;
    const skipped = rows.filter((row) => row.status === "SKIPPED").length;
    const pending = rows.filter((row) => row.status === "PENDING").length;

    const compensationEligible = rows.filter(isCompensationEligibleRow).length;

    const learningLossEligible = rows.filter((row) => {
      return calculateLearningLossDecisionForRow({
        template: sourceTemplate,
        row,
      }).needsLearningLossFollowUp;
    }).length;

    const completedWithScore = rows.filter((row) => {
      return row.status === "COMPLETED" && typeof row.score === "number";
    }).length;

    return {
      total,
      completed,
      absent,
      excused,
      skipped,
      pending,
      compensationEligible,
      learningLossEligible,
      completedWithScore,
    };
  }, [rows, sourceTemplate]);

  const createCompensationBatch = useCallback(async () => {
    if (!currentActor?.orgId || !batch) return;

    if (batch.isCompensationBatch === true) {
      setError("هذه الدفعة تعويضية بالفعل، ولا يمكن إنشاء دفعة تعويضية منها.");
      return;
    }

    if (existingCompensationBatchId) {
      router.push(`/staff/measurements/batches/${existingCompensationBatchId}`);
      return;
    }

    setCreatingCompensationBatch(true);
    setError(null);

    try {
      const existingId = await findExistingCompensationBatch({
        orgId: currentActor.orgId,
        schoolId: batch.schoolId,
        originalBatchId: batch.id,
      });

      if (existingId) {
        setExistingCompensationBatchId(existingId);
        router.push(`/staff/measurements/batches/${existingId}`);
        return;
      }

      const eligibleRows = rows.filter(isCompensationEligibleRow);

      if (eligibleRows.length === 0) {
        setError("لا يوجد طلاب غائبون أو معذورون لإنشاء دفعة تعويضية.");
        return;
      }

      const createdAt = nowMs();
      const actorPersonId = resolveActorPersonId(currentActor);
      const actorRoleKey = resolveActorRoleKey(currentActor);

      const compensationRows: StudentMeasurementBatchStudentRow[] =
        eligibleRows.map((row) => ({
          studentId: row.studentId,
          studentDisplayName: row.studentDisplayName || "",
          enrollmentId: row.enrollmentId || "",

          status: "PENDING",

          level: "",
          valueText: "",

          itemScores: row.itemScores ?? [],
          note: `دفعة تعويضية عن حالة: ${getRowStatusLabel(row.status)}`,

          recordId: "",
        }));

      const compensationTargetStudentIds = compensationRows.map(
        (row) => row.studentId,
      );

      const batchesRef = collection(
        db,
        "orgs",
        currentActor.orgId,
        "studentMeasurementBatches",
      );

      const compensationBatchRef = doc(batchesRef);

      const compensationBatchData = {
        id: compensationBatchRef.id,

        orgId: currentActor.orgId,
        schoolId: batch.schoolId,
        academicYearId: batch.academicYearId,

        gradeId: batch.gradeId || "",
        classId: batch.classId || "",
        classSubjectOfferingId: batch.classSubjectOfferingId || "",

        scopeType: batch.scopeType || "CLASS",
        scopeId: batch.scopeId || batch.classId || "",

        batchKind: batch.batchKind,
        status: "DRAFT",

        templateId: batch.templateId || "",
        templateTitle: batch.templateTitle
          ? `${batch.templateTitle} - دفعة تعويضية`
          : "دفعة تعويضية",

        assessmentKind: batch.assessmentKind,
        trackerKind: batch.trackerKind,
        assessmentSlot: batch.assessmentSlot || "CUSTOM",
        subjectKey: batch.subjectKey || "",

        unitKey: batch.unitKey || "",
        unitTitle: batch.unitTitle || "",
        weekNumber: batch.weekNumber,
        weekLabel: batch.weekLabel || "",

        createdByPersonId: actorPersonId,
        createdByRoleKey: actorRoleKey,

        operationalAssignmentId: batch.operationalAssignmentId || "",
        teacherAssignmentId: batch.teacherAssignmentId || "",

        measuredAt: createdAt,

        targetStudentIds: compensationTargetStudentIds,
        targetCount: compensationTargetStudentIds.length,
        completedCount: 0,
        missingCount: compensationTargetStudentIds.length,

        studentRows: compensationRows,
        recordRefs: [],

        notes: `دفعة تعويضية منشأة من الدفعة الأصلية: ${batch.id}`,

        isCompensationBatch: true,
        originalBatchId: batch.id,
        originalBatchPath: `orgs/${currentActor.orgId}/studentMeasurementBatches/${batch.id}`,
        compensationReason: "ABSENT_OR_EXCUSED",

        createdAt,
        updatedAt: createdAt,
      };

      await setDoc(
        compensationBatchRef,
        removeUndefinedFields(compensationBatchData) as Record<string, unknown>,
      );

      setExistingCompensationBatchId(compensationBatchRef.id);

      router.push(`/staff/measurements/batches/${compensationBatchRef.id}`);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setCreatingCompensationBatch(false);
    }
  }, [batch, currentActor, existingCompensationBatchId, rows, router]);

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
            جاري تحميل دفعة القياس...
          </p>
        </section>
      </main>
    );
  }

  if (!batch) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-bold">دفعة القياس غير متاحة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "لم يتم العثور على الدفعة المطلوبة."}
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

  if (!hasAccessToBatch) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-bold">غير مصرح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه الدفعة ليست ضمن الفصول المرئية لك حاليًا.
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

  const isCompensationBatch = batch.isCompensationBatch === true;
  const hasExistingCompensationBatch =
    Boolean(existingCompensationBatchId) && !isCompensationBatch;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
      <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              10.5M-6 — تفاصيل الدفعة مع تشخيص الفاقد
            </p>

            <h1 className="text-2xl font-bold tracking-tight">
              عرض دفعة القياس / المتابعة
            </h1>

            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              تعرض هذه الصفحة تفاصيل الدفعة، وسياق المادة، ونوع السجل الناتج،
              وهل القالب المرتبط بها يمكن أن يفتح فاقدًا تعليميًا تلقائيًا.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadBatch()}
              className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
            >
              تحديث
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
            >
              رجوع
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      {isCompensationBatch ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-7 text-amber-700 dark:text-amber-300">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              هذه دفعة تعويضية منشأة من الدفعة الأصلية:
              <span className="mx-1 font-mono">
                {batch.originalBatchId || "غير محدد"}
              </span>
            </div>

            {batch.originalBatchId ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/staff/measurements/batches/${batch.originalBatchId}`,
                  )
                }
                className="inline-flex h-9 w-fit items-center justify-center rounded-xl border border-amber-500/40 px-3 text-xs font-medium transition hover:bg-amber-500/10"
              >
                فتح الدفعة الأصلية
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasExistingCompensationBatch ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm leading-7 text-emerald-700 dark:text-emerald-300">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              توجد دفعة تعويضية منشأة مسبقًا لهذه الدفعة. لن يتم إنشاء دفعة
              جديدة.
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/staff/measurements/batches/${existingCompensationBatchId}`,
                )
              }
              className="inline-flex h-9 w-fit items-center justify-center rounded-xl border border-emerald-500/40 px-3 text-xs font-medium transition hover:bg-emerald-500/10"
            >
              فتح الدفعة التعويضية
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-6">
        <SummaryCard label="إجمالي الطلاب" value={summary.total} />
        <SummaryCard label="مكتمل" value={summary.completed} />
        <SummaryCard label="لم يكتمل" value={summary.pending} />
        <SummaryCard label="غائب" value={summary.absent} />
        <SummaryCard label="معذور" value={summary.excused} />
        <SummaryCard label="مرشح للفاقد" value={summary.learningLossEligible} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold">بيانات الدفعة</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <InfoItem
              label="نوع الدفعة"
              value={getBatchKindLabel(batch.batchKind)}
            />
            <InfoItem
              label="حالة الدفعة"
              value={getBatchStatusLabel(batch.status)}
            />
            <InfoItem
              label="نوع السجل الناتج"
              value={getRecordTypeLabel(recordType)}
            />
            <InfoItem
              label="مصدر القالب"
              value={getTemplateCollectionName(batch)}
            />
            <InfoItem
              label="الفصل"
              value={getClassLabel(classInfo, batch.classId)}
            />
            <InfoItem
              label="المدرسة"
              value={getSchoolLabel(classInfo, batch.schoolId)}
            />
            <InfoItem
              label="السنة الدراسية"
              value={batch.academicYearId || "غير محدد"}
            />
            <InfoItem label="الصف" value={batch.gradeId || "غير محدد"} />
            <InfoItem
              label="القالب"
              value={batch.templateTitle || batch.templateId || "غير محدد"}
            />
            <InfoItem
              label="نوع القياس / المتابعة"
              value={
                batch.assessmentSlot ||
                batch.assessmentKind ||
                batch.trackerKind ||
                "غير محدد"
              }
            />
            <InfoItem
              label="المادة / subjectKey"
              value={batch.subjectKey || "غير محدد"}
            />
            <InfoItem
              label="ClassSubjectOffering"
              value={batch.classSubjectOfferingId || "غير محدد"}
            />
            <InfoItem
              label="TeacherAssignment"
              value={batch.teacherAssignmentId || "غير محدد"}
            />
            <InfoItem
              label="OperationalAssignment"
              value={batch.operationalAssignmentId || "غير محدد"}
            />
            <InfoItem
              label="تاريخ الإدخال"
              value={formatDate(batch.measuredAt)}
            />
            <InfoItem label="آخر تحديث" value={formatDate(batch.updatedAt)} />
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">الدفعة التعويضية</h2>

          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            الطلاب المؤهلون للتعويض هم من كانت حالتهم:
            <span className="font-medium text-foreground"> غائب </span>
            أو
            <span className="font-medium text-foreground"> معذور</span>.
          </p>

          <div className="mt-4 rounded-xl border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">عدد الطلاب المؤهلين</p>
            <p className="mt-2 text-3xl font-bold">
              {summary.compensationEligible.toLocaleString("ar-SA")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void createCompensationBatch()}
            disabled={
              creatingCompensationBatch ||
              summary.compensationEligible === 0 ||
              isCompensationBatch
            }
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingCompensationBatch
              ? "جاري المعالجة..."
              : hasExistingCompensationBatch
                ? "فتح الدفعة التعويضية الموجودة"
                : "إنشاء دفعة تعويضية"}
          </button>

          {isCompensationBatch && batch.originalBatchId ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/staff/measurements/batches/${batch.originalBatchId}`,
                )
              }
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
            >
              فتح الدفعة الأصلية
            </button>
          ) : null}

          {hasExistingCompensationBatch ? (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/staff/measurements/batches/${existingCompensationBatchId}`,
                )
              }
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
            >
              فتح الدفعة التعويضية
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => router.push(buildEditBatchHref(batch))}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
          >
            إدخال / تعديل نتائج الدفعة
          </button>
        </section>
      </section>

      <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-sm leading-7 text-violet-800 dark:text-violet-200">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">تشخيص الفاقد لهذه الدفعة</h2>
            <p className="mt-1 text-sm text-violet-700 dark:text-violet-300">
              هذا القسم يساعدك على معرفة هل القالب مضبوط لفتح الفاقد، وهل توجد
              صفوف مكتملة أقل من حد الفاقد.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <ContextItem
            label="القالب موجود؟"
            value={sourceTemplate ? "نعم" : "لا"}
          />
          <ContextItem
            label="يفتح فاقد؟"
            value={sourceTemplate?.requiresLearningLossFollowUp ? "نعم" : "لا"}
          />
          <ContextItem
            label="حد الدرجة"
            value={
              typeof sourceTemplate?.learningLossThresholdScore === "number"
                ? sourceTemplate.learningLossThresholdScore.toLocaleString(
                    "ar-SA",
                  )
                : "—"
            }
          />
          <ContextItem
            label="حد النسبة"
            value={
              typeof sourceTemplate?.learningLossThresholdPercentage ===
              "number"
                ? `${sourceTemplate.learningLossThresholdPercentage}%`
                : "—"
            }
          />
          <ContextItem
            label="نوع السجل الناتج"
            value={getRecordTypeLabel(recordType)}
          />
          <ContextItem
            label="صفوف مكتملة بدرجة"
            value={summary.completedWithScore.toLocaleString("ar-SA")}
          />
          <ContextItem
            label="مرشحون للفاقد"
            value={summary.learningLossEligible.toLocaleString("ar-SA")}
          />
          <ContextItem
            label="مجموعة القوالب"
            value={getTemplateCollectionName(batch)}
          />
        </div>

        {!sourceTemplate ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
            لم يتم العثور على القالب المرتبط بهذه الدفعة. تأكد أن
            <span className="mx-1 font-mono">
              {batch.templateId || "templateId"}
            </span>
            موجود داخل
            <span className="mx-1 font-mono">
              {getTemplateCollectionName(batch)}
            </span>
            .
          </div>
        ) : !sourceTemplate.requiresLearningLossFollowUp ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
            القالب موجود، لكنه لا يفتح فاقدًا لأن
            <span className="mx-1 font-mono">requiresLearningLossFollowUp</span>
            ليست مفعلة. سيتم ضبط ذلك في خطوة تحديث قوالب الروضة.
          </div>
        ) : summary.learningLossEligible === 0 ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            القالب يفتح فاقدًا، لكن لا توجد صفوف مكتملة أقل من الحد الحالي.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            توجد صفوف مرشحة للفاقد. بعد إرسال الدفعة يجب أن تظهر في مركز الفاقد.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">طلاب الدفعة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            عرض حالة كل طالب داخل الدفعة، مع توضيح الطلاب المؤهلين للتعويض أو
            المرشحين للفاقد حسب القالب.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            لا توجد صفوف طلاب داخل هذه الدفعة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-right text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الطالب
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الحالة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الدرجة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    النسبة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المستوى / النص
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    البنود
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    السجل الناتج
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    تعويض؟
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    فاقد؟
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    سبب الفاقد
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    ملاحظة
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const compensationEligible = isCompensationEligibleRow(row);
                  const learningLossDecision =
                    calculateLearningLossDecisionForRow({
                      template: sourceTemplate,
                      row,
                    });

                  return (
                    <tr key={row.studentId} className="border-t">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        <div className="space-y-1">
                          <p>{row.studentDisplayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.studentId}
                          </p>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getRowStatusLabel(row.status)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatScore(row)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatPercentageValue(
                          learningLossDecision.scorePercentage,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {row.level || row.valueText || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {(row.itemScores ?? []).length.toLocaleString("ar-SA")}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {row.recordId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {compensationEligible ? (
                          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            مؤهل
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                            لا
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {learningLossDecision.needsLearningLossFollowUp ? (
                          <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                            نعم
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                            لا
                          </span>
                        )}
                      </td>

                      <td className="min-w-[240px] px-4 py-3 text-muted-foreground">
                        {learningLossDecision.reason}
                      </td>

                      <td className="min-w-[220px] px-4 py-3 text-muted-foreground">
                        {row.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("ar-SA")}</p>
    </div>
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

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/40">
      <p className="text-xs text-violet-700 dark:text-violet-300">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}
