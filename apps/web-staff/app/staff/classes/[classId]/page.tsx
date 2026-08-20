"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, HeartHandshake } from "lucide-react";

import { buildClassSubjectWorkspaces } from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { PrimaryClassSubjectsSection } from "@/components/staff/classes/primary-class-subjects-section";
import { useClassStudents } from "@/hooks/use-class-students";
import { getFriendlyClassTitle } from "@/lib/class-presentation";

import {
  InfoRow,
  OperationWorkspaceCard,
} from "./_components/class-page-cards";
import {
  buildClassDomainsAnchorHref,
  buildClassesHref,
  buildLearningLossHref,
  buildOperationCards,
  getCurrentTermForClass,
  getParamValue,
  getStudentCount,
  isPrimaryClass,
  matchesClassSubjectOfferingContext,
  matchesRequestedClass,
} from "./_components/class-page-helpers";
import { ClassStudentsSection } from "./_components/class-students-section";
import { ClassSubjectWorkspacesSection } from "./_components/class-subject-workspaces-section";
import type { StaffActorLike } from "./_components/class-page-types";

export default function StaffClassDetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;

  const classId = decodeURIComponent(getParamValue(params.classId));
  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");

  const classes = useMemo(() => {
    return staffActor?.visibleClasses ?? [];
  }, [staffActor]);

  const classInfo = useMemo(() => {
    return (
      classes.find((item) =>
        matchesRequestedClass(item, classId, schoolId, academicYearId),
      ) ??
      classes.find((item) => item.id === classId) ??
      null
    );
  }, [classes, classId, schoolId, academicYearId]);

  const currentTerm = useMemo(() => {
    return getCurrentTermForClass(staffActor, classInfo);
  }, [staffActor, classInfo]);

  const contextualClassSubjectOfferings = useMemo(() => {
    if (!staffActor || !classInfo) return [];

    return (staffActor.classSubjectOfferings ?? []).filter((offering) =>
      matchesClassSubjectOfferingContext(offering, classInfo),
    );
  }, [staffActor, classInfo]);

  const classSubjectWorkspaces = useMemo(() => {
    if (!staffActor || !classInfo) return [];

    return buildClassSubjectWorkspaces({
      actorPersonId: staffActor.personId || staffActor.uid || "",
      actorRoleKeys: staffActor.roles ?? [],
      classId: classInfo.id,
      classSubjectOfferings: contextualClassSubjectOfferings,
      teacherAssignments: staffActor.teacherAssignments ?? [],
      teacherAssignmentClassLinks: staffActor.teacherAssignmentClassLinks ?? [],
      includeInactiveOfferingsForAdmins: false,
    });
  }, [staffActor, classInfo, contextualClassSubjectOfferings]);

  const resolvedOrgId = classInfo?.orgId || staffActor?.orgId || "";
  const resolvedSchoolId = classInfo?.schoolId || schoolId || "";
  const resolvedAcademicYearId =
    classInfo?.academicYearId || academicYearId || "";

  const classStudents = useClassStudents({
    orgId: resolvedOrgId,
    classId,
    schoolId: resolvedSchoolId,
    academicYearId: resolvedAcademicYearId,
    enabled: !!classInfo && !!resolvedOrgId,
  });

  const operationCards = useMemo(() => {
    return classInfo ? buildOperationCards(classInfo) : [];
  }, [classInfo]);

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

  if (!classInfo) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-5">
          <Link
            href={buildClassesHref()}
            className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى فصولي
          </Link>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-700 dark:text-amber-300" />
            <h1 className="mt-4 text-xl font-bold">لم يتم العثور على الفصل</h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-amber-900 dark:text-amber-100">
              لم يتم العثور على الفصل أو أنه خارج نطاق صلاحياتك.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const estimatedStudentCount = getStudentCount(classInfo);
  const studentCount = classStudents.data?.totalCount ?? estimatedStudentCount;
  const termTitle =
    currentTerm?.title ||
    currentTerm?.shortTitle ||
    (currentTerm ? "الفصل الدراسي الحالي" : null);
  const metadata = [
    termTitle,
    `${classSubjectWorkspaces.length} مادة`,
    studentCount !== null ? `${studentCount} طالبًا` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="space-y-3">
          <Link
            href={buildClassesHref()}
            className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى فصولي
          </Link>

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {getFriendlyClassTitle(classInfo, classes)}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {metadata}
            </p>
          </div>
        </header>

        {!currentTerm ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            لم يتم تحديد الفصل الدراسي الحالي.
          </div>
        ) : null}

        {isPrimaryClass(classInfo) ? (
          <PrimaryClassSubjectsSection
            classInfo={classInfo}
            workspaces={classSubjectWorkspaces}
            currentTerm={currentTerm}
          />
        ) : (
          <ClassSubjectWorkspacesSection
            classInfo={classInfo}
            workspaces={classSubjectWorkspaces}
            currentTerm={currentTerm}
          />
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <HeartHandshake className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-bold">أعمال الفصل</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                مهام عامة مرتبطة بهذا الفصل.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {operationCards.map((item) => (
              <OperationWorkspaceCard key={item.title} item={item} />
            ))}
          </div>
        </section>

        <ClassStudentsSection
          data={classStudents.data}
          loading={classStudents.loading}
          error={classStudents.error}
          measurementHref={buildClassDomainsAnchorHref()}
          learningLossHref={buildLearningLossHref(classInfo)}
        />

        <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-600 outline-none transition hover:text-slate-950 focus-visible:ring-4 focus-visible:ring-emerald-500/20 dark:text-slate-300 dark:hover:text-slate-50">
            تفاصيل تقنية
          </summary>

          <div className="grid gap-2 border-t border-slate-100 p-4 text-sm dark:border-slate-800">
            <InfoRow label="classId" value={classInfo.id} />
            <InfoRow label="code" value={classInfo.code || "غير محدد"} />
            <InfoRow label="schoolId" value={classInfo.schoolId || "غير محدد"} />
            <InfoRow
              label="academicYearId"
              value={classInfo.academicYearId || "غير محدد"}
            />
            <InfoRow label="termId" value={currentTerm?.id || "غير محدد"} />
            <InfoRow label="gradeId" value={classInfo.gradeId || "غير محدد"} />
            <InfoRow
              label="streamId"
              value={classInfo.streamId || "غير محدد"}
            />
            <InfoRow
              label="order"
              value={
                typeof classInfo.order === "number"
                  ? String(classInfo.order)
                  : "غير محدد"
              }
            />
          </div>
        </details>
      </section>
    </main>
  );
}
