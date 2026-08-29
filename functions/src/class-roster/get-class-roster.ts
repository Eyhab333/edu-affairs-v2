import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "me-central2";

const ORG_MANAGER_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

type FirestoreRecord = Record<string, unknown>;

type GetClassRosterInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
};

type ClassRosterRow = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
};

type GetClassRosterResult = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  rows: ClassRosterRow[];
};

function requireDocumentId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  const id = value.trim();

  if (id.includes("/")) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} cannot contain '/'.`,
    );
  }

  return id;
}

function readString(data: FirestoreRecord | undefined, keys: string[]): string {
  if (!data) return "";

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

function readRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreRecord)
    : {};
}

function isActiveMembership(membership: FirestoreRecord): boolean {
  return membership.isActive === true || membership.active === true;
}

function getOrgRole(membership: FirestoreRecord): string {
  if (membership.role !== null && membership.role !== undefined) {
    return typeof membership.role === "string" ? membership.role.trim() : "";
  }

  return readString(membership, ["roleKey"]);
}

function hasSchoolAccess(membership: FirestoreRecord, schoolId: string): boolean {
  const roleKey = getOrgRole(membership);

  if (ORG_MANAGER_ROLES.has(roleKey)) return true;

  if (readString(membership, ["scopeType"]) === "SCHOOL") {
    return readString(membership, ["scopeId"]) === schoolId;
  }

  return readStringArray(readRecord(membership.scopes).schoolIds).includes(
    schoolId,
  );
}

function matchesContext(params: {
  data: FirestoreRecord | undefined;
  orgId: string;
  schoolId?: string;
  academicYearId?: string;
}) {
  const { data, orgId, schoolId, academicYearId } = params;

  if (!data) return false;

  const declaredOrgId = readString(data, ["orgId"]);
  const declaredSchoolId = readString(data, ["schoolId"]);
  const declaredAcademicYearId = readString(data, ["academicYearId"]);

  return (
    (!declaredOrgId || declaredOrgId === orgId) &&
    (!schoolId || !declaredSchoolId || declaredSchoolId === schoolId) &&
    (!academicYearId ||
      !declaredAcademicYearId ||
      declaredAcademicYearId === academicYearId)
  );
}

function resolveDisplayName(params: {
  studentId: string;
  student?: FirestoreRecord;
  person?: FirestoreRecord;
}) {
  return (
    readString(params.person, ["displayName", "fullName", "nameAr", "name"]) ||
    readString(params.student, ["displayName", "fullName", "nameAr", "name"]) ||
    params.studentId
  );
}

export const getClassRoster = onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request): Promise<GetClassRosterResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = readRecord(request.data) as Partial<GetClassRosterInput>;
    const orgId = requireDocumentId(input.orgId, "orgId");
    const schoolId = requireDocumentId(input.schoolId, "schoolId");
    const academicYearId = requireDocumentId(
      input.academicYearId,
      "academicYearId",
    );
    const classId = requireDocumentId(input.classId, "classId");

    const db = getFirestore();
    const membershipSnapshot = await db
      .doc(`users/${uid}/orgMemberships/${orgId}`)
      .get();

    if (!membershipSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "Active organization membership is required.",
      );
    }

    const membership = membershipSnapshot.data() as FirestoreRecord;

    if (!isActiveMembership(membership)) {
      throw new HttpsError(
        "permission-denied",
        "Active organization membership is required.",
      );
    }

    if (!hasSchoolAccess(membership, schoolId)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this school.",
      );
    }

    const schoolRef = db.doc(`orgs/${orgId}/schools/${schoolId}`);
    const academicYearRef = db.doc(
      `${schoolRef.path}/academicYears/${academicYearId}`,
    );
    const classRef = db.doc(`${academicYearRef.path}/classes/${classId}`);

    const [schoolSnapshot, academicYearSnapshot, classSnapshot] =
      await Promise.all([schoolRef.get(), academicYearRef.get(), classRef.get()]);

    if (
      !schoolSnapshot.exists ||
      !matchesContext({
        data: schoolSnapshot.data() as FirestoreRecord | undefined,
        orgId,
      }) ||
      !academicYearSnapshot.exists ||
      !matchesContext({
        data: academicYearSnapshot.data() as FirestoreRecord | undefined,
        orgId,
        schoolId,
      }) ||
      !classSnapshot.exists ||
      !matchesContext({
        data: classSnapshot.data() as FirestoreRecord | undefined,
        orgId,
        schoolId,
        academicYearId,
      })
    ) {
      throw new HttpsError("not-found", "Class context was not found.");
    }

    const enrollmentsSnapshot = await db
      .collection(`orgs/${orgId}/studentEnrollments`)
      .where("schoolId", "==", schoolId)
      .where("academicYearId", "==", academicYearId)
      .where("classId", "==", classId)
      .where("status", "==", "ACTIVE")
      .get();

    const enrollments = enrollmentsSnapshot.docs.flatMap((document) => {
      const data = document.data() as FirestoreRecord;
      const studentId = readString(data, ["studentId"]);

      return studentId ? [{ enrollmentId: document.id, studentId }] : [];
    });

    const uniqueStudentIds = Array.from(
      new Set(enrollments.map((enrollment) => enrollment.studentId)),
    );
    const studentEntries = await Promise.all(
      uniqueStudentIds.map(async (studentId) => {
        const snapshot = await db
          .doc(`orgs/${orgId}/students/${studentId}`)
          .get();

        return [
          studentId,
          snapshot.exists
            ? (snapshot.data() as FirestoreRecord)
            : undefined,
        ] as const;
      }),
    );
    const studentsById = new Map(studentEntries);

    const uniquePersonIds = Array.from(
      new Set(
        studentEntries
          .map(([, student]) => readString(student, ["personId"]))
          .filter(Boolean),
      ),
    );
    const personEntries = await Promise.all(
      uniquePersonIds.map(async (personId) => {
        const snapshot = await db.doc(`orgs/${orgId}/people/${personId}`).get();

        return [
          personId,
          snapshot.exists
            ? (snapshot.data() as FirestoreRecord)
            : undefined,
        ] as const;
      }),
    );
    const peopleById = new Map(personEntries);

    return {
      orgId,
      schoolId,
      academicYearId,
      classId,
      rows: enrollments.map(({ enrollmentId, studentId }) => {
        const student = studentsById.get(studentId);
        const personId = readString(student, ["personId"]);

        return {
          studentId,
          enrollmentId,
          displayName: resolveDisplayName({
            studentId,
            student,
            person: peopleById.get(personId),
          }),
        };
      }),
    };
  },
);
