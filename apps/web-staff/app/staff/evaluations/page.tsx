"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListFilter, RefreshCw, Search, Target } from "lucide-react";

import { EvaluationPlanList } from "@/components/staff/evaluations/evaluation-plan-list";
import { EvaluationTargetList } from "@/components/staff/evaluations/evaluation-target-list";
import type { EvaluationPlanGroup, PersonTaskGroup } from "@/components/staff/evaluations/types";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { buildStaffEvaluationWorkspace, type StaffEvaluationTask, type StaffEvaluationWorkspace } from "@/lib/staff-evaluations";

function getCycleOrder(task: StaffEvaluationTask) {
  const match = task.cycleId.match(/(?:week|evaluation|visit|diagnostic|period)-(\d+)/);
  if (!match) return 9999;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 9999;
}

function getTargetKey(task: StaffEvaluationTask) {
  return task.targetPersonId || task.targetEmail || task.targetDisplayName;
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
        roleKey: task.targetRoleKey,
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
    if (task.targetRoleKey) existing.roleKey = task.targetRoleKey;
    if (task.performanceImprovementStatus) existing.performanceImprovementStatus = task.performanceImprovementStatus;
  }

  return Array.from(map.values())
    .map((group) => ({ ...group, tasks: [...group.tasks].sort((a, b) => getCycleOrder(a) - getCycleOrder(b)) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

function buildPlanGroups(tasks: StaffEvaluationTask[]) {
  const map = new Map<string, StaffEvaluationTask[]>();
  for (const task of tasks) {
    const current = map.get(task.planId);
    if (current) current.push(task);
    else map.set(task.planId, [task]);
  }

  return Array.from(map.entries())
    .map(([planId, planTasks]): EvaluationPlanGroup => {
      const firstTask = planTasks[0];
      return {
        id: planId,
        title: firstTask.planTitle,
        frameworkTitle: firstTask.frameworkTitle,
        tasks: planTasks,
        people: new Set(planTasks.map(getTargetKey)).size,
        total: planTasks.length,
        pending: planTasks.filter((task) => task.status === "PENDING").length,
        draft: planTasks.filter((task) => task.status === "DRAFT").length,
        submitted: planTasks.filter((task) => task.status === "SUBMITTED").length,
        approved: planTasks.filter((task) => task.status === "APPROVED").length,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, "ar"));
}

function Summary({ title, value }: { title: string; value: number }) {
  return <div className="rounded-lg bg-muted/50 px-3 py-2">
    <div className="text-xs text-muted-foreground">{title}</div>
    <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
  </div>;
}

export default function StaffEvaluationsPage() {
  const { user, checkingAuth } = useRequireAuth();
  const { actor } = useStaffActor();
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibleSchoolIds = useMemo(() => Array.from(new Set(
    (actor?.schools ?? []).map((item) => item.id).filter(
      (schoolId): schoolId is string => typeof schoolId === "string" && schoolId.trim().length > 0,
    ),
  )), [actor?.schools]);

  const [workspace, setWorkspace] = useState<StaffEvaluationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [expandedPersonKey, setExpandedPersonKey] = useState<string | null>(null);
  const [mobilePlansOpen, setMobilePlansOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!user || !actor) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await buildStaffEvaluationWorkspace({
        uid: user.uid,
        orgId: actor.orgId,
        schoolIds: visibleSchoolIds,
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل تقييماتي");
    } finally {
      setLoading(false);
    }
  }, [actor, user, visibleSchoolIds]);

  useEffect(() => {
    if (checkingAuth) return;
    if (!user) {
      setLoading(false);
      return;
    }
    if (actor) void loadWorkspace();
  }, [actor, checkingAuth, loadWorkspace, user]);

  const planGroups = useMemo(() => buildPlanGroups(workspace?.tasks ?? []), [workspace]);
  const requestedPlanId = searchParams.get("planId");
  const activePlan = useMemo(
    () => planGroups.find((plan) => plan.id === requestedPlanId) ?? planGroups[0],
    [planGroups, requestedPlanId],
  );
  const activePlanId = activePlan?.id ?? null;

  useEffect(() => {
    if (!activePlan || requestedPlanId === activePlan.id) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("planId", activePlan.id);
    router.replace(`/staff/evaluations?${params.toString()}`);
  }, [activePlan, requestedPlanId, router, searchParams]);

  const selectPlan = useCallback((planId: string) => {
    if (planId !== activePlanId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("planId", planId);
      router.push(`/staff/evaluations?${params.toString()}`);
    }
    setMobilePlansOpen(false);
  }, [activePlanId, router, searchParams]);

  const activePlanTasks = activePlan?.tasks ?? [];
  const summary = useMemo(() => ({
    people: buildPersonGroups(activePlanTasks).length,
    total: activePlanTasks.length,
    pending: activePlanTasks.filter((task) => task.status === "PENDING").length,
    draft: activePlanTasks.filter((task) => task.status === "DRAFT").length,
    submitted: activePlanTasks.filter((task) => task.status === "SUBMITTED").length,
    approved: activePlanTasks.filter((task) => task.status === "APPROVED").length,
  }), [activePlanTasks]);
  const personGroups = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    const groups = buildPersonGroups(activePlanTasks);
    if (!search) return groups;
    return groups.filter((group) => [group.displayName, group.email]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(search));
  }, [activePlanTasks, searchText]);

  useEffect(() => { setExpandedPersonKey(null); }, [activePlanId]);
  useEffect(() => {
    if (expandedPersonKey && !personGroups.some((group) => group.key === expandedPersonKey)) {
      setExpandedPersonKey(null);
    }
  }, [expandedPersonKey, personGroups]);

  if (checkingAuth || loading) {
    return <main dir="rtl" className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="h-20 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </main>;
  }

  if (error) {
    return <main dir="rtl" className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="rounded-2xl border border-destructive/40 bg-card p-6">
        <h1 className="text-xl font-bold">تعذر تحميل تقييماتي</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => void loadWorkspace()}>إعادة المحاولة</Button>
      </div>
    </main>;
  }

  const hasSearch = Boolean(searchText.trim());
  return (
    <main dir="rtl" className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">مساحة التقييمات</h1>
          <p className="mt-1 text-sm text-muted-foreground">اختر الخطة ثم افتح تقييم الموظف المطلوب مباشرة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadWorkspace()}><RefreshCw className="size-4" /> تحديث</Button>
          <Button asChild variant="outline" size="sm"><Link href="/staff/performance-improvement"><Target className="size-4" /> خطط تحسين الأداء</Link></Button>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} className="h-10 w-full rounded-xl border bg-background pr-9 pl-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50" placeholder="ابحث باسم الموظف أو بريده الإلكتروني..." />
          </label>
          {hasSearch ? <Button variant="ghost" size="sm" onClick={() => setSearchText("")}>مسح البحث</Button> : null}
          <Button variant="outline" size="sm" className="lg:hidden" aria-expanded={mobilePlansOpen} onClick={() => setMobilePlansOpen((open) => !open)}>

            <ListFilter className="size-4" /> <span className="max-w-48 text-right leading-6 whitespace-normal break-words line-clamp-4">{activePlan?.title ?? "اختيار خطة"}</span>
          </Button>
        </div>
        {mobilePlansOpen ? <div className="mt-3 rounded-xl border bg-background p-2 lg:hidden">
          <div className="mb-2 flex items-center justify-between px-2 text-sm font-semibold"><span>خطط التقييم</span><span className="text-xs font-normal text-muted-foreground">{planGroups.length}</span></div>
          {planGroups.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">لا توجد خطط تقييم مسندة إليك حالياً.</p> : <div className="max-h-72 overflow-y-auto"><EvaluationPlanList plans={planGroups} selectedPlanId={activePlanId} onSelect={selectPlan} /></div>}
        </div> : null}
      </section>

      {planGroups.length === 0 ? <section className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد خطط تقييم مسندة إليك حالياً.</section> : (
        <section className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:block">
            <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">خطط التقييم</h2><span className="text-xs tabular-nums text-muted-foreground">{planGroups.length}</span></div>
            <div className="max-h-[calc(100vh-5.75rem)] overflow-y-auto p-2"><EvaluationPlanList plans={planGroups} selectedPlanId={activePlanId} onSelect={selectPlan} /></div>
          </aside>

          <section className="min-w-0 rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><h2 className="text-xl font-bold leading-6 whitespace-normal break-words line-clamp-4">{activePlan?.title}</h2>{activePlan?.frameworkTitle && activePlan.frameworkTitle !== activePlan.title ? <p className="mt-1 truncate text-sm text-muted-foreground">{activePlan.frameworkTitle}</p> : null}</div>
                <span className="shrink-0 text-sm text-muted-foreground">{summary.people} موظفين</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Summary title="الموظفون" value={summary.people} /><Summary title="الإجمالي" value={summary.total} /><Summary title="لم يبدأ" value={summary.pending} /><Summary title="مسودة" value={summary.draft} /><Summary title="مرسل" value={summary.submitted} /><Summary title="معتمد" value={summary.approved} />
              </div>
            </div>
            <div className="p-2 md:p-3">
              {personGroups.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{hasSearch ? "لا توجد نتائج مطابقة للبحث الحالي." : "لا توجد أهداف ضمن خطة التقييم هذه."}</div> : <EvaluationTargetList groups={personGroups} expandedPersonKey={expandedPersonKey} onExpandedPersonChange={setExpandedPersonKey} />}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
