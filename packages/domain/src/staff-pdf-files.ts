import type {
  StaffPdfFile,
  TeacherAssignment,
} from "@takween/contracts";

import { getActiveTeacherAssignmentsForActor } from "./assignments";
import {
  canViewerAccessTargetStaff,
  canViewerBrowseStaffTargets,
  type StaffAuthorityViewer,
} from "./staff-authority";

export const KINDERGARTEN_VALUE_PDF_SCHOOL_IDS = [
  "kg-01",
  "kg-02",
  "kg-03",
  "kg-04",
] as const;

const KINDERGARTEN_VALUE_PDF_SCHOOL_ID_SET = new Set<string>(
  KINDERGARTEN_VALUE_PDF_SCHOOL_IDS,
);

/**
 * KG values assignments currently use subjectKey VALUES. assignmentKind
 * VALUES_TEACHER is also supported for assignments created through the newer
 * assignment form.
 */
export function hasActiveKindergartenValuesTeacherAssignment(params: {
  personId: string;
  assignments: readonly TeacherAssignment[];
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();

  return getActiveTeacherAssignmentsForActor({
    actorPersonId: params.personId,
    assignments: [...params.assignments],
    nowMs,
  }).some((assignment) => {
    const subjectKey = assignment.subjectKey.trim().toUpperCase();
    return (
      assignment.status === "ACTIVE" &&
      KINDERGARTEN_VALUE_PDF_SCHOOL_ID_SET.has(assignment.schoolId) &&
      (assignment.assignmentKind === "VALUES_TEACHER" || subjectKey === "VALUES")
    );
  });
}

export type StaffPdfFileViewer = StaffAuthorityViewer & {
  uid: string;
};

function getFileOwnerHomeSchoolIds(file: StaffPdfFile) {
  if (file.ownerMembershipSchoolIds.length > 0) {
    return file.ownerMembershipSchoolIds;
  }

  // Legacy records predate ownerMembershipSchoolIds. Keep them readable while
  // new uploads use the unambiguous membership/teaching-school snapshot.
  return file.ownerSchoolIds;
}

export function canBrowseStaffPdfFilesInScope(
  viewer: StaffPdfFileViewer,
  nowMs = Date.now(),
) {
  return canViewerBrowseStaffTargets(viewer, nowMs);
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

  return canViewerAccessTargetStaff({
    viewer,
    target: {
      personId: file.ownerPersonId,
      roles: file.ownerRoleKeys,
      homeSchoolIds: getFileOwnerHomeSchoolIds(file),
      authorityPersonIds: file.ownerAuthorityPersonIds,
    },
    nowMs,
  });
}
