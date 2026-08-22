"use client";

import Link from "next/link";
import { useMemo, type ComponentType } from "react";

import {
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  HeartHandshake,
  Layers3,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";

import {
  buildLearningLossHref,
  buildNewMeasurementBatchHref,
  normalizeSubjectKey,
} from "./class-page-helpers";

import type {
  ClassSubjectWorkspace,
  StaffActorCurrentTerm,
  StaffVisibleClass,
  WorkspaceGroupKey,
} from "./class-page-types";

const CLASS_TEACHER_DOMAIN_KEYS = new Set([
  "QURAN",
  "ADHKAR_IDENTITY_ANTHEMS",
  "LEARNING_GARDENS",
  "COUNT_AND_CALCULATE",
  "NUMBERS",
  "ARABIC",
  "KG_QURAN",
  "KG_LEARNING_GARDENS",
  "KG_NUMBERS",
]);

const VALUES_DOMAIN_KEYS = new Set([
  "VALUES",
  "ASMAA_ALLAH",
  "ASMA_ALLAH",
  "NAMES_OF_ALLAH",
  "KG_VALUES",
]);

const CORNERS_DOMAIN_KEYS = new Set(["CORNERS", "ACTIVITIES", "KG_CORNERS"]);

const HOMEROOM_ASSIGNMENT_KEYS = new Set(["CLASS", "HOMEROOM"]);
const HIDDEN_WORKSPACE_OPERATION_KEYS = new Set([
  "NOTES",
  "CURRICULUM_PLAN",
  "RESOURCES",
]);

function getWorkspaceSubjectKey(workspace: ClassSubjectWorkspace) {
  return normalizeSubjectKey(workspace.subjectKey || workspace.subjectId);
}

function getWorkspaceGroupKey(
  workspace: ClassSubjectWorkspace,
): WorkspaceGroupKey {
  const subjectKey = getWorkspaceSubjectKey(workspace);

  if (HOMEROOM_ASSIGNMENT_KEYS.has(subjectKey)) {
    return "HOMEROOM_ASSIGNMENT";
  }

  if (CLASS_TEACHER_DOMAIN_KEYS.has(subjectKey)) {
    return "CLASS_TEACHER_DOMAINS";
  }

  if (VALUES_DOMAIN_KEYS.has(subjectKey)) {
    return "VALUES_DOMAINS";
  }

  if (CORNERS_DOMAIN_KEYS.has(subjectKey)) {
    return "CORNERS_DOMAINS";
  }

  return "OTHER_DOMAINS";
}

function isHomeroomAssignment(workspace: ClassSubjectWorkspace) {
  return getWorkspaceGroupKey(workspace) === "HOMEROOM_ASSIGNMENT";
}

function getWorkspaceGroupMeta(groupKey: WorkspaceGroupKey): {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  toneClassName: string;
} {
  switch (groupKey) {
    case "CLASS_TEACHER_DOMAINS":
      return {
        title: "مجالات معلمة الصف",
        description:
          "القرآن الكريم، الأذكار والهوية الوطنية والأناشيد، بساتين المعرفة، ونعد ونحسب.",
        icon: BookOpen,
        toneClassName:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      };

    case "VALUES_DOMAINS":
      return {
        title: "مجالات القيم",
        description:
          "أسماء الله الحسنى والقيم تُتابع من خلال معلمة القيم حسب إسنادها.",
        icon: HeartHandshake,
        toneClassName:
          "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
      };

    case "CORNERS_DOMAINS":
      return {
        title: "مجالات الأركان والأنشطة",
        description:
          "الأركان والأنشطة تُتابع من خلال معلمة الأركان حسب إسنادها.",
        icon: Sparkles,
        toneClassName:
          "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      };

    case "HOMEROOM_ASSIGNMENT":
      return {
        title: "إسناد الفصل",
        description:
          "هذا يوضح الإسناد العام لمعلمة الصف، ولا يُستخدم كمدخل مباشر للقياسات.",
        icon: GraduationCap,
        toneClassName:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      };

    case "OTHER_DOMAINS":
    default:
      return {
        title: "مواد أخرى",
        description:
          "مواد إضافية مرتبطة بالفصل، وتُعامل حسب نوعها وقوالبها المتاحة.",
        icon: Layers3,
        toneClassName:
          "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
      };
  }
}

function getWorkspaceKindLabel(groupKey: WorkspaceGroupKey) {
  switch (groupKey) {
    case "CLASS_TEACHER_DOMAINS":
      return "معلمة الصف";
    case "VALUES_DOMAINS":
      return "معلمة القيم";
    case "CORNERS_DOMAINS":
      return "معلمة الأركان";
    case "HOMEROOM_ASSIGNMENT":
      return "إسناد عام";
    case "OTHER_DOMAINS":
    default:
      return "مادة";
  }
}

function getWorkspaceActionLabel(operationKey: string) {
  switch (operationKey) {
    case "STUDENT_MEASUREMENTS":
      return "إدخال قياس / متابعة";
    case "LEARNING_LOSS":
      return "الفاقد";
    case "NOTES":
      return "ملاحظات";
    case "GAMIFICATION":
      return "تحفيز";
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

function buildSubjectOperationHref(params: {
  classInfo: StaffVisibleClass;
  offeringId: string;
  subjectKey: string;
  teacherAssignmentId?: string;
  operationKey: string;
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const normalizedSubjectKey = normalizeSubjectKey(params.subjectKey);

  if (HOMEROOM_ASSIGNMENT_KEYS.has(normalizedSubjectKey)) {
    return "";
  }

  const subjectContext = {
    classSubjectOfferingId: params.offeringId,
    subjectKey: params.subjectKey,
    teacherAssignmentId: params.teacherAssignmentId,
  };

  const buildSubjectModuleHref = (modulePath: string) => {
    const query = new URLSearchParams();

    if (params.classInfo.schoolId) {
      query.set("schoolId", params.classInfo.schoolId);
    }

    if (params.classInfo.academicYearId) {
      query.set("academicYearId", params.classInfo.academicYearId);
    }

    if (params.currentTerm?.id) {
      query.set("termId", params.currentTerm.id);
      query.set("termTitle", params.currentTerm.title || "");
      query.set("termShortTitle", params.currentTerm.shortTitle || "");
    }

    if (params.subjectKey) {
      query.set("subjectKey", params.subjectKey);
    }

    if (params.teacherAssignmentId) {
      query.set("teacherAssignmentId", params.teacherAssignmentId);
    }

    const queryString = query.toString();

    return `/staff/classes/${encodeURIComponent(
      params.classInfo.id,
    )}/subjects/${encodeURIComponent(params.offeringId)}/${modulePath}${
      queryString ? `?${queryString}` : ""
    }`;
  };

  const buildClassModuleHref = (modulePath: string) => {
    const query = new URLSearchParams();

    if (params.classInfo.schoolId) {
      query.set("schoolId", params.classInfo.schoolId);
    }

    if (params.classInfo.academicYearId) {
      query.set("academicYearId", params.classInfo.academicYearId);
    }

    if (params.classInfo.gradeId) {
      query.set("gradeId", params.classInfo.gradeId);
    }

    if (params.currentTerm?.id) {
      query.set("termId", params.currentTerm.id);
      query.set("termTitle", params.currentTerm.title || "");
      query.set("termShortTitle", params.currentTerm.shortTitle || "");
    }

    query.set("classSubjectOfferingId", params.offeringId);
    query.set("subjectKey", params.subjectKey);

    if (params.teacherAssignmentId) {
      query.set("teacherAssignmentId", params.teacherAssignmentId);
    }

    const queryString = query.toString();

    return `/staff/classes/${encodeURIComponent(
      params.classInfo.id,
    )}/${modulePath}${queryString ? `?${queryString}` : ""}`;
  };

  switch (params.operationKey) {
    case "STUDENT_MEASUREMENTS":
      return buildNewMeasurementBatchHref(params.classInfo, subjectContext);

    case "LEARNING_LOSS":
      return buildLearningLossHref(params.classInfo, subjectContext);

    case "LESSON_PREP":
      return buildSubjectModuleHref("lesson-prep");

    case "HOMEWORK":
      return buildClassModuleHref("homework");

    case "QUESTION_BANK":
      return buildClassModuleHref("question-bank");

    case "GAMIFICATION":
      return buildSubjectModuleHref("gamification");

    default:
      return "";
  }
}

function getSubjectOperationIcon(operationKey: string) {
  switch (operationKey) {
    case "STUDENT_MEASUREMENTS":
      return ClipboardCheck;

    case "LEARNING_LOSS":
      return Target;

    case "HOMEWORK":
    case "LESSON_PREP":
    case "QUESTION_BANK":
    case "CURRICULUM_PLAN":
    case "RESOURCES":
      return FileText;

    case "GAMIFICATION":
      return Sparkles;

    case "NOTES":
      return MessageSquareText;

    default:
      return BookOpen;
  }
}

export function ClassSubjectWorkspacesSection({
  classInfo,
  workspaces,
  currentTerm,
}: {
  classInfo: StaffVisibleClass;
  workspaces: ClassSubjectWorkspace[];
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const groups = useMemo(() => {
    const order: WorkspaceGroupKey[] = [
      "CLASS_TEACHER_DOMAINS",
      "VALUES_DOMAINS",
      "CORNERS_DOMAINS",
      "OTHER_DOMAINS",
      "HOMEROOM_ASSIGNMENT",
    ];

    const map = new Map<WorkspaceGroupKey, ClassSubjectWorkspace[]>();

    for (const groupKey of order) {
      map.set(groupKey, []);
    }

    for (const workspace of workspaces) {
      const groupKey = getWorkspaceGroupKey(workspace);
      map.get(groupKey)?.push(workspace);
    }

    return order
      .map((groupKey) => ({
        groupKey,
        items: map.get(groupKey) ?? [],
      }))
      .filter((group) => group.items.length > 0);
  }, [workspaces]);

  const operationalDomainsCount = workspaces.filter(
    (workspace) => !isHomeroomAssignment(workspace),
  ).length;

  return (
    <div
      id="class-domains"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-5">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <BookOpen className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-bold">مواد / مجالات الفصل</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              المواد والمجالات المتاحة داخل الفصل حسب إسنادك وصلاحياتك.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">
          {operationalDomainsCount} عنصر تشغيلي
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h3 className="font-bold">
            لا توجد مواد أو مجالات متاحة لك داخل هذا الفصل
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
            تأكد من وجود ClassSubjectOffering للفصل، ومن ربط المستخدم بالمادة
            المناسبة من خلال TeacherAssignment أو TeacherAssignmentClassLink.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h3 className="font-bold">لا توجد عناصر تشغيلية ظاهرة</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">
            قد تكون البيانات الحالية تحتوي على إسناد فصل عام فقط، وليس على مواد
            أو مجالات تشغيلية.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map((group) => {
            const meta = getWorkspaceGroupMeta(group.groupKey);
            const Icon = meta.icon;

            return (
              <section
                key={group.groupKey}
                className="mb-4 rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-2xl p-3 ${meta.toneClassName}`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <h3 className="font-bold">{meta.title}</h3>
                      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {meta.description}
                      </p>
                    </div>
                  </div>

                  <span className="w-fit rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                    {group.items.length.toLocaleString("ar-SA")} عنصر
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((workspace) => (
                    <ClassSubjectWorkspaceCard
                      key={workspace.offeringId}
                      classInfo={classInfo}
                      workspace={workspace}
                      groupKey={group.groupKey}
                      currentTerm={currentTerm}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClassSubjectWorkspaceCard({
  classInfo,
  workspace,
  groupKey,
  currentTerm,
}: {
  classInfo: StaffVisibleClass;
  workspace: ClassSubjectWorkspace;
  groupKey: WorkspaceGroupKey;
  currentTerm?: StaffActorCurrentTerm | null;
}) {
  const isHomeroom = groupKey === "HOMEROOM_ASSIGNMENT";
  const availableOperations = isHomeroom
    ? []
    : (workspace.availableOperations ?? []).filter(
        (operation) =>
          !HIDDEN_WORKSPACE_OPERATION_KEYS.has(operation.operationKey),
      );

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">
            {workspace.displayName || workspace.subjectTitle}
          </h3>

          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {workspace.subjectKey || workspace.subjectId}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
          {workspace.status === "ACTIVE" ? "نشطة" : workspace.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
          {getWorkspaceKindLabel(groupKey)}
        </span>

        {isHomeroom ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
            ليس مدخل قياس
          </span>
        ) : null}
      </div>

      {isHomeroom ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          هذا إسناد عام للفصل. إدخال القياسات والمتابعات يتم من مادة أو مجال
          محدد.
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {availableOperations.length === 0 ? (
            <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              لا توجد عمليات متاحة الآن
            </span>
          ) : null}

          {availableOperations.map((operation) => {
            const Icon = getSubjectOperationIcon(operation.operationKey);
            const href = buildSubjectOperationHref({
              classInfo,
              offeringId: workspace.offeringId,
              subjectKey: workspace.subjectKey,
              teacherAssignmentId: workspace.teacherAssignmentIds?.[0],
              operationKey: operation.operationKey,
              currentTerm,
            });

            const content = (
              <>
                <Icon className="h-3.5 w-3.5" />
                {getWorkspaceActionLabel(operation.operationKey) ||
                  operation.title}
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
                className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-2 text-xs">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
          <span className="text-slate-500 dark:text-slate-400">الإسنادات</span>
          <span className="font-semibold">
            {workspace.teacherAssignmentIds.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
          <span className="text-slate-500 dark:text-slate-400">offering</span>
          <span className="max-w-[10rem] truncate font-mono">
            {workspace.offeringId}
          </span>
        </div>
      </div>
    </div>
  );
}
