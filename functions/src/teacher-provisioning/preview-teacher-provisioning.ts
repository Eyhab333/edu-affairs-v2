import { getFirestore } from "firebase-admin/firestore";

import {
  ClassSubjectOfferingSchema,
  TeacherProvisioningBatchTeacherSchema,
  type ClassSubjectOffering,
  type TeacherProvisioningBatchTeacher,
} from "@takween/contracts";

import {
  resolveTeacherProvisioningPlan,
  type ResolvedTeacherProvisioningPlan,
  type TeacherProvisioningSchoolPolicy,
} from "@takween/domain";

import {
  resolveProvisioningIdentity,
  type StaffProvisioningIdentityResolution,
} from "../staff-provisioning/resolve-staff-provisioning-identity";

export type PreviewTeacherProvisioningInput = {
  orgId: string;
  schoolId: string;
  teacher: TeacherProvisioningBatchTeacher;
};

export type TeacherProvisioningPreviewStatus =
  | "READY_TO_CREATE"
  | "READY_TO_UPDATE";

export type TeacherProvisioningPreview = {
  status: TeacherProvisioningPreviewStatus;

  identity: StaffProvisioningIdentityResolution;

  pendingAuthCreation: boolean;
  pendingPersonCreation: boolean;

  offerings: ClassSubjectOffering[];

  plan: ResolvedTeacherProvisioningPlan;
};

const DEFAULT_TEACHER_SCHOOL_POLICY: TeacherProvisioningSchoolPolicy = {
  allowedOperationKinds: [
    "STUDENT_MEASUREMENT",
    "STUDENT_TRACKER",
    "LEARNING_LOSS_FOLLOWUP",
    "STUDENT_HOMEWORK",
    "LESSON_PREP",
    "STUDENT_NOTES",
    "STUDENT_GAMIFICATION",
    "STUDENT_CASE_REFERRAL",
    "VIRTUAL_CLASS",
  ],

  allowBusSupervision: true,
};

async function loadTeacherOfferings(params: {
  orgId: string;
  schoolId: string;
  teacher: TeacherProvisioningBatchTeacher;
}): Promise<ClassSubjectOffering[]> {
  const db = getFirestore();

  const offeringIds = Array.from(
    new Set(
      params.teacher.assignments.map(
        (assignment) => assignment.classSubjectOfferingId,
      ),
    ),
  );

  const references = offeringIds.map((offeringId) =>
    db.doc(
      `orgs/${params.orgId}/classSubjectOfferings/${offeringId}`,
    ),
  );

  const snapshots = await db.getAll(...references);

  return snapshots.map((snapshot, index) => {
    const expectedOfferingId = offeringIds[index];

    if (!snapshot.exists) {
      throw new Error(
        `لم يتم العثور على classSubjectOffering: ${expectedOfferingId}`,
      );
    }

    const offering = ClassSubjectOfferingSchema.parse({
      id: snapshot.id,
      ...snapshot.data(),
    });

    if (offering.schoolId !== params.schoolId) {
      throw new Error(
        `classSubjectOffering ${offering.id} لا يتبع المدرسة ${params.schoolId}`,
      );
    }

    return offering;
  });
}

export async function previewTeacherProvisioning(
  rawInput: PreviewTeacherProvisioningInput,
): Promise<TeacherProvisioningPreview> {
  const orgId = rawInput.orgId.trim();
  const schoolId = rawInput.schoolId.trim();

  if (!orgId) {
    throw new Error("orgId مطلوب");
  }

  if (!schoolId) {
    throw new Error("schoolId مطلوب");
  }

  const teacher = TeacherProvisioningBatchTeacherSchema.parse(
    rawInput.teacher,
  );

  const identity = await resolveProvisioningIdentity({
    orgId,
    email: teacher.email,
    nationalId: teacher.nationalId,
  });

  const offerings = await loadTeacherOfferings({
    orgId,
    schoolId,
    teacher,
  });

  const pendingAuthCreation = !identity.authExists;
  const pendingPersonCreation = !identity.personExists;

  const personId =
    identity.personId || "__PENDING_TEACHER_PERSON_ID__";

  const plan = resolveTeacherProvisioningPlan({
    orgId,
    schoolId,
    personId,
    teacher,
    offerings,
    policy: DEFAULT_TEACHER_SCHOOL_POLICY,
  });

  return {
    status: identity.authExists
      ? "READY_TO_UPDATE"
      : "READY_TO_CREATE",

    identity,

    pendingAuthCreation,
    pendingPersonCreation,

    offerings,
    plan,
  };
}
