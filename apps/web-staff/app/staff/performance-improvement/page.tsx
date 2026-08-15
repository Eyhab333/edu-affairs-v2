"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import type {
  PerformanceImprovementPlan,
  PerformanceImprovementSettings,
  PerformanceImprovementSignal,
} from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildPerformanceImprovementWorkspace,
  createPerformanceImprovementPlan,
  dismissPerformanceImprovementSignal,
  updatePerformanceImprovementPlan,
  updatePerformanceImprovementSettings,
  type PerformanceImprovementWorkspace,
} from "@/lib/performance-improvement";
import { canAccessPerformanceImprovement } from "@/lib/performance-improvement-access";

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "تعذر تنفيذ العملية";
}

function getPlanStatusLabel(status: PerformanceImprovementPlan["status"]) {
  switch (status) {
    case "ACTIVE":
      return "خطة نشطة";
    case "FOLLOW_UP":
      return "قيد المتابعة";
    case "CLOSED_IMPROVED":
      return "تحسن وأُغلقت";
    case "ESCALATED":
      return "تم التصعيد";
    case "CANCELLED":
      return "ملغاة";
    default:
      return "مسودة";
  }
}

function SummaryCard(props: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <div className="text-sm text-muted-foreground">{props.title}</div>
          <div className="mt-1 text-2xl font-bold">{props.value}</div>
        </div>
        <Icon className="size-6 text-primary" />
      </CardContent>
    </Card>
  );
}

function SignalCard(props: {
  signal: PerformanceImprovementSignal;
  schoolName: string;
  orgId: string;
  defaultTargetScore: number;
  defaultDurationDays: number;
  onChanged: () => Promise<void>;
}) {
  const { signal } = props;
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState(
    `رفع مستوى الأداء والوصول إلى ${signal.lowScoreThreshold}% أو أعلى.`,
  );
  const [actionsText, setActionsText] = useState(() => {
    if (signal.weakItems.length > 0) {
      return signal.weakItems
        .map((item) => `تحسين أداء: ${item.itemTitle}`)
        .join("\n");
    }

    return [
      "مراجعة ملاحظات التقييم مع الموظف",
      "تقديم دعم مهني مرتبط بالبُنود منخفضة الدرجة",
      "تنفيذ متابعة لقياس التحسن",
    ].join("\n");
  });
  const [targetScore, setTargetScore] = useState(props.defaultTargetScore);
  const [durationDays, setDurationDays] = useState(props.defaultDurationDays);
  const [dismissalNote, setDismissalNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const actions = actionsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (objective.trim().length < 3 || actions.length === 0) {
      toast.error("اكتب هدف الخطة وإجراءً واحدًا على الأقل.");
      return;
    }

    setSaving(true);
    try {
      await createPerformanceImprovementPlan({
        orgId: props.orgId,
        signalId: signal.id,
        objective: objective.trim(),
        actions,
        targetScore,
        durationDays,
      });
      toast.success("تم فتح خطة تحسين الأداء.");
      await props.onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDismiss() {
    if (dismissalNote.trim().length < 3) {
      toast.error("اكتب سبب استبعاد الحالة.");
      return;
    }

    setSaving(true);
    try {
      await dismissPerformanceImprovementSignal({
        orgId: props.orgId,
        signalId: signal.id,
        note: dismissalNote.trim(),
      });
      toast.success("تم استبعاد الحالة مع حفظ السبب.");
      await props.onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{signal.targetDisplayName ?? signal.targetPersonId}</CardTitle>
            <CardDescription className="mt-2">
              {props.schoolName}
              {signal.targetEmail ? ` · ${signal.targetEmail}` : ""}
            </CardDescription>
          </div>
          <Badge className="bg-amber-500 text-black">يحتاج مراجعة</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">متوسط المعتمد</div>
            <div className="mt-1 font-bold">
              {formatScore(signal.approvedAverageScore)}%
            </div>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">النتائج المنخفضة</div>
            <div className="mt-1 font-bold">{signal.lowCyclesCount}</div>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <div className="text-xs text-muted-foreground">البنود المتكررة</div>
            <div className="mt-1 font-bold">{signal.weakItems.length}</div>
          </div>
        </div>

        {signal.weakItems.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {signal.weakItems.map((item) => (
              <Badge key={item.itemId} variant="outline">
                {item.itemTitle} · {item.occurrenceCount} مرات
              </Badge>
            ))}
          </div>
        ) : null}

        <Button variant="outline" onClick={() => setEditing((value) => !value)}>
          {editing ? "إغلاق النموذج" : "مراجعة وفتح خطة"}
        </Button>

        {editing ? (
          <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">هدف الخطة</span>
              <textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                className="min-h-20 w-full rounded-xl border bg-background p-3"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">إجراءات الدعم — إجراء في كل سطر</span>
              <textarea
                value={actionsText}
                onChange={(event) => setActionsText(event.target.value)}
                className="min-h-28 w-full rounded-xl border bg-background p-3"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">الدرجة المستهدفة</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={targetScore}
                  onChange={(event) => setTargetScore(Number(event.target.value))}
                  className="h-11 w-full rounded-xl border bg-background px-3"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium">مدة الخطة بالأيام</span>
                <input
                  type="number"
                  min={7}
                  max={90}
                  value={durationDays}
                  onChange={(event) => setDurationDays(Number(event.target.value))}
                  className="h-11 w-full rounded-xl border bg-background px-3"
                />
              </label>
            </div>

            <Button disabled={saving} onClick={() => void handleCreate()}>
              <Target className="size-4" />
              اعتماد وفتح الخطة
            </Button>

            <div className="border-t pt-4">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">سبب استبعاد الحالة</span>
                <textarea
                  value={dismissalNote}
                  onChange={(event) => setDismissalNote(event.target.value)}
                  className="min-h-20 w-full rounded-xl border bg-background p-3"
                  placeholder="يُستخدم إذا كانت الحالة لا تحتاج خطة تحسين."
                />
              </label>
              <Button
                className="mt-3"
                variant="secondary"
                disabled={saving}
                onClick={() => void handleDismiss()}
              >
                استبعاد مع حفظ السبب
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SettingsCard(props: {
  orgId: string;
  schools: Array<{ id: string; name: string }>;
  settingsBySchoolId: Record<string, PerformanceImprovementSettings>;
  onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [schoolId, setSchoolId] = useState(props.schools[0]?.id ?? "");
  const selected = props.settingsBySchoolId[schoolId];
  const [lowScoreThreshold, setLowScoreThreshold] = useState(70);
  const [lowCycleCountThreshold, setLowCycleCountThreshold] = useState(2);
  const [weakItemPercentageThreshold, setWeakItemPercentageThreshold] =
    useState(40);
  const [weakItemOccurrenceThreshold, setWeakItemOccurrenceThreshold] =
    useState(3);
  const [defaultTargetScore, setDefaultTargetScore] = useState(70);
  const [defaultDurationDays, setDefaultDurationDays] = useState(28);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLowScoreThreshold(selected?.lowScoreThreshold ?? 70);
    setLowCycleCountThreshold(selected?.lowCycleCountThreshold ?? 2);
    setWeakItemPercentageThreshold(
      selected?.weakItemPercentageThreshold ?? 40,
    );
    setWeakItemOccurrenceThreshold(
      selected?.weakItemOccurrenceThreshold ?? 3,
    );
    setDefaultTargetScore(selected?.defaultTargetScore ?? 70);
    setDefaultDurationDays(selected?.defaultDurationDays ?? 28);
  }, [selected]);

  async function handleSave() {
    if (!schoolId) return;

    setSaving(true);
    try {
      await updatePerformanceImprovementSettings({
        orgId: props.orgId,
        schoolId,
        lowScoreThreshold,
        lowCycleCountThreshold,
        weakItemPercentageThreshold,
        weakItemOccurrenceThreshold,
        defaultTargetScore,
        defaultDurationDays,
      });
      toast.success("تم حفظ قواعد اكتشاف الأداء المنخفض.");
      await props.onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (props.schools.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5" /> قواعد الاكتشاف
            </CardTitle>
            <CardDescription className="mt-2">
              القيم قابلة للتعديل لكل مدرسة، وتُطبق عند اعتماد التقييم التالي.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "إخفاء الإعدادات" : "تعديل الإعدادات"}
          </Button>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">المدرسة</span>
            <select
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3"
            >
              {props.schools.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span>النتيجة المنخفضة أقل من</span>
              <input type="number" min={0} max={100} value={lowScoreThreshold} onChange={(event) => setLowScoreThreshold(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-2 text-sm">
              <span>عدد النتائج المنخفضة</span>
              <input type="number" min={1} value={lowCycleCountThreshold} onChange={(event) => setLowCycleCountThreshold(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-2 text-sm">
              <span>نسبة ضعف البند</span>
              <input type="number" min={0} max={100} value={weakItemPercentageThreshold} onChange={(event) => setWeakItemPercentageThreshold(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-2 text-sm">
              <span>مرات تكرار ضعف البند</span>
              <input type="number" min={1} value={weakItemOccurrenceThreshold} onChange={(event) => setWeakItemOccurrenceThreshold(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-2 text-sm">
              <span>الهدف الافتراضي للخطة</span>
              <input type="number" min={0} max={100} value={defaultTargetScore} onChange={(event) => setDefaultTargetScore(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
            <label className="space-y-2 text-sm">
              <span>مدة الخطة الافتراضية</span>
              <input type="number" min={7} max={90} value={defaultDurationDays} onChange={(event) => setDefaultDurationDays(Number(event.target.value))} className="h-11 w-full rounded-xl border bg-background px-3" />
            </label>
          </div>

          <Button disabled={saving} onClick={() => void handleSave()}>
            حفظ قواعد المدرسة
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

function PlanCard(props: {
  plan: PerformanceImprovementPlan;
  schoolName: string;
  orgId: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const { plan } = props;
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const isOpen = plan.status === "ACTIVE" || plan.status === "FOLLOW_UP";
  const latestFollowUp = plan.followUps[plan.followUps.length - 1];

  async function mutate(params: {
    mutation:
      | "COMPLETE_ACTION"
      | "RECORD_FOLLOW_UP"
      | "CLOSE_IMPROVED"
      | "ESCALATE";
    actionId?: string;
    score?: number;
    note?: string;
  }) {
    setSaving(true);
    try {
      await updatePerformanceImprovementPlan({
        orgId: props.orgId,
        planId: plan.id,
        ...params,
      });
      toast.success("تم تحديث خطة التحسين.");
      setScore("");
      setNote("");
      await props.onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{plan.targetDisplayName ?? plan.targetPersonId}</CardTitle>
            <CardDescription className="mt-2">
              {props.schoolName} · من {formatDate(plan.startsAt)} إلى {formatDate(plan.endsAt)}
            </CardDescription>
          </div>
          <Badge
            variant={plan.status === "ESCALATED" ? "destructive" : "secondary"}
          >
            {getPlanStatusLabel(plan.status)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="text-sm font-medium">هدف الخطة</div>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {plan.objective}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">الخط الأساسي {formatScore(plan.baselineScore)}%</Badge>
            <Badge variant="outline">المستهدف {formatScore(plan.targetScore)}%</Badge>
            {latestFollowUp ? (
              <Badge variant="outline">
                آخر متابعة {formatScore(latestFollowUp.score)}%
              </Badge>
            ) : null}
          </div>
        </div>

        <div>
          <h3 className="font-bold">إجراءات الدعم</h3>
          <div className="mt-3 space-y-2">
            {plan.actions.map((action) => (
              <div
                key={action.id}
                className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2 text-sm">
                  {action.status === "COMPLETED" ? (
                    <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
                  ) : (
                    <ClipboardCheck className="mt-0.5 size-4 text-muted-foreground" />
                  )}
                  <span>{action.title}</span>
                </div>
                {props.canManage && isOpen && action.status === "PENDING" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      void mutate({
                        mutation: "COMPLETE_ACTION",
                        actionId: action.id,
                      })
                    }
                  >
                    تم التنفيذ
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {plan.followUps.length > 0 ? (
          <div>
            <h3 className="font-bold">سجل المتابعة</h3>
            <div className="mt-3 space-y-2">
              {plan.followUps.map((followUp) => (
                <div key={followUp.id} className="rounded-xl border p-3 text-sm">
                  <div className="font-bold">
                    {formatScore(followUp.score)}% · {formatDate(followUp.recordedAt)}
                  </div>
                  <p className="mt-1 text-muted-foreground">{followUp.note}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {props.canManage && isOpen ? (
          <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
            <h3 className="font-bold">تسجيل المتابعة والقرار</h3>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                className="h-11 rounded-xl border bg-background px-3"
                placeholder="الدرجة من 100"
              />
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-20 rounded-xl border bg-background p-3"
                placeholder="ملاحظات المتابعة أو سبب التصعيد"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={saving || score === "" || note.trim().length < 1}
                onClick={() =>
                  void mutate({
                    mutation: "RECORD_FOLLOW_UP",
                    score: Number(score),
                    note: note.trim(),
                  })
                }
              >
                تسجيل متابعة
              </Button>
              <Button
                variant="outline"
                disabled={
                  saving ||
                  !latestFollowUp ||
                  latestFollowUp.score < plan.targetScore
                }
                onClick={() =>
                  void mutate({
                    mutation: "CLOSE_IMPROVED",
                    note: note.trim() || "تم تحقيق الدرجة المستهدفة.",
                  })
                }
              >
                إغلاق بعد التحسن
              </Button>
              <Button
                variant="destructive"
                disabled={saving || note.trim().length < 3}
                onClick={() =>
                  void mutate({
                    mutation: "ESCALATE",
                    note: note.trim(),
                  })
                }
              >
                <ArrowUpRight className="size-4" />
                تصعيد
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function PerformanceImprovementPage() {
  const { actor } = useStaffActor();
  const [workspace, setWorkspace] = useState<PerformanceImprovementWorkspace | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = canAccessPerformanceImprovement(actor);
  const schoolIds = useMemo(
    () => actor.schools.map((school) => school.id).filter(Boolean),
    [actor.schools],
  );
  const schoolNames = useMemo(
    () => new Map(actor.schools.map((school) => [school.id, school.name])),
    [actor.schools],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await buildPerformanceImprovementWorkspace({
        orgId: actor.orgId,
        personId: actor.personId,
        schoolIds,
        canManage,
      });
      setWorkspace(result);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actor.orgId, actor.personId, canManage, schoolIds]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <Card><CardContent className="pt-5">جاري تحميل خطط تحسين الأداء...</CardContent></Card>
      </main>
    );
  }

  if (error || !workspace) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <Card className="border-destructive/40">
          <CardHeader><CardTitle>تعذر تحميل خطط تحسين الأداء</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => void loadWorkspace()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const pendingSignals = workspace.signals.filter(
    (signal) => signal.status === "NEEDS_REVIEW",
  );

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">خطط تحسين الأداء</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {canManage
                ? "راجع الحالات المقترحة، افتح خطة دعم، ثم سجّل المتابعة والإغلاق أو التصعيد."
                : "اعرض خطة الدعم والمتابعة المرتبطة بأدائك."}
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadWorkspace()}>
            <RefreshCw className="size-4" /> تحديث
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="تحتاج مراجعة" value={workspace.pendingSignalsCount} icon={AlertTriangle} />
        <SummaryCard title="خطط نشطة" value={workspace.activePlansCount} icon={Target} />
        <SummaryCard title="تحسنت وأُغلقت" value={workspace.completedPlansCount} icon={CheckCircle2} />
        <SummaryCard title="تم تصعيدها" value={workspace.escalatedPlansCount} icon={ShieldAlert} />
      </section>

      {canManage ? (
        <SettingsCard
          orgId={actor.orgId}
          schools={actor.schools.map((school) => ({
            id: school.id,
            name: school.name ?? school.id,
          }))}
          settingsBySchoolId={workspace.settingsBySchoolId}
          onChanged={loadWorkspace}
        />
      ) : null}

      {canManage ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">حالات مقترحة للمراجعة</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الاقتراح آلي، وفتح الخطة أو استبعادها قرار إداري موثق.
            </p>
          </div>
          {pendingSignals.length === 0 ? (
            <Card><CardContent className="pt-5 text-sm text-muted-foreground">لا توجد حالات جديدة تحتاج مراجعة.</CardContent></Card>
          ) : (
            pendingSignals.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                schoolName={schoolNames.get(signal.schoolId) ?? signal.schoolId}
                orgId={actor.orgId}
                defaultTargetScore={
                  workspace.settingsBySchoolId[signal.schoolId]
                    ?.defaultTargetScore ?? 70
                }
                defaultDurationDays={
                  workspace.settingsBySchoolId[signal.schoolId]
                    ?.defaultDurationDays ?? 28
                }
                onChanged={loadWorkspace}
              />
            ))
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">
            {canManage ? "خطط التحسين" : "خطتي"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            التقييمات الأصلية تظل ثابتة؛ هذه الصفحة تسجل الدعم والنتائج اللاحقة فقط.
          </p>
        </div>
        {workspace.plans.length === 0 ? (
          <Card><CardContent className="pt-5 text-sm text-muted-foreground">لا توجد خطط تحسين أداء حاليًا.</CardContent></Card>
        ) : (
          workspace.plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              schoolName={schoolNames.get(plan.schoolId) ?? plan.schoolId}
              orgId={actor.orgId}
              canManage={canManage}
              onChanged={loadWorkspace}
            />
          ))
        )}
      </section>
    </main>
  );
}
