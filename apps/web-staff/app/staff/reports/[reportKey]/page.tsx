"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  loadTeacherWorkReport,
  teacherWorkMetricLabels,
  type TeacherWorkMetricKey,
  type TeacherWorkSummary,
} from "@/lib/teacher-work";
import { loadStaffWorkOverview, type StaffWorkSummary } from "@/lib/staff-work";
import { loadAdminWorkOverview, type AdminWorkSummary } from "@/lib/admin-work";
import { staffWorkMetricLabels } from "@/lib/staff-work";
import { adminWorkMetricLabels } from "@/lib/admin-work";

type Period = "DAY" | "WEEK" | "MONTH" | "ALL";
type ReportRow = {
  id: string;
  name: string;
  role: string;
  schools: string;
  total: number;
  latest: number | null;
  breakdown: Array<{ label: string; count: number }>;
};
const periods: Array<{ value: Period; label: string }> = [
  { value: "DAY", label: "اليوم" },
  { value: "WEEK", label: "الأسبوع" },
  { value: "MONTH", label: "الشهر" },
  { value: "ALL", label: "الكل" },
];
const config = {
  "teacher-work": {
    title: "تقرير أعمال المعلمين",
    description: "ملخص رقمي للمعلمين ضمن نطاقك.",
  },
  "staff-work": {
    title: "تقرير أعمال القيادات",
    description: "ملخص رقمي للقيادات ضمن نطاقك.",
  },
  "admin-work": {
    title: "تقرير أعمال الإداريين",
    description: "ملخص رقمي للإداريين ضمن نطاقك.",
  },
} as const;
function date(value: number | null) {
  return value
    ? new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

export default function WorkReportPage() {
  const { actor } = useStaffActor();
  const params = useParams<{ reportKey: string }>();
  const key = params.reportKey as keyof typeof config;
  const info = config[key];
  const [period, setPeriod] = useState<Period>("MONTH");
  const [school, setSchool] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!info) return;
    setLoading(true);
    setError("");
    try {
      if (key === "teacher-work") {
        const teachers = await loadTeacherWorkReport({
          orgId: actor.orgId,
          academicYearId: actor.currentTerm?.academicYearId,
          period,
        });
        setRows(
          teachers.map((item: TeacherWorkSummary) => {
            const metrics = Object.entries(item.metrics);
            const latest = Math.max(
              ...metrics.map(([, metric]) => metric.latestActivityAt ?? 0),
            );

            return {
              id: item.teacherPersonId,
              name: item.displayName || "معلم غير محدد",
              role: "معلم",
              schools: item.schoolNames.join(" • "),
              total: metrics.reduce((sum, [, metric]) => sum + metric.count, 0),
              latest: latest || null,
              breakdown: metrics
                .filter(([, metric]) => metric.count > 0)
                .map(([metricKey, metric]) => ({
                  label:
                    teacherWorkMetricLabels[
                      metricKey as TeacherWorkMetricKey
                    ],
                  count: metric.count,
                })),
            };
          }),
        );
      } else if (key === "staff-work") {
        const staff = await loadStaffWorkOverview({
          orgId: actor.orgId,
          academicYearId: actor.currentTerm?.academicYearId,
        period,
        });
        setRows(
          staff.map((item: StaffWorkSummary) => ({
            id: item.personId,
            name: item.displayName,
            role: item.roleLabel,
            schools: item.schoolNames.join(" • "),
            total: item.totalActivityCount,
            latest: item.latestActivityAt,
            breakdown: Object.entries(item.metrics)
              .filter(([, metric]) => metric.count > 0)
              .map(([metricKey, metric]) => ({
                label:
                  staffWorkMetricLabels[
                    metricKey as keyof typeof staffWorkMetricLabels
                  ],
                count: metric.count,
              })),
          })),
        );
      } else {
        const staff = await loadAdminWorkOverview({
          orgId: actor.orgId,
          academicYearId: actor.currentTerm?.academicYearId,
        period,
        });
        setRows(
          staff.map((item: AdminWorkSummary) => ({
            id: item.personId,
            name: item.displayName,
            role: item.roleLabel,
            schools: item.schoolNames.join(" • "),
            total: item.totalActivityCount,
            latest: item.latestActivityAt,
            breakdown: Object.entries(item.metrics)
              .filter(([, metric]) => metric.count > 0)
              .map(([metricKey, metric]) => ({
                label:
                  adminWorkMetricLabels[
                    metricKey as keyof typeof adminWorkMetricLabels
                  ],
                count: metric.count,
              })),
          })),
        );
      }
    } catch {
      setRows([]);
      setError("تعذر تحميل التقرير ضمن نطاق الصلاحيات الحالي.");
    } finally {
      setLoading(false);
    }
  }, [actor.currentTerm?.academicYearId, actor.orgId, info, key, period]);
  useEffect(() => {
    void load();
  }, [load]);
  const schools = useMemo(
    () => [
      ...new Set(
        rows.flatMap((row) => row.schools.split(" • ").filter(Boolean)),
      ),
    ],
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!school || row.schools.includes(school)) &&
          (!search.trim() ||
            row.name
              .toLocaleLowerCase("ar")
              .includes(search.trim().toLocaleLowerCase("ar"))),
      ),
    [rows, school, search],
  );
  if (!info)
    return (
      <main dir="rtl" className="p-6 text-center text-sm text-muted-foreground">
        التقرير غير متاح.
      </main>
    );
  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <Link
        href="/staff/reports"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowRight className="size-4" />
        العودة إلى التقارير
      </Link>
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{info.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{info.description}</p>
      </section>
      <section className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث بالاسم"
          className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
        />
        <select
          value={school}
          onChange={(event) => setSchool(event.target.value)}
          className="h-10 rounded-xl border bg-background px-3 text-sm"
        >
          <option value="">كل المدارس</option>
          {schools.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-xl bg-muted p-1">
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              className={`flex-1 rounded-lg px-2 py-2 text-sm ${period === item.value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
      {error ? (
        <p className="rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 inline size-4 animate-spin" />
          جارٍ تحميل التقرير…
        </p>
      ) : null}
      {!loading && !error ? (
        <section className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">الدور</th>
                <th className="px-4 py-3 font-medium">المدرسة</th>
                <th className="px-4 py-3 font-medium">تفصيل الأنشطة</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
                <th className="px-4 py-3 font-medium">آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.schools || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-64 flex-wrap gap-1.5">
                      {(row.breakdown ?? []).length ? (
                        (row.breakdown ?? []).map((item) => (
                          <span
                            key={item.label}
                            className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                          >
                            {item.label}: {item.count.toLocaleString("ar-SA")}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">
                          لا توجد أنشطة
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {row.total.toLocaleString("ar-SA")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {date(row.latest)}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    لا توجد بيانات ضمن الفلاتر المحددة.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
