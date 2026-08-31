"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UserRound, UsersRound } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import type { VisibleStudentClass } from "@/hooks/use-visible-students";
import {
  loadStudentWorkOverview,
  studentWorkMetricLabels,
  type StudentWorkSummary,
} from "@/lib/student-work";

type StaffActorLike = { orgId: string; visibleClasses: VisibleStudentClass[] };

function classKey(params: { schoolId: string; academicYearId: string; classId: string }) {
  return `${params.schoolId}::${params.academicYearId}::${params.classId}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تحميل الطلاب.";
}

function metricValue(student: StudentWorkSummary, key: keyof typeof studentWorkMetricLabels) {
  const metric = student.metrics[key];
  return key === "gamification" ? (metric.value ?? 0).toLocaleString("ar-SA") : metric.count.toLocaleString("ar-SA");
}

function StudentCard({ student, classInfo }: { student: StudentWorkSummary; classInfo?: VisibleStudentClass }) {
  const params = new URLSearchParams({ schoolId: student.schoolId, academicYearId: student.academicYearId, classId: student.classId });
  const context = [classInfo?.schoolName || student.schoolId, classInfo?.gradeTitle || student.gradeId, classInfo?.title || classInfo?.code || student.classId].filter(Boolean);

  return (
    <article className="flex min-h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></div>
        <div className="min-w-0"><h2 className="truncate text-base font-bold text-foreground">{student.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">{context.join(" • ") || "ضمن نطاقك"}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {classInfo?.academicYearTitle ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{classInfo.academicYearTitle}</span> : null}
        {student.streamId ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{student.streamId}</span> : null}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(Object.keys(studentWorkMetricLabels) as Array<keyof typeof studentWorkMetricLabels>).map((key) => <div key={key} className="rounded-xl bg-muted/60 px-2 py-2.5 text-center"><p className="text-base font-bold text-foreground">{metricValue(student, key)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{studentWorkMetricLabels[key]}</p></div>)}
      </div>
      <Button asChild className="mt-5 w-full"><Link href={`/staff/students/${encodeURIComponent(student.studentId)}?${params.toString()}`}>عرض ملف الطالب<ArrowLeft className="size-4" /></Link></Button>
    </article>
  );
}

export default function StaffStudentsPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike;
  const [students, setStudents] = useState<StudentWorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("ALL");
  const [selectedClassKey, setSelectedClassKey] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setStudents((await loadStudentWorkOverview({ orgId: staffActor.orgId, period: "MONTH" })).students); }
    catch (nextError) { setError(errorMessage(nextError)); }
    finally { setLoading(false); }
  }, [staffActor.orgId]);
  useEffect(() => { void load(); }, [load]);

  const classByKey = useMemo(() => new Map(staffActor.visibleClasses.map((item) => [classKey({ schoolId: item.schoolId ?? "", academicYearId: item.academicYearId ?? "", classId: item.id }), item])), [staffActor.visibleClasses]);
  const classes = useMemo(() => {
    const studentClassKeys = new Set(students.map((student) => classKey(student)));
    return [...classByKey.entries()]
      .filter(([key]) => studentClassKeys.has(key))
      .sort(([, left], [, right]) => (left.schoolName || left.schoolId || "").localeCompare(right.schoolName || right.schoolId || "", "ar") || (left.title || left.code || left.id).localeCompare(right.title || right.code || right.id, "ar"));
  }, [classByKey, students]);
  const schools = useMemo(() => {
    const names = new Map<string, string>();
    for (const student of students) {
      const classInfo = classByKey.get(classKey(student));
      names.set(student.schoolId, classInfo?.schoolName || student.schoolId);
    }
    return [...names.entries()].sort(([, left], [, right]) => left.localeCompare(right, "ar"));
  }, [classByKey, students]);
  useEffect(() => {
    if (selectedSchoolId === "ALL" || selectedClassKey === "ALL") return;
    if (classByKey.get(selectedClassKey)?.schoolId !== selectedSchoolId) {
      setSelectedClassKey("ALL");
    }
  }, [classByKey, selectedClassKey, selectedSchoolId]);
  const filteredStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    return students.filter((student) => {
      const key = classKey(student); const info = classByKey.get(key);
      const haystack = [student.displayName, student.studentId, info?.title, info?.schoolName, info?.gradeTitle].filter(Boolean).join(" ").toLocaleLowerCase("ar");
      return (selectedSchoolId === "ALL" || student.schoolId === selectedSchoolId) && (selectedClassKey === "ALL" || selectedClassKey === key) && (!query || haystack.includes(query));
    });
  }, [classByKey, search, selectedClassKey, selectedSchoolId, students]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
      <section className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><UsersRound className="size-5" /></div><div><h1 className="text-2xl font-bold tracking-tight">طلابي</h1><p className="mt-1 text-sm text-muted-foreground"> </p></div></section>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {schools.length > 1 ? <select value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm sm:w-56"><option value="ALL">كل المدارس</option>{schools.map(([schoolId, schoolName]) => <option key={schoolId} value={schoolId}>{schoolName}</option>)}</select> : null}
        <select value={selectedClassKey} onChange={(event) => setSelectedClassKey(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm sm:w-64"><option value="ALL">كل الفصول</option>{classes.filter(([, item]) => selectedSchoolId === "ALL" || item.schoolId === selectedSchoolId).map(([key, item]) => <option key={key} value={key}>{item.title || item.code || item.id}{item.schoolName ? ` — ${item.schoolName}` : ""}</option>)}</select>
        <label className="relative block min-w-0 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الطالب" className="h-10 w-full rounded-xl border bg-background pr-9 pl-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring" /></label>
      </section>
      {error ? <section className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>إعادة المحاولة</Button></section> : null}
      {loading ? <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" />جارٍ تحميل الطلاب…</div> : null}
      {!loading && !error && filteredStudents.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا يوجد طلاب نشطون ضمن النطاق المحدد.</div> : null}
      {!loading && !error && filteredStudents.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredStudents.map((student) => <StudentCard key={student.enrollmentId} student={student} classInfo={classByKey.get(classKey(student))} />)}</section> : null}
    </main>
  );
}
