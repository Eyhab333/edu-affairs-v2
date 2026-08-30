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

type VisibleStudentRow = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
  classId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  streamId: string;
};

type GetVisibleStudentsResult = {
  orgId: string;
  rows: VisibleStudentRow[];
};

function requireDocumentId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  const id = value.trim();

  if (id.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} cannot contain '/'.`);
  }

  return id;
}

function readString(data: FirestoreRecord | undefined, keys: string[]): string {
  if (!data) return "";

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) return value.trim();
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

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeMembership(params: {
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
      canAccessAllSchools: scopes.canAccessAllSchools === true,
    },
    permissions: {
      manageOrg: permissions.manageOrg === true,
      manageSchools: permissions.manageSchools === true,
      manageDirectory: permissions.manageDirectory === true,
    },
    scopeType: readString(params.data, ["scopeType"]) as Membership["scopeType"],
    scopeId: readString(params.data, ["scopeId"]),
    isActive: isActiveMembership(params.data),
  } as Membership;
}

function makeClassKey(params: {
  schoolId: string;
  academicYearId: string;
  classId: string;
}) {
  return `${params.schoolId}::${params.academicYearId}::${params.classId}`;
}

async function getActorVisibleClasses(params: {
  uid: string;
  orgId: string;
}): Promise<Class[]> {
  const db = getFirestore();
  const membershipSnapshot = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();

  if (!membershipSnapshot.exists || !isActiveMembership(membershipSnapshot.data() as FirestoreRecord)) {
    throw new HttpsError("permission-denied", "Active organization membership is required.");
  }

  const membership = normalizeMembership({
    uid: params.uid,
    orgId: params.orgId,
    id: membershipSnapshot.id,
    data: membershipSnapshot.data() as FirestoreRecord,
  });
  const userSnapshot = await db.doc(`users/${params.uid}`).get();
  const user = userSnapshot.exists
    ? (userSnapshot.data() as FirestoreRecord)
    : undefined;
  const actorPersonId =
    membership.personId || readString(user, ["personId"]) || params.uid;

  const [operationalAssignmentsSnapshot, teacherAssignmentsSnapshot, schoolsSnapshot] =
    await Promise.all([
      db
        .collection(`orgs/${params.orgId}/operationalAssignments`)
        .where("actorPersonId", "==", actorPersonId)
        .get(),
      db
        .collection(`orgs/${params.orgId}/teacherAssignments`)
        .where("teacherPersonId", "==", actorPersonId)
        .get(),
      db.collection(`orgs/${params.orgId}/schools`).get(),
    ]);

  const operationalAssignments = operationalAssignmentsSnapshot.docs.map(
    (document) => ({
      id: document.id,
      ...document.data(),
      targetClassIds: readStringArray(document.data().targetClassIds),
      targetGradeIds: readStringArray(document.data().targetGradeIds),
    }) as OperationalAssignment,
  );
  const teacherAssignments = teacherAssignmentsSnapshot.docs.map(
    (document) => ({ id: document.id, ...document.data() }) as TeacherAssignment,
  );
  const linksSnapshots = await Promise.all(
    chunkArray(teacherAssignments.map((assignment) => assignment.id), 10).map(
      (assignmentIds) =>
        db
          .collection(`orgs/${params.orgId}/teacherAssignmentClassLinks`)
          .where("assignmentId", "in", assignmentIds)
          .get(),
    ),
  );
  const teacherAssignmentClassLinks = linksSnapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (document) =>
        ({ id: document.id, ...document.data() }) as TeacherAssignmentClassLink,
    ),
  );

  const academicYearSnapshots = await Promise.all(
    schoolsSnapshot.docs.map((school) =>
      school.ref.collection("academicYears").get(),
    ),
  );
  const classSnapshots = await Promise.all(
    academicYearSnapshots.flatMap((academicYears) =>
      academicYears.docs.map((academicYear) => academicYear.ref.collection("classes").get()),
    ),
  );
  const classes = classSnapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (document) => ({ id: document.id, ...document.data() }) as Class,
    ),
  );

  return getVisibleClassesForActor({
    context: {
      actorPersonId,
      orgId: params.orgId,
      memberships: [membership],
      operationalAssignments,
      teacherAssignments,
      teacherAssignmentClassLinks,
    },
    classes,
    teacherAssignmentClassLinks,
  });
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

export const getVisibleStudents = onCall(
  { region: REGION, cors: true },
  async (request): Promise<GetVisibleStudentsResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const orgId = requireDocumentId(readRecord(request.data).orgId, "orgId");
    const visibleClasses = await getActorVisibleClasses({ uid, orgId });
    const classByKey = new Map(
      visibleClasses.map((classItem) => [
        makeClassKey({
          schoolId: classItem.schoolId,
          academicYearId: classItem.academicYearId,
          classId: classItem.id,
        }),
        classItem,
      ]),
    );
    const schoolIds = Array.from(
      new Set(
        visibleClasses
          .map((classItem) => classItem.schoolId)
          .filter(Boolean),
      ),
    );
    const db = getFirestore();
    const enrollmentSnapshots = await Promise.all(
      chunkArray(schoolIds, 30).map((schoolIdChunk) =>
        db
          .collection(`orgs/${orgId}/studentEnrollments`)
          .where("schoolId", "in", schoolIdChunk)
          .where("status", "==", "ACTIVE")
          .get(),
      ),
    );
    const enrollments = enrollmentSnapshots
      .flatMap((snapshot) => snapshot.docs)
      .flatMap((document) => {
        const data = document.data() as FirestoreRecord;
        const studentId = readString(data, ["studentId"]);
        const schoolId = readString(data, ["schoolId"]);
        const academicYearId = readString(data, ["academicYearId"]);
        const classId = readString(data, ["classId"]);
        const classItem = classByKey.get(
          makeClassKey({ schoolId, academicYearId, classId }),
        );

        return studentId && classItem
          ? [{ id: document.id, studentId, schoolId, academicYearId, classId, data, classItem }]
          : [];
      });

    const studentIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.studentId)));
    const studentSnapshots = await Promise.all(
      studentIds.map((studentId) => db.doc(`orgs/${orgId}/students/${studentId}`).get()),
    );
    const studentsById = new Map(
      studentSnapshots.map((snapshot) => [
        snapshot.id,
        snapshot.exists ? (snapshot.data() as FirestoreRecord) : undefined,
      ]),
    );
    const personIds = Array.from(
      new Set(
        Array.from(studentsById.values())
          .map((student) => readString(student, ["personId"]))
          .filter(Boolean),
      ),
    );
    const personSnapshots = await Promise.all(
      personIds.map((personId) => db.doc(`orgs/${orgId}/people/${personId}`).get()),
    );
    const peopleById = new Map(
      personSnapshots.map((snapshot) => [
        snapshot.id,
        snapshot.exists ? (snapshot.data() as FirestoreRecord) : undefined,
      ]),
    );

    const rows = enrollments
      .map((enrollment) => {
        const student = studentsById.get(enrollment.studentId);
        const personId = readString(student, ["personId"]);

        return {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          displayName: resolveDisplayName({
            studentId: enrollment.studentId,
            student,
            person: peopleById.get(personId),
          }),
          classId: enrollment.classId,
          schoolId: enrollment.schoolId,
          academicYearId: enrollment.academicYearId,
          gradeId: readString(enrollment.data, ["gradeId"]) || enrollment.classItem.gradeId || "",
          streamId: readString(enrollment.data, ["streamId"]) || enrollment.classItem.streamId || "",
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return { orgId, rows };
  },
);
