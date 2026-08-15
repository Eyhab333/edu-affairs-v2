import {
  MembershipRole as MembershipRoleSchema,
  type MembershipRole,
  type PdfResource,
  type PdfResourceAcknowledgement,
  type PdfResourceAcknowledgementReport,
  type TeacherAssignment,
  type TeacherAssignmentClassLink,
} from "@takween/contracts";

export type PdfResourceStaffContext = {
  orgId: string;
  personId: string;

  roleKeys: MembershipRole[];
  schoolIds: string[];

  canAccessAllSchools?: boolean;

  academicYearId?: string;
  termId?: string;
};

export type PdfResourceStudentContext = {
  orgId: string;
  studentId: string;

  schoolId: string;
  academicYearId?: string;
  termId?: string;

  gradeId?: string;
  classId?: string;
  subjectKeys?: string[];
};

export type PdfResourceTeacherContext = PdfResourceStaffContext & {
  teacherOfferingIds: string[];
  academicYearIds?: string[];
  termIds?: string[];
};

export const TEACHER_PDF_RESOURCE_ROLE_KEYS = new Set<MembershipRole>([
  "teacher",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

export type PdfResourceDomainIssue =
  | "INVALID_STAFF_ROLE"
  | "JOB_TASKS_REQUIRES_STAFF_AUDIENCE"
  | "STUDENT_ACKNOWLEDGEMENT_NOT_SUPPORTED";

function arraysIntersect(first: string[], second: string[]): boolean {
  return first.some((value) => second.includes(value));
}

function matchesOptionalValue(
  targetValue: string | undefined,
  actualValue: string | undefined,
): boolean {
  if (!targetValue) return true;

  return targetValue === actualValue;
}

function matchesOptionalList(
  targetValues: string[],
  actualValue: string | undefined,
): boolean {
  if (targetValues.length === 0) return true;
  if (!actualValue) return false;

  return targetValues.includes(actualValue);
}

function matchesOptionalScopeList(
  targetValue: string | undefined,
  actualValues: string[] | undefined,
): boolean {
  if (!targetValue) return true;
  return (actualValues ?? []).includes(targetValue);
}

export function resolveActiveTeacherOfferingIds(params: {
  assignments: TeacherAssignment[];
  classLinks: TeacherAssignmentClassLink[];
  now: number;
}): string[] {
  const activeAssignmentIds = new Set(
    params.assignments
      .filter(
        (assignment) =>
          assignment.status === "ACTIVE" &&
          assignment.startAt <= params.now &&
          (!assignment.endAt || assignment.endAt >= params.now),
      )
      .map((assignment) => assignment.id),
  );

  return Array.from(
    new Set([
      ...params.assignments
        .filter((assignment) => activeAssignmentIds.has(assignment.id))
        .map((assignment) => assignment.classSubjectOfferingId)
        .filter(Boolean),
      ...params.classLinks
        .filter((link) => activeAssignmentIds.has(link.assignmentId))
        .map((link) => link.classSubjectOfferingId)
        .filter(Boolean),
    ]),
  );
}

export function isTeacherTargetedByPdfResource(
  resource: PdfResource,
  teacher: PdfResourceTeacherContext,
): boolean {
  if (
    resource.kind !== "ENRICHMENT_MATERIAL" &&
    resource.kind !== "CURRICULUM_DISTRIBUTION"
  ) {
    return false;
  }

  if (
    !teacher.roleKeys.some((roleKey) =>
      TEACHER_PDF_RESOURCE_ROLE_KEYS.has(roleKey),
    )
  ) {
    return false;
  }

  // The staff helper accepts a single academic-year/term value. Teaching
  // assignments can span multiple values, so defer those two checks to the
  // assignment-derived lists below while preserving its org/role/school logic.
  if (
    !isStaffTargetedByPdfResource(resource, {
      ...teacher,
      academicYearId: resource.audience.academicYearId,
      termId: resource.audience.termId,
    })
  ) {
    return false;
  }

  if (
    !matchesOptionalScopeList(
      resource.audience.academicYearId,
      teacher.academicYearIds,
    ) ||
    !matchesOptionalScopeList(resource.audience.termId, teacher.termIds)
  ) {
    return false;
  }

  return arraysIntersect(
    resource.audience.classSubjectOfferingIds,
    teacher.teacherOfferingIds,
  );
}

export function validatePdfResourceDomainRules(
  resource: PdfResource,
): PdfResourceDomainIssue[] {
  const issues: PdfResourceDomainIssue[] = [];

  if (resource.audience.kind === "STAFF_ROLES") {
    const hasInvalidRole = resource.audience.targetRoleKeys.some(
      (roleKey) => !MembershipRoleSchema.safeParse(roleKey).success,
    );

    if (hasInvalidRole) {
      issues.push("INVALID_STAFF_ROLE");
    }
  }

  if (
    resource.kind === "JOB_TASKS" &&
    resource.audience.kind !== "STAFF_ROLES"
  ) {
    issues.push("JOB_TASKS_REQUIRES_STAFF_AUDIENCE");
  }

  if (
    resource.audience.kind === "STUDENTS" &&
    resource.requiresAcknowledgement
  ) {
    issues.push("STUDENT_ACKNOWLEDGEMENT_NOT_SUPPORTED");
  }

  return issues;
}

export function isStaffTargetedByPdfResource(
  resource: PdfResource,
  staff: PdfResourceStaffContext,
): boolean {
  if (resource.status !== "PUBLISHED") return false;
  if (resource.orgId !== staff.orgId) return false;
  if (resource.audience.kind !== "STAFF_ROLES") return false;

  if (
    !arraysIntersect(
      resource.audience.targetRoleKeys,
      staff.roleKeys,
    )
  ) {
    return false;
  }

  if (
    resource.audience.schoolIds.length > 0 &&
    !staff.canAccessAllSchools &&
    !arraysIntersect(resource.audience.schoolIds, staff.schoolIds)
  ) {
    return false;
  }

  if (
    !matchesOptionalValue(
      resource.audience.academicYearId,
      staff.academicYearId,
    )
  ) {
    return false;
  }

  if (
    !matchesOptionalValue(
      resource.audience.termId,
      staff.termId,
    )
  ) {
    return false;
  }

  return true;
}

export function isStudentTargetedByPdfResource(
  resource: PdfResource,
  student: PdfResourceStudentContext,
): boolean {
  if (resource.status !== "PUBLISHED") return false;
  if (resource.orgId !== student.orgId) return false;
  if (resource.audience.kind !== "STUDENTS") return false;

  if (
    !resource.audience.schoolIds.includes(student.schoolId)
  ) {
    return false;
  }

  if (
    !matchesOptionalValue(
      resource.audience.academicYearId,
      student.academicYearId,
    )
  ) {
    return false;
  }

  if (
    !matchesOptionalValue(
      resource.audience.termId,
      student.termId,
    )
  ) {
    return false;
  }

  if (
    !matchesOptionalList(
      resource.audience.gradeIds,
      student.gradeId,
    )
  ) {
    return false;
  }

  if (
    !matchesOptionalList(
      resource.audience.classIds,
      student.classId,
    )
  ) {
    return false;
  }

  if (
    resource.audience.subjectKeys.length > 0 &&
    !arraysIntersect(
      resource.audience.subjectKeys,
      student.subjectKeys ?? [],
    )
  ) {
    return false;
  }

  return true;
}

export function canStaffAcknowledgePdfResource(
  resource: PdfResource,
  staff: PdfResourceStaffContext,
): boolean {
  return (
    resource.requiresAcknowledgement &&
    isStaffTargetedByPdfResource(resource, staff)
  );
}

export function filterPdfResourcesForStaff(params: {
  resources: PdfResource[];
  staff: PdfResourceStaffContext;
}): PdfResource[] {
  return params.resources.filter((resource) =>
    isStaffTargetedByPdfResource(resource, params.staff),
  );
}

export function filterPdfResourcesForStudent(params: {
  resources: PdfResource[];
  student: PdfResourceStudentContext;
}): PdfResource[] {
  return params.resources.filter((resource) =>
    isStudentTargetedByPdfResource(resource, params.student),
  );
}



export type PdfResourceReportStaffMember = {
  uid: string;
  personId: string;
  displayName: string;

  roleKey: MembershipRole;

  schoolIds: string[];
  canAccessAllSchools?: boolean;
};

function resolveReportSchoolId(params: {
  resource: PdfResource;
  staff: PdfResourceReportStaffMember;
}): string {
  const { resource, staff } = params;

  if (resource.audience.kind !== "STAFF_ROLES") {
    return "";
  }

  return (
    resource.audience.schoolIds.find((schoolId) =>
      staff.schoolIds.includes(schoolId),
    ) ??
    staff.schoolIds[0] ??
    ""
  );
}

export function buildPdfResourceAcknowledgementReport(params: {
  resource: PdfResource;

  staffMembers: PdfResourceReportStaffMember[];
  acknowledgements: PdfResourceAcknowledgement[];

  generatedAt: number;
}): PdfResourceAcknowledgementReport {
  const {
    resource,
    staffMembers,
    acknowledgements,
    generatedAt,
  } = params;

  if (resource.audience.kind !== "STAFF_ROLES") {
    throw new Error(
      "Acknowledgement reports currently support staff resources only.",
    );
  }

  if (!resource.requiresAcknowledgement) {
    throw new Error(
      "This PDF resource does not require acknowledgement.",
    );
  }

  const uniqueStaff = Array.from(
    new Map(
      staffMembers.map((staff) => [staff.personId, staff]),
    ).values(),
  );

  const targetedStaff = uniqueStaff.filter((staff) =>
    isStaffTargetedByPdfResource(resource, {
      orgId: resource.orgId,
      personId: staff.personId,
      roleKeys: [staff.roleKey],
      schoolIds: staff.schoolIds,
      canAccessAllSchools: staff.canAccessAllSchools,
      academicYearId: resource.audience.academicYearId,
      termId: resource.audience.termId,
    }),
  );

  const acknowledgementsByActorId = new Map(
    acknowledgements
      .filter(
        (acknowledgement) =>
          acknowledgement.orgId === resource.orgId &&
          acknowledgement.resourceId === resource.id &&
          acknowledgement.actorKind === "STAFF",
      )
      .map((acknowledgement) => [
        acknowledgement.actorId,
        acknowledgement,
      ]),
  );

  const items = targetedStaff
    .map((staff) => {
      const acknowledgement =
        acknowledgementsByActorId.get(staff.personId);

      return {
        actorKind: "STAFF" as const,
        actorId: staff.personId,

        uid: staff.uid,
        personId: staff.personId,

        displayName: staff.displayName,
        roleKey: staff.roleKey,

        schoolId:
          acknowledgement?.schoolId ||
          resolveReportSchoolId({
            resource,
            staff,
          }),

        acknowledgementStatus: acknowledgement
          ? ("ACKNOWLEDGED" as const)
          : ("PENDING" as const),

        acknowledgedAt:
          acknowledgement?.acknowledgedAt,
      };
    })
    .sort((first, second) =>
      first.displayName.localeCompare(
        second.displayName,
        "ar",
      ),
    );

  const totalTargeted = items.length;

  const acknowledgedCount = items.filter(
    (item) =>
      item.acknowledgementStatus === "ACKNOWLEDGED",
  ).length;

  const pendingCount =
    totalTargeted - acknowledgedCount;

  const completionPercentage =
    totalTargeted === 0
      ? 0
      : Math.round(
          (acknowledgedCount / totalTargeted) *
            10000,
        ) / 100;

  return {
    orgId: resource.orgId,

    resourceId: resource.id,
    resourceTitle: resource.title,

    generatedAt,

    summary: {
      totalTargeted,
      acknowledgedCount,
      pendingCount,
      completionPercentage,
    },

    items,
  };
}





