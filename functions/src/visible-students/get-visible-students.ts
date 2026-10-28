import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { WEB_STAFF_CORS_ORIGINS } from "../shared/cors";
import type {
  Class,
  Membership,
  OperationalAssignment,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";
import { getVisibleClassesForActor } from "@takween/domain";
import { getActorSupervisionSchoolIds } from "../access/get-actor-supervision-school-ids";

const REGION = "me-central2";
const DOCUMENT_READ_BATCH_SIZE = 100;

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

async function loadDocumentsById(params: {
  db: Firestore;
  orgId: string;
  collectionId: "students" | "people";
  ids: string[];
}) {
  const documents = new Map<string, FirestoreRecord | undefined>();

  for (const idChunk of chunkArray(params.ids, DOCUMENT_READ_BATCH_SIZE)) {
    const snapshots = await params.db.getAll(
      ...idChunk.map((id) =>
        params.db.doc(`orgs/${params.orgId}/${params.collectionId}/${id}`),
      ),
    );

    for (const snapshot of snapshots) {
      documents.set(
        snapshot.id,
        snapshot.exists
          ? (snapshot.data() as FirestoreRecord)
          : undefined,
      );
    }
  }

  return documents;
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

  const [operationalAssignmentsSnapshot, teacherAssignmentsSnapshot, schoolsSnapshot, supervisionSchoolIds] =
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
      getActorSupervisionSchoolIds({
        orgId: params.orgId,
        personId: actorPersonId,
      }),
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
      supervisionSchoolIds,
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

function logVisibleStudentsFailure(params: {
  error: unknown;
  stage: string;
  orgId: string;
  visibleClassCount: number;
  visibleSchoolCount: number;
  enrollmentRecordCount: number;
  studentDocumentRequestCount: number;
  studentDocumentCount: number;
  personDocumentRequestCount: number;
  personDocumentCount: number;
}) {
  const errorRecord =
    params.error && typeof params.error === "object"
      ? (params.error as Record<string, unknown>)
      : {};
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : typeof errorRecord.message === "string"
        ? errorRecord.message
        : String(params.error);
  const errorStack =
    params.error instanceof Error
      ? params.error.stack
      : typeof errorRecord.stack === "string"
        ? errorRecord.stack
        : undefined;
  const firestoreErrorCode =
    typeof errorRecord.code === "string" ||
    typeof errorRecord.code === "number"
      ? errorRecord.code
      : undefined;

  logger.error("getVisibleStudents failed", {
    functionName: "getVisibleStudents",
    stage: params.stage,
    orgId: params.orgId,
    visibleClassCount: params.visibleClassCount,
    visibleSchoolCount: params.visibleSchoolCount,
    enrollmentRecordCount: params.enrollmentRecordCount,
    studentDocumentRequestCount: params.studentDocumentRequestCount,
    studentDocumentCount: params.studentDocumentCount,
    personDocumentRequestCount: params.personDocumentRequestCount,
    personDocumentCount: params.personDocumentCount,
    firestoreErrorCode,
    errorMessage,
    errorStack,
  });
}

function toCallableError(error: unknown) {
  return error instanceof HttpsError
    ? error
    : new HttpsError("internal", "Unable to load visible students.");
}

export const getVisibleStudents = onCall(
  { region: REGION, cors: WEB_STAFF_CORS_ORIGINS, memory: "1GiB" },
  async (request): Promise<GetVisibleStudentsResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const orgId = requireDocumentId(readRecord(request.data).orgId, "orgId");
    let visibleClassCount = 0;
    let visibleSchoolCount = 0;
    let enrollmentRecordCount = 0;
    let studentDocumentRequestCount = 0;
    let studentDocumentCount = 0;
    let personDocumentRequestCount = 0;
    let personDocumentCount = 0;
    let visibleClasses: Class[] = [];

    try {
      visibleClasses = await getActorVisibleClasses({ uid, orgId });
      visibleClassCount = visibleClasses.length;
    } catch (error) {
      logVisibleStudentsFailure({
        error,
        stage: "resolve-visible-classes",
        orgId,
        visibleClassCount,
        visibleSchoolCount,
        enrollmentRecordCount,
        studentDocumentRequestCount,
        studentDocumentCount,
        personDocumentRequestCount,
        personDocumentCount,
      });
      throw toCallableError(error);
    }
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
    visibleSchoolCount = schoolIds.length;
    const db = getFirestore();
    const enrollmentSnapshots = await (async () => {
      try {
        return await Promise.all(
          chunkArray(schoolIds, 30).map((schoolIdChunk) =>
            db
              .collection(`orgs/${orgId}/studentEnrollments`)
              .where("schoolId", "in", schoolIdChunk)
              .where("status", "==", "ACTIVE")
              .get(),
          ),
        );
      } catch (error) {
        logVisibleStudentsFailure({
          error,
          stage: "query-active-enrollments",
          orgId,
          visibleClassCount,
          visibleSchoolCount,
          enrollmentRecordCount,
          studentDocumentRequestCount,
          studentDocumentCount,
          personDocumentRequestCount,
          personDocumentCount,
        });
        throw toCallableError(error);
      }
    })();
    enrollmentRecordCount = enrollmentSnapshots.reduce(
      (count, snapshot) => count + snapshot.size,
      0,
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

    const studentIds = Array.from(
      new Set(enrollments.map((enrollment) => enrollment.studentId)),
    );
    studentDocumentRequestCount = studentIds.length;
    const studentsById = await (async () => {
      try {
        return await loadDocumentsById({
          db,
          orgId,
          collectionId: "students",
          ids: studentIds,
        });
      } catch (error) {
        logVisibleStudentsFailure({
          error,
          stage: "load-students",
          orgId,
          visibleClassCount,
          visibleSchoolCount,
          enrollmentRecordCount,
          studentDocumentRequestCount,
          studentDocumentCount,
          personDocumentRequestCount,
          personDocumentCount,
        });
        throw toCallableError(error);
      }
    })();
    studentDocumentCount = Array.from(studentsById.values()).filter(Boolean).length;
    const personIds = Array.from(
      new Set(
        Array.from(studentsById.values())
          .map((student) => readString(student, ["personId"]))
          .filter(Boolean),
      ),
    );
    personDocumentRequestCount = personIds.length;
    const peopleById = await (async () => {
      try {
        return await loadDocumentsById({
          db,
          orgId,
          collectionId: "people",
          ids: personIds,
        });
      } catch (error) {
        logVisibleStudentsFailure({
          error,
          stage: "load-people",
          orgId,
          visibleClassCount,
          visibleSchoolCount,
          enrollmentRecordCount,
          studentDocumentRequestCount,
          studentDocumentCount,
          personDocumentRequestCount,
          personDocumentCount,
        });
        throw toCallableError(error);
      }
    })();
    personDocumentCount = Array.from(peopleById.values()).filter(Boolean).length;

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

    logger.info("getVisibleStudents completed", {
      functionName: "getVisibleStudents",
      orgId,
      visibleClassCount,
      visibleSchoolCount,
      enrollmentRecordCount,
      studentDocumentRequestCount,
      studentDocumentCount,
      personDocumentRequestCount,
      personDocumentCount,
      rowCount: rows.length,
    });

    return { orgId, rows };
  },
);
