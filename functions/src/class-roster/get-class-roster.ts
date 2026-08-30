import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  Class,
  Membership,
  OperationalAssignment,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";
import { getVisibleClassesForActor } from "@takween/domain";

const REGION = "me-central2";

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

function readBoolean(value: unknown): boolean {
  return value === true;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeMembershipForAccess(params: {
  uid: string;
  orgId: string;
  id: string;
  data: FirestoreRecord;
}): Membership {
  const scopes = readRecord(params.data.scopes);
  const permissions = readRecord(params.data.permissions);
  const role = readString(params.data, ["roleKey", "role"]);

  return {
    id: params.id,
    uid: params.uid,
    personId: readString(params.data, ["personId"]),
    orgId: readString(params.data, ["orgId"]) || params.orgId,
    role: role as Membership["role"],
    roleKey: role as Membership["roleKey"],
    scopes: {
      schoolIds: readStringArray(scopes.schoolIds),
      gradeIds: readStringArray(scopes.gradeIds),
      classIds: readStringArray(scopes.classIds),
      scopeGroupIds: readStringArray(scopes.scopeGroupIds),
      subjectKeys: readStringArray(scopes.subjectKeys),
      routeIds: readStringArray(scopes.routeIds),
      canAccessAllSchools: readBoolean(scopes.canAccessAllSchools),
    },
    permissions: {
      manageOrg: readBoolean(permissions.manageOrg),
      manageSchools: readBoolean(permissions.manageSchools),
      manageDirectory: readBoolean(permissions.manageDirectory),
    },
    scopeType: readString(params.data, ["scopeType"]) as Membership["scopeType"],
    scopeId: readString(params.data, ["scopeId"]),
    isActive: isActiveMembership(params.data),
  } as Membership;
}

function asClass(params: { id: string; data: FirestoreRecord }): Class {
  return {
    id: params.id,
    ...params.data,
  } as Class;
}

function asOperationalAssignment(params: {
  id: string;
  data: FirestoreRecord;
}): OperationalAssignment {
  return {
    id: params.id,
    ...params.data,
    targetClassIds: readStringArray(params.data.targetClassIds),
    targetGradeIds: readStringArray(params.data.targetGradeIds),
  } as OperationalAssignment;
}

function asTeacherAssignment(params: {
  id: string;
  data: FirestoreRecord;
}): TeacherAssignment {
  return {
    id: params.id,
    ...params.data,
  } as TeacherAssignment;
}

function asTeacherAssignmentClassLink(params: {
  id: string;
  data: FirestoreRecord;
}): TeacherAssignmentClassLink {
  return {
    id: params.id,
    ...params.data,
  } as TeacherAssignmentClassLink;
}

async function hasClassRosterAccess(params: {
  uid: string;
  orgId: string;
  membership: Membership;
  classItem: Class;
}): Promise<boolean> {
  const db = getFirestore();
  const userSnapshot = await db.doc(`users/${params.uid}`).get();
  const user = userSnapshot.exists
    ? (userSnapshot.data() as FirestoreRecord)
    : undefined;
  const actorPersonId =
    params.membership.personId || readString(user, ["personId"]) || params.uid;

  const [operationalAssignmentsSnapshot, teacherAssignmentsSnapshot] =
    await Promise.all([
      db
        .collection(`orgs/${params.orgId}/operationalAssignments`)
        .where("actorPersonId", "==", actorPersonId)
        .get(),
      db
        .collection(`orgs/${params.orgId}/teacherAssignments`)
        .where("teacherPersonId", "==", actorPersonId)
        .get(),
    ]);

  const operationalAssignments = operationalAssignmentsSnapshot.docs.map(
    (document) =>
      asOperationalAssignment({
        id: document.id,
        data: document.data() as FirestoreRecord,
      }),
  );
  const teacherAssignments = teacherAssignmentsSnapshot.docs.map((document) =>
    asTeacherAssignment({
      id: document.id,
      data: document.data() as FirestoreRecord,
    }),
  );

  const linksSnapshots = await Promise.all(
    chunkArray(
      teacherAssignments.map((assignment) => assignment.id),
      10,
    ).map((assignmentIds) =>
      db
        .collection(`orgs/${params.orgId}/teacherAssignmentClassLinks`)
        .where("assignmentId", "in", assignmentIds)
        .get(),
    ),
  );
  const teacherAssignmentClassLinks = linksSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((document) =>
      asTeacherAssignmentClassLink({
        id: document.id,
        data: document.data() as FirestoreRecord,
      }),
    ),
  );

  return getVisibleClassesForActor({
    context: {
      actorPersonId,
      orgId: params.orgId,
      memberships: [params.membership],
      operationalAssignments,
      teacherAssignments,
      teacherAssignmentClassLinks,
    },
    classes: [params.classItem],
    teacherAssignmentClassLinks,
  }).some((visibleClass) => visibleClass.id === params.classItem.id);
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

    const classItem = asClass({
      id: classSnapshot.id,
      data: classSnapshot.data() as FirestoreRecord,
    });
    const accessMembership = normalizeMembershipForAccess({
      uid,
      orgId,
      id: membershipSnapshot.id,
      data: membership,
    });

    if (
      !(await hasClassRosterAccess({
        uid,
        orgId,
        membership: accessMembership,
        classItem,
      }))
    ) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this class roster.",
      );
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
