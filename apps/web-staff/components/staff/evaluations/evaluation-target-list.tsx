import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getEvaluationTaskStatusLabel,
  type StaffEvaluationTask,
} from "@/lib/staff-evaluations";

import type { PersonTaskGroup } from "./types";

type EvaluationTargetListProps = {
  groups: PersonTaskGroup[];
  expandedPersonKey: string | null;
  onExpandedPersonChange: (key: string | null) => void;
};

function getActionLabel(status: StaffEvaluationTask["status"]) {
  switch (status) {
    case "PENDING": return "فتح التقييم";
    case "DRAFT": return "متابعة المسودة";
    case "SUBMITTED": return "مراجعة / اعتماد";
    case "APPROVED": return "عرض التقييم";
    default: return "فتح";
  }
}

function EvaluationStatusBadge({ status }: { status: StaffEvaluationTask["status"] }) {
  const isApproved = status === "APPROVED";
  return (
    <span className={[
      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs whitespace-nowrap",
      isApproved
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "bg-background",
    ].join(" ")}>
      {isApproved ? <CheckCircle2 className="size-3.5" /> : null}
      {getEvaluationTaskStatusLabel(status)}
    </span>
  );
}

function StatusSummary({ group }: { group: PersonTaskGroup }) {
  const statuses = [
    group.pending ? { label: "لم يبدأ", value: group.pending } : null,
    group.draft ? { label: "مسودة", value: group.draft } : null,
    group.submitted ? { label: "مرسل", value: group.submitted } : null,
    group.approved ? { label: "معتمد", value: group.approved } : null,
  ].filter((item): item is { label: string; value: number } => item !== null);

  return <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
    {statuses.map((status) => <span key={status.label} className="rounded-md bg-muted px-2 py-1">{status.label} {status.value}</span>)}
  </div>;
}

function getPrimaryTask(tasks: StaffEvaluationTask[]) {
  return tasks.find((task) => task.status === "PENDING" || task.status === "DRAFT")
    ?? tasks.find((task) => task.status === "SUBMITTED")
    ?? tasks[0];
}

export function EvaluationTargetList({ groups, expandedPersonKey, onExpandedPersonChange }: EvaluationTargetListProps) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-4 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
        <span>الموظف</span><span>حالة التقييم</span><span>الإجراء</span>
      </div>
      <div className="divide-y">
        {groups.map((group) => {
          const isExpanded = expandedPersonKey === group.key;
          const primaryTask = getPrimaryTask(group.tasks);
          return (
            <div key={group.key} className="px-4 py-4 transition-colors hover:bg-muted/20">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{group.displayName}</h3>
                    {group.roleKey ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{group.roleKey}</span> : null}
                    {group.performanceImprovementStatus ? (
                      <Link href="/staff/performance-improvement" className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                        <AlertTriangle className="size-3" />
                        {group.performanceImprovementStatus === "PLAN_OPEN" ? "خطة تحسين نشطة" : "يحتاج مراجعة أداء"}
                      </Link>
                    ) : null}
                  </div>
                  {group.email ? <p className="mt-1 truncate text-xs text-muted-foreground">{group.email}</p> : null}
                </div>
                <StatusSummary group={group} />
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  {primaryTask ? <Button asChild size="sm"><Link href={primaryTask.actionHref}>{getActionLabel(primaryTask.status)}</Link></Button> : null}
                  <Button variant="ghost" size="sm" aria-expanded={isExpanded} onClick={() => onExpandedPersonChange(isExpanded ? null : group.key)}>
                    الدورات
                    <ChevronDown className={["size-4 transition-transform", isExpanded ? "rotate-180" : ""].join(" ")} />
                  </Button>
                </div>
              </div>
              {isExpanded ? (
                <div className="mt-4 overflow-hidden rounded-xl border bg-background">
                  <div className="divide-y">
                    {group.tasks.map((task) => (
                      <div key={task.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{task.cycleTitle}</div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{task.frameworkTitle} · الوزن {task.weight}%</div>
                        </div>
                        <EvaluationStatusBadge status={task.status} />
                        <Button asChild variant="outline" size="sm"><Link href={task.actionHref}>{getActionLabel(task.status)}</Link></Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
