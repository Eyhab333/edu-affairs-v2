"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { canAccessTeacherWork } from "@/lib/teacher-work-access";
import {
  loadTeacherWorkSummary,
  teacherWorkMetricLabels,
  teacherWorkMetricOrder,
  type TeacherWorkMetric,
  type TeacherWorkPeriod,
  type TeacherWorkSummary,
} from "@/lib/teacher-work";

const periods: Array<{ value: TeacherWorkPeriod; label: string }> = [
  { value: "WEEK", label: "هذا الأسبوع" },
  { value: "MONTH", label: "هذا الشهر" },
  { value: "ALL", label: "الكل" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تحميل أعمال المعلم.";
}

function formatDate(value: number | null) {
  if (!value) return "لا يوجد نشاط مسجل";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

function MetricCard({ metricKey, metric }: { metricKey: keyof typeof teacherWorkMetricLabels; metric: TeacherWorkMetric }) {
  const rows: Array<[string, number | undefined]> = [];
  if (metricKey === "measurements") rows.push(["دفعات مرسلة", metric.submittedCount]);
  if (metricKey === "learningLoss") rows.push(["نشطة", metric.activeCount], ["مغلقة", metric.closedCount]);
  if (metricKey === "notes" || metricKey === "gamification") rows.push(["طلاب متأثرون", metric.uniqueStudents]);
  if (metricKey === "homework") rows.push(["مسودات", metric.draftCount], ["منشورة", metric.publishedCount], ["مغلقة", metric.closedCount]);
  if (metricKey === "lessonPrep") rows.push(["مسودات", metric.draftCount], ["مرسلة", metric.submittedCount], ["معتمدة", metric.approvedCount], ["معادة", metric.returnedCount]);

  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-foreground">{teacherWorkMetricLabels[metricKey]}</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">{metric.count.toLocaleString("ar-SA")}</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">آخر نشاط: {formatDate(metric.latestActivityAt)}</p>
      {rows.filter(([, value]) => value !== undefined).length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {rows.filter(([, value]) => value !== undefined).map(([label, value]) => <span key={label} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{label}: {value?.toLocaleString("ar-SA")}</span>)}
        </div>
      ) : null}
      {metric.classLabels.length || metric.subjectLabels.length ? (
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          {[...metric.subjectLabels, ...metric.classLabels].slice(0, 5).join(" • ")}
        </p>
      ) : null}
    </article>
  );
}

export default function TeacherWorkDetailPage() {
  const { actor } = useStaffActor();
  const params = useParams<{ teacherPersonId: string }>();
  const teacherPersonId = decodeURIComponent(params.teacherPersonId || "");
  const [period, setPeriod] = useState<TeacherWorkPeriod>("MONTH");
  const [teacher, setTeacher] = useState<TeacherWorkSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canAccess = canAccessTeacherWork(actor);

  const load = useCallback(async () => {
    if (!canAccess || !teacherPersonId) return;
    setLoading(true);
    setError(null);
    try {
      setTeacher(
        await loadTeacherWorkSummary({
          orgId: actor.orgId,
          academicYearId: actor.currentTerm?.academicYearId,
          teacherPersonId,
          period,
        }),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [actor, canAccess, period, teacherPersonId]);

  useEffect(() => {
    if (canAccess) void load();
    else setLoading(false);
  }, [canAccess, load]);

  const identity = useMemo(() => [
    ...(teacher?.schoolNames ?? []),
    ...(teacher?.subjectLabels ?? []),
    ...(teacher?.classLabels ?? []),
  ].filter(Boolean).join(" • "), [teacher]);

  if (!canAccess) return null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
      <div><Button asChild variant="ghost" size="sm"><Link href="/staff/teacher-work"><ArrowRight className="size-4" />العودة إلى المعلمين</Link></Button></div>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">متابعة أعمال المعلمين</p>
          <h1 className="mt-1 text-2xl font-bold">{teacher?.displayName || "أعمال المعلم"}</h1>
          {identity ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{identity}</p> : null}
        </div>
        <div className="inline-flex w-fit rounded-xl bg-muted p-1">
          {periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-lg px-3 py-2 text-sm transition ${period === item.value ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>)}
        </div>
      </section>

      {error ? <section className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>إعادة المحاولة</Button></section> : null}
      {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل الأعمال…</div> : null}
      {!loading && !error && !teacher ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لم يتم العثور على معلم نشط ضمن نطاقك.</div> : null}
      {!loading && teacher ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{teacherWorkMetricOrder.map((key) => <MetricCard key={key} metricKey={key} metric={teacher.metrics[key]} />)}</section> : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />المؤشرات للعرض والمتابعة فقط؛ لا تتضمن أي إجراءات اعتماد أو تعديل.</p>
    </main>
  );
}
