import type {
  ClassSubjectModuleKey,
  ClassSubjectOffering,
  OperationKind,
  OperationScopeType,
  OperationSourceType,
  OperationTargetKind,
  TeacherAdditionalDuty,
  TeacherProvisioningAssignment,
  TeacherProvisioningBatchTeacher,
} from "@takween/contracts";

export type TeacherProvisioningSchoolPolicy = {
  allowedOperationKinds: OperationKind[];
  allowBusSupervision: boolean;
};

export type ResolvedTeacherAssignmentPlan = {
  id: string;

  teacherPersonId: string;
  teacherEmail: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;

  gradeId: string;
  classId: string;
  streamId: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  operationKinds: OperationKind[];

  active: boolean;
  managedBy: "TEACHER_PROVISIONING";
};

export type ResolvedTeacherClassLinkPlan = {
  id: string;
  teacherAssignmentId: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;

  gradeId: string;
  classId: string;
  streamId: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  active: boolean;
  managedBy: "TEACHER_PROVISIONING";
};

export type ResolvedTeacherOperationPlan = {
  id: string;

  operationKind: OperationKind;

  actorPersonId: string;
  actorRoleKey: TeacherProvisioningBatchTeacher["roleKey"];

  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;

  gradeId: string;
  classId: string;
  streamId: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  scopeType: OperationScopeType;
  scopeId: string;

  targetKind: OperationTargetKind;

  sourceType: OperationSourceType;
  sourceId: string;

  routeId: string;

  active: boolean;
  managedBy: "TEACHER_PROVISIONING";
};

export type ResolvedTeacherProvisioningPlan = {
  personId: string;
  identity: {
    
    displayName: string;
    email: string;
    roleKey: TeacherProvisioningBatchTeacher["roleKey"];
    title: string;
  };

  membership: {
    orgId: string;
    schoolId: string;

    roleKey: TeacherProvisioningBatchTeacher["roleKey"];
    title: string;

    scopeType: "SCHOOL";
    scopeId: string;

    schoolIds: string[];
    gradeIds: string[];
    classIds: string[];
    subjectKeys: string[];
  };

  teacherAssignments: ResolvedTeacherAssignmentPlan[];
  classLinks: ResolvedTeacherClassLinkPlan[];
  operationalAssignments: ResolvedTeacherOperationPlan[];

  additionalDuties: TeacherAdditionalDuty[];
};

export type ResolveTeacherProvisioningPlanInput = {
  orgId: string;
  schoolId: string;

  personId: string;

  teacher: TeacherProvisioningBatchTeacher;

  offerings: ClassSubjectOffering[];

  policy: TeacherProvisioningSchoolPolicy;
};

const MODULE_OPERATION_MAP: Partial<
  Record<ClassSubjectModuleKey, OperationKind>
> = {
  ASSESSMENTS: "STUDENT_MEASUREMENT",
  LEARNING_LOSS: "LEARNING_LOSS_FOLLOWUP",
  HOMEWORK: "STUDENT_HOMEWORK",
  LESSON_PREP: "LESSON_PREP",
  GAMIFICATION: "STUDENT_GAMIFICATION",
  VIRTUAL_CLASSES: "VIRTUAL_CLASS",
  NOTES: "STUDENT_NOTES",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildStableId(parts: string[]) {
  return parts
    .map((part) =>
      part
        .trim()
        .replaceAll("/", "-")
        .replace(/\s+/g, "-"),
    )
    .filter(Boolean)
    .join("__");
}

function assertOfferingMatchesAssignment(params: {
  orgId: string;
  schoolId: string;
  assignment: TeacherProvisioningAssignment;
  offering: ClassSubjectOffering;
}) {
  const { orgId, schoolId, assignment, offering } = params;

  if (offering.orgId !== orgId) {
    throw new Error(
      `المادة ${offering.id} لا تتبع المؤسسة ${orgId}`,
    );
  }

  if (offering.schoolId !== schoolId) {
    throw new Error(
      `المادة ${offering.id} لا تتبع المدرسة ${schoolId}`,
    );
  }

  if (offering.academicYearId !== assignment.academicYearId) {
    throw new Error(
      `السنة الدراسية غير متطابقة في الإسناد ${offering.id}`,
    );
  }

  if (offering.classId !== assignment.classId) {
    throw new Error(
      `الفصل غير متطابق في الإسناد ${offering.id}`,
    );
  }

  if (
    assignment.gradeId &&
    offering.gradeId &&
    offering.gradeId !== assignment.gradeId
  ) {
    throw new Error(
      `الصف غير متطابق في الإسناد ${offering.id}`,
    );
  }

  if (
    assignment.streamId &&
    offering.streamId &&
    offering.streamId !== assignment.streamId
  ) {
    throw new Error(
      `المسار غير متطابق في الإسناد ${offering.id}`,
    );
  }

  if (
    offering.subjectKey &&
    offering.subjectKey !== assignment.subjectKey
  ) {
    throw new Error(
      `المادة غير متطابقة في الإسناد ${offering.id}`,
    );
  }

  if (offering.status !== "ACTIVE" || offering.isArchived) {
    throw new Error(
      `المادة ${offering.id} ليست مفعّلة حاليًا`,
    );
  }
}

function resolveOfferingOperationKinds(params: {
  offering: ClassSubjectOffering;
  policy: TeacherProvisioningSchoolPolicy;
}) {
  const { offering, policy } = params;

  const candidates = new Set<OperationKind>();

  for (const moduleKey of offering.enabledModuleKeys) {
    const operationKind = MODULE_OPERATION_MAP[moduleKey];

    if (operationKind) {
      candidates.add(operationKind);
    }
  }

  if (
    offering.enabledModuleKeys.includes("ASSESSMENTS") &&
    offering.assessmentPolicy.trackerTemplateIds.length > 0
  ) {
    candidates.add("STUDENT_TRACKER");
  }

  if (
    !offering.assessmentPolicy.allowLearningLoss
  ) {
    candidates.delete("LEARNING_LOSS_FOLLOWUP");
  }

  if (!offering.curriculumPolicy.homeworkEnabled) {
    candidates.delete("STUDENT_HOMEWORK");
  }

  return Array.from(candidates).filter((operationKind) => {
    // حضور الطلاب المدرسي ممنوع للمعلم دائمًا.
    if (operationKind === "STUDENT_ATTENDANCE") {
      return false;
    }

    // حضور الباص لا يأتي من إسناد المادة.
    if (operationKind === "TRANSPORT_ATTENDANCE") {
      return false;
    }

    return policy.allowedOperationKinds.includes(operationKind);
  });
}

function resolveAssignment(params: {
  orgId: string;
  schoolId: string;
  personId: string;
  teacher: TeacherProvisioningBatchTeacher;
  assignment: TeacherProvisioningAssignment;
  offering: ClassSubjectOffering;
  policy: TeacherProvisioningSchoolPolicy;
}) {
  const {
    orgId,
    schoolId,
    personId,
    teacher,
    assignment,
    offering,
    policy,
  } = params;

  assertOfferingMatchesAssignment({
    orgId,
    schoolId,
    assignment,
    offering,
  });

  const teacherAssignmentId = buildStableId([
    "teacher-provisioning",
    personId,
    schoolId,
    assignment.academicYearId,
    assignment.termId,
    assignment.classSubjectOfferingId,
  ]);

  const operationKinds = resolveOfferingOperationKinds({
    offering,
    policy,
  });

  const teacherAssignment: ResolvedTeacherAssignmentPlan = {
    id: teacherAssignmentId,

    teacherPersonId: personId,
    teacherEmail: teacher.email,

    orgId,
    schoolId,
    academicYearId: assignment.academicYearId,
    termId: assignment.termId,

    gradeId: assignment.gradeId,
    classId: assignment.classId,
    streamId: assignment.streamId,

    subjectKey: assignment.subjectKey,
    classSubjectOfferingId:
      assignment.classSubjectOfferingId,

    operationKinds,

    active: true,
    managedBy: "TEACHER_PROVISIONING",
  };

  const classLink: ResolvedTeacherClassLinkPlan = {
    id: buildStableId([
      teacherAssignmentId,
      "class-link",
      assignment.classId,
    ]),

    teacherAssignmentId,

    orgId,
    schoolId,
    academicYearId: assignment.academicYearId,
    termId: assignment.termId,

    gradeId: assignment.gradeId,
    classId: assignment.classId,
    streamId: assignment.streamId,

    subjectKey: assignment.subjectKey,
    classSubjectOfferingId:
      assignment.classSubjectOfferingId,

    active: true,
    managedBy: "TEACHER_PROVISIONING",
  };

  const operations: ResolvedTeacherOperationPlan[] =
    operationKinds.map((operationKind) => ({
      id: buildStableId([
        "teacher-provisioning",
        personId,
        schoolId,
        assignment.academicYearId,
        assignment.termId,
        assignment.classSubjectOfferingId,
        operationKind,
      ]),

      operationKind,

      actorPersonId: personId,
      actorRoleKey: teacher.roleKey,

      orgId,
      schoolId,
      academicYearId: assignment.academicYearId,
      termId: assignment.termId,

      gradeId: assignment.gradeId,
      classId: assignment.classId,
      streamId: assignment.streamId,

      subjectKey: assignment.subjectKey,
      classSubjectOfferingId:
        assignment.classSubjectOfferingId,

      scopeType: "CLASS",
      scopeId: assignment.classId,

      targetKind: "CLASS",

      sourceType: "TEACHER_ASSIGNMENT",
      sourceId: teacherAssignmentId,

      routeId: "",

      active: true,
      managedBy: "TEACHER_PROVISIONING",
    }));

  return {
    teacherAssignment,
    classLink,
    operations,
  };
}

function resolveBusOperations(params: {
  orgId: string;
  schoolId: string;
  personId: string;
  teacher: TeacherProvisioningBatchTeacher;
  policy: TeacherProvisioningSchoolPolicy;
}) {
  const {
    orgId,
    schoolId,
    personId,
    teacher,
    policy,
  } = params;

  return teacher.additionalDuties.flatMap(
    (duty): ResolvedTeacherOperationPlan[] => {
      if (duty.dutyKey !== "BUS_SUPERVISOR") {
        return [];
      }

      if (!policy.allowBusSupervision) {
        throw new Error(
          `المعلم ${teacher.email} مسند له إشراف باص لكن سياسة المدرسة لا تسمح بذلك`,
        );
      }

      return [
        {
          id: buildStableId([
            "teacher-provisioning",
            personId,
            schoolId,
            "route",
            duty.routeId,
            "TRANSPORT_ATTENDANCE",
          ]),

          operationKind: "TRANSPORT_ATTENDANCE",

          actorPersonId: personId,
          actorRoleKey: teacher.roleKey,

          orgId,
          schoolId,
          academicYearId: "",
          termId: "",

          gradeId: "",
          classId: "",
          streamId: "",

          subjectKey: "",
          classSubjectOfferingId: "",

          scopeType: "ROUTE",
          scopeId: duty.routeId,

          targetKind: "ROUTE",

          sourceType: "OPERATIONAL_ASSIGNMENT",
          sourceId: "",

          routeId: duty.routeId,

          active: true,
          managedBy: "TEACHER_PROVISIONING",
        },
      ];
    },
  );
}

export function resolveTeacherProvisioningPlan(
  input: ResolveTeacherProvisioningPlanInput,
): ResolvedTeacherProvisioningPlan {
  const offeringMap = new Map(
    input.offerings.map((offering) => [
      offering.id,
      offering,
    ]),
  );

  const resolvedAssignments = input.teacher.assignments.map(
    (assignment) => {
      const offering = offeringMap.get(
        assignment.classSubjectOfferingId,
      );

      if (!offering) {
        throw new Error(
          `لم يتم العثور على classSubjectOffering: ${assignment.classSubjectOfferingId}`,
        );
      }

      return resolveAssignment({
        orgId: input.orgId,
        schoolId: input.schoolId,
        personId: input.personId,
        teacher: input.teacher,
        assignment,
        offering,
        policy: input.policy,
      });
    },
  );

  const teacherAssignments = resolvedAssignments.map(
    (item) => item.teacherAssignment,
  );

  const classLinks = resolvedAssignments.map(
    (item) => item.classLink,
  );

  const subjectOperations = resolvedAssignments.flatMap(
    (item) => item.operations,
  );

  const busOperations = resolveBusOperations({
    orgId: input.orgId,
    schoolId: input.schoolId,
    personId: input.personId,
    teacher: input.teacher,
    policy: input.policy,
  });

  return {
    personId: input.personId,
    identity: {
      displayName: input.teacher.displayName,
      email: input.teacher.email,
      roleKey: input.teacher.roleKey,
      title: input.teacher.title,
    },

    membership: {
      orgId: input.orgId,
      schoolId: input.schoolId,

      roleKey: input.teacher.roleKey,
      title: input.teacher.title,

      scopeType: "SCHOOL",
      scopeId: input.schoolId,

      schoolIds: [input.schoolId],

      gradeIds: unique(
        input.teacher.assignments.map(
          (assignment) => assignment.gradeId,
        ),
      ),

      classIds: unique(
        input.teacher.assignments.map(
          (assignment) => assignment.classId,
        ),
      ),

      subjectKeys: unique(
        input.teacher.assignments.map(
          (assignment) => assignment.subjectKey,
        ),
      ),
    },

    teacherAssignments,
    classLinks,

    operationalAssignments: [
      ...subjectOperations,
      ...busOperations,
    ],

    additionalDuties: input.teacher.additionalDuties,
  };
}