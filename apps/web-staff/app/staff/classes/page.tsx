"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Search, UsersRound } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  getFriendlyClassTitle,
  isTechnicalIdentifier,
  normalizeText,
} from "@/lib/class-presentation";

type StaffVisibleClass = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  streamId?: string;
  code?: string;
  title?: string;
  sectionLabel?: string;
  order?: number;
  studentCount?: number;
  studentsCount?: number;
  enrolledStudentCount?: number;
  schoolName?: string;
  gradeTitle?: string;
  academicYearTitle?: string;
};

type StaffClassSubjectOffering = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  subjectId?: string;
  subjectKey?: string;
  subjectTitleSnapshot?: string;
  displayName?: string;
  shortLabel?: string;
  status?: string;
  isArchived?: boolean;
  startAt?: number;
  endAt?: number;
  order?: number;
};

type StaffTeacherAssignment = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  teacherPersonId?: string;
  assignmentKind?: string;
  targetScopeType?: string;
  targetScopeId?: string;
  coverageMode?: string;
  subjectKey?: string;
  subjectId?: string;
  classSubjectOfferingId?: string;
  status?: string;
  isActive?: boolean;
  startAt?: number;
  endAt?: number;
};

type StaffTeacherAssignmentClassLink = {
  assignmentId: string;
  classId: string;
  schoolId?: string;
  academicYearId?: string;
  classSubjectOfferingId?: string;
};

type StaffActorLike = {
  personId?: string;
  visibleClasses?: StaffVisibleClass[];
  classSubjectOfferings?: StaffClassSubjectOffering[];
  teacherAssignments?: StaffTeacherAssignment[];
  teacherAssignmentClassLinks?: StaffTeacherAssignmentClassLink[];
};

function getStudentCount(item: StaffVisibleClass) {
  return (
    item.studentCount ??
    item.studentsCount ??
    item.enrolledStudentCount ??
    null
  );
}

function buildClassHref(item: StaffVisibleClass) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(item.id)}${
    query ? `?${query}` : ""
  }`;
}

function isCurrentAssignment(
  assignment: StaffTeacherAssignment,
  nowMs: number,
) {
  if (assignment.isActive === false) return false;
  if (["ENDED", "SUSPENDED", "CANCELLED"].includes(assignment.status ?? "")) {
    return false;
  }

  if (typeof assignment.startAt === "number" && assignment.startAt > nowMs) {
    return false;
  }

  if (typeof assignment.endAt === "number" && assignment.endAt < nowMs) {
    return false;
  }

  return true;
}

function isCurrentOffering(
  offering: StaffClassSubjectOffering,
  nowMs: number,
) {
  if (offering.isArchived) return false;
  if (["ENDED", "ARCHIVED"].includes(offering.status ?? "")) return false;
  if (typeof offering.startAt === "number" && offering.startAt > nowMs) {
    return false;
  }
  if (typeof offering.endAt === "number" && offering.endAt < nowMs) {
    return false;
  }

  return true;
}

function offeringBelongsToClass(
  offering: StaffClassSubjectOffering,
  classItem: StaffVisibleClass,
) {
  return (
    offering.classId === classItem.id &&
    (!offering.schoolId || offering.schoolId === classItem.schoolId) &&
    (!offering.academicYearId ||
      offering.academicYearId === classItem.academicYearId)
  );
}

function assignmentCoversClass(
  assignment: StaffTeacherAssignment,
  classItem: StaffVisibleClass,
  links: StaffTeacherAssignmentClassLink[],
) {
  if (
    assignment.targetScopeType === "CLASS" &&
    assignment.targetScopeId === classItem.id
  ) {
    return true;
  }

  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "SCHOOL" &&
    assignment.targetScopeId === classItem.schoolId
  ) {
    return true;
  }

  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "GRADE" &&
    assignment.targetScopeId === classItem.gradeId
  ) {
    return true;
  }

  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "STREAM" &&
    assignment.targetScopeId === classItem.streamId
  ) {
    return true;
  }

  return links.some(
    (link) =>
      link.assignmentId === assignment.id && link.classId === classItem.id,
  );
}

function getOfferingSubjectName(offering: StaffClassSubjectOffering) {
  const candidates = [
    offering.displayName,
    offering.shortLabel,
    offering.subjectTitleSnapshot,
  ];

  return (
    candidates
      .map(normalizeText)
      .find(
        (value) =>
            Boolean(value) &&
            !isTechnicalIdentifier(value) &&
            ![offering.id, offering.subjectId, offering.subjectKey]
              .filter(Boolean)
              .some(
                (identifier) =>
                  value.toLowerCase() === identifier!.toLowerCase(),
              ),
      ) ?? null
  );
}

function getAssignedSubjectNames(
  classItem: StaffVisibleClass,
  offerings: StaffClassSubjectOffering[],
  assignments: StaffTeacherAssignment[],
  links: StaffTeacherAssignmentClassLink[],
  personId: string | undefined,
  nowMs: number,
) {
  const classOfferings = offerings.filter(
    (offering) =>
      offeringBelongsToClass(offering, classItem) &&
      isCurrentOffering(offering, nowMs),
  );
  const offeringById = new Map(
    classOfferings.map((offering) => [offering.id, offering]),
  );
  const assignedOfferingIds = new Set<string>();

  assignments
    .filter(
      (assignment) =>
        (!personId ||
          !assignment.teacherPersonId ||
          assignment.teacherPersonId === personId) &&
        (!assignment.orgId ||
          !classItem.orgId ||
          assignment.orgId === classItem.orgId) &&
        (!assignment.schoolId ||
          !classItem.schoolId ||
          assignment.schoolId === classItem.schoolId) &&
        (!assignment.academicYearId ||
          !classItem.academicYearId ||
          assignment.academicYearId === classItem.academicYearId) &&
        isCurrentAssignment(assignment, nowMs) &&
        assignmentCoversClass(assignment, classItem, links),
    )
    .forEach((assignment) => {
      if (assignment.classSubjectOfferingId) {
        if (offeringById.has(assignment.classSubjectOfferingId)) {
          assignedOfferingIds.add(assignment.classSubjectOfferingId);
        }
      }

      links
        .filter(
          (link) =>
            link.assignmentId === assignment.id &&
            link.classId === classItem.id,
        )
        .forEach((link) => {
          if (
            link.classSubjectOfferingId &&
            offeringById.has(link.classSubjectOfferingId)
          ) {
            assignedOfferingIds.add(link.classSubjectOfferingId);
          }
        });

      if (!assignment.classSubjectOfferingId) {
        classOfferings.forEach((offering) => {
          const matchesSubject =
            (assignment.subjectId &&
              offering.subjectId === assignment.subjectId) ||
            (assignment.subjectKey &&
              offering.subjectKey === assignment.subjectKey);

          if (matchesSubject) assignedOfferingIds.add(offering.id);
        });
      }
    });

  return Array.from(assignedOfferingIds)
    .map((offeringId) => offeringById.get(offeringId))
    .filter(
      (offering): offering is StaffClassSubjectOffering => Boolean(offering),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(getOfferingSubjectName)
    .filter((name): name is string => Boolean(name))
    .filter((name, index, names) => names.indexOf(name) === index);
}

function matchesSearch(item: StaffVisibleClass, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const haystack = [
    item.id,
    item.title,
    item.code,
    item.sectionLabel,
    item.schoolId,
    item.schoolName,
    item.gradeId,
    item.gradeTitle,
    item.academicYearId,
    item.academicYearTitle,
    item.streamId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export default function StaffClassesPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;
  const [searchQuery, setSearchQuery] = useState("");

  const classes = useMemo(() => {
    const list = staffActor?.visibleClasses ?? [];

    return [...list].sort((a, b) => {
      const schoolCompare = (a.schoolId ?? "").localeCompare(
        b.schoolId ?? "",
        "ar",
      );

      if (schoolCompare !== 0) return schoolCompare;

      const gradeCompare = (a.gradeId ?? "").localeCompare(
        b.gradeId ?? "",
        "ar",
      );

      if (gradeCompare !== 0) return gradeCompare;

      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [staffActor]);

  const filteredClasses = useMemo(
    () => classes.filter((item) => matchesSearch(item, searchQuery)),
    [classes, searchQuery],
  );

  const gradeCount = useMemo(
    () =>
      new Set(
        classes
          .map((item) => item.gradeId || item.gradeTitle)
          .filter(Boolean),
      ).size,
    [classes],
  );

  const schoolCount = useMemo(
    () => new Set(classes.map((item) => item.schoolId).filter(Boolean)).size,
    [classes],
  );

  const subjectsByClassId = useMemo(() => {
    const nowMs = Date.now();
    const offerings = staffActor?.classSubjectOfferings ?? [];
    const assignments = staffActor?.teacherAssignments ?? [];
    const links = staffActor?.teacherAssignmentClassLinks ?? [];

    return new Map(
      classes.map((classItem) => [
        classItem.id,
        getAssignedSubjectNames(
          classItem,
          offerings,
          assignments,
          links,
          staffActor?.personId,
          nowMs,
        ),
      ]),
    );
  }, [classes, staffActor]);

  if (!staffActor) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto max-w-7xl">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            جاري تحميل بيانات المستخدم...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              فصولي
            </h1>
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-400">
              الفصول والمواد المسندة إليك.
            </p>
          </div>

          <Link
            href="/staff"
            className="inline-flex w-fit items-center gap-1 text-sm text-slate-500 transition hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            <ChevronLeft className="h-4 w-4" />
            الرجوع للرئيسية
          </Link>
        </header>

        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {classes.length} {classes.length === 1 ? "فصل" : "فصول"} · {gradeCount}{" "}
          {gradeCount === 1 ? "صف" : "صفوف"}
          {schoolCount > 1
            ? ` · ${schoolCount} مدارس`
            : ""}
        </p>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث باسم الفصل أو المدرسة أو الصف..."
            aria-label="البحث في الفصول"
            className="h-10 w-full rounded-xl border border-slate-200 bg-transparent pr-10 pl-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:focus:border-emerald-400"
          />
        </div>

        {classes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold">
              لا توجد فصول مسندة إليك حاليًا
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              عند إضافة إسناد جديد سيظهر الفصل هنا تلقائيًا.
            </p>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold">لا توجد نتائج مطابقة</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              جرّب البحث باسم فصل أو مدرسة أو صف آخر.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredClasses.map((item) => {
              const studentCount = getStudentCount(item);
              const subjectNames = subjectsByClassId.get(item.id) ?? [];
              const friendlyTitle = getFriendlyClassTitle(item, classes);

              return (
                <article
                  key={`${item.schoolId ?? "school"}:${item.academicYearId ?? "year"}:${item.id}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-900"
                >
                  <div>
                    <h2 className="text-lg font-bold leading-7">
                      {friendlyTitle}
                    </h2>

                    {subjectNames.length > 0 ? (
                      <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                        {subjectNames.join(" · ")}
                      </p>
                    ) : null}
                  </div>

                  {subjectNames.length > 0 || studentCount !== null ? (
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                      {subjectNames.length > 0 ? (
                        <span>
                          {subjectNames.length}{" "}
                          {subjectNames.length === 1 ? "مادة" : "مواد"}
                        </span>
                      ) : (
                        <span />
                      )}

                      {studentCount !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <UsersRound className="h-3.5 w-3.5" />
                          {studentCount} طالب
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <Link
                    href={buildClassHref(item)}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
                  >
                    فتح الفصل
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
