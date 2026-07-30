import { randomBytes } from "node:crypto";

import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  TeacherProvisioningBatchTeacherSchema,
  type TeacherProvisioningBatchTeacher,
} from "@takween/contracts";

import { mapTeacherPlanToFirestore } from "./map-teacher-plan-to-firestore";
import { previewTeacherProvisioning } from "./preview-teacher-provisioning";

export const TEACHER_PROVISIONING_SOURCE =
  "TEACHER_PROVISIONING_ENGINE";

const TEACHER_PROVISIONING_VERSION = 1;

const ALLOWED_EXISTING_TEACHER_ROLE_KEYS = new Set([
  "teacher",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

const DEFAULT_TEACHER_PERMISSIONS = {
  manageDisplay: false,
  manageEvaluations: false,
  manageSubjects: false,
  manageAssignments: false,
  manageCases: false,
  manageDirectory: false,
  manageClasses: false,
  sendNotifications: false,
  manageOrg: false,
  manageSchools: false,
  manageUsers: false,
};

export type ApplyTeacherProvisioningInput = {
  orgId: string;
  schoolId: string;
  teacher: TeacherProvisioningBatchTeacher;
};

export type ApplyTeacherProvisioningResult = {
  uid: string;
  personId: string;

  authAction:
    | "CREATED"
    | "REUSED"
    | "REACTIVATED";

  initialPassword?: string;

  membershipPath: string;

  teacherAssignmentIds: string[];
  classLinkIds: string[];
  operationalAssignmentIds: string[];

  endedLegacyTeacherAssignmentIds: string[];
  alreadyEndedLegacyTeacherAssignmentIds: string[];
};

function generateTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}Aa1!`;
}

function existingNumber(
  snapshot: DocumentSnapshot,
  field: string,
  fallback: number,
) {
  const value = snapshot.data()?.[field];

  return typeof value === "number"
    ? value
    : fallback;
}

async function ensureProvisioningScopeExists(params: {
  orgId: string;
  schoolId: string;
}) {
  const db = getFirestore();

  const [orgSnapshot, schoolSnapshot] =
    await Promise.all([
      db.doc(`orgs/${params.orgId}`).get(),

      db
        .doc(
          `orgs/${params.orgId}/schools/${params.schoolId}`,
        )
        .get(),
    ]);

  if (!orgSnapshot.exists) {
    throw new Error(
      `المؤسسة غير موجودة: ${params.orgId}`,
    );
  }

  if (!schoolSnapshot.exists) {
    throw new Error(
      `المدرسة غير موجودة: ${params.schoolId}`,
    );
  }
}

export async function applyTeacherProvisioning(
  rawInput: ApplyTeacherProvisioningInput,
): Promise<ApplyTeacherProvisioningResult> {
  const orgId = rawInput.orgId.trim();
  const schoolId = rawInput.schoolId.trim();

  if (!orgId) {
    throw new Error("orgId مطلوب");
  }

  if (!schoolId) {
    throw new Error("schoolId مطلوب");
  }

  const teacher =
    TeacherProvisioningBatchTeacherSchema.parse(
      rawInput.teacher,
    );

  await ensureProvisioningScopeExists({
    orgId,
    schoolId,
  });

  /*
   * المعاينة الأولى تتحقق من:
   * - الهوية الحالية
   * - ClassSubjectOfferings
   * - صحة خطة الإسناد
   *
   * ولا تكتب شيئًا.
   */
  const initialPreview =
    await previewTeacherProvisioning({
      orgId,
      schoolId,
      teacher,
    });

  const auth = getAuth();

  let authUser =
    initialPreview.identity.authUser;

  let authAction: ApplyTeacherProvisioningResult["authAction"] =
    "REUSED";

  let initialPassword: string | undefined;

  if (!authUser) {
    initialPassword =
      generateTemporaryPassword();

    authUser = await auth.createUser({
      email: teacher.email,
      displayName: teacher.displayName,
      password: initialPassword,
      disabled: false,
      emailVerified: false,
    });

    authAction = "CREATED";
  } else {
    const shouldReactivate = authUser.disabled;

    if (
      shouldReactivate ||
      authUser.displayName !== teacher.displayName
    ) {
      authUser = await auth.updateUser(
        authUser.uid,
        {
          displayName: teacher.displayName,
          disabled: false,
        },
      );
    }

    if (shouldReactivate) {
      authAction = "REACTIVATED";
    }
  }

  /*
   * نعيد المعاينة بعد ضمان وجود Auth؛
   * حتى تحصل الخطة على uid/personId الحقيقيين
   * بدل قيم PENDING.
   */
  const preview =
    await previewTeacherProvisioning({
      orgId,
      schoolId,
      teacher,
    });

  if (
    !preview.identity.uid ||
    preview.identity.uid !== authUser.uid
  ) {
    throw new Error(
      "فشل تثبيت هوية المعلم بعد تجهيز Firebase Auth",
    );
  }

  const uid = authUser.uid;
  const personId = preview.plan.personId;

  const firestorePlan =
    mapTeacherPlanToFirestore(preview.plan);

  const db = getFirestore();
  const now = Date.now();

  const userRef = db.doc(`users/${uid}`);

  const personRef = db.doc(
    `orgs/${orgId}/people/${personId}`,
  );

  const membershipRef = db.doc(
    `users/${uid}/orgMemberships/${orgId}`,
  );

  const teacherAssignmentCollection =
    db.collection(
      `orgs/${orgId}/teacherAssignments`,
    );

  const classLinkCollection =
    db.collection(
      `orgs/${orgId}/teacherAssignmentClassLinks`,
    );

  const operationalAssignmentCollection =
    db.collection(
      `orgs/${orgId}/operationalAssignments`,
    );

  const teacherAssignmentRefs =
    firestorePlan.teacherAssignments.map(
      (assignment) =>
        teacherAssignmentCollection.doc(
          assignment.id,
        ),
    );

  const classLinkRefs =
    firestorePlan.classLinks.map((link) =>
      classLinkCollection.doc(link.id),
    );

  const operationalAssignmentRefs =
    firestorePlan.operationalAssignments.map(
      (assignment) =>
        operationalAssignmentCollection.doc(
          assignment.id,
        ),
    );

  const legacyAssignmentRefs =
    teacher.legacyTeacherAssignmentIdsToEnd.map(
      (assignmentId) =>
        teacherAssignmentCollection.doc(
          assignmentId,
        ),
    );

  const desiredTeacherAssignmentIds =
    new Set(
      firestorePlan.teacherAssignments.map(
        (assignment) => assignment.id,
      ),
    );

  const endedLegacyTeacherAssignmentIds: string[] =
    [];

  const alreadyEndedLegacyTeacherAssignmentIds: string[] =
    [];

  await db.runTransaction(async (transaction) => {
    /*
     * جميع القراءات أولًا قبل أي كتابة.
     */
    const userSnapshot =
      await transaction.get(userRef);

    const personSnapshot =
      await transaction.get(personRef);

    const membershipSnapshot =
      await transaction.get(membershipRef);

    const teacherAssignmentSnapshots: DocumentSnapshot[] =
      [];

    for (const reference of teacherAssignmentRefs) {
      teacherAssignmentSnapshots.push(
        await transaction.get(reference),
      );
    }

    const classLinkSnapshots: DocumentSnapshot[] =
      [];

    for (const reference of classLinkRefs) {
      classLinkSnapshots.push(
        await transaction.get(reference),
      );
    }

    const operationalAssignmentSnapshots: DocumentSnapshot[] =
      [];

    for (
      const reference of operationalAssignmentRefs
    ) {
      operationalAssignmentSnapshots.push(
        await transaction.get(reference),
      );
    }

    const legacyAssignmentSnapshots: DocumentSnapshot[] =
      [];

    for (const reference of legacyAssignmentRefs) {
      legacyAssignmentSnapshots.push(
        await transaction.get(reference),
      );
    }

    /*
     * لا نسمح لمحرك المعلمين باستبدال عضوية إدارية.
     * العضوية القديمة teacher مسموح بترقيتها
     * إلى BOYS_TEACHER أو ما يماثله.
     */
    if (membershipSnapshot.exists) {
      const currentRoleKey =
        membershipSnapshot.data()?.roleKey;

      if (
        typeof currentRoleKey === "string" &&
        currentRoleKey &&
        !ALLOWED_EXISTING_TEACHER_ROLE_KEYS.has(
          currentRoleKey,
        )
      ) {
        throw new Error(
          [
            "لا يمكن استبدال عضوية غير تعليمية بمحرك المعلمين.",
            `roleKey الحالي: ${currentRoleKey}`,
            `personId: ${personId}`,
          ].join(" "),
        );
      }
    }

    /*
     * تحقق صارم من الإسنادات القديمة المذكورة صراحة.
     */
    legacyAssignmentSnapshots.forEach(
      (snapshot, index) => {
        const assignmentId =
          teacher.legacyTeacherAssignmentIdsToEnd[
            index
          ];

        if (!assignmentId) {
          throw new Error(
            "تعذر تحديد معرف الإسناد القديم",
          );
        }

        if (!snapshot.exists) {
          throw new Error(
            `الإسناد القديم غير موجود: ${assignmentId}`,
          );
        }

        if (
          desiredTeacherAssignmentIds.has(
            assignmentId,
          )
        ) {
          throw new Error(
            `لا يمكن إنشاء وإنهاء نفس الإسناد: ${assignmentId}`,
          );
        }

        const data = snapshot.data();

        if (
          data?.teacherPersonId !== personId
        ) {
          throw new Error(
            `الإسناد القديم ${assignmentId} لا يخص المعلم ${personId}`,
          );
        }

        if (data?.schoolId !== schoolId) {
          throw new Error(
            `الإسناد القديم ${assignmentId} لا يتبع المدرسة ${schoolId}`,
          );
        }
      },
    );

    transaction.set(
      userRef,
      {
        id: uid,
        uid,
        personId,

        displayName: teacher.displayName,
        email: teacher.email,

        isDisabled: false,

        createdAt: existingNumber(
          userSnapshot,
          "createdAt",
          now,
        ),

        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      personRef,
      {
        id: personId,

        displayName: teacher.displayName,
        email: teacher.email,

        ...(teacher.nationalId
          ? {
              nationalId:
                teacher.nationalId,
            }
          : {}),

        ...(teacher.phone
          ? {
              phone: teacher.phone,
            }
          : {}),

        createdAt: existingNumber(
          personSnapshot,
          "createdAt",
          now,
        ),

        updatedAt: now,
      },
      { merge: true },
    );

    const currentPermissions =
      membershipSnapshot.data()?.permissions;

    const routeIds = Array.from(
      new Set(
        teacher.additionalDuties.flatMap(
          (duty) =>
            duty.dutyKey ===
            "BUS_SUPERVISOR"
              ? [duty.routeId]
              : [],
        ),
      ),
    );

    transaction.set(
      membershipRef,
      {
        id: orgId,

        uid,
        personId,
        orgId,

        role: "teacher",
        roleKey:
          preview.plan.membership.roleKey,

        title:
          preview.plan.membership.title,

        department: "التعليم",

        scopeType:
          preview.plan.membership.scopeType,

        scopeId:
          preview.plan.membership.scopeId,

        scopes: {
          schoolIds:
            preview.plan.membership.schoolIds,

          gradeIds:
            preview.plan.membership.gradeIds,

          classIds:
            preview.plan.membership.classIds,

          subjectKeys:
            preview.plan.membership.subjectKeys,

          routeIds,

          canAccessAllSchools: false,
        },

        permissions:
          currentPermissions &&
          typeof currentPermissions === "object"
            ? currentPermissions
            : DEFAULT_TEACHER_PERMISSIONS,

        isActive: true,

        endedAt: FieldValue.delete(),

        createdAt: existingNumber(
          membershipSnapshot,
          "createdAt",
          now,
        ),

        updatedAt: now,
      },
      { merge: true },
    );

    firestorePlan.teacherAssignments.forEach(
      (assignment, index) => {
        const snapshot =
          teacherAssignmentSnapshots[index]!;

        transaction.set(
          teacherAssignmentRefs[index]!,
          {
            ...assignment,

            status: "ACTIVE",

            startAt: existingNumber(
              snapshot,
              "startAt",
              assignment.startAt,
            ),

            endAt: FieldValue.delete(),

            provisioningSource:
              TEACHER_PROVISIONING_SOURCE,

            provisioningVersion:
              TEACHER_PROVISIONING_VERSION,

            managedBy:
              "TEACHER_PROVISIONING",

            createdAt: existingNumber(
              snapshot,
              "createdAt",
              now,
            ),

            updatedAt: now,
          },
          { merge: true },
        );
      },
    );

    firestorePlan.classLinks.forEach(
      (classLink, index) => {
        const snapshot =
          classLinkSnapshots[index]!;

        transaction.set(
          classLinkRefs[index]!,
          {
            ...classLink,

            provisioningSource:
              TEACHER_PROVISIONING_SOURCE,

            provisioningVersion:
              TEACHER_PROVISIONING_VERSION,

            managedBy:
              "TEACHER_PROVISIONING",

            createdAt: existingNumber(
              snapshot,
              "createdAt",
              now,
            ),

            updatedAt: now,
          },
          { merge: true },
        );
      },
    );

    firestorePlan.operationalAssignments.forEach(
      (assignment, index) => {
        const snapshot =
          operationalAssignmentSnapshots[index]!;

        transaction.set(
          operationalAssignmentRefs[index]!,
          {
            ...assignment,

            status: "ACTIVE",
            isActive: true,

            startAt: existingNumber(
              snapshot,
              "startAt",
              assignment.startAt ?? now,
            ),

            endAt: FieldValue.delete(),
            endedAt: FieldValue.delete(),

            provisioningSource:
              TEACHER_PROVISIONING_SOURCE,

            provisioningVersion:
              TEACHER_PROVISIONING_VERSION,

            managedBy:
              "TEACHER_PROVISIONING",

            createdAt: existingNumber(
              snapshot,
              "createdAt",
              now,
            ),

            updatedAt: now,
          },
          { merge: true },
        );
      },
    );

    legacyAssignmentSnapshots.forEach(
      (snapshot, index) => {
        const assignmentId =
          teacher.legacyTeacherAssignmentIdsToEnd[
            index
          ]!;

        if (
          snapshot.data()?.status === "ENDED"
        ) {
          alreadyEndedLegacyTeacherAssignmentIds.push(
            assignmentId,
          );

          return;
        }

        transaction.set(
          legacyAssignmentRefs[index]!,
          {
            status: "ENDED",
            endAt: now,
            updatedAt: now,

            endedByProvisioningSource:
              TEACHER_PROVISIONING_SOURCE,
          },
          { merge: true },
        );

        endedLegacyTeacherAssignmentIds.push(
          assignmentId,
        );
      },
    );
  });

  return {
    uid,
    personId,

    authAction,

    ...(initialPassword
      ? { initialPassword }
      : {}),

    membershipPath: membershipRef.path,

    teacherAssignmentIds:
      firestorePlan.teacherAssignments.map(
        (assignment) => assignment.id,
      ),

    classLinkIds:
      firestorePlan.classLinks.map(
        (link) => link.id,
      ),

    operationalAssignmentIds:
      firestorePlan.operationalAssignments.map(
        (assignment) => assignment.id,
      ),

    endedLegacyTeacherAssignmentIds,

    alreadyEndedLegacyTeacherAssignmentIds,
  };
}