import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  StaffProvisioningInputSchema,
  type StaffProvisioningInput,
} from "@takween/contracts";

export type StaffPersonMatchSource =
  | "USER_PROFILE"
  | "NATIONAL_ID"
  | "EMAIL"
  | "NEW";

export type StaffProvisioningIdentityResolution = {
  authUser: UserRecord | null;
  uid: string;

  personId: string;
  personMatchSource: StaffPersonMatchSource;

  authExists: boolean;
  personExists: boolean;
};

function isAuthUserNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "auth/user-not-found"
  );
}

async function findAuthUserByEmail(email: string) {
  try {
    return await getAuth().getUserByEmail(email);
  } catch (error) {
    if (isAuthUserNotFound(error)) return null;
    throw error;
  }
}

async function findSinglePersonId(params: {
  orgId: string;
  field: "nationalId" | "email";
  value: string;
}) {
  if (!params.value) return "";

  const db = getFirestore();

  const snapshot = await db
    .collection(`orgs/${params.orgId}/people`)
    .where(params.field, "==", params.value)
    .limit(2)
    .get();

  if (snapshot.size > 1) {
    throw new Error(
      `يوجد أكثر من Person بنفس ${params.field}: ${params.value}`,
    );
  }

  return snapshot.empty ? "" : snapshot.docs[0].id;
}

export async function resolveStaffProvisioningIdentity(
  rawInput: StaffProvisioningInput,
): Promise<StaffProvisioningIdentityResolution> {
  const input = StaffProvisioningInputSchema.parse(rawInput);

  const db = getFirestore();
  const authUser = await findAuthUserByEmail(input.email);

  let userProfilePersonId = "";

  if (authUser) {
    const userSnapshot = await db.doc(`users/${authUser.uid}`).get();

    const storedPersonId = userSnapshot.data()?.personId;

    userProfilePersonId =
      typeof storedPersonId === "string" ? storedPersonId.trim() : "";
  }

  const nationalIdPersonId = input.nationalId
    ? await findSinglePersonId({
        orgId: input.orgId,
        field: "nationalId",
        value: input.nationalId,
      })
    : "";

  const emailPersonId = await findSinglePersonId({
    orgId: input.orgId,
    field: "email",
    value: input.email,
  });

  const matchedPersonIds = new Set(
    [userProfilePersonId, nationalIdPersonId, emailPersonId].filter(Boolean),
  );

  if (matchedPersonIds.size > 1) {
    throw new Error(
      [
        "تعارض في ربط الشخص:",
        `UserProfile=${userProfilePersonId || "غير موجود"}`,
        `nationalId=${nationalIdPersonId || "غير موجود"}`,
        `email=${emailPersonId || "غير موجود"}`,
      ].join(" "),
    );
  }

  const matchedPersonId = Array.from(matchedPersonIds)[0] ?? "";

  if (matchedPersonId) {
    const personMatchSource: StaffPersonMatchSource = userProfilePersonId
      ? "USER_PROFILE"
      : nationalIdPersonId
        ? "NATIONAL_ID"
        : "EMAIL";

    return {
      authUser,
      uid: authUser?.uid ?? "",
      personId: matchedPersonId,
      personMatchSource,
      authExists: authUser !== null,
      personExists: true,
    };
  }

  return {
    authUser,
    uid: authUser?.uid ?? "",
    personId: authUser ? `staff-${authUser.uid}` : "",
    personMatchSource: "NEW",
    authExists: authUser !== null,
    personExists: false,
  };
}