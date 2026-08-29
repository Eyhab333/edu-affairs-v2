import type {
  ClassSubjectOffering,
  MembershipRole,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";
import { buildClassSubjectWorkspaces } from "@takween/domain";

export type LessonPrepWorkspaceActor = {
  uid?: string;
  personId?: string;
  roles?: MembershipRole[];
  classSubjectOfferings?: ClassSubjectOffering[];
  teacherAssignments?: TeacherAssignment[];
  teacherAssignmentClassLinks?: TeacherAssignmentClassLink[];
};

export function hasActiveLessonPrepWorkspaceAccess(params: {
  actor: LessonPrepWorkspaceActor | null;
  classId: string;
  offeringId: string;
  schoolId: string | null;
  academicYearId: string | null;
  termId: string | null;
}): boolean {
  const actorPersonId = params.actor?.personId || params.actor?.uid || "";

  if (
    !params.actor ||
    !actorPersonId ||
    !params.classId ||
    !params.offeringId ||
    !params.schoolId ||
    !params.academicYearId ||
    !params.termId
  ) {
    return false;
  }

  const workspace = buildClassSubjectWorkspaces({
    actorPersonId,
    actorRoleKeys: params.actor.roles ?? [],
    allowAdminOverride: true,
    classId: params.classId,
    classSubjectOfferings: params.actor.classSubjectOfferings ?? [],
    teacherAssignments: params.actor.teacherAssignments ?? [],
    teacherAssignmentClassLinks:
      params.actor.teacherAssignmentClassLinks ?? [],
    includeInactiveOfferingsForAdmins: false,
  }).find((item) => item.offeringId === params.offeringId);

  if (
    !workspace ||
    workspace.schoolId !== params.schoolId ||
    workspace.academicYearId !== params.academicYearId
  ) {
    return false;
  }

  if (workspace.canManageOffering) return true;

  return workspace.teacherAssignmentIds.some((assignmentId) => {
    const assignment = params.actor?.teacherAssignments?.find(
      (item) => item.id === assignmentId,
    );

    return Boolean(
      assignment && (!assignment.termId || assignment.termId === params.termId),
    );
  });
}
