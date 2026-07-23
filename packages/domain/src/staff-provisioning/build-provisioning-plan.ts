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
    department: "إدارة المدرسة",

    scopeType: profile.scope.scopeType,
    scopeId: input.schoolId,

    scopes: {
      schoolIds: [input.schoolId],
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
    principalPersonId: personId,
    vicePrincipalPersonId: "",

    isActive: true,
  };

  const operationalAssignments: OperationalAssignment[] =
    profile.operations.map((operation) => ({
      id: buildOperationalAssignmentId({
        personId,
        schoolId: input.schoolId,
        operationKind: operation.operationKind,
      }),

      orgId: input.orgId,

      title: operation.title,
      description: operation.description ?? "",

      status: "ACTIVE",
      isActive: true,

      actorPersonId: personId,
      actorMembershipId: "",
      actorRoleKey: profile.roleKey,

      operationKind: operation.operationKind,

      scopeType: profile.scope.scopeType,
      scopeId: input.schoolId,
      scopeLabel: input.schoolId,

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
    }));

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