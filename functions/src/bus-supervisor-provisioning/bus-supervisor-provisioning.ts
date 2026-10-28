import { randomBytes } from "node:crypto";

import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";

import {
  MembershipPermissionsSchema,
  MembershipSchema,
  MembershipScopesSchema,
  PersonSchema,
  UserProfileSchema,
} from "@takween/contracts";

import {
  resolveProvisioningIdentity,
  type StaffProvisioningIdentityResolution,
} from "../staff-provisioning/resolve-staff-provisioning-identity";

export type BusSupervisorProvisioningInput = {
  orgId?: string;
  displayName: string;
  email: string;
  nationalId?: string;
  phone?: string;
  schoolId: string;
  title?: string;
  department?: string;
  principalPersonId?: string;
  initialPassword?: string;
};

export type BusSupervisorProvisioningPreviewStatus =
  | "READY_TO_CREATE"
  | "READY_TO_LINK_EXISTING_IDENTITY"
  | "BLOCKED";

export type BusSupervisorProvisioningPreview = {
  status: BusSupervisorProvisioningPreviewStatus;
  input: NormalizedBusSupervisorProvisioningInput;
  identity: Pick<
    StaffProvisioningIdentityResolution,
    "uid" | "personId" | "personMatchSource" | "authExists" | "personExists"
  >;
  pendingAuthCreation: boolean;
  pendingPersonCreation: boolean;
  membershipPath: string | null;
  blockingReason: string;
};

export type BusSupervisorProvisioningApplyResult = {
  uid: string;
  personId: string;
  authAction: "CREATED" | "REUSED";
  membershipPath: string;
  temporaryPassword?: string;
};

export type BusSupervisorProvisioningVerificationCheck = {
  key: string;
  passed: boolean;
  message: string;
};

export type BusSupervisorProvisioningVerificationResult = {
  passed: boolean;
  uid: string;
  personId: string;
  checks: BusSupervisorProvisioningVerificationCheck[];
};

type NormalizedBusSupervisorProvisioningInput = {
  orgId: string;
  displayName: string;
  email: string;
  nationalId: string;
  phone: string;
  schoolId: string;
  title: string;
  department: string;
  principalPersonId: string;
  initialPassword?: string;
};

type PreparedProvisioning = {
  input: NormalizedBusSupervisorProvisioningInput;
  identity: StaffProvisioningIdentityResolution;
  membershipPath: string | null;
  blockingReason: string;
};

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, fieldName: string) {
  const result = text(value);
  if (!result) throw new Error(`${fieldName} is required.`);
  return result;
}

function normalizeEmail(value: unknown) {
  const email = requiredText(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email is invalid.");
  }
  return email;
}

function normalizeInput(rawInput: BusSupervisorProvisioningInput | unknown) {
  const input = row(rawInput);
  const initialPassword = text(input.initialPassword);
  if (initialPassword && initialPassword.length < 8) {
    throw new Error("initialPassword must contain at least 8 characters.");
  }

  return {
    orgId: text(input.orgId) || "takween",
    displayName: requiredText(input.displayName, "displayName"),
    email: normalizeEmail(input.email),
    nationalId: text(input.nationalId),
    phone: text(input.phone),
    schoolId: requiredText(input.schoolId, "schoolId"),
    title: text(input.title) || "مشرف/ة حافلة",
    department: text(input.department) || "النقل المدرسي",
    principalPersonId: text(input.principalPersonId),
    ...(initialPassword ? { initialPassword } : {}),
  } satisfies NormalizedBusSupervisorProvisioningInput;
}

function existingCreatedAt(snapshot: DocumentSnapshot, fallback: number) {
  const value = snapshot.data()?.createdAt;
  return typeof value === "number" ? value : fallback;
}

function generatedTemporaryPassword() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

function buildMembership(params: {
  input: NormalizedBusSupervisorProvisioningInput;
  uid: string;
  personId: string;
}) {
  const { input, uid, personId } = params;
  return MembershipSchema.parse({
    id: input.orgId,
    uid,
    personId,
    orgId: input.orgId,
    role: "BUS_SUPERVISOR",
    roleKey: "BUS_SUPERVISOR",
    title: input.title,
    department: input.department,
    orgUnitId: "",
    positionCode: "",
    scopeType: "SCHOOL",
    scopeId: input.schoolId,
    scopes: MembershipScopesSchema.parse({
      schoolIds: [input.schoolId],
      scopeGroupIds: [],
      gradeIds: [],
      classIds: [],
      subjectKeys: [],
      routeIds: [],
      canAccessAllSchools: false,
    }),
    permissions: MembershipPermissionsSchema.parse({}),
    directEvaluatorPersonId: "",
    supervisorPersonId: "",
    managerPersonId: "",
    principalPersonId: input.principalPersonId,
    vicePrincipalPersonId: "",
    isActive: true,
  });
}

async function findExistingMembershipPath(params: {
  orgId: string;
  personId: string;
}) {
  if (!params.personId) return "";

  const snapshot = await getFirestore()
    .collectionGroup("orgMemberships")
    .where("personId", "==", params.personId)
    .get();
  const existing = snapshot.docs.find(
    (document) => text(document.data().orgId) === params.orgId,
  );

  return existing?.ref.path || "";
}

async function prepareProvisioning(
  rawInput: BusSupervisorProvisioningInput | unknown,
): Promise<PreparedProvisioning> {
  const input = normalizeInput(rawInput);
  const identity = await resolveProvisioningIdentity({
    orgId: input.orgId,
    email: input.email,
    nationalId: input.nationalId,
  });
  const db = getFirestore();

  const schoolSnapshot = await db
    .doc(`orgs/${input.orgId}/schools/${input.schoolId}`)
    .get();
  if (!schoolSnapshot.exists) {
    return {
      input,
      identity,
      membershipPath: null,
      blockingReason: "The selected school does not exist.",
    };
  }

  if (identity.authUser?.disabled) {
    return {
      input,
      identity,
      membershipPath: null,
      blockingReason: "A matching Firebase Auth account is disabled.",
    };
  }

  const authDisplayName = text(identity.authUser?.displayName);
  if (authDisplayName && authDisplayName !== input.displayName) {
    return {
      input,
      identity,
      membershipPath: null,
      blockingReason: "The matching Firebase Auth account has a different display name.",
    };
  }

  if (!identity.uid) {
    const existingMembershipPath = await findExistingMembershipPath({
      orgId: input.orgId,
      personId: identity.personId,
    });
    return {
      input,
      identity,
      membershipPath: existingMembershipPath || null,
      blockingReason: existingMembershipPath
        ? "An organization membership already exists for this person."
        : "",
    };
  }

  const membershipRef = db.doc(
    `users/${identity.uid}/orgMemberships/${input.orgId}`,
  );
  const [membershipSnapshot, personSnapshot, existingMembershipPath] = await Promise.all([
    membershipRef.get(),
    identity.personId
      ? db.doc(`orgs/${input.orgId}/people/${identity.personId}`).get()
      : Promise.resolve(undefined),
    findExistingMembershipPath({
      orgId: input.orgId,
      personId: identity.personId,
    }),
  ]);

  if (membershipSnapshot.exists || existingMembershipPath) {
    return {
      input,
      identity,
      membershipPath: existingMembershipPath || membershipRef.path,
      blockingReason: "An organization membership already exists for this account or person.",
    };
  }

  if (identity.personExists && !personSnapshot?.exists) {
    return {
      input,
      identity,
      membershipPath: membershipRef.path,
      blockingReason: "The matching identity references a missing person record.",
    };
  }

  if (personSnapshot?.exists) {
    const person = row(personSnapshot.data());
    const existingDisplayName = text(person.displayName);
    const existingEmail = text(person.email).toLowerCase();
    const existingNationalId = text(person.nationalId);
    const existingPhone = text(person.phone);
    if (existingDisplayName && existingDisplayName !== input.displayName) {
      return {
        input,
        identity,
        membershipPath: membershipRef.path,
        blockingReason: "The matching person has a different display name.",
      };
    }
    if (existingEmail && existingEmail !== input.email) {
      return {
        input,
        identity,
        membershipPath: membershipRef.path,
        blockingReason: "The matching person has a different email address.",
      };
    }
    if (
      existingNationalId &&
      input.nationalId &&
      existingNationalId !== input.nationalId
    ) {
      return {
        input,
        identity,
        membershipPath: membershipRef.path,
        blockingReason: "The matching person has a different national ID.",
      };
    }
    if (existingPhone && input.phone && existingPhone !== input.phone) {
      return {
        input,
        identity,
        membershipPath: membershipRef.path,
        blockingReason: "The matching person has a different phone number.",
      };
    }
  }

  return { input, identity, membershipPath: membershipRef.path, blockingReason: "" };
}

function previewStatus(params: PreparedProvisioning): BusSupervisorProvisioningPreviewStatus {
  if (params.blockingReason) return "BLOCKED";
  return params.identity.authExists || params.identity.personExists
    ? "READY_TO_LINK_EXISTING_IDENTITY"
    : "READY_TO_CREATE";
}

export async function previewBusSupervisorProvisioning(
  rawInput: BusSupervisorProvisioningInput | unknown,
): Promise<BusSupervisorProvisioningPreview> {
  const prepared = await prepareProvisioning(rawInput);
  return {
    status: previewStatus(prepared),
    input: prepared.input,
    identity: {
      uid: prepared.identity.uid,
      personId: prepared.identity.personId,
      personMatchSource: prepared.identity.personMatchSource,
      authExists: prepared.identity.authExists,
      personExists: prepared.identity.personExists,
    },
    pendingAuthCreation: !prepared.identity.authExists,
    pendingPersonCreation: !prepared.identity.personExists,
    membershipPath: prepared.membershipPath,
    blockingReason: prepared.blockingReason,
  };
}

export async function applyBusSupervisorProvisioning(
  rawInput: BusSupervisorProvisioningInput | unknown,
): Promise<BusSupervisorProvisioningApplyResult> {
  const prepared = await prepareProvisioning(rawInput);
  if (prepared.blockingReason) {
    throw new Error(prepared.blockingReason);
  }

  const auth = getAuth();
  const db = getFirestore();
  let authUser: UserRecord | null = prepared.identity.authUser;
  let authAction: "CREATED" | "REUSED" = "REUSED";
  let generatedPassword: string | undefined;

  if (!authUser) {
    const password = prepared.input.initialPassword || generatedTemporaryPassword();
    authUser = await auth.createUser({
      email: prepared.input.email,
      displayName: prepared.input.displayName,
      password,
      disabled: false,
      emailVerified: false,
    });
    authAction = "CREATED";
    if (!prepared.input.initialPassword) generatedPassword = password;
  } else if (authUser.disabled) {
    throw new Error("A matching Firebase Auth account is disabled.");
  }

  const uid = authUser.uid;
  const personId = prepared.identity.personId || `staff-${uid}`;
  const userRef = db.doc(`users/${uid}`);
  const personRef = db.doc(`orgs/${prepared.input.orgId}/people/${personId}`);
  const schoolRef = db.doc(
    `orgs/${prepared.input.orgId}/schools/${prepared.input.schoolId}`,
  );
  const membershipRef = db.doc(
    `users/${uid}/orgMemberships/${prepared.input.orgId}`,
  );
  const membership = buildMembership({ input: prepared.input, uid, personId });
  const userProfile = UserProfileSchema.parse({
    uid,
    displayName: prepared.input.displayName,
    email: prepared.input.email,
    phone: prepared.input.phone,
    personId,
    isDisabled: false,
  });
  const person = PersonSchema.parse({
    id: personId,
    displayName: prepared.input.displayName,
    email: prepared.input.email,
    ...(prepared.input.nationalId
      ? { nationalId: prepared.input.nationalId }
      : {}),
    ...(prepared.input.phone ? { phone: prepared.input.phone } : {}),
  });
  const now = Date.now();

  try {
    await db.runTransaction(async (transaction) => {
      const [userSnapshot, personSnapshot, schoolSnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(personRef),
        transaction.get(schoolRef),
        transaction.get(membershipRef),
      ]);

      if (!schoolSnapshot.exists) {
        throw new Error("The selected school does not exist.");
      }
      if (membershipSnapshot.exists) {
        throw new Error("An organization membership already exists for this account.");
      }
      if (prepared.identity.personExists && !personSnapshot.exists) {
        throw new Error("The matching identity references a missing person record.");
      }

      transaction.set(
        userRef,
        {
          ...userProfile,
          createdAt: existingCreatedAt(userSnapshot, now),
          updatedAt: now,
        },
        { merge: true },
      );
      transaction.set(
        personRef,
        {
          ...person,
          createdAt: existingCreatedAt(personSnapshot, now),
          updatedAt: now,
        },
        { merge: true },
      );
      transaction.create(membershipRef, {
        ...membership,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (authAction === "CREATED") {
      await auth.deleteUser(uid).catch(() => undefined);
    }
    throw error;
  }

  return {
    uid,
    personId,
    authAction,
    membershipPath: membershipRef.path,
    ...(generatedPassword ? { temporaryPassword: generatedPassword } : {}),
  };
}

export async function verifyBusSupervisorProvisioning(
  rawInput: BusSupervisorProvisioningInput | unknown,
): Promise<BusSupervisorProvisioningVerificationResult> {
  const input = normalizeInput(rawInput);
  const identity = await resolveProvisioningIdentity({
    orgId: input.orgId,
    email: input.email,
    nationalId: input.nationalId,
  });
  const db = getFirestore();
  const uid = identity.uid;
  const personId = identity.personId;
  const checks: BusSupervisorProvisioningVerificationCheck[] = [];

  if (!uid || !identity.authUser) {
    checks.push({ key: "auth", passed: false, message: "Firebase Auth account was not found." });
    return { passed: false, uid: "", personId: "", checks };
  }

  checks.push({
    key: "auth",
    passed: !identity.authUser.disabled,
    message: identity.authUser.disabled
      ? "Firebase Auth account is disabled."
      : "Firebase Auth account is active.",
  });

  const [userSnapshot, personSnapshot, schoolSnapshot, membershipSnapshot] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    personId ? db.doc(`orgs/${input.orgId}/people/${personId}`).get() : Promise.resolve(undefined),
    db.doc(`orgs/${input.orgId}/schools/${input.schoolId}`).get(),
    db.doc(`users/${uid}/orgMemberships/${input.orgId}`).get(),
  ]);
  const user = row(userSnapshot.data());
  const person = row(personSnapshot?.data());
  const membership = row(membershipSnapshot.data());
  const membershipScopes = row(membership.scopes);
  const membershipSchoolIds = membershipScopes.schoolIds;
  const schoolIds = Array.isArray(membershipSchoolIds)
    ? membershipSchoolIds.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  checks.push({
    key: "user_profile",
    passed: userSnapshot.exists && text(user.personId) === personId,
    message: "User profile is linked to the resolved person.",
  });
  checks.push({
    key: "person",
    passed: !!personId && personSnapshot?.exists === true,
    message: "Organization person record exists.",
  });
  checks.push({
    key: "school",
    passed: schoolSnapshot.exists,
    message: "Selected school record exists.",
  });
  checks.push({
    key: "membership",
    passed:
      membershipSnapshot.exists &&
      membership.isActive !== false &&
      text(membership.roleKey || membership.role) === "BUS_SUPERVISOR" &&
      text(membership.scopeType) === "SCHOOL" &&
      text(membership.scopeId) === input.schoolId &&
      schoolIds.includes(input.schoolId),
    message: "Active school-scoped BUS_SUPERVISOR membership exists.",
  });
  checks.push({
    key: "person_identity",
    passed:
      text(person.displayName) === input.displayName &&
      text(person.email).toLowerCase() === input.email,
    message: "Person record matches the requested display name and email.",
  });

  return {
    passed: checks.every((check) => check.passed),
    uid,
    personId,
    checks,
  };
}
