"use client";

import { useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";

export type MeasurementSchoolType = "KG" | "PRIMARY";

export type StaffMeasurementClassInfo = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
  streamId?: string;
  schoolType?: MeasurementSchoolType;
};

export type StaffTemplateItem = {
  itemKey: string;
  itemId?: string;
  itemTitle: string;

  category?: string;
  valueType?: "NUMERIC" | "LEVEL" | "BOOLEAN" | "TEXT" | "RUBRIC";

  maxScore?: number;
  weight?: number;

  affectsTotal?: boolean;
  required?: boolean;

  description?: string;
  helpText?: string;

  order?: number;
};

export type StaffAssessmentTemplateRow = {
  id: string;
  orgId: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  schoolType: MeasurementSchoolType;
  title: string;
  kind: string;
  assessmentSlot?: string;
  evaluatorRoleKey?: string;
  code?: string;
  description?: string;
  subjectKey?: string;
  order?: number;
  maxScore?: number;
  scoreType?: string;
  passingScore?: number;
  templateItems?: StaffTemplateItem[];
  applicableGradeIds?: string[];
  applicableGradeCodes?: string[];
  applicableClassIds?: string[];
  applicableStreamIds?: string[];
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
  isActive?: boolean;
};

export type StaffTrackerTemplateRow = {
  id: string;
  orgId: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  schoolType: MeasurementSchoolType;
  title: string;
  kind: string;
  evaluatorRoleKey?: string;
  code?: string;
  description?: string;
  subjectKey?: string;
  scoreType?: string;
  maxScore?: number;
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
  defaultLessonTitle?: string;
  isContinuous?: boolean;

  templateItems?: StaffTemplateItem[];

  applicableGradeIds?: string[];
  applicableGradeCodes?: string[];
  applicableClassIds?: string[];
  applicableStreamIds?: string[];

  isActive?: boolean;
  order?: number;
};

export type StaffMeasurementTemplateKind = "ASSESSMENT" | "TRACKER";

export type StaffMeasurementTemplateOption = {
  id: string;
  optionId: string;
  templateKind: StaffMeasurementTemplateKind;

  title: string;
  description: string;
  code: string;
  kind: string;
  schoolType: MeasurementSchoolType;
  schoolId: string;
  subjectKey: string;
  order: number;

  maxScore: number | null;
  scoreType: string;
  templateItems: StaffTemplateItem[];
  evaluatorRoleKey: string;

  assessmentSlot: string;
  passingScore: number | null;
  requiresLearningLossFollowUp: boolean;
  learningLossThresholdScore: number | null;
  learningLossThresholdPercentage: number | null;

  isContinuous: boolean | null;
  defaultLessonTitle: string;

  rawAssessmentTemplate?: StaffAssessmentTemplateRow;
  rawTrackerTemplate?: StaffTrackerTemplateRow;
};

export type ClassMeasurementTemplatesData = {
  orgId: string;
  classId: string;
  schoolId: string;
  schoolType: MeasurementSchoolType | "";
  gradeId: string;
  streamId: string;

  assessmentTemplates: StaffAssessmentTemplateRow[];
  trackerTemplates: StaffTrackerTemplateRow[];
  options: StaffMeasurementTemplateOption[];

  totalCount: number;
  assessmentCount: number;
  trackerCount: number;
};

type UseClassMeasurementTemplatesOptions = {
  orgId: string;
  classInfo: StaffMeasurementClassInfo | null;
  enabled?: boolean;
};

/**
 * مؤقتًا: لو classInfo لا يحمل schoolType سنستنتجها من schoolId.
 * الأفضل لاحقًا أن نضيف schoolType داخل actor.visibleClasses من staff-actor.
 */
function inferSchoolType(
  classInfo: StaffMeasurementClassInfo,
): MeasurementSchoolType | "" {
  if (classInfo.schoolType) return classInfo.schoolType;

  const schoolId = classInfo.schoolId ?? "";

  if (schoolId.startsWith("kg-")) return "KG";
  if (schoolId.startsWith("mrb-")) return "PRIMARY";

  return "";
}

function includesIfConfigured(list: string[] | undefined, value: string) {
  if (!list || list.length === 0) return true;
  if (!value) return false;
  return list.includes(value);
}

function schoolMatches(
  templateSchoolId: string | undefined,
  classSchoolId: string,
) {
  const value = templateSchoolId ?? "";

  /**
   * schoolId فارغ في seed يعني القالب عام لكل مدارس نفس النوع.
   */
  if (!value) return true;

  return value === classSchoolId;
}

function academicYearMatches(
  templateAcademicYearId: string | undefined,
  classAcademicYearId: string | undefined,
) {
  const value = templateAcademicYearId ?? "";

  // An empty value denotes a legacy/generic template for every academic year.
  if (!value) return true;

  return value === (classAcademicYearId ?? "");
}

function gradeMatches(params: {
  templateGradeId?: string;
  applicableGradeIds?: string[];
  classGradeId: string;
}) {
  const templateGradeId = params.templateGradeId ?? "";
  const classGradeId = params.classGradeId ?? "";

  /**
   * لو القالب يحمل gradeId مباشر، فهو مصدر الحقيقة.
   * مثال:
   * kg2-quran-class-teacher-assessment-1 => gradeId: kg2
   */
  if (templateGradeId) {
    return templateGradeId === classGradeId;
  }

  /**
   * لو القالب قديم أو عام ولا يحمل gradeId، نرجع لمنطق applicableGradeIds.
   */
  return includesIfConfigured(params.applicableGradeIds, classGradeId);
}

function assessmentTemplateMatchesClass(params: {
  template: StaffAssessmentTemplateRow;
  classInfo: StaffMeasurementClassInfo;
  schoolType: MeasurementSchoolType | "";
}) {
  const { template, classInfo, schoolType } = params;

  if (template.isActive === false) return false;
  if (schoolType && template.schoolType !== schoolType) return false;

  if (!schoolMatches(template.schoolId, classInfo.schoolId ?? "")) {
    return false;
  }

  if (!academicYearMatches(template.academicYearId, classInfo.academicYearId)) {
    return false;
  }

  if (
    !includesIfConfigured(template.applicableGradeIds, classInfo.gradeId ?? "")
  ) {
    return false;
  }

  if (
    !includesIfConfigured(
      template.applicableGradeCodes,
      classInfo.gradeTitle ?? "",
    )
  ) {
    return false;
  }

  if (!includesIfConfigured(template.applicableClassIds, classInfo.id)) {
    return false;
  }

  if (
    !gradeMatches({
      templateGradeId: template.gradeId,
      applicableGradeIds: template.applicableGradeIds,
      classGradeId: classInfo.gradeId ?? "",
    })
  ) {
    return false;
  }

  return true;
}

function trackerTemplateMatchesClass(params: {
  template: StaffTrackerTemplateRow;
  classInfo: StaffMeasurementClassInfo;
  schoolType: MeasurementSchoolType | "";
}) {
  const { template, classInfo, schoolType } = params;

  if (template.isActive === false) return false;
  if (schoolType && template.schoolType !== schoolType) return false;

  if (!schoolMatches(template.schoolId, classInfo.schoolId ?? "")) {
    return false;
  }

  if (!academicYearMatches(template.academicYearId, classInfo.academicYearId)) {
    return false;
  }

  if (
    !gradeMatches({
      templateGradeId: template.gradeId,
      applicableGradeIds: template.applicableGradeIds,
      classGradeId: classInfo.gradeId ?? "",
    })
  ) {
    return false;
  }

  if (
    !includesIfConfigured(
      template.applicableGradeCodes,
      classInfo.gradeTitle ?? "",
    )
  ) {
    return false;
  }

  if (!includesIfConfigured(template.applicableClassIds, classInfo.id)) {
    return false;
  }

  if (
    !includesIfConfigured(
      template.applicableStreamIds,
      classInfo.streamId ?? "",
    )
  ) {
    return false;
  }

  return true;
}

function getTemplateItemsMaxScore(items: StaffTemplateItem[] | undefined) {
  const list = items ?? [];

  if (list.length === 0) return null;

  const total = list.reduce((sum, item) => {
    if (item.affectsTotal === false) return sum;
    return sum + (typeof item.maxScore === "number" ? item.maxScore : 0);
  }, 0);

  return total > 0 ? total : null;
}

function getTemplateItems(item: { templateItems?: StaffTemplateItem[] }) {
  return [...(item.templateItems ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
}

function toAssessmentOption(
  item: StaffAssessmentTemplateRow,
): StaffMeasurementTemplateOption {
  const templateItems = getTemplateItems(item);
  const itemsMaxScore = getTemplateItemsMaxScore(templateItems);

  return {
    id: item.id,
    optionId: `ASSESSMENT:${item.id}`,
    templateKind: "ASSESSMENT",

    title: item.title,
    description: item.description ?? "",
    code: item.code ?? "",
    kind: item.kind,
    schoolType: item.schoolType,
    schoolId: item.schoolId ?? "",
    subjectKey: item.subjectKey ?? "",
    order: item.order ?? 0,

    maxScore: typeof item.maxScore === "number" ? item.maxScore : itemsMaxScore,
    scoreType: item.scoreType ?? "NUMERIC",
    evaluatorRoleKey: item.evaluatorRoleKey ?? "",

    templateItems,

    assessmentSlot: item.assessmentSlot ?? "CUSTOM",
    passingScore:
      typeof item.passingScore === "number" ? item.passingScore : null,
    requiresLearningLossFollowUp: item.requiresLearningLossFollowUp === true,
    learningLossThresholdScore:
      typeof item.learningLossThresholdScore === "number"
        ? item.learningLossThresholdScore
        : null,
    learningLossThresholdPercentage:
      typeof item.learningLossThresholdPercentage === "number"
        ? item.learningLossThresholdPercentage
        : null,

    isContinuous: null,
    defaultLessonTitle: "",

    rawAssessmentTemplate: item,
  };
}

function toTrackerOption(
  item: StaffTrackerTemplateRow,
): StaffMeasurementTemplateOption {
  const templateItems = getTemplateItems(item);
  const itemsMaxScore = getTemplateItemsMaxScore(templateItems);

  return {
    id: item.id,
    optionId: `TRACKER:${item.id}`,
    templateKind: "TRACKER",

    title: item.title,
    description: item.description ?? "",
    code: item.code ?? "",
    kind: item.kind,
    schoolType: item.schoolType,
    schoolId: item.schoolId ?? "",
    subjectKey: item.subjectKey ?? "",
    order: item.order ?? 0,

    maxScore: typeof item.maxScore === "number" ? item.maxScore : itemsMaxScore,
    scoreType: item.scoreType ?? "NUMERIC",
    evaluatorRoleKey: item.evaluatorRoleKey ?? "",

    templateItems,

    assessmentSlot: "",
    passingScore: null,
    requiresLearningLossFollowUp: item.requiresLearningLossFollowUp === true,
    learningLossThresholdScore:
      typeof item.learningLossThresholdScore === "number"
        ? item.learningLossThresholdScore
        : null,
    learningLossThresholdPercentage:
      typeof item.learningLossThresholdPercentage === "number"
        ? item.learningLossThresholdPercentage
        : null,

    isContinuous: item.isContinuous ?? true,
    defaultLessonTitle: item.defaultLessonTitle ?? "",

    rawTrackerTemplate: item,
  };
}

function sortOptions(
  a: StaffMeasurementTemplateOption,
  b: StaffMeasurementTemplateOption,
) {
  const kindCompare = a.templateKind.localeCompare(b.templateKind, "ar");

  if (kindCompare !== 0) return kindCompare;

  if (a.order !== b.order) return a.order - b.order;

  return a.title.localeCompare(b.title, "ar");
}

export function useClassMeasurementTemplates({
  orgId,
  classInfo,
  enabled = true,
}: UseClassMeasurementTemplatesOptions) {
  const classSignature = [
    classInfo?.id ?? "",
    classInfo?.schoolId ?? "",
    classInfo?.academicYearId ?? "",
    classInfo?.gradeId ?? "",
    classInfo?.gradeTitle ?? "",
    classInfo?.streamId ?? "",
    classInfo?.schoolType ?? "",
  ].join("|");

  const canLoad = enabled && !!orgId && !!classInfo;

  const loadTemplates =
    useCallback(async (): Promise<ClassMeasurementTemplatesData | null> => {
      if (!canLoad || !classInfo) return null;

      const schoolType = inferSchoolType(classInfo);

      const assessmentTemplatesRef = collection(
        db,
        "orgs",
        orgId,
        "studentAssessmentTemplates",
      );

      const trackerTemplatesRef = collection(
        db,
        "orgs",
        orgId,
        "studentTrackerTemplates",
      );

      const [assessmentSnap, trackerSnap] = await Promise.all([
        getDocs(query(assessmentTemplatesRef, where("isActive", "==", true))),
        getDocs(query(trackerTemplatesRef, where("isActive", "==", true))),
      ]);

      const assessmentTemplates = assessmentSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<StaffAssessmentTemplateRow, "id">),
        }))
        .filter((item) =>
          assessmentTemplateMatchesClass({
            template: item,
            classInfo,
            schoolType,
          }),
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const trackerTemplates = trackerSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<StaffTrackerTemplateRow, "id">),
        }))
        .filter((item) =>
          trackerTemplateMatchesClass({
            template: item,
            classInfo,
            schoolType,
          }),
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const options = [
        ...assessmentTemplates.map(toAssessmentOption),
        ...trackerTemplates.map(toTrackerOption),
      ].sort(sortOptions);

      return {
        orgId,
        classId: classInfo.id,
        schoolId: classInfo.schoolId ?? "",
        schoolType,
        gradeId: classInfo.gradeId ?? "",
        streamId: classInfo.streamId ?? "",

        assessmentTemplates,
        trackerTemplates,
        options,

        totalCount: options.length,
        assessmentCount: assessmentTemplates.length,
        trackerCount: trackerTemplates.length,
      };
    }, [canLoad, orgId, classInfo]);

  return useDocumentLoader<ClassMeasurementTemplatesData>({
    enabled: canLoad,
    loader: loadTemplates,
    deps: [orgId, classSignature],
  });
}
