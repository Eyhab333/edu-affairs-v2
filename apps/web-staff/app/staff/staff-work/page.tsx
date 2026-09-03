"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, UsersRound } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { loadPersonSupervisionScopes } from "@/lib/person-supervision-scopes";
import { canAccessStaffWork } from "@/lib/staff-work-access";
import { loadStaffWorkOverview, staffWorkMetricLabels, staffWorkMetricOrder, type StaffWorkPeriod, type StaffWorkSummary } from "@/lib/staff-work";
import type { PersonSupervisionScope } from "@takween/contracts";

const periods: Array<{ value: StaffWorkPeriod; label: string }> = [
  { value: "WEEK", label: "هذا الأسبوع" }, { value: "MONTH", label: "هذا الشهر" }, { value: "ALL", label: "الكل" },
];
function formatDate(value: number | null) { return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "لا يوجد نشاط مسجل"; }

export default function StaffWorkPage() {
  const { actor } = useStaffActor();
  const [scopes, setScopes] = useState<PersonSupervisionScope[]>([]);
  const [scopesLoading, setScopesLoading] = useState(true);
  const [period, setPeriod] = useState<StaffWorkPeriod>("ALL");
  const [staff, setStaff] = useState<StaffWorkSummary[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canAccess = canAccessStaffWork({ orgId: actor.orgId, personId: actor.personId, scopes });

  useEffect(() => { let cancelled = false; void loadPersonSupervisionScopes({ orgId: actor.orgId, personId: actor.personId }).then((value) => { if (!cancelled) setScopes(value); }).catch(() => { if (!cancelled) setScopes([]); }).finally(() => { if (!cancelled) setScopesLoading(false); }); return () => { cancelled = true; }; }, [actor.orgId, actor.personId]);
  const load = useCallback(async () => {
    if (!canAccess) { setStaff([]); setLoading(false); return; }
    setLoading(true); setError("");
    try { setStaff(await loadStaffWorkOverview({ orgId: actor.orgId, academicYearId: actor.currentTerm?.academicYearId, period })); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "تعذر تحميل أعمال القيادات."); }
    finally { setLoading(false); }
  }, [actor.currentTerm?.academicYearId, actor.orgId, canAccess, period]);
  useEffect(() => { if (!scopesLoading) void load(); }, [load, scopesLoading]);

  const schools = useMemo(() => [...new Map(staff.flatMap((item) => item.schoolIds.map((id, index) => [id, item.schoolNames[index] || id] as const))).entries()], [staff]);
  const roles = useMemo(() => [...new Map(staff.map((item) => [item.roleKey, item.roleLabel])).entries()], [staff]);
  const filtered = useMemo(() => staff.filter((item) => (!schoolId || item.schoolIds.includes(schoolId)) && (!roleKey || item.roleKey === roleKey) && (!search.trim() || item.displayName.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")))), [roleKey, schoolId, search, staff]);

  if (scopesLoading) return <main dir="rtl" className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ التحقق من الصلاحية…</main>;
  if (!canAccess) return null;
  return <main dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><UsersRound className="size-6" /></div><div><h1 className="text-2xl font-bold">متابعة أعمال القيادات والإداريين</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">عرض موحد للأعمال الفعلية المنسوبة للقيادات والإداريين ضمن المدارس المخولة لك.</p></div></div></section>
    <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-4"><label><span className="sr-only">البحث</span><div className="flex h-10 items-center gap-2 rounded-xl border px-3"><Search className="size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الموظف" className="w-full bg-transparent text-sm outline-none" /></div></label><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">كل المدارس</option>{schools.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">كل الأدوار</option>{roles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><div className="inline-flex rounded-xl bg-muted p-1">{periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`flex-1 rounded-lg px-2 py-2 text-sm ${period === item.value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>)}</div></section>
    {error ? <section className="rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">{error}</section> : null}
    {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل الأعمال…</div> : null}
    {!loading && !error && !staff.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد موظفون من الفئات المستهدفة ضمن مدارس نطاق المتابعة المحددة.</div> : null}
    {!loading && !error && staff.length && !filtered.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للتصفية الحالية.</div> : null}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <article key={item.personId} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{item.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">{item.roleLabel}</p><p className="mt-1 text-xs text-muted-foreground">{item.schoolNames.join(" • ")}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">{item.totalActivityCount.toLocaleString("ar-SA")}</span></div><p className="mt-4 text-xs text-muted-foreground">آخر نشاط: {formatDate(item.latestActivityAt)}</p><div className="mt-4 flex flex-wrap gap-2">{staffWorkMetricOrder.map((key) => <span key={key} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{staffWorkMetricLabels[key]}: {item.metrics[key].count.toLocaleString("ar-SA")}</span>)}</div><Link href={`/staff/staff-work/${encodeURIComponent(item.personId)}`} className="mt-5 inline-flex rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">عرض الأعمال</Link></article>)}</section>
  </main>;
}
