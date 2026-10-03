"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Printer, RefreshCw, Target } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  loadLearningLossSummary,
  type LearningLossSummaryRow,
} from "@/lib/learning-loss-summary";

type LoadingState = "idle" | "loading" | "success" | "error";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع أثناء تحميل ملخص الفاقد التعليمي.";
}

function classKey(row: Pick<LearningLossSummaryRow, "schoolId" | "academicYearId" | "classId">) {
  return `${row.schoolId}::${row.academicYearId}::${row.classId}`;
}

function teacherKey(row: LearningLossSummaryRow) {
  return row.teacherPersonId || `UNKNOWN::${row.teacherDisplayName}`;
}

function subjectKey(row: LearningLossSummaryRow) {
  return row.classSubjectOfferingId || row.subjectKey || row.subjectTitle;
}

function formatDate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
      new Date(value),
    );
  } catch {
    return "—";
  }
}

function formatMeasurement(score: number | null, maxScore: number | null) {
  if (score === null || maxScore === null) return "لم يُرصد";

  const formatter = new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 1,
  });
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : null;
  const percentageText = percentage === null ? "—" : `${formatter.format(percentage)}%`;

  return `${formatter.format(score)} / ${formatter.format(maxScore)} — ${percentageText}`;
}

function statusLabel(value: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "ACTIVE":
      return "نشطة";
    case "IN_PROGRESS":
      return "قيد المتابعة";
    case "IMPROVED":
      return "تحسن";
    case "PARTIALLY_IMPROVED":
      return "تحسن جزئي";
    case "NOT_IMPROVED":
      return "لم يتحسن";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "غير محدد";
  }
}

function sourceLabel(value: string) {
  switch (value) {
    case "ASSESSMENT_RECORD":
      return "من قياس";
    case "TRACKER_ENTRY":
      return "من متابعة";
    case "MANUAL":
      return "فتح يدوي";
    default:
      return value || "غير محدد";
  }
}

function improvementLabel(value: string) {
  switch (value) {
    case "IMPROVED":
      return "تحسن واضح";
    case "PARTIAL_IMPROVEMENT":
      return "تحسن جزئي";
    case "NO_IMPROVEMENT":
      return "لا يوجد تحسن";
    case "REGRESSED":
      return "تراجع";
    default:
      return "غير محسوب";
  }
}

function actionStatusLabel(value: string) {
  if (value === "COMPLETED" || value === "DONE") return "مكتمل";
  if (value === "IN_PROGRESS") return "قيد التنفيذ";
  if (value === "PLANNED") return "مخطط";
  if (value === "CANCELLED") return "ملغى";
  return value || "غير محدد";
}

function buildTimeline(row: LearningLossSummaryRow) {
  const entries: Array<{ at: number; label: string }> = [];
  if (row.planStartAt !== null) {
    entries.push({ at: row.planStartAt, label: "بدء الخطة العلاجية" });
  }
  if (row.planEndAt !== null) {
    entries.push({ at: row.planEndAt, label: "التاريخ المستهدف لانتهاء الخطة" });
  }
  row.remediationActions.forEach((action) => {
    const actionTitle = action.title || "إجراء علاجي";
    if (action.dueAt !== null) {
      entries.push({ at: action.dueAt, label: `موعد مستهدف: ${actionTitle}` });
    }
    if (action.completedAt !== null) {
      entries.push({ at: action.completedAt, label: `تنفيذ إجراء علاجي: ${actionTitle}` });
    }
  });
  if (row.firstCheckMeasuredAt !== null) {
    entries.push({ at: row.firstCheckMeasuredAt, label: "قياس نتيجة الخطة الأول" });
  }
  if (row.secondCheckMeasuredAt !== null) {
    entries.push({ at: row.secondCheckMeasuredAt, label: "قياس نتيجة الخطة الثاني" });
  }

  return entries.sort((left, right) => left.at - right.at);
}

function SummaryDetail({ row }: { row: LearningLossSummaryRow }) {
  const timeline = buildTimeline(row);

  return (
    <div className="grid gap-4 bg-muted/20 p-4 text-sm md:grid-cols-2">
      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">بيانات الخطة</h3>
        <dl className="mt-3 grid gap-2 text-muted-foreground">
          <div><dt className="inline font-medium text-foreground">العنوان: </dt><dd className="inline">{row.planTitle || "خطة فاقد تعليمي"}</dd></div>
          <div><dt className="inline font-medium text-foreground">بدء الخطة: </dt><dd className="inline">{formatDate(row.planStartAt)}</dd></div>
          <div><dt className="inline font-medium text-foreground">الانتهاء المستهدف: </dt><dd className="inline">{formatDate(row.planEndAt)}</dd></div>
          <div><dt className="inline font-medium text-foreground">آخر متابعة: </dt><dd className="inline">{row.lastFollowUpAt === null ? "لم توجد متابعة" : formatDate(row.lastFollowUpAt)}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">مصدر الفاقد</h3>
        <dl className="mt-3 grid gap-2 text-muted-foreground">
          <div><dt className="inline font-medium text-foreground">المصدر: </dt><dd className="inline">{sourceLabel(row.sourceType)}</dd></div>
          <div><dt className="inline font-medium text-foreground">العنوان: </dt><dd className="inline">{row.sourceTitle || "غير محدد"}</dd></div>
          {row.sourceKind ? <div><dt className="inline font-medium text-foreground">النوع: </dt><dd className="inline">{row.sourceKind}</dd></div> : null}
        </dl>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">المهارات المفقودة</h3>
        {row.lostSkills.length ? (
          <ul className="mt-3 space-y-2 text-muted-foreground">
            {row.lostSkills.map((skill, index) => (
              <li key={`${skill.id}-${index}`}>
                <span className="font-medium text-foreground">{skill.title || "مهارة غير محددة"}</span>
                {skill.description ? ` — ${skill.description}` : ""}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-muted-foreground">لا توجد مهارات مفقودة مسجلة.</p>}
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">الخطة العلاجية</h3>
        <p className="mt-3 whitespace-pre-wrap leading-6 text-muted-foreground">
          {row.planText || "لا يوجد وصف علاجي مسجل."}
        </p>
      </section>

      <section className="rounded-xl border bg-background p-4 md:col-span-2">
        <h3 className="font-semibold">أحداث وإجراءات الخطة</h3>
        {row.remediationActions.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">العنوان</th>
                  <th className="px-3 py-2 font-medium">الوصف</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                  <th className="px-3 py-2 font-medium">التاريخ المستهدف</th>
                  <th className="px-3 py-2 font-medium">تاريخ التنفيذ</th>
                  <th className="px-3 py-2 font-medium">الملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {row.remediationActions.map((action, index) => (
                  <tr key={`${action.id}-${index}`} className="border-t">
                    <td className="px-3 py-2 font-medium">{action.title || "إجراء علاجي"}</td>
                    <td className="px-3 py-2">{action.description || "—"}</td>
                    <td className="px-3 py-2">{actionStatusLabel(action.status)}</td>
                    <td className="px-3 py-2">{formatDate(action.dueAt)}</td>
                    <td className="px-3 py-2">{formatDate(action.completedAt)}</td>
                    <td className="px-3 py-2">{action.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-muted-foreground">لا توجد إجراءات علاجية مسجلة.</p>}
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">قياسات النتيجة</h3>
        <dl className="mt-3 grid gap-2 text-muted-foreground">
          <div><dt className="inline font-medium text-foreground">القياس الأساسي: </dt><dd className="inline">{formatMeasurement(row.baselineScore, row.baselineMaxScore)}</dd></div>
          <div><dt className="inline font-medium text-foreground">القياس الأول: </dt><dd className="inline">{formatMeasurement(row.firstCheckScore, row.firstCheckMaxScore)} {row.firstCheckMeasuredAt !== null ? `(${formatDate(row.firstCheckMeasuredAt)})` : ""}</dd></div>
          <div><dt className="inline font-medium text-foreground">القياس الثاني: </dt><dd className="inline">{formatMeasurement(row.secondCheckScore, row.secondCheckMaxScore)} {row.secondCheckMeasuredAt !== null ? `(${formatDate(row.secondCheckMeasuredAt)})` : ""}</dd></div>
          {row.firstCheckNote ? <div><dt className="inline font-medium text-foreground">ملاحظة القياس الأول: </dt><dd className="inline">{row.firstCheckNote}</dd></div> : null}
          {row.secondCheckNote ? <div><dt className="inline font-medium text-foreground">ملاحظة القياس الثاني: </dt><dd className="inline">{row.secondCheckNote}</dd></div> : null}
        </dl>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">مؤشر التحسن</h3>
        <dl className="mt-3 grid gap-2 text-muted-foreground">
          <div><dt className="inline font-medium text-foreground">المؤشر: </dt><dd className="inline">{improvementLabel(row.improvementIndicator)}</dd></div>
          {row.improvementDelta !== null ? <div><dt className="inline font-medium text-foreground">فرق الدرجة: </dt><dd className="inline">{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(row.improvementDelta)}</dd></div> : null}
          {row.improvementPercentage !== null ? <div><dt className="inline font-medium text-foreground">فرق النسبة: </dt><dd className="inline">{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(row.improvementPercentage)}%</dd></div> : null}
        </dl>
      </section>

      <section className="rounded-xl border bg-background p-4 md:col-span-2">
        <h3 className="font-semibold">السجل الزمني</h3>
        {timeline.length ? (
          <ol className="mt-3 space-y-2 border-r pr-4 text-muted-foreground">
            {timeline.map((item, index) => (
              <li key={`${item.at}-${index}`} className="relative">
                <span className="absolute -right-[1.36rem] top-1.5 size-2 rounded-full bg-primary" />
                <span className="font-medium text-foreground">{formatDate(item.at)}</span>
                <span> — {item.label}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-muted-foreground">لا توجد أحداث تعليمية مسجلة بعد.</p>}
      </section>
    </div>
  );
}

export default function StaffLearningLossSummaryPage() {
  const { actor } = useStaffActor();
  const orgId = actor?.orgId?.trim() || "";
  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<LearningLossSummaryRow[]>([]);
  const [schoolFilter, setSchoolFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [printDate, setPrintDate] = useState("");

  const loadSummary = useCallback(async () => {
    if (!orgId) return;
    setStatus("loading");
    setError("");

    try {
      const result = await loadLearningLossSummary({ orgId });
      setRows(result.rows);
      setStatus("success");
    } catch (nextError: unknown) {
      setRows([]);
      setError(getErrorMessage(nextError));
      setStatus("error");
    }
  }, [orgId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setPrintDate(
      new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    );
  }, []);

  const schoolOptions = useMemo(
    () => Array.from(new Map(rows.map((row) => [row.schoolId, row.schoolName])).entries()),
    [rows],
  );
  const teacherOptions = useMemo(
    () => Array.from(new Map(rows.map((row) => [teacherKey(row), row.teacherDisplayName])).entries()),
    [rows],
  );
  const subjectOptions = useMemo(
    () => Array.from(new Map(rows.map((row) => [subjectKey(row), row.subjectTitle])).entries()),
    [rows],
  );
  const classOptions = useMemo(
    () => Array.from(new Map(rows.map((row) => [classKey(row), row.classTitle])).entries()),
    [rows],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status))).sort(),
    [rows],
  );
  const filteredRows = useMemo(
    () => rows.filter((row) =>
      (schoolFilter === "ALL" || row.schoolId === schoolFilter) &&
      (teacherFilter === "ALL" || teacherKey(row) === teacherFilter) &&
      (subjectFilter === "ALL" || subjectKey(row) === subjectFilter) &&
      (classFilter === "ALL" || classKey(row) === classFilter) &&
      (statusFilter === "ALL" || row.status === statusFilter),
    ),
    [classFilter, rows, schoolFilter, statusFilter, subjectFilter, teacherFilter],
  );
  const counters = useMemo(() => ({
    total: filteredRows.length,
    active: filteredRows.filter((row) => row.status === "ACTIVE" || row.status === "IN_PROGRESS").length,
    improved: filteredRows.filter((row) => row.status === "IMPROVED").length,
    partiallyImproved: filteredRows.filter((row) => row.status === "PARTIALLY_IMPROVED").length,
    notImproved: filteredRows.filter((row) => row.status === "NOT_IMPROVED").length,
  }), [filteredRows]);
  const filterContext = useMemo(() => {
    const selectedSchool = schoolOptions.find(([value]) => value === schoolFilter)?.[1];
    const selectedTeacher = teacherOptions.find(([value]) => value === teacherFilter)?.[1];
    const selectedSubject = subjectOptions.find(([value]) => value === subjectFilter)?.[1];
    const selectedClass = classOptions.find(([value]) => value === classFilter)?.[1];
    const selectedStatus = statusFilter === "ALL" ? "" : statusLabel(statusFilter);
    const values = [selectedSchool, selectedTeacher, selectedSubject, selectedClass, selectedStatus].filter(Boolean);
    return values.length ? values.join(" · ") : "جميع الخطط ضمن نطاقك الحالي";
  }, [classFilter, classOptions, schoolFilter, schoolOptions, statusFilter, subjectFilter, subjectOptions, teacherFilter, teacherOptions]);

  const clearFilters = () => {
    setSchoolFilter("ALL");
    setTeacherFilter("ALL");
    setSubjectFilter("ALL");
    setClassFilter("ALL");
    setStatusFilter("ALL");
  };

  if (!actor) {
    return <main dir="rtl" className="mx-auto flex w-full max-w-7xl flex-1 p-4 md:p-6"><section className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">جاري تحميل بيانات المستخدم...</section></main>;
  }

  return (
    <main dir="rtl" className="learning-loss-summary mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 p-4 md:p-6">
      <style jsx global>{`
        .print-only { display: none; }
        @media print {
          @page { size: landscape; margin: 12mm; }
          body { background: white !important; color: black !important; }
          aside, header, nav, .print-hidden { display: none !important; }
          .print-only { display: block !important; }
          .learning-loss-summary { max-width: none !important; padding: 0 !important; gap: 12px !important; }
          .learning-loss-summary * { color: black !important; box-shadow: none !important; }
          .learning-loss-summary section, .learning-loss-summary div { background: white !important; }
          .learning-loss-summary table { min-width: 0 !important; font-size: 10px !important; }
          .learning-loss-summary .summary-row-detail { display: none !important; }
        }
      `}</style>

      <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Target className="size-5" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">خلاصة الفاقد التعليمي</h1>
              <p className="mt-1 text-sm text-muted-foreground">عرض مركزي لخطط الفاقد التعليمي ضمن نطاقك الحالي.</p>
            </div>
          </div>
          <div className="print-hidden flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadSummary()} disabled={status === "loading"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className="size-4" />{status === "loading" ? "جاري التحديث..." : "تحديث"}</button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"><Printer className="size-4" />طباعة</button>
          </div>
        </div>
        <p className="print-only mt-3 text-sm">{filterContext}{printDate ? ` · تاريخ الطباعة: ${printDate}` : ""}</p>
      </section>

      {error ? <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">تعذر تحميل ملخص الفاقد التعليمي: {error}</section> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["إجمالي الخطط", counters.total],
          ["النشطة", counters.active],
          ["تحسن", counters.improved],
          ["تحسن جزئي", counters.partiallyImproved],
          ["لم يتحسن", counters.notImproved],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{new Intl.NumberFormat("ar-SA").format(Number(value))}</p>
          </div>
        ))}
      </section>

      <section className="print-hidden rounded-2xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">المدرسة</span><select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3"><option value="ALL">الكل</option>{schoolOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">المعلم</span><select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3"><option value="ALL">الكل</option>{teacherOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">المادة</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3"><option value="ALL">الكل</option>{subjectOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">الصف والفصل</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3"><option value="ALL">الكل</option>{classOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">الحالة</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3"><option value="ALL">الكل</option>{statusOptions.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{filterContext}</span><button type="button" onClick={clearFilters} className="rounded-lg px-2 py-1 font-medium text-foreground hover:bg-muted">مسح الفلاتر</button></div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-muted/20 p-5">
          <h2 className="text-lg font-semibold">خطط الفاقد التعليمي</h2>
          <p className="mt-1 text-sm text-muted-foreground">{new Intl.NumberFormat("ar-SA").format(filteredRows.length)} خطة مطابقة للنطاق والفلاتر الحالية.</p>
        </div>
        {status === "loading" ? <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل الخطط...</div> : null}
        {status !== "loading" && rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد خطط فاقد تعليمي ضمن نطاقك الحالي.</div> : null}
        {status !== "loading" && rows.length > 0 && filteredRows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للفلاتر المحددة.</div> : null}
        {status !== "loading" && filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-right text-sm">
              <thead className="bg-muted/40 text-muted-foreground"><tr>
                <th className="px-4 py-3 font-medium">المعلم</th><th className="px-4 py-3 font-medium">الطالب</th><th className="px-4 py-3 font-medium">المادة</th><th className="px-4 py-3 font-medium">الصف والفصل</th><th className="px-4 py-3 font-medium">حالة الخطة</th><th className="px-4 py-3 font-medium">القياس الأساسي</th><th className="px-4 py-3 font-medium">قياس نتيجة الخطة الأول</th><th className="px-4 py-3 font-medium">قياس نتيجة الخطة الثاني</th><th className="px-4 py-3 font-medium">مؤشر التحسن</th><th className="px-4 py-3 font-medium">تاريخ آخر متابعة</th><th className="print-hidden px-4 py-3 font-medium">التفاصيل</th>
              </tr></thead>
              <tbody>{filteredRows.map((row) => {
                const isExpanded = expandedId === row.id;
                return <FragmentRow key={row.id} row={row} isExpanded={isExpanded} onToggle={() => setExpandedId(isExpanded ? null : row.id)} />;
              })}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function FragmentRow(params: {
  row: LearningLossSummaryRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { row, isExpanded, onToggle } = params;
  return <>
    <tr className="border-t transition-colors hover:bg-muted/30">
      <td className="whitespace-nowrap px-4 py-3 font-medium">{row.teacherDisplayName}</td>
      <td className="whitespace-nowrap px-4 py-3 font-medium">{row.studentDisplayName}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.subjectTitle}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.classTitle}</td>
      <td className="whitespace-nowrap px-4 py-3">{statusLabel(row.status)}</td>
      <td className="whitespace-nowrap px-4 py-3">{formatMeasurement(row.baselineScore, row.baselineMaxScore)}</td>
      <td className="whitespace-nowrap px-4 py-3">{formatMeasurement(row.firstCheckScore, row.firstCheckMaxScore)}</td>
      <td className="whitespace-nowrap px-4 py-3">{formatMeasurement(row.secondCheckScore, row.secondCheckMaxScore)}</td>
      <td className="whitespace-nowrap px-4 py-3">{improvementLabel(row.improvementIndicator)}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.lastFollowUpAt === null ? "لم توجد متابعة" : formatDate(row.lastFollowUpAt)}</td>
      <td className="print-hidden whitespace-nowrap px-4 py-3"><button type="button" onClick={onToggle} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-medium transition hover:bg-muted">{isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{isExpanded ? "إخفاء" : "تفاصيل"}</button></td>
    </tr>
    {isExpanded ? <tr className="summary-row-detail border-t"><td colSpan={11}><SummaryDetail row={row} /></td></tr> : null}
  </>;
}
