import type {
  Membership,
  MembershipRole,
  OperationalAssignment,
  PersonSupervisionScope,
  TeacherAssignment,
} from "@takween/contracts";

import { hasOrgWideAccess } from "./access";
import {
  getActiveOperationalAssignmentsForActor,
  getActiveTeacherAssignmentsForActor,
} from "./assignments";
import { getPersonSupervisionSchoolIds } from "./person-supervision-scope";

const SCHOOL_PRINCIPAL_ROLE_KEYS = new Set<MembershipRole>([
  "school_admin",
  "school_manager",
  "BOYS_PRINCIPAL",
  "GIRLS_PRINCIPAL",
  "KG_PRINCIPAL",
]);

const SCHOOL_VICE_PRINCIPAL_ROLE_KEYS = new Set<MembershipRole>([
  "BOYS_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "GIRLS_VP",
  "KG_VP",
]);

const SUPERVISORY_ROLE_KEYS = new Set<MembershipRole>([
  "ORG_CHAIR",
  "ORG_CEO",
  "ORG_CEO_ASSIST",
  "ORG_SUPERVISION_HEAD",
  "ADMIN_SUPERVISOR",
  "EDU_SUPERVISOR",
  "VALUES_COORD",
  "BOYS_SUPERVISION_HEAD",
  "BOYS_EDU_SUPERVISOR",
  "GIRLS_EDU_SUPERVISOR",
  "KG_EDU_SUPERVISOR",
  "KG_VALUES_COORD",
]);

const LOCAL_STAFF_ROLE_KEYS = new Set<MembershipRole>([
  "staff",
  "teacher",
  "viewer",
  "ADMIN_ASSISTANT",
  "MEDIA_SPECIALIST",
  "HR_SPECIALIST",
  "ACTIVITY_COORD",
  "SCHOOL_MONITOR",
  "NURSERY_CAREGIVER",
  "FINANCE_COLLECTOR",
  "BOYS_STUDENT_GUIDE",
  "GIRLS_STUDENT_COUNSELOR",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

export type StaffAuthorityViewer = {
  orgId: string;
  personId: string;
  roles: MembershipRole[];
  homeSchoolIds: string[];
  operationalAssignments: OperationalAssignment[];
  supervisionScopes?: readonly PersonSupervisionScope[];
};

export type StaffAuthorityTarget = {
  personId: string;
  roles: MembershipRole[];
  homeSchoolIds: string[];
  authorityPersonIds?: string[];
};

export type StaffAuthoritySource =
  | "SELF"
  | "ORG_WIDE"
  | "EXPLICIT_OPERATIONAL_ASSIGNMENT"
  | "TARGET_MEMBERSHIP_RELATION"
  | "PERSON_SUPERVISION_SCOPE"
  | "SCHOOL_PRINCIPAL"
  | "SCHOOL_VICE_PRINCIPAL"
  | "NONE";

export type StaffAuthorityResolution = {
  allowed: boolean;
  source: StaffAuthoritySource;
};

function uniqueStrings(values: readonly string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function hasIntersection(first: readonly string[], second: readonly string[]) {
  const firstValues = new Set(first);
  return second.some((value) => firstValues.has(value));
}

export function isStaffMembershipActive(
  membership: Membership,
  nowMs = Date.now(),
) {
  if (membership.isActive === false) return false;
  if (typeof membership.startAt === "number" && membership.startAt > nowMs) {
    return false;
  }
  if (typeof membership.endAt === "number" && membership.endAt < nowMs) {
    return false;
  }
  return true;
}

function membershipMatchesPerson(membership: Membership, personId: string) {
  return !!personId && membership.personId === personId;
}

/**
 * Resolves schools where someone is actually placed, not schools that their
 * membership happens to grant access to. `scopes.schoolIds` is intentionally
 * excluded because it can represent administrative or supervisory access.
 */
export function resolveStaffHomeSchoolIds(params: {
  personId: string;
  memberships: readonly Membership[];
  teacherAssignments: readonly TeacherAssignment[];
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  const membershipSchoolIds = params.memberships.flatMap((membership) => {
    if (
      !membershipMatchesPerson(membership, params.personId) ||
      !isStaffMembershipActive(membership, nowMs) ||
      membership.scopeType !== "SCHOOL" ||
      !membership.scopeId
    ) {
      return [];
    }
    return [membership.scopeId];
  });

  const teacherAssignmentSchoolIds = getActiveTeacherAssignmentsForActor({
    actorPersonId: params.personId,
    assignments: [...params.teacherAssignments],
    nowMs,
  })
    .filter((assignment) => assignment.status === "ACTIVE")
    .map((assignment) => assignment.schoolId);

  return uniqueStrings([...membershipSchoolIds, ...teacherAssignmentSchoolIds]);
}

/**
 * Snapshots direct target-to-manager relationships already present on a
 * membership. These relationships are directional: target -> viewer.
 */
export function resolveStaffAuthorityPersonIds(params: {
  personId: string;
  memberships: readonly Membership[];
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  return uniqueStrings(
    params.memberships.flatMap((membership) => {
      if (
        !membershipMatchesPerson(membership, params.personId) ||
        !isStaffMembershipActive(membership, nowMs)
      ) {
        return [];
      }
      return [
        membership.directEvaluatorPersonId,
        membership.supervisorPersonId,
        membership.managerPersonId,
        membership.principalPersonId,
        membership.vicePrincipalPersonId,
      ];
    }),
  );
}

function hasRole(
  roles: readonly MembershipRole[],
  allowedRoles: ReadonlySet<MembershipRole>,
) {
  return roles.some((role) => allowedRoles.has(role));
}

function isLocalStaffTarget(target: StaffAuthorityTarget) {
  if (hasOrgWideAccess(target.roles)) return false;
  if (hasRole(target.roles, SUPERVISORY_ROLE_KEYS)) return false;
  if (hasRole(target.roles, SCHOOL_PRINCIPAL_ROLE_KEYS)) return false;
  if (hasRole(target.roles, SCHOOL_VICE_PRINCIPAL_ROLE_KEYS)) return false;
  return hasRole(target.roles, LOCAL_STAFF_ROLE_KEYS);
}

function isVicePrincipalTarget(target: StaffAuthorityTarget) {
  return (
    !hasOrgWideAccess(target.roles) &&
    !hasRole(target.roles, SUPERVISORY_ROLE_KEYS) &&
    !hasRole(target.roles, SCHOOL_PRINCIPAL_ROLE_KEYS) &&
    hasRole(target.roles, SCHOOL_VICE_PRINCIPAL_ROLE_KEYS)
  );
}

function getViewerSupervisionSchoolIds(
  viewer: StaffAuthorityViewer,
  nowMs: number,
) {
  return uniqueStrings([
    ...getPersonSupervisionSchoolIds({
      scopes: viewer.supervisionScopes ?? [],
      orgId: viewer.orgId,
      personId: viewer.personId,
      capability: "STAFF_WORK_VIEW",
      nowMs,
    }),
    ...getPersonSupervisionSchoolIds({
      scopes: viewer.supervisionScopes ?? [],
      orgId: viewer.orgId,
      personId: viewer.personId,
      capability: "TEACHER_WORK_VIEW",
      nowMs,
    }),
  ]);
}

function hasExplicitOperationalAuthority(params: {
  viewer: StaffAuthorityViewer;
  targetPersonId: string;
  nowMs: number;
}) {
  return getActiveOperationalAssignmentsForActor({
    actorPersonId: params.viewer.personId,
    assignments: params.viewer.operationalAssignments,
    nowMs: params.nowMs,
  }).some(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      assignment.permissions.includes("VIEW") &&
      assignment.targetPersonIds.includes(params.targetPersonId),
  );
}

/**
 * Directional staff authority. Shared school visibility is never enough on
 * its own: the viewer must have an explicit relation, an active supervision
 * scope of their own, or a permitted local leadership relationship.
 */
export function resolveStaffAuthority(params: {
  viewer: StaffAuthorityViewer;
  target: StaffAuthorityTarget;
  nowMs?: number;
}): StaffAuthorityResolution {
  const nowMs = params.nowMs ?? Date.now();
  const { viewer, target } = params;

  if (viewer.personId === target.personId) {
    return { allowed: true, source: "SELF" };
  }
  if (hasOrgWideAccess(viewer.roles)) {
    return { allowed: true, source: "ORG_WIDE" };
  }
  if (
    hasExplicitOperationalAuthority({
      viewer,
      targetPersonId: target.personId,
      nowMs,
    })
  ) {
    return { allowed: true, source: "EXPLICIT_OPERATIONAL_ASSIGNMENT" };
  }
  if (target.authorityPersonIds?.includes(viewer.personId)) {
    return { allowed: true, source: "TARGET_MEMBERSHIP_RELATION" };
  }

  const viewerSupervisionSchoolIds = getViewerSupervisionSchoolIds(
    viewer,
    nowMs,
  );
  if (
    viewerSupervisionSchoolIds.length > 0 &&
    isLocalStaffTarget(target) &&
    hasIntersection(viewerSupervisionSchoolIds, target.homeSchoolIds)
  ) {
    return { allowed: true, source: "PERSON_SUPERVISION_SCOPE" };
  }

  const sharesHomeSchool = hasIntersection(
    viewer.homeSchoolIds,
    target.homeSchoolIds,
  );
  if (!sharesHomeSchool) return { allowed: false, source: "NONE" };

  if (
    hasRole(viewer.roles, SCHOOL_PRINCIPAL_ROLE_KEYS) &&
    (isVicePrincipalTarget(target) || isLocalStaffTarget(target))
  ) {
    return { allowed: true, source: "SCHOOL_PRINCIPAL" };
  }
  if (
    hasRole(viewer.roles, SCHOOL_VICE_PRINCIPAL_ROLE_KEYS) &&
    isLocalStaffTarget(target)
  ) {
    return { allowed: true, source: "SCHOOL_VICE_PRINCIPAL" };
  }

  return { allowed: false, source: "NONE" };
}

export function canViewerAccessTargetStaff(params: {
  viewer: StaffAuthorityViewer;
  target: StaffAuthorityTarget;
  nowMs?: number;
}) {
  return resolveStaffAuthority(params).allowed;
}

export function canViewerBrowseStaffTargets(
  viewer: StaffAuthorityViewer,
  nowMs = Date.now(),
) {
  if (hasOrgWideAccess(viewer.roles)) return true;
  if (getViewerSupervisionSchoolIds(viewer, nowMs).length > 0) return true;
  if (
    viewer.homeSchoolIds.length > 0 &&
    (hasRole(viewer.roles, SCHOOL_PRINCIPAL_ROLE_KEYS) ||
      hasRole(viewer.roles, SCHOOL_VICE_PRINCIPAL_ROLE_KEYS))
  ) {
    return true;
  }
  return getActiveOperationalAssignmentsForActor({
    actorPersonId: viewer.personId,
    assignments: viewer.operationalAssignments,
    nowMs,
  }).some(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      assignment.permissions.includes("VIEW") &&
      assignment.targetPersonIds.length > 0,
  );
}
