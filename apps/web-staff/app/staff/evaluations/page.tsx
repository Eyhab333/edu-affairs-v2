"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  buildStaffEvaluationWorkspace,
  getEvaluationTaskStatusLabel,
  StaffEvaluationTask,
  StaffEvaluationWorkspace,
} from "@/lib/staff-evaluations";
import { AlertTriangle, CheckCircle2, Target } from "lucide-react";

type PersonTaskGroup = {
  key: string;
  displayName: string;
  email: string;
  tasks: StaffEvaluationTask[];
  total: number;
  pending: number;
  draft: number;
  submitted: number;
  approved: number;
  performanceImprovementStatus?: "NEEDS_REVIEW" | "PLAN_OPEN";
};

type EvaluationPlanGroup = {
  id: string;
  title: string;
  frameworkTitle: string;
  tasks: StaffEvaluationTask[];
  people: number;
  total: number;
  pending: number;
  draft: number;
  submitted: number;
  approved: number;
};

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function getCycleOrder(task: StaffEvaluationTask) {
  const match = task.cycleId.match(
    /(?:week|evaluation|visit|diagnostic|period)-(\d+)/,
  );
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

function getTargetKey(task: StaffEvaluationTask) {
  const extended = task as StaffEvaluationTask & {
    targetPersonId?: string;
  };

  return extended.targetPersonId || task.targetEmail || task.targetDisplayName;
}

function buildPersonGroups(tasks: StaffEvaluationTask[]) {
  const map = new Map<string, PersonTaskGroup>();

  for (const task of tasks) {
    const key = getTargetKey(task);
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
        performanceImprovementStatus: task.performanceImprovementStatus,
      });

      continue;
    }

    existing.tasks.push(task);
    existing.total += 1;

    if (task.status === "PENDING") existing.pending += 1;
    if (task.status === "DRAFT") existing.draft += 1;
    if (task.status === "SUBMITTED") existing.submitted += 1;
    if (task.status === "APPROVED") existing.approved += 1;
    if (task.performanceImprovementStatus) {
      existing.performanceImprovementStatus = task.performanceImprovementStatus;
    }
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

function buildPlanGroups(tasks: StaffEvaluationTask[]) {
  const map = new Map<string, StaffEvaluationTask[]>();

  for (const task of tasks) {
    const current = map.get(task.planId);

    if (current) {
      current.push(task);
    } else {
      map.set(task.planId, [task]);
    }
  }

  return Array.from(map.entries())
    .map(([planId, planTasks]): EvaluationPlanGroup => {
      const firstTask = planTasks[0];
      const people = new Set(planTasks.map(getTargetKey)).size;

      return {
        id: planId,
        title: firstTask.planTitle,
        frameworkTitle: firstTask.frameworkTitle,
        tasks: planTasks,
        people,
        total: planTasks.length,
        pending: planTasks.filter((task) => task.status === "PENDING").length,
        draft: planTasks.filter((task) => task.status === "DRAFT").length,
        submitted: planTasks.filter((task) => task.status === "SUBMITTED").length,
        approved: planTasks.filter((task) => task.status === "APPROVED").length,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, "ar"));
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

function PersonStatusSummary({ group }: { group: PersonTaskGroup }) {
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
  const { actor } = useStaffActor();

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        (actor?.schools ?? [])
          .map((item) => item.id)
          .filter(
            (schoolId): schoolId is string =>
              typeof schoolId === "string" && schoolId.trim().length > 0,
          ),
      ),
    );
  }, [actor?.schools]);

  const [workspace, setWorkspace] = useState<StaffEvaluationWorkspace | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [expandedPersonKey, setExpandedPersonKey] = useState<string | null>(
    null,
  );



const loadWorkspace = useCallback(async () => {
  if (!user || !actor) return;

  setLoading(true);
  setError(null);

  try {
    const result = await buildStaffEvaluationWorkspace({
      uid: user.uid,
      orgId: actor.orgId,
      schoolIds: visibleSchoolIds,
    });

    setWorkspace(result);
  } catch (error) {
    console.error(error);

    setError(
      error instanceof Error
        ? error.message
        : "تعذر تحميل تقييماتي",
    );
  } finally {
    setLoading(false);
  }
}, [
  actor,
  user,
  visibleSchoolIds,
]);

useEffect(() => {
  if (checkingAuth) return;

  if (!user) {
    setLoading(false);
    return;
  }

  if (!actor) {
    return;
  }

  void loadWorkspace();
}, [
  actor,
  checkingAuth,
  user,
  loadWorkspace,
]);







  const tasks = workspace?.tasks ?? [];

  const planGroups = useMemo(() => buildPlanGroups(tasks), [tasks]);

  const activePlan = useMemo(
    () => planGroups.find((plan) => plan.id === activePlanId) ?? planGroups[0],
    [planGroups, activePlanId],
  );

  const activePlanTasks = activePlan?.tasks ?? [];

  const summary = useMemo(() => {
    const groups = buildPersonGroups(activePlanTasks);

    return {
      people: groups.length,
      total: activePlanTasks.length,
      pending: activePlanTasks.filter((task) => task.status === "PENDING").length,
      draft: activePlanTasks.filter((task) => task.status === "DRAFT").length,
      submitted: activePlanTasks.filter((task) => task.status === "SUBMITTED").length,
      approved: activePlanTasks.filter((task) => task.status === "APPROVED").length,
    };
  }, [activePlanTasks]);

  const personGroups = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const groups = buildPersonGroups(activePlanTasks);

    if (!search) return groups;

    return groups.filter((group) => {
      const haystack = [group.displayName, group.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [activePlanTasks, searchText]);

  useEffect(() => {
    if (
      planGroups.length > 0 &&
      !planGroups.some((plan) => plan.id === activePlanId)
    ) {
      setActivePlanId(planGroups[0].id);
    }
  }, [planGroups, activePlanId]);

  useEffect(() => {
    setExpandedPersonKey(null);
    setSearchText("");
  }, [activePlanId]);

  useEffect(() => {
    if (!expandedPersonKey) return;

    const stillExists = personGroups.some(
      (group) => group.key === expandedPersonKey,
    );

    if (!stillExists) {
      setExpandedPersonKey(null);
    }
  }, [personGroups, expandedPersonKey]);

  if (checkingAuth || loading) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          جاري تحميل تقييم الموظفين...
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
              اختر خطة التقييم، ثم ابحث عن الشخص المطلوب وافتح دورته الحالية.
            </p>
          </div>

          <Button variant="outline" onClick={() => void loadWorkspace()}>
            تحديث
          </Button>
          <Button asChild variant="outline">
            <Link href="/staff/performance-improvement">
              <Target className="size-4" /> خطط تحسين الأداء
            </Link>
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold">خطط التقييم المسندة إليك</h2>
          <p className="text-sm text-muted-foreground">
            تظهر هذه الكروت تلقائيًا حسب التقييمات المسندة لك.
          </p>
        </div>

        {planGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
            لا توجد خطط تقييم مسندة إليك حاليًا.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {planGroups.map((plan) => {
              const isActive = activePlan?.id === plan.id;
              const remaining = plan.pending + plan.draft;

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setActivePlanId(plan.id)}
                  className={[
                    "rounded-2xl border p-5 text-right transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "bg-background hover:border-primary/50 hover:bg-muted/40",
                  ].join(" ")}
                >
                  <div className="font-bold">{plan.title}</div>
                  {plan.frameworkTitle !== plan.title ? (
                    <div
                      className={[
                        "mt-1 text-xs",
                        isActive
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {plan.frameworkTitle}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-current/20 px-2.5 py-1">
                      {plan.people} أشخاص
                    </span>
                    <span className="rounded-full border border-current/20 px-2.5 py-1">
                      المتبقي {remaining}
                    </span>
                    <span className="rounded-full border border-current/20 px-2.5 py-1">
                      مرسل {plan.submitted}
                    </span>
                    <span className="rounded-full border border-current/20 px-2.5 py-1">
                      معتمد {plan.approved}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
          <h2 className="text-lg font-bold">
            {activePlan?.title ?? "تفاصيل خطة التقييم"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {activePlan?.frameworkTitle ?? "اختر إحدى الخطط لعرض الأشخاص والدورات."}
          </p>
        </div>

        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="h-11 w-full rounded-xl border bg-background px-3"
          placeholder="ابحث بالاسم أو البريد..."
        />
      </section>

      <section className="space-y-4">
        {personGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            لا توجد تقييمات في هذا القسم أو لا توجد نتائج مطابقة للبحث الحالي.
          </div>
        ) : (
          personGroups.map((group) => {
            const isExpanded = expandedPersonKey === group.key;

            return (
              <div
                key={group.key}
                className="rounded-3xl border bg-card p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{group.displayName}</h2>

                    {group.performanceImprovementStatus ? (
                      <Link
                        href="/staff/performance-improvement"
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
                      >
                        <AlertTriangle className="size-3.5" />
                        {group.performanceImprovementStatus === "PLAN_OPEN"
                          ? "لديه خطة تحسين نشطة"
                          : "يحتاج مراجعة أداء"}
                      </Link>
                    ) : null}

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
                      setExpandedPersonKey(isExpanded ? null : group.key)
                    }
                  >
                    {isExpanded ? "إخفاء التقييمات" : "عرض التقييمات"}
                  </Button>
                </div>

                <PersonStatusSummary group={group} />

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
