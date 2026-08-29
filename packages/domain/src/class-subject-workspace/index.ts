import type {
  ClassSubjectModuleKey,
  ClassSubjectOffering,
  MembershipRole,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";

export type ClassSubjectWorkspaceOperationKey =
  | "STUDENT_MEASUREMENTS"
  | "LEARNING_LOSS"
  | "HOMEWORK"
  | "LESSON_PREP"
  | "QUESTION_BANK"
  | "CURRICULUM_PLAN"
  | "RESOURCES"
  | "GAMIFICATION"
  | "VIRTUAL_CLASSES"
  | "NOTES"
  | "CUSTOM";

export type ClassSubjectWorkspaceOperation = {
  moduleKey: ClassSubjectModuleKey;
  operationKey: ClassSubjectWorkspaceOperationKey;
  title: string;
  description?: string;
  isPrimary: boolean;
};

export type ClassSubjectWorkspace = {
  offeringId: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;

  classId: string;
  gradeId: string;
  streamId: string;

  subjectId: string;
  subjectKey: string;
  subjectTitle: string;
  displayName: string;
  shortLabel: string;

  status: ClassSubjectOffering["status"];
  order: number;

  teacherAssignmentIds: string[];
  teacherPersonIds: string[];

  enabledModuleKeys: ClassSubjectModuleKey[];
  availableOperations: ClassSubjectWorkspaceOperation[];

  canManageOffering: boolean;
  canRunSubjectOperations: boolean;
};

export type BuildClassSubjectWorkspacesParams = {
  actorPersonId: string;
  actorRoleKeys?: MembershipRole[];

  /**
   * Allows roles with subject-management authority to receive an offering
   * without a personal teacher assignment. Teacher-facing workspaces disable
   * this so their offerings always come from assignment coverage.
   */
  allowAdminOverride?: boolean;

  classId: string;

  classSubjectOfferings: ClassSubjectOffering[];
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentClassLinks?: TeacherAssignmentClassLink[];

  /**
   * المدير/الوكيل/الأدمن قد يرى المواد غير النشطة عند الحاجة.
   * الافتراضي false حتى تكون واجهة staff تشغيلية فقط.
   */
  includeInactiveOfferingsForAdmins?: boolean;

  nowMs?: number;
};

const DEFAULT_ADMIN_ROLE_KEYS: MembershipRole[] = [
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
  "school_admin",
  "school_manager",

  "BOYS_PRINCIPAL",
  "BOYS_PRINCIPAL",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "KG_PRINCIPAL",
  "KG_VP",
];

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasAdminAccess(roleKeys: MembershipRole[] | undefined): boolean {
  if (!roleKeys?.length) return false;
  return roleKeys.some((roleKey) => DEFAULT_ADMIN_ROLE_KEYS.includes(roleKey));
}

function isOfferingActiveForStaff(
  offering: ClassSubjectOffering,
  nowMs: number,
): boolean {
  if (offering.isArchived) return false;
  if (offering.status !== "ACTIVE") return false;

  if (typeof offering.startAt === "number" && offering.startAt > nowMs) {
    return false;
  }

  if (typeof offering.endAt === "number" && offering.endAt < nowMs) {
    return false;
  }

  return true;
}

function isTeacherAssignmentActive(
  assignment: TeacherAssignment,
  nowMs: number,
): boolean {
  if (assignment.status !== "ACTIVE") return false;

  if (typeof assignment.startAt === "number" && assignment.startAt > nowMs) {
    return false;
  }

  if (typeof assignment.endAt === "number" && assignment.endAt < nowMs) {
    return false;
  }

  return true;
}

function assignmentMatchesSubjectOffering(params: {
  assignment: TeacherAssignment;
  offering: ClassSubjectOffering;
}): boolean {
  const { assignment, offering } = params;

  /**
   * الربط الأقوى إن وجد.
   */
  if (
    assignment.classSubjectOfferingId &&
    assignment.classSubjectOfferingId === offering.id
  ) {
    return true;
  }

  /**
   * ربط المادة بالـ subjectId إن كان الطرفان يملكانه.
   */
  if (
    assignment.subjectId &&
    offering.subjectId &&
    assignment.subjectId === offering.subjectId
  ) {
    return true;
  }

  /**
   * fallback مهم للتوافق مع البيانات الحالية والـ seed.
   */
  if (
    assignment.subjectKey &&
    offering.subjectKey &&
    assignment.subjectKey === offering.subjectKey
  ) {
    return true;
  }

  return false;
}

function assignmentCoversClass(params: {
  assignment: TeacherAssignment;
  offering: ClassSubjectOffering;
  classLinks: TeacherAssignmentClassLink[];
}): boolean {
  const { assignment, offering, classLinks } = params;

  /**
   * إسناد مباشر على الفصل.
   */
  if (
    assignment.targetScopeType === "CLASS" &&
    assignment.targetScopeId === offering.classId
  ) {
    return true;
  }

  /**
   * روابط صريحة بين الإسناد والفصول.
   */
  const linkedToClass = classLinks.some((link) => {
    if (link.assignmentId !== assignment.id) return false;
    if (link.classId !== offering.classId) return false;

    if (
      link.classSubjectOfferingId &&
      link.classSubjectOfferingId !== offering.id
    ) {
      return false;
    }

    return true;
  });

  if (linkedToClass) return true;

  /**
   * تغطية كل فصول مدرسة.
   * مثال: معلمة قيم تغطي كل فصول الروضة.
   */
  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "SCHOOL" &&
    assignment.targetScopeId === offering.schoolId
  ) {
    return true;
  }

  /**
   * تغطية صف كامل.
   */
  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "GRADE" &&
    (assignment.targetScopeId === offering.gradeId ||
      assignment.gradeId === offering.gradeId)
  ) {
    return true;
  }

  /**
   * تغطية مسار كامل.
   */
  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "STREAM" &&
    (assignment.targetScopeId === offering.streamId ||
      assignment.streamId === offering.streamId)
  ) {
    return true;
  }

  return false;
}

function getMatchingTeacherAssignmentsForOffering(params: {
  actorPersonId: string;
  offering: ClassSubjectOffering;
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentClassLinks: TeacherAssignmentClassLink[];
  nowMs: number;
}): TeacherAssignment[] {
  return params.teacherAssignments.filter((assignment) => {
    if (assignment.teacherPersonId !== params.actorPersonId) return false;
    if (!isTeacherAssignmentActive(assignment, params.nowMs)) return false;

    const coversClass = assignmentCoversClass({
      assignment,
      offering: params.offering,
      classLinks: params.teacherAssignmentClassLinks,
    });

    if (!coversClass) return false;

    return assignmentMatchesSubjectOffering({
      assignment,
      offering: params.offering,
    });
  });
}

function normalizeSubjectKey(value?: string): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isHomeroomOffering(offering: ClassSubjectOffering): boolean {
  const subjectKey = normalizeSubjectKey(
    offering.subjectKey || offering.subjectId,
  );

  return subjectKey === "CLASS" || subjectKey === "HOMEROOM";
}

function getDefaultAdminModuleKeysForOffering(
  offering: ClassSubjectOffering,
): ClassSubjectModuleKey[] {
  if (isHomeroomOffering(offering)) {
    return [];
  }

  return ["ASSESSMENTS", "LEARNING_LOSS"];
}

export function resolveClassSubjectAvailableOperations(
  offering: ClassSubjectOffering,
  options?: {
    useDefaultAdminOperations?: boolean;
  },
): ClassSubjectWorkspaceOperation[] {
  const explicitModuleKeys = offering.enabledModuleKeys ?? [];

  const moduleKeys =
    explicitModuleKeys.length > 0
      ? explicitModuleKeys
      : options?.useDefaultAdminOperations
        ? getDefaultAdminModuleKeysForOffering(offering)
        : [];

  return moduleKeys.map((moduleKey) => {
    switch (moduleKey) {
      case "ASSESSMENTS":
        return {
          moduleKey,
          operationKey: "STUDENT_MEASUREMENTS",
          title: "القياسات والمتابعات",
          description: "إدخال أو مراجعة قياسات ومتابعات هذه المادة.",
          isPrimary: true,
        };

      case "LEARNING_LOSS":
        return {
          moduleKey,
          operationKey: "LEARNING_LOSS",
          title: "الفاقد التعليمي",
          description: "متابعة خطط الفاقد المرتبطة بهذه المادة.",
          isPrimary: true,
        };

      case "HOMEWORK":
        return {
          moduleKey,
          operationKey: "HOMEWORK",
          title: "الواجبات",
          description: "إدارة واجبات هذه المادة.",
          isPrimary: false,
        };

      case "LESSON_PREP":
        return {
          moduleKey,
          operationKey: "LESSON_PREP",
          title: "التحضير",
          description: "تحضير دروس هذه المادة.",
          isPrimary: false,
        };

      case "QUESTION_BANK":
        return {
          moduleKey,
          operationKey: "QUESTION_BANK",
          title: "بنك الأسئلة",
          description: "إدارة أسئلة هذه المادة.",
          isPrimary: false,
        };

      case "CURRICULUM_PLAN":
        return {
          moduleKey,
          operationKey: "CURRICULUM_PLAN",
          title: "توزيع المنهج",
          description: "عرض أو إدارة توزيع منهج هذه المادة.",
          isPrimary: false,
        };

      case "RESOURCES":
        return {
          moduleKey,
          operationKey: "RESOURCES",
          title: "المذكرات والملفات",
          description: "ملفات PDF وموارد إثرائية لهذه المادة.",
          isPrimary: false,
        };

      case "GAMIFICATION":
        return {
          moduleKey,
          operationKey: "GAMIFICATION",
          title: "التحفيز",
          description: "تحفيز الطلاب في سياق هذه المادة.",
          isPrimary: false,
        };

      case "VIRTUAL_CLASSES":
        return {
          moduleKey,
          operationKey: "VIRTUAL_CLASSES",
          title: "الحصص الافتراضية",
          description: "جدولة ومتابعة حصص Google Meet لهذه المادة.",
          isPrimary: false,
        };

      case "NOTES":
        return {
          moduleKey,
          operationKey: "NOTES",
          title: "الملاحظات",
          description: "ملاحظات مرتبطة بهذه المادة.",
          isPrimary: false,
        };

      case "CUSTOM":
      default:
        return {
          moduleKey,
          operationKey: "CUSTOM",
          title: "تشغيل مخصص",
          description: "عملية مخصصة مرتبطة بهذه المادة.",
          isPrimary: false,
        };
    }
  });
}

export function buildClassSubjectWorkspace(params: {
  offering: ClassSubjectOffering;
  matchingTeacherAssignments: TeacherAssignment[];
  canManageOffering: boolean;
}): ClassSubjectWorkspace {
  const teacherAssignmentIds = uniqueStrings(
    params.matchingTeacherAssignments.map((assignment) => assignment.id),
  );

  const teacherPersonIds = uniqueStrings(
    params.matchingTeacherAssignments.map(
      (assignment) => assignment.teacherPersonId,
    ),
  );

  const subjectTitle =
    params.offering.displayName ||
    params.offering.subjectTitleSnapshot ||
    params.offering.subjectKey ||
    params.offering.subjectId ||
    "مادة غير مسماة";

  return {
    offeringId: params.offering.id,

    orgId: params.offering.orgId,
    schoolId: params.offering.schoolId,
    academicYearId: params.offering.academicYearId,

    classId: params.offering.classId,
    gradeId: params.offering.gradeId,
    streamId: params.offering.streamId,

    subjectId: params.offering.subjectId,
    subjectKey: params.offering.subjectKey,
    subjectTitle,
    displayName: params.offering.displayName || subjectTitle,
    shortLabel: params.offering.shortLabel,

    status: params.offering.status,
    order: params.offering.order,

    teacherAssignmentIds,
    teacherPersonIds,

    enabledModuleKeys: params.offering.enabledModuleKeys?.length
      ? params.offering.enabledModuleKeys
      : params.canManageOffering
        ? getDefaultAdminModuleKeysForOffering(params.offering)
        : [],

    availableOperations: resolveClassSubjectAvailableOperations(
      params.offering,
      {
        useDefaultAdminOperations: params.canManageOffering,
      },
    ),

    canManageOffering: params.canManageOffering,
    canRunSubjectOperations:
      params.canManageOffering || teacherAssignmentIds.length > 0,
  };
}

export function buildClassSubjectWorkspaces(
  params: BuildClassSubjectWorkspacesParams,
): ClassSubjectWorkspace[] {
  const nowMs = params.nowMs ?? Date.now();
  const canManageOffering = hasAdminAccess(params.actorRoleKeys);
  const canUseAdminOverride =
    canManageOffering && params.allowAdminOverride !== false;

  const classLinks = params.teacherAssignmentClassLinks ?? [];

  return params.classSubjectOfferings
    .filter((offering) => offering.classId === params.classId)
    .filter((offering) => {
      if (canUseAdminOverride && params.includeInactiveOfferingsForAdmins) {
        return offering.isArchived !== true;
      }

      return isOfferingActiveForStaff(offering, nowMs);
    })
    .map((offering) => {
      const matchingTeacherAssignments =
        getMatchingTeacherAssignmentsForOffering({
          actorPersonId: params.actorPersonId,
          offering,
          teacherAssignments: params.teacherAssignments,
          teacherAssignmentClassLinks: classLinks,
          nowMs,
        });

      if (!canUseAdminOverride && matchingTeacherAssignments.length === 0) {
        return null;
      }

      return buildClassSubjectWorkspace({
        offering,
        matchingTeacherAssignments,
        canManageOffering,
      });
    })
    .filter(
      (workspace): workspace is ClassSubjectWorkspace => workspace !== null,
    )
    .sort((a, b) => {
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;

      return a.subjectTitle.localeCompare(b.subjectTitle, "ar");
    });
}

export function getVisibleClassSubjectOfferingsForActor(
  params: BuildClassSubjectWorkspacesParams,
): ClassSubjectOffering[] {
  const workspaceIds = new Set(
    buildClassSubjectWorkspaces(params).map(
      (workspace) => workspace.offeringId,
    ),
  );

  return params.classSubjectOfferings.filter((offering) =>
    workspaceIds.has(offering.id),
  );
}

export function canUseClassSubjectOffering(params: {
  actorPersonId: string;
  actorRoleKeys?: MembershipRole[];

  offering: ClassSubjectOffering;
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentClassLinks?: TeacherAssignmentClassLink[];

  nowMs?: number;
}): boolean {
  const nowMs = params.nowMs ?? Date.now();

  if (hasAdminAccess(params.actorRoleKeys)) {
    return params.offering.isArchived !== true;
  }

  if (!isOfferingActiveForStaff(params.offering, nowMs)) {
    return false;
  }

  const matchingAssignments = getMatchingTeacherAssignmentsForOffering({
    actorPersonId: params.actorPersonId,
    offering: params.offering,
    teacherAssignments: params.teacherAssignments,
    teacherAssignmentClassLinks: params.teacherAssignmentClassLinks ?? [],
    nowMs,
  });

  return matchingAssignments.length > 0;
}
