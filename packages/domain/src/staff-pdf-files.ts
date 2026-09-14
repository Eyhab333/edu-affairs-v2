import type {
  MembershipRole,
  OperationalAssignment,
  PersonSupervisionScope,
  StaffPdfFile,
} from "@takween/contracts";

import { getActiveOperationalAssignmentsForActor } from "./assignments";
import { getPersonSupervisionSchoolIds } from "./person-supervision-scope";
import {
  STAFF_PORTFOLIO_SCHOOL_MANAGEMENT_ROLE_KEYS,
  STAFF_PORTFOLIO_SUPERVISION_HEAD_ROLE_KEYS,
} from "./staff-portfolio";

const ORG_WIDE_ROLE_KEYS = new Set<MembershipRole>([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

function hasIntersection(first: readonly string[], second: readonly string[]) {
  const values = new Set(first);
  return second.some((value) => values.has(value));
}

function activeSupervisionSchoolIds(params: {
  orgId: string;
  personId: string;
  scopes: readonly PersonSupervisionScope[];
  nowMs?: number;
}) {
  return Array.from(
    new Set([
      ...getPersonSupervisionSchoolIds({
        scopes: params.scopes,
        orgId: params.orgId,
        personId: params.personId,
        capability: "STAFF_WORK_VIEW",
        nowMs: params.nowMs,
      }),
      ...getPersonSupervisionSchoolIds({
        scopes: params.scopes,
        orgId: params.orgId,
        personId: params.personId,
        capability: "TEACHER_WORK_VIEW",
        nowMs: params.nowMs,
      }),
    ]),
  );
}

function hasSchoolLeadershipRole(roles: readonly MembershipRole[]) {
  return roles.some(
    (role) =>
      STAFF_PORTFOLIO_SCHOOL_MANAGEMENT_ROLE_KEYS.has(role) ||
      STAFF_PORTFOLIO_SUPERVISION_HEAD_ROLE_KEYS.has(role),
  );
}

function hasViewPermission(assignment: OperationalAssignment) {
  const permissions = Array.isArray(assignment.permissions)
    ? assignment.permissions
    : [];

  return permissions.includes("VIEW");
}

function getTargetPersonIds(assignment: OperationalAssignment) {
  return Array.isArray(assignment.targetPersonIds)
    ? assignment.targetPersonIds
    : [];
}

export type StaffPdfFileViewer = {
  orgId: string;
  uid: string;
  personId: string;
  roles: MembershipRole[];
  schoolIds: string[];
  operationalAssignments: OperationalAssignment[];
  supervisionScopes?: readonly PersonSupervisionScope[];
};

export function canBrowseStaffPdfFilesInScope(
  viewer: StaffPdfFileViewer,
  nowMs = Date.now(),
) {
  if (viewer.roles.some((role) => ORG_WIDE_ROLE_KEYS.has(role))) {
    return true;
  }

  if (
    activeSupervisionSchoolIds({
      orgId: viewer.orgId,
      personId: viewer.personId,
      scopes: viewer.supervisionScopes ?? [],
      nowMs,
    }).length > 0
  ) {
    return true;
  }

  if (hasSchoolLeadershipRole(viewer.roles) && viewer.schoolIds.length > 0) {
    return true;
  }

  return getActiveOperationalAssignmentsForActor({
    actorPersonId: viewer.personId,
    assignments: viewer.operationalAssignments,
    nowMs,
  }).some((assignment) => {
    const targetPersonIds = getTargetPersonIds(assignment);

    return hasViewPermission(assignment) && targetPersonIds.length > 0;
  });
}

export function canViewStaffPdfFile(params: {
  viewer: StaffPdfFileViewer;
  file: StaffPdfFile;
  nowMs?: number;
}) {
  const { viewer, file } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (file.orgId !== viewer.orgId || file.status !== "ACTIVE") {
    return false;
  }

  if (file.ownerUid === viewer.uid || file.ownerPersonId === viewer.personId) {
    return true;
  }

  if (viewer.roles.some((role) => ORG_WIDE_ROLE_KEYS.has(role))) {
    return true;
  }

  const supervisionSchoolIds = activeSupervisionSchoolIds({
    orgId: viewer.orgId,
    personId: viewer.personId,
    scopes: viewer.supervisionScopes ?? [],
    nowMs,
  });

  if (hasIntersection(supervisionSchoolIds, file.ownerSchoolIds)) {
    return true;
  }

  if (
    hasSchoolLeadershipRole(viewer.roles) &&
    hasIntersection(viewer.schoolIds, file.ownerSchoolIds)
  ) {
    return true;
  }

  return getActiveOperationalAssignmentsForActor({
    actorPersonId: viewer.personId,
    assignments: viewer.operationalAssignments,
    nowMs,
  }).some((assignment) => {
    const targetPersonIds = getTargetPersonIds(assignment);

    return (
      hasViewPermission(assignment) &&
      targetPersonIds.includes(file.ownerPersonId)
    );
  });
}