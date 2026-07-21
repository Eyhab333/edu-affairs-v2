"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  buildStaffEvaluationWorkspace,
  getEvaluationTaskStatusLabel,
  StaffEvaluationTask,
  StaffEvaluationWorkspace,
} from "@/lib/staff-evaluations";
import { CheckCircle2 } from "lucide-react";

type WorkspaceTabKey =
  | "teacher-weekly"
  | "teacher-diagnostic"
  | "admin"
  | "other";

type AdminCategoryKey =
  | "all"
  | "media"
  | "admin-assistant"
  | "activity-leader"
  | "vice-principal"
  | "student-counselor";

type TeacherTaskGroup = {
  key: string;
  displayName: string;
  email: string;
  tasks: StaffEvaluationTask[];
  total: number;
  pending: number;
  draft: number;
  submitted: number;
  approved: number;
};

const TABS: Array<{
  key: WorkspaceTabKey;
  label: string;
  description: string;
}> = [
  {
    key: "teacher-weekly",
    label: "المعلمون - تقييم المدير",
    description: "متابعة تقييمات المدير للمعلمين خلال الفصل الدراسي.",
  },
  {
    key: "teacher-diagnostic",
    label: "المعلمون - تشخيصي",
    description: "متابعة الزيارات أو التقييمات التشخيصية للمعلمين.",
  },
  {
    key: "admin",
    label: "الإداريون",
    description: "متابعة تقييمات الإداريين والموظفين غير المعلمين.",
  },
  {
    key: "other",
    label: "أخرى",
    description: "أي تقييمات لا تنتمي للتصنيفات الأساسية.",
  },
];

const ADMIN_CATEGORIES: Array<{
  key: AdminCategoryKey;
  label: string;
}> = [
  { key: "all", label: "الكل" },
  { key: "media", label: "الإعلامي" },
  { key: "admin-assistant", label: "المساعد الإداري" },
  { key: "activity-leader", label: "رائد النشاط" },
  { key: "vice-principal", label: "وكيل المدرسة" },
  { key: "student-counselor", label: "الموجه الطلابي" },
];

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function getCycleOrder(task: StaffEvaluationTask) {
  const match = task.cycleId.match(/week-(\d+)/);
  if (!match) return 9999;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 9999;
}

function getActionLabel(status: StaffEvaluationTask["status"]) {
  switch (status) {
    case "PENDING":
      return "فتح التقييم";
    case "DRAFT":
      return "متابعة المسودة";
    case "SUBMITTED":
      return "مراجعة / اعتماد";
    case "APPROVED":
      return "عرض التقييم";
    default:
      return "فتح";
  }
}

function getTeacherKey(task: StaffEvaluationTask) {
  const extended = task as StaffEvaluationTask & {
    targetPersonId?: string;
  };

  return extended.targetPersonId || task.targetEmail || task.targetDisplayName;
}

function getOptionalText(task: StaffEvaluationTask, key: string) {
  const value = (task as unknown as Record<string, unknown>)[key];

  return typeof value === "string" ? value : "";
}

function classifyTask(task: StaffEvaluationTask): WorkspaceTabKey {
  const frameworkKind = getOptionalText(task, "frameworkKind");
  const planKind = getOptionalText(task, "planKind");
  const targetKind = getOptionalText(task, "targetKind");
  const targetRoleKey = getOptionalText(task, "targetRoleKey");
  const frameworkId = getOptionalText(task, "frameworkId");

  const text = [
    task.frameworkTitle,
    task.planTitle,
    task.planId,
    task.cycleId,
    frameworkId,
    frameworkKind,
    planKind,
    targetKind,
    targetRoleKey,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const looksTeacher =
    text.includes("teacher") ||
    text.includes("معلم") ||
    text.includes("المعلمين") ||
    targetKind === "TEACHER";

  const looksWeekly =
    text.includes("weekly") ||
    text.includes("week") ||
    text.includes("أسبوع") ||
    frameworkKind === "WEEKLY_TEACHER_EVALUATION";

  const looksDiagnostic =
    text.includes("diagnostic") ||
    text.includes("classroom") ||
    text.includes("تشخيص") ||
    text.includes("زيارة") ||
    frameworkKind === "CLASSROOM_VISIT";

  const looksAdmin =
    text.includes("admin") ||
    text.includes("إداري") ||
    text.includes("الإداريين") ||
    targetKind === "ADMIN_STAFF";

  if (looksTeacher && looksWeekly) return "teacher-weekly";
  if (looksTeacher && looksDiagnostic) return "teacher-diagnostic";
  if (looksAdmin) return "admin";

  return "other";
}

function classifyAdminCategory(task: StaffEvaluationTask): AdminCategoryKey {
  const frameworkId = getOptionalText(task, "frameworkId");
  const targetRoleKey = getOptionalText(task, "targetRoleKey");
  const targetRoleLabel = getOptionalText(task, "targetRoleLabel");

  const text = [
    frameworkId,
    targetRoleKey,
    targetRoleLabel,
    task.frameworkTitle,
    task.planTitle,
    task.planId,
    // task.targetDisplayName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("media") ||
    text.includes("إعلام") ||
    text.includes("الإعلامي")
  ) {
    return "media";
  }

  if (
    text.includes("assistant") ||
    text.includes("مساعد") ||
    text.includes("المساعد الإداري")
  ) {
    return "admin-assistant";
  }

  if (
    text.includes("activity") ||
    text.includes("رائد") ||
    text.includes("نشاط")
  ) {
    return "activity-leader";
  }

  if (
    text.includes("vice") ||
    text.includes("principal") ||
    text.includes("وكيل")
  ) {
    return "vice-principal";
  }

  if (
    text.includes("counselor") ||
    text.includes("موجه") ||
    text.includes("إرشاد") ||
    text.includes("طلابي")
  ) {
    return "student-counselor";
  }

  return "all";
}

function buildTeacherGroups(tasks: StaffEvaluationTask[]) {
  const map = new Map<string, TeacherTaskGroup>();

  for (const task of tasks) {
    const key = getTeacherKey(task);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        displayName: task.targetDisplayName,
        email: task.targetEmail || "",
        tasks: [task],
        total: 1,
        pending: task.status === "PENDING" ? 1 : 0,
        draft: task.status === "DRAFT" ? 1 : 0,
        submitted: task.status === "SUBMITTED" ? 1 : 0,
        approved: task.status === "APPROVED" ? 1 : 0,
      });

      continue;
    }

    existing.tasks.push(task);
    existing.total += 1;

    if (task.status === "PENDING") existing.pending += 1;
    if (task.status === "DRAFT") existing.draft += 1;
    if (task.status === "SUBMITTED") existing.submitted += 1;
    if (task.status === "APPROVED") existing.approved += 1;
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort(
        (a, b) => getCycleOrder(a) - getCycleOrder(b),
      ),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

function buildTabCounts(tasks: StaffEvaluationTask[]) {
  const counts: Record<WorkspaceTabKey, number> = {
    "teacher-weekly": 0,
    "teacher-diagnostic": 0,
    admin: 0,
    other: 0,
  };

  for (const task of tasks) {
    counts[classifyTask(task)] += 1;
  }

  return counts;
}

function EvaluationStatusBadge({
  status,
}: {
  status: StaffEvaluationTask["status"];
}) {
  const isApproved = status === "APPROVED";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
        isApproved
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "",
      ].join(" ")}
    >
      {isApproved ? <CheckCircle2 className="size-4" /> : null}
      {getEvaluationTaskStatusLabel(status)}
    </span>
  );
}

function TeacherStatusSummary({ group }: { group: TeacherTaskGroup }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
      <div className="rounded-xl border bg-background p-3">
        <div className="text-muted-foreground">لم يبدأ</div>
        <div className="mt-1 font-bold">{group.pending}</div>
      </div>

      <div className="rounded-xl border bg-background p-3">
        <div className="text-muted-foreground">مسودة</div>
        <div className="mt-1 font-bold">{group.draft}</div>
      </div>

      <div className="rounded-xl border bg-background p-3">
        <div className="text-muted-foreground">مرسل</div>
        <div className="mt-1 font-bold">{group.submitted}</div>
      </div>

      <div className="rounded-xl border bg-background p-3">
        <div className="text-muted-foreground">معتمد</div>
        <div className="mt-1 font-bold">{group.approved}</div>
      </div>
    </div>
  );
}

export default function StaffEvaluationsPage() {
  const { user, checkingAuth } = useRequireAuth();

  const [workspace, setWorkspace] = useState<StaffEvaluationWorkspace | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>("teacher-weekly");

  const [activeAdminCategory, setActiveAdminCategory] =
    useState<AdminCategoryKey>("all");

  const [searchText, setSearchText] = useState("");
  const [expandedTeacherKey, setExpandedTeacherKey] = useState<string | null>(
    null,
  );

  const loadWorkspace = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildStaffEvaluationWorkspace({
        uid: user.uid,
        orgId: "takween",
      });

      setWorkspace(result);
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "تعذر تحميل تقييماتي");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadWorkspace();
    }

    if (!checkingAuth && !user) {
      setLoading(false);
    }
  }, [checkingAuth, user, loadWorkspace]);

  const tasks = workspace?.tasks ?? [];

  const tabCounts = useMemo(() => buildTabCounts(tasks), [tasks]);

  const activeTabInfo = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  const baseTabTasks = useMemo(() => {
    return tasks.filter((task) => classifyTask(task) === activeTab);
  }, [tasks, activeTab]);

  const adminCategoryCounts = useMemo(() => {
    const counts: Record<AdminCategoryKey, number> = {
      all: baseTabTasks.length,
      media: 0,
      "admin-assistant": 0,
      "activity-leader": 0,
      "vice-principal": 0,
      "student-counselor": 0,
    };

    if (activeTab !== "admin") return counts;

    for (const task of baseTabTasks) {
      const category = classifyAdminCategory(task);

      if (category !== "all") {
        counts[category] += 1;
      }
    }

    return counts;
  }, [baseTabTasks, activeTab]);

  const tabTasks = useMemo(() => {
    if (activeTab !== "admin") return baseTabTasks;
    if (activeAdminCategory === "all") return baseTabTasks;

    return baseTabTasks.filter(
      (task) => classifyAdminCategory(task) === activeAdminCategory,
    );
  }, [baseTabTasks, activeTab, activeAdminCategory]);

  const summary = useMemo(() => {
    const groups = buildTeacherGroups(tabTasks);

    return {
      people: groups.length,
      total: tabTasks.length,
      pending: tabTasks.filter((task) => task.status === "PENDING").length,
      draft: tabTasks.filter((task) => task.status === "DRAFT").length,
      submitted: tabTasks.filter((task) => task.status === "SUBMITTED").length,
      approved: tabTasks.filter((task) => task.status === "APPROVED").length,
    };
  }, [tabTasks]);

  const teacherGroups = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const groups = buildTeacherGroups(tabTasks);

    if (!search) return groups;

    return groups.filter((group) => {
      const haystack = [group.displayName, group.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [tabTasks, searchText]);

  useEffect(() => {
    setExpandedTeacherKey(null);
    setSearchText("");

    if (activeTab !== "admin") {
      setActiveAdminCategory("all");
    }
  }, [activeTab]);

  useEffect(() => {
    if (!expandedTeacherKey) return;

    const stillExists = teacherGroups.some(
      (group) => group.key === expandedTeacherKey,
    );

    if (!stillExists) {
      setExpandedTeacherKey(null);
    }
  }, [teacherGroups, expandedTeacherKey]);

  if (checkingAuth || loading) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          جاري تحميل تقييماتي...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-destructive/40 bg-card p-6">
          <h1 className="text-xl font-bold">تعذر تحميل تقييماتي</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={() => void loadWorkspace()}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">مساحة التقييمات</h1>
            <p className="text-sm text-muted-foreground">
              اختر نوع التقييم أولًا، ثم ابحث عن الشخص المطلوب وافتح تقييماته.
            </p>
          </div>

          <Button variant="outline" onClick={() => void loadWorkspace()}>
            تحديث
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "rounded-2xl border p-4 text-right transition",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{tab.label}</span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs",
                      isActive
                        ? "bg-primary-foreground/20"
                        : "border bg-card text-muted-foreground",
                    ].join(" ")}
                  >
                    {tabCounts[tab.key]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-6">
        <SummaryCard title="الأشخاص" value={summary.people} />
        <SummaryCard title="الإجمالي" value={summary.total} />
        <SummaryCard title="لم يبدأ" value={summary.pending} />
        <SummaryCard title="مسودات" value={summary.draft} />
        <SummaryCard title="مرسل" value={summary.submitted} />
        <SummaryCard title="معتمد" value={summary.approved} />
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold">{activeTabInfo.label}</h2>
          <p className="text-sm text-muted-foreground">
            {activeTabInfo.description}
          </p>
        </div>

        {activeTab === "admin" ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {ADMIN_CATEGORIES.map((category) => {
              const isActive = activeAdminCategory === category.key;

              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveAdminCategory(category.key)}
                  className={[
                    "rounded-full border px-4 py-2 text-sm transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  {category.label}
                  <span className="ms-2 text-xs opacity-80">
                    {adminCategoryCounts[category.key]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="h-11 w-full rounded-xl border bg-background px-3"
          placeholder="ابحث بالاسم أو البريد..."
        />
      </section>

      <section className="space-y-4">
        {teacherGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            لا توجد تقييمات في هذا القسم أو لا توجد نتائج مطابقة للبحث الحالي.
          </div>
        ) : (
          teacherGroups.map((group) => {
            const isExpanded = expandedTeacherKey === group.key;

            return (
              <div
                key={group.key}
                className="rounded-3xl border bg-card p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{group.displayName}</h2>

                    {group.email ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {group.email}
                      </p>
                    ) : null}

                    <p className="mt-2 text-sm text-muted-foreground">
                      عدد التقييمات المسندة: {group.total}
                    </p>
                  </div>

                  <Button
                    variant={isExpanded ? "secondary" : "outline"}
                    onClick={() =>
                      setExpandedTeacherKey(isExpanded ? null : group.key)
                    }
                  >
                    {isExpanded ? "إخفاء التقييمات" : "عرض التقييمات"}
                  </Button>
                </div>

                <TeacherStatusSummary group={group} />

                {isExpanded ? (
                  <div className="mt-5 overflow-hidden rounded-2xl border">
                    <div className="hidden grid-cols-[1fr_1.4fr_120px_140px] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium md:grid">
                      <div>الدورة</div>
                      <div>نوع التقييم</div>
                      <div>الحالة</div>
                      <div className="text-center">الإجراء</div>
                    </div>

                    <div className="divide-y">
                      {group.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_1.4fr_120px_140px] md:items-center"
                        >
                          <div>
                            <div className="font-medium">{task.cycleTitle}</div>
                            <div className="text-xs text-muted-foreground">
                              الوزن: {task.weight}%
                            </div>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            {task.frameworkTitle}
                          </div>

                          <div>
                            <EvaluationStatusBadge status={task.status} />
                          </div>

                          <div className="md:text-center">
                            <Button asChild size="sm">
                              <Link href={task.actionHref}>
                                {getActionLabel(task.status)}
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
