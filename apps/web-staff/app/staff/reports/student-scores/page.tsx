"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Printer,
  RotateCcw,
  Search,
  Trophy,
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
const canonicalMeasurementTypeAliases: Record<string, string> = {
  PRIMARY_DIAGNOSTIC: "PRIMARY_DIAGNOSTIC_TEST",
  PRIMARY_PERIODIC_1: "PRIMARY_PERIODIC_TEST_1",
  PRIMARY_PERIODIC_2: "PRIMARY_PERIODIC_TEST_2",
  PRIMARY_CENTRAL_1: "PRIMARY_CENTRAL_MEASUREMENT_1",
  PRIMARY_CENTRAL_2: "PRIMARY_CENTRAL_MEASUREMENT_2",
};

type ReportFilters = {
  schoolIds: string[];
  academicYearIds: string[];
  termIds: string[];
  classContextKeys: string[];
  subjectKeys: string[];
  measurementKeys: string[];
  studentId: string;
  minimumScore: string;
  maximumScore: string;
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
  termId: string;
  classId: string;
  classContextKey: string;
  classTitle: string;
  subjectKey: string;
  subjectTitle: string;
  subjectLabel: string;
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

type MeasurementFilterOption = {
  id: string;
  label: string;
};

type RankingMode = "CURRENT" | "COMPLETE";

type StudentRankingRow = {
  studentId: string;
  studentName: string;
  contexts: string[];
  expectedCount: number;
  completedCount: number;
  numericResultCount: number;
  averagePercentage: number;
  roundedAveragePercentage: number;
  incompleteCounts: Record<string, number>;
  rank: number;
};

type MultiFilterKey =
  | "schoolIds"
  | "academicYearIds"
  | "termIds"
  | "classContextKeys"
  | "measurementKeys"
  | "subjectKeys";

const initialFilters: ReportFilters = {
  schoolIds: [],
  academicYearIds: [],
  termIds: [],
  classContextKeys: [],
  subjectKeys: [],
  measurementKeys: [],
  studentId: ALL,
  minimumScore: "",
  maximumScore: "",
};

function cleanText(value?: string | null) {
  return value?.trim() || "";
}

function canonicalMeasurementTypeKey(value?: string | null) {
  const key = cleanText(value).toUpperCase();
  return canonicalMeasurementTypeAliases[key] || key;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalScore(value: string) {
  if (!value.trim()) return undefined;
  return finiteNumber(Number(value));
}

function matchesSelected(values: string[], value: string) {
  return values.length === 0 || values.includes(value);
}

function pruneSelectedValues(values: string[], validIds: Set<string>) {
  return values.filter((value) => validIds.has(value));
}

function areSameValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatOneDecimal(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
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
    return canonicalMeasurementTypeKey(
      batch.assessmentKind || batch.assessmentSlot || batch.batchKind,
    );
  }

  return canonicalMeasurementTypeKey(batch.trackerKind || batch.batchKind);
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

function getMeasurementFilterKey(row: StudentScoreRow) {
  return row.measurementTypeKey || row.testTypeKey;
}

function getRowPercentage(row: StudentMeasurementBatchStudentRow) {
  const score = finiteNumber(row.score);
  const maxScore = finiteNumber(row.maxScore);

  if (score === undefined || maxScore === undefined || maxScore <= 0) {
    return null;
  }

  const percentage = (score / maxScore) * 100;
  return Number.isFinite(percentage) ? percentage : null;
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

function buildStudentRankings(rows: StudentScoreRow[]): StudentRankingRow[] {
  const byStudentId = new Map<
    string,
    {
      studentName: string;
      contexts: Set<string>;
      expectedBatchIds: Set<string>;
      completedBatchIds: Set<string>;
      percentages: number[];
      incompleteCounts: Record<string, number>;
    }
  >();

  for (const row of rows) {
    const current = byStudentId.get(row.studentId) ?? {
      studentName: row.studentName,
      contexts: new Set<string>(),
      expectedBatchIds: new Set<string>(),
      completedBatchIds: new Set<string>(),
      percentages: [],
      incompleteCounts: {},
    };
    const completedPercentage =
      row.status === "COMPLETED" && row.percentage !== null
        ? row.percentage
        : null;

    current.contexts.add(`${row.schoolName} / ${row.classTitle}`);
    current.expectedBatchIds.add(row.batchId);

    if (completedPercentage !== null) {
      current.completedBatchIds.add(row.batchId);
      current.percentages.push(completedPercentage);
    } else {
      current.incompleteCounts[row.status] =
        (current.incompleteCounts[row.status] ?? 0) + 1;
    }

    byStudentId.set(row.studentId, current);
  }

  const rankingCandidates = Array.from(byStudentId.entries())
    .filter(([, value]) => value.percentages.length > 0)
    .map(([studentId, value]) => {
      const averagePercentage =
        value.percentages.reduce((sum, percentage) => sum + percentage, 0) /
        value.percentages.length;
      const roundedAveragePercentage = Math.round(averagePercentage * 10) / 10;

      return {
        studentId,
        studentName: value.studentName,
        contexts: Array.from(value.contexts).sort((left, right) =>
          left.localeCompare(right, "ar"),
        ),
        expectedCount: value.expectedBatchIds.size,
        completedCount: value.completedBatchIds.size,
        numericResultCount: value.percentages.length,
        averagePercentage,
        roundedAveragePercentage,
        incompleteCounts: value.incompleteCounts,
        rank: 0,
      };
    });

  return rankStudentRankings(rankingCandidates);
}

function rankStudentRankings(rows: StudentRankingRow[]) {
  const sortedRows = [...rows].sort((left, right) => {
    if (right.roundedAveragePercentage !== left.roundedAveragePercentage) {
      return right.roundedAveragePercentage - left.roundedAveragePercentage;
    }

    return left.studentName.localeCompare(right.studentName, "ar");
  });

  let previousAverage: number | null = null;
  let rank = 0;

  return sortedRows.map((row, index) => {
    if (previousAverage === null || row.roundedAveragePercentage !== previousAverage) {
      rank = index + 1;
      previousAverage = row.roundedAveragePercentage;
    }

    return { ...row, rank };
  });
}

function getRankingCompletionWarning(row: StudentRankingRow) {
  if (row.completedCount === row.expectedCount) return "";

  const labels: Record<string, string> = {
    ABSENT: "غائب",
    EXCUSED: "بعذر",
    SKIPPED: "متجاوز",
    PENDING: "لم يبدأ",
    COMPLETED: "بدون درجة صالحة",
  };
  const details = Object.entries(row.incompleteCounts)
    .map(([status, count]) => `${labels[status] ?? status}: ${count}`)
    .join(" · ");

  return details || "لديه قياسات غير مكتملة";
}

function getMultiSelectionSummary(
  options: Array<[string, string]>,
  selectedValues: string[],
  allLabel: string,
  getMultipleLabel: (count: number) => string,
) {
  if (selectedValues.length === 0) return allLabel;

  const selectedOptions = options.filter(([id]) => selectedValues.includes(id));
  if (selectedOptions.length === 0) return allLabel;
  if (selectedOptions.length === 1) return selectedOptions[0][1];

  return getMultipleLabel(selectedOptions.length);
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
  const [rankingMode, setRankingMode] = useState<RankingMode>("CURRENT");
  const automaticMaximumScoreRef = useRef<string | null>(null);

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
        (classInfo) => matchesSelected(filters.schoolIds, classInfo.schoolId),
      ),
    [filters.schoolIds, visibleClasses],
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
          matchesSelected(filters.academicYearIds, classInfo.academicYearId),
      ),
    [classesForSchool, filters.academicYearIds],
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

  const measurementOptions = useMemo(() => {
    const byId = new Map<string, MeasurementFilterOption>();

    for (const row of loadedRows) {
      if (
        !matchesSelected(filters.schoolIds, row.schoolId) ||
        !matchesSelected(filters.academicYearIds, row.academicYearId) ||
        !matchesSelected(filters.termIds, row.termId) ||
        !matchesSelected(filters.classContextKeys, row.classContextKey)
      ) {
        continue;
      }

      const id = getMeasurementFilterKey(row);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          label:
            getFriendlyMeasurementLabel(id) ||
            row.measurementTypeLabel ||
            id,
        });
      }
    }

    return Array.from(byId.values())
      .sort((left, right) => left.label.localeCompare(right.label, "ar"));
  }, [
    filters.academicYearIds,
    filters.classContextKeys,
    filters.schoolIds,
    filters.termIds,
    loadedRows,
  ]);

  const subjectOptions = useMemo(() => {
    const labels = new Map<string, string>();
    const availableMeasurementIds = new Set(
      measurementOptions.map((measurement) => measurement.id),
    );
    const validMeasurementKeys = filters.measurementKeys.filter((measurementKey) =>
      availableMeasurementIds.has(measurementKey),
    );
    const hasSelectedMeasurements = validMeasurementKeys.length > 0;
    const structuralRows = loadedRows.filter(
      (row) =>
        matchesSelected(filters.schoolIds, row.schoolId) &&
        matchesSelected(filters.academicYearIds, row.academicYearId) &&
        matchesSelected(filters.termIds, row.termId) &&
        matchesSelected(filters.classContextKeys, row.classContextKey),
    );

    if (structuralRows.length > 0 || hasSelectedMeasurements) {
      for (const row of structuralRows) {
        if (!matchesSelected(validMeasurementKeys, getMeasurementFilterKey(row))) {
          continue;
        }

        labels.set(row.subjectKey, row.subjectLabel);
      }
    } else {
      const visibleClassIds = new Set(
        classesForSchoolAndYear
          .filter((classInfo) =>
            matchesSelected(filters.classContextKeys, getClassKey(classInfo)),
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
    }

    return Array.from(labels.entries()).sort(([, left], [, right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [
    actor.classSubjectOfferings,
    classesForSchoolAndYear,
    filters.academicYearIds,
    filters.classContextKeys,
    filters.measurementKeys,
    filters.schoolIds,
    filters.termIds,
    loadedRows,
    measurementOptions,
  ]);

  const studentOptions = useMemo(() => {
    const names = new Map<string, string>();

    for (const row of loadedRows) {
      if (
        !matchesSelected(filters.schoolIds, row.schoolId) ||
        !matchesSelected(filters.academicYearIds, row.academicYearId) ||
        !matchesSelected(filters.termIds, row.termId) ||
        !matchesSelected(filters.classContextKeys, row.classContextKey) ||
        !matchesSelected(filters.measurementKeys, getMeasurementFilterKey(row)) ||
        !matchesSelected(filters.subjectKeys, row.subjectKey)
      ) {
        continue;
      }

      names.set(row.studentId, row.studentName);
    }

    return Array.from(names.entries()).sort(([, left], [, right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [
    filters.academicYearIds,
    filters.classContextKeys,
    filters.measurementKeys,
    filters.schoolIds,
    filters.subjectKeys,
    filters.termIds,
    loadedRows,
  ]);

  useEffect(() => {
    const validIds = new Set(academicYearOptions.map(([id]) => id));
    const nextValues = pruneSelectedValues(filters.academicYearIds, validIds);

    if (!areSameValues(filters.academicYearIds, nextValues)) {
      setFilters((current) => ({ ...current, academicYearIds: nextValues }));
    }
  }, [academicYearOptions, filters.academicYearIds]);

  useEffect(() => {
    const validIds = new Set(termOptions.map((term) => term.id));
    const nextValues = pruneSelectedValues(filters.termIds, validIds);

    if (!areSameValues(filters.termIds, nextValues)) {
      setFilters((current) => ({ ...current, termIds: nextValues }));
    }
  }, [filters.termIds, termOptions]);

  useEffect(() => {
    const validIds = new Set(classOptions.map((classInfo) => classInfo.id));
    const nextValues = pruneSelectedValues(filters.classContextKeys, validIds);

    if (!areSameValues(filters.classContextKeys, nextValues)) {
      setFilters((current) => ({ ...current, classContextKeys: nextValues }));
    }
  }, [classOptions, filters.classContextKeys]);

  useEffect(() => {
    const validIds = new Set(measurementOptions.map((measurement) => measurement.id));
    const nextValues = pruneSelectedValues(filters.measurementKeys, validIds);

    if (!areSameValues(filters.measurementKeys, nextValues)) {
      setFilters((current) => ({
        ...current,
        measurementKeys: nextValues,
      }));
    }
  }, [filters.measurementKeys, measurementOptions]);

  useEffect(() => {
    const validIds = new Set(subjectOptions.map(([id]) => id));
    const nextValues = pruneSelectedValues(filters.subjectKeys, validIds);

    if (!areSameValues(filters.subjectKeys, nextValues)) {
      setFilters((current) => ({ ...current, subjectKeys: nextValues }));
    }
  }, [filters.subjectKeys, subjectOptions]);

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
  const minimumScore = parseOptionalScore(filters.minimumScore);
  const maximumScore = parseOptionalScore(filters.maximumScore);
  const hasInvalidScore =
    (filters.minimumScore.trim() !== "" && minimumScore === undefined) ||
    (filters.maximumScore.trim() !== "" && maximumScore === undefined);
  const hasScoreRange =
    filters.minimumScore.trim() !== "" || filters.maximumScore.trim() !== "";
  const matchingMaximumScores = useMemo(() => {
    const maxScores = new Set<number>();

    for (const row of loadedRows) {
      if (
        !matchesSelected(filters.schoolIds, row.schoolId) ||
        !matchesSelected(filters.academicYearIds, row.academicYearId) ||
        !matchesSelected(filters.termIds, row.termId) ||
        !matchesSelected(filters.classContextKeys, row.classContextKey) ||
        !matchesSelected(filters.measurementKeys, getMeasurementFilterKey(row)) ||
        !matchesSelected(filters.subjectKeys, row.subjectKey)
      ) {
        continue;
      }

      if (row.score === undefined) continue;
      const maxScore = finiteNumber(row.maxScore);
      if (maxScore !== undefined && maxScore > 0) maxScores.add(maxScore);
    }

    return Array.from(maxScores).sort((left, right) => left - right);
  }, [
    filters.academicYearIds,
    filters.classContextKeys,
    filters.measurementKeys,
    filters.schoolIds,
    filters.subjectKeys,
    filters.termIds,
    loadedRows,
  ]);
  const suggestedMaximumScore =
    matchingMaximumScores.length === 1
      ? String(matchingMaximumScores[0])
      : null;
  const maximumScoreSuggestionKey = JSON.stringify({
    schoolIds: filters.schoolIds,
    academicYearIds: filters.academicYearIds,
    termIds: filters.termIds,
    classContextKeys: filters.classContextKeys,
    measurementKeys: filters.measurementKeys,
    subjectKeys: filters.subjectKeys,
    maxScores: matchingMaximumScores,
  });

  useEffect(() => {
    setFilters((current) => {
      const previousAutomaticValue = automaticMaximumScoreRef.current;
      const hasManualValue =
        current.maximumScore.trim() !== "" &&
        current.maximumScore !== previousAutomaticValue;

      if (hasManualValue) {
        automaticMaximumScoreRef.current = null;
        return current;
      }

      const nextMaximumScore = suggestedMaximumScore ?? "";
      automaticMaximumScoreRef.current = suggestedMaximumScore;

      return current.maximumScore === nextMaximumScore
        ? current
        : { ...current, maximumScore: nextMaximumScore };
    });
  }, [maximumScoreSuggestionKey, suggestedMaximumScore]);

  const maximumScoreHint =
    matchingMaximumScores.length === 0
      ? ""
      : matchingMaximumScores.length === 1
        ? `الدرجة العظمى: ${new Intl.NumberFormat("ar-SA").format(
            matchingMaximumScores[0],
          )}`
        : "الدرجة العظمى تختلف حسب المواد أو القياسات المحددة";

  const filteredRows = useMemo(
    () =>
      loadedRows.filter((row) => {
        if (!matchesSelected(filters.schoolIds, row.schoolId)) return false;
        if (!matchesSelected(filters.academicYearIds, row.academicYearId)) return false;
        if (!matchesSelected(filters.termIds, row.termId)) return false;
        if (!matchesSelected(filters.classContextKeys, row.classContextKey)) return false;
        if (!matchesSelected(filters.measurementKeys, getMeasurementFilterKey(row))) {
          return false;
        }
        if (!matchesSelected(filters.subjectKeys, row.subjectKey)) return false;
        if (filters.studentId !== ALL && row.studentId !== filters.studentId) return false;

        if (!hasScoreRange) return true;
        if (row.score === undefined) return false;
        if (minimumScore !== undefined && row.score < minimumScore) {
          return false;
        }
        if (maximumScore !== undefined && row.score > maximumScore) {
          return false;
        }

        return true;
      }),
    [
      filters.academicYearIds,
      filters.classContextKeys,
      filters.schoolIds,
      filters.studentId,
      filters.subjectKeys,
      filters.measurementKeys,
      filters.termIds,
      hasScoreRange,
      loadedRows,
      maximumScore,
      minimumScore,
    ],
  );

  const structuralRankingRows = useMemo(
    () =>
      loadedRows.filter((row) => {
        if (!matchesSelected(filters.schoolIds, row.schoolId)) return false;
        if (!matchesSelected(filters.academicYearIds, row.academicYearId)) return false;
        if (!matchesSelected(filters.termIds, row.termId)) return false;
        if (!matchesSelected(filters.classContextKeys, row.classContextKey)) {
          return false;
        }
        if (!matchesSelected(filters.measurementKeys, getMeasurementFilterKey(row))) {
          return false;
        }
        return matchesSelected(filters.subjectKeys, row.subjectKey);
      }),
    [
      filters.academicYearIds,
      filters.classContextKeys,
      filters.measurementKeys,
      filters.schoolIds,
      filters.subjectKeys,
      filters.termIds,
      loadedRows,
    ],
  );

  const allStudentRankings = useMemo(
    () => buildStudentRankings(structuralRankingRows),
    [structuralRankingRows],
  );
  const visibleStudentRankings = useMemo(
    () =>
      rankStudentRankings(
        rankingMode === "COMPLETE"
          ? allStudentRankings.filter(
              (row) =>
                row.expectedCount > 0 &&
                row.completedCount === row.expectedCount &&
                row.numericResultCount === row.expectedCount,
            )
          : allStudentRankings,
      ),
    [allStudentRankings, rankingMode],
  );
  const topStudentRankings = useMemo(
    () => visibleStudentRankings.filter((row) => row.rank <= 3),
    [visibleStudentRankings],
  );
  const selectedStudentRanking = useMemo(
    () =>
      filters.studentId === ALL
        ? null
        : visibleStudentRankings.find((row) => row.studentId === filters.studentId) ??
          null,
    [filters.studentId, visibleStudentRankings],
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

  const updateMultiFilter = (key: MultiFilterKey, values: string[]) => {
    setFilters((current) => ({ ...current, [key]: values }));
    setError(null);
  };

  const updateMeasurementFilters = (measurementKeys: string[]) => {
    setFilters((current) => ({
      ...current,
      measurementKeys,
    }));
    setError(null);
  };

  async function showReport() {
    if (!navigationAccess.canAccessReports) return;

    if (hasInvalidScore) {
      setError("أدخل درجة رقمية صحيحة.");
      return;
    }

    if (
      minimumScore !== undefined &&
      maximumScore !== undefined &&
      minimumScore > maximumScore
    ) {
      setError("الدرجة من لا يمكن أن تتجاوز الدرجة إلى.");
      return;
    }

    if (
      (minimumScore !== undefined && minimumScore < 0) ||
      (maximumScore !== undefined && maximumScore < 0)
    ) {
      setError("لا يمكن أن تكون الدرجة سالبة.");
      return;
    }

    const requestedFilters = { ...filters };
    const requestedFilterKey = getFilterKey(requestedFilters);
    const scopedClasses = visibleClasses.filter(
      (classInfo) =>
        matchesSelected(requestedFilters.schoolIds, classInfo.schoolId) &&
        matchesSelected(
          requestedFilters.academicYearIds,
          classInfo.academicYearId,
        ) &&
        matchesSelected(
          requestedFilters.classContextKeys,
          getClassKey(classInfo),
        ),
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
          matchesSelected(requestedFilters.termIds, batch.termId)
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
            termId: batch.termId,
            classId: batch.classId,
            classContextKey: getClassKey(classInfo),
            classTitle,
            subjectKey,
            subjectTitle: subjectLabel,
            subjectLabel,
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
    automaticMaximumScoreRef.current = null;
    setFilters(initialFilters);
    setLoadedRows([]);
    setReportedFilterKey(null);
    setReportedAt(null);
    setRankingMode("CURRENT");
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

  const schoolFilterOptions = schoolOptions.map(
    (school) => [school.id, school.name] as [string, string],
  );
  const termFilterOptions = termOptions.map(
    (term) => [term.id, term.title] as [string, string],
  );
  const classFilterOptions = classOptions.map(
    (classInfo) => [classInfo.id, classInfo.label] as [string, string],
  );
  const measurementFilterOptions = measurementOptions.map(
    (measurement) => [measurement.id, measurement.label] as [string, string],
  );
  const selectedSchoolLabel = getMultiSelectionSummary(
    schoolFilterOptions,
    filters.schoolIds,
    "كل المدارس",
    (count) => `${count} مدارس محددة`,
  );
  const selectedYearLabel = getMultiSelectionSummary(
    academicYearOptions,
    filters.academicYearIds,
    "كل الأعوام",
    (count) => `${count} أعوام محددة`,
  );
  const selectedTermLabel = getMultiSelectionSummary(
    termFilterOptions,
    filters.termIds,
    "كل الفصول",
    (count) => `${count} فصول محددة`,
  );
  const selectedClassLabel = getMultiSelectionSummary(
    classFilterOptions,
    filters.classContextKeys,
    "كل الفصول الدراسية",
    (count) => `${count} فصول محددة`,
  );
  const selectedMeasurementLabel = getMultiSelectionSummary(
    measurementFilterOptions,
    filters.measurementKeys,
    "كل القياسات",
    (count) => `${count} قياسات محددة`,
  );
  const selectedSubjectLabel = getMultiSelectionSummary(
    subjectOptions,
    filters.subjectKeys,
    "كل المواد",
    (count) => `${count} مواد محددة`,
  );
  const selectedStudentLabel =
    studentOptions.find(([studentId]) => studentId === filters.studentId)?.[1] ||
    "كل الطلاب";
  const scoreRangeLabel = !hasScoreRange
    ? "كل الدرجات"
    : `من ${filters.minimumScore || "—"} إلى ${filters.maximumScore || "—"}`;
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

      <section className="student-scores-report-card rounded-3xl border bg-card shadow-sm">
        <div className="student-scores-no-print border-b bg-muted/20 p-5 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            درجات الطلاب
          </h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            تقرير تفصيلي لدرجات القياسات والمتابعات ضمن الفصول المرئية لك.
          </p>
        </div>

        <div className="student-scores-no-print grid gap-4 border-b p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <MultiSelectFilter
            label="المدرسة"
            values={filters.schoolIds}
            onChange={(values) => updateMultiFilter("schoolIds", values)}
            options={schoolFilterOptions}
            allLabel="كل المدارس"
            getMultipleLabel={(count) => `${count} مدارس محددة`}
          />
          <MultiSelectFilter
            label="العام الدراسي"
            values={filters.academicYearIds}
            onChange={(values) => updateMultiFilter("academicYearIds", values)}
            options={academicYearOptions}
            allLabel="كل الأعوام"
            getMultipleLabel={(count) => `${count} أعوام محددة`}
          />
          <MultiSelectFilter
            label="الفصل الدراسي"
            values={filters.termIds}
            onChange={(values) => updateMultiFilter("termIds", values)}
            options={termFilterOptions}
            allLabel="كل الفصول"
            getMultipleLabel={(count) => `${count} فصول محددة`}
          />
          <MultiSelectFilter
            label="الصف والفصل"
            values={filters.classContextKeys}
            onChange={(values) => updateMultiFilter("classContextKeys", values)}
            options={classFilterOptions}
            allLabel="كل الفصول الدراسية"
            getMultipleLabel={(count) => `${count} فصول محددة`}
          />
          <MultiSelectFilter
            label="الاختبار / القياس"
            values={filters.measurementKeys}
            onChange={updateMeasurementFilters}
            options={measurementFilterOptions}
            allLabel="كل القياسات"
            getMultipleLabel={(count) => `${count} قياسات محددة`}
            disabled={loadStatus === "loading"}
          />
          <MultiSelectFilter
            label="المادة"
            values={filters.subjectKeys}
            onChange={(values) => updateMultiFilter("subjectKeys", values)}
            options={subjectOptions}
            allLabel="كل المواد"
            getMultipleLabel={(count) => `${count} مواد محددة`}
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
            label="الدرجة من"
            value={filters.minimumScore}
            onChange={(value) => updateFilter("minimumScore", value)}
          />
          <NumberFilter
            label="الدرجة إلى"
            value={filters.maximumScore}
            onChange={(value) => {
              automaticMaximumScoreRef.current = null;
              updateFilter("maximumScore", value);
            }}
            hint={maximumScoreHint}
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
        ) : (
          <div id="student-scores-report" className="space-y-5 p-5">
            <div className="hidden border-b pb-4 print:block">
              <p className="text-sm font-semibold">{organizationName}</p>
              <h2 className="text-xl font-bold">تقرير درجات الطلاب</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                طُبع في {reportedAt ? formatDate(reportedAt) : "غير محدد"}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                المدرسة: {selectedSchoolLabel} · العام: {selectedYearLabel} · الفصل: {selectedTermLabel} · الصف والفصل: {selectedClassLabel} · الاختبار / القياس: {selectedMeasurementLabel} · المادة: {selectedSubjectLabel} · الطالب: {selectedStudentLabel} · الدرجة: {scoreRangeLabel}{maximumScoreHint ? ` · ${maximumScoreHint}` : ""}
              </p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                نمط الترتيب: {rankingMode === "CURRENT" ? "الترتيب الحالي" : "المكتمل فقط"}
              </p>
            </div>

            <RankingResults
              rankings={visibleStudentRankings}
              topRankings={topStudentRankings}
              rankingMode={rankingMode}
              onRankingModeChange={setRankingMode}
              selectedStudentId={filters.studentId}
              selectedStudentRanking={selectedStudentRanking}
            />

            {filteredRows.length === 0 ? (
              <ReportEmptyState
                icon={AlertTriangle}
                title="لا توجد نتائج مطابقة للفلاتر المحددة"
                description="غيّر المادة أو القياس أو الطالب أو نطاق الدرجة ثم اعرض التقرير مجددًا."
              />
            ) : (
              <>
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
                    <th className="px-3 py-3 font-semibold">الاختبار / القياس</th>
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
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function MultiSelectFilter({
  label,
  values,
  onChange,
  options,
  allLabel,
  getMultipleLabel,
  disabled = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<[string, string]>;
  allLabel: string;
  getMultipleLabel: (count: number) => string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectionSummary = getMultiSelectionSummary(
    options,
    values,
    allLabel,
    getMultipleLabel,
  );

  function toggleValue(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((currentValue) => currentValue !== value)
        : [...values, value],
    );
  }

  return (
    <div className="relative grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={isOpen}
        className="flex h-10 items-center justify-between gap-2 rounded-xl border bg-background px-3 text-right text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selectionSummary}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b px-2 py-2 text-xs">
            <button
              type="button"
              onClick={() => onChange([])}
              className="rounded-lg px-2 py-1 font-semibold text-primary transition hover:bg-muted"
            >
              {allLabel}
            </button>
            {values.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-muted"
              >
                مسح التحديد
              </button>
            ) : null}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-xs leading-6 text-muted-foreground">
                لا توجد خيارات متاحة ضمن الاختيارات الحالية.
              </p>
            ) : (
              options.map(([optionValue, optionLabel]) => {
                const isSelected = values.includes(optionValue);

                return (
                  <button
                    key={optionValue}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggleValue(optionValue)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm transition hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {isSelected ? <Check className="size-3" /> : null}
                    </span>
                    <span>{optionLabel}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RankingResults({
  rankings,
  topRankings,
  rankingMode,
  onRankingModeChange,
  selectedStudentId,
  selectedStudentRanking,
}: {
  rankings: StudentRankingRow[];
  topRankings: StudentRankingRow[];
  rankingMode: RankingMode;
  onRankingModeChange: (mode: RankingMode) => void;
  selectedStudentId: string;
  selectedStudentRanking: StudentRankingRow | null;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-muted/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Trophy className="size-5" />
          </div>
          <div>
            <h2 className="font-bold">المراكز حسب نطاق الفلاتر</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              لا تتأثر المراكز باختيار الطالب أو نطاق الدرجات الخام، وتُحتسب من النتائج
              الرقمية بعد التعويض ضمن الفلاتر الهيكلية فقط.
            </p>
          </div>
        </div>
        <div className="student-scores-no-print inline-flex rounded-xl border bg-background p-1 text-sm">
          <button
            type="button"
            onClick={() => onRankingModeChange("CURRENT")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              rankingMode === "CURRENT"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            الترتيب الحالي
          </button>
          <button
            type="button"
            onClick={() => onRankingModeChange("COMPLETE")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              rankingMode === "COMPLETE"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            المكتمل فقط
          </button>
        </div>
      </div>

      {selectedStudentId !== ALL ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          {selectedStudentRanking ? (
            <>
              ترتيب الطالب المحدد: <strong>المركز {selectedStudentRanking.rank}</strong>
              {" من "}
              <strong>{rankings.length}</strong>
            </>
          ) : (
            "لا يملك الطالب المحدد نتائج رقمية قابلة للترتيب ضمن النطاق الحالي."
          )}
        </div>
      ) : null}

      {rankings.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-background px-4 py-5 text-center text-sm leading-7 text-muted-foreground">
          لا توجد نتائج رقمية قابلة للترتيب ضمن الفلاتر الحالية.
        </div>
      ) : (
        <>
          <h3 className="text-sm font-semibold">المراكز الأولى</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topRankings.map((row) => {
              const warning = getRankingCompletionWarning(row);
              const isSelected = row.studentId === selectedStudentId;

              return (
                <div
                  key={row.studentId}
                  className={`rounded-xl border bg-background p-4 ${
                    isSelected ? "border-primary ring-1 ring-primary/30" : ""
                  }`}
                >
                  <p className="text-xs font-semibold text-primary">المركز {row.rank}</p>
                  <p className="mt-1 font-bold">{row.studentName}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatOneDecimal(row.roundedAveragePercentage)}٪
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {row.contexts.join(" · ")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    مكتمل: {row.completedCount} / {row.expectedCount}
                  </p>
                  {warning ? (
                    <p className="mt-1 text-xs leading-5 text-amber-700">⚠ {warning}</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="student-scores-table min-w-[850px] w-full text-right text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">المركز</th>
                  <th className="px-3 py-3 font-semibold">الطالب</th>
                  <th className="px-3 py-3 font-semibold">المدرسة / الصف والفصل</th>
                  <th className="px-3 py-3 font-semibold">متوسط النسبة</th>
                  <th className="px-3 py-3 font-semibold">اكتمال القياسات</th>
                  <th className="px-3 py-3 font-semibold">تنبيه</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rankings.map((row) => {
                  const warning = getRankingCompletionWarning(row);
                  const isSelected = row.studentId === selectedStudentId;

                  return (
                    <tr
                      key={row.studentId}
                      className={`align-top ${
                        isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-3 py-3 font-bold">{row.rank}</td>
                      <td className="px-3 py-3 font-medium">
                        {row.studentName}
                        {isSelected ? (
                          <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            الطالب المحدد
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {row.contexts.join(" · ")}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatOneDecimal(row.roundedAveragePercentage)}٪
                      </td>
                      <td className="px-3 py-3">
                        {row.completedCount} / {row.expectedCount}
                      </td>
                      <td className="px-3 py-3 text-xs leading-5 text-amber-700">
                        {warning ? `⚠ ${warning}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
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
  hint = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="الدرجة"
        className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
      />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
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
