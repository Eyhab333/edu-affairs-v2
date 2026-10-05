import type { EvaluationPlanGroup } from "./types";

type EvaluationPlanListProps = {
  plans: EvaluationPlanGroup[];
  selectedPlanId?: string | null;
  onSelect: (planId: string) => void;
};

const SCHOOL_TITLE_PREFIX = /^(?:روضة|مدرسة|مجمع|معهد|مكتب|إدارة)(?:\s|$)/;
const TERM_TITLE = /^(?:الفصل|الترم)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس)$/;

function getPlanTitlePresentation(title: string) {
  const parts = title
    .split(/\s[-–—]\s/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) return { displayTitle: title };

  const termTitle = parts.at(-1)!;
  const schoolTitle = parts.at(-2)!;
  const evaluationTitle = parts.slice(0, -2).join(" - ");

  if (
    !evaluationTitle ||
    !SCHOOL_TITLE_PREFIX.test(schoolTitle) ||
    !TERM_TITLE.test(termTitle)
  ) {
    return { displayTitle: title };
  }

  return {
    displayTitle: evaluationTitle,
    metadata: `${schoolTitle} · ${termTitle}`,
  };
}

export function EvaluationPlanList({
  plans,
  selectedPlanId,
  onSelect,
}: EvaluationPlanListProps) {
  return (
    <div className="space-y-1.5">
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;
        const remaining = plan.pending + plan.draft;
        const { displayTitle, metadata } = getPlanTitlePresentation(plan.title);

        return (
          <button
            key={plan.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(plan.id)}
            className={[
              "w-full rounded-xl border px-3 py-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-transparent hover:border-border hover:bg-muted/60",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-6 whitespace-normal break-words line-clamp-3">
                  {displayTitle}
                </div>
                {metadata ? (
                  <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {metadata}
                  </div>
                ) : null}
                {plan.frameworkTitle !== plan.title ? (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {plan.frameworkTitle}
                  </div>
                ) : null}
              </div>

              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {plan.people} موظفين
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {remaining > 0 ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  متبقي {remaining}
                </span>
              ) : null}
              {plan.submitted > 0 ? (
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">
                  مرسل {plan.submitted}
                </span>
              ) : null}
              {plan.approved > 0 ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                  معتمد {plan.approved}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
