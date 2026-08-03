import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import type { StaffProvisioningInput } from "@takween/contracts";
import { buildStaffProvisioningPlan } from "@takween/domain";
import { resolveStaffProvisioningScope } from "./resolve-staff-provisioning-scope";
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

function hasSameStrings(actual: unknown, expected: string[]) {
  const actualStrings = Array.isArray(actual)
    ? actual.filter((value): value is string => typeof value === "string")
    : [];

  return (
    actualStrings.length === expected.length &&
    expected.every((value) => actualStrings.includes(value))
  );
}

export async function verifyStaffProvisioning(
  rawInput: StaffProvisioningInput,
): Promise<StaffProvisioningVerificationResult> {
  const scope = await resolveStaffProvisioningScope(rawInput);

  const input = scope.input;

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
    typeof userData?.personId === "string" ? userData.personId.trim() : "";

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
    message: personSnapshot.exists ? "Person موجود ومربوط" : "Person غير موجود",
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

  checks.push({
    key: "SCHOOL_SCOPE",

    passed:
      membershipSnapshot.exists &&
      membershipData?.scopeType === plan.membership.scopeType &&
      membershipData?.scopeId === scope.primarySchoolId &&
      hasSameStrings(membershipData?.scopes?.schoolIds, scope.schoolIds) &&
      hasSameStrings(
        membershipData?.scopes?.scopeGroupIds,
        scope.scopeGroupIds,
      ) &&
      membershipData?.scopes?.canAccessAllSchools ===
        plan.membership.scopes.canAccessAllSchools,

    message:
      scope.schoolIds.length === 1
        ? "نطاق العضوية مربوط بالمدرسة المحددة"
        : `نطاق العضوية مربوط بـ ${scope.schoolIds.length} مدارس`,
  });

  const assignmentSnapshots = await Promise.all(
    plan.operationalAssignments.map((assignment) =>
      db
        .doc(`orgs/${input.orgId}/operationalAssignments/${assignment.id}`)
        .get(),
    ),
  );

  plan.operationalAssignments.forEach((assignment, index) => {
    const snapshot = assignmentSnapshots[index];
    const data = snapshot.data();

    checks.push({
      key: `ASSIGNMENT_${assignment.schoolId}_${assignment.operationKind}`,
      passed:
        snapshot.exists &&
        data?.actorPersonId === personId &&
        data?.operationKind === assignment.operationKind &&
        data?.schoolId === assignment.schoolId &&
        data?.scopeId === assignment.schoolId &&
        data?.isActive === true &&
        data?.status === "ACTIVE" &&
        data?.provisioningSource === PROVISIONING_SOURCE,
      message: snapshot.exists
        ? `إسناد ${assignment.operationKind} موجود للمدرسة ${assignment.schoolId}`
        : `إسناد ${assignment.operationKind} غير موجود للمدرسة ${assignment.schoolId}`,
    });
  });

  return {
    passed: checks.every((check) => check.passed),
    uid,
    personId,
    checks,
  };
}
