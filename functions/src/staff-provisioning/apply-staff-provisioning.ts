import { randomBytes } from "node:crypto";

import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  StaffProvisioningInputSchema,
  type StaffProvisioningInput,
} from "@takween/contracts";
import { buildStaffProvisioningPlan } from "@takween/domain";

import { resolveStaffProvisioningIdentity } from "./resolve-staff-provisioning-identity";

export const PROVISIONING_SOURCE = "STAFF_PROVISIONING_ENGINE";
const PROVISIONING_VERSION = 1;

export type ApplyStaffProvisioningResult = {
  uid: string;
  personId: string;

  authAction: "CREATED" | "REUSED";
  initialPassword?: string;

  membershipPath: string;
  operationalAssignmentIds: string[];
  deactivatedAssignmentIds: string[];
};

function generateTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}Aa1!`;
}

function existingCreatedAt(snapshot: DocumentSnapshot, fallback: number) {
  const value = snapshot.data()?.createdAt;
  return typeof value === "number" ? value : fallback;
}

async function ensureProvisioningScopeExists(params: {
  orgId: string;
  schoolId: string;
}) {
  const db = getFirestore();

  const [orgSnapshot, schoolSnapshot] = await Promise.all([
    db.doc(`orgs/${params.orgId}`).get(),
    db.doc(`orgs/${params.orgId}/schools/${params.schoolId}`).get(),
  ]);

  if (!orgSnapshot.exists) {
    throw new Error(`المؤسسة غير موجودة: ${params.orgId}`);
  }

  if (!schoolSnapshot.exists) {
    throw new Error(
      `المدرسة غير موجودة داخل المؤسسة: ${params.schoolId}`,
    );
  }
}

export async function applyStaffProvisioning(
  rawInput: StaffProvisioningInput,
): Promise<ApplyStaffProvisioningResult> {
  const input = StaffProvisioningInputSchema.parse(rawInput);

  await ensureProvisioningScopeExists({
    orgId: input.orgId,
    schoolId: input.schoolId,
  });

  const identity = await resolveStaffProvisioningIdentity(input);

  const auth = getAuth();
  const db = getFirestore();

  let authUser = identity.authUser;
  let authAction: ApplyStaffProvisioningResult["authAction"] = "REUSED";
  let initialPassword: string | undefined;

  if (!authUser) {
    initialPassword =
      input.initialPassword ?? generateTemporaryPassword();

    authUser = await auth.createUser({
      email: input.email,
      displayName: input.displayName,
      password: initialPassword,
      disabled: false,
      emailVerified: false,
    });

    authAction = "CREATED";
  } else {
    if (authUser.disabled) {
      throw new Error(
        `حساب Firebase Auth موجود لكنه معطل: ${input.email}`,
      );
    }

    if (authUser.displayName !== input.displayName) {
      authUser = await auth.updateUser(authUser.uid, {
        displayName: input.displayName,
      });
    }
  }

  const uid = authUser.uid;

  const personId =
    identity.personId || `staff-${uid}`;

  const plan = buildStaffProvisioningPlan({
    input,
    uid,
    personId,
  });

  const userRef = db.doc(`users/${uid}`);

  const membershipRef = db.doc(
    `users/${uid}/orgMemberships/${input.orgId}`,
  );

  const personRef = db.doc(
    `orgs/${input.orgId}/people/${personId}`,
  );

  const assignmentCollection = db.collection(
    `orgs/${input.orgId}/operationalAssignments`,
  );

  const assignmentRefs = plan.operationalAssignments.map((assignment) =>
    assignmentCollection.doc(assignment.id),
  );

  const plannedAssignmentIds = new Set(
    plan.operationalAssignments.map((assignment) => assignment.id),
  );

  const existingManagedAssignmentsSnapshot = await assignmentCollection
    .where("actorPersonId", "==", personId)
    .get();

  const assignmentsToDeactivate =
    existingManagedAssignmentsSnapshot.docs.filter((document) => {
      const data = document.data();

      return (
        data.provisioningSource === PROVISIONING_SOURCE &&
        data.scopeId === input.schoolId &&
        !plannedAssignmentIds.has(document.id)
      );
    });

  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const personSnapshot = await transaction.get(personRef);
    const membershipSnapshot = await transaction.get(membershipRef);

    const assignmentSnapshots: DocumentSnapshot[] = [];

    for (const assignmentRef of assignmentRefs) {
      assignmentSnapshots.push(
        await transaction.get(assignmentRef),
      );
    }

    transaction.set(
      userRef,
      {
        ...plan.userProfile,

        createdAt: existingCreatedAt(userSnapshot, now),
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      personRef,
      {
        ...plan.person,

        createdAt: existingCreatedAt(personSnapshot, now),
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      membershipRef,
      {
        id: input.orgId,

        uid,
        personId,
        orgId: input.orgId,

        role: plan.membership.role,
        roleKey: plan.membership.roleKey,

        title: plan.membership.title,
        department: plan.membership.department,

        scopeType: plan.membership.scopeType,
        scopeId: plan.membership.scopeId,
        scopes: plan.membership.scopes,

        permissions: plan.membership.permissions,

        principalPersonId: personId,

        isActive: true,

        createdAt: existingCreatedAt(membershipSnapshot, now),
        updatedAt: now,
      },
      { merge: true },
    );

    plan.operationalAssignments.forEach((assignment, index) => {
      transaction.set(
        assignmentRefs[index],
        {
          ...assignment,

          schoolId: input.schoolId,

          provisioningSource: PROVISIONING_SOURCE,
          provisioningRoleKey: input.roleKey,
          provisioningVersion: PROVISIONING_VERSION,

          createdAt: existingCreatedAt(
            assignmentSnapshots[index],
            now,
          ),
          updatedAt: now,
        },
        { merge: true },
      );
    });

    for (const document of assignmentsToDeactivate) {
      transaction.set(
        document.ref,
        {
          status: "ENDED",
          isActive: false,
          endedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
    }
  });

  return {
    uid,
    personId,

    authAction,
    ...(initialPassword ? { initialPassword } : {}),

    membershipPath: membershipRef.path,

    operationalAssignmentIds:
      plan.operationalAssignments.map((assignment) => assignment.id),

    deactivatedAssignmentIds:
      assignmentsToDeactivate.map((document) => document.id),
  };
}