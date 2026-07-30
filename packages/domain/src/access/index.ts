import type {
  Class,
  Membership,
  OperationalAssignment,
  OperationKind,
  OperationPermission,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";

import {
  getActiveOperationalAssignmentsForActor,
  getActiveTeacherAssignmentsForActor,
} from "../assignments";

export type ActorAccessContext = {
  actorPersonId: string;
  orgId: string;
  memberships?: Membership[];
  operationalAssignments?: OperationalAssignment[];
  teacherAssignments?: TeacherAssignment[];
  teacherAssignmentClassLinks?: TeacherAssignmentClassLink[];
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

function teacherAssignmentAllowsClass(params: {
  assignment: TeacherAssignment;
  classItem: Class;
  classLinks: TeacherAssignmentClassLink[];
}): boolean {
  const { assignment, classItem, classLinks } = params;

  if (assignment.orgId !== classItem.orgId) return false;
  if (assignment.schoolId !== classItem.schoolId) return false;
  if (assignment.academicYearId !== classItem.academicYearId) return false;

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
    classItem.gradeId &&
    assignment.targetScopeId === classItem.gradeId
  ) {
    return true;
  }

  if (
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
    assignment.targetScopeType === "STREAM" &&
    classItem.streamId &&
    assignment.targetScopeId === classItem.streamId
  ) {
    return true;
  }

  return classLinks.some((link) => {
    return (
      link.assignmentId === assignment.id &&
      link.classId === classItem.id &&
      link.orgId === classItem.orgId &&
      link.schoolId === classItem.schoolId &&
      link.academicYearId === classItem.academicYearId
    );
  });
}

function isOrgWideMembership(membership: Membership): boolean {
  const roleKey = membership.roleKey ?? membership.role;

  const orgWideRoles = new Set<string>([
    "platform_owner",
    "platform_admin",
    "org_owner",
    "org_admin",
  ]);

  return (
    membership.orgId.length > 0 &&
    membership.isActive !== false &&
    (orgWideRoles.has(roleKey ?? "") ||
      membership.permissions?.manageOrg === true ||
      membership.permissions?.manageSchools === true ||
      membership.permissions?.manageDirectory === true ||
      membership.scopes?.canAccessAllSchools === true)
  );
}

const TEACHER_MEMBERSHIP_ROLE_KEYS = new Set<string>([
  "teacher",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

function isTeacherMembership(membership: Membership): boolean {
  const roleKey = membership.roleKey ?? membership.role;

  return TEACHER_MEMBERSHIP_ROLE_KEYS.has(roleKey ?? "");
}

function membershipAllowsClass(
  membership: Membership,
  classItem: Class,
): boolean {
  if (membership.isActive === false) return false;
  if (membership.orgId !== classItem.orgId) return false;

  if (isOrgWideMembership(membership)) return true;

  /*
   * عضوية المعلم تحدد هويته ودوره فقط.
   * الفصول المسموحة له تأتي من TeacherAssignment،
   * حتى لا يمنحه schoolId كل فصول المدرسة.
   */
  if (isTeacherMembership(membership)) {
    return false;
  }

  const schoolIds = membership.scopes?.schoolIds ?? [];
  const gradeIds = membership.scopes?.gradeIds ?? [];
  const classIds = membership.scopes?.classIds ?? [];

  if (classIds.includes(classItem.id)) return true;
  if (schoolIds.includes(classItem.schoolId)) return true;

  if (classItem.gradeId && gradeIds.includes(classItem.gradeId)) {
    return true;
  }

  if (membership.scopeType === "CLASS" && membership.scopeId === classItem.id) {
    return true;
  }

  if (
    membership.scopeType === "SCHOOL" &&
    membership.scopeId === classItem.schoolId
  ) {
    return true;
  }

  if (
    membership.scopeType === "GRADE" &&
    classItem.gradeId &&
    membership.scopeId === classItem.gradeId
  ) {
    return true;
  }

  return false;
}

function operationalAssignmentAllowsClass(
  assignment: OperationalAssignment,
  classItem: Class,
): boolean {
  if (assignment.orgId !== classItem.orgId) return false;

  if (assignment.scopeType === "CLASS" && assignment.scopeId === classItem.id) {
    return true;
  }

  if (
    assignment.scopeType === "SCHOOL" &&
    assignment.scopeId === classItem.schoolId &&
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE"
  ) {
    return true;
  }

  if (
    assignment.scopeType === "GRADE" &&
    classItem.gradeId &&
    assignment.scopeId === classItem.gradeId &&
    assignment.coverageMode === "ALL_CLASSES_IN_SCOPE"
  ) {
    return true;
  }

  if (assignment.targetClassIds.includes(classItem.id)) return true;

  if (
  assignment.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
  classItem.gradeId &&
  assignment.targetGradeIds.includes(classItem.gradeId)
) {
  return true;
}

  return false;
}

export function getVisibleClassesForActor(params: {
  context: ActorAccessContext;
  classes: Class[];
  teacherAssignmentClassLinks?: TeacherAssignmentClassLink[];
  nowMs?: number;
}): Class[] {
  const memberships = params.context.memberships ?? [];

  const operationalAssignments = getActiveOperationalAssignmentsForActor({
    actorPersonId: params.context.actorPersonId,
    assignments: params.context.operationalAssignments ?? [],
    nowMs: params.nowMs,
  });

  const teacherAssignments = getActiveTeacherAssignmentsForActor({
    actorPersonId: params.context.actorPersonId,
    assignments: params.context.teacherAssignments ?? [],
    nowMs: params.nowMs,
  });

  const teacherAssignmentClassLinks =
    params.teacherAssignmentClassLinks ??
    params.context.teacherAssignmentClassLinks ??
    [];

  const visible = params.classes.filter((classItem) => {
    if (classItem.orgId !== params.context.orgId) return false;
    if (classItem.isArchived) return false;

    const allowedByMembership = memberships.some((membership) =>
      membershipAllowsClass(membership, classItem),
    );

    if (allowedByMembership) return true;

    const allowedByTeacherAssignment = teacherAssignments.some((assignment) =>
      teacherAssignmentAllowsClass({
        assignment,
        classItem,
        classLinks: teacherAssignmentClassLinks,
      }),
    );

    if (allowedByTeacherAssignment) return true;

    return operationalAssignments.some((assignment) =>
      operationalAssignmentAllowsClass(assignment, classItem),
    );
  });

  return uniqueById(visible).sort((a, b) => {
    if (a.schoolId !== b.schoolId) {
      return a.schoolId.localeCompare(b.schoolId);
    }

    return a.order - b.order;
  });
}

export function canRunOperation(params: {
  context: ActorAccessContext;
  operationKind: OperationKind;
  permission?: OperationPermission;
  scopeType?: string;
  scopeId?: string;
  nowMs?: number;
}): boolean {
  const permission = params.permission ?? "VIEW";

  const assignments = getActiveOperationalAssignmentsForActor({
    actorPersonId: params.context.actorPersonId,
    assignments: params.context.operationalAssignments ?? [],
    nowMs: params.nowMs,
  });

  return assignments.some((assignment) => {
    if (assignment.operationKind !== params.operationKind) return false;
    if (!assignment.permissions.includes(permission)) return false;

    if (params.scopeType && assignment.scopeType !== params.scopeType) {
      return false;
    }

    if (
      params.scopeId &&
      assignment.scopeId &&
      assignment.scopeId !== params.scopeId
    ) {
      return false;
    }

    return true;
  });
}
