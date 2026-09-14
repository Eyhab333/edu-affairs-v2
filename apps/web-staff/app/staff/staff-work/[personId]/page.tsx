"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ExternalLink, Loader2 } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { WorkDocumentationReadOnly } from "@/components/work-documentation/work-documentation-read-only";
import { Button } from "@/components/ui/button";
import {
  loadStaffWorkDetail,
  staffWorkMetricLabels,
  staffWorkMetricOrder,
  type StaffWorkActivity,
  type StaffWorkMetricKey,
  type StaffWorkPeriod,
  type StaffWorkSummary,
} from "@/lib/staff-work";

const periods: Array<{ value: StaffWorkPeriod; label: string }> = [
  { value: "WEEK", label: "هذا الأسبوع" },
  { value: "MONTH", label: "هذا الشهر" },
  { value: "ALL", label: "الكل" },
];

function formatDate(value: number | null) {
  return value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "غير محدد";
}

function safeText(value: string, fallback = "غير محدد") {
  return value.trim() || fallback;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "مسودة",
    SUBMITTED: "مرسل",
    APPROVED: "معتمد",
    RETURNED: "معاد للتعديل",
    ACTIVE: "نشطة",
    FOLLOW_UP: "قيد المتابعة",
    CLOSED_IMPROVED: "مغلقة بتحسن",
    ESCALATED: "مُصعّدة",
    CANCELLED: "ملغاة",
    OPEN: "مفتوحة",
    RESOLVED: "تم الحل",
    CLOSED: "مغلقة",
    PENDING: "قيد الانتظار",
    COMPLETED: "مكتمل",
    LOCKED: "مقفل",
  };
  return labels[status] || safeText(status, "مسجل");
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    CREATED: "إنشاء",
    REFERRED: "إحالة",
    ACTION_ADDED: "إضافة إجراء",
    PARENT_CONTACTED: "تواصل مع ولي الأمر",
    TRANSFERRED: "تحويل",
    ESCALATED: "تصعيد",
    RETURNED: "إعادة",
    RESOLVED: "حل",
    CLOSED: "إغلاق",
    REOPENED: "إعادة فتح",
    CANCELLED: "إلغاء",
  };
  return labels[eventType] || safeText(eventType);
}

function Fields({ fields }: { fields: Array<[string, ReactNode]> }) {
  return (
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <p key={label} className="min-w-0">
          <span className="text-muted-foreground">{label}: </span>
          <span className="break-words text-foreground">{value}</span>
        </p>
      ))}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
        {children}
      </div>
    </section>
  );
}

function ActivityDetails({ activity, orgId, staffPersonId }: { activity: StaffWorkActivity; orgId: string; staffPersonId: string }) {
  if (!activity.details) {
    const fields: Array<[string, ReactNode]> = [
      ["نوع النشاط", staffWorkMetricLabels[activity.metricKey]],
      ["العنوان", safeText(activity.title)],
      ["المستهدف", safeText(activity.targetName)],
      ["الفصل", safeText(activity.classLabel)],
      ["المدرسة", safeText(activity.schoolId)],
      ["الحالة", activity.status ? statusLabel(activity.status) : "غير محددة"],
      ["التاريخ", formatDate(activity.activityAt)],
      ["الوصف", safeText(activity.description)],
    ];

    return (
      <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 dark:bg-primary/5">
        <h3 className="font-bold text-foreground">تفاصيل النشاط</h3>
        <p className="mt-1 text-xs text-muted-foreground">عرض للقراءة فقط</p>
        <Fields fields={fields} />
      </section>
    );
  }

  const content = (() => {
    switch (activity.details.kind) {
      case "EVALUATION": {
        const details = activity.details;
        return (
          <>
            <Fields
              fields={[
                ["الإجراء", details.action === "APPROVED" ? "اعتماد تقييم" : "إرسال تقييم"],
                ["التقييم", safeText(details.evaluationTitle)],
                ["الموظف المقيم", safeText(details.targetName)],
                ["الحالة", statusLabel(details.status)],
                ["تاريخ الإرسال", formatDate(details.submittedAt)],
                ["تاريخ الاعتماد", formatDate(details.approvedAt)],
                ["الدرجة", details.totalScore === null ? "غير محددة" : `${details.totalScore.toLocaleString("ar-SA")} / ${details.maxScore?.toLocaleString("ar-SA") ?? "—"}`],
                ["النسبة", details.percentage === null ? "غير محددة" : `${details.percentage.toLocaleString("ar-SA")}%`],
              ]}
            />
            {details.criteria.length ? (
              <Section label="نتائج المعايير">
                <div className="space-y-2">
                  {details.criteria.map((criterion, index) => (
                    <div key={`${criterion.title}-${index}`} className="rounded-lg bg-muted/60 p-2.5">
                      <p className="font-medium">{safeText(criterion.title, safeText(criterion.category, "معيار"))}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {criterion.score === null
                          ? safeText(criterion.valueText || criterion.level)
                          : `${criterion.score.toLocaleString("ar-SA")} / ${criterion.maxScore?.toLocaleString("ar-SA") ?? "—"}`}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}
          </>
        );
      }
      case "PERFORMANCE_IMPROVEMENT": {
        const details = activity.details;
        return (
          <>
            <Fields fields={[["الموظف", safeText(details.targetName)], ["الحالة", statusLabel(details.status)], ["تاريخ الإنشاء", formatDate(details.createdAt)], ["بداية الخطة", formatDate(details.startsAt)], ["نهاية الخطة", formatDate(details.endsAt)], ["تاريخ الإغلاق", formatDate(details.closedAt)], ["تاريخ التصعيد", formatDate(details.escalatedAt)]]} />
            <Section label="هدف الخطة">{safeText(details.objective, "لا توجد تفاصيل إضافية مسجلة.")}</Section>
            {details.actions.length ? <Section label="إجراءات الخطة"><div className="space-y-2">{details.actions.map((action, index) => <div key={`${action.title}-${index}`} className="rounded-lg bg-muted/60 p-2.5"><p className="font-medium">{safeText(action.title, "إجراء")}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabel(action.status)} • الاستحقاق: {formatDate(action.dueAt)} • الإنجاز: {formatDate(action.completedAt)}</p></div>)}</div></Section> : null}
            {details.followUps.length ? <Section label="المتابعات"><div className="space-y-2">{details.followUps.map((followUp, index) => <div key={`${followUp.recordedAt}-${index}`} className="rounded-lg bg-muted/60 p-2.5"><p>النتيجة: {followUp.score?.toLocaleString("ar-SA") ?? "غير محددة"}</p><p className="text-xs text-muted-foreground">{formatDate(followUp.recordedAt)}</p>{followUp.note ? <p className="mt-1">{followUp.note}</p> : null}</div>)}</div></Section> : null}
            {details.closureNote ? <Section label="ملاحظة الإغلاق">{details.closureNote}</Section> : null}
            {details.escalationReason ? <Section label="سبب التصعيد">{details.escalationReason}</Section> : null}
          </>
        );
      }
      case "STUDENT_CASE": {
        const details = activity.details;
        return <Fields fields={[["الطالب", safeText(details.studentDisplayName)], ["الفصل", safeText(details.classLabel)], ["الإجراء", eventLabel(details.eventType)], ["الحالة", statusLabel(details.status)], ["الحالة السابقة", details.statusBefore ? statusLabel(details.statusBefore) : "غير محددة"], ["الحالة اللاحقة", details.statusAfter ? statusLabel(details.statusAfter) : "غير محددة"], ["التاريخ", formatDate(details.occurredAt)]]} />;
      }
      case "ATTENDANCE": {
        const details = activity.details;
        const counts = details.counts;
        const countRows: Array<[string, number | null]> = [["المستهدف", counts.target], ["المكتمل", counts.completed], ["غير المكتمل", counts.missing], ["حاضر", counts.present], ["غائب", counts.absent], ["متأخر", counts.late], ["تأخر بعذر", counts.excusedLate], ["غياب بعذر", counts.excusedAbsent], ["انصراف مبكر", counts.leftEarly], ["موقوف دراسياً", counts.studySuspended], ["غير مسجل", counts.notRecorded]];
        return <><Fields fields={[["الفصل", safeText(details.classLabel)], ["يوم المدرسة", safeText(details.schoolDayId)], ["الحالة", statusLabel(details.status)], ["تاريخ التسجيل", formatDate(details.recordedAt)], ["تاريخ الإرسال", formatDate(details.submittedAt)]]} /><Section label="ملخص الحضور"><div className="flex flex-wrap gap-2">{countRows.map(([label, count]) => <span key={label} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{label}: {count === null ? "غير محدد" : count.toLocaleString("ar-SA")}</span>)}</div></Section></>;
      }
      case "LESSON_PREP_REVIEW": {
        const details = activity.details;
        return <><Fields fields={[["إجراء المراجع", details.action === "APPROVED" ? "اعتماد التحضير" : "إعادة التحضير للتعديل"], ["المعلم", safeText(details.teacherName)], ["عنوان الدرس", safeText(details.lessonTitle)], ["المادة", safeText(details.subjectLabel)], ["الفصل", safeText(details.classLabel)], ["تاريخ الدرس", safeText(details.lessonDate)], ["الحالة", statusLabel(details.status)], ["تاريخ الاعتماد", formatDate(details.approvedAt)], ["تاريخ الإعادة", formatDate(details.returnedAt)]]} />{details.reviewNote ? <Section label={details.action === "APPROVED" ? "ملاحظة الاعتماد" : "سبب الإعادة"}>{details.reviewNote}</Section> : null}</>;
      }
      case "WORK_DOCUMENTATION": {
        const details = activity.details;
        return <><Fields fields={[["نموذج التوثيق", safeText(details.templateTitle || details.templateKey)], ["رمز النموذج", safeText(details.templateKey)], ["نمط السجل", details.instanceMode === "MULTIPLE" ? "متعدد" : "مفرد"], ["تاريخ الإنشاء", formatDate(details.createdAt)], ["آخر تحديث", formatDate(details.updatedAt)]]} /><WorkDocumentationReadOnly orgId={orgId} staffPersonId={staffPersonId} sourceEntityId={activity.sourceEntityId} /></>;
      }
      default:
        return <p className="mt-4 text-sm text-muted-foreground">لا توجد تفاصيل إضافية مسجلة.</p>;
    }
  })();

  return <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 dark:bg-primary/5"><h3 className="font-bold text-foreground">تفاصيل النشاط</h3><p className="mt-1 text-xs text-muted-foreground">عرض للقراءة فقط</p>{content}</section>;
}

export default function StaffWorkDetailPage() {
  const { actor } = useStaffActor();
  const params = useParams<{ personId: string }>();
  const personId = decodeURIComponent(params.personId || "");
  const [period, setPeriod] = useState<StaffWorkPeriod>("MONTH");
  const [metric, setMetric] = useState<StaffWorkMetricKey | "ALL">("ALL");
  const [staff, setStaff] = useState<StaffWorkSummary | null>(null);
  const [activities, setActivities] = useState<StaffWorkActivity[]>([]);
  const [openedActivityId, setOpenedActivityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadStaffWorkDetail({ orgId: actor.orgId, academicYearId: actor.currentTerm?.academicYearId, personId, period });
      setStaff(data?.staff ?? null);
      setActivities(data?.activities ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "تعذر تحميل الأعمال.");
    } finally {
      setLoading(false);
    }
  }, [actor.currentTerm?.academicYearId, actor.orgId, period, personId]);

  useEffect(() => { void load(); }, [load]);
  const visibleActivities = useMemo(() => metric === "ALL" ? activities : activities.filter((item) => item.metricKey === metric), [activities, metric]);

  return <main dir="rtl" className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/staff/staff-work" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="size-4" />العودة إلى المتابعة</Link>
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">متابعة أعمال القيادات والإداريين</p><h1 className="mt-1 text-2xl font-bold">{staff?.displayName || "أعمال الموظف"}</h1>{staff ? <p className="mt-2 text-sm text-muted-foreground">{staff.roleLabel} • {staff.schoolNames.join(" • ")}</p> : null}</div><div className="inline-flex w-fit rounded-xl bg-muted p-1">{periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-lg px-3 py-2 text-sm ${period === item.value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>)}</div></section>
    {error ? <section className="rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">{error}</section> : null}
    {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل الأعمال…</div> : null}
    {!loading && !error && !staff ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يتوفر هذا الموظف ضمن نطاق المتابعة.</div> : null}
    {staff ? <><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><article className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">إجمالي الأعمال</p><p className="mt-2 text-2xl font-bold">{staff.totalActivityCount.toLocaleString("ar-SA")}</p><p className="mt-2 text-xs text-muted-foreground">آخر نشاط: {formatDate(staff.latestActivityAt)}</p></article>{staffWorkMetricOrder.map((key) => <article key={key} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{staffWorkMetricLabels[key]}</p><p className="mt-2 text-2xl font-bold">{staff.metrics[key].count.toLocaleString("ar-SA")}</p></article>)}</section><section><div className="mb-4 flex flex-wrap gap-2"><Button type="button" size="sm" variant={metric === "ALL" ? "default" : "secondary"} onClick={() => setMetric("ALL")}>الكل</Button>{staffWorkMetricOrder.map((key) => <Button key={key} type="button" size="sm" variant={metric === key ? "default" : "secondary"} onClick={() => setMetric(key)}>{staffWorkMetricLabels[key]}</Button>)}</div><div className="space-y-3">{!visibleActivities.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد أعمال ضمن الفترة المحددة.</div> : visibleActivities.map((item) => { const isOpen = openedActivityId === item.id; const schoolName = staff.schoolNames[staff.schoolIds.indexOf(item.schoolId)] || item.schoolId; return <article key={item.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{item.title}</h2>{item.status ? <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{statusLabel(item.status)}</span> : null}</div><p className="mt-2 text-sm text-muted-foreground">{[item.targetName, item.classLabel, item.description].filter(Boolean).join(" • ") || "لا تتوفر تفاصيل إضافية"}</p><p className="mt-2 text-xs text-muted-foreground">{schoolName} • {formatDate(item.activityAt)}</p></div><div className="flex shrink-0 items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setOpenedActivityId(isOpen ? null : item.id)}>{isOpen ? "إغلاق" : "فتح"}<ChevronLeft className="size-4" /></Button>{item.href ? <Button asChild variant="ghost" size="icon" aria-label="فتح المصدر"><Link href={item.href}><ExternalLink className="size-4" /></Link></Button> : null}</div></div>{isOpen ? <ActivityDetails activity={item} orgId={actor.orgId} staffPersonId={personId} /> : null}</article>; })}</div></section></> : null}
  </main>;
}
