"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  FilterX,
  Loader2,
  Search,
  UsersRound,
} from "lucide-react";
import type {
  EvaluationReportEmployee,
  EvaluationReportFilterOptions,
  EvaluationReportOverview,
  EvaluationReportRequest,
  EvaluationReportStatusFilter,
} from "@takween/contracts";
import { hasOrgWideAccess } from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import EvaluationPersonDetailDrawer from "@/components/staff/reports/evaluation-person-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import {
  loadEvaluationReportOverview,
  loadEvaluationReportPersonDetail,
} from "@/lib/evaluation-reports";
import { getArabicRoleLabel } from "@/lib/role-labels";

type Filters = {
  schoolId: string;
  academicYearId: string;
  termId: string;
  targetRoleKey: string;
  targetPersonId: string;
  evaluationType: string;
  status: EvaluationReportStatusFilter | "";
};

const statusLabels: Record<EvaluationReportStatusFilter, string> = {
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

function defaultFilters(currentTerm: { academicYearId: string; id: string } | null): Filters {
  return {
    schoolId: "",
    academicYearId: currentTerm?.academicYearId || "",
    termId: currentTerm?.id || "",
    targetRoleKey: "",
    targetPersonId: "",
    evaluationType: "",
    status: "",
  };
}

function toRequest(orgId: string, filters: Filters): EvaluationReportRequest {
  return {
    orgId,
    ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.targetRoleKey ? { targetRoleKey: filters.targetRoleKey } : {}),
    ...(filters.targetPersonId ? { targetPersonId: filters.targetPersonId } : {}),
    ...(filters.evaluationType ? { evaluationType: filters.evaluationType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

function FiltersSkeleton() {
  return <div className="h-[420px] animate-pulse rounded-3xl border bg-card" />;
}

function EmployeeTable({
  employees,
  onOpen,
}: {
  employees: EvaluationReportEmployee[];
  onOpen: (personId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-[1140px] text-right text-sm">
        <thead className="border-b bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">الموظف</th>
            <th className="px-4 py-3 font-medium">الدور</th>
            <th className="px-4 py-3 font-medium">المدرسة / الجهة</th>
            <th className="px-4 py-3 font-medium">الخطط</th>
            <th className="px-4 py-3 font-medium">الدورات المكتملة / الكلية</th>
            <th className="px-4 py-3 font-medium">المتبقي</th>
            <th className="px-4 py-3 font-medium">المتوسط المعتمد</th>
            <th className="px-4 py-3 font-medium">آخر نتيجة</th>
            <th className="px-4 py-3 font-medium">الحالة</th>
            <th className="px-4 py-3 font-medium">آخر تحديث</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.targetPersonId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <button type="button" className="text-right font-semibold hover:text-primary hover:underline" onClick={() => onOpen(employee.targetPersonId)}>
                  {employee.displayName}
                </button>
                {employee.email ? <p className="mt-1 text-xs font-normal text-muted-foreground">{employee.email}</p> : null}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{employee.roleKeys.map(getArabicRoleLabel).join(" • ") || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{employee.schoolNames.join(" • ") || "—"}</td>
              <td className="px-4 py-3">{employee.planCount.toLocaleString("ar-SA")}</td>
              <td className="px-4 py-3 font-medium">{employee.completedCycles.toLocaleString("ar-SA")} / {employee.totalCycles.toLocaleString("ar-SA")}</td>
              <td className="px-4 py-3">{employee.remainingCycles.toLocaleString("ar-SA")}</td>
              <td className="px-4 py-3 font-medium">{percentage(employee.approvedAverageScore)}</td>
              <td className="px-4 py-3">{percentage(employee.lastScore)}</td>
              <td className="px-4 py-3"><Badge variant={statusVariant(employee.status)}>{statusLabels[employee.status]}</Badge></td>
              <td className="px-4 py-3 text-muted-foreground">{date(employee.latestActivityAt)}</td>
            </tr>
          ))}
          {!employees.length ? (
            <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">لا توجد بيانات تقييم ضمن الفلاتر المحددة.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function EvaluationReportWorkspace() {
  const { actor } = useStaffActor();
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(actor.currentTerm));
  const [personSearch, setPersonSearch] = useState("");
  const [report, setReport] = useState<EvaluationReportOverview | null>(null);
  const [filterOptions, setFilterOptions] = useState<EvaluationReportFilterOptions | null>(null);
  const [view, setView] = useState<"PEOPLE" | "SCHOOLS">("PEOPLE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadEvaluationReportPersonDetail>> | null>(null);

  const canAccessReports = hasOrgWideAccess(actor.roles);
  const fallbackSchools = actor.schools.map((school) => ({ id: school.id, label: school.name }));
  const availablePeople = useMemo(() => {
    const people = filterOptions?.people ?? [];
    const needle = personSearch.trim().toLocaleLowerCase("ar");
    return needle ? people.filter((person) => person.label.toLocaleLowerCase("ar").includes(needle)) : people;
  }, [filterOptions?.people, personSearch]);
  const selectedSchoolEmployees = useMemo(
    () => report?.employees.filter((employee) => employee.schoolIds.includes(selectedSchoolId)) ?? [],
    [report?.employees, selectedSchoolId],
  );

  function updateFilter<Key extends keyof Filters>(key: Key, value: Filters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setReport(null);
    setSelectedSchoolId("");
    setError("");
  }

  function clearFilters() {
    setFilters(defaultFilters(actor.currentTerm));
    setPersonSearch("");
    setReport(null);
    setSelectedSchoolId("");
    setError("");
  }

  async function showReport() {
    setLoading(true);
    setError("");
    setSelectedSchoolId("");
    try {
      const nextReport = await loadEvaluationReportOverview(toRequest(actor.orgId, filters));
      setFilterOptions(nextReport.filters);
      setReport(nextReport);
    } catch (cause) {
      setReport(null);
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function openPerson(targetPersonId: string) {
    setDetailOpen(true);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      setDetail(await loadEvaluationReportPersonDetail({
        ...toRequest(actor.orgId, filters),
        targetPersonId,
      }));
    } catch (cause) {
      setDetailError(getErrorMessage(cause));
    } finally {
      setDetailLoading(false);
    }
  }

  if (!canAccessReports) {
    return (
      <main dir="rtl" className="mx-auto max-w-4xl p-4 sm:p-6">
        <section className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
          هذا التقرير متاح ضمن صلاحيات التقارير على مستوى المؤسسة فقط.
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6">
      <Link href="/staff/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" /> العودة إلى التقارير
      </Link>

      <section className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <BarChart3 className="size-4" /> التقارير
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">تقرير تقييمات الموظفين</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              تحليل نتائج تقييمات المعلمين والقيادات والإداريين على مستوى الموظف والمدرسة، مع إظهار الدورات التي لم تُستكمل بعد.
            </p>
          </div>
          <Button type="button" size="lg" onClick={() => void showReport()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}
            عرض التقرير
          </Button>
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1.5 text-sm font-medium">
          المدرسة / الجهة
          <select value={filters.schoolId} onChange={(event) => updateFilter("schoolId", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
            <option value="">كل المدارس / الجهات</option>
            {(filterOptions?.schools ?? fallbackSchools).map((school) => <option key={school.id} value={school.id}>{school.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          السنة الدراسية
          <select value={filters.academicYearId} onChange={(event) => updateFilter("academicYearId", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
            <option value="">كل السنوات المتاحة</option>
            {Array.from(new Map([
              ...(filters.academicYearId ? [[filters.academicYearId, filters.academicYearId] as const] : []),
              ...((filterOptions?.academicYears ?? []).map((item) => [item.id, item.label] as const)),
            ]).entries()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          الفصل الدراسي
          <select value={filters.termId} onChange={(event) => updateFilter("termId", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
            <option value="">كل الفصول في السياق المحدد</option>
            {Array.from(new Map([
              ...(filters.termId ? [[filters.termId, actor.currentTerm?.id === filters.termId ? actor.currentTerm?.title || filters.termId : filters.termId] as const] : []),
              ...((filterOptions?.terms ?? []).map((item) => [item.id, item.label] as const)),
            ]).entries()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          الدور
          <select value={filters.targetRoleKey} onChange={(event) => updateFilter("targetRoleKey", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm" disabled={!filterOptions}>
            <option value="">كل الأدوار</option>
            {(filterOptions?.roles ?? []).map((role) => <option key={role.id} value={role.id}>{getArabicRoleLabel(role.id)}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          نوع التقييم
          <select value={filters.evaluationType} onChange={(event) => updateFilter("evaluationType", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm" disabled={!filterOptions}>
            <option value="">كل أنواع التقييم</option>
            {(filterOptions?.evaluationTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          الحالة
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value as Filters["status"])} className="h-10 rounded-xl border bg-background px-3 text-sm" disabled={!filterOptions}>
            <option value="">الكل</option>
            {(filterOptions?.statuses ?? []).map((status) => <option key={status.id} value={status.id}>{statusLabels[status.id as EvaluationReportStatusFilter] || status.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          بحث الموظف
          <div className="flex h-10 items-center gap-2 rounded-xl border bg-background px-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={personSearch} onChange={(event) => setPersonSearch(event.target.value)} placeholder="اكتب اسم الموظف" className="w-full bg-transparent text-sm outline-none" disabled={!filterOptions} />
          </div>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          الموظف
          <select value={filters.targetPersonId} onChange={(event) => updateFilter("targetPersonId", event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm" disabled={!filterOptions}>
            <option value="">كل الموظفين</option>
            {availablePeople.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="button" variant="outline" className="w-full" onClick={clearFilters}>
            <FilterX className="size-4" /> مسح الفلاتر
          </Button>
        </div>
      </section>

      {error ? <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</section> : null}

      {loading ? <FiltersSkeleton /> : null}

      {!loading && !report && !error ? (
        <section className="rounded-3xl border border-dashed bg-card p-10 text-center">
          <BarChart3 className="mx-auto size-9 text-primary" />
          <h2 className="mt-4 font-bold">اختر الفلاتر ثم اعرض التقرير</h2>
          <p className="mt-2 text-sm text-muted-foreground">لن تُحمّل بيانات التقييم التفصيلية قبل الضغط على «عرض التقرير».</p>
        </section>
      ) : null}

      {!loading && report ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <article className="rounded-2xl border bg-card p-4"><UsersRound className="size-4 text-primary" /><p className="mt-3 text-sm text-muted-foreground">الموظفون</p><p className="mt-1 text-2xl font-bold">{report.kpis.employeesCount.toLocaleString("ar-SA")}</p></article>
            <article className="rounded-2xl border bg-card p-4"><BarChart3 className="size-4 text-primary" /><p className="mt-3 text-sm text-muted-foreground">متوسط التقييم المعتمد</p><p className="mt-1 text-2xl font-bold">{percentage(report.kpis.approvedAverageScore)}</p></article>
            <article className="rounded-2xl border bg-card p-4"><CheckCircle2 className="size-4 text-primary" /><p className="mt-3 text-sm text-muted-foreground">الخطط</p><p className="mt-1 text-2xl font-bold">{report.kpis.plansCount.toLocaleString("ar-SA")}</p></article>
            <article className="rounded-2xl border bg-card p-4"><Clock3 className="size-4 text-primary" /><p className="mt-3 text-sm text-muted-foreground">الدورات</p><p className="mt-1 text-2xl font-bold">{report.kpis.totalCycles.toLocaleString("ar-SA")}</p></article>
            <article className="rounded-2xl border bg-card p-4"><CheckCircle2 className="size-4 text-emerald-600" /><p className="mt-3 text-sm text-muted-foreground">المكتمل</p><p className="mt-1 text-2xl font-bold">{report.kpis.completedCycles.toLocaleString("ar-SA")}</p></article>
            <article className="rounded-2xl border bg-card p-4"><Clock3 className="size-4 text-amber-600" /><p className="mt-3 text-sm text-muted-foreground">المتبقي</p><p className="mt-1 text-2xl font-bold">{report.kpis.remainingCycles.toLocaleString("ar-SA")}</p></article>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-muted p-1">
              <button type="button" onClick={() => setView("PEOPLE")} className={`rounded-lg px-4 py-2 text-sm ${view === "PEOPLE" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>الموظفون</button>
              <button type="button" onClick={() => setView("SCHOOLS")} className={`rounded-lg px-4 py-2 text-sm ${view === "SCHOOLS" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>المدارس / الجهات</button>
            </div>
            <p className="text-sm text-muted-foreground">لا تُفسَّر الدورات بلا إرسال على أنها درجات صفرية.</p>
          </section>

          {view === "PEOPLE" ? <EmployeeTable employees={report.employees} onOpen={(personId) => void openPerson(personId)} /> : null}

          {view === "SCHOOLS" ? (
            <section className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[940px] text-right text-sm">
                <thead className="border-b bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">المدرسة / الجهة</th><th className="px-4 py-3 font-medium">الموظفون المقيمون</th><th className="px-4 py-3 font-medium">الخطط</th><th className="px-4 py-3 font-medium">الدورات</th><th className="px-4 py-3 font-medium">المكتمل</th><th className="px-4 py-3 font-medium">المتبقي</th><th className="px-4 py-3 font-medium">المتوسط المعتمد</th><th className="px-4 py-3 font-medium">نسبة الإنجاز</th><th className="px-4 py-3 font-medium" /></tr></thead>
                <tbody>
                  {report.schools.map((school) => <tr key={school.schoolId} className="border-b last:border-0 hover:bg-muted/30"><td className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-2"><Building2 className="size-4 text-primary" />{school.schoolName}</span></td><td className="px-4 py-3">{school.employeesCount.toLocaleString("ar-SA")}</td><td className="px-4 py-3">{school.plansCount.toLocaleString("ar-SA")}</td><td className="px-4 py-3">{school.totalCycles.toLocaleString("ar-SA")}</td><td className="px-4 py-3">{school.completedCycles.toLocaleString("ar-SA")}</td><td className="px-4 py-3">{school.remainingCycles.toLocaleString("ar-SA")}</td><td className="px-4 py-3 font-medium">{percentage(school.approvedAverageScore)}</td><td className="px-4 py-3">{percentage(school.completionPercentage)}</td><td className="px-4 py-3"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedSchoolId(school.schoolId)}>عرض الموظفين</Button></td></tr>)}
                  {!report.schools.length ? <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">لا توجد بيانات تقييم ضمن الفلاتر المحددة.</td></tr> : null}
                </tbody>
              </table>
            </section>
          ) : null}

          {selectedSchoolId ? (
            <section className="space-y-3 rounded-3xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">تفصيل موظفي {report.schools.find((school) => school.schoolId === selectedSchoolId)?.schoolName || selectedSchoolId}</h2><p className="mt-1 text-sm text-muted-foreground">استنادًا إلى نتيجة التقرير المحمّلة نفسها.</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setSelectedSchoolId("")}>إغلاق</Button></div>
              <EmployeeTable employees={selectedSchoolEmployees} onOpen={(personId) => void openPerson(personId)} />
            </section>
          ) : null}
        </>
      ) : null}

      <EvaluationPersonDetailDrawer open={detailOpen} detail={detail} loading={detailLoading} error={detailError} onClose={() => setDetailOpen(false)} />
    </main>
  );
}
