import type {
  StudentCase,
  StudentCaseEvent,
  StudentCaseStatus,
} from "@takween/contracts";

export type StudentCaseActor = {
  personId: string;
  displayName?: string;
  roleKey?: string;

  orgId: string;

  schoolIds?: string[];
  classIds?: string[];

  permissions?: string[];

  isOrgWideActor?: boolean;
  isSchoolWideActor?: boolean;
};

export type StudentCaseStudentScope = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId?: string;
};

export type StudentCaseAssigneeCandidate = {
  personId: string;
  displayName: string;
  roleKey?: string;

  orgId: string;
  schoolIds?: string[];
  classIds?: string[];

  canReceiveStudentCases?: boolean;
  canHandleStudentCases?: boolean;
  isActive?: boolean;
};

export type StudentCaseTimelineItem = {
  id: string;
  event: StudentCaseEvent;
  label: string;
  createdAt: number;
};

const CASE_RECEIVER_ROLE_KEYS = new Set([
  "BOYS_PRINCIPAL",
  "GIRLS_PRINCIPAL",
  "KG_PRINCIPAL",
  "BOYS_VP",
  "GIRLS_VP",
  "KG_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_STUDENT_GUIDE",
  "GIRLS_STUDENT_COUNSELOR",
  "PRINCIPAL",
  "SCHOOL_PRINCIPAL",
  "VICE_PRINCIPAL",
  "STUDENT_AFFAIRS_VP",
  "COUNSELOR",
  "STUDENT_COUNSELOR",
  "GUIDANCE_COUNSELOR",
  "SCHOOL_ADMIN",
  "MANAGER",
  "DIRECTOR",
]);

const CASE_CREATE_PERMISSION_KEYS = new Set([
  "STUDENT_CASE_CREATE",
  "STUDENT_CASE_REFERRAL",
  "STUDENT_CASE_MANAGE",
  "CASES_MANAGE",
]);

const CASE_HANDLE_PERMISSION_KEYS = new Set([
  "STUDENT_CASE_HANDLE",
  "STUDENT_CASE_TRANSFER",
  "STUDENT_CASE_MANAGE",
  "CASES_MANAGE",
]);

function hasAnyPermission(
  permissions: string[] | undefined,
  allowed: Set<string>
) {
  return (permissions ?? []).some((permission) => allowed.has(permission));
}

function sameOrg(actor: Pick<StudentCaseActor, "orgId">, orgId: string) {
  return actor.orgId === orgId;
}

function actorCanAccessSchool(
  actor: StudentCaseActor,
  schoolId: string
): boolean {
  if (actor.isOrgWideActor) return true;
  if (actor.isSchoolWideActor && actor.schoolIds?.includes(schoolId)) {
    return true;
  }

  return actor.schoolIds?.includes(schoolId) ?? false;
}

function actorCanAccessClass(
  actor: StudentCaseActor,
  classId?: string
): boolean {
  if (!classId) return true;
  if (actor.isOrgWideActor || actor.isSchoolWideActor) return true;

  return actor.classIds?.includes(classId) ?? false;
}

function roleCanReceiveStudentCases(roleKey?: string) {
  if (!roleKey) return false;
  return CASE_RECEIVER_ROLE_KEYS.has(roleKey);
}

function statusAllowsTransfer(status: StudentCaseStatus) {
  return !["CLOSED", "CANCELLED", "RESOLVED"].includes(status);
}

export function canCreateStudentCase(params: {
  actor: StudentCaseActor;
  studentScope: StudentCaseStudentScope;
}) {
  const { actor, studentScope } = params;

  if (!sameOrg(actor, studentScope.orgId)) return false;
  if (!actorCanAccessSchool(actor, studentScope.schoolId)) return false;
  if (!actorCanAccessClass(actor, studentScope.classId)) return false;

  if (hasAnyPermission(actor.permissions, CASE_CREATE_PERMISSION_KEYS)) {
    return true;
  }

  return true;
}

export function canViewStudentCase(params: {
  actor: StudentCaseActor;
  studentCase: StudentCase;
}) {
  const { actor, studentCase } = params;

  if (!sameOrg(actor, studentCase.orgId)) return false;
  if (!actorCanAccessSchool(actor, studentCase.schoolId)) return false;

  if (actor.isOrgWideActor || actor.isSchoolWideActor) return true;

  if (studentCase.createdByPersonId === actor.personId) return true;

  if (studentCase.currentAssigneePersonId === actor.personId) return true;

  if (studentCase.classId && actorCanAccessClass(actor, studentCase.classId)) {
    return true;
  }

  return hasAnyPermission(actor.permissions, CASE_HANDLE_PERMISSION_KEYS);
}

export function canTransferStudentCase(params: {
  actor: StudentCaseActor;
  studentCase: StudentCase;
}) {
  const { actor, studentCase } = params;

  if (!canViewStudentCase({ actor, studentCase })) return false;
  if (!statusAllowsTransfer(studentCase.status)) return false;

  if (actor.isOrgWideActor || actor.isSchoolWideActor) return true;

  if (studentCase.currentAssigneePersonId === actor.personId) return true;

  return hasAnyPermission(actor.permissions, CASE_HANDLE_PERMISSION_KEYS);
}

export function resolveAvailableCaseAssignees(params: {
  actor: StudentCaseActor;
  studentCase?: StudentCase;
  studentScope?: StudentCaseStudentScope;
  candidates: StudentCaseAssigneeCandidate[];
}) {
  const { actor, studentCase, studentScope, candidates } = params;

  const orgId = studentCase?.orgId ?? studentScope?.orgId;
  const schoolId = studentCase?.schoolId ?? studentScope?.schoolId;
  const classId = studentCase?.classId ?? studentScope?.classId;

  if (!orgId || !schoolId) return [];

  return candidates
    .filter((candidate) => candidate.isActive === true)
    .filter((candidate) => candidate.orgId === orgId)
    .filter((candidate) => candidate.personId !== actor.personId)
    .filter((candidate) => {
      if (candidate.canReceiveStudentCases) return true;
      if (candidate.canHandleStudentCases) return true;
      return roleCanReceiveStudentCases(candidate.roleKey);
    })
    .filter((candidate) => {
      const candidateSchools = candidate.schoolIds ?? [];
      return candidateSchools.includes(schoolId);
    })
    .filter((candidate) => {
      if (!classId) return true;

      const candidateClasses = candidate.classIds ?? [];
      if (!candidateClasses.length) return true;

      return candidateClasses.includes(classId);
    })
    .sort((a, b) => {
      const roleCompare = (a.roleKey ?? "").localeCompare(b.roleKey ?? "", "ar");
      if (roleCompare !== 0) return roleCompare;

      return a.displayName.localeCompare(b.displayName, "ar");
    });
}

function getEventLabel(event: StudentCaseEvent) {
  const actorName = event.createdByDisplayName ?? "مستخدم";

  switch (event.eventType) {
    case "CREATED":
      return `${actorName} أنشأ القضية`;

    case "REFERRED":
      return `${actorName} أحال القضية إلى ${
        event.toAssigneeDisplayName ?? "مستلم"
      }`;

    case "TRANSFERRED":
      return `${actorName} حوّل القضية إلى ${
        event.toAssigneeDisplayName ?? "مستلم"
      }`;

    case "ESCALATED":
      return `${actorName} صعّد القضية إلى ${
        event.toAssigneeDisplayName ?? "جهة أعلى"
      }`;

    case "RETURNED":
      return `${actorName} أعاد القضية`;

    case "COMMENT_ADDED":
      return `${actorName} أضاف تعليقًا`;

    case "ACTION_ADDED":
      return `${actorName} أضاف إجراءً`;

    case "PARENT_CONTACTED":
      return `${actorName} سجّل تواصلًا مع ولي الأمر`;

    case "RESOLVED":
      return `${actorName} وضع القضية كتم حلها`;

    case "CLOSED":
      return `${actorName} أغلق القضية`;

    case "REOPENED":
      return `${actorName} أعاد فتح القضية`;

    case "CANCELLED":
      return `${actorName} ألغى القضية`;

    case "VISIBILITY_CHANGED":
      return `${actorName} عدّل ظهور القضية لولي الأمر`;

    default:
      return `${actorName} حدّث القضية`;
  }
}

export function buildStudentCaseTimeline(events: StudentCaseEvent[]) {
  return [...events]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map<StudentCaseTimelineItem>((event) => ({
      id: event.id,
      event,
      label: getEventLabel(event),
      createdAt: event.createdAt,
    }));
}
