"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  FileText,
  Save,
  Send,
  UsersRound,
} from "lucide-react";
import { collection, doc, setDoc, writeBatch } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  useClassStudents,
  type ClassStudentRow,
  type ClassStudentsData,
} from "@/hooks/use-class-students";
import {
  useClassMeasurementTemplates,
  type StaffMeasurementTemplateOption,
  type StaffTemplateItem,
} from "@/hooks/use-class-measurement-templates";
import { getFriendlyClassTitle } from "@/lib/class-presentation";

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
  capacity?: number;
  studentCount?: number;
  studentsCount?: number;
  enrolledStudentCount?: number;
  schoolName?: string;
  gradeTitle?: string;
  academicYearTitle?: string;
  schoolType?: "KG" | "PRIMARY";
};

type StaffClassSubjectOffering = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
  subjectKey?: string;
  subjectTitle?: string;
  subjectTitleSnapshot?: string;
  displayName?: string;
  shortLabel?: string;
  status?: string;
};

type StaffActorLike = {
  uid?: string;
  personId?: string;
  orgId?: string;
  role?: string;
  roleKey?: string;
  roles?: string[];
  visibleClasses?: StaffVisibleClass[];
  classSubjectOfferings?: StaffClassSubjectOffering[];
};

type BatchStudentStatus =
  | "PENDING"
  | "COMPLETED"
  | "ABSENT"
  | "EXCUSED"
  | "SKIPPED";

type BatchDraftRow = {
  status: BatchStudentStatus;
  score: string;
  itemScores: Record<string, string>;
  note: string;
};

type BatchDraftRows = Record<string, BatchDraftRow>;

type LearningLossPolicyFields = {
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
};

type StaffActorCurrentTerm = {
  id: string;
  orgId?: string;
  academicYearId: string;
  title: string;
  shortTitle?: string;
  order?: number;
  status?: string;
  isCurrent?: boolean;
};

type StaffActorWithTerms = {
  currentTerm?: StaffActorCurrentTerm | null;
  currentTermsByAcademicYear?: Record<string, StaffActorCurrentTerm>;
};

const BLOCKED_SUBJECT_KEYS = new Set(["CLASS", "HOMEROOM"]);

const UNIT_REQUIRED_SUBJECT_KEYS = new Set(["VALUES", "CORNERS"]);

type BatchUnitOption = {
  key: string;
  title: string;
};

const KG_UNIT_OPTIONS: BatchUnitOption[] = [
  { key: "kg-unit-1", title: "الوحدة الأولى" },
  { key: "kg-unit-2", title: "الوحدة الثانية" },
  { key: "kg-unit-3", title: "الوحدة الثالثة" },
  { key: "kg-unit-4", title: "الوحدة الرابعة" },
];

function requiresUnitSelection(subjectKey: string) {
  return UNIT_REQUIRED_SUBJECT_KEYS.has(normalizeKey(subjectKey));
}

const KG_DOMAIN_SUBJECT_KEYS = new Set([
  "QURAN",
  "LEARNING_GARDENS",
  "NUMBERS",
  "VALUES",
  "CORNERS",
  "ARABIC",
  "KG_QURAN",
  "KG_LEARNING_GARDENS",
  "KG_NUMBERS",
  "KG_VALUES",
  "KG_CORNERS",
]);

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeKey(value?: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function getCurrentTermForAcademicYear(
  actor: StaffActorWithTerms | null,
  academicYearId: string,
) {
  if (!actor) return null;

  return (
    actor.currentTermsByAcademicYear?.[academicYearId] ??
    actor.currentTerm ??
    null
  );
}

function buildTermContext(term: StaffActorCurrentTerm | null) {
  return {
    termId: term?.id ?? "",
    termTitle: term?.title ?? "",
    termShortTitle: term?.shortTitle ?? "",
  };
}

function getStudentCount(item: StaffVisibleClass) {
  return (
    item.studentCount ?? item.studentsCount ?? item.enrolledStudentCount ?? null
  );
}

function matchesRequestedClass(
  item: StaffVisibleClass,
  classId: string,
  schoolId: string | null,
  academicYearId: string | null,
) {
  if (item.id !== classId) return false;

  if (schoolId && item.schoolId !== schoolId) return false;
  if (academicYearId && item.academicYearId !== academicYearId) return false;

  return true;
}

function isKgClass(classInfo: StaffVisibleClass | null) {
  if (!classInfo) return false;

  const schoolType = normalizeKey(classInfo.schoolType);
  const gradeId = normalizeKey(classInfo.gradeId);
  const classId = normalizeKey(classInfo.id);
  const schoolId = normalizeKey(classInfo.schoolId);

  return (
    schoolType === "KG" ||
    gradeId.startsWith("KG") ||
    classId.startsWith("KG") ||
    schoolId.startsWith("KG")
  );
}

function isBlockedSubjectKey(subjectKey: string) {
  return BLOCKED_SUBJECT_KEYS.has(normalizeKey(subjectKey));
}

function isKnownKgDomainSubjectKey(subjectKey: string) {
  return KG_DOMAIN_SUBJECT_KEYS.has(normalizeKey(subjectKey));
}

function buildClassHref(item: StaffVisibleClass) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(item.id)}${
    query ? `?${query}` : ""
  }`;
}

function getTemplateSearchText(template: StaffMeasurementTemplateOption) {
  return [
    template.id,
    template.optionId,
    template.title,
    template.kind,
    template.assessmentSlot,
    template.subjectKey,
    template.templateKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function templateMatchesSubject(
  template: StaffMeasurementTemplateOption,
  subjectKey: string,
) {
  const normalizedSubjectKey = normalizeKey(subjectKey);
  const templateSubjectKey = normalizeKey(template.subjectKey);

  if (templateSubjectKey) {
    return templateSubjectKey === normalizedSubjectKey;
  }

  const search = getTemplateSearchText(template);

  if (normalizedSubjectKey === "QURAN" || normalizedSubjectKey === "KG_QURAN") {
    return search.includes("QURAN") || template.title.includes("قرآن");
  }

  if (
    normalizedSubjectKey === "LEARNING_GARDENS" ||
    normalizedSubjectKey === "KG_LEARNING_GARDENS" ||
    normalizedSubjectKey === "ARABIC"
  ) {
    return (
      search.includes("LEARNING_GARDENS") ||
      search.includes("KG_LEARNING_GARDENS") ||
      search.includes("KG_TEACHER_MEASUREMENT") ||
      template.id.startsWith("kg-teacher-measure") ||
      template.title.includes("بساتين") ||
      template.title.includes("المعرفة") ||
      template.title.includes("لغة")
    );
  }

  if (
    normalizedSubjectKey === "NUMBERS" ||
    normalizedSubjectKey === "KG_NUMBERS"
  ) {
    return search.includes("NUMBERS") || template.title.includes("أرقام");
  }

  if (
    normalizedSubjectKey === "VALUES" ||
    normalizedSubjectKey === "KG_VALUES"
  ) {
    return (
      search.includes("VALUES") ||
      template.title.includes("قيم") ||
      template.title.includes("أسماء الله")
    );
  }

  if (
    normalizedSubjectKey === "CORNERS" ||
    normalizedSubjectKey === "KG_CORNERS"
  ) {
    return (
      search.includes("CORNERS") ||
      template.title.includes("أركان") ||
      template.title.includes("أنشطة")
    );
  }

  return false;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getActorPersonId(actor: StaffActorLike) {
  return actor.personId || actor.uid || "unknown-actor";
}

function getActorRoleKey(actor: StaffActorLike) {
  return actor.roles?.[0] || actor.roleKey || actor.role || "staff";
}

function getBatchKind(template: StaffMeasurementTemplateOption) {
  if (template.templateKind === "ASSESSMENT") return "ASSESSMENT";

  const kind = normalizeKey(template.kind);

  if (kind.includes("QURAN")) return "KG_QURAN";
  if (kind.includes("VALUES")) return "KG_VALUES";
  if (kind.includes("CORNERS")) return "KG_CORNERS";
  if (kind.includes("LOSS")) return "LEARNING_LOSS_TRACKER";

  return "TRACKER";
}

function getBatchRecordType(template: StaffMeasurementTemplateOption) {
  return template.templateKind === "ASSESSMENT"
    ? "ASSESSMENT_RECORD"
    : "TRACKER_ENTRY";
}

function parseOptionalScore(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return undefined;

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, itemValue]) => itemValue !== undefined)
        .map(([key, itemValue]) => [key, stripUndefined(itemValue)]),
    );
  }

  return value;
}

function getTemplateLearningLossPolicy(
  template: StaffMeasurementTemplateOption,
): LearningLossPolicyFields {
  const raw = template as StaffMeasurementTemplateOption &
    LearningLossPolicyFields;

  return {
    requiresLearningLossFollowUp: raw.requiresLearningLossFollowUp === true,
    learningLossThresholdScore: raw.learningLossThresholdScore,
    learningLossThresholdPercentage: raw.learningLossThresholdPercentage,
  };
}

function calculateLearningLossDecision(params: {
  score: number | undefined;
  maxScore: number | undefined;
  template: StaffMeasurementTemplateOption;
}) {
  const policy = getTemplateLearningLossPolicy(params.template);

  const scorePercentage =
    typeof params.score === "number" &&
    typeof params.maxScore === "number" &&
    params.maxScore > 0
      ? (params.score / params.maxScore) * 100
      : null;

  if (!policy.requiresLearningLossFollowUp) {
    return {
      needsLearningLossFollowUp: false,
      reason: "القالب لا يتطلب متابعة فاقد تعليمي",
      scorePercentage,
    };
  }

  if (
    typeof policy.learningLossThresholdScore === "number" &&
    typeof params.score === "number" &&
    params.score < policy.learningLossThresholdScore
  ) {
    return {
      needsLearningLossFollowUp: true,
      reason: "درجة الطالب أقل من حد الفاقد المحدد في القالب",
      scorePercentage,
    };
  }

  if (
    typeof policy.learningLossThresholdPercentage === "number" &&
    typeof scorePercentage === "number" &&
    scorePercentage < policy.learningLossThresholdPercentage
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

function getLearningLossTriggerReason(params: {
  score: number | undefined;
  maxScore: number | undefined;
  template: StaffMeasurementTemplateOption;
}) {
  return calculateLearningLossDecision(params).reason;
}

function getTemplateItems(template: StaffMeasurementTemplateOption | null) {
  return template?.templateItems ?? [];
}

function hasTemplateItems(template: StaffMeasurementTemplateOption | null) {
  return getTemplateItems(template).length > 0;
}

function getTemplateItemsMaxScore(template: StaffMeasurementTemplateOption) {
  const total = getTemplateItems(template).reduce((sum, rawItem) => {
    const item = rawItem as StaffTemplateItem & {
      affectsTotal?: boolean;
      maxScore?: number;
    };

    if (item.affectsTotal === false) return sum;

    return sum + (typeof item.maxScore === "number" ? item.maxScore : 0);
  }, 0);

  return total > 0 ? total : template.maxScore;
}

function getItemKey(item: StaffTemplateItem) {
  const rawItem = item as StaffTemplateItem & {
    itemKey?: string;
    key?: string;
    id?: string;
  };

  return rawItem.itemKey || rawItem.key || rawItem.id || "";
}

function getItemTitle(item: StaffTemplateItem) {
  const rawItem = item as StaffTemplateItem & {
    itemTitle?: string;
    title?: string;
    label?: string;
  };

  return (
    rawItem.itemTitle || rawItem.title || rawItem.label || getItemKey(item)
  );
}

function getItemMaxScore(item: StaffTemplateItem) {
  const rawItem = item as StaffTemplateItem & {
    maxScore?: number;
  };

  return typeof rawItem.maxScore === "number" ? rawItem.maxScore : undefined;
}

function getCommonItemMaxScore(
  template: StaffMeasurementTemplateOption | null,
) {
  const items = getTemplateItems(template);

  if (items.length === 0) return null;

  const scores = items
    .map((item) => getItemMaxScore(item))
    .filter((value): value is number => typeof value === "number");

  if (scores.length !== items.length) return null;

  const first = scores[0];

  return scores.every((value) => value === first) ? first : null;
}

function validateScoreWithinBounds(params: {
  studentName: string;
  itemTitle: string;
  score: number | undefined;
  maxScore: number | undefined;
}) {
  if (typeof params.score !== "number") return null;

  if (params.score < 0) {
    return `درجة بند "${params.itemTitle}" للطالب ${params.studentName} لا يمكن أن تكون أقل من 0.`;
  }

  if (typeof params.maxScore === "number" && params.score > params.maxScore) {
    return `درجة بند "${params.itemTitle}" للطالب ${params.studentName} لا يمكن أن تتجاوز ${params.maxScore}.`;
  }

  return null;
}

function getItemInputValue(draft: BatchDraftRow, itemKey: string) {
  return draft.itemScores[itemKey] ?? "";
}

function calculateDraftScore({
  draft,
  template,
}: {
  draft: BatchDraftRow;
  template: StaffMeasurementTemplateOption;
}) {
  if (!hasTemplateItems(template)) {
    const parsedScore = parseOptionalScore(draft.score);
    return Number.isNaN(parsedScore) ? undefined : parsedScore;
  }

  let hasAnyScore = false;
  let total = 0;

  for (const item of getTemplateItems(template)) {
    const rawItem = item as StaffTemplateItem & {
      affectsTotal?: boolean;
      maxScore?: number;
    };

    if (rawItem.affectsTotal === false) continue;

    const itemKey = getItemKey(item);
    const value = getItemInputValue(draft, itemKey);
    const parsed = parseOptionalScore(value);

    if (Number.isNaN(parsed)) return Number.NaN;

    if (typeof parsed === "number") {
      hasAnyScore = true;
      total += parsed;
    }
  }

  return hasAnyScore ? total : undefined;
}

function calculateDraftPercentage({
  draft,
  template,
}: {
  draft: BatchDraftRow;
  template: StaffMeasurementTemplateOption;
}) {
  const score = calculateDraftScore({ draft, template });
  const maxScore = getTemplateItemsMaxScore(template);

  if (typeof score !== "number" || Number.isNaN(score)) return null;
  if (typeof maxScore !== "number" || maxScore <= 0) return null;

  return (score / maxScore) * 100;
}

function buildItemScoresForDraft({
  draft,
  template,
}: {
  draft: BatchDraftRow;
  template: StaffMeasurementTemplateOption;
}) {
  if (!hasTemplateItems(template)) return [];

  return getTemplateItems(template).map((item, index) => {
    const rawItem = item as StaffTemplateItem & {
      itemId?: string;
      category?: string;
      valueType?: string;
      maxScore?: number;
      weight?: number;
      order?: number;
      affectsTotal?: boolean;
    };

    const itemKey = getItemKey(item);
    const value = getItemInputValue(draft, itemKey);
    const parsedScore = parseOptionalScore(value);
    const score = Number.isNaN(parsedScore) ? undefined : parsedScore;

    return {
      itemKey,
      itemId: rawItem.itemId || itemKey,
      itemTitle: getItemTitle(item),
      category: rawItem.category || "",
      valueType: rawItem.valueType || "NUMERIC",
      score,
      maxScore: rawItem.maxScore,
      weight: rawItem.weight ?? 1,
      level: "",
      valueText: "",
      note: "",
      order: rawItem.order ?? index,
    };
  });
}

function buildStudentRowsForDraft(params: {
  rows: ClassStudentRow[];
  draftRows: BatchDraftRows;
  template: StaffMeasurementTemplateOption;
  recordType: "ASSESSMENT_RECORD" | "TRACKER_ENTRY";
}) {
  const maxScore = getTemplateItemsMaxScore(params.template);

  return params.rows.map((row) => {
    const draft = getDraftRow(params.draftRows, row.studentId);
    const score = isScoreDisabled(draft.status)
      ? undefined
      : calculateDraftScore({
          draft,
          template: params.template,
        });

    return {
      studentId: row.studentId,
      studentDisplayName: row.displayName || row.studentId,
      enrollmentId: row.enrollmentId || "",

      status: draft.status,

      score:
        typeof score === "number" && !Number.isNaN(score) ? score : undefined,
      maxScore: maxScore ?? undefined,

      level: "",
      valueText: "",

      itemScores: isScoreDisabled(draft.status)
        ? []
        : buildItemScoresForDraft({
            draft,
            template: params.template,
          }),

      note: draft.note.trim(),

      recordType: params.recordType,
      recordId: "",
    };
  });
}

function validateDraftRowsForSave(params: {
  rows: ClassStudentRow[];
  draftRows: BatchDraftRows;
  template: StaffMeasurementTemplateOption;
}) {
  for (const row of params.rows) {
    const draft = getDraftRow(params.draftRows, row.studentId);

    if (draft.status !== "COMPLETED") continue;

    if (!hasTemplateItems(params.template)) {
      const parsed = parseOptionalScore(draft.score);

      if (Number.isNaN(parsed)) {
        return `درجة غير صحيحة للطالب: ${row.displayName || row.studentId}`;
      }

      continue;
    }

    for (const item of getTemplateItems(params.template)) {
      const itemKey = getItemKey(item);
      const itemTitle = getItemTitle(item);
      const parsed = parseOptionalScore(getItemInputValue(draft, itemKey));

      if (Number.isNaN(parsed)) {
        return `درجة غير صحيحة في بند "${itemTitle}" للطالب: ${
          row.displayName || row.studentId
        }`;
      }

      const boundsError = validateScoreWithinBounds({
        studentName: row.displayName || row.studentId,
        itemTitle,
        score: parsed,
        maxScore: getItemMaxScore(item),
      });

      if (boundsError) return boundsError;
    }
  }

  return null;
}

function validateDraftRowsForSubmit(params: {
  rows: ClassStudentRow[];
  draftRows: BatchDraftRows;
  template: StaffMeasurementTemplateOption;
}) {
  const completedRows = params.rows.filter((row) => {
    return getDraftRow(params.draftRows, row.studentId).status === "COMPLETED";
  });

  if (completedRows.length === 0) {
    return "يجب إدخال نتيجة مكتملة لطالب واحد على الأقل قبل إرسال النتائج.";
  }

  for (const row of completedRows) {
    const draft = getDraftRow(params.draftRows, row.studentId);

    if (!hasTemplateItems(params.template)) {
      const parsed = parseOptionalScore(draft.score);

      if (typeof parsed !== "number" || Number.isNaN(parsed)) {
        return `أدخل درجة صحيحة للطالب: ${row.displayName || row.studentId}`;
      }

      continue;
    }

    for (const item of getTemplateItems(params.template)) {
      const itemKey = getItemKey(item);
      const itemTitle = getItemTitle(item);
      const parsed = parseOptionalScore(getItemInputValue(draft, itemKey));

      if (typeof parsed !== "number" || Number.isNaN(parsed)) {
        return `أدخل درجة صحيحة في بند "${itemTitle}" للطالب: ${
          row.displayName || row.studentId
        }`;
      }

      const boundsError = validateScoreWithinBounds({
        studentName: row.displayName || row.studentId,
        itemTitle,
        score: parsed,
        maxScore: getItemMaxScore(item),
      });

      if (boundsError) return boundsError;
    }
  }

  return null;
}

function buildAssessmentRecordPayload({
  recordId,
  batchId,
  batchKind,
  row,
  score,
  itemScores,
  note,
  actor,
  classInfo,
  orgId,
  schoolId,
  academicYearId,
  classSubjectOfferingId,
  subjectKey,
  template,
  now,
}: {
  recordId: string;
  batchId: string;
  batchKind: string;
  row: ClassStudentRow;
  score: number | undefined;
  itemScores: Array<Record<string, unknown>>;
  note: string;
  actor: StaffActorLike;
  classInfo: StaffVisibleClass;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
  template: StaffMeasurementTemplateOption;
  now: number;
}) {
  const resolvedMaxScore =
    template.maxScore ?? getTemplateItemsMaxScore(template);
  const maxScore =
    typeof resolvedMaxScore === "number" ? resolvedMaxScore : undefined;
  const passed =
    typeof score === "number" && typeof template.passingScore === "number"
      ? score >= template.passingScore
      : undefined;

  const decision = calculateLearningLossDecision({
    score,
    maxScore,
    template,
  });

  return {
    id: recordId,
    orgId,
    schoolId,
    academicYearId,

    studentId: row.studentId,
    enrollmentId: row.enrollmentId || "",
    gradeId: classInfo.gradeId ?? "",
    classId: classInfo.id,
    classSubjectOfferingId,

    templateId: template.id,
    kind: template.kind,
    assessmentSlot: template.assessmentSlot || "CUSTOM",
    subjectKey: subjectKey || template.subjectKey || "",

    evaluatorRoleKey: template.evaluatorRoleKey || getActorRoleKey(actor),
    assessedByPersonId: getActorPersonId(actor),
    measuredAt: now,

    score,
    maxScore: maxScore ?? undefined,
    level: "",
    passed,
    notes: note.trim(),
    status: "PUBLISHED",

    batchId,
    batchKind,

    itemScores,

    needsLearningLossFollowUp: decision.needsLearningLossFollowUp,
    learningLossPlanId: "",
    learningLossTriggerReason: decision.reason,

    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerEntryPayload({
  recordId,
  batchId,
  batchKind,
  row,
  score,
  itemScores,
  note,
  actor,
  classInfo,
  orgId,
  schoolId,
  academicYearId,
  classSubjectOfferingId,
  subjectKey,
  template,
  now,
}: {
  recordId: string;
  batchId: string;
  batchKind: string;
  row: ClassStudentRow;
  score: number | undefined;
  itemScores: Array<Record<string, unknown>>;
  note: string;
  actor: StaffActorLike;
  classInfo: StaffVisibleClass;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
  template: StaffMeasurementTemplateOption;
  now: number;
}) {
  const resolvedMaxScore =
    template.maxScore ?? getTemplateItemsMaxScore(template);
  const maxScore =
    typeof resolvedMaxScore === "number" ? resolvedMaxScore : undefined;

  const decision = calculateLearningLossDecision({
    score,
    maxScore,
    template,
  });

  return {
    id: recordId,
    orgId,
    schoolId,
    academicYearId,

    studentId: row.studentId,
    enrollmentId: row.enrollmentId || "",
    gradeId: classInfo.gradeId ?? "",
    classId: classInfo.id,
    classSubjectOfferingId,

    templateId: template.id,
    kind: template.kind,
    subjectKey: subjectKey || template.subjectKey || "",

    evaluatorRoleKey: template.evaluatorRoleKey || getActorRoleKey(actor),
    recordedByPersonId: getActorPersonId(actor),
    recordedAt: now,

    topicTitle: template.defaultLessonTitle || template.title,
    lessonKey: "",
    lessonTitle: template.defaultLessonTitle || "",

    score,
    maxScore: maxScore ?? undefined,
    valueText: "",
    level: "",
    completed: true,

    notes: note.trim(),
    status: "RECORDED",

    batchId,
    batchKind,

    itemScores,

    needsLearningLossFollowUp: decision.needsLearningLossFollowUp,
    learningLossPlanId: "",
    learningLossTriggerReason: decision.reason,

    createdAt: now,
    updatedAt: now,
  };
}

export default function StaffNewMeasurementBatchPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const [selectedTemplateOptionId, setSelectedTemplateOptionId] = useState("");

  const [selectedUnitKey, setSelectedUnitKey] = useState("");
  const [draftRows, setDraftRows] = useState<BatchDraftRows>({});

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);

  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedBatchId, setSubmittedBatchId] = useState<string | null>(null);

  const { actor } = useStaffActor();

  const actorWithTerms = actor as StaffActorWithTerms | null;

  const staffActor = actor as StaffActorLike | null;

  const classId = decodeURIComponent(getParamValue(params.classId));
  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");

  const classSubjectOfferingId =
    searchParams.get("classSubjectOfferingId") ?? "";
  const subjectKeyFromQuery = searchParams.get("subjectKey") ?? "";
  const teacherAssignmentIdFromQuery =
    searchParams.get("teacherAssignmentId") ?? "";

  const classes = useMemo(() => {
    return staffActor?.visibleClasses ?? [];
  }, [staffActor]);

  const classInfo = useMemo(() => {
    return (
      classes.find((item) =>
        matchesRequestedClass(item, classId, schoolId, academicYearId),
      ) ??
      classes.find((item) => item.id === classId) ??
      null
    );
  }, [classes, classId, schoolId, academicYearId]);

  const selectedClassSubjectOffering = useMemo(() => {
    if (!classSubjectOfferingId) return null;

    return (
      staffActor?.classSubjectOfferings?.find(
        (item) => item.id === classSubjectOfferingId,
      ) ?? null
    );
  }, [staffActor?.classSubjectOfferings, classSubjectOfferingId]);

  const resolvedOrgId = classInfo?.orgId || staffActor?.orgId || "";
  const resolvedSchoolId = classInfo?.schoolId || schoolId || "";
  const resolvedAcademicYearId =
    classInfo?.academicYearId || academicYearId || "";

  const currentTerm = useMemo(() => {
    return getCurrentTermForAcademicYear(
      actorWithTerms,
      resolvedAcademicYearId,
    );
  }, [actorWithTerms, resolvedAcademicYearId]);

  const termContext = useMemo(() => {
    return buildTermContext(currentTerm);
  }, [currentTerm]);

  const hasCurrentTerm = !!currentTerm?.id;

  const classStudents = useClassStudents({
    orgId: resolvedOrgId,
    classId,
    schoolId: resolvedSchoolId,
    academicYearId: resolvedAcademicYearId,
    enabled: !!staffActor && !!classInfo && !!resolvedOrgId,
  });

  const classTemplates = useClassMeasurementTemplates({
    orgId: resolvedOrgId,
    classInfo,
    enabled: !!staffActor && !!classInfo && !!resolvedOrgId,
  });

  const effectiveSubjectKey = normalizeKey(
    selectedClassSubjectOffering?.subjectKey || subjectKeyFromQuery,
  );

  const currentClassIsKg = isKgClass(classInfo);
  const subjectKeyIsBlocked = isBlockedSubjectKey(effectiveSubjectKey);

  const missingKgDomainContext =
    currentClassIsKg && !effectiveSubjectKey && !subjectKeyIsBlocked;

  const unknownKgDomainContext =
    currentClassIsKg &&
    Boolean(effectiveSubjectKey) &&
    !subjectKeyIsBlocked &&
    !isKnownKgDomainSubjectKey(effectiveSubjectKey);

  const canUseCurrentContext =
    !subjectKeyIsBlocked && !missingKgDomainContext && !unknownKgDomainContext;

  const templateOptions = useMemo(() => {
    const options = classTemplates.data?.options ?? [];

    if (!canUseCurrentContext) return [];

    if (!effectiveSubjectKey) return options;

    return options.filter((item) => {
      return templateMatchesSubject(item, effectiveSubjectKey);
    });
  }, [classTemplates.data?.options, canUseCurrentContext, effectiveSubjectKey]);

  const selectedTemplate = useMemo(() => {
    return (
      templateOptions.find(
        (item) => item.optionId === selectedTemplateOptionId,
      ) ?? null
    );
  }, [templateOptions, selectedTemplateOptionId]);

  const resolvedSubjectKey =
    effectiveSubjectKey || normalizeKey(selectedTemplate?.subjectKey);

  const unitSelectionRequired = requiresUnitSelection(resolvedSubjectKey);

  const selectedUnit = useMemo(() => {
    if (!selectedUnitKey) return null;

    return KG_UNIT_OPTIONS.find((item) => item.key === selectedUnitKey) ?? null;
  }, [selectedUnitKey]);

  const hasRequiredUnitSelection = !unitSelectionRequired || !!selectedUnit;

  const resolvedClassSubjectOfferingId =
    selectedClassSubjectOffering?.id || classSubjectOfferingId || "";

  const resolvedTeacherAssignmentId = teacherAssignmentIdFromQuery;

  const batchStudentRows = classStudents.data?.rows ?? [];

  const canSaveDraft =
    !!staffActor &&
    !!classInfo &&
    !!selectedTemplate &&
    !!resolvedOrgId &&
    canUseCurrentContext &&
    hasCurrentTerm &&
    hasRequiredUnitSelection &&
    batchStudentRows.length > 0 &&
    !savingDraft &&
    !submittingBatch &&
    !submittedBatchId;

  const canSubmitBatch =
    !!staffActor &&
    !!classInfo &&
    !!selectedTemplate &&
    !!resolvedOrgId &&
    canUseCurrentContext &&
    hasCurrentTerm &&
    hasRequiredUnitSelection &&
    batchStudentRows.length > 0 &&
    !savingDraft &&
    !submittingBatch &&
    !submittedBatchId;

  function updateDraftRow(studentId: string, patch: Partial<BatchDraftRow>) {
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

  function setAllRowsStatus(status: BatchStudentStatus) {
    const rows = classStudents.data?.rows ?? [];

    setDraftRows((prev) => {
      const next = { ...prev };

      for (const row of rows) {
        const current = getDraftRow(next, row.studentId);

        next[row.studentId] = {
          ...current,
          status,
          score: status === "COMPLETED" ? current.score : "",
          itemScores: status === "COMPLETED" ? current.itemScores : {},
        };
      }

      return next;
    });
  }

  async function saveDraftBatch() {
    if (!staffActor || !classInfo || !selectedTemplate) {
      setDraftSaveError("يجب اختيار قالب قياس أو متابعة قبل حفظ المسودة.");
      return;
    }

    if (!canUseCurrentContext) {
      setDraftSaveError("لا يمكن استخدام سياق المادة الحالي لإدخال النتائج.");
      return;
    }

    if (!currentTerm) {
      setDraftSaveError(
        "لا يمكن حفظ المسودة قبل تحديد الفصل الدراسي الحالي لهذه السنة.",
      );
      return;
    }

    if (unitSelectionRequired && !selectedUnit) {
      setDraftSaveError("يجب اختيار الوحدة قبل حفظ نتائج القيم أو الأركان.");
      return;
    }

    if (!resolvedOrgId) {
      setDraftSaveError("تعذّر تحديد جهة العمل لحفظ المسودة.");
      return;
    }

    if (!resolvedSchoolId) {
      setDraftSaveError("تعذّر تحديد المدرسة لحفظ المسودة.");
      return;
    }

    if (!resolvedAcademicYearId) {
      setDraftSaveError("تعذّر تحديد السنة الدراسية لحفظ المسودة.");
      return;
    }

    if (batchStudentRows.length === 0) {
      setDraftSaveError("لا يمكن حفظ المسودة دون طلاب.");
      return;
    }

    const validationError = validateDraftRowsForSave({
      rows: batchStudentRows,
      draftRows,
      template: selectedTemplate,
    });

    if (validationError) {
      setDraftSaveError(validationError);
      return;
    }

    setSavingDraft(true);
    setDraftSaveError(null);

    try {
      const now = Date.now();

      const batchRef = savedBatchId
        ? doc(
            db,
            "orgs",
            resolvedOrgId,
            "studentMeasurementBatches",
            savedBatchId,
          )
        : doc(
            collection(db, "orgs", resolvedOrgId, "studentMeasurementBatches"),
          );

      const batchId = batchRef.id;
      const recordType = getBatchRecordType(selectedTemplate);

      const studentRows = buildStudentRowsForDraft({
        rows: batchStudentRows,
        draftRows,
        template: selectedTemplate,
        recordType,
      });

      const payload = stripUndefined({
        id: batchId,
        orgId: resolvedOrgId,
        schoolId: resolvedSchoolId,
        academicYearId: resolvedAcademicYearId,
        ...termContext,
        gradeId: classInfo.gradeId ?? "",
        classId: classInfo.id,
        classSubjectOfferingId: resolvedClassSubjectOfferingId,

        scopeType: "CLASS",
        scopeId: classInfo.id,

        batchKind: getBatchKind(selectedTemplate),
        status: "DRAFT",

        templateId: selectedTemplate.id,
        templateTitle: selectedTemplate.title,

        ...(selectedTemplate.templateKind === "ASSESSMENT"
          ? {
              assessmentKind: selectedTemplate.kind,
              assessmentSlot: selectedTemplate.assessmentSlot || "CUSTOM",
            }
          : {
              trackerKind: selectedTemplate.kind,
              assessmentSlot: "CUSTOM",
            }),

        subjectKey: resolvedSubjectKey,

        unitKey: selectedUnit?.key ?? "",
        unitTitle: selectedUnit?.title ?? "",
        weekLabel: "",

        createdByPersonId: getActorPersonId(staffActor),
        createdByRoleKey: getActorRoleKey(staffActor),

        operationalAssignmentId: "",
        teacherAssignmentId: resolvedTeacherAssignmentId,

        measuredAt: now,

        targetStudentIds: batchStudentRows.map((row) => row.studentId),
        targetCount: batchStudentRows.length,
        completedCount: getCompletedRowsCount(batchStudentRows, draftRows),
        missingCount: getMissingRowsCount(batchStudentRows, draftRows),

        studentRows,
        recordRefs: batchStudentRows.map((row) => ({
          studentId: row.studentId,
          recordType,
          recordId: "",
          status: "PENDING",
        })),

        notes: "",

        createdAt: now,
        updatedAt: now,
      }) as Record<string, unknown>;

      await setDoc(batchRef, payload, { merge: true });

      setSavedBatchId(batchId);
    } catch (error: unknown) {
      setDraftSaveError(getErrorMessage(error));
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitBatch() {
    if (!staffActor || !classInfo || !selectedTemplate) {
      setSubmitError("يرجى اختيار قالب قياس أو متابعة قبل إرسال النتائج.");
      return;
    }

    if (!canUseCurrentContext) {
      setSubmitError("لا يمكن استخدام سياق المادة الحالي لإدخال النتائج.");
      return;
    }

    if (!currentTerm) {
      setSubmitError(
        "لا يمكن إرسال النتائج قبل تحديد الفصل الدراسي الحالي لهذه السنة.",
      );
      return;
    }

    if (unitSelectionRequired && !selectedUnit) {
      setSubmitError("يجب اختيار الوحدة قبل إرسال نتائج القيم أو الأركان.");
      return;
    }

    if (!resolvedOrgId) {
      setSubmitError("تعذّر تحديد جهة العمل لإرسال النتائج.");
      return;
    }

    if (!resolvedSchoolId) {
      setSubmitError("تعذّر تحديد المدرسة لإرسال النتائج.");
      return;
    }

    if (!resolvedAcademicYearId) {
      setSubmitError("تعذّر تحديد السنة الدراسية لإرسال النتائج.");
      return;
    }

    if (batchStudentRows.length === 0) {
      setSubmitError("لا يمكن إرسال النتائج دون طلاب.");
      return;
    }

    const validationError = validateDraftRowsForSave({
      rows: batchStudentRows,
      draftRows,
      template: selectedTemplate,
    });

    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const submitValidationError = validateDraftRowsForSubmit({
      rows: batchStudentRows,
      draftRows,
      template: selectedTemplate,
    });

    if (submitValidationError) {
      setSubmitError(submitValidationError);
      return;
    }

    setSubmittingBatch(true);
    setSubmitError(null);
    setDraftSaveError(null);

    try {
      const now = Date.now();

      const batchRef = savedBatchId
        ? doc(
            db,
            "orgs",
            resolvedOrgId,
            "studentMeasurementBatches",
            savedBatchId,
          )
        : doc(
            collection(db, "orgs", resolvedOrgId, "studentMeasurementBatches"),
          );

      const batchId = batchRef.id;
      const recordType = getBatchRecordType(selectedTemplate);
      const batchKind = getBatchKind(selectedTemplate);

      const completedRows = batchStudentRows.filter((row) => {
        const draft = getDraftRow(draftRows, row.studentId);
        return draft.status === "COMPLETED";
      });

      const studentRows = buildStudentRowsForDraft({
        rows: batchStudentRows,
        draftRows,
        template: selectedTemplate,
        recordType,
      });

      const firestoreBatch = writeBatch(db);
      const recordRefs: Array<{
        studentId: string;
        recordType: "ASSESSMENT_RECORD" | "TRACKER_ENTRY";
        recordId: string;
        status: "COMPLETED" | "MISSING";
      }> = [];

      const updatedStudentRows = studentRows.map((studentRow) => {
        return { ...studentRow };
      });

      for (const row of completedRows) {
        const draft = getDraftRow(draftRows, row.studentId);

        const score = calculateDraftScore({
          draft,
          template: selectedTemplate,
        });

        const itemScores = buildItemScoresForDraft({
          draft,
          template: selectedTemplate,
        });

        const recordRef =
          selectedTemplate.templateKind === "ASSESSMENT"
            ? doc(
                collection(
                  db,
                  "orgs",
                  resolvedOrgId,
                  "studentAssessmentRecords",
                ),
              )
            : doc(
                collection(db, "orgs", resolvedOrgId, "studentTrackerEntries"),
              );

        const recordId = recordRef.id;

        const recordPayload =
          selectedTemplate.templateKind === "ASSESSMENT"
            ? buildAssessmentRecordPayload({
                recordId,
                batchId,
                batchKind,
                row,
                score,
                itemScores,
                note: draft.note,
                actor: staffActor,
                classInfo,
                orgId: resolvedOrgId,
                schoolId: resolvedSchoolId,
                academicYearId: resolvedAcademicYearId,
                ...termContext,
                classSubjectOfferingId: resolvedClassSubjectOfferingId,
                subjectKey: resolvedSubjectKey,
                template: selectedTemplate,
                now,
              })
            : buildTrackerEntryPayload({
                recordId,
                batchId,
                batchKind,
                row,
                score,
                itemScores,
                note: draft.note,
                actor: staffActor,
                classInfo,
                orgId: resolvedOrgId,
                schoolId: resolvedSchoolId,
                academicYearId: resolvedAcademicYearId,
                ...termContext,
                classSubjectOfferingId: resolvedClassSubjectOfferingId,
                subjectKey: resolvedSubjectKey,
                template: selectedTemplate,
                now,
              });

        firestoreBatch.set(
          recordRef,
          stripUndefined(recordPayload) as Record<string, unknown>,
        );

        recordRefs.push({
          studentId: row.studentId,
          recordType,
          recordId,
          status: "COMPLETED",
        });

        const matchingStudentRow = updatedStudentRows.find((item) => {
          return item.studentId === row.studentId;
        });

        if (matchingStudentRow) {
          matchingStudentRow.recordId = recordId;
          matchingStudentRow.recordType = recordType;
        }
      }

      for (const row of batchStudentRows) {
        const draft = getDraftRow(draftRows, row.studentId);

        if (draft.status !== "COMPLETED") {
          recordRefs.push({
            studentId: row.studentId,
            recordType,
            recordId: "",
            status: "MISSING",
          });
        }
      }

      const batchPayload = stripUndefined({
        id: batchId,
        orgId: resolvedOrgId,
        schoolId: resolvedSchoolId,
        academicYearId: resolvedAcademicYearId,
        ...termContext,
        gradeId: classInfo.gradeId ?? "",
        classId: classInfo.id,
        classSubjectOfferingId: resolvedClassSubjectOfferingId,

        scopeType: "CLASS",
        scopeId: classInfo.id,

        batchKind,
        status: "SUBMITTED",

        templateId: selectedTemplate.id,
        templateTitle: selectedTemplate.title,

        ...(selectedTemplate.templateKind === "ASSESSMENT"
          ? {
              assessmentKind: selectedTemplate.kind,
              assessmentSlot: selectedTemplate.assessmentSlot || "CUSTOM",
            }
          : {
              trackerKind: selectedTemplate.kind,
              assessmentSlot: "CUSTOM",
            }),

        subjectKey: resolvedSubjectKey,

        unitKey: selectedUnit?.key ?? "",
        unitTitle: selectedUnit?.title ?? "",
        weekLabel: "",

        createdByPersonId: getActorPersonId(staffActor),
        createdByRoleKey: getActorRoleKey(staffActor),

        operationalAssignmentId: "",
        teacherAssignmentId: resolvedTeacherAssignmentId,

        measuredAt: now,
        submittedAt: now,

        targetStudentIds: batchStudentRows.map((row) => row.studentId),
        targetCount: batchStudentRows.length,
        completedCount: completedRows.length,
        missingCount: batchStudentRows.length - completedRows.length,

        studentRows: updatedStudentRows,
        recordRefs,

        notes: "",

        createdAt: now,
        updatedAt: now,
      }) as Record<string, unknown>;

      firestoreBatch.set(batchRef, batchPayload, { merge: true });

      await firestoreBatch.commit();

      setSavedBatchId(batchId);
      setSubmittedBatchId(batchId);
    } catch (error: unknown) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmittingBatch(false);
    }
  }

  if (!staffActor) {
    return (
      <PageShell>
        <Panel>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            جاري تحميل بيانات المستخدم...
          </p>
        </Panel>
      </PageShell>
    );
  }

  if (!classInfo) {
    return (
      <PageShell>
        <Link
          href="/staff/classes"
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          الرجوع إلى فصولي
        </Link>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-700 dark:text-amber-300" />
          <h1 className="mt-4 text-xl font-bold">لم يتم العثور على الفصل</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-amber-900 dark:text-amber-100">
            لم يتم العثور على الفصل أو أنه خارج نطاق صلاحياتك.
          </p>
        </div>
      </PageShell>
    );
  }

  const estimatedStudentCount = getStudentCount(classInfo);
  const studentCount = classStudents.data?.totalCount ?? estimatedStudentCount;
  const subjectTitle =
    selectedClassSubjectOffering?.displayName ||
    selectedClassSubjectOffering?.subjectTitle ||
    selectedClassSubjectOffering?.subjectTitleSnapshot ||
    selectedClassSubjectOffering?.shortLabel ||
    "";
  const termTitle =
    currentTerm?.title ||
    currentTerm?.shortTitle ||
    (currentTerm ? "الفصل الدراسي الحالي" : null);
  const headerMetadata = [
    getFriendlyClassTitle(classInfo, classes),
    termTitle,
    studentCount !== null
      ? `${studentCount.toLocaleString("ar-SA")} طالبًا`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageShell>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Link
            href={buildClassHref(classInfo)}
            className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى الفصل
          </Link>

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {subjectTitle ? `إدخال نتائج ${subjectTitle}` : "إدخال النتائج"}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {headerMetadata}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSaveDraft}
            onClick={() => void saveDraftBatch()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Save className="h-4 w-4" />
            {savingDraft
              ? "جاري الحفظ..."
              : savedBatchId
                ? "تحديث المسودة"
                : "حفظ مسودة"}
          </button>

          <button
            type="button"
            disabled={!canSubmitBatch}
            onClick={() => void submitBatch()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            <Send className="h-4 w-4" />
            {submittingBatch
              ? "جاري الإرسال..."
              : submittedBatchId
                ? "تم الإرسال"
                : "إرسال النتائج"}
          </button>
        </div>
      </header>

      <SubjectContextPanel
        subjectKeyIsBlocked={subjectKeyIsBlocked}
        missingKgDomainContext={missingKgDomainContext}
        unknownKgDomainContext={unknownKgDomainContext}
      />

      {requiresUnitSelection(resolvedSubjectKey) ? (
        <UnitSelectionPanel
          subjectKey={resolvedSubjectKey}
          selectedUnitKey={selectedUnitKey}
          onSelectUnit={setSelectedUnitKey}
        />
      ) : null}

      {!currentTerm ? (
        <ErrorPanel>
          لم يتم تحديد الفصل الدراسي الحالي. لن يمكن الحفظ أو الإرسال حتى يتم
          تحديده.
        </ErrorPanel>
      ) : null}

      <TemplatePickerSection
        data={
          classTemplates.data
            ? {
                ...classTemplates.data,
                options: templateOptions,
                totalCount: templateOptions.length,
                assessmentCount: templateOptions.filter(
                  (item) => item.templateKind === "ASSESSMENT",
                ).length,
                trackerCount: templateOptions.filter(
                  (item) => item.templateKind === "TRACKER",
                ).length,
              }
            : null
        }
        loading={classTemplates.loading}
        error={classTemplates.error}
        selectedTemplateOptionId={selectedTemplateOptionId}
        onSelectTemplate={setSelectedTemplateOptionId}
        canUseCurrentContext={canUseCurrentContext}
        effectiveSubjectKey={effectiveSubjectKey}
      />

      {selectedTemplate ? (
        <SelectedTemplateSummary
          template={selectedTemplate}
          effectiveSubjectKey={effectiveSubjectKey}
        />
      ) : null}

      {draftSaveError ? <ErrorPanel>{draftSaveError}</ErrorPanel> : null}

      {savedBatchId ? (
        <SuccessPanel>تم حفظ المسودة بنجاح.</SuccessPanel>
      ) : null}

      {submitError ? <ErrorPanel>{submitError}</ErrorPanel> : null}

      {submittedBatchId ? (
        <SuccessPanel>تم إرسال النتائج بنجاح.</SuccessPanel>
      ) : null}

      <BatchResultsTable
        data={classStudents.data}
        loading={classStudents.loading}
        error={classStudents.error}
        template={selectedTemplate}
        draftRows={draftRows}
        onUpdateRow={updateDraftRow}
        onUpdateItemScore={updateDraftItemScore}
        onSetAllStatus={setAllRowsStatus}
      />
    </PageShell>
  );
}

function getDraftRow(rows: BatchDraftRows, studentId: string): BatchDraftRow {
  return (
    rows[studentId] ?? {
      status: "PENDING",
      score: "",
      itemScores: {},
      note: "",
    }
  );
}

function isScoreDisabled(status: BatchStudentStatus) {
  return status === "ABSENT" || status === "EXCUSED" || status === "SKIPPED";
}

function getStatusLabel(status: BatchStudentStatus) {
  switch (status) {
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
      return status;
  }
}

function getCompletedRowsCount(
  rows: ClassStudentRow[],
  draftRows: BatchDraftRows,
) {
  return rows.filter(
    (row) => getDraftRow(draftRows, row.studentId).status === "COMPLETED",
  ).length;
}

function getMissingRowsCount(
  rows: ClassStudentRow[],
  draftRows: BatchDraftRows,
) {
  return rows.filter((row) => {
    const draft = getDraftRow(draftRows, row.studentId);
    return draft.status === "PENDING";
  }).length;
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

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </section>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
      {children}
    </div>
  );
}

function SuccessPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
      {children}
    </div>
  );
}

function SubjectContextPanel({
  subjectKeyIsBlocked,
  missingKgDomainContext,
  unknownKgDomainContext,
}: {
  subjectKeyIsBlocked: boolean;
  missingKgDomainContext: boolean;
  unknownKgDomainContext: boolean;
}) {
  const warning = subjectKeyIsBlocked
    ? {
        title: "تعذر بدء إدخال النتائج",
        message:
          "اختر مادة أو مجالًا محددًا من صفحة الفصل قبل إدخال النتائج.",
      }
    : missingKgDomainContext
      ? {
          title: "اختر مجال الروضة",
          message:
            "اختر مجال الروضة المطلوب من صفحة الفصل قبل إدخال النتائج.",
        }
      : unknownKgDomainContext
        ? {
            title: "تعذر تحديد المجال",
            message: "ارجع إلى صفحة الفصل واختر المجال مرة أخرى.",
          }
        : null;

  if (!warning) return null;

  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{warning.title}</h2>
          <p className="mt-1 leading-6 text-amber-900 dark:text-amber-100">
            {warning.message}
          </p>
        </div>
      </div>
    </section>
  );
}

function TemplatePickerSection({
  data,
  loading,
  error,
  selectedTemplateOptionId,
  onSelectTemplate,
  canUseCurrentContext,
  effectiveSubjectKey,
}: {
  data: {
    options: StaffMeasurementTemplateOption[];
    totalCount: number;
    assessmentCount: number;
    trackerCount: number;
  } | null;
  loading: boolean;
  error: string | null;
  selectedTemplateOptionId: string;
  onSelectTemplate: (value: string) => void;
  canUseCurrentContext: boolean;
  effectiveSubjectKey: string;
}) {
  const options = data?.options ?? [];

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <ClipboardList className="h-5 w-5" />
        </div>

        <div>
          <h2 className="font-bold">اختيار القالب</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            القوالب الظاهرة هنا مفلترة حسب مجال الفصل الحالي.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          حدث خطأ أثناء قراءة القوالب: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 h-24 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      ) : !canUseCurrentContext ? (
        <div className="mt-5 rounded-3xl border border-dashed border-amber-300 p-6 text-sm leading-7 text-amber-900 dark:border-amber-900/60 dark:text-amber-100">
          لا يمكن عرض القوالب حتى يكون سياق المجال صالحًا.
        </div>
      ) : options.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-sm leading-7 text-slate-500 dark:border-slate-700 dark:text-slate-400">
          لا توجد قوالب مناسبة لهذا المجال.
          {effectiveSubjectKey ? (
            <span className="block pt-2">
              المجال الحالي:{" "}
              <span className="font-mono font-semibold">
                {effectiveSubjectKey}
              </span>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="كل القوالب" value={data?.totalCount ?? 0} />
            <MiniStat label="قياسات" value={data?.assessmentCount ?? 0} />
            <MiniStat label="متابعات" value={data?.trackerCount ?? 0} />
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">القالب</span>
            <select
              value={selectedTemplateOptionId}
              onChange={(event) => onSelectTemplate(event.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="">اختر قالبًا</option>

              {options.map((item) => (
                <option key={item.optionId} value={item.optionId}>
                  {item.title} —{" "}
                  {item.templateKind === "ASSESSMENT" ? "قياس" : "متابعة"}
                </option>
              ))}
            </select>
          </label>

          <div className="max-h-[26rem] space-y-3 overflow-y-auto pe-1">
            {options.map((item) => (
              <button
                key={item.optionId}
                type="button"
                onClick={() => onSelectTemplate(item.optionId)}
                className={`w-full rounded-3xl border p-4 text-right transition ${
                  selectedTemplateOptionId === item.optionId
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                    : "border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-900 dark:hover:bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.id} — {item.kind}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      subjectKey: {item.subjectKey || "legacy/غير محدد"}
                    </p>
                  </div>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    {item.templateKind === "ASSESSMENT" ? "قياس" : "متابعة"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center dark:bg-slate-950">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value.toLocaleString("ar-SA")}</p>
    </div>
  );
}

function SelectedTemplateSummary({
  template,
  effectiveSubjectKey,
}: {
  template: StaffMeasurementTemplateOption;
  effectiveSubjectKey: string;
}) {
  const maxScore = getTemplateItemsMaxScore(template);
  const policy = getTemplateLearningLossPolicy(template);

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <FileText className="h-5 w-5" />
        </div>

        <div>
          <h2 className="font-bold">ملخص القالب المختار</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            راجع القالب قبل إدخال النتائج.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoBox label="القالب" value={template.title} />
        <InfoBox
          label="النوع"
          value={template.templateKind === "ASSESSMENT" ? "قياس" : "متابعة"}
        />
        <InfoBox label="المجال الحالي" value={effectiveSubjectKey || "—"} />
        <InfoBox
          label="المجال داخل القالب"
          value={template.subjectKey || "legacy/غير محدد"}
        />
        <InfoBox label="الدرجة الكبرى" value={String(maxScore ?? "غير محدد")} />
        <InfoBox
          label="البنود"
          value={`${getTemplateItems(template).length.toLocaleString("ar-SA")} بند`}
        />
        <InfoBox
          label="يفتح فاقدًا؟"
          value={policy.requiresLearningLossFollowUp ? "نعم" : "لا"}
        />
        <InfoBox
          label="حد الفاقد"
          value={
            typeof policy.learningLossThresholdPercentage === "number"
              ? `${policy.learningLossThresholdPercentage}%`
              : typeof policy.learningLossThresholdScore === "number"
                ? String(policy.learningLossThresholdScore)
                : "—"
          }
        />
      </div>
    </Panel>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function UnitSelectionPanel({
  subjectKey,
  selectedUnitKey,
  onSelectUnit,
}: {
  subjectKey: string;
  selectedUnitKey: string;
  onSelectUnit: (value: string) => void;
}) {
  const isRequired = requiresUnitSelection(subjectKey);

  if (!isRequired) return null;

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <CalendarDays className="h-5 w-5" />
        </div>

        <div>
          <h2 className="font-bold">الوحدة</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isRequired
              ? "اختيار الوحدة إلزامي في القيم والأركان."
              : "اختيار الوحدة غير إلزامي لهذا المجال."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {KG_UNIT_OPTIONS.map((unit) => {
          const selected = selectedUnitKey === unit.key;

          return (
            <button
              key={unit.key}
              type="button"
              onClick={() => onSelectUnit(unit.key)}
              className={
                selected
                  ? "rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              }
            >
              {unit.title}
            </button>
          );
        })}
      </div>

      {isRequired && !selectedUnitKey ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          يجب اختيار الوحدة قبل حفظ أو إرسال هذه الدفعة.
        </div>
      ) : null}
    </Panel>
  );
}

function BatchResultsTable({
  data,
  loading,
  error,
  template,
  draftRows,
  onUpdateRow,
  onUpdateItemScore,
  onSetAllStatus,
}: {
  data: ClassStudentsData | null;
  loading: boolean;
  error: string | null;
  template: StaffMeasurementTemplateOption | null;
  draftRows: BatchDraftRows;
  onUpdateRow: (studentId: string, patch: Partial<BatchDraftRow>) => void;
  onUpdateItemScore: (
    studentId: string,
    itemKey: string,
    value: string,
  ) => void;
  onSetAllStatus: (status: BatchStudentStatus) => void;
}) {
  const rows = data?.rows ?? [];
  const templateItems = getTemplateItems(template);

  return (
    <Panel>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UsersRound className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-bold">إدخال نتائج الطلاب</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              اختر حالة كل طالب وأدخل الدرجة أو درجات البنود حسب القالب.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!template || rows.length === 0}
            onClick={() => onSetAllStatus("COMPLETED")}
            className="inline-flex h-9 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            جعل الكل مكتمل
          </button>

          <button
            type="button"
            disabled={!template || rows.length === 0}
            onClick={() => onSetAllStatus("PENDING")}
            className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            إعادة الكل
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          حدث خطأ أثناء قراءة الطلاب: {error}
        </div>
      ) : null}

      {template && templateItems.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          {typeof getCommonItemMaxScore(template) === "number" ? (
            <>
              درجة كل بند في هذا القالب من{" "}
              <span className="font-semibold">
                {getCommonItemMaxScore(template)}
              </span>
              ، والمجموع يحسب تلقائيًا من البنود.
            </>
          ) : (
            <>
              درجة كل بند حسب الحد المحدد في القالب، والمجموع يحسب تلقائيًا من
              البنود.
            </>
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-5 h-52 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      ) : !template ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h3 className="font-bold">اختر قالبًا أولًا</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
            بعد اختيار القالب ستظهر حقول إدخال النتائج.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h3 className="font-bold">لا توجد تسجيلات طلاب نشطة</h3>
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
                {templateItems.length === 0 ? (
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الدرجة
                  </th>
                ) : (
                  templateItems.map((item) => {
                    return (
                      <th
                        key={getItemKey(item)}
                        className="whitespace-nowrap px-4 py-3 font-medium"
                      >
                        {getItemTitle(item)}
                      </th>
                    );
                  })
                )}
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  النسبة
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  ملاحظة
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const draft = getDraftRow(draftRows, row.studentId);
                const scoreDisabled = isScoreDisabled(draft.status);
                const percentage = calculateDraftPercentage({
                  draft,
                  template,
                });

                return (
                  <tr
                    key={`${row.enrollmentId || "NO_ENROLLMENT"}:${
                      row.studentId
                    }`}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <div className="space-y-1">
                        <p>{row.displayName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {row.studentId}
                        </p>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          onUpdateRow(row.studentId, {
                            status: event.target.value as BatchStudentStatus,
                          })
                        }
                        className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
                      >
                        <option value="PENDING">
                          {getStatusLabel("PENDING")}
                        </option>
                        <option value="COMPLETED">
                          {getStatusLabel("COMPLETED")}
                        </option>
                        <option value="ABSENT">
                          {getStatusLabel("ABSENT")}
                        </option>
                        <option value="EXCUSED">
                          {getStatusLabel("EXCUSED")}
                        </option>
                        <option value="SKIPPED">
                          {getStatusLabel("SKIPPED")}
                        </option>
                      </select>
                    </td>

                    {templateItems.length === 0 ? (
                      <td className="whitespace-nowrap px-4 py-3">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={draft.score}
                          disabled={scoreDisabled}
                          onChange={(event) =>
                            onUpdateRow(row.studentId, {
                              status: event.target.value
                                ? "COMPLETED"
                                : draft.status,
                              score: event.target.value,
                            })
                          }
                          className="h-10 w-28 rounded-2xl border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950"
                        />
                      </td>
                    ) : (
                      templateItems.map((item) => {
                        const itemKey = getItemKey(item);

                        return (
                          <td
                            key={`${row.studentId}:${itemKey}`}
                            className="whitespace-nowrap px-4 py-3"
                          >
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={getItemMaxScore(item)}
                              step="0.01"
                              value={getItemInputValue(draft, itemKey)}
                              disabled={scoreDisabled}
                              onChange={(event) =>
                                onUpdateItemScore(
                                  row.studentId,
                                  itemKey,
                                  event.target.value,
                                )
                              }
                              className="h-10 w-28 rounded-2xl border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950"
                            />
                          </td>
                        );
                      })
                    )}

                    <td className="whitespace-nowrap px-4 py-3">
                      {typeof percentage === "number"
                        ? `${percentage.toFixed(1)}%`
                        : "—"}
                    </td>

                    <td className="min-w-[220px] px-4 py-3">
                      <input
                        value={draft.note}
                        onChange={(event) =>
                          onUpdateRow(row.studentId, {
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
    </Panel>
  );
}
