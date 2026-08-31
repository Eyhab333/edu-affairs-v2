"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, ChevronDown, Loader2 } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import type { VisibleStudentClass } from "@/hooks/use-visible-students";
import {
  loadStudentWorkDetail,
  studentWorkModuleLabels,
  studentWorkModuleOrder,
  type StudentWorkDrillDownItem,
  type StudentWorkDrillDowns,
  type StudentWorkModuleKey,
  type StudentWorkPeriod,
  type StudentWorkSummary,
} from "@/lib/student-work";

type StaffActorLike = { orgId: string; visibleClasses: VisibleStudentClass[] };

const periods: Array<{ value: StudentWorkPeriod; label: string }> = [
  { value: "WEEK", label: "هذا الأسبوع" },
  { value: "MONTH", label: "هذا الشهر" },
  { value: "ALL", label: "الكل" },
];

const emptyDrillDowns: StudentWorkDrillDowns = {
  attendance: [], measurements: [], learningLoss: [], homework: [], gamification: [], notes: [],
};

function classKey(params: { schoolId: string; academicYearId: string; classId: string }) {
  return `${params.schoolId}::${params.academicYearId}::${params.classId}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تحميل ملف الطالب.";
}

function formatDate(value: number | null) {
  return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value)) : "لا يوجد نشاط مسجل";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "نشط", RECORDED: "مسجل", PUBLISHED: "منشور", SUBMITTED: "مرسل", GRADED: "مصَحح",
    NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", CLOSED: "مغلق", CANCELLED: "ملغى",
    PRESENT: "حاضر", ABSENT: "غائب", EXCUSED_ABSENT: "غائب بعذر", LATE: "متأخر",
    REMOTE_PRESENT: "حاضر عن بعد", REMOTE_ABSENT: "غائب عن بعد", NEEDS_FOLLOW_UP: "تحتاج متابعة",
  };
  return labels[status] || status || "مسجل";
}

function moduleCount(params: { key: StudentWorkModuleKey; student: StudentWorkSummary; drillDowns: StudentWorkDrillDowns }) {
  if (params.key === "homework" || params.key === "notes") return params.drillDowns[params.key].length;
  return params.student.metrics[params.key].count;
}

function ModuleDrillDown({ items }: { items: StudentWorkDrillDownItem[] }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد سجلات ضمن الفترة المحددة.</div>;
  return <AccordionRecords items={items} />;
}

function AccordionRecords({ items }: { items: StudentWorkDrillDownItem[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenIds(new Set());
  }, [items]);

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return <div className="space-y-3">{items.map((item) => {
    const isOpen = openIds.has(item.id);
    return <article key={item.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={() => toggle(item.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-4 text-right transition hover:bg-muted/40">
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-foreground">{item.title}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{statusLabel(item.status)}</span></div>{item.summary.length ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.summary.join(" • ")}</p> : null}</div>
        <p className="shrink-0 text-xs text-muted-foreground">{formatDate(item.activityAt)}</p>
      </button>
      {isOpen ? <div className="border-t bg-muted/20 p-4"><div className="grid gap-3 text-sm sm:grid-cols-2">{item.details.map((detail) => <div key={`${item.id}:${detail.label}`} className="rounded-xl border bg-card p-3"><p className="text-xs font-semibold text-muted-foreground">{detail.label}</p><p className="mt-2 whitespace-pre-wrap leading-6 text-foreground">{detail.value}</p></div>)}</div></div> : null}
    </article>;
  })}</div>;
}

export default function StaffStudentProfilePage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike;
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const studentId = decodeURIComponent(params.studentId || "");
  const schoolId = searchParams.get("schoolId")?.trim() || "";
  const academicYearId = searchParams.get("academicYearId")?.trim() || "";
  const classId = searchParams.get("classId")?.trim() || "";
  const hasContext = !!studentId && !!schoolId && !!academicYearId && !!classId;
  const [period, setPeriod] = useState<StudentWorkPeriod>("MONTH");
  const [student, setStudent] = useState<StudentWorkSummary | null>(null);
  const [drillDowns, setDrillDowns] = useState<StudentWorkDrillDowns>(emptyDrillDowns);
  const [selectedModule, setSelectedModule] = useState<StudentWorkModuleKey>("attendance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    if (!hasContext) { setLoading(false); return; }
    const requestId = ++latestRequestId.current;
    setLoading(true); setError(null);
    try {
      const result = await loadStudentWorkDetail({ orgId: staffActor.orgId, studentId, schoolId, academicYearId, classId, period });
      if (requestId !== latestRequestId.current) return;
      setStudent(result?.student ?? null);
      setDrillDowns(result?.drillDowns ?? emptyDrillDowns);
    } catch (nextError) {
      if (requestId !== latestRequestId.current) return;
      setError(errorMessage(nextError));
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, [academicYearId, classId, hasContext, period, schoolId, staffActor.orgId, studentId]);

  useEffect(() => { void load(); }, [load]);

  const classInfo = useMemo(() => staffActor.visibleClasses.find((item) => classKey({ schoolId: item.schoolId ?? "", academicYearId: item.academicYearId ?? "", classId: item.id }) === classKey({ schoolId, academicYearId, classId })), [academicYearId, classId, schoolId, staffActor.visibleClasses]);
  const identity = [classInfo?.schoolName || schoolId, classInfo?.gradeTitle || student?.gradeId, classInfo?.title || classInfo?.code || classId, classInfo?.academicYearTitle || academicYearId].filter(Boolean).join(" • ");

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
      <div><Button asChild variant="ghost" size="sm"><Link href="/staff/students"><ArrowRight className="size-4" />العودة إلى الطلاب</Link></Button></div>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">ملف الطالب 360</p><h1 className="mt-1 text-2xl font-bold">{student?.displayName || "ملف الطالب"}</h1>{identity ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{identity}</p> : null}</div><div className="inline-flex w-fit rounded-xl bg-muted p-1">{periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-lg px-3 py-2 text-sm transition ${period === item.value ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>)}</div></section>
      {error ? <section className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>إعادة المحاولة</Button></section> : null}
      {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل ملف الطالب…</div> : null}
      {!loading && !error && (!hasContext || !student) ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">الطالب غير ظاهر ضمن فصل نشط ومصرح لك.</div> : null}
      {!loading && student ? <section className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]"><aside className="rounded-2xl border bg-card p-3 shadow-sm lg:sticky lg:top-6 lg:h-fit"><p className="px-3 pb-2 pt-1 text-xs font-semibold text-muted-foreground">سجل الطالب</p><nav className="hidden space-y-1 lg:block">{studentWorkModuleOrder.map((key) => <button key={key} type="button" onClick={() => setSelectedModule(key)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-right text-sm transition ${selectedModule === key ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}><span>{studentWorkModuleLabels[key]}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${selectedModule === key ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{moduleCount({ key, student, drillDowns }).toLocaleString("ar-SA")}</span></button>)}</nav><div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">{studentWorkModuleOrder.map((key) => <button key={key} type="button" onClick={() => setSelectedModule(key)} className={`shrink-0 rounded-xl px-3 py-2 text-sm transition ${selectedModule === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{studentWorkModuleLabels[key]} <span className="mr-1 text-xs opacity-80">{moduleCount({ key, student, drillDowns }).toLocaleString("ar-SA")}</span></button>)}</div></aside><div className="min-w-0"><div className="mb-4 flex items-center gap-2"><BookOpen className="size-5 text-primary" /><h2 className="text-lg font-bold text-foreground">{studentWorkModuleLabels[selectedModule]}</h2></div><ModuleDrillDown key={selectedModule} items={drillDowns[selectedModule]} /></div></section> : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />العرض للقراءة فقط ولا يتضمن أي إجراءات تعديل.</p>
    </main>
  );
}
