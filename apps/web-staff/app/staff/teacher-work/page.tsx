"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UsersRound } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { canAccessTeacherWork } from "@/lib/teacher-work-access";
import {
  loadTeacherWorkSummaries,
  teacherWorkMetricLabels,
  teacherWorkMetricOrder,
  type TeacherWorkSummary,
} from "@/lib/teacher-work";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تحميل أعمال المعلمين.";
}

function Chips({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items.length) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 4).map((item) => (
        <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {item}
        </span>
      ))}
      {items.length > 4 ? (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          +{items.length - 4}
        </span>
      ) : null}
    </div>
  );
}

function TeacherCard({ teacher }: { teacher: TeacherWorkSummary }) {
  return (
    <article className="flex min-h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-bold text-foreground">{teacher.displayName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {teacher.schoolNames.join(" • ") || "المدرسة ضمن نطاقك"}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">المواد</p>
          <Chips items={teacher.subjectLabels} emptyLabel="لا توجد مواد معروضة" />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">الفصول</p>
          <Chips items={teacher.classLabels} emptyLabel="لا توجد فصول معروضة" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {teacherWorkMetricOrder.map((key) => (
          <div key={key} className="rounded-xl bg-muted/60 px-2 py-2.5 text-center">
            <p className="text-base font-bold text-foreground">{teacher.metrics[key].count.toLocaleString("ar-SA")}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{teacherWorkMetricLabels[key]}</p>
          </div>
        ))}
      </div>

      <Button asChild className="mt-5 w-full">
        <Link href={`/staff/teacher-work/${encodeURIComponent(teacher.teacherPersonId)}`}>
          عرض الأعمال
          <ArrowLeft className="size-4" />
        </Link>
      </Button>
    </article>
  );
}

export default function TeacherWorkPage() {
  const { actor } = useStaffActor();
  const [teachers, setTeachers] = useState<TeacherWorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const canAccess = canAccessTeacherWork(actor);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      setTeachers(
        await loadTeacherWorkSummaries({
          orgId: actor.orgId,
          academicYearId: actor.currentTerm?.academicYearId,
        }),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [actor, canAccess]);

  useEffect(() => {
    if (canAccess) void load();
    else setLoading(false);
  }, [canAccess, load]);

  const visibleTeachers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return teachers.filter((teacher) => {
      const matchesSchool = !schoolId || teacher.schoolIds.includes(schoolId);
      const matchesSearch = !normalizedSearch || teacher.displayName.toLocaleLowerCase("ar").includes(normalizedSearch);
      return matchesSchool && matchesSearch;
    });
  }, [schoolId, search, teachers]);

  if (!canAccess) return null;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
      <section>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UsersRound className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">متابعة أعمال المعلمين</h1>
            <p className="mt-1 text-sm text-muted-foreground">عرض ومتابعة الأعمال المسجلة للمعلمين.</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {actor.schools.length > 1 ? (
          <select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm sm:w-56">
            <option value="">كل المدارس</option>
            {actor.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </select>
        ) : null}
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم المعلم" className="h-10 w-full rounded-xl border bg-background pr-9 pl-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring" />
        </label>
      </section>

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>إعادة المحاولة</Button>
        </section>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل الأعمال…</div>
      ) : visibleTeachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد معلمون نشطون ضمن النطاق المحدد.</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTeachers.map((teacher) => <TeacherCard key={teacher.teacherPersonId} teacher={teacher} />)}
        </section>
      )}
    </main>
  );
}
