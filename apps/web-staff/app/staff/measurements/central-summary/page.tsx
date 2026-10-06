"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Printer, RefreshCw, RotateCcw, TableProperties } from "lucide-react";
import type {
  StudentMeasurementBatch,
} from "@takween/contracts";

import { Button } from "@/components/ui/button";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db } from "@/lib/firebase";
import { getFriendlyClassTitle } from "@/lib/class-presentation";
import { getEffectiveMeasurementRows } from "@/lib/measurement-compensation";
import { calculateMeasurementClassSummary } from "@/lib/measurement-class-summary";
import { getFriendlySubjectLabel } from "@/lib/measurement-presentation";

const CENTRAL_MEASUREMENT_1 = "PRIMARY_CENTRAL_MEASUREMENT_1";
const CENTRAL_MEASUREMENT_2 = "PRIMARY_CENTRAL_MEASUREMENT_2";
// Firestore's current `in` query limit is 30 values.
const FIRESTORE_IN_QUERY_LIMIT = 30;

type VisibleClass = {
  id: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
  streamId?: string;
  title?: string;
  code?: string;
  sectionLabel?: string;
};

type ClassSubjectOffering = {
  id: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  subjectKey?: string;
  displayName?: string;
  subjectTitle?: string;
  subjectTitleSnapshot?: string;
  shortLabel?: string;
};

type StaffActorLike = {
  orgId?: string;
  personId?: string;
  roles?: string[];
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
  classSubjectOfferings?: ClassSubjectOffering[];
  teacherAssignments?: Array<{
    personId?: string;
    teacherPersonId?: string;
    schoolId?: string;
    academicYearId?: string;
    classId?: string;
    subjectKey?: string;
  }>;
  schools?: Array<{ id: string; name?: string }>;
  org?: { name?: string; nameAr?: string; shortName?: string } | null;
  currentTerm?: {
    id: string;
    academicYearId: string;
    title?: string;
    shortTitle?: string;
  } | null;
};

type CentralBatch = StudentMeasurementBatch & {
  id: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
};

type SummaryRow = {
  key: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  termId: string;
  subjectKey: string;
  subjectTitle: string;
  classKey: string;
  classTitle: string;
  teacherAssignmentId: string;
  teacherPersonId: string;
  teacherName: string;
  centralMeasurement1?: CentralBatch;
  centralMeasurement2?: CentralBatch;
};

type TeacherDirectoryEntry = {
  teacherPersonId: string;
  teacherName: string;
};

type LoadingState = "idle" | "loading" | "success" | "error";

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => value?.trim() || "").filter(Boolean)));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getClassKey(value: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}) {
  return [value.schoolId || "NO_SCHOOL", value.academicYearId || "NO_YEAR", value.classId || "NO_CLASS"].join(":");
}

function getTeacherSubjectKeysForClass(
  assignments: NonNullable<StaffActorLike["teacherAssignments"]>,
  teacherPersonId: string,
  classInfo: VisibleClass,
) {
  return new Set(
    assignments
      .filter((assignment) => {
        const assignmentPersonId = assignment.teacherPersonId || assignment.personId;
        if (assignmentPersonId && assignmentPersonId !== teacherPersonId) return false;
        if (assignment.classId && assignment.classId !== classInfo.id) return false;
        if (assignment.schoolId && assignment.schoolId !== classInfo.schoolId) return false;
        if (assignment.academicYearId && assignment.academicYearId !== classInfo.academicYearId) return false;
        return Boolean(assignment.subjectKey);
      })
      .map((assignment) => assignment.subjectKey?.trim() || "")
      .filter(Boolean),
  );
}

function isTeacherOnlyActor(actor: StaffActorLike | null) {
  const roleKeys = [...(actor?.roleKeys ?? []), ...(actor?.roles ?? [])].map((role) => role.trim().toUpperCase());
  const hasTeacherRole = roleKeys.includes("TEACHER");
  const hasSupervisorOrAdminRole = roleKeys.some(
    (role) => role.includes("SUPERVIS") || role.includes("ADMIN") || role === "OWNER" || role === "ORG_OWNER",
  );
  return hasTeacherRole && !hasSupervisorOrAdminRole;
}

function getSavedMaxScore(rows: CentralBatch["studentRows"]) {
  return rows
    .map((row) => row.maxScore)
    .find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function getBatchPercentage(params: {
  batch: CentralBatch;
  compensationBatches: CentralBatch[];
  templateMaxScoreById: Map<string, number>;
}) {
  const effectiveRows = getEffectiveMeasurementRows({
    originalBatchId: params.batch.id,
    originalRows: params.batch.studentRows ?? [],
    compensationBatches: params.compensationBatches,
  });
  const savedMaxScore = getSavedMaxScore(effectiveRows);
  const templateMaxScore = params.templateMaxScoreById.get(params.batch.templateId);
  return calculateMeasurementClassSummary({
    rows: effectiveRows,
    maxScore: savedMaxScore ?? templateMaxScore,
  }).percentage;
}

function formatPercentage(value: number | null) {
  if (value === null) return "لم يُرصد";
  return `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value)}%`;
}

async function loadTeacherDirectory(
  orgId: string,
  teacherAssignmentIds: string[],
) {
  const assignmentById = new Map<string, { teacherPersonId: string }>();
  const assignmentsRef = collection(db, "orgs", orgId, "teacherAssignments");

  const assignmentSnapshots = await Promise.all(
    chunkValues(teacherAssignmentIds, FIRESTORE_IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(assignmentsRef, where(documentId(), "in", ids))),
    ),
  );

  assignmentSnapshots.flatMap((snapshot) => snapshot.docs).forEach((snapshot) => {
    const data = snapshot.data() as { teacherPersonId?: string };
    const teacherPersonId = data.teacherPersonId?.trim() || "";
    if (teacherPersonId) assignmentById.set(snapshot.id, { teacherPersonId });
  });

  const personIds = uniqueStrings(Array.from(assignmentById.values()).map((assignment) => assignment.teacherPersonId));
  const personNameById = new Map<string, string>();
  const peopleRef = collection(db, "orgs", orgId, "people");

  const personSnapshots = await Promise.all(
    chunkValues(personIds, FIRESTORE_IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(peopleRef, where(documentId(), "in", ids))),
    ),
  );

  personSnapshots.flatMap((snapshot) => snapshot.docs).forEach((snapshot) => {
    const data = snapshot.data() as { displayName?: string };
    const displayName = data.displayName?.trim() || "";
    if (displayName) personNameById.set(snapshot.id, displayName);
  });

  return new Map<string, TeacherDirectoryEntry>(
    Array.from(assignmentById.entries()).map(([assignmentId, assignment]) => [
      assignmentId,
      {
        teacherPersonId: assignment.teacherPersonId,
        teacherName:
          personNameById.get(assignment.teacherPersonId) || "غير محدد",
      },
    ] as const),
  );
}

async function loadTemplateMaxScores(orgId: string, templateIds: string[]) {
  if (!templateIds.length) return new Map<string, number>();

  const templatesRef = collection(db, "orgs", orgId, "studentAssessmentTemplates");
  const snapshots = await Promise.all(
    chunkValues(templateIds, FIRESTORE_IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(templatesRef, where(documentId(), "in", ids))),
    ),
  );

  const maxScoreById = new Map<string, number>();
  snapshots.flatMap((snapshot) => snapshot.docs).forEach((snapshot) => {
    const data = snapshot.data() as { maxScore?: unknown };
    if (typeof data.maxScore === "number" && Number.isFinite(data.maxScore)) {
      maxScoreById.set(snapshot.id, data.maxScore);
    }
  });
  return maxScoreById;
}

function getSubjectTitle(params: {
  batch: CentralBatch;
  offerings: ClassSubjectOffering[];
}) {
  const offering = params.offerings.find(
    (item) =>
      item.schoolId === params.batch.schoolId &&
      item.academicYearId === params.batch.academicYearId &&
      item.classId === params.batch.classId &&
      item.subjectKey === params.batch.subjectKey,
  );
  return (
    offering?.displayName?.trim() ||
    offering?.subjectTitle?.trim() ||
    offering?.subjectTitleSnapshot?.trim() ||
    offering?.shortLabel?.trim() ||
    getFriendlySubjectLabel(params.batch.subjectKey) ||
    params.batch.subjectKey ||
    "مادة غير محددة"
  );
}

export default function StaffCentralMeasurementSummaryPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;
  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState("");
  const [batches, setBatches] = useState<CentralBatch[]>([]);
  const [compensationBatches, setCompensationBatches] = useState<CentralBatch[]>([]);
  const [teacherDirectoryByAssignmentId, setTeacherDirectoryByAssignmentId] = useState<
    Map<string, TeacherDirectoryEntry>
  >(new Map());
  const [templateMaxScoreById, setTemplateMaxScoreById] = useState<Map<string, number>>(new Map());
  const [schoolFilter, setSchoolFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");

  const orgId = staffActor?.orgId?.trim() || "";
  const currentTerm = staffActor?.currentTerm ?? null;
  const visibleClasses = useMemo(() => staffActor?.visibleClasses ?? [], [staffActor?.visibleClasses]);
  const offerings = useMemo(() => staffActor?.classSubjectOfferings ?? [], [staffActor?.classSubjectOfferings]);
  const visibleClassByKey = useMemo(
    () => new Map(visibleClasses.map((item) => [getClassKey({ ...item, classId: item.id }), item])),
    [visibleClasses],
  );
  const teacherOnly = isTeacherOnlyActor(staffActor);
  const teacherPersonId = staffActor?.personId?.trim() || "";
  const teacherAssignments = staffActor?.teacherAssignments ?? [];

  const loadSummary = useCallback(async () => {
    if (!orgId || !currentTerm?.academicYearId || !currentTerm.id) return;
    if (visibleClasses.length === 0) {
      setBatches([]);
      setCompensationBatches([]);
      setTeacherDirectoryByAssignmentId(new Map());
      setTemplateMaxScoreById(new Map());
      setStatus("success");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const batchesRef = collection(db, "orgs", orgId, "studentMeasurementBatches");
      const visibleSchoolIds = uniqueStrings(
        visibleClasses.map((classInfo) => classInfo.schoolId),
      );
      const schoolSnapshots = await Promise.all(
        visibleSchoolIds.map((schoolId) =>
          getDocs(query(batchesRef, where("schoolId", "==", schoolId))),
        ),
      );

      const scopedCentralBatches = schoolSnapshots
        .flatMap((snapshot) => snapshot.docs)
        .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Omit<CentralBatch, "id">) }))
        .filter((batch) => batch.status === "SUBMITTED")
        .filter((batch) => batch.academicYearId === currentTerm.academicYearId && batch.termId === currentTerm.id)
        .filter(
          (batch) =>
            batch.assessmentKind === CENTRAL_MEASUREMENT_1 ||
            batch.assessmentKind === CENTRAL_MEASUREMENT_2,
        )
        .filter((batch) => {
          const classInfo = visibleClassByKey.get(getClassKey(batch));
          return Boolean(classInfo);
        });

      const visibleBatches = scopedCentralBatches
        .filter((batch) => batch.isCompensationBatch !== true)
        .filter((batch) => {
          const classInfo = visibleClassByKey.get(getClassKey(batch));
          if (!classInfo) return false;
          if (!teacherOnly) return true;
          if (!teacherPersonId || batch.createdByPersonId !== teacherPersonId) return false;
          return getTeacherSubjectKeysForClass(teacherAssignments, teacherPersonId, classInfo).has(batch.subjectKey);
        });
      const originalBatchIds = new Set(visibleBatches.map((batch) => batch.id));
      const attachedCompensationBatches = scopedCentralBatches.filter(
        (batch) =>
          batch.isCompensationBatch === true &&
          typeof batch.originalBatchId === "string" &&
          originalBatchIds.has(batch.originalBatchId),
      );

      const teacherAssignmentIds = uniqueStrings(visibleBatches.map((batch) => batch.teacherAssignmentId));
      const templateIdsNeedingFallback = uniqueStrings(
        visibleBatches
          .filter((batch) => getSavedMaxScore(batch.studentRows ?? []) === undefined)
          .map((batch) => batch.templateId),
      );
      const [nextTeacherDirectory, nextTemplateMaxScores] = await Promise.all([
        loadTeacherDirectory(orgId, teacherAssignmentIds),
        loadTemplateMaxScores(orgId, templateIdsNeedingFallback),
      ]);

      setBatches(visibleBatches);
      setCompensationBatches(attachedCompensationBatches);
      setTeacherDirectoryByAssignmentId(nextTeacherDirectory);
      setTemplateMaxScoreById(nextTemplateMaxScores);
      setStatus("success");
    } catch (nextError: unknown) {
      setBatches([]);
      setCompensationBatches([]);
      setTeacherDirectoryByAssignmentId(new Map());
      setTemplateMaxScoreById(new Map());
      setError(getErrorMessage(nextError));
      setStatus("error");
    }
  }, [
    currentTerm?.academicYearId,
    currentTerm?.id,
    orgId,
    teacherAssignments,
    teacherOnly,
    teacherPersonId,
    visibleClassByKey,
    visibleClasses.length,
  ]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const compensationBatchesByOriginalBatchId = useMemo(() => {
    const batchesByOriginalBatchId = new Map<string, CentralBatch[]>();

    for (const batch of compensationBatches) {
      if (!batch.originalBatchId) continue;
      const linkedBatches = batchesByOriginalBatchId.get(batch.originalBatchId) ?? [];
      linkedBatches.push(batch);
      batchesByOriginalBatchId.set(batch.originalBatchId, linkedBatches);
    }

    return batchesByOriginalBatchId;
  }, [compensationBatches]);

  const rows = useMemo(() => {
    const grouped = new Map<
      string,
      Omit<SummaryRow, "teacherPersonId" | "teacherName">
    >();

    batches.forEach((batch) => {
      const classKey = getClassKey(batch);
      const classInfo = visibleClassByKey.get(classKey);
      if (!classInfo) return;

      const key = [
        batch.schoolId,
        batch.academicYearId,
        batch.termId,
        batch.subjectKey,
        batch.classId,
        batch.teacherAssignmentId,
      ].join(":");
      const existing = grouped.get(key) ?? {
        key,
        schoolId: batch.schoolId,
        schoolName:
          staffActor?.schools?.find((school) => school.id === batch.schoolId)?.name?.trim() || "مدرسة غير محددة",
        academicYearId: batch.academicYearId,
        termId: batch.termId,
        subjectKey: batch.subjectKey,
        subjectTitle: getSubjectTitle({ batch, offerings }),
        classKey,
        classTitle: getFriendlyClassTitle(classInfo, visibleClasses) || classInfo.title || classInfo.code || "فصل دراسي",
        teacherAssignmentId: batch.teacherAssignmentId,
      };

      if (batch.assessmentKind === CENTRAL_MEASUREMENT_1) {
        existing.centralMeasurement1 = batch;
      } else if (batch.assessmentKind === CENTRAL_MEASUREMENT_2) {
        existing.centralMeasurement2 = batch;
      }
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        teacherPersonId:
          teacherDirectoryByAssignmentId.get(row.teacherAssignmentId)
            ?.teacherPersonId || "",
        teacherName:
          teacherDirectoryByAssignmentId.get(row.teacherAssignmentId)
            ?.teacherName || "غير محدد",
      }))
      .sort((left, right) => {
        const subjectOrder = left.subjectTitle.localeCompare(right.subjectTitle, "ar");
        if (subjectOrder !== 0) return subjectOrder;
        const classOrder = left.classTitle.localeCompare(right.classTitle, "ar");
        if (classOrder !== 0) return classOrder;
        return left.teacherName.localeCompare(right.teacherName, "ar");
      });
  }, [
    batches,
    offerings,
    staffActor?.schools,
    teacherDirectoryByAssignmentId,
    visibleClassByKey,
    visibleClasses,
  ]);

  const schoolOptions = useMemo(
    () => Array.from(new Map(rows.map((row) => [row.schoolId, row.schoolName])).entries()),
    [rows],
  );
  const rowsMatchingSchool = useMemo(
    () =>
      rows.filter(
        (row) => schoolFilter === "ALL" || row.schoolId === schoolFilter,
      ),
    [rows, schoolFilter],
  );

  const teacherOptions = useMemo(() => {
    const teacherNameByPersonId = new Map<string, string>();

    for (const row of rowsMatchingSchool) {
      if (!row.teacherPersonId || teacherNameByPersonId.has(row.teacherPersonId)) {
        continue;
      }

      teacherNameByPersonId.set(row.teacherPersonId, row.teacherName);
    }

    return Array.from(teacherNameByPersonId.entries()).sort(
      ([, leftName], [, rightName]) => leftName.localeCompare(rightName, "ar"),
    );
  }, [rowsMatchingSchool]);
  const effectiveTeacherFilter =
    teacherFilter !== "ALL" &&
    teacherOptions.some(([teacherPersonId]) => teacherPersonId === teacherFilter)
      ? teacherFilter
      : "ALL";
  const rowsMatchingSchoolAndTeacher = useMemo(
    () =>
      rowsMatchingSchool.filter(
        (row) =>
          effectiveTeacherFilter === "ALL" ||
          row.teacherPersonId === effectiveTeacherFilter,
      ),
    [effectiveTeacherFilter, rowsMatchingSchool],
  );
  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rowsMatchingSchoolAndTeacher.map((row) => [
            row.subjectKey,
            row.subjectTitle,
          ]),
        ).entries(),
      ),
    [rowsMatchingSchoolAndTeacher],
  );
  const effectiveSubjectFilter =
    subjectFilter !== "ALL" &&
    subjectOptions.some(([subjectKey]) => subjectKey === subjectFilter)
      ? subjectFilter
      : "ALL";
  const rowsMatchingSchoolTeacherAndSubject = useMemo(
    () =>
      rowsMatchingSchoolAndTeacher.filter(
        (row) =>
          effectiveSubjectFilter === "ALL" ||
          row.subjectKey === effectiveSubjectFilter,
      ),
    [effectiveSubjectFilter, rowsMatchingSchoolAndTeacher],
  );
  const classOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rowsMatchingSchoolTeacherAndSubject.map((row) => [
            row.classKey,
            row.classTitle,
          ]),
        ).entries(),
      ),
    [rowsMatchingSchoolTeacherAndSubject],
  );
  const effectiveClassFilter =
    classFilter !== "ALL" &&
    classOptions.some(([classKey]) => classKey === classFilter)
      ? classFilter
      : "ALL";

  useEffect(() => {
    if (teacherFilter !== effectiveTeacherFilter) {
      setTeacherFilter(effectiveTeacherFilter);
    }
    if (subjectFilter !== effectiveSubjectFilter) {
      setSubjectFilter(effectiveSubjectFilter);
    }
    if (classFilter !== effectiveClassFilter) {
      setClassFilter(effectiveClassFilter);
    }
  }, [
    classFilter,
    effectiveClassFilter,
    effectiveSubjectFilter,
    effectiveTeacherFilter,
    subjectFilter,
    teacherFilter,
  ]);

  const filteredRows = useMemo(
    () =>
      rowsMatchingSchoolTeacherAndSubject.filter(
        (row) =>
          effectiveClassFilter === "ALL" ||
          row.classKey === effectiveClassFilter,
      ),
    [effectiveClassFilter, rowsMatchingSchoolTeacherAndSubject],
  );

  const filteredSummary = useMemo(
    () => ({
      rowCount: filteredRows.length,
      firstCount: filteredRows.filter((row) => !!row.centralMeasurement1).length,
      secondCount: filteredRows.filter((row) => !!row.centralMeasurement2).length,
    }),
    [filteredRows],
  );

  const hasActiveFilters =
    schoolFilter !== "ALL" ||
    subjectFilter !== "ALL" ||
    classFilter !== "ALL" ||
    teacherFilter !== "ALL";
  const selectedSchoolName = schoolFilter === "ALL" ? "" : schoolOptions.find(([id]) => id === schoolFilter)?.[1] || "";
  const selectedSubjectTitle = subjectFilter === "ALL" ? "" : subjectOptions.find(([key]) => key === subjectFilter)?.[1] || "";
  const organizationName = staffActor?.org?.nameAr || staffActor?.org?.name || staffActor?.org?.shortName || "المنشأة التعليمية";

  if (!staffActor) {
    return (
      <main dir="rtl" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
        <section className="mx-auto max-w-7xl rounded-2xl border bg-card p-6 shadow-sm">
          جاري تحميل بيانات المستخدم...
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="central-summary-print min-h-screen bg-background p-4 text-foreground sm:p-6">
      <style jsx global>{`
        @media print {
          @page { margin: 14mm; }
          body { background: #fff !important; color: #000 !important; }
          body * { visibility: hidden; }
          header:not(.central-summary-page-heading), aside, .no-print { display: none !important; }
          .central-summary-print, .central-summary-print * { visibility: visible; }
          .central-summary-print { position: absolute; inset: 0; width: 100%; padding: 0 !important; background: #fff !important; color: #000 !important; }
          .central-summary-print .rounded-2xl, .central-summary-print .border { box-shadow: none !important; border-color: #d1d5db !important; }
          .central-summary-print .bg-card, .central-summary-print .bg-muted, .central-summary-print .bg-muted\\/20 { background: #fff !important; }
          .central-summary-print table { width: 100% !important; font-size: 11pt; }
          .central-summary-print th, .central-summary-print td { color: #000 !important; white-space: normal !important; }
          .central-summary-print a { color: #000 !important; text-decoration: none !important; }
          .central-summary-print-context { display: block !important; }
        }
      `}</style>

      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link href="/staff/measurements" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            العودة إلى القياسات والمتابعات
          </Link>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>

        <header className="central-summary-page-heading rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-3">
                <div className="no-print rounded-xl bg-primary/10 p-3 text-primary">
                  <TableProperties className="size-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">خلاصة القياسات المركزية</h1>
                  <p className="mt-1 text-sm text-muted-foreground">نتائج القياس المركزي الأول والثاني للفصول المرئية.</p>
                </div>
              </div>
              <p className="central-summary-print-context mt-4 hidden text-sm leading-7 text-slate-700">
                {selectedSchoolName || organizationName} · السنة الدراسية الحالية · {currentTerm?.title || currentTerm?.shortTitle || "الفصل الدراسي الحالي"}
                {selectedSubjectTitle ? ` · ${selectedSubjectTitle}` : ""} · تاريخ الطباعة: {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date())}
              </p>
            </div>

            <Button type="button" variant="outline" className="no-print" onClick={() => void loadSummary()} disabled={status === "loading"}>
              <RefreshCw className="size-4" />
              {status === "loading" ? "جارٍ التحديث..." : "تحديث"}
            </Button>
          </div>
        </header>

        {error ? <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">تعذر تحميل خلاصة القياسات المركزية: {error}</section> : null}

        <section className="no-print rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="grid gap-1.5 text-sm font-medium lg:min-w-48">
              المدرسة
              <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring">
                <option value="ALL">الكل</option>
                {schoolOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium lg:min-w-48">
              المعلم
              <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring">
                <option value="ALL">الكل</option>
                {teacherOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium lg:min-w-48">
              المادة
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring">
                <option value="ALL">الكل</option>
                {subjectOptions.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium lg:min-w-48">
              الصف والفصل
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring">
                <option value="ALL">الكل</option>
                {classOptions.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
              </select>
            </label>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" className="w-fit" onClick={() => { setSchoolFilter("ALL"); setSubjectFilter("ALL"); setClassFilter("ALL"); setTeacherFilter("ALL"); }}>
                <RotateCcw className="size-4" />
                مسح الفلاتر
              </Button>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="الفصول/المواد" value={filteredSummary.rowCount} />
          <SummaryCard label="القياس الأول المرصود" value={filteredSummary.firstCount} />
          <SummaryCard label="القياس الثاني المرصود" value={filteredSummary.secondCount} />
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {status === "loading" ? (
            <div className="grid gap-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد نتائج قياسات مركزية مرصودة حتى الآن.</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة للفلاتر المحددة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">المادة</th>
                    <th className="px-4 py-3 font-semibold">اسم المعلم</th>
                    <th className="px-4 py-3 font-semibold">الصف والفصل</th>
                    <th className="px-4 py-3 font-semibold">القياس المركزي الأول</th>
                    <th className="px-4 py-3 font-semibold">القياس المركزي الثاني</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.key} className="border-t">
                      <td className="px-4 py-4 font-medium">{row.subjectTitle}</td>
                      <td className="px-4 py-4">{row.teacherName}</td>
                      <td className="px-4 py-4">{row.classTitle}</td>
                      <td className="px-4 py-4"><MeasurementPercentage batch={row.centralMeasurement1} compensationBatches={row.centralMeasurement1 ? compensationBatchesByOriginalBatchId.get(row.centralMeasurement1.id) ?? [] : []} templateMaxScoreById={templateMaxScoreById} /></td>
                      <td className="px-4 py-4"><MeasurementPercentage batch={row.centralMeasurement2} compensationBatches={row.centralMeasurement2 ? compensationBatchesByOriginalBatchId.get(row.centralMeasurement2.id) ?? [] : []} templateMaxScoreById={templateMaxScoreById} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value.toLocaleString("ar-SA")}</p>
    </div>
  );
}

function MeasurementPercentage({ batch, compensationBatches, templateMaxScoreById }: { batch?: CentralBatch; compensationBatches: CentralBatch[]; templateMaxScoreById: Map<string, number> }) {
  if (!batch) return <span className="text-muted-foreground">لم يُرصد</span>;
  const percentage = getBatchPercentage({
    batch,
    compensationBatches,
    templateMaxScoreById,
  });
  const label = formatPercentage(percentage);

  return (
    <Link href={`/staff/measurements/batches/${encodeURIComponent(batch.id)}`} className="font-bold text-primary underline-offset-4 hover:underline">
      {label}
    </Link>
  );
}
