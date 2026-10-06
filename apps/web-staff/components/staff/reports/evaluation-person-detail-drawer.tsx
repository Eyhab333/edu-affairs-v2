"use client";

import { X } from "lucide-react";
import type { EvaluationReportPersonDetail } from "@takween/contracts";

import { getArabicRoleLabel } from "@/lib/role-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  open: boolean;
  detail: EvaluationReportPersonDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
};

const statusLabels: Record<string, string> = {
  PENDING: "لم يبدأ / معلّق",
  DRAFT: "مسودة",
  SUBMITTED: "مرسل",
  UNDER_REVIEW: "قيد المراجعة",
  RETURNED: "معاد",
  APPROVED: "معتمد",
  LOCKED: "مقفل",
  CANCELLED: "ملغى",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["APPROVED", "LOCKED"].includes(status)) return "default";
  if (["RETURNED", "CANCELLED"].includes(status)) return "destructive";
  if (["SUBMITTED", "UNDER_REVIEW", "DRAFT"].includes(status)) return "secondary";
  return "outline";
}

function percentage(value: number | undefined) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("ar-SA", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value / 100);
}

function date(value: number | undefined) {
  return value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

function approvedAverage(
  cycles: Array<{ includedInAverage: boolean; finalScore?: number }>,
) {
  const scores = cycles.flatMap((cycle) =>
    cycle.includedInAverage && typeof cycle.finalScore === "number"
      ? [cycle.finalScore]
      : [],
  );

  return scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : undefined;
}

export default function EvaluationPersonDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
}: Props) {
  if (!open) return null;

  const approvedPlans =
    detail?.plans
      .map((plan) => ({
        ...plan,
        cycles: plan.cycles.filter((cycle) => cycle.status === "APPROVED"),
      }))
      .filter((plan) => plan.cycles.length > 0) ?? [];
  const approvedCycles = approvedPlans.flatMap((plan) => plan.cycles);
  const approvedAverageScore = approvedAverage(approvedCycles);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="تفاصيل تقييمات الموظف">
      <button
        type="button"
        aria-label="إغلاق التفاصيل"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside dir="rtl" className="absolute inset-y-0 left-0 flex w-full max-w-3xl flex-col border-r bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-sm text-muted-foreground">تفاصيل تقييمات الموظف</p>
            <h2 className="mt-1 text-xl font-bold">
              {detail?.employee.displayName || "جارٍ تحميل التفاصيل"}
            </h2>
            {detail ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.employee.roleKeys.map(getArabicRoleLabel).join(" • ") || "بدون دور"}
                {detail.employee.schoolNames.length ? ` • ${detail.employee.schoolNames.join(" • ")}` : ""}
              </p>
            ) : null}
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-56 animate-pulse rounded-2xl bg-muted" />
              <div className="h-56 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && !error && detail ? (
            <div className="space-y-5">
              <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">متوسط التقييم المعتمد</p>
                  <p className="mt-1 text-xl font-bold">{percentage(approvedAverageScore)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">التقييمات المعتمدة</p>
                  <p className="mt-1 text-xl font-bold">
                    {approvedCycles.length.toLocaleString("ar-SA")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الخطط ذات تقييمات معتمدة</p>
                  <p className="mt-1 text-xl font-bold">{approvedPlans.length.toLocaleString("ar-SA")}</p>
                </div>
              </section>

              {approvedPlans.length === 0 ? (
                <section className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  لا توجد تقييمات معتمدة لهذا الموظف
                </section>
              ) : (
                approvedPlans.map((plan) => (
                <section key={plan.planId} className="overflow-hidden rounded-2xl border bg-card">
                  <div className="border-b p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{plan.planTitle}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {plan.schoolName} • {plan.planKind || plan.frameworkKind || "تقييم"}
                          {plan.targetRoleKey ? ` • ${getArabicRoleLabel(plan.targetRoleKey)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>التقييمات المعتمدة: {plan.cycles.length.toLocaleString("ar-SA")}</span>
                      <span>المتوسط المعتمد: {percentage(approvedAverage(plan.cycles))}</span>
                    </div>
                  </div>

                  <div className="divide-y">
                    {plan.cycles.map((cycle) => (
                      <article key={cycle.cycleId} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{cycle.cycleTitle}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {cycle.cycleKind || "دورة"}
                              {cycle.cycleNumber !== undefined ? ` • الترتيب ${cycle.cycleNumber.toLocaleString("ar-SA")}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {cycle.includedInAverage ? null : <Badge variant="outline">غير مشمول بالمتوسط</Badge>}
                            <Badge variant={statusVariant(cycle.status)}>
                              {statusLabels[cycle.status] || cycle.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div>
                            المقيّم: {cycle.evaluators.length
                              ? cycle.evaluators.map((evaluator) => `${evaluator.displayName}${evaluator.roleKey ? ` (${getArabicRoleLabel(evaluator.roleKey)})` : ""}`).join(" • ")
                              : "لم يُسند مقيّم"}
                          </div>
                          <div>النتيجة النهائية: <span className="font-medium text-foreground">{percentage(cycle.finalScore)}</span></div>
                          <div>الإرسال: {date(cycle.submittedAt)}</div>
                          <div>الاعتماد: {date(cycle.approvedAt)}</div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
                ))
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
