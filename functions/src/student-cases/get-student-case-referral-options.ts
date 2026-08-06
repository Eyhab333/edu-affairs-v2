import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "me-central2";

type Row = Record<string, unknown>;

type ReferralRecipient = {
  id: string;
  personId: string;
  displayName: string;
  roleKey: string;
  roleLabel: string;
};

const FULL_ORG_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

const CASE_REFERRAL_ROLES = new Set([
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

const ROLE_LABELS: Record<string, string> = {
  BOYS_PRINCIPAL: "مدير المدرسة",
  BOYS_VP: "وكيل المدرسة",
  BOYS_EDU_VP: "الوكيل التعليمي",
  GIRLS_PRINCIPAL: "مديرة المدرسة",
  GIRLS_VP: "وكيلة المدرسة",
  KG_PRINCIPAL: "مديرة الروضة",
  KG_VP: "وكيلة الروضة",
  BOYS_STUDENT_GUIDE: "الموجه الطلابي",
  GIRLS_STUDENT_COUNSELOR: "الموجهة الطلابية",
  ADMIN_ASSISTANT: "المساعد الإداري",
};

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  const result = value.trim();
  if (result.includes("/")) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} cannot contain '/'.`,
    );
  }
  return result;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRecord(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isActive(row: Row, now: number): boolean {
  if (row.active === false || row.isActive === false) return false;
  if (readString(row.status) && readString(row.status) !== "ACTIVE") {
    return false;
  }
  if (typeof row.startAt === "number" && row.startAt > now) return false;
  if (typeof row.endAt === "number" && row.endAt < now) return false;
  return true;
}

function canAccessSchool(membership: Row, roleKey: string, schoolId: string) {
  if (FULL_ORG_ROLES.has(roleKey)) return true;

  const scopes = readRecord(membership.scopes);
  if (scopes.canAccessAllSchools === true) return true;
  if (
    readString(membership.scopeType) === "SCHOOL" &&
    readString(membership.scopeId) === schoolId
  ) {
    return true;
  }

  return readStringArray(scopes.schoolIds).includes(schoolId);
}

async function actorCanCreateCases(params: {
  orgId: string;
  actorPersonId: string;
  membership: Row;
  roleKey: string;
  schoolId: string;
  now: number;
}): Promise<boolean> {
  if (FULL_ORG_ROLES.has(params.roleKey)) return true;
  if (CASE_REFERRAL_ROLES.has(params.roleKey)) return true;
  if (readRecord(params.membership.permissions).manageCases === true) {
    return true;
  }

  const snapshot = await getFirestore()
    .collection(`orgs/${params.orgId}/operationalAssignments`)
    .where("actorPersonId", "==", params.actorPersonId)
    .limit(100)
    .get();

  return snapshot.docs.some((document) => {
    const row = document.data();
    return (
      isActive(row, params.now) &&
      ["STUDENT_CASE_REFERRAL", "STUDENT_CASE_HANDLING"].includes(
        readString(row.operationKind),
      ) &&
      (!readString(row.schoolId) || readString(row.schoolId) === params.schoolId)
    );
  });
}

export const getStudentCaseReferralOptions = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request): Promise<{
    ok: true;
    schoolId: string;
    recipients: ReferralRecipient[];
  }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as Row;
    const orgId = requireString(input.orgId, "orgId");
    const schoolId = requireString(input.schoolId, "schoolId");
    const db = getFirestore();
    const now = Date.now();
    const [userSnapshot, membershipSnapshot] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`users/${uid}/orgMemberships/${orgId}`).get(),
    ]);

    if (!membershipSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "Active organization membership is required.",
      );
    }

    const user = userSnapshot.data() ?? {};
    const membership = membershipSnapshot.data() ?? {};
    if (!isActive(membership, now)) {
      throw new HttpsError(
        "permission-denied",
        "Active organization membership is required.",
      );
    }

    const actorPersonId =
      readString(membership.personId) || readString(user.personId);
    const roleKey =
      readString(membership.roleKey) || readString(membership.role);

    if (!actorPersonId || !roleKey || !canAccessSchool(membership, roleKey, schoolId)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this school.",
      );
    }

    if (
      !(await actorCanCreateCases({
        orgId,
        actorPersonId,
        membership,
        roleKey,
        schoolId,
        now,
      }))
    ) {
      throw new HttpsError(
        "permission-denied",
        "You do not have student case access for this school.",
      );
    }

    const assignmentSnapshot = await db
      .collection(`orgs/${orgId}/operationalAssignments`)
      .where("schoolId", "==", schoolId)
      .limit(300)
      .get();
    const recipientsByPersonId = new Map<string, ReferralRecipient>();

    for (const document of assignmentSnapshot.docs) {
      const row = document.data();
      if (
        !isActive(row, now) ||
        readString(row.operationKind) !== "STUDENT_CASE_HANDLING"
      ) {
        continue;
      }

      const personId = readString(row.actorPersonId);
      if (!personId || personId === actorPersonId) continue;

      const recipientRoleKey = readString(row.actorRoleKey);
      const personSnapshot = await db.doc(`orgs/${orgId}/people/${personId}`).get();
      const person = personSnapshot.data() ?? {};
      const displayName =
        readString(person.displayName) ||
        readString(row.actorDisplayName) ||
        readString(row.scopeLabel) ||
        ROLE_LABELS[recipientRoleKey] ||
        "موظف المدرسة";

      recipientsByPersonId.set(personId, {
        id: personId,
        personId,
        displayName,
        roleKey: recipientRoleKey,
        roleLabel: ROLE_LABELS[recipientRoleKey] || "مسؤول قضايا الطلاب",
      });
    }

    const recipients = Array.from(recipientsByPersonId.values()).sort(
      (left, right) => left.displayName.localeCompare(right.displayName, "ar"),
    );

    return { ok: true, schoolId, recipients };
  },
);
