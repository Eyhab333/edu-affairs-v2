"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronLeft,
  GraduationCap,
  Layers3,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  useVisibleStudents,
  type VisibleStudentClass,
  type VisibleStudentRow,
  type VisibleStudentsData,
} from "@/hooks/use-visible-students";

type StaffActorLike = {
  orgId?: string;
  visibleClasses?: VisibleStudentClass[];
};

function getClassTitle(item: VisibleStudentClass) {
  return item.title || item.code || item.id;
}

function buildClassKey(item: VisibleStudentClass) {
  return [item.schoolId ?? "", item.academicYearId ?? "", item.id ?? ""].join(
    "::",
  );
}

function buildClassHref(item: VisibleStudentClass) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(item.id)}${
    query ? `?${query}` : ""
  }`;
}

function matchesSearch(row: VisibleStudentRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const haystack = [
    row.displayName,
    row.studentId,
    row.nationalId,
    row.phone,
    row.email,
    row.classTitle,
    row.schoolName,
    row.gradeTitle,
    row.academicYearTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function matchesClass(row: VisibleStudentRow, selectedClassKey: string) {
  if (selectedClassKey === "ALL") return true;

  const rowClassKey = [
    row.schoolId ?? "",
    row.academicYearId ?? "",
    row.classId ?? "",
  ].join("::");

  return rowClassKey === selectedClassKey;
}

export default function StaffStudentsPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("ALL");

  const visibleClasses = useMemo(() => {
    return staffActor?.visibleClasses ?? [];
  }, [staffActor]);

  const visibleStudents = useVisibleStudents({
    orgId: staffActor?.orgId ?? "",
    visibleClasses,
    enabled: !!staffActor?.orgId,
  });

  const classOptions = useMemo(() => {
    return [...visibleClasses].sort((a, b) => {
      const schoolCompare = (a.schoolName || a.schoolId || "").localeCompare(
        b.schoolName || b.schoolId || "",
        "ar",
      );

      if (schoolCompare !== 0) return schoolCompare;

      return getClassTitle(a).localeCompare(getClassTitle(b), "ar");
    });
  }, [visibleClasses]);

  const rows = visibleStudents.data?.rows ?? [];

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => matchesClass(row, selectedClassKey))
      .filter((row) => matchesSearch(row, searchQuery));
  }, [rows, selectedClassKey, searchQuery]);

  if (!staffActor) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل بيانات المستخدم...
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Milestone 6D
              </p>

              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  طلابي
                </h1>

                <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                  قائمة تشغيلية تجمع الطلاب النشطين داخل كل الفصول المرئية
                  للمستخدم الحالي.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowRight className="h-4 w-4" />
                الرئيسية
              </Link>

              <Link
                href="/staff/classes"
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <BookOpen className="h-4 w-4" />
                فصولي
              </Link>
            </div>
          </div>

          {/* <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
            <span className="font-semibold">مصدر البيانات:</span> الطلاب هنا
            يأتون من <span className="font-mono">studentEnrollments</span>{" "}
            النشطة المرتبطة بالفصول الموجودة داخل{" "}
            <span className="font-mono">actor.visibleClasses</span>.
          </div> */}
        </div>

        <StudentsSummaryCards
          data={visibleStudents.data}
          loading={visibleStudents.loading}
          visibleClassCount={visibleClasses.length}
        />

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1fr_280px]">
          <div className="relative">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ابحث باسم الطالب أو رقم الطالب أو الفصل..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-11 pl-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-400"
            />
          </div>

          <select
            value={selectedClassKey}
            onChange={(event) => setSelectedClassKey(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950 dark:focus:border-emerald-400"
          >
            <option value="ALL">كل الفصول</option>

            {classOptions.map((item) => (
              <option key={buildClassKey(item)} value={buildClassKey(item)}>
                {getClassTitle(item)}
                {item.schoolName ? ` — ${item.schoolName}` : ""}
              </option>
            ))}
          </select>
        </div>

        <VisibleStudentsContent
          data={visibleStudents.data}
          rows={filteredRows}
          loading={visibleStudents.loading}
          error={visibleStudents.error}
          hasFilters={!!searchQuery.trim() || selectedClassKey !== "ALL"}
        />
      </section>
    </main>
  );
}

function StudentsSummaryCards({
  data,
  loading,
  visibleClassCount,
}: {
  data: VisibleStudentsData | null;
  loading: boolean;
  visibleClassCount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        icon={UsersRound}
        label="إجمالي الطلاب"
        value={loading ? "..." : String(data?.totalCount ?? 0)}
      />

      <SummaryCard
        icon={Layers3}
        label="فصول بها طلاب"
        value={loading ? "..." : String(data?.classCount ?? 0)}
      />

      <SummaryCard
        icon={BookOpen}
        label="الفصول المرئية"
        value={String(visibleClassCount)}
      />

      <SummaryCard
        icon={Building2}
        label="مدارس بها طلاب"
        value={loading ? "..." : String(data?.schoolCount ?? 0)}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>

        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function VisibleStudentsContent({
  data,
  rows,
  loading,
  error,
  hasFilters,
}: {
  data: VisibleStudentsData | null;
  rows: VisibleStudentRow[];
  loading: boolean;
  error: string | null;
  hasFilters: boolean;
}) {
  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-800 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
        حدث خطأ أثناء قراءة الطلاب: {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
    );
  }

  if (data && (data.missingStudentCount > 0 || data.missingPersonCount > 0)) {
    return (
      <div className="flex gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />

        <div>
          <p className="font-bold">توجد بيانات تحتاج مراجعة</p>

          <p className="mt-1">
            {data.missingStudentCount > 0 ? (
              <span>{data.missingStudentCount} تسجيل بدون سجل طالب. </span>
            ) : null}

            {data.missingPersonCount > 0 ? (
              <span>{data.missingPersonCount} طالب بدون بيانات شخص.</span>
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <UsersRound className="h-6 w-6" />
        </div>

        <h2 className="mt-4 text-lg font-bold">
          {hasFilters ? "لا توجد نتائج مطابقة" : "لا يوجد طلاب ظاهرون"}
        </h2>

        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
          {hasFilters
            ? "جرّب تغيير البحث أو اختيار فصل آخر."
            : "تأكد من وجود studentEnrollments نشطة مرتبطة بالفصول المرئية للمستخدم."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <StudentCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function StudentCard({ row }: { row: VisibleStudentRow }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-900">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {row.displayName.slice(0, 1)}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{row.displayName}</h2>

          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            رقم الطالب: {row.studentId}
          </p>

          {row.nationalId ? (
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              السجل المدني: {row.nationalId}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-sm">
        <InfoRow label="الفصل" value={row.classTitle} />
        <InfoRow label="المدرسة" value={row.schoolName || "غير محدد"} />
        <InfoRow label="الصف / المستوى" value={row.gradeTitle || "غير محدد"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={buildClassHref(row.classInfo)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          فتح الفصل
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <Link
          href={`/staff/students/${encodeURIComponent(row.studentId)}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <UserRound className="h-4 w-4" />
          بطاقة الطالب
        </Link>
      </div>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-3 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="truncate text-left font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
