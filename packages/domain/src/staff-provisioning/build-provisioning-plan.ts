import {
  StaffProvisioningInputSchema,
  type Membership,
  type OperationalAssignment,
  type Person,
  type StaffProvisioningInput,
} from "@takween/contracts";

import { getStaffProvisioningRoleProfile } from "./role-profile-registry";

export type BuildStaffProvisioningPlanInput = {
  input: StaffProvisioningInput;
  uid: string;
  personId: string;
};

export type StaffProvisioningPlan = {
  userProfile: {
    uid: string;
    displayName: string;
    email: string;
    phone?: string;
    personId: string;
    isDisabled: false;
  };

  person: Person;
  membership: Membership;
  operationalAssignments: OperationalAssignment[];
};

function requireNonEmpty(value: string, fieldName: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} مطلوب لبناء خطة تجهيز الموظف`);
  }

  return normalized;
}

function uniqueNonEmptyStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function resolveEffectiveSchoolIds(input: StaffProvisioningInput) {
  const schoolIds = uniqueNonEmptyStrings([input.schoolId, ...input.schoolIds]);

  if (schoolIds.length === 0) {
    throw new Error(
      [
        "لم يتم حل نطاق المدارس قبل بناء خطة تجهيز الموظف.",
        "يجب تحويل scopeGroupIds إلى schoolIds داخل طبقة Functions أولًا.",
      ].join(" "),
    );
  }

  return schoolIds;
}

function buildOperationalAssignmentId(params: {
  personId: string;
  schoolId: string;
  operationKind: string;
}) {
  return [
    "staff-provisioning",
    params.personId,
    params.schoolId,
    params.operationKind,
  ].join("__");
}

export function buildStaffProvisioningPlan(
  params: BuildStaffProvisioningPlanInput,
): StaffProvisioningPlan {
  const input = StaffProvisioningInputSchema.parse(params.input);

  const uid = requireNonEmpty(params.uid, "uid");
  const personId = requireNonEmpty(params.personId, "personId");

  const profile = getStaffProvisioningRoleProfile(input.roleKey);

  const schoolIds = resolveEffectiveSchoolIds(input);

  /*
   * المدرسة الأساسية مطلوبة للتوافق مع الأكواد القديمة
   * التي ما زالت تقرأ membership.scopeId.
   *
   * الصلاحية الفعلية تعتمد على scopes.schoolIds.
   */
  const primarySchoolId = input.schoolId.trim() || schoolIds[0];

  const principalPersonId =
    profile.hierarchy.principalPersonIdSource === "SELF"
      ? personId
      : profile.hierarchy.principalPersonIdSource === "INPUT_REQUIRED"
        ? requireNonEmpty(input.principalPersonId, "principalPersonId")
        : "";

  const person: Person = {
    id: personId,
    displayName: input.displayName,
    email: input.email,

    ...(input.nationalId ? { nationalId: input.nationalId } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
  };

  const membership: Membership = {
    id: input.orgId,

    uid,
    personId,
    orgId: input.orgId,

    role: profile.roleKey,
    roleKey: profile.roleKey,

    title: input.title,
    department: "الإشراف والإدارة التعليمية",

    scopeType: profile.scope.scopeType,
    scopeId: primarySchoolId,

    scopes: {
      schoolIds,
      scopeGroupIds: uniqueNonEmptyStrings(input.scopeGroupIds),

      gradeIds: [],
      classIds: [],
      subjectKeys: [],
      routeIds: [],

      canAccessAllSchools: profile.scope.canAccessAllSchools,
    },

    permissions: profile.permissions,

    directEvaluatorPersonId: "",
    supervisorPersonId: "",
    managerPersonId: "",
    principalPersonId,
    vicePrincipalPersonId: "",

    isActive: true,
  };

  /*
   * كل عملية تشغيلية تُنشأ مرة مستقلة لكل مدرسة،
   * حتى تظل التقييمات والتقارير والمهام مفصولة بواسطة schoolId.
   */
  const operationalAssignments: OperationalAssignment[] = schoolIds.flatMap(
    (schoolId) =>
      profile.operations.map((operation) => ({
        id: buildOperationalAssignmentId({
          personId,
          schoolId,
          operationKind: operation.operationKind,
        }),

        orgId: input.orgId,
        schoolId,

        // إسنادات الإداريين والمشرفين على مستوى المدرسة.
        academicYearId: "",
        termId: "",

        gradeId: "",
        classId: "",

        subjectKey: "",
        classSubjectOfferingId: "",

        title: operation.title,
        description: operation.description ?? "",

        status: "ACTIVE",
        isActive: true,

        actorPersonId: personId,
        actorMembershipId: "",
        actorRoleKey: profile.roleKey,

        operationKind: operation.operationKind,

        scopeType: profile.scope.scopeType,
        scopeId: schoolId,
        scopeLabel: schoolId,

        coverageMode: operation.coverageMode,

        targetKind: operation.targetKind,
        targetPersonIds: [],
        targetStudentIds: [],
        targetClassIds: [],
        targetGradeIds: [],
        targetRouteIds: [],
        targetRoleKeys: [],

        permissions: operation.permissions,

        sourceTeacherAssignmentId: "",
        sourceMembershipId: "",

        note: "تم إنشاؤه بواسطة Staff Provisioning Engine",
      })),
  );

  return {
    userProfile: {
      uid,
      displayName: input.displayName,
      email: input.email,
      ...(input.phone ? { phone: input.phone } : {}),
      personId,
      isDisabled: false,
    },

    person,
    membership,
    operationalAssignments,
  };
}
