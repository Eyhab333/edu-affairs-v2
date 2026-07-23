import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  StaffProvisioningInputSchema,
  type StaffProvisioningInput,
} from "@takween/contracts";
import { buildStaffProvisioningPlan } from "@takween/domain";

import { PROVISIONING_SOURCE } from "./apply-staff-provisioning";

export type StaffProvisioningVerificationCheck = {
  key: string;
  passed: boolean;
  message: string;
};

export type StaffProvisioningVerificationResult = {
  passed: boolean;
  uid: string;
  personId: string;
  checks: StaffProvisioningVerificationCheck[];
};

export async function verifyStaffProvisioning(
  rawInput: StaffProvisioningInput,
): Promise<StaffProvisioningVerificationResult> {
  const input = StaffProvisioningInputSchema.parse(rawInput);

  const auth = getAuth();
  const db = getFirestore();

  const checks: StaffProvisioningVerificationCheck[] = [];

  const authUser = await auth.getUserByEmail(input.email);
  const uid = authUser.uid;

  checks.push({
    key: "AUTH_EXISTS",
    passed: !authUser.disabled,
    message: authUser.disabled
      ? "حساب Firebase Auth معطل"
      : "حساب Firebase Auth موجود ونشط",
  });

  const userSnapshot = await db.doc(`users/${uid}`).get();
  const userData = userSnapshot.data();

  const personId =
    typeof userData?.personId === "string"
      ? userData.personId.trim()
      : "";

  checks.push({
    key: "USER_PROFILE",
    passed:
      userSnapshot.exists &&
      userData?.email === input.email &&
      personId.length > 0,
    message: userSnapshot.exists
      ? "UserProfile موجود"
      : "UserProfile غير موجود",
  });

  if (!personId) {
    checks.push({
      key: "PERSON_LINK",
      passed: false,
      message: "UserProfile غير مربوط بـ personId",
    });

    return {
      passed: false,
      uid,
      personId: "",
      checks,
    };
  }

  const plan = buildStaffProvisioningPlan({
    input,
    uid,
    personId,
  });

  const [personSnapshot, membershipSnapshot] = await Promise.all([
    db.doc(`orgs/${input.orgId}/people/${personId}`).get(),
    db.doc(`users/${uid}/orgMemberships/${input.orgId}`).get(),
  ]);

  const personData = personSnapshot.data();
  const membershipData = membershipSnapshot.data();

  checks.push({
    key: "PERSON_EXISTS",
    passed:
      personSnapshot.exists &&
      personData?.displayName === input.displayName &&
      personData?.email === input.email,
    message: personSnapshot.exists
      ? "Person موجود ومربوط"
      : "Person غير موجود",
  });

  checks.push({
    key: "MEMBERSHIP_EXISTS",
    passed:
      membershipSnapshot.exists &&
      membershipData?.personId === personId &&
      membershipData?.role === input.roleKey &&
      membershipData?.roleKey === input.roleKey &&
      membershipData?.isActive === true,
    message: membershipSnapshot.exists
      ? "عضوية المؤسسة موجودة ونشطة"
      : "عضوية المؤسسة غير موجودة",
  });

  const schoolIds = Array.isArray(
    membershipData?.scopes?.schoolIds,
  )
    ? membershipData.scopes.schoolIds
    : [];

  checks.push({
    key: "SCHOOL_SCOPE",
    passed:
      membershipData?.scopeType === "SCHOOL" &&
      membershipData?.scopeId === input.schoolId &&
      schoolIds.length === 1 &&
      schoolIds[0] === input.schoolId &&
      membershipData?.scopes?.canAccessAllSchools === false,
    message: "نطاق العضوية مقصور على المدرسة المحددة",
  });

  const assignmentSnapshots = await Promise.all(
    plan.operationalAssignments.map((assignment) =>
      db
        .doc(
          `orgs/${input.orgId}/operationalAssignments/${assignment.id}`,
        )
        .get(),
    ),
  );

  plan.operationalAssignments.forEach((assignment, index) => {
    const snapshot = assignmentSnapshots[index];
    const data = snapshot.data();

    checks.push({
      key: `ASSIGNMENT_${assignment.operationKind}`,
      passed:
        snapshot.exists &&
        data?.actorPersonId === personId &&
        data?.operationKind === assignment.operationKind &&
        data?.scopeId === input.schoolId &&
        data?.isActive === true &&
        data?.status === "ACTIVE" &&
        data?.provisioningSource === PROVISIONING_SOURCE,
      message: snapshot.exists
        ? `إسناد ${assignment.operationKind} موجود`
        : `إسناد ${assignment.operationKind} غير موجود`,
    });
  });

  return {
    passed: checks.every((check) => check.passed),
    uid,
    personId,
    checks,
  };
}