"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db } from "@/lib/firebase";
import { getLessonPrepReviewSchoolIds } from "@/lib/lesson-prep-review-policy";

type SubjectLessonPrepRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId?: string;
  termId: string;
  termTitle?: string;
  termShortTitle?: string;
  classId: string;
  classSubjectOfferingId: string;
  subjectKey?: string;
  lessonTitle?: string;
  lessonDate?: string;
  submittedAt?: number | null;
  teacherPersonId?: string;
  teacherDisplayName?: string;
  teacherName?: string;
};

type FilterState = {
  schoolId: string;
  subjectId: string;
  classId: string;
  teacherId: string;
};

type FilterOption = {
  value: string;
  label: string;
};

const EMPTY_FILTERS: FilterState = {
  schoolId: "",
  subjectId: "",
  classId: "",
  teacherId: "",
};

function text(value: unknown, fallback = "غير محدد") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatDateTime(value?: number | null) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function formatWaitingTime(value?: number | null) {
  if (!value) return "وقت الإرسال غير محدد";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (elapsedMinutes < 60) {
    const minutes = Math.max(1, elapsedMinutes);
    return `منذ ${
      minutes === 1 ? "دقيقة" : minutes === 2 ? "دقيقتين" : `${minutes} دقائق`
    }`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `منذ ${
      elapsedHours === 1
        ? "ساعة"
        : elapsedHours === 2
          ? "ساعتين"
          : `${elapsedHours} ساعات`
    }`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `منذ ${
    elapsedDays === 1
      ? "يوم"
      : elapsedDays === 2
        ? "يومين"
        : `${elapsedDays} أيام`
  }`;
}

function isLate(value?: number | null) {
  return Boolean(value && Date.now() - value > 24 * 60 * 60 * 1000);
}

function buildPrepHref(prep: SubjectLessonPrepRow) {
  const search = new URLSearchParams({
    schoolId: prep.schoolId,
    academicYearId: prep.academicYearId,
    termId: prep.termId,
    termTitle: prep.termTitle || "",
    termShortTitle: prep.termShortTitle || "",
    gradeId: prep.gradeId || "",
    subjectKey: prep.subjectKey || "",
  });

  return `/staff/classes/${encodeURIComponent(
    prep.classId,
  )}/subjects/${encodeURIComponent(
    prep.classSubjectOfferingId,
  )}/lesson-prep/${encodeURIComponent(prep.id)}?${search.toString()}`;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">{label}: الكل</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LessonPrepApprovalsPage() {
  const { actor } = useStaffActor();
  const personId = actor.personId || "";
  const reviewSchoolIds = useMemo(
    () => getLessonPrepReviewSchoolIds(personId),
    [personId],
  );
  const [rows, setRows] = useState<SubjectLessonPrepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [collapsedSchools, setCollapsedSchools] = useState<Set<string>>(
    () => new Set(),
  );

  const schoolNames = useMemo(
    () =>
      new Map(
        actor.schools.map((school) => [school.id, school.name || school.id]),
      ),
    [actor.schools],
  );
  const classNames = useMemo(
    () =>
      new Map(actor.classes.map((item) => [item.id, item.title || item.id])),
    [actor.classes],
  );
  const subjectNames = useMemo(
    () =>
      new Map(
        actor.classSubjectOfferings.map((offering) => [
          offering.id,
          offering.displayName ||
            offering.subjectTitleSnapshot ||
            offering.subjectKey ||
            offering.id,
        ]),
      ),
    [actor.classSubjectOfferings],
  );

  const loadSubmittedPreps = useCallback(async () => {
    if (!actor.orgId || reviewSchoolIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const prepsRef = collection(db, "orgs", actor.orgId, "subjectLessonPreps");
      const snapshots = await Promise.all(
        reviewSchoolIds.map((schoolId) =>
          getDocs(
            query(
              prepsRef,
              where("status", "==", "SUBMITTED"),
              where("schoolId", "==", schoolId),
            ),
          ),
        ),
      );

      const nextRows = snapshots.flatMap((snapshot) =>
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as SubjectLessonPrepRow,
        ),
      );

      setRows(nextRows);
    } catch (error) {
      setRows([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "تعذر تحميل التحاضير المرسلة.",
      );
    } finally {
      setLoading(false);
    }
  }, [actor.orgId, reviewSchoolIds]);

  useEffect(() => {
    void loadSubmittedPreps();
  }, [loadSubmittedPreps]);

  const schoolOptions = useMemo<FilterOption[]>(() => {
    const values = new Set(rows.map((row) => row.schoolId));
    return [...values]
      .map((value) => ({
        value,
        label: schoolNames.get(value) || value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows, schoolNames]);

  const subjectOptions = useMemo<FilterOption[]>(() => {
    const values = new Set(rows.map((row) => row.classSubjectOfferingId));
    return [...values]
      .map((value) => ({
        value,
        label:
          subjectNames.get(value) ||
          text(rows.find((row) => row.classSubjectOfferingId === value)?.subjectKey),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows, subjectNames]);

  const classOptions = useMemo<FilterOption[]>(() => {
    const values = new Set(rows.map((row) => row.classId));
    return [...values]
      .map((value) => ({
        value,
        label: classNames.get(value) || value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows, classNames]);

  const teacherOptions = useMemo<FilterOption[]>(() => {
    const values = new Map<string, string>();
    rows.forEach((row) => {
      const value =
        row.teacherPersonId || row.teacherDisplayName || row.teacherName || "";
      if (value) {
        values.set(
          value,
          row.teacherDisplayName || row.teacherName || row.teacherPersonId || value,
        );
      }
    });

    return [...values]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("ar");

    return rows
      .filter((row) => {
        const teacher = text(
          row.teacherDisplayName || row.teacherName || row.teacherPersonId,
          "",
        ).toLocaleLowerCase("ar");
        const lessonTitle = text(row.lessonTitle, "").toLocaleLowerCase("ar");
        const teacherValue =
          row.teacherPersonId || row.teacherDisplayName || row.teacherName || "";

        return (
          (!normalizedSearch ||
            teacher.includes(normalizedSearch) ||
            lessonTitle.includes(normalizedSearch)) &&
          (!filters.schoolId || row.schoolId === filters.schoolId) &&
          (!filters.subjectId || row.classSubjectOfferingId === filters.subjectId) &&
          (!filters.classId || row.classId === filters.classId) &&
          (!filters.teacherId || teacherValue === filters.teacherId)
        );
      })
      .sort(
        (a, b) =>
          (a.submittedAt ?? Number.MAX_SAFE_INTEGER) -
          (b.submittedAt ?? Number.MAX_SAFE_INTEGER),
      );
  }, [filters, rows, searchTerm]);

  const schoolGroups = useMemo(() => {
    const groups = new Map<string, SubjectLessonPrepRow[]>();

    filteredRows.forEach((row) => {
      const group = groups.get(row.schoolId) || [];
      group.push(row);
      groups.set(row.schoolId, group);
    });

    return [...groups.entries()]
      .map(([schoolId, schoolRows]) => ({
        schoolId,
        rows: schoolRows,
        name: schoolNames.get(schoolId) || schoolId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [filteredRows, schoolNames]);

  const filtersActive = Boolean(
    searchTerm.trim() ||
      filters.schoolId ||
      filters.subjectId ||
      filters.classId ||
      filters.teacherId,
  );

  const todayCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = Date.now();

    return rows.filter(
      (row) =>
        typeof row.submittedAt === "number" &&
        row.submittedAt >= todayStart.getTime() &&
        row.submittedAt <= now,
    ).length;
  }, [rows]);

  const lateCount = useMemo(
    () => rows.filter((row) => isLate(row.submittedAt)).length,
    [rows],
  );

  function clearFilters() {
    setSearchTerm("");
    setFilters(EMPTY_FILTERS);
  }

  function updateFilter(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSchool(schoolId: string) {
    setCollapsedSchools((current) => {
      const next = new Set(current);
      if (next.has(schoolId)) next.delete(schoolId);
      else next.add(schoolId);
      return next;
    });
  }

  if (reviewSchoolIds.length === 0) {
    return (
      <main dir="rtl" className="mx-auto max-w-4xl p-4 sm:p-6">
        <section className="rounded-3xl border border-dashed bg-card p-8 text-center shadow-sm">
          <BookOpenCheck className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">لا توجد صلاحية لاعتماد التحاضير</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            هذه الصفحة متاحة فقط للمراجعين المحددين مؤقتًا.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <BookOpenCheck className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">اعتماد التحاضير</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              التحاضير المرسلة بانتظار المراجعة والاعتماد.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="بانتظار المراجعة" value={rows.length} />
          <SummaryCard label="أرسلت اليوم" value={todayCount} />
          <SummaryCard label="متأخرة" value={lateCount} tone="warning" />
        </div>
      </section>

      {loading ? (
        <section className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground shadow-sm">
          جارٍ تحميل التحاضير المرسلة…
        </section>
      ) : loadError ? (
        <section className="rounded-3xl border border-destructive/40 bg-card p-5 text-sm text-destructive shadow-sm">
          {loadError}
        </section>
      ) : rows.length === 0 ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600 dark:text-emerald-400" />
          <h2 className="mt-4 text-lg font-bold text-emerald-950 dark:text-emerald-100">
            لا توجد تحاضير بانتظار المراجعة
          </h2>
          <p className="mt-2 text-sm leading-6 text-emerald-800/80 dark:text-emerald-200/80">
            لا توجد تحاضير مرسلة بانتظار المراجعة حاليًا.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="size-4 text-primary" />
              <span>تصفية التحاضير</span>
              {filtersActive ? (
                <span className="mr-auto text-xs font-normal text-muted-foreground">
                  يعرض {filteredRows.length} من {rows.length} تحضيرًا
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(130px,1fr))]">
              <label className="relative min-w-0">
                <span className="sr-only">البحث</span>
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث باسم المعلم أو الدرس..."
                  className="h-10 w-full rounded-xl border border-border bg-background py-2 pl-3 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <FilterSelect
                label="المدرسة"
                value={filters.schoolId}
                options={schoolOptions}
                onChange={(value) => updateFilter("schoolId", value)}
              />
              <FilterSelect
                label="المادة"
                value={filters.subjectId}
                options={subjectOptions}
                onChange={(value) => updateFilter("subjectId", value)}
              />
              <FilterSelect
                label="الفصل"
                value={filters.classId}
                options={classOptions}
                onChange={(value) => updateFilter("classId", value)}
              />
              <FilterSelect
                label="المعلم"
                value={filters.teacherId}
                options={teacherOptions}
                onChange={(value) => updateFilter("teacherId", value)}
              />
            </div>

            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-medium text-primary transition hover:text-primary/80"
              >
                مسح الفلاتر
              </button>
            ) : null}
          </section>

          {filteredRows.length === 0 ? (
            <section className="rounded-3xl border border-dashed bg-card p-8 text-center shadow-sm">
              <Search className="mx-auto size-9 text-muted-foreground" />
              <h2 className="mt-3 font-bold">لا توجد نتائج مطابقة للفلاتر الحالية</h2>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm font-semibold text-primary hover:text-primary/80"
              >
                مسح الفلاتر
              </button>
            </section>
          ) : (
            <div className="space-y-4">
              {schoolGroups.map((group) => {
                const isCollapsed = collapsedSchools.has(group.schoolId);

                return (
                  <section
                    key={group.schoolId}
                    className="overflow-hidden rounded-3xl border bg-card shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSchool(group.schoolId)}
                      className="flex w-full items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3 text-right transition hover:bg-muted/40 sm:px-5"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="min-w-0 truncate font-bold text-foreground">
                        {group.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {group.rows.length}
                        </span>
                        {isCollapsed ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>

                    {!isCollapsed ? (
                      <div className="divide-y divide-border">
                        {group.rows.map((prep) => (
                          <LessonPrepCard
                            key={prep.id}
                            prep={prep}
                            schoolName={group.name}
                            className={classNames.get(prep.classId) || prep.classId}
                            subjectName={
                              subjectNames.get(prep.classSubjectOfferingId) ||
                              text(prep.subjectKey)
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-2xl border bg-background/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={
            tone === "warning"
              ? "text-lg font-bold text-amber-700 dark:text-amber-300"
              : "text-lg font-bold text-foreground"
          }
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function LessonPrepCard({
  prep,
  schoolName,
  className,
  subjectName,
}: {
  prep: SubjectLessonPrepRow;
  schoolName: string;
  className: string;
  subjectName: string;
}) {
  const late = isLate(prep.submittedAt);

  return (
    <article className="flex flex-col gap-4 px-4 py-4 transition hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0 space-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {text(
              prep.teacherDisplayName || prep.teacherName || prep.teacherPersonId,
              "معلم غير محدد",
            )}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-foreground">
            {text(prep.lessonTitle, "درس غير محدد")}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            {subjectName}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            {className}
          </span>
          <span>{schoolName}</span>
          {prep.lessonDate ? <span>درس: {prep.lessonDate}</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 sm:items-end">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            {formatWaitingTime(prep.submittedAt)}
          </span>
          {late ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">
              متأخر
            </span>
          ) : null}
          <span>{formatDateTime(prep.submittedAt)}</span>
        </div>

        <Link
          href={buildPrepHref(prep)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          فتح التحضير
          <ExternalLink className="size-4" />
        </Link>
      </div>
    </article>
  );
}
