import {
  OperationalAssignmentSchema,
  TeacherAssignmentClassLinkSchema,
  TeacherAssignmentSchema,
  type OperationKind,
  type OperationalAssignment,
  type TeacherAssignment,
  type TeacherAssignmentClassLink,
} from "@takween/contracts";

import type {
  ResolvedTeacherProvisioningPlan,
} from "@takween/domain";

export type TeacherProvisioningFirestorePlan = {
  teacherAssignments: TeacherAssignment[];
  classLinks: TeacherAssignmentClassLink[];
  operationalAssignments: OperationalAssignment[];
};

const OPERATION_TITLES: Partial<Record<OperationKind, string>> = {
  STUDENT_MEASUREMENT: "قياسات الطلاب",
  STUDENT_TRACKER: "متابعة الطلاب",
  LEARNING_LOSS_FOLLOWUP: "متابعة الفاقد التعليمي",
  STUDENT_HOMEWORK: "واجبات الطلاب",
  LESSON_PREP: "تحضير الدروس",
  STUDENT_NOTES: "ملاحظات الطلاب",
  STUDENT_GAMIFICATION: "تحفيز الطلاب",
  VIRTUAL_CLASS: "الفصول الافتراضية",
  TRANSPORT_ATTENDANCE: "متابعة حضور الباص",
};

function buildHomeroomAssignmentId(params: {
  personId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
}) {
  return [
    "teacher-provisioning",
    params.personId,
    params.schoolId,
    params.academicYearId,
    params.termId,
    "homeroom",
    params.classId,
  ].join("__");
}

export function mapTeacherPlanToFirestore(
  plan: ResolvedTeacherProvisioningPlan,
  now = Date.now(),
): TeacherProvisioningFirestorePlan {
  const forbiddenAttendance =
    plan.operationalAssignments.find(
      (assignment) =>
        assignment.operationKind ===
        "STUDENT_ATTENDANCE",
    );

  if (forbiddenAttendance) {
    throw new Error(
      "لا يجوز منح المعلم عملية حضور الطلاب المدرسي",
    );
  }

  const subjectTeacherAssignments =
    plan.teacherAssignments.map((assignment) =>
      TeacherAssignmentSchema.parse({
        id: assignment.id,

        orgId: assignment.orgId,
        schoolId: assignment.schoolId,
        academicYearId: assignment.academicYearId,
        termId: assignment.termId,

        teacherPersonId:
          assignment.teacherPersonId,

        supervisorPersonId: "",

        assignmentKind: "SUBJECT_TEACHER",

        targetScopeType: "CLASS",
        targetScopeId: assignment.classId,

        coverageMode: "EXPLICIT_CLASSES",

        subjectKey: assignment.subjectKey,
        subjectId: "",

        classSubjectOfferingId:
          assignment.classSubjectOfferingId,

        gradeId: assignment.gradeId,
        streamId: assignment.streamId,

        isHomeroom: false,
        roleInAssignment: "MAIN",

        status: "ACTIVE",
        startAt: now,

        note:
          "تم إنشاؤه بواسطة Teacher Provisioning Engine",
      }),
    );

  const subjectClassLinks =
    plan.classLinks.map((link) =>
      TeacherAssignmentClassLinkSchema.parse({
        id: link.id,

        assignmentId:
          link.teacherAssignmentId,

        orgId: link.orgId,
        schoolId: link.schoolId,
        academicYearId: link.academicYearId,
        termId: link.termId,

        classId: link.classId,
        gradeId: link.gradeId,
        streamId: link.streamId,

        classSubjectOfferingId:
          link.classSubjectOfferingId,

        order: 0,
        isPrimaryClass: true,
      }),
    );

  const homeroomTeacherAssignments: TeacherAssignment[] =
    [];

  const homeroomClassLinks: TeacherAssignmentClassLink[] =
    [];

  for (const duty of plan.additionalDuties) {
    if (duty.dutyKey !== "HOMEROOM_TEACHER") {
      continue;
    }

    const assignmentId =
      buildHomeroomAssignmentId({
        personId: plan.personId,
        schoolId: plan.membership.schoolId,
        academicYearId: duty.academicYearId,
        termId: duty.termId,
        classId: duty.classId,
      });

    homeroomTeacherAssignments.push(
      TeacherAssignmentSchema.parse({
        id: assignmentId,

        orgId: plan.membership.orgId,
        schoolId: plan.membership.schoolId,
        academicYearId: duty.academicYearId,
        termId: duty.termId,

        teacherPersonId: plan.personId,
        supervisorPersonId: "",

        assignmentKind: "CLASS_TEACHER",

        targetScopeType: "CLASS",
        targetScopeId: duty.classId,

        coverageMode: "EXPLICIT_CLASSES",

        subjectKey: "GENERAL",
        subjectId: "",
        classSubjectOfferingId: "",

        gradeId: duty.gradeId,
        streamId: "",

        isHomeroom: true,
        roleInAssignment: "MAIN",

        status: "ACTIVE",
        startAt: now,

        note:
          "تكليف اختياري كرائد فصل بواسطة Teacher Provisioning Engine",
      }),
    );

    homeroomClassLinks.push(
      TeacherAssignmentClassLinkSchema.parse({
        id: `${assignmentId}__class-link__${duty.classId}`,

        assignmentId,

        orgId: plan.membership.orgId,
        schoolId: plan.membership.schoolId,
        academicYearId: duty.academicYearId,
        termId: duty.termId,

        classId: duty.classId,
        gradeId: duty.gradeId,
        streamId: "",

        classSubjectOfferingId: "",

        order: 0,
        isPrimaryClass: true,
      }),
    );
  }

  const operationalAssignments =
    plan.operationalAssignments.map((assignment) => {
      const routeScoped =
        assignment.scopeType === "ROUTE";

      return OperationalAssignmentSchema.parse({
        id: assignment.id,

        orgId: assignment.orgId,
        schoolId: assignment.schoolId,
        academicYearId: assignment.academicYearId,
        termId: assignment.termId,

        gradeId: assignment.gradeId,
        classId: assignment.classId,

        subjectKey: assignment.subjectKey,
        classSubjectOfferingId:
          assignment.classSubjectOfferingId,

        title:
          OPERATION_TITLES[
            assignment.operationKind
          ] ?? assignment.operationKind,

        description: routeScoped
          ? "إسناد إشراف على مسار باص محدد"
          : "إسناد تشغيل مرتبط بفصل ومادة محددين",

        status: "ACTIVE",
        isActive: true,
        startAt: now,

        actorPersonId:
          assignment.actorPersonId,

        actorMembershipId: "",
        actorRoleKey:
          assignment.actorRoleKey,

        operationKind:
          assignment.operationKind,

        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,

        scopeLabel:
          assignment.classSubjectOfferingId ||
          assignment.routeId ||
          assignment.scopeId,

        coverageMode: routeScoped
          ? "EXPLICIT_ROUTES"
          : "SINGLE_SCOPE",

        targetKind: assignment.targetKind,

        targetPersonIds: [],
        targetStudentIds: [],

        targetClassIds:
          assignment.classId
            ? [assignment.classId]
            : [],

        targetGradeIds:
          assignment.gradeId
            ? [assignment.gradeId]
            : [],

        targetRouteIds:
          assignment.routeId
            ? [assignment.routeId]
            : [],

        targetRoleKeys: [],

        permissions: [
          "VIEW",
          "CREATE",
          "UPDATE_DRAFT",
          "SUBMIT",
        ],

        sourceTeacherAssignmentId:
          assignment.sourceType ===
          "TEACHER_ASSIGNMENT"
            ? assignment.sourceId
            : "",

        sourceMembershipId: "",

        note:
          "تم إنشاؤه بواسطة Teacher Provisioning Engine",
      });
    });

  return {
    teacherAssignments: [
      ...subjectTeacherAssignments,
      ...homeroomTeacherAssignments,
    ],

    classLinks: [
      ...subjectClassLinks,
      ...homeroomClassLinks,
    ],

    operationalAssignments,
  };
}