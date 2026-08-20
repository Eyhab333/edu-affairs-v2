import {
  BookOpen,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  MessageSquareText,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";

import type { ClassSubjectOffering } from "@takween/contracts";

import type {
  OperationCard,
  StaffActorLike,
  StaffVisibleClass,
} from "./class-page-types";

export function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function getStudentCount(item: StaffVisibleClass) {
  return (
    item.studentCount ?? item.studentsCount ?? item.enrolledStudentCount ?? null
  );
}

export function matchesRequestedClass(
  item: StaffVisibleClass,
  classId: string,
  schoolId: string | null,
  academicYearId: string | null,
) {
  if (item.id !== classId) return false;

  if (schoolId && item.schoolId !== schoolId) return false;
  if (academicYearId && item.academicYearId !== academicYearId) return false;

  return true;
}

export function matchesClassSubjectOfferingContext(
  offering: ClassSubjectOffering,
  classInfo: StaffVisibleClass,
) {
  if (offering.classId !== classInfo.id) return false;

  if (classInfo.schoolId && offering.schoolId !== classInfo.schoolId) {
    return false;
  }

  if (
    classInfo.academicYearId &&
    offering.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  if (
    classInfo.gradeId &&
    offering.gradeId &&
    offering.gradeId !== classInfo.gradeId
  ) {
    return false;
  }

  return true;
}

export function buildClassesHref() {
  return "/staff/classes";
}

export function buildClassContextParams(item: StaffVisibleClass) {
  const params = new URLSearchParams();

  if (item.id) params.set("classId", item.id);
  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  return params;
}

export function buildClassDomainsAnchorHref() {
  return "#class-domains";
}

export function buildNewMeasurementBatchHref(
  item: StaffVisibleClass,
  subjectContext?: {
    classSubjectOfferingId?: string;
    subjectKey?: string;
    teacherAssignmentId?: string;
  },
) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  if (subjectContext?.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  }

  if (subjectContext?.subjectKey) {
    params.set("subjectKey", subjectContext.subjectKey);
  }

  if (subjectContext?.teacherAssignmentId) {
    params.set("teacherAssignmentId", subjectContext.teacherAssignmentId);
  }

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(item.id)}/measurements/batches/new${
    query ? `?${query}` : ""
  }`;
}

export function buildLearningLossHref(
  item: StaffVisibleClass,
  subjectContext?: {
    classSubjectOfferingId?: string;
    subjectKey?: string;
  },
) {
  const params = buildClassContextParams(item);

  if (subjectContext?.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  }

  if (subjectContext?.subjectKey) {
    params.set("subjectKey", subjectContext.subjectKey);
  }

  const query = params.toString();

  return `/staff/learning-loss${query ? `?${query}` : ""}`;
}

export function buildManualLearningLossHref(
  item: StaffVisibleClass,
  subjectContext?: {
    classSubjectOfferingId?: string;
    subjectKey?: string;
  },
) {
  const params = buildClassContextParams(item);

  if (subjectContext?.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", subjectContext.classSubjectOfferingId);
  }

  if (subjectContext?.subjectKey) {
    params.set("subjectKey", subjectContext.subjectKey);
  }

  const query = params.toString();

  return `/staff/learning-loss/manual${query ? `?${query}` : ""}`;
}

export function normalizeSubjectKey(value?: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeStageKey(value?: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function isPrimaryClass(classInfo: StaffVisibleClass) {
  const schoolType = normalizeStageKey(classInfo.schoolType);
  const gradeId = normalizeStageKey(classInfo.gradeId);

  return schoolType === "PRIMARY" || /^G[1-6]$/.test(gradeId);
}

export function isKgClass(classInfo: StaffVisibleClass) {
  const schoolType = normalizeStageKey(classInfo.schoolType);
  const gradeId = normalizeStageKey(classInfo.gradeId);

  return schoolType === "KG" || gradeId.startsWith("KG");
}

export function getCurrentTermForClass(
  actor: StaffActorLike | null,
  classInfo: StaffVisibleClass | null,
) {
  const academicYearId = classInfo?.academicYearId || "";

  if (!actor || !academicYearId) return null;

  return (
    actor.currentTermsByAcademicYear?.[academicYearId] ??
    actor.currentTerm ??
    null
  );
}

export function buildOperationCards(
  classInfo: StaffVisibleClass,
): OperationCard[] {
  return [
    {
      title: "طلاب الفصل",
      description:
        "قائمة الطلاب النشطين داخل الفصل، وهي نقطة الانطلاق لأي تشغيل على الطالب.",
      status: "ACTIVE",
      icon: UsersRound,
      href: "#class-students",
      actionLabel: "عرض الطلاب",
    },
    {
      title: "القياسات والمتابعات",
      description:
        "ابدأ القياس أو المتابعة من المادة أو المجال المناسب داخل الفصل.",
      status: "ACTIVE",
      icon: BookOpen,
      href: buildClassDomainsAnchorHref(),
      actionLabel: "اختيار مادة",
    },
    {
      title: "الفاقد التعليمي",
      description:
        "متابعة خطط الفاقد المفتوحة، وفتح خطة تلقائية أو يدوية، وتسجيل القياس الأول والثاني.",
      status: "ACTIVE",
      icon: Target,
      href: buildLearningLossHref(classInfo),
      actionLabel: "إدارة الفاقد",
    },
    {
      title: "فتح فاقد يدوي",
      description:
        "فتح خطة فاقد لطالب من هذا السياق عند الحاجة، حتى لو لم ينتج الفاقد من قياس تلقائي.",
      status: "ACTIVE",
      icon: HeartHandshake,
      href: buildManualLearningLossHref(classInfo),
      actionLabel: "فتح يدوي",
    },
    {
      title: "حضور اليوم",
      description:
        "سيكون مدخل تسجيل حضور الفصل اليومي في Milestone 9، مع دفعة حضور وسجلات فردية.",
      status: "READY_SOON",
      icon: ClipboardCheck,
    },
    {
      title: "الملاحظات",
      description:
        "إضافة ملاحظات تشغيلية على طالب أو مجموعة طلاب من سياق الفصل في مرحلة لاحقة.",
      status: "FUTURE",
      icon: MessageSquareText,
    },
    {
      title: "القضايا والإحالات",
      description:
        "إحالة طالب أو متابعة قضية من سياق الفصل حسب الصلاحية ومسار الإحالة.",
      status: "FUTURE",
      icon: FileText,
    },
    {
      title: "التحفيز",
      description: "تحفيز طالب أو مجموعة طلاب وربط النقاط أو الشارات لاحقًا.",
      status: "FUTURE",
      icon: Sparkles,
    },
  ];
}
