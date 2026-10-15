"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  LoaderCircle,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type {
  Class,
  StudentMeasurementBatch,
  StudentMeasurementBatchStudentRow,
} from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { getFriendlyClassTitle } from "@/lib/class-presentation";
import { getEffectiveMeasurementRows } from "@/lib/measurement-compensation";
import {
  getFriendlyMeasurementLabel,
  getFriendlySubjectLabel,
} from "@/lib/measurement-presentation";
import { getStaffNavigationAccess } from "@/lib/staff-navigation";
import { db } from "@/lib/firebase";

const ALL = "ALL";
const reportableBatchStatuses = new Set(["SUBMITTED", "REVIEWED", "LOCKED"]);

type ReportFilters = {
  schoolId: string;
  academicYearId: string;
  termId: string;
  classContextKey: string;
  subjectKey: string;
  testTypeKey: string;
  studentId: string;
  minimumPercentage: string;
  maximumPercentage: string;
};

type MeasurementBatchDoc = StudentMeasurementBatch & {
  id: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
  subjectTitle?: string;
};

type StudentScoreRow = {
  id: string;
  batchId: string;
  studentId: string;
  studentName: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  classId: string;
  classContextKey: string;
  classTitle: string;
  subjectKey: string;
  subjectTitle: string;
  subjectLabel: string;
  templateId: string;
  testTypeKey: string;
  testTypeLabel: string;
  measurementTypeKey: string;
  measurementTypeLabel: string;
  templateTitle: string;
  measuredAt: number | undefined;
  score: number | undefined;
  maxScore: number | undefined;
  percentage: number | null;
  status: StudentMeasurementBatchStudentRow["status"];
  isCompensated: boolean;
};

type LoadStatus = "idle" | "loading" | "success" | "error";

const initialFilters: ReportFilters = {
  schoolId: ALL,
  academicYearId: ALL,
  termId: ALL,
  classContextKey: ALL,
  subjectKey: ALL,
  testTypeKey: ALL,
  studentId: ALL,
  minimumPercentage: "",
  maximumPercentage: "",
};

function cleanText(value?: string | null) {
  return value?.trim() || "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalPercentage(value: string) {
  if (!value.trim()) return undefined;
  return finiteNumber(Number(value));
}

function getAcademicYearLabel(academicYearId: string) {
  const year = academicYearId.replace(/^ay-/i, "").trim();
  return year ? `العام الدراسي ${year}` : academicYearId;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع أثناء تحميل التقرير.";
}

function getClassKey(item: Pick<Class, "schoolId" | "academicYearId" | "id">) {
  return `${item.schoolId}:${item.academicYearId}:${item.id}`;
}

function getBatchDate(batch: MeasurementBatchDoc) {
  return (
    finiteNumber(batch.measuredAt) ??
    finiteNumber(batch.submittedAt) ??
    finiteNumber(batch.updatedAt) ??
    finiteNumber(batch.createdAt)
  );
}

function getStudentStatusLabel(status: StudentMeasurementBatchStudentRow["status"]) {
  switch (status) {
    case "COMPLETED":
      return "مكتمل";
    case "ABSENT":
      return "غائب";
    case "EXCUSED":
      return "بعذر";
    case "SKIPPED":
      return "متجاوز";
    case "PENDING":
    default:
      return "لم يبدأ";
  }
}

function getMeasurementTypeKey(batch: MeasurementBatchDoc) {
  if (batch.batchKind === "ASSESSMENT") {
    return cleanText(batch.assessmentKind) || cleanText(batch.assessmentSlot) || batch.batchKind;
  }

  return cleanText(batch.trackerKind) || batch.batchKind;
}

function getMeasurementTypeLabel(batch: MeasurementBatchDoc) {
  const labelCandidates =
    batch.batchKind === "ASSESSMENT"
      ? [batch.assessmentKind, batch.assessmentSlot, batch.batchKind]
      : [batch.trackerKind, batch.batchKind];

  for (const candidate of labelCandidates) {
    const label = getFriendlyMeasurementLabel(candidate);
    if (label) return label;
  }

  return getMeasurementTypeKey(batch);
}

function getSubjectLabel(batch: MeasurementBatchDoc) {
  return (
    getFriendlySubjectLabel(batch.subjectKey) ||
    cleanText(batch.subjectTitle) ||
    cleanText(batch.subjectKey) ||
    "غير محددة"
  );
}

function getTemplateTitle(batch: MeasurementBatchDoc) {
  return (
    cleanText(batch.templateTitle) ||
    getFriendlyMeasurementLabel(batch.assessmentSlot) ||
    getFriendlyMeasurementLabel(batch.assessmentKind) ||
    getFriendlyMeasurementLabel(batch.trackerKind) ||
    "قياس أو متابعة"
  );
}

function getRowPercentage(row: StudentMeasurementBatchStudentRow) {
  const score = finiteNumber(row.score);
  const maxScore = finiteNumber(row.maxScore);

  if (score === undefined || maxScore === undefined || maxScore <= 0) {
    return null;
  }

  return (score / maxScore) * 100;
}

function wasCompensated(
  originalRow: StudentMeasurementBatchStudentRow | undefined,
  effectiveRow: StudentMeasurementBatchStudentRow,
) {
  return (
    (originalRow?.status === "ABSENT" || originalRow?.status === "EXCUSED") &&
    effectiveRow.status === "COMPLETED" &&
    finiteNumber(effectiveRow.score) !== undefined
  );
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
      new Date(value),
    );
  } catch {
    return "غير محدد";
  }
}

function formatPercentage(value: number | null) {
  if (value === null) return "لم تُرصد";

  return `${new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 1,
  }).format(value)}٪`;
}

function getFilterKey(filters: ReportFilters) {
  return JSON.stringify(filters);
}

export default function StudentScoresReportPage() {
  const { actor } = useStaffActor();
  const navigationAccess = getStaffNavigationAccess(actor);
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadedRows, setLoadedRows] = useState<StudentScoreRow[]>([]);
  const [reportedFilterKey, setReportedFilterKey] = useState<string | null>(
    null,
  );
  const [reportedAt, setReportedAt] = useState<number | null>(null);

  const visibleClasses = useMemo(
    () =>
      actor.visibleClasses
        .filter((classInfo) => !classInfo.isArchived)
        .sort((left, right) => {
          const schoolCompare = left.schoolId.localeCompare(right.schoolId, "ar");
          if (schoolCompare !== 0) return schoolCompare;
          return (left.order ?? 0) - (right.order ?? 0);
        }),
    [actor.visibleClasses],
  );

  const visibleClassByKey = useMemo(
    () =>
      new Map(
        visibleClasses.map((classInfo) => [getClassKey(classInfo), classInfo]),
      ),
    [visibleClasses],
  );

  const visibleSchoolIds = useMemo(
    () => new Set(visibleClasses.map((classInfo) => classInfo.schoolId)),
    [visibleClasses],
  );

  const schoolOptions = useMemo(
    () =>
      actor.schools
        .filter((school) => visibleSchoolIds.has(school.id) && !school.isArchived)
        .sort((left, right) => left.name.localeCompare(right.name, "ar")),
    [actor.schools, visibleSchoolIds],
  );

  const classesForSchool = useMemo(
    () =>
      visibleClasses.filter(
        (classInfo) =>
          filters.schoolId === ALL || classInfo.schoolId === filters.schoolId,
      ),
    [filters.schoolId, visibleClasses],
  );

  const academicYearOptions = useMemo(() => {
    const titles = new Map<string, string>();

    for (const classInfo of classesForSchool) {
      if (!titles.has(classInfo.academicYearId)) {
        titles.set(
          classInfo.academicYearId,
          getAcademicYearLabel(classInfo.academicYearId),
        );
      }
    }

    return Array.from(titles.entries()).sort(([left], [right]) =>
      right.localeCompare(left, "ar"),
    );
  }, [classesForSchool]);

  const classesForSchoolAndYear = useMemo(
    () =>
      classesForSchool.filter(
        (classInfo) =>
          filters.academicYearId === ALL ||
          classInfo.academicYearId === filters.academicYearId,
      ),
    [classesForSchool, filters.academicYearId],
  );

  const termOptions = useMemo(() => {
    const allowedAcademicYearIds = new Set(
      classesForSchoolAndYear.map((classInfo) => classInfo.academicYearId),
    );

    return Object.values(actor.currentTermsByAcademicYear)
      .filter((term) => allowedAcademicYearIds.has(term.academicYearId))
      .sort((left, right) => right.order - left.order || left.title.localeCompare(right.title, "ar"));
  }, [actor.currentTermsByAcademicYear, classesForSchoolAndYear]);

  const classOptions = useMemo(
    () =>
      classesForSchoolAndYear
        .map((classInfo) => ({
          id: getClassKey(classInfo),
          label:
            getFriendlyClassTitle(classInfo, classesForSchoolAndYear) ||
            classInfo.title ||
            classInfo.code ||
            classInfo.id,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "ar")),
    [classesForSchoolAndYear],
  );

  const subjectOptions = useMemo(() => {
    const labels = new Map<string, string>();
    const visibleClassIds = new Set(
      classesForSchoolAndYear
        .filter(
          (classInfo) =>
            filters.classContextKey === ALL ||
            getClassKey(classInfo) === filters.classContextKey,
        )
        .map((classInfo) => getClassKey(classInfo)),
    );

    for (const offering of actor.classSubjectOfferings) {
      if (
        !visibleClassIds.has(
          `${offering.schoolId}:${offering.academicYearId}:${offering.classId}`,
        ) ||
        offering.isArchived ||
        offering.status !== "ACTIVE" ||
        !cleanText(offering.subjectKey)
      ) {
        continue;
      }

      labels.set(
        offering.subjectKey,
        getFriendlySubjectLabel(offering.subjectKey) ||
          cleanText(offering.subjectTitleSnapshot) ||
          cleanText(offering.displayName) ||
          offering.subjectKey,
      );
    }

    for (const row of loadedRows) {
      if (
        (filters.schoolId !== ALL && row.schoolId !== filters.schoolId) ||
        (filters.academicYearId !== ALL &&
          row.academicYearId !== filters.academicYearId) ||
        (filters.classContextKey !== ALL &&
          row.classContextKey !== filters.classContextKey) ||
        !row.subjectKey
      ) {
        continue;
      }

      labels.set(row.subjectKey, row.subjectLabel);
    }

    return Array.from(labels.entries()).sort(([, left], [, right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [
    actor.classSubjectOfferings,
    classesForSchoolAndYear,
    filters.academicYearId,
    filters.classContextKey,
    filters.schoolId,
    loadedRows,
  ]);

  const testTypeOptions = useMemo(() => {
    const labels = new Map<string, string>();

    for (const row of loadedRows) {
      if (
        (filters.schoolId !== ALL && row.schoolId !== filters.schoolId) ||
        (filters.academicYearId !== ALL &&
          row.academicYearId !== filters.academicYearId) ||
        (filters.classContextKey !== ALL &&
          row.classContextKey !== filters.classContextKey) ||
        (filters.subjectKey !== ALL && row.subjectKey !== filters.subjectKey)
      ) {
        continue;
      }

      labels.set(row.testTypeKey, row.testTypeLabel);
    }

    return Array.from(labels.entries()).sort(([, left], [, right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [
    filters.academicYearId,
    filters.classContextKey,
    filters.schoolId,
    filters.subjectKey,
    loadedRows,
  ]);

  const studentOptions = useMemo(() => {
    const names = new Map<string, string>();

    for (const row of loadedRows) {
      if (
        (filters.schoolId !== ALL && row.schoolId !== filters.schoolId) ||
        (filters.academicYearId !== ALL &&
          row.academicYearId !== filters.academicYearId) ||
        (filters.classContextKey !== ALL &&
          row.classContextKey !== filters.classContextKey) ||
        (filters.subjectKey !== ALL && row.subjectKey !== filters.subjectKey) ||
        (filters.testTypeKey !== ALL && row.testTypeKey !== filters.testTypeKey)
      ) {
        continue;
      }

      names.set(row.studentId, row.studentName);
    }

    return Array.from(names.entries()).sort(([, left], [, right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [
    filters.academicYearId,
    filters.classContextKey,
    filters.schoolId,
    filters.subjectKey,
    filters.testTypeKey,
    loadedRows,
  ]);

  useEffect(() => {
    if (
      filters.academicYearId !== ALL &&
      !academicYearOptions.some(([academicYearId]) => academicYearId === filters.academicYearId)
    ) {
      setFilters((current) => ({ ...current, academicYearId: ALL }));
    }
  }, [academicYearOptions, filters.academicYearId]);

  useEffect(() => {
    if (
      filters.termId !== ALL &&
      !termOptions.some((term) => term.id === filters.termId)
    ) {
      setFilters((current) => ({ ...current, termId: ALL }));
    }
  }, [filters.termId, termOptions]);

  useEffect(() => {
    if (
      filters.classContextKey !== ALL &&
      !classOptions.some(
        (classInfo) => classInfo.id === filters.classContextKey,
      )
    ) {
      setFilters((current) => ({ ...current, classContextKey: ALL }));
    }
  }, [classOptions, filters.classContextKey]);

  useEffect(() => {
    if (
      filters.subjectKey !== ALL &&
      !subjectOptions.some(([subjectKey]) => subjectKey === filters.subjectKey)
    ) {
      setFilters((current) => ({ ...current, subjectKey: ALL }));
    }
  }, [filters.subjectKey, subjectOptions]);

  useEffect(() => {
    if (
      filters.testTypeKey !== ALL &&
      !testTypeOptions.some(([testTypeKey]) => testTypeKey === filters.testTypeKey)
    ) {
      setFilters((current) => ({ ...current, testTypeKey: ALL }));
    }
  }, [filters.testTypeKey, testTypeOptions]);

  useEffect(() => {
    if (
      filters.studentId !== ALL &&
      !studentOptions.some(([studentId]) => studentId === filters.studentId)
    ) {
      setFilters((current) => ({ ...current, studentId: ALL }));
    }
  }, [filters.studentId, studentOptions]);

  const activeFilterKey = getFilterKey(filters);
  const hasCurrentReport = reportedFilterKey === activeFilterKey;
  const minimumPercentage = parseOptionalPercentage(filters.minimumPercentage);
  const maximumPercentage = parseOptionalPercentage(filters.maximumPercentage);
  const hasInvalidPercentage =
    (filters.minimumPercentage.trim() !== "" &&
      minimumPercentage === undefined) ||
    (filters.maximumPercentage.trim() !== "" &&
      maximumPercentage === undefined);
  const hasPercentageRange =
    filters.minimumPercentage.trim() !== "" || filters.maximumPercentage.trim() !== "";

  const filteredRows = useMemo(
    () =>
      loadedRows.filter((row) => {
        if (filters.schoolId !== ALL && row.schoolId !== filters.schoolId) return false;
        if (
          filters.academicYearId !== ALL &&
          row.academicYearId !== filters.academicYearId
        ) {
          return false;
        }
        if (
          filters.classContextKey !== ALL &&
          row.classContextKey !== filters.classContextKey
        ) {
          return false;
        }
        if (filters.subjectKey !== ALL && row.subjectKey !== filters.subjectKey) return false;
        if (filters.testTypeKey !== ALL && row.testTypeKey !== filters.testTypeKey) {
          return false;
        }
        if (filters.studentId !== ALL && row.studentId !== filters.studentId) return false;

        if (!hasPercentageRange) return true;
        if (row.percentage === null) return false;
        if (minimumPercentage !== undefined && row.percentage < minimumPercentage) {
          return false;
        }
        if (maximumPercentage !== undefined && row.percentage > maximumPercentage) {
          return false;
        }

        return true;
      }),
    [
      filters.academicYearId,
      filters.classContextKey,
      filters.schoolId,
      filters.studentId,
      filters.subjectKey,
      filters.testTypeKey,
      hasPercentageRange,
      loadedRows,
      maximumPercentage,
      minimumPercentage,
    ],
  );

  const averagePercentage = useMemo(() => {
    const percentages = filteredRows
      .map((row) => row.percentage)
      .filter((percentage): percentage is number => percentage !== null);

    if (percentages.length === 0) return null;
    return percentages.reduce((sum, percentage) => sum + percentage, 0) / percentages.length;
  }, [filteredRows]);

  const updateFilter = <Key extends keyof ReportFilters>(
    key: Key,
    value: ReportFilters[Key],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  async function showReport() {
    if (!navigationAccess.canAccessReports) return;

    if (hasInvalidPercentage) {
      setError("أدخل نسبة رقمية صحيحة.");
      return;
    }

    if (
      minimumPercentage !== undefined &&
      maximumPercentage !== undefined &&
      minimumPercentage > maximumPercentage
    ) {
      setError("الحد الأدنى للنسبة لا يمكن أن يتجاوز الحد الأعلى.");
      return;
    }

    if (
      (minimumPercentage !== undefined &&
        (minimumPercentage < 0 || minimumPercentage > 100)) ||
      (maximumPercentage !== undefined &&
        (maximumPercentage < 0 || maximumPercentage > 100))
    ) {
      setError("يجب أن تكون النسبة بين ٠ و١٠٠.");
      return;
    }

    const requestedFilters = { ...filters };
    const requestedFilterKey = getFilterKey(requestedFilters);
    const scopedClasses = visibleClasses.filter(
      (classInfo) =>
        (requestedFilters.schoolId === ALL ||
          classInfo.schoolId === requestedFilters.schoolId) &&
        (requestedFilters.academicYearId === ALL ||
          classInfo.academicYearId === requestedFilters.academicYearId) &&
        (requestedFilters.classContextKey === ALL ||
          getClassKey(classInfo) === requestedFilters.classContextKey),
    );

    if (scopedClasses.length === 0) {
      setLoadedRows([]);
      setReportedFilterKey(requestedFilterKey);
      setReportedAt(Date.now());
      setLoadStatus("success");
      setError(null);
      return;
    }

    setReportedFilterKey(null);
    setReportedAt(null);
    setLoadStatus("loading");
    setError(null);

    try {
      const batchesRef = collection(
        db,
        "orgs",
        actor.orgId,
        "studentMeasurementBatches",
      );
      const snapshots = await Promise.all(
        scopedClasses.map((classInfo) =>
          getDocs(
            query(
              batchesRef,
              where("schoolId", "==", classInfo.schoolId),
              where("academicYearId", "==", classInfo.academicYearId),
              where("classId", "==", classInfo.id),
            ),
          ),
        ),
      );

      const uniqueBatches = new Map<string, MeasurementBatchDoc>();
      for (const snapshot of snapshots) {
        for (const documentSnapshot of snapshot.docs) {
          uniqueBatches.set(documentSnapshot.id, {
            ...(documentSnapshot.data() as StudentMeasurementBatch),
            id: documentSnapshot.id,
          });
        }
      }

      const allBatches = Array.from(uniqueBatches.values()).filter((batch) => {
        const classInfo = visibleClassByKey.get(
          `${batch.schoolId}:${batch.academicYearId}:${batch.classId}`,
        );

        return (
          Boolean(classInfo) &&
          (requestedFilters.termId === ALL || batch.termId === requestedFilters.termId)
        );
      });

      const compensationByOriginalBatchId = new Map<
        string,
        MeasurementBatchDoc[]
      >();

      for (const batch of allBatches) {
        if (!batch.isCompensationBatch || !batch.originalBatchId) continue;

        const current =
          compensationByOriginalBatchId.get(batch.originalBatchId) ?? [];
        current.push(batch);
        compensationByOriginalBatchId.set(batch.originalBatchId, current);
      }

      const schoolNames = new Map(
        actor.schools.map((school) => [school.id, school.name]),
      );
      const nextRows: StudentScoreRow[] = [];

      for (const batch of allBatches) {
        if (
          batch.isCompensationBatch ||
          !reportableBatchStatuses.has(batch.status)
        ) {
          continue;
        }

        const classInfo = visibleClassByKey.get(
          `${batch.schoolId}:${batch.academicYearId}:${batch.classId}`,
        );
        if (!classInfo) continue;

        const originalRowsByStudentId = new Map(
          (batch.studentRows ?? []).map((row) => [row.studentId, row]),
        );
        const effectiveRows = getEffectiveMeasurementRows({
          originalBatchId: batch.id,
          originalRows: batch.studentRows ?? [],
          compensationBatches:
            compensationByOriginalBatchId.get(batch.id) ?? [],
        });
        const classTitle =
          getFriendlyClassTitle(classInfo, visibleClasses) ||
          classInfo.title ||
          classInfo.code ||
          classInfo.id;
        const subjectKey = cleanText(batch.subjectKey) || "UNSPECIFIED";
        const subjectLabel = getSubjectLabel(batch);
        const testTypeKey = getMeasurementTypeKey(batch);
        const testTypeLabel = getMeasurementTypeLabel(batch);

        for (const row of effectiveRows) {
          nextRows.push({
            id: `${batch.id}:${row.studentId}`,
            batchId: batch.id,
            studentId: row.studentId,
            studentName:
              cleanText(row.studentDisplayName) || `طالب (${row.studentId})`,
            schoolId: batch.schoolId,
            schoolName: schoolNames.get(batch.schoolId) || batch.schoolId,
            academicYearId: batch.academicYearId,
            classId: batch.classId,
            classContextKey: getClassKey(classInfo),
            classTitle,
            subjectKey,
            subjectTitle: subjectLabel,
            subjectLabel,
            templateId: cleanText(batch.templateId),
            testTypeKey,
            testTypeLabel,
            measurementTypeKey: testTypeKey,
            measurementTypeLabel: testTypeLabel,
            templateTitle: getTemplateTitle(batch),
            measuredAt: getBatchDate(batch),
            score: finiteNumber(row.score),
            maxScore: finiteNumber(row.maxScore),
            percentage: getRowPercentage(row),
            status: row.status,
            isCompensated: wasCompensated(
              originalRowsByStudentId.get(row.studentId),
              row,
            ),
          });
        }
      }

      nextRows.sort((left, right) => {
        const schoolCompare = left.schoolName.localeCompare(right.schoolName, "ar");
        if (schoolCompare !== 0) return schoolCompare;

        const classCompare = left.classTitle.localeCompare(right.classTitle, "ar");
        if (classCompare !== 0) return classCompare;

        const subjectCompare = left.subjectLabel.localeCompare(right.subjectLabel, "ar");
        if (subjectCompare !== 0) return subjectCompare;

        const typeCompare = left.testTypeLabel.localeCompare(
          right.testTypeLabel,
          "ar",
        );
        if (typeCompare !== 0) return typeCompare;

        const measurementCompare = left.templateTitle.localeCompare(
          right.templateTitle,
          "ar",
        );
        if (measurementCompare !== 0) return measurementCompare;

        const studentCompare = left.studentName.localeCompare(
          right.studentName,
          "ar",
        );
        if (studentCompare !== 0) return studentCompare;

        return (right.measuredAt ?? 0) - (left.measuredAt ?? 0);
      });

      setLoadedRows(nextRows);
      setReportedFilterKey(requestedFilterKey);
      setReportedAt(Date.now());
      setLoadStatus("success");
    } catch (loadError) {
      setLoadStatus("error");
      setError(getErrorMessage(loadError));
    }
  }

  function resetFilters() {
    setFilters(initialFilters);
    setLoadedRows([]);
    setReportedFilterKey(null);
    setReportedAt(null);
    setLoadStatus("idle");
    setError(null);
  }

  if (!navigationAccess.canAccessReports) {
    return (
      <main dir="rtl" className="mx-auto max-w-3xl p-4 sm:p-6">
        <section className="rounded-2xl border border-destructive/30 bg-card p-6 text-sm leading-7 shadow-sm">
          لا تملك صلاحية الوصول إلى هذا التقرير.
        </section>
      </main>
    );
  }

  const selectedSchoolLabel =
    schoolOptions.find((school) => school.id === filters.schoolId)?.name || "كل المدارس";
  const selectedYearLabel =
    academicYearOptions.find(([yearId]) => yearId === filters.academicYearId)?.[1] ||
    "كل الأعوام";
  const selectedTermLabel =
    termOptions.find((term) => term.id === filters.termId)?.title || "كل الفصول";
  const selectedClassLabel =
    classOptions.find(
      (classInfo) => classInfo.id === filters.classContextKey,
    )?.label ||
    "كل الفصول الدراسية";
  const selectedSubjectLabel =
    subjectOptions.find(([subjectKey]) => subjectKey === filters.subjectKey)?.[1] ||
    "كل المواد";
  const selectedTestTypeLabel =
    testTypeOptions.find(([testTypeKey]) => testTypeKey === filters.testTypeKey)?.[1] ||
    "كل الأنواع";
  const selectedStudentLabel =
    studentOptions.find(([studentId]) => studentId === filters.studentId)?.[1] ||
    "كل الطلاب";
  const percentageRangeLabel = !hasPercentageRange
    ? "كل النسب"
    : `من ${filters.minimumPercentage || "٠"}٪ إلى ${
        filters.maximumPercentage || "١٠٠"
      }٪`;
  const organizationName =
    actor.org?.nameAr || actor.org?.shortName || actor.org?.nameEn || actor.orgId;

  return (
    <main dir="rtl" className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <style jsx global>{`
        @media print {
          .student-scores-no-print {
            display: none !important;
          }

          .student-scores-print-shell {
            max-width: none !important;
            padding: 0 !important;
          }

          .student-scores-report-card {
            border: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }

          .student-scores-table {
            font-size: 10px !important;
          }

          .student-scores-table th,
          .student-scores-table td {
            white-space: normal !important;
            padding: 6px !important;
            color: #000 !important;
          }

          .student-scores-table thead {
            display: table-header-group;
          }
        }
      `}</style>

      <div className="student-scores-no-print flex flex-wrap gap-2">
        <Link
          href="/staff/reports"
          className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-muted"
        >
          <ArrowRight className="size-4" />
          مركز التقارير
        </Link>
      </div>

      <section className="student-scores-report-card overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="student-scores-no-print border-b bg-muted/20 p-5 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            درجات الطلاب
          </h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            تقرير تفصيلي لدرجات القياسات والمتابعات ضمن الفصول المرئية لك.
          </p>
        </div>

        <div className="student-scores-no-print grid gap-4 border-b p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <FilterSelect
            label="المدرسة"
            value={filters.schoolId}
            onChange={(value) => updateFilter("schoolId", value)}
            options={schoolOptions.map(
              (school) => [school.id, school.name] as [string, string],
            )}
            allLabel="كل المدارس"
          />
          <FilterSelect
            label="العام الدراسي"
            value={filters.academicYearId}
            onChange={(value) => updateFilter("academicYearId", value)}
            options={academicYearOptions}
            allLabel="كل الأعوام"
          />
          <FilterSelect
            label="الفصل الدراسي"
            value={filters.termId}
            onChange={(value) => updateFilter("termId", value)}
            options={termOptions.map(
              (term) => [term.id, term.title] as [string, string],
            )}
            allLabel="كل الفصول"
          />
          <FilterSelect
            label="الصف والفصل"
            value={filters.classContextKey}
            onChange={(value) => updateFilter("classContextKey", value)}
            options={classOptions.map(
              (classInfo) => [classInfo.id, classInfo.label] as [string, string],
            )}
            allLabel="كل الفصول الدراسية"
          />
          <FilterSelect
            label="المادة"
            value={filters.subjectKey}
            onChange={(value) => updateFilter("subjectKey", value)}
            options={subjectOptions}
            allLabel="كل المواد"
          />
          <FilterSelect
            label="نوع الاختبار/المتابعة"
            value={filters.testTypeKey}
            onChange={(value) => updateFilter("testTypeKey", value)}
            options={testTypeOptions}
            allLabel="كل الأنواع"
            disabled={loadStatus === "loading"}
          />
          <FilterSelect
            label="الطالب"
            value={filters.studentId}
            onChange={(value) => updateFilter("studentId", value)}
            options={studentOptions}
            allLabel="كل الطلاب"
            disabled={loadStatus === "loading"}
          />
          <NumberFilter
            label="النسبة من"
            value={filters.minimumPercentage}
            onChange={(value) => updateFilter("minimumPercentage", value)}
          />
          <NumberFilter
            label="النسبة إلى"
            value={filters.maximumPercentage}
            onChange={(value) => updateFilter("maximumPercentage", value)}
          />

          <div className="flex items-end gap-2 xl:col-span-1">
            <button
              type="button"
              onClick={() => void showReport()}
              disabled={loadStatus === "loading"}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadStatus === "loading" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              عرض التقرير
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={loadStatus === "loading"}
              className="inline-flex size-10 items-center justify-center rounded-xl border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="إعادة ضبط الفلاتر"
              title="إعادة ضبط"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>

        <div className="student-scores-no-print flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-sm text-muted-foreground">
          <span>
            لا تُجلب دفعات القياس إلا بعد الضغط على «عرض التقرير».
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!hasCurrentReport || loadStatus === "loading"}
            className="inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="size-4" />
            طباعة
          </button>
        </div>

        {error ? (
          <div className="student-scores-no-print border-b border-destructive/20 bg-destructive/5 px-5 py-4 text-sm leading-7 text-destructive">
            {error}
          </div>
        ) : null}

        {loadStatus === "loading" ? (
          <div className="grid gap-4 p-5 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !hasCurrentReport ? (
          <ReportEmptyState
            icon={FileText}
            title="اختر الفلاتر ثم اضغط «عرض التقرير»."
            description="لن تُحمّل أي دفعات قياس قبل طلب التقرير صراحةً. يعرض التقرير فقط الفصول الموجودة ضمن نطاقك المرئي الحالي."
          />
        ) : loadedRows.length === 0 ? (
          <ReportEmptyState
            icon={FileText}
            title="لا توجد نتائج مؤهلة ضمن النطاق المحدد"
            description="لا توجد دفعات مرسلة أو مراجعة أو مقفلة تطابق المدرسة والعام والفصل والفصل الدراسي المحددة."
          />
        ) : filteredRows.length === 0 ? (
          <ReportEmptyState
            icon={AlertTriangle}
            title="لا توجد نتائج مطابقة للفلاتر المحددة"
            description="غيّر المادة أو النوع أو الطالب أو نطاق النسبة ثم اعرض التقرير مجددًا."
          />
        ) : (
          <div id="student-scores-report" className="space-y-5 p-5">
            <div className="hidden border-b pb-4 print:block">
              <p className="text-sm font-semibold">{organizationName}</p>
              <h2 className="text-xl font-bold">تقرير درجات الطلاب</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                طُبع في {reportedAt ? formatDate(reportedAt) : "غير محدد"}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                المدرسة: {selectedSchoolLabel} · العام: {selectedYearLabel} · الفصل: {selectedTermLabel} · الصف والفصل: {selectedClassLabel} · المادة: {selectedSubjectLabel} · النوع: {selectedTestTypeLabel} · الطالب: {selectedStudentLabel} · النسبة: {percentageRangeLabel}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="النتائج المعروضة" value={String(filteredRows.length)} />
              <SummaryCard
                label="درجات مرصودة"
                value={String(filteredRows.filter((row) => row.percentage !== null).length)}
              />
              <SummaryCard label="متوسط النسبة" value={formatPercentage(averagePercentage)} />
            </div>

            <div className="overflow-x-auto rounded-2xl border">
              <table className="student-scores-table min-w-[1320px] w-full text-right text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-semibold">الطالب</th>
                    <th className="px-3 py-3 font-semibold">المدرسة</th>
                    <th className="px-3 py-3 font-semibold">الصف والفصل</th>
                    <th className="px-3 py-3 font-semibold">المادة</th>
                    <th className="px-3 py-3 font-semibold">النوع</th>
                    <th className="px-3 py-3 font-semibold">عنوان القياس</th>
                    <th className="px-3 py-3 font-semibold">التاريخ</th>
                    <th className="px-3 py-3 font-semibold">الدرجة</th>
                    <th className="px-3 py-3 font-semibold">من</th>
                    <th className="px-3 py-3 font-semibold">النسبة</th>
                    <th className="px-3 py-3 font-semibold">الحالة</th>
                    <th className="px-3 py-3 font-semibold">تعويض</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-3 font-medium">{row.studentName}</td>
                      <td className="px-3 py-3">{row.schoolName}</td>
                      <td className="px-3 py-3">{row.classTitle}</td>
                      <td className="px-3 py-3">{row.subjectLabel}</td>
                      <td className="px-3 py-3">{row.testTypeLabel}</td>
                      <td className="px-3 py-3">{row.templateTitle}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.measuredAt)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.score === undefined
                          ? "—"
                          : new Intl.NumberFormat("ar-SA").format(row.score)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.maxScore === undefined
                          ? "—"
                          : new Intl.NumberFormat("ar-SA").format(row.maxScore)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap font-semibold">{formatPercentage(row.percentage)}</td>
                      <td className="px-3 py-3">{getStudentStatusLabel(row.status)}</td>
                      <td className="px-3 py-3">{row.isCompensated ? "نعم" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  allLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="number"
        min="0"
        max="100"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="٪"
        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function ReportEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
        <Icon className="size-7" />
      </div>
      <h2 className="mt-4 font-bold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
