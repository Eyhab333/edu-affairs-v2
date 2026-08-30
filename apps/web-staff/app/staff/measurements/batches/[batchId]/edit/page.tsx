"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Layers3,
  Save,
  School,
  Send,
  Target,
  UsersRound,
} from "lucide-react";

import type {
  OperationItemScore,
  StudentAssessmentTemplate,
  StudentMeasurementBatch,
  StudentMeasurementBatchStudentRow,
  StudentTrackerTemplate,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { getVisibleStudents } from "@/lib/visible-students";
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
  role?: string;
  roleKey?: string;
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
};

type MeasurementBatchDoc = StudentMeasurementBatch & {
  id: string;
  classSubjectOfferingId?: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
};

type LearningLossTemplateFields = Pick<
  StudentAssessmentTemplate | StudentTrackerTemplate,
  | "requiresLearningLossFollowUp"
  | "learningLossThresholdScore"
  | "learningLossThresholdPercentage"
> & {
  id?: string;
  title?: string;
  subjectKey?: string;
  maxScore?: number;
};

type BatchStudentStatus =
  | "PENDING"
  | "COMPLETED"
  | "ABSENT"
  | "EXCUSED"
  | "SKIPPED";

type EditableBatchRow = StudentMeasurementBatchStudentRow & {
  studentDisplayName?: string;
  recordType?: "ASSESSMENT_RECORD" | "TRACKER_ENTRY";
};

type DraftRow = {
  status: BatchStudentStatus;
  score: string;
  itemScores: Record<string, string>;
  note: string;
};

type DraftRows = Record<string, DraftRow>;

type LoadingState = "idle" | "loading" | "success" | "error";

type StudentSummary = {
  id: string;
  personId?: string;
  displayName: string;
};

type BatchItemDefinition = {
  itemKey: string;
  itemId?: string;
  itemTitle: string;
  category?: string;
  valueType?: string;
  maxScore?: number;
  weight?: number;
  order?: number;
};

type SummaryCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function nowMs() {
  return Date.now();
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, itemValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (itemValue === undefined) continue;
      result[key] = stripUndefined(itemValue);
    }

    return result;
  }

  return value;
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return undefined;

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) return Number.NaN;

  return parsed;
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

function resolveActorPersonId(actor: StaffMeasurementsActor) {
  return actor.personId || actor.uid || "unknown";
}

function resolveActorRoleKey(actor: StaffMeasurementsActor) {
  return (
    actor.roles?.[0] ||
    actor.roleKeys?.[0] ||
    actor.roleKey ||
    actor.role ||
    "staff"
  );
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
      return "لم يبدأ";
    case "COMPLETED":
      return "مكتمل";
    case "ABSENT":
      return "غائب";
    case "EXCUSED":
      return "معذور";
    case "SKIPPED":
      return "مستبعد";
    default:
      return value || "غير محدد";
  }
}

function isScoreDisabled(status: BatchStudentStatus) {
  return status === "ABSENT" || status === "EXCUSED" || status === "SKIPPED";
}

function isBatchEditable(batch: MeasurementBatchDoc) {
  return ["DRAFT", "IN_PROGRESS"].includes(String(batch.status || ""));
}

function getDefaultDraftRow(): DraftRow {
  return {
    status: "PENDING",
    score: "",
    itemScores: {},
    note: "",
  };
}

function getDraftRow(draftRows: DraftRows, studentId: string): DraftRow {
  return draftRows[studentId] ?? getDefaultDraftRow();
}

function getBatchRecordType(batch: MeasurementBatchDoc) {
  return batch.batchKind === "ASSESSMENT"
    ? "ASSESSMENT_RECORD"
    : "TRACKER_ENTRY";
}

function getBatchKind(batch: MeasurementBatchDoc) {
  return batch.batchKind || "CUSTOM";
}

function buildRowsFromBatch(batch: MeasurementBatchDoc): EditableBatchRow[] {
  if (Array.isArray(batch.studentRows) && batch.studentRows.length > 0) {
    return batch.studentRows.map((row) => ({
      ...row,
      status: (row.status || "PENDING") as BatchStudentStatus,
    }));
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

function buildDraftRowsFromRows(rows: EditableBatchRow[]): DraftRows {
  const result: DraftRows = {};

  for (const row of rows) {
    const itemScores: Record<string, string> = {};

    for (const item of row.itemScores ?? []) {
      if (typeof item.score === "number") {
        itemScores[item.itemKey] = String(item.score);
      }
    }

    result[row.studentId] = {
      status: (row.status || "PENDING") as BatchStudentStatus,
      score: typeof row.score === "number" ? String(row.score) : "",
      itemScores,
      note: row.note || "",
    };
  }

  return result;
}

function resolveItemDefinitions(
  rows: EditableBatchRow[],
): BatchItemDefinition[] {
  const map = new Map<string, BatchItemDefinition>();

  for (const row of rows) {
    for (const item of row.itemScores ?? []) {
      if (!item.itemKey || map.has(item.itemKey)) continue;

      map.set(item.itemKey, {
        itemKey: item.itemKey,
        itemId: item.itemId || "",
        itemTitle: item.itemTitle || item.itemKey,
        category: item.category || "",
        valueType: item.valueType || "NUMERIC",
        maxScore: item.maxScore,
        weight: item.weight,
        order: item.order,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

function buildItemScoresForDraft(params: {
  draft: DraftRow;
  itemDefinitions: BatchItemDefinition[];
}): OperationItemScore[] {
  return params.itemDefinitions.map((item) => {
    const rawValue = params.draft.itemScores[item.itemKey] ?? "";
    const parsedScore = parseOptionalNumber(rawValue);

    return {
      itemKey: item.itemKey,
      itemId: item.itemId || "",
      itemTitle: item.itemTitle,
      category: item.category || "",
      valueType: "NUMERIC",
      score:
        typeof parsedScore === "number" && Number.isFinite(parsedScore)
          ? parsedScore
          : undefined,
      maxScore: item.maxScore,
      weight: item.weight ?? 1,
      level: "",
      valueText: "",
      note: "",
      order: item.order ?? 0,
    };
  });
}

function calculateDraftScore(params: {
  draft: DraftRow;
  itemDefinitions: BatchItemDefinition[];
}) {
  if (params.itemDefinitions.length === 0) {
    const parsedScore = parseOptionalNumber(params.draft.score);

    if (typeof parsedScore === "number" && Number.isFinite(parsedScore)) {
      return parsedScore;
    }

    return undefined;
  }

  const itemScores = buildItemScoresForDraft(params);

  const scores = itemScores
    .map((item) => item.score)
    .filter((score): score is number => typeof score === "number");

  if (scores.length === 0) return undefined;

  return scores.reduce((sum, score) => sum + score, 0);
}

function calculateMaxScore(params: {
  batch: MeasurementBatchDoc;
  itemDefinitions: BatchItemDefinition[];
  sourceRow?: EditableBatchRow;
}) {
  if (typeof params.sourceRow?.maxScore === "number") {
    return params.sourceRow.maxScore;
  }

  if (params.itemDefinitions.length > 0) {
    const total = params.itemDefinitions
      .map((item) => item.maxScore)
      .filter((value): value is number => typeof value === "number")
      .reduce((sum, value) => sum + value, 0);

    if (total > 0) return total;
  }

  return undefined;
}

function buildStudentRowsForSave(params: {
  rows: EditableBatchRow[];
  draftRows: DraftRows;
  itemDefinitions: BatchItemDefinition[];
  batch: MeasurementBatchDoc;
}) {
  return params.rows.map((row) => {
    const draft = getDraftRow(params.draftRows, row.studentId);
    const scoreDisabled = isScoreDisabled(draft.status);

    const itemScores = scoreDisabled
      ? []
      : buildItemScoresForDraft({
          draft,
          itemDefinitions: params.itemDefinitions,
        });

    const score = scoreDisabled
      ? undefined
      : calculateDraftScore({
          draft,
          itemDefinitions: params.itemDefinitions,
        });

    return {
      studentId: row.studentId,
      studentDisplayName: row.studentDisplayName || "",
      enrollmentId: row.enrollmentId || "",

      status: draft.status,

      score,
      maxScore: calculateMaxScore({
        batch: params.batch,
        itemDefinitions: params.itemDefinitions,
        sourceRow: row,
      }),

      level: row.level || "",
      valueText: row.valueText || "",

      itemScores,
      note: draft.note || "",

      recordId: row.recordId || "",
      recordType: row.recordType || getBatchRecordType(params.batch),
    };
  });
}

function validateRowsForSubmit(params: {
  rows: EditableBatchRow[];
  draftRows: DraftRows;
  itemDefinitions: BatchItemDefinition[];
}) {
  for (const row of params.rows) {
    const draft = getDraftRow(params.draftRows, row.studentId);

    if (draft.status !== "COMPLETED") continue;

    if (params.itemDefinitions.length === 0) {
      const parsedScore = parseOptionalNumber(draft.score);

      if (parsedScore === undefined || Number.isNaN(parsedScore)) {
        return `يجب إدخال درجة صحيحة للطالب: ${
          row.studentDisplayName || row.studentId
        }`;
      }

      continue;
    }

    for (const item of params.itemDefinitions) {
      const parsedScore = parseOptionalNumber(
        draft.itemScores[item.itemKey] ?? "",
      );

      if (parsedScore === undefined || Number.isNaN(parsedScore)) {
        return `يجب إدخال درجة صحيحة في بند "${item.itemTitle}" للطالب: ${
          row.studentDisplayName || row.studentId
        }`;
      }
    }
  }

  return null;
}

async function loadStudentName(
  orgId: string,
  studentId: string,
): Promise<StudentSummary> {
  const roster = await getVisibleStudents({ orgId });
  const displayName = roster.rows.find(
    (row) => row.studentId === studentId,
  )?.displayName;

  return { id: studentId, displayName: displayName || studentId };
}

async function buildRowViews(params: {
  orgId: string;
  batch: MeasurementBatchDoc;
}): Promise<EditableBatchRow[]> {
  const rows = buildRowsFromBatch(params.batch);

  return Promise.all(
    rows.map(async (row) => {
      if (row.studentDisplayName?.trim()) {
        return {
          ...row,
          studentDisplayName: row.studentDisplayName,
        };
      }

      const student = await loadStudentName(params.orgId, row.studentId);

      return {
        ...row,
        studentDisplayName: student.displayName,
      };
    }),
  );
}

function buildAssessmentRecordPayload(params: {
  recordId: string;
  batchId: string;
  batchKind: string;
  row: EditableBatchRow;
  sourceTemplate?: LearningLossTemplateFields | null;
  score?: number;
  maxScore?: number;
  itemScores: OperationItemScore[];
  note: string;
  actor: StaffMeasurementsActor;
  batch: MeasurementBatchDoc;
  now: number;
}) {
  const learningLossDecision = calculateLearningLossDecisionForRecord({
    template: params.sourceTemplate,
    score: params.score,
    maxScore: params.maxScore,
  });
  return {
    id: params.recordId,

    orgId: params.batch.orgId,
    schoolId: params.batch.schoolId,
    academicYearId: params.batch.academicYearId,

    studentId: params.row.studentId,
    enrollmentId: params.row.enrollmentId || "",

    gradeId: params.batch.gradeId || "",
    classId: params.batch.classId || "",
    classSubjectOfferingId: params.batch.classSubjectOfferingId || "",

    templateId: params.batch.templateId,
    kind: params.batch.assessmentKind || "CUSTOM_ASSESSMENT",
    assessmentSlot: params.batch.assessmentSlot || "CUSTOM",
    subjectKey: params.batch.subjectKey || "",

    evaluatorRoleKey:
      params.batch.createdByRoleKey || resolveActorRoleKey(params.actor),
    assessedByPersonId:
      params.batch.createdByPersonId || resolveActorPersonId(params.actor),

    measuredAt: params.batch.measuredAt || params.now,

    score: params.score,
    maxScore: params.maxScore,

    level: params.row.level || "",
    passed: undefined,
    notes: params.note || "",

    status: "PUBLISHED",

    batchId: params.batchId,
    batchKind: params.batchKind,

    itemScores: params.itemScores,

    needsLearningLossFollowUp: learningLossDecision.needsLearningLossFollowUp,
    learningLossPlanId: "",
    learningLossTriggerReason: learningLossDecision.reason,

    createdAt: params.now,
    updatedAt: params.now,
  };
}

function buildTrackerEntryPayload(params: {
  recordId: string;
  batchId: string;
  batchKind: string;
  row: EditableBatchRow;
  sourceTemplate?: LearningLossTemplateFields | null;
  score?: number;
  maxScore?: number;
  itemScores: OperationItemScore[];
  note: string;
  actor: StaffMeasurementsActor;
  batch: MeasurementBatchDoc;
  now: number;
}) {
  const learningLossDecision = calculateLearningLossDecisionForRecord({
    template: params.sourceTemplate,
    score: params.score,
    maxScore: params.maxScore,
  });
  return {
    id: params.recordId,

    orgId: params.batch.orgId,
    schoolId: params.batch.schoolId,
    academicYearId: params.batch.academicYearId,

    studentId: params.row.studentId,
    enrollmentId: params.row.enrollmentId || "",

    gradeId: params.batch.gradeId || "",
    classId: params.batch.classId || "",
    classSubjectOfferingId: params.batch.classSubjectOfferingId || "",

    templateId: params.batch.templateId,
    kind: params.batch.trackerKind || "CUSTOM_TRACKER",
    subjectKey: params.batch.subjectKey || "",

    evaluatorRoleKey:
      params.batch.createdByRoleKey || resolveActorRoleKey(params.actor),
    trackedByPersonId:
      params.batch.createdByPersonId || resolveActorPersonId(params.actor),

    trackedAt: params.batch.measuredAt || params.now,

    score: params.score,
    maxScore: params.maxScore,

    level: params.row.level || "",
    valueText: params.row.valueText || "",
    notes: params.note || "",

    status: "RECORDED",

    batchId: params.batchId,
    batchKind: params.batchKind,

    itemScores: params.itemScores,
    needsLearningLossFollowUp: learningLossDecision.needsLearningLossFollowUp,
    learningLossPlanId: "",
    learningLossTriggerReason: learningLossDecision.reason,
    createdAt: params.now,
    updatedAt: params.now,
  };
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

async function loadMeasurementSourceTemplate(params: {
  orgId: string;
  batch: MeasurementBatchDoc;
}): Promise<LearningLossTemplateFields | null> {
  if (!params.batch.templateId) return null;

  const collectionName = isTrackerMeasurementBatch(params.batch)
    ? "studentTrackerTemplates"
    : "studentAssessmentTemplates";

  try {
    const templateRef = doc(
      db,
      "orgs",
      params.orgId,
      collectionName,
      params.batch.templateId,
    );

    const templateSnap = await getDoc(templateRef);

    if (!templateSnap.exists()) return null;

    return {
      id: templateSnap.id,
      ...(templateSnap.data() as Omit<LearningLossTemplateFields, "id">),
    };
  } catch {
    return null;
  }
}

function calculateLearningLossDecisionForRecord(params: {
  template?: LearningLossTemplateFields | null;
  score?: number;
  maxScore?: number;
}) {
  const maxScore =
    typeof params.maxScore === "number"
      ? params.maxScore
      : params.template?.maxScore;

  const scorePercentage =
    typeof params.score === "number" &&
    typeof maxScore === "number" &&
    maxScore > 0
      ? (params.score / maxScore) * 100
      : null;

  if (!params.template) {
    return {
      needsLearningLossFollowUp: false,
      reason: "لم يتم العثور على قالب لحساب قرار الفاقد",
    };
  }

  if (!params.template.requiresLearningLossFollowUp) {
    return {
      needsLearningLossFollowUp: false,
      reason: "القالب لا يتطلب متابعة فاقد تعليمي",
    };
  }

  if (
    typeof params.template.learningLossThresholdScore === "number" &&
    typeof params.score === "number" &&
    params.score < params.template.learningLossThresholdScore
  ) {
    return {
      needsLearningLossFollowUp: true,
      reason: "درجة الطالب أقل من حد الفاقد المحدد في القالب",
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
    };
  }

  return {
    needsLearningLossFollowUp: false,
    reason: "درجة الطالب لا تستدعي فتح خطة فاقد",
  };
}

export default function StaffMeasurementBatchEditPage() {
  const params = useParams<{ batchId?: string }>();
  const router = useRouter();
  const { actor } = useStaffActor();

  const batchId = params?.batchId || "";
  const currentActor = actor as StaffMeasurementsActor | null;

  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<MeasurementBatchDoc | null>(null);
  const [rows, setRows] = useState<EditableBatchRow[]>([]);
  const [draftRows, setDraftRows] = useState<DraftRows>({});
  const [sourceTemplate, setSourceTemplate] =
    useState<LearningLossTemplateFields | null>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

  const itemDefinitions = useMemo(() => {
    return resolveItemDefinitions(rows);
  }, [rows]);

  const editable = useMemo(() => {
    return batch ? isBatchEditable(batch) : false;
  }, [batch]);

  const summary = useMemo(() => {
    const total = rows.length;

    let completed = 0;
    let absent = 0;
    let excused = 0;
    let skipped = 0;
    let pending = 0;

    for (const row of rows) {
      const draft = getDraftRow(draftRows, row.studentId);

      if (draft.status === "COMPLETED") completed += 1;
      if (draft.status === "ABSENT") absent += 1;
      if (draft.status === "EXCUSED") excused += 1;
      if (draft.status === "SKIPPED") skipped += 1;
      if (draft.status === "PENDING") pending += 1;
    }

    return {
      total,
      completed,
      absent,
      excused,
      skipped,
      pending,
    };
  }, [draftRows, rows]);

  const loadBatch = useCallback(async () => {
    if (!currentActor?.orgId || !batchId) return;

    setStatus("loading");
    setError(null);
    setDraftSaveError(null);
    setSubmitError(null);
    setDraftSaved(false);
    setSubmitted(false);

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
        setDraftRows({});
        setError("لم يتم العثور على دفعة القياس.");
        setStatus("error");
        return;
      }

      const loadedBatch = {
        id: batchSnap.id,
        ...(batchSnap.data() as Omit<MeasurementBatchDoc, "id">),
      };

      const loadedRows = await buildRowViews({
        orgId: currentActor.orgId,
        batch: loadedBatch,
      });

      const loadedSourceTemplate = await loadMeasurementSourceTemplate({
        orgId: currentActor.orgId,
        batch: loadedBatch,
      });

      setBatch(loadedBatch);
      setRows(loadedRows);
      setDraftRows(buildDraftRowsFromRows(loadedRows));
      setSourceTemplate(loadedSourceTemplate);
      setStatus("success");
    } catch (error: unknown) {
      setBatch(null);
      setRows([]);
      setDraftRows({});
      setSourceTemplate(null);
      setError(getErrorMessage(error));
      setStatus("error");
    }
  }, [batchId, currentActor?.orgId]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  function updateDraftRow(studentId: string, patch: Partial<DraftRow>) {
    setDraftRows((prev) => {
      const current = getDraftRow(prev, studentId);

      return {
        ...prev,
        [studentId]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function updateDraftItemScore(
    studentId: string,
    itemKey: string,
    value: string,
  ) {
    setDraftRows((prev) => {
      const current = getDraftRow(prev, studentId);

      return {
        ...prev,
        [studentId]: {
          ...current,
          status: value ? "COMPLETED" : current.status,
          itemScores: {
            ...current.itemScores,
            [itemKey]: value,
          },
        },
      };
    });
  }

  async function saveDraftBatch() {
    if (!currentActor?.orgId || !batch) return;

    if (!editable) {
      setDraftSaveError(
        "لا يمكن تعديل هذه الدفعة لأنها ليست مسودة أو قيد الإدخال.",
      );
      return;
    }

    setSavingDraft(true);
    setDraftSaveError(null);
    setDraftSaved(false);

    try {
      const updatedAt = nowMs();

      const updatedStudentRows = buildStudentRowsForSave({
        rows,
        draftRows,
        itemDefinitions,
        batch,
      });

      const completedCount = updatedStudentRows.filter(
        (row) => row.status === "COMPLETED",
      ).length;

      const batchPayload = stripUndefined({
        status: "IN_PROGRESS",

        classSubjectOfferingId: batch.classSubjectOfferingId || "",
        subjectKey: batch.subjectKey || "",
        teacherAssignmentId: batch.teacherAssignmentId || "",

        targetStudentIds: updatedStudentRows.map((row) => row.studentId),
        targetCount: updatedStudentRows.length,
        completedCount,
        missingCount: updatedStudentRows.length - completedCount,

        studentRows: updatedStudentRows,

        updatedAt,
      }) as Record<string, unknown>;

      const batchRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentMeasurementBatches",
        batch.id,
      );

      await setDoc(batchRef, batchPayload, { merge: true });

      setBatch((prev) =>
        prev
          ? ({
              ...prev,
              ...batchPayload,
            } as MeasurementBatchDoc)
          : prev,
      );

      setRows(updatedStudentRows as EditableBatchRow[]);
      setDraftSaved(true);
    } catch (error: unknown) {
      setDraftSaveError(getErrorMessage(error));
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitBatch() {
    if (!currentActor?.orgId || !batch) return;

    if (!editable) {
      setSubmitError(
        "لا يمكن إرسال هذه الدفعة لأنها ليست مسودة أو قيد الإدخال.",
      );
      return;
    }

    const validationError = validateRowsForSubmit({
      rows,
      draftRows,
      itemDefinitions,
    });

    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmittingBatch(true);
    setSubmitError(null);
    setDraftSaveError(null);
    setSubmitted(false);

    try {
      const submittedAt = nowMs();
      const firestoreBatch = writeBatch(db);

      const batchKind = getBatchKind(batch);
      const recordType = getBatchRecordType(batch);

      const updatedStudentRows = buildStudentRowsForSave({
        rows,
        draftRows,
        itemDefinitions,
        batch,
      });

      const recordRefs: Array<{
        studentId: string;
        recordType: "ASSESSMENT_RECORD" | "TRACKER_ENTRY";
        recordId: string;
        status: "COMPLETED" | "MISSING";
      }> = [];

      for (const row of rows) {
        const draft = getDraftRow(draftRows, row.studentId);

        if (draft.status !== "COMPLETED") {
          recordRefs.push({
            studentId: row.studentId,
            recordType,
            recordId: "",
            status: "MISSING",
          });
          continue;
        }

        const matchingUpdatedRow = updatedStudentRows.find(
          (item) => item.studentId === row.studentId,
        );

        const score = calculateDraftScore({
          draft,
          itemDefinitions,
        });

        const maxScore = calculateMaxScore({
          batch,
          itemDefinitions,
          sourceRow: row,
        });

        const itemScores = isScoreDisabled(draft.status)
          ? []
          : buildItemScoresForDraft({
              draft,
              itemDefinitions,
            });

        const recordRef =
          recordType === "ASSESSMENT_RECORD"
            ? doc(
                collection(
                  db,
                  "orgs",
                  currentActor.orgId,
                  "studentAssessmentRecords",
                ),
              )
            : doc(
                collection(
                  db,
                  "orgs",
                  currentActor.orgId,
                  "studentTrackerEntries",
                ),
              );

        const recordId = recordRef.id;

        const recordPayload =
          recordType === "ASSESSMENT_RECORD"
            ? buildAssessmentRecordPayload({
                recordId,
                batchId: batch.id,
                batchKind,
                row,
                sourceTemplate,
                score,
                maxScore,
                itemScores,
                note: draft.note,
                actor: currentActor,
                batch,
                now: submittedAt,
              })
            : buildTrackerEntryPayload({
                recordId,
                batchId: batch.id,
                batchKind,
                row,
                sourceTemplate,
                score,
                maxScore,
                itemScores,
                note: draft.note,
                actor: currentActor,
                batch,
                now: submittedAt,
              });

        firestoreBatch.set(
          recordRef,
          stripUndefined(recordPayload) as Record<string, unknown>,
        );

        if (matchingUpdatedRow) {
          matchingUpdatedRow.recordId = recordId;
          matchingUpdatedRow.recordType = recordType;
        }

        recordRefs.push({
          studentId: row.studentId,
          recordType,
          recordId,
          status: "COMPLETED",
        });
      }

      const completedCount = updatedStudentRows.filter(
        (row) => row.status === "COMPLETED",
      ).length;

      const batchPayload = stripUndefined({
        status: "SUBMITTED",

        classSubjectOfferingId: batch.classSubjectOfferingId || "",
        subjectKey: batch.subjectKey || "",
        teacherAssignmentId: batch.teacherAssignmentId || "",

        targetStudentIds: updatedStudentRows.map((row) => row.studentId),
        targetCount: updatedStudentRows.length,
        completedCount,
        missingCount: updatedStudentRows.length - completedCount,

        studentRows: updatedStudentRows,
        recordRefs,

        submittedAt,
        updatedAt: submittedAt,
      }) as Record<string, unknown>;

      const batchRef = doc(
        db,
        "orgs",
        currentActor.orgId,
        "studentMeasurementBatches",
        batch.id,
      );

      firestoreBatch.set(batchRef, batchPayload, { merge: true });

      await firestoreBatch.commit();

      setBatch((prev) =>
        prev
          ? ({
              ...prev,
              ...batchPayload,
            } as MeasurementBatchDoc)
          : prev,
      );

      setRows(updatedStudentRows as EditableBatchRow[]);
      setSubmitted(true);
    } catch (error: unknown) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmittingBatch(false);
    }
  }

  if (!currentActor) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            جاري تحميل بيانات المستخدم...
          </p>
        </div>
      </PageShell>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <PageShell>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            جاري تحميل دفعة القياس...
          </p>
        </div>
      </PageShell>
    );
  }

  if (!batch) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center shadow-sm dark:border-red-900/60 dark:bg-red-950/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h1 className="mt-4 text-xl font-bold">دفعة القياس غير متاحة</h1>

          <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-red-900 dark:text-red-100">
            {error || "لم يتم العثور على الدفعة المطلوبة."}
          </p>

          <Link
            href="/staff/measurements"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300"
          >
            الرجوع للقياسات
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!hasAccessToBatch) {
    return (
      <PageShell>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h1 className="mt-4 text-xl font-bold">غير مصرح</h1>

          <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-amber-900 dark:text-amber-100">
            هذه الدفعة ليست ضمن الفصول المرئية لك حاليًا.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/staff/measurements/batches/${batch.id}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          الرجوع لتفاصيل الدفعة
        </Link>

        {batch.classId ? (
          <Link
            href={`/staff/classes/${encodeURIComponent(batch.classId)}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <BookOpen className="h-4 w-4" />
            فتح الفصل
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                <Layers3 className="h-3.5 w-3.5" />
                10.5H — تعديل دفعة القياس مع سياق المادة
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                  تعديل نتائج الدفعة
                </h1>

                <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                  هذه الصفحة تحفظ سياق المادة عند تعديل الدفعة، ثم تنقله إلى
                  السجلات الفردية عند الإرسال.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!editable || savingDraft || submittingBatch}
                onClick={saveDraftBatch}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <Save className="h-4 w-4" />
                {savingDraft ? "جاري الحفظ..." : "حفظ التعديل كمسودة"}
              </button>

              <button
                type="button"
                disabled={!editable || savingDraft || submittingBatch}
                onClick={submitBatch}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                <Send className="h-4 w-4" />
                {submittingBatch ? "جاري الإرسال..." : "إرسال الدفعة"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={School}
            label="المدرسة"
            value={getSchoolLabel(classInfo, batch.schoolId)}
          />

          <SummaryCard
            icon={CalendarDays}
            label="السنة الدراسية"
            value={batch.academicYearId || "غير محدد"}
          />

          <SummaryCard
            icon={GraduationCap}
            label="الفصل"
            value={getClassLabel(classInfo, batch.classId)}
          />

          <SummaryCard
            icon={UsersRound}
            label="طلاب الدفعة"
            value={`${summary.total} طالب`}
          />
        </div>
      </div>

      {!editable ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          هذه الدفعة حالتها الحالية:{" "}
          <span className="font-bold">{getBatchStatusLabel(batch.status)}</span>
          . التعديل مسموح فقط للدفعات المسودة أو قيد الإدخال.
        </div>
      ) : null}

      {draftSaveError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {draftSaveError}
        </div>
      ) : null}

      {draftSaved ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          تم حفظ التعديلات كمسودة بنجاح.
        </div>
      ) : null}

      {submitError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {submitError}
        </div>
      ) : null}

      {submitted ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          تم إرسال الدفعة وإنشاء السجلات الفردية مع حفظ سياق المادة.
        </div>
      ) : null}

      <BatchContextSection batch={batch} />

      <div className="grid gap-4 md:grid-cols-6">
        <MiniStat label="إجمالي" value={summary.total} />
        <MiniStat label="مكتمل" value={summary.completed} />
        <MiniStat label="لم يبدأ" value={summary.pending} />
        <MiniStat label="غائب" value={summary.absent} />
        <MiniStat label="معذور" value={summary.excused} />
        <MiniStat label="مستبعد" value={summary.skipped} />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            <ClipboardList className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-bold">نتائج الطلاب</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              عدّل حالة كل طالب ودرجته أو درجات البنود، ثم احفظ أو أرسل الدفعة.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h3 className="font-bold">لا توجد صفوف طلاب داخل هذه الدفعة</h3>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الطالب
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الحالة
                  </th>
                  {itemDefinitions.length === 0 ? (
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      الدرجة
                    </th>
                  ) : (
                    itemDefinitions.map((item) => (
                      <th
                        key={item.itemKey}
                        className="whitespace-nowrap px-4 py-3 font-medium"
                      >
                        {item.itemTitle}
                        {typeof item.maxScore === "number" ? (
                          <span className="ms-1 text-xs text-slate-400">
                            / {item.maxScore}
                          </span>
                        ) : null}
                      </th>
                    ))
                  )}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    ملاحظة
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const draft = getDraftRow(draftRows, row.studentId);
                  const scoreDisabled = isScoreDisabled(draft.status);

                  return (
                    <tr
                      key={`${row.enrollmentId || "NO_ENROLLMENT"}:${
                        row.studentId
                      }`}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        <div className="space-y-1">
                          <p>{row.studentDisplayName || row.studentId}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {row.studentId}
                          </p>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <select
                          value={draft.status}
                          disabled={!editable}
                          onChange={(event) =>
                            updateDraftRow(row.studentId, {
                              status: event.target.value as BatchStudentStatus,
                            })
                          }
                          className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                        >
                          <option value="PENDING">
                            {getRowStatusLabel("PENDING")}
                          </option>
                          <option value="COMPLETED">
                            {getRowStatusLabel("COMPLETED")}
                          </option>
                          <option value="ABSENT">
                            {getRowStatusLabel("ABSENT")}
                          </option>
                          <option value="EXCUSED">
                            {getRowStatusLabel("EXCUSED")}
                          </option>
                          <option value="SKIPPED">
                            {getRowStatusLabel("SKIPPED")}
                          </option>
                        </select>
                      </td>

                      {itemDefinitions.length === 0 ? (
                        <td className="whitespace-nowrap px-4 py-3">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={draft.score}
                            disabled={!editable || scoreDisabled}
                            onChange={(event) =>
                              updateDraftRow(row.studentId, {
                                status: event.target.value
                                  ? "COMPLETED"
                                  : draft.status,
                                score: event.target.value,
                              })
                            }
                            className="h-10 w-28 rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                          />
                        </td>
                      ) : (
                        itemDefinitions.map((item) => (
                          <td
                            key={`${row.studentId}:${item.itemKey}`}
                            className="whitespace-nowrap px-4 py-3"
                          >
                            <input
                              type="number"
                              inputMode="decimal"
                              value={draft.itemScores[item.itemKey] ?? ""}
                              disabled={!editable || scoreDisabled}
                              onChange={(event) =>
                                updateDraftItemScore(
                                  row.studentId,
                                  item.itemKey,
                                  event.target.value,
                                )
                              }
                              className="h-10 w-28 rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                            />
                          </td>
                        ))
                      )}

                      <td className="min-w-[220px] px-4 py-3">
                        <input
                          value={draft.note}
                          disabled={!editable}
                          onChange={(event) =>
                            updateDraftRow(row.studentId, {
                              note: event.target.value,
                            })
                          }
                          className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                          placeholder="ملاحظة اختيارية"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        {children}
      </section>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("ar-SA")}</p>
    </div>
  );
}

function BatchContextSection({ batch }: { batch: MeasurementBatchDoc }) {
  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5 text-sm leading-7 text-violet-950 shadow-sm dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white/70 p-3 text-violet-700 dark:bg-slate-950/40 dark:text-violet-300">
          <Target className="h-5 w-5" />
        </div>

        <div>
          <h2 className="font-bold">سياق المادة المحفوظ في الدفعة</h2>
          <p className="text-xs text-violet-700 dark:text-violet-300">
            هذا السياق سيتم نسخه إلى السجلات الفردية عند الإرسال.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ContextItem
          label="المادة / subjectKey"
          value={batch.subjectKey || "—"}
        />
        <ContextItem
          label="ClassSubjectOffering"
          value={batch.classSubjectOfferingId || "—"}
        />
        <ContextItem
          label="TeacherAssignment"
          value={batch.teacherAssignmentId || "—"}
        />
        <ContextItem
          label="نوع الدفعة"
          value={getBatchKindLabel(batch.batchKind)}
        />
        <ContextItem
          label="حالة الدفعة"
          value={getBatchStatusLabel(batch.status)}
        />
        <ContextItem
          label="تاريخ القياس"
          value={formatDate(batch.measuredAt)}
        />
      </div>
    </section>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 dark:bg-slate-950/40">
      <p className="text-xs text-violet-700 dark:text-violet-300">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}
