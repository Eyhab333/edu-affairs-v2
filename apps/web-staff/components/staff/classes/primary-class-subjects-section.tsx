"use client";

import Link from "next/link";
import { type ComponentType } from "react";
import {
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  MessageSquareText,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

import { buildClassSubjectWorkspaces } from "@takween/domain";

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

type StaffActorCurrentTerm = {
  id: string;
  title: string;
  shortTitle?: string;
};

type ClassSubjectWorkspace = ReturnType<
  typeof buildClassSubjectWorkspaces
>[number];

const HIDDEN_WORKSPACE_OPERATION_KEYS = new Set([
  "NOTES",
  "CURRICULUM_PLAN",
  "RESOURCES",
]);

function normalizeSubjectKey(value?: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function appendTermContext(
  params: URLSearchParams,
  currentTerm?: StaffActorCurrentTerm | null,
) {
  if (!currentTerm?.id) return;

  params.set("termId", currentTerm.id);
  params.set("termTitle", currentTerm.title || "");
  params.set("termShortTitle", currentTerm.shortTitle || "");
}

function buildNewMeasurementBatchHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    teacherAssignmentId?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }

  appendTermContext(params, subjectContext.currentTerm);

  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  params.set("subjectKey", subjectContext.subjectKey);

  if (subjectContext.teacherAssignmentId) {
    params.set("teacherAssignmentId", subjectContext.teacherAssignmentId);
  }

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/measurements/batches/new${query ? `?${query}` : ""}`;
}

function buildLearningLossHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.id) params.set("classId", classInfo.id);
  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }

  appendTermContext(params, subjectContext.currentTerm);

  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  params.set("subjectKey", subjectContext.subjectKey);

  const query = params.toString();

  return `/staff/learning-loss${query ? `?${query}` : ""}`;
}

function buildQuestionBankHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    teacherAssignmentId?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }
  if (classInfo.gradeId) params.set("gradeId", classInfo.gradeId);

  appendTermContext(params, subjectContext.currentTerm);

  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  params.set("subjectKey", subjectContext.subjectKey);

  if (subjectContext.teacherAssignmentId) {
    params.set("teacherAssignmentId", subjectContext.teacherAssignmentId);
  }

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/question-bank${query ? `?${query}` : ""}`;
}

function buildHomeworkListHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    teacherAssignmentId?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }
  if (classInfo.gradeId) params.set("gradeId", classInfo.gradeId);

  appendTermContext(params, subjectContext.currentTerm);

  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  params.set("subjectKey", subjectContext.subjectKey);

  if (subjectContext.teacherAssignmentId) {
    params.set("teacherAssignmentId", subjectContext.teacherAssignmentId);
  }

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/homework${query ? `?${query}` : ""}`;
}

function buildGamificationHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    subjectTitle?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }
  if (classInfo.gradeId) params.set("gradeId", classInfo.gradeId);

  appendTermContext(params, subjectContext.currentTerm);

  params.set("subjectKey", subjectContext.subjectKey);
  params.set("subjectTitle", subjectContext.subjectTitle ?? "");
  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/subjects/${encodeURIComponent(
    subjectContext.classSubjectOfferingId,
  )}/gamification${query ? `?${query}` : ""}`;
}

function buildLessonPrepHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    teacherAssignmentId?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }
  if (classInfo.gradeId) params.set("gradeId", classInfo.gradeId);

  appendTermContext(params, subjectContext.currentTerm);

  params.set("subjectKey", subjectContext.subjectKey);
  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);

  if (subjectContext.teacherAssignmentId) {
    params.set("teacherAssignmentId", subjectContext.teacherAssignmentId);
  }

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/subjects/${encodeURIComponent(
    subjectContext.classSubjectOfferingId,
  )}/lesson-prep${query ? `?${query}` : ""}`;
}

function buildVirtualClassesHref(
  classInfo: StaffVisibleClass,
  subjectContext: {
    classSubjectOfferingId: string;
    subjectKey: string;
    subjectTitle?: string;
    currentTerm?: StaffActorCurrentTerm | null;
  },
) {
  const params = new URLSearchParams();

  if (classInfo.schoolId) params.set("schoolId", classInfo.schoolId);
  if (classInfo.academicYearId) {
    params.set("academicYearId", classInfo.academicYearId);
  }
  if (classInfo.gradeId) params.set("gradeId", classInfo.gradeId);
  if (classInfo.streamId) params.set("streamId", classInfo.streamId);

  appendTermContext(params, subjectContext.currentTerm);

  params.set("subjectKey", subjectContext.subjectKey);
  params.set("subjectTitle", subjectContext.subjectTitle ?? "");
  params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(
    classInfo.id,
  )}/subjects/${encodeURIComponent(
    subjectContext.classSubjectOfferingId,
  )}/virtual-classes${query ? `?${query}` : ""}`;
}

function getOperationActionLabel(operationKey: string) {
  switch (operationKey) {
    case "STUDENT_MEASUREMENTS":
      return "إدخال قياس / اختبار";
    case "LEARNING_LOSS":
      return "الفاقد";
    case "NOTES":
      return "ملاحظات";
    case "GAMIFICATION":
      return "تحفيز";
    case "VIRTUAL_CLASSES":
      return "حصص افتراضية";
    case "HOMEWORK":
      return "واجبات";
    case "LESSON_PREP":
      return "تحضير";
    case "QUESTION_BANK":
      return "بنك أسئلة";
    case "CURRICULUM_PLAN":
      return "توزيع المنهج";
    case "RESOURCES":
      return "مذكرات وملحقات";
    default:
      return "";
  }
}

function getOperationIcon(operationKey: string): ComponentType<{
  className?: string;
}> {
  switch (operationKey) {
    case "STUDENT_MEASUREMENTS":
      return ClipboardCheck;

    case "LEARNING_LOSS":
      return Target;

    case "NOTES":
      return MessageSquareText;

    case "GAMIFICATION":
      return Sparkles;

    case "VIRTUAL_CLASSES":
      return Video;

    case "HOMEWORK":
    case "LESSON_PREP":
    case "QUESTION_BANK":
    case "CURRICULUM_PLAN":
    case "RESOURCES":
      return FileText;

    default:
      return BookOpen;
  }
}

function buildOperationHref(params: {
  classInfo: StaffVisibleClass;
  workspace: ClassSubjectWorkspace;
  operationKey: string;
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const subjectKey = normalizeSubjectKey(
    params.workspace.subjectKey || params.workspace.subjectId,
  );

  const subjectContext = {
    classSubjectOfferingId: params.workspace.offeringId,
    subjectKey,
    teacherAssignmentId: params.workspace.teacherAssignmentIds?.[0],
    currentTerm: params.currentTerm,
  };

  switch (params.operationKey) {
    case "STUDENT_MEASUREMENTS":
      return buildNewMeasurementBatchHref(params.classInfo, subjectContext);

    case "LEARNING_LOSS":
      return buildLearningLossHref(params.classInfo, subjectContext);

    case "QUESTION_BANK":
      return buildQuestionBankHref(params.classInfo, subjectContext);

    case "HOMEWORK":
      return buildHomeworkListHref(params.classInfo, subjectContext);

    case "GAMIFICATION":
      return buildGamificationHref(params.classInfo, {
        classSubjectOfferingId: subjectContext.classSubjectOfferingId,
        subjectKey: subjectContext.subjectKey,
        subjectTitle: getSubjectDisplayName(params.workspace),
      });

    case "VIRTUAL_CLASSES":
      return buildVirtualClassesHref(params.classInfo, {
        classSubjectOfferingId: subjectContext.classSubjectOfferingId,
        subjectKey: subjectContext.subjectKey,
        subjectTitle: getSubjectDisplayName(params.workspace),
        currentTerm: params.currentTerm,
      });

    case "LESSON_PREP":
      return buildLessonPrepHref(params.classInfo, subjectContext);

    default:
      return "";
  }
}

function getSubjectDisplayName(workspace: ClassSubjectWorkspace) {
  return (
    workspace.displayName ||
    workspace.subjectTitle ||
    workspace.subjectKey ||
    workspace.subjectId ||
    "مادة"
  );
}

export function PrimaryClassSubjectsSection({
  classInfo,
  workspaces,
  currentTerm,
}: {
  classInfo: StaffVisibleClass;
  workspaces: ReturnType<typeof buildClassSubjectWorkspaces>;
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const visibleWorkspaces = workspaces.filter((workspace) => {
    const subjectKey = normalizeSubjectKey(
      workspace.subjectKey || workspace.subjectId,
    );

    return subjectKey !== "CLASS" && subjectKey !== "HOMEROOM";
  });

  return (
    <section
      id="class-domains"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-5">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <BookOpen className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-bold">مواد الفصل</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              المواد المفعّلة داخل هذا الفصل حسب المدرسة والسنة والفصل المحدد.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">
          {visibleWorkspaces.length.toLocaleString("ar-SA")} مادة
        </div>
      </div>

      {visibleWorkspaces.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h3 className="font-bold">لا توجد مواد مفعّلة داخل هذا الفصل</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
            تأكد من وجود ClassSubjectOffering مطابق للمدرسة والسنة والفصل.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleWorkspaces.map((workspace) => (
            <PrimaryClassSubjectCard
              key={workspace.offeringId}
              classInfo={classInfo}
              workspace={workspace}
              currentTerm={currentTerm}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PrimaryClassSubjectCard({
  classInfo,
  workspace,
  currentTerm,
}: {
  classInfo: StaffVisibleClass;
  workspace: ClassSubjectWorkspace;
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const subjectKey = normalizeSubjectKey(
    workspace.subjectKey || workspace.subjectId,
  );

  const operations = (workspace.availableOperations ?? []).filter(
    (operation) =>
      !HIDDEN_WORKSPACE_OPERATION_KEYS.has(operation.operationKey),
  );

  return (
    <article className="rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-violet-900 dark:hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">
            {getSubjectDisplayName(workspace)}
          </h3>

          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {subjectKey || "NO_SUBJECT_KEY"}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
          {workspace.status === "ACTIVE" ? "نشطة" : workspace.status}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {operations.length === 0 ? (
          <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            لا توجد عمليات متاحة الآن
          </span>
        ) : null}

        {operations.map((operation) => {
          const Icon = getOperationIcon(operation.operationKey);
          const href = buildOperationHref({
            classInfo,
            workspace,
            operationKey: operation.operationKey,
            currentTerm,
          });

          const label =
            getOperationActionLabel(operation.operationKey) || operation.title;

          const content = (
            <>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </>
          );

          if (!href) {
            return (
              <span
                key={operation.operationKey}
                className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900"
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={operation.operationKey}
              href={href}
              className={
                operation.isPrimary
                  ? "inline-flex h-9 items-center gap-1.5 rounded-2xl bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700"
                  : "inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }
            >
              {content}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 text-xs">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">الإسنادات</span>
          <span className="font-semibold">
            {(workspace.teacherAssignmentIds ?? []).length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">offering</span>
          <span className="max-w-[12rem] truncate font-mono">
            {workspace.offeringId}
          </span>
        </div>
      </div>

      {/* <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          href={buildNewMeasurementBatchHref(classInfo, {
            classSubjectOfferingId: workspace.offeringId,
            subjectKey,
            teacherAssignmentId: workspace.teacherAssignmentIds?.[0],
            currentTerm,
          })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950"
        >
          إدخال قياس / اختبار
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Link
          href={buildQuestionBankHref(classInfo, {
            classSubjectOfferingId: workspace.offeringId,
            subjectKey,
            currentTerm,
          })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          بنك الأسئلة
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Link
          href={buildHomeworkListHref(classInfo, {
            classSubjectOfferingId: workspace.offeringId,
            subjectKey,
            currentTerm,
          })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          الواجبات
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Link
          href={buildGamificationHref(classInfo, {
            classSubjectOfferingId: workspace.offeringId,
            subjectKey,
            subjectTitle: getSubjectDisplayName(workspace),
            currentTerm,
          })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950"
        >
          التحفيز
          <Sparkles className="h-4 w-4" />
        </Link>
      </div> */}
    </article>
  );
}
