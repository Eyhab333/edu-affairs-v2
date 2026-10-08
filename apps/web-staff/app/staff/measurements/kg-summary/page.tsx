"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  RotateCcw,
  TableProperties,
} from "lucide-react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import type { StudentMeasurementBatch } from "@takween/contracts";
import { getSpecialStaffReportingAccess } from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db } from "@/lib/firebase";
import { getFriendlyClassTitle } from "@/lib/class-presentation";
import { getEffectiveMeasurementRows } from "@/lib/measurement-compensation";
import { calculateMeasurementClassSummary } from "@/lib/measurement-class-summary";
import {
  calculateKgWeightedMeasurementSummary,
  getKgEvaluatorRoleLabel,
  getKgSubjectLabel,
  isKgMeasurementSubject,
  KG_EVALUATOR_ROLES,
  KG_MEASUREMENT_SUBJECTS,
  type KgEvaluatorRole,
  type KgMeasurementSubject,
  type KgRoleComponent,
  type KgWeightedMeasurementSummary,
} from "@/lib/kg-measurement-summary";
import { loadSpecialMeasurementSummarySource } from "@/lib/special-measurement-summary-report";

type VisibleKgClass = {
  id: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
  streamId?: string;
  title?: string;
  code?: string;
  sectionLabel?: string;
  schoolName?: string;
  order?: number;
};

type StaffActorLike = {
  orgId?: string;
  personId?: string;
  uid?: string;
  visibleClasses?: VisibleKgClass[];
  schools?: Array<{ id: string; name?: string }>;
  currentTerm?: {
    id: string;
    academicYearId: string;
    title?: string;
    shortTitle?: string;
  } | null;
};

type KgAssessmentTemplate = {
  id: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  schoolType?: string;
  subjectKey?: string;
  evaluatorRoleKey?: string;
  applicableTermIds?: string[];
  isActive?: boolean;
  title?: string;
  maxScore?: number;
  order?: number;
};

type KgMeasurementBatch = StudentMeasurementBatch & {
  id: string;
  isCompensationBatch?: boolean;
  originalBatchId?: string;
};

type TemplateClassMeasurement = {
  templateId: string;
  templateTitle: string;
  percentage: number | null;
};

type KgSummaryRow = {
  key: string;
  schoolId: string;
  schoolName: string;
  classKey: string;
  classTitle: string;
  subjectKey: KgMeasurementSubject;
  subjectTitle: string;
  teacherAssignmentId: string;
  teacherPersonId: string;
  teacherName: string;
  summary: KgWeightedMeasurementSummary;
  measurementsByRole: Partial<
    Record<KgEvaluatorRole, TemplateClassMeasurement[]>
  >;
  missingText: string[];
};

type TeacherDirectoryEntry = {
  teacherPersonId: string;
  teacherName: string;
};

type ConfigurationWarning = {
  key: string;
  classTitle: string;
  subjectTitle: string;
  missingRoles: KgEvaluatorRole[];
};

type LoadingState = "idle" | "loading" | "success" | "error";

const FIRESTORE_IN_QUERY_LIMIT = 30;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.map((value) => value?.trim() || "").filter(Boolean)),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getClassKey(value: {
  schoolId?: string;
  academicYearId?: string;
  id?: string;
  classId?: string;
}) {
  return [
    value.schoolId || "NO_SCHOOL",
    value.academicYearId || "NO_YEAR",
    value.classId ?? value.id ?? "NO_CLASS",
  ].join(":");
}

function getContextKey(classKey: string, subjectKey: KgMeasurementSubject) {
  return `${classKey}|${subjectKey}`;
}

function normalizeKey(value?: string) {
  return String(value ?? "").trim().toUpperCase();
}

function isKgClass(classInfo: VisibleKgClass) {
  const gradeId = normalizeKey(classInfo.gradeId);
  const schoolId = String(classInfo.schoolId ?? "").toLowerCase();

  return ["KG1", "KG2", "KG3"].includes(gradeId) || schoolId.startsWith("kg-");
}

function isKgEvaluatorRole(value?: string): value is KgEvaluatorRole {
  return KG_EVALUATOR_ROLES.includes(value as KgEvaluatorRole);
}

function isTemplateExpectedForClass(params: {
  template: KgAssessmentTemplate;
  classInfo: VisibleKgClass;
  subjectKey: KgMeasurementSubject;
  academicYearId: string;
  termId: string;
}) {
  const { template, classInfo, subjectKey, academicYearId, termId } = params;

  return (
    template.isActive !== false &&
    template.schoolType === "KG" &&
    template.subjectKey === subjectKey &&
    Boolean(classInfo.gradeId) &&
    template.gradeId === classInfo.gradeId &&
    (!template.schoolId?.trim() || template.schoolId === classInfo.schoolId) &&
    template.academicYearId === academicYearId &&
    Boolean(template.applicableTermIds?.includes(termId)) &&
    isKgEvaluatorRole(template.evaluatorRoleKey)
  );
}

function getBatchTimestamp(batch: KgMeasurementBatch) {
  return batch.submittedAt ?? batch.updatedAt ?? batch.createdAt ?? 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getSavedMaxScore(rows: KgMeasurementBatch["studentRows"]) {
  return rows?.find((row) => isFiniteNumber(row.maxScore))?.maxScore;
}

async function loadTeacherDirectory(
  orgId: string,
  teacherAssignmentIds: string[],
) {
  if (teacherAssignmentIds.length === 0) {
    return new Map<string, TeacherDirectoryEntry>();
  }

  const assignmentsRef = collection(db, "orgs", orgId, "teacherAssignments");
  const assignmentSnapshots = await Promise.all(
    chunkValues(teacherAssignmentIds, FIRESTORE_IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(assignmentsRef, where(documentId(), "in", ids))),
    ),
  );
  const assignmentById = new Map<string, { teacherPersonId: string }>();

  assignmentSnapshots.flatMap((snapshot) => snapshot.docs).forEach((snapshot) => {
    const data = snapshot.data() as { teacherPersonId?: string };
    const teacherPersonId = data.teacherPersonId?.trim() || "";
    if (teacherPersonId) {
      assignmentById.set(snapshot.id, { teacherPersonId });
    }
  });

  const personIds = uniqueStrings(
    Array.from(assignmentById.values()).map(
      (assignment) => assignment.teacherPersonId,
    ),
  );
  const peopleRef = collection(db, "orgs", orgId, "people");
  const personSnapshots = await Promise.all(
    chunkValues(personIds, FIRESTORE_IN_QUERY_LIMIT).map((ids) =>
      getDocs(query(peopleRef, where(documentId(), "in", ids))),
    ),
  );
  const personNameById = new Map<string, string>();

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

function formatPercentage(value: number | null) {
  if (value === null) return "—";

  return `${new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function getRoleComponent(
  summary: KgWeightedMeasurementSummary,
  roleKey: KgEvaluatorRole,
) {
  return summary.roles.find((role) => role.roleKey === roleKey) ?? null;
}

function getMissingText(summary: KgWeightedMeasurementSummary) {
  return summary.roles.flatMap((role) => {
    const roleLabel = getKgEvaluatorRoleLabel(role.roleKey);

    if (role.expectedMeasurementCount === 0) {
      return [`قوالب ${roleLabel} غير متاحة`];
    }

    const remaining =
      role.expectedMeasurementCount - role.completedMeasurementCount;

    return remaining > 0 ? [`قياس ${roleLabel} ${remaining}`] : [];
  });
}

export default function StaffKgMeasurementSummaryPage() {
  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;
  const [status, setStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<KgAssessmentTemplate[]>([]);
  const [batches, setBatches] = useState<KgMeasurementBatch[]>([]);
  const [specialReportClasses, setSpecialReportClasses] = useState<VisibleKgClass[]>([]);
  const [teacherDirectoryByAssignmentId, setTeacherDirectoryByAssignmentId] = useState<
    Map<string, TeacherDirectoryEntry>
  >(new Map());
  const [schoolFilter, setSchoolFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");

  const orgId = staffActor?.orgId?.trim() || "";
  const actorPersonId = staffActor?.personId?.trim() || "";
  const actorUid = staffActor?.uid?.trim() || "";
  const currentTerm = staffActor?.currentTerm ?? null;
  const specialReportingAccess = useMemo(
    () =>
      getSpecialStaffReportingAccess({
        orgId,
        personId: actorPersonId,
        uid: actorUid,
      }),
    [actorPersonId, actorUid, orgId],
  );
  const normalVisibleKgClasses = useMemo(
    () => (staffActor?.visibleClasses ?? []).filter(isKgClass),
    [staffActor?.visibleClasses],
  );
  const normalCurrentKgClasses = useMemo(
    () =>
      normalVisibleKgClasses.filter(
        (classInfo) =>
          classInfo.academicYearId === currentTerm?.academicYearId,
      ),
    [currentTerm?.academicYearId, normalVisibleKgClasses],
  );
  const currentKgClasses = useMemo(
    () =>
      specialReportingAccess
        ? specialReportClasses.filter(
            (classInfo) =>
              isKgClass(classInfo) &&
              classInfo.academicYearId === currentTerm?.academicYearId,
          )
        : normalCurrentKgClasses,
    [
      currentTerm?.academicYearId,
      normalCurrentKgClasses,
      specialReportClasses,
      specialReportingAccess,
    ],
  );
  const normalClassByKey = useMemo(
    () =>
      new Map(
        normalCurrentKgClasses.map((classInfo) => [
          getClassKey(classInfo),
          classInfo,
        ]),
      ),
    [normalCurrentKgClasses],
  );
  const visibleClassByKey = useMemo(
    () =>
      new Map(
        currentKgClasses.map((classInfo) => [
          getClassKey(classInfo),
          classInfo,
        ]),
      ),
    [currentKgClasses],
  );

  const loadSummary = useCallback(async () => {
    if (!orgId || !currentTerm?.academicYearId || !currentTerm.id) return;

    if (specialReportingAccess) {
      setStatus("loading");
      setError("");
      setSpecialReportClasses([]);
      setTemplates([]);
      setBatches([]);
      setTeacherDirectoryByAssignmentId(new Map());

      try {
        const source = await loadSpecialMeasurementSummarySource({
          orgId,
          academicYearId: currentTerm.academicYearId,
          termId: currentTerm.id,
        });
        const schoolNameById = new Map(
          source.schools.map((school) => [school.id, school.name]),
        );
        const nextClasses = (source.classes as unknown as VisibleKgClass[]).map(
          (classInfo) => ({
            ...classInfo,
            schoolName:
              classInfo.schoolName ||
              schoolNameById.get(classInfo.schoolId ?? ""),
          }),
        );
        const nextTeacherDirectory = new Map<string, TeacherDirectoryEntry>(
          source.teacherDirectory.map((entry) => [
            entry.assignmentId,
            {
              teacherPersonId: entry.teacherPersonId,
              teacherName: entry.teacherName,
            },
          ]),
        );

        setSpecialReportClasses(nextClasses);
        setTemplates(source.templates as unknown as KgAssessmentTemplate[]);
        setBatches(source.batches as unknown as KgMeasurementBatch[]);
        setTeacherDirectoryByAssignmentId(nextTeacherDirectory);
        setStatus("success");
      } catch (nextError: unknown) {
        setSpecialReportClasses([]);
        setError(getErrorMessage(nextError));
        setStatus("error");
      }
      return;
    }

    if (normalCurrentKgClasses.length === 0) {
      setTemplates([]);
      setBatches([]);
      setTeacherDirectoryByAssignmentId(new Map());
      setStatus("success");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const assessmentTemplatesRef = collection(
        db,
        "orgs",
        orgId,
        "studentAssessmentTemplates",
      );
      const batchesRef = collection(
        db,
        "orgs",
        orgId,
        "studentMeasurementBatches",
      );
      const schoolIds = uniqueStrings(
        normalCurrentKgClasses.map((classInfo) => classInfo.schoolId),
      );

      const [templateSnapshot, ...batchSnapshots] = await Promise.all([
        getDocs(assessmentTemplatesRef),
        ...schoolIds.map((schoolId) =>
          getDocs(query(batchesRef, where("schoolId", "==", schoolId))),
        ),
      ]);

      const loadedBatches = batchSnapshots.flatMap((snapshot) =>
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<KgMeasurementBatch, "id">),
        })),
      );
      const teacherAssignmentIds = uniqueStrings(
        loadedBatches
          .filter((batch) => {
            const classInfo = normalClassByKey.get(getClassKey(batch));
            return (
              batch.status === "SUBMITTED" &&
              batch.academicYearId === currentTerm.academicYearId &&
              batch.termId === currentTerm.id &&
              Boolean(classInfo) &&
              isKgMeasurementSubject(batch.subjectKey)
            );
          })
          .map((batch) => batch.teacherAssignmentId),
      );
      const nextTeacherDirectory = await loadTeacherDirectory(
        orgId,
        teacherAssignmentIds,
      );

      setTemplates(
        templateSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<KgAssessmentTemplate, "id">),
        })),
      );
      setBatches(loadedBatches);
      setTeacherDirectoryByAssignmentId(nextTeacherDirectory);
      setStatus("success");
    } catch (nextError: unknown) {
      setTemplates([]);
      setBatches([]);
      setTeacherDirectoryByAssignmentId(new Map());
      setError(getErrorMessage(nextError));
      setStatus("error");
    }
  }, [
    currentTerm?.academicYearId,
    currentTerm?.id,
    normalClassByKey,
    normalCurrentKgClasses,
    orgId,
    specialReportingAccess,
  ]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const { rows, configurationWarnings, matchingTemplateCount } = useMemo(() => {
    if (!currentTerm) {
      return {
        rows: [] as KgSummaryRow[],
        configurationWarnings: [] as ConfigurationWarning[],
        matchingTemplateCount: 0,
      };
    }

    const expectedTemplatesByContext = new Map<
      string,
      KgAssessmentTemplate[]
    >();
    const contexts: Array<{
      classInfo: VisibleKgClass;
      classKey: string;
      subjectKey: KgMeasurementSubject;
    }> = [];

    for (const classInfo of currentKgClasses) {
      const classKey = getClassKey(classInfo);

      for (const subjectKey of KG_MEASUREMENT_SUBJECTS) {
        const contextKey = getContextKey(classKey, subjectKey);
        const expectedTemplates = templates
          .filter((template) =>
            isTemplateExpectedForClass({
              template,
              classInfo,
              subjectKey,
              academicYearId: currentTerm.academicYearId,
              termId: currentTerm.id,
            }),
          )
          .sort(
            (left, right) =>
              (left.order ?? 0) - (right.order ?? 0) ||
              (left.title ?? "").localeCompare(right.title ?? "", "ar"),
          );

        expectedTemplatesByContext.set(contextKey, expectedTemplates);
        contexts.push({ classInfo, classKey, subjectKey });
      }
    }

    const scopedBatches = batches.filter((batch) => {
      const classKey = getClassKey(batch);
      const classInfo = visibleClassByKey.get(classKey);

      return (
        batch.status === "SUBMITTED" &&
        batch.academicYearId === currentTerm.academicYearId &&
        batch.termId === currentTerm.id &&
        Boolean(classInfo) &&
        isKgMeasurementSubject(batch.subjectKey)
      );
    });
    const compensationByOriginalBatchId = new Map<string, KgMeasurementBatch[]>();

    for (const batch of scopedBatches) {
      if (batch.isCompensationBatch !== true || !batch.originalBatchId) continue;

      const compensationBatches =
        compensationByOriginalBatchId.get(batch.originalBatchId) ?? [];
      compensationBatches.push(batch);
      compensationByOriginalBatchId.set(batch.originalBatchId, compensationBatches);
    }

    const latestOriginalBatchByTemplate = new Map<string, KgMeasurementBatch>();

    for (const batch of scopedBatches) {
      if (batch.isCompensationBatch === true) continue;
      if (!isKgMeasurementSubject(batch.subjectKey)) continue;

      const contextKey = getContextKey(
        getClassKey(batch),
        batch.subjectKey,
      );
      const expectedTemplates = expectedTemplatesByContext.get(contextKey) ?? [];

      if (!expectedTemplates.some((template) => template.id === batch.templateId)) {
        continue;
      }

      const measurementKey = `${contextKey}|${batch.templateId}`;
      const existing = latestOriginalBatchByTemplate.get(measurementKey);

      if (
        !existing ||
        getBatchTimestamp(batch) > getBatchTimestamp(existing) ||
        (getBatchTimestamp(batch) === getBatchTimestamp(existing) &&
          batch.id > existing.id)
      ) {
        latestOriginalBatchByTemplate.set(measurementKey, batch);
      }
    }

    const classPercentageByBatchId = new Map<string, number | null>();

    for (const batch of latestOriginalBatchByTemplate.values()) {
      if (!isKgMeasurementSubject(batch.subjectKey)) continue;

      const contextKey = getContextKey(
        getClassKey(batch),
        batch.subjectKey,
      );
      const template = (expectedTemplatesByContext.get(contextKey) ?? []).find(
        (candidate) => candidate.id === batch.templateId,
      );
      if (!template) continue;

      const effectiveRows = getEffectiveMeasurementRows({
        originalBatchId: batch.id,
        originalRows: batch.studentRows ?? [],
        compensationBatches:
          compensationByOriginalBatchId.get(batch.id) ?? [],
      });
      const classSummary = calculateMeasurementClassSummary({
        rows: effectiveRows,
        maxScore: getSavedMaxScore(effectiveRows) ?? template.maxScore,
      });

      classPercentageByBatchId.set(batch.id, classSummary.percentage);
    }

    const configurationWarnings: ConfigurationWarning[] = [];
    const rows: KgSummaryRow[] = [];

    for (const context of contexts) {
      const contextKey = getContextKey(context.classKey, context.subjectKey);
      const expectedTemplates = expectedTemplatesByContext.get(contextKey) ?? [];
      const expectedTemplatesByRole = new Map<
        KgEvaluatorRole,
        KgAssessmentTemplate[]
      >();

      for (const roleKey of KG_EVALUATOR_ROLES) {
        expectedTemplatesByRole.set(
          roleKey,
          expectedTemplates.filter(
            (template) => template.evaluatorRoleKey === roleKey,
          ),
        );
      }

      const preview = calculateKgWeightedMeasurementSummary({
        subjectKey: context.subjectKey,
        roleInputs: Object.fromEntries(
          Array.from(expectedTemplatesByRole.entries()).map(
            ([roleKey, roleTemplates]) => [
              roleKey,
              {
                expectedMeasurementCount: roleTemplates.length,
                measurementPercentages: [],
              },
            ],
          ),
        ) as Partial<
          Record<
            KgEvaluatorRole,
            { expectedMeasurementCount: number; measurementPercentages: number[] }
          >
        >,
      });

      if (preview.missingConfiguredRoles.length > 0) {
        configurationWarnings.push({
          key: contextKey,
          classTitle:
            getFriendlyClassTitle(context.classInfo, currentKgClasses) ||
            context.classInfo.title ||
            context.classInfo.code ||
            "فصل روضة",
          subjectTitle: getKgSubjectLabel(context.subjectKey),
          missingRoles: preview.missingConfiguredRoles,
        });
      }

      const measurementsByRole: Partial<
        Record<KgEvaluatorRole, TemplateClassMeasurement[]>
      > = {};
      const roleInputs: Partial<
        Record<
          KgEvaluatorRole,
          { expectedMeasurementCount: number; measurementPercentages: Array<number | null> }
        >
      > = {};

      for (const [roleKey, roleTemplates] of expectedTemplatesByRole) {
        const measurements = roleTemplates.map((template) => {
          const batch = latestOriginalBatchByTemplate.get(
            `${contextKey}|${template.id}`,
          );

          return {
            templateId: template.id,
            templateTitle: template.title || template.id,
            percentage: batch
              ? classPercentageByBatchId.get(batch.id) ?? null
              : null,
          };
        });

        measurementsByRole[roleKey] = measurements;
        roleInputs[roleKey] = {
          expectedMeasurementCount: roleTemplates.length,
          measurementPercentages: measurements.map(
            (measurement) => measurement.percentage,
          ),
        };
      }

      if (
        !expectedTemplates.some((template) =>
          latestOriginalBatchByTemplate.has(`${contextKey}|${template.id}`),
        )
      ) {
        continue;
      }

      const summary = calculateKgWeightedMeasurementSummary({
        subjectKey: context.subjectKey,
        roleInputs,
      });
      const teacherTemplateAssignmentIds = uniqueStrings(
        (expectedTemplatesByRole.get("KG_TEACHER") ?? []).map((template) =>
          latestOriginalBatchByTemplate
            .get(`${contextKey}|${template.id}`)
            ?.teacherAssignmentId,
        ),
      );
      const teacherAssignmentIds =
        teacherTemplateAssignmentIds.length > 0
          ? teacherTemplateAssignmentIds
          : uniqueStrings(
              expectedTemplates.map((template) =>
                latestOriginalBatchByTemplate
                  .get(`${contextKey}|${template.id}`)
                  ?.teacherAssignmentId,
              ),
            );
      const teacherIdentityByKey = new Map<
        string,
        Pick<
          KgSummaryRow,
          "teacherAssignmentId" | "teacherPersonId" | "teacherName"
        >
      >();

      for (const teacherAssignmentId of teacherAssignmentIds) {
        const teacher = teacherDirectoryByAssignmentId.get(teacherAssignmentId);
        const teacherPersonId = teacher?.teacherPersonId || "";
        const identityKey = teacherPersonId
          ? `PERSON:${teacherPersonId}`
          : `ASSIGNMENT:${teacherAssignmentId}`;

        if (!teacherIdentityByKey.has(identityKey)) {
          teacherIdentityByKey.set(identityKey, {
            teacherAssignmentId,
            teacherPersonId,
            teacherName: teacher?.teacherName || "غير محدد",
          });
        }
      }

      if (teacherIdentityByKey.size === 0) {
        teacherIdentityByKey.set("UNRESOLVED", {
          teacherAssignmentId: "",
          teacherPersonId: "",
          teacherName: "غير محدد",
        });
      }

      for (const teacher of teacherIdentityByKey.values()) {
        rows.push({
          key: `${contextKey}|${
            teacher.teacherPersonId || teacher.teacherAssignmentId || "UNRESOLVED"
          }`,
          schoolId: context.classInfo.schoolId ?? "",
          schoolName:
            staffActor?.schools
              ?.find((school) => school.id === context.classInfo.schoolId)
              ?.name?.trim() ||
            context.classInfo.schoolName?.trim() ||
            context.classInfo.schoolId ||
            "مدرسة غير محددة",
          classKey: context.classKey,
          classTitle:
            getFriendlyClassTitle(context.classInfo, currentKgClasses) ||
            context.classInfo.title ||
            context.classInfo.code ||
            "فصل روضة",
          subjectKey: context.subjectKey,
          subjectTitle: getKgSubjectLabel(context.subjectKey),
          ...teacher,
          summary,
          measurementsByRole,
          missingText: getMissingText(summary),
        });
      }
    }

    return {
      rows: rows.sort((left, right) => {
        const schoolCompare = left.schoolName.localeCompare(right.schoolName, "ar");
        if (schoolCompare !== 0) return schoolCompare;
        const classCompare = left.classTitle.localeCompare(right.classTitle, "ar");
        if (classCompare !== 0) return classCompare;
        const subjectCompare = left.subjectTitle.localeCompare(right.subjectTitle, "ar");
        if (subjectCompare !== 0) return subjectCompare;
        return left.teacherName.localeCompare(right.teacherName, "ar");
      }),
      configurationWarnings,
      matchingTemplateCount: Array.from(expectedTemplatesByContext.values()).reduce(
        (count, items) => count + items.length,
        0,
      ),
    };
  }, [
    batches,
    currentKgClasses,
    currentTerm,
    staffActor?.schools,
    teacherDirectoryByAssignmentId,
    templates,
    visibleClassByKey,
  ]);

  const schoolOptions = useMemo(
    () =>
      Array.from(
        new Map(rows.map((row) => [row.schoolId, row.schoolName])).entries(),
      ),
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
  const classOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rowsMatchingSchoolAndTeacher.map((row) => [
            row.classKey,
            row.classTitle,
          ]),
        ).entries(),
      ).sort(
        ([leftKey, leftTitle], [rightKey, rightTitle]) =>
          leftTitle.localeCompare(rightTitle, "ar") ||
          leftKey.localeCompare(rightKey, "ar"),
      ),
    [rowsMatchingSchoolAndTeacher],
  );
  const effectiveClassFilter =
    classFilter !== "ALL" &&
    classOptions.some(([classKey]) => classKey === classFilter)
      ? classFilter
      : "ALL";
  const rowsMatchingSchoolTeacherAndClass = useMemo(
    () =>
      rowsMatchingSchoolAndTeacher.filter(
        (row) =>
          effectiveClassFilter === "ALL" ||
          row.classKey === effectiveClassFilter,
      ),
    [effectiveClassFilter, rowsMatchingSchoolAndTeacher],
  );
  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          rowsMatchingSchoolTeacherAndClass.map((row) => [
            row.subjectKey,
            row.subjectTitle,
          ]),
        ).entries(),
      ),
    [rowsMatchingSchoolTeacherAndClass],
  );
  const effectiveSubjectFilter =
    subjectFilter !== "ALL" &&
    subjectOptions.some(([subjectKey]) => subjectKey === subjectFilter)
      ? subjectFilter
      : "ALL";

  useEffect(() => {
    if (teacherFilter !== effectiveTeacherFilter) {
      setTeacherFilter(effectiveTeacherFilter);
    }
    if (classFilter !== effectiveClassFilter) {
      setClassFilter(effectiveClassFilter);
    }
    if (subjectFilter !== effectiveSubjectFilter) {
      setSubjectFilter(effectiveSubjectFilter);
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
      rowsMatchingSchoolTeacherAndClass.filter(
        (row) =>
          effectiveSubjectFilter === "ALL" ||
          row.subjectKey === effectiveSubjectFilter,
      ),
    [effectiveSubjectFilter, rowsMatchingSchoolTeacherAndClass],
  );
  const completeCount = filteredRows.filter((row) => row.summary.isComplete).length;
  const hasActiveFilters =
    schoolFilter !== "ALL" ||
    teacherFilter !== "ALL" ||
    subjectFilter !== "ALL" ||
    classFilter !== "ALL";

  if (!staffActor) {
    return (
      <main dir="rtl" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
        <section className="mx-auto max-w-7xl rounded-2xl border bg-card p-6 shadow-sm">
          جاري تحميل بيانات المستخدم...
        </section>
      </main>
    );
  }

  if (!currentTerm?.id || !currentTerm.academicYearId) {
    return (
      <PageShell>
        <EmptyState
          title="لم يتم تحديد الفصل الدراسي الحالي"
          description="لا يمكن إعداد خلاصة قياسات الروضة قبل تحديد الفصل الدراسي والسنة الدراسية الحاليين."
        />
      </PageShell>
    );
  }

  if (currentKgClasses.length === 0) {
    return (
      <PageShell>
        <EmptyState
          title="لا توجد فصول روضة مرئية"
          description="لا توجد فصول KG1 أو KG2 أو KG3 ضمن نطاقك الحالي."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/staff/measurements"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowRight className="size-4" />
          العودة إلى القياسات والمتابعات
        </Link>

        <button
          type="button"
          onClick={() => void loadSummary()}
          disabled={status === "loading"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="size-4" />
          {status === "loading" ? "جارٍ التحديث..." : "تحديث"}
        </button>
      </div>

      <header className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <TableProperties className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              خلاصة قياسات الروضة
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              خلاصة موزونة للمعلمات والصفوف في بساتين المعرفة والقرآن الكريم ونعد ونحسب.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-7 text-destructive">
          تعذر تحميل خلاصة قياسات الروضة: {error}
        </section>
      ) : null}

      {configurationWarnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-7 text-amber-800 dark:text-amber-200">
          <p className="font-semibold">
            بعض قوالب القياس المطلوبة غير متاحة لهذا المستوى.
          </p>
          <ul className="mt-2 list-inside list-disc">
            {configurationWarnings.map((warning) => (
              <li key={warning.key}>
                {warning.classTitle} · {warning.subjectTitle}: {warning.missingRoles.map(getKgEvaluatorRoleLabel).join("، ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <FilterSelect
            label="المدرسة"
            value={schoolFilter}
            onChange={setSchoolFilter}
            options={schoolOptions}
          />
          <FilterSelect
            label="المعلم"
            value={teacherFilter}
            onChange={setTeacherFilter}
            options={teacherOptions}
          />
          <FilterSelect
            label="الصف والفصل"
            value={classFilter}
            onChange={setClassFilter}
            options={classOptions}
          />
          <FilterSelect
            label="المادة"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={subjectOptions}
          />
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSchoolFilter("ALL");
                setTeacherFilter("ALL");
                setSubjectFilter("ALL");
                setClassFilter("ALL");
              }}
              className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition hover:bg-muted"
            >
              <RotateCcw className="size-4" />
              مسح الفلاتر
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="عدد الصفوف/المواد" value={filteredRows.length} />
        <SummaryCard label="مكتملة" value={completeCount} />
        <SummaryCard
          label="غير مكتملة"
          value={filteredRows.length - completeCount}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {status === "loading" ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : matchingTemplateCount === 0 ? (
          <div className="p-8 text-center text-sm leading-7 text-muted-foreground">
            لا توجد قوالب قياس روضة مطابقة للسنة والفصل الدراسيين الحاليين.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm leading-7 text-muted-foreground">
            لا توجد دفعات قياس مرسلة ضمن القوالب المطابقة حتى الآن.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm leading-7 text-muted-foreground">
            لا توجد نتائج مطابقة للفلاتر المحددة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-right text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">المادة</th>
                  <th className="px-4 py-3 font-semibold">اسم المعلمة</th>
                  <th className="px-4 py-3 font-semibold">الصف والفصل</th>
                  <th className="px-4 py-3 font-semibold">قياس المعلمة</th>
                  <th className="px-4 py-3 font-semibold">قياس الوكيلة</th>
                  <th className="px-4 py-3 font-semibold">قياس المشرفة</th>
                  <th className="px-4 py-3 font-semibold">النتيجة النهائية</th>
                  <th className="px-4 py-3 font-semibold">النتيجة المؤقتة</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <KgSummaryTableRows key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function KgSummaryTableRows({ row }: { row: KgSummaryRow }) {
  const teacher = getRoleComponent(row.summary, "KG_TEACHER");
  const vp = getRoleComponent(row.summary, "KG_VP");
  const supervisor = getRoleComponent(row.summary, "EDU_SUPERVISOR");
  const requiresSupervisor = row.subjectKey === "LEARNING_GARDENS";

  return (
    <>
      <tr className="border-t align-top">
        <td className="px-4 py-4 font-medium">{row.subjectTitle}</td>
        <td className="px-4 py-4">
          <p className="font-medium">{row.teacherName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.schoolName}</p>
        </td>
        <td className="px-4 py-4 font-medium">{row.classTitle}</td>
        <td className="px-4 py-4">
          <RoleCell component={teacher} />
        </td>
        <td className="px-4 py-4">
          <RoleCell component={vp} />
        </td>
        <td className="px-4 py-4">
          {requiresSupervisor ? (
            <RoleCell component={supervisor} />
          ) : (
            <span className="text-muted-foreground">غير مطلوب</span>
          )}
        </td>
        <td className="px-4 py-4 font-semibold">
          {row.summary.finalPercentage === null
            ? "غير مكتملة"
            : formatPercentage(row.summary.finalPercentage)}
        </td>
        <td className="px-4 py-4">
          {row.summary.finalPercentage === null
            ? formatPercentage(row.summary.provisionalPercentage)
            : "—"}
        </td>
        <td className="px-4 py-4">
          <span
            className={
              row.summary.isComplete
                ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                : "rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
            }
          >
            {row.summary.isComplete ? "مكتملة" : "غير مكتملة"}
          </span>
          {!row.summary.isComplete && row.missingText.length > 0 ? (
            <p className="mt-2 max-w-52 text-xs leading-5 text-muted-foreground">
              المتبقي: {row.missingText.join("، ")}
            </p>
          ) : null}
        </td>
      </tr>
      <tr className="border-t bg-muted/20">
        <td colSpan={9} className="px-4 py-3">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-primary">
              تفاصيل القياسات
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <MeasurementTrace
                label="قياسات المعلمة"
                measurements={row.measurementsByRole.KG_TEACHER ?? []}
              />
              <MeasurementTrace
                label="قياس الوكيلة"
                measurements={row.measurementsByRole.KG_VP ?? []}
              />
              {requiresSupervisor ? (
                <MeasurementTrace
                  label="قياس المشرفة"
                  measurements={row.measurementsByRole.EDU_SUPERVISOR ?? []}
                />
              ) : (
                <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                  قياس المشرفة: غير مطلوب
                </div>
              )}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}

function RoleCell({ component }: { component: KgRoleComponent | null }) {
  if (!component || component.expectedMeasurementCount === 0) {
    return <span className="text-amber-700 dark:text-amber-300">القالب غير متاح</span>;
  }

  if (component.currentPercentage === null) {
    return (
      <div>
        <p className="font-medium">لم يُرصد</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {component.completedMeasurementCount.toLocaleString("ar-SA")} / {component.expectedMeasurementCount.toLocaleString("ar-SA")} قياسات
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-medium">{formatPercentage(component.currentPercentage)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {component.completedMeasurementCount.toLocaleString("ar-SA")} / {component.expectedMeasurementCount.toLocaleString("ar-SA")} قياسات
      </p>
      {!component.isComplete ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          غير مكتملة
        </p>
      ) : null}
    </div>
  );
}

function MeasurementTrace({
  label,
  measurements,
}: {
  label: string;
  measurements: TemplateClassMeasurement[];
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="font-medium">{label}</p>
      {measurements.length === 0 ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          القالب غير متاح
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {measurements.map((measurement) => (
            <li key={measurement.templateId}>
              {measurement.templateTitle}: {formatPercentage(measurement.percentage)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium lg:min-w-48">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="ALL">الكل</option>
        {options.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">
        {value.toLocaleString("ar-SA")}
      </p>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">{children}</section>
    </main>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
      <AlertTriangle className="mx-auto size-6 text-amber-700 dark:text-amber-300" />
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
        {description}
      </p>
    </section>
  );
}
