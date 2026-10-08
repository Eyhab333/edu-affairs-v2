import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getSpecialStaffReportingAccess } from "@takween/domain";

const REGION = "me-central2";
const GET_ALL_CHUNK_SIZE = 100;

type Row = Record<string, unknown>;

type SummarySource = {
  schools: Array<{ id: string; name: string }>;
  classes: Array<Row & { id: string }>;
  templates: Array<Row & { id: string }>;
  batches: Array<Row & { id: string }>;
  teacherDirectory: Array<{
    assignmentId: string;
    teacherPersonId: string;
    teacherName: string;
  }>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function requiredId(value: unknown, name: string) {
  const result = text(value);
  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return result;
}

function unique(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.map((value) => text(value)).filter(Boolean)),
  );
}

function isActiveMembership(value: Row, now: number) {
  if (value.isActive === false || value.active === false) return false;
  if (text(value.status).toUpperCase() === "INACTIVE") return false;
  const startAt = typeof value.startAt === "number" ? value.startAt : null;
  const endAt = typeof value.endAt === "number" ? value.endAt : null;
  return !(startAt !== null && startAt > now) && !(endAt !== null && endAt < now);
}

function isActiveSchool(value: Row) {
  return (
    value.isArchived !== true &&
    value.archived !== true &&
    text(value.status).toUpperCase() !== "ARCHIVED"
  );
}

function isActiveClass(value: Row) {
  return (
    value.isArchived !== true &&
    value.archived !== true &&
    text(value.status).toUpperCase() !== "ARCHIVED"
  );
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function getDocumentsByPath(paths: string[]) {
  const db = getFirestore();
  const snapshots = await Promise.all(
    chunks(paths, GET_ALL_CHUNK_SIZE).map((chunk) =>
      db.getAll(...chunk.map((path) => db.doc(path))),
    ),
  );
  return snapshots.flat();
}

function emptySource(): SummarySource {
  return {
    schools: [],
    classes: [],
    templates: [],
    batches: [],
    teacherDirectory: [],
  };
}

export const getSpecialStaffMeasurementSummarySource = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "1GiB" },
  async (request): Promise<SummarySource> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = row(request.data);
    const orgId = requiredId(input.orgId, "orgId");
    const academicYearId = requiredId(input.academicYearId, "academicYearId");
    const termId = requiredId(input.termId, "termId");
    const db = getFirestore();
    const membershipSnapshot = await db
      .doc(`users/${request.auth.uid}/orgMemberships/${orgId}`)
      .get();
    const membership = row(membershipSnapshot.data());
    const personId = text(membership.personId);

    if (
      !membershipSnapshot.exists ||
      !personId ||
      !isActiveMembership(membership, Date.now())
    ) {
      throw new HttpsError(
        "permission-denied",
        "An active staff membership is required.",
      );
    }

    const specialReportingAccess = getSpecialStaffReportingAccess({
      orgId,
      personId,
      uid: request.auth.uid,
    });
    if (!specialReportingAccess) {
      throw new HttpsError(
        "permission-denied",
        "Special reporting access is required.",
      );
    }

    const schoolSnapshots = await getDocumentsByPath(
      specialReportingAccess.schoolIds.map(
        (schoolId) => `orgs/${orgId}/schools/${schoolId}`,
      ),
    );
    const schools = schoolSnapshots.flatMap((snapshot) => {
      const school = row(snapshot.data());
      return snapshot.exists && isActiveSchool(school)
        ? [
            {
              id: snapshot.id,
              name: text(school.name) || text(school.nameAr) || snapshot.id,
            },
          ]
        : [];
    });
    if (!schools.length) return emptySource();

    const [classSnapshots, batchSnapshots] = await Promise.all([
      Promise.all(
        schools.map((school) =>
          db
            .collection(
              `orgs/${orgId}/schools/${school.id}/academicYears/${academicYearId}/classes`,
            )
            .get(),
        ),
      ),
      Promise.all(
        schools.map((school) =>
          db
            .collection(`orgs/${orgId}/studentMeasurementBatches`)
            .where("schoolId", "==", school.id)
            .get(),
        ),
      ),
    ]);

    const classes = classSnapshots.flatMap((snapshot, index) =>
      snapshot.docs.flatMap((document) => {
        const classData = row(document.data());
        return isActiveClass(classData)
          ? [
              {
                ...classData,
                id: document.id,
                schoolId: text(classData.schoolId) || schools[index]!.id,
                academicYearId:
                  text(classData.academicYearId) || academicYearId,
              },
            ]
          : [];
      }),
    );
    const batches: Array<Row & { id: string }> = batchSnapshots.flatMap((snapshot) =>
      snapshot.docs.flatMap((document) => {
        const batch = row(document.data());
        return text(batch.academicYearId) === academicYearId &&
          text(batch.termId) === termId &&
          text(batch.status).toUpperCase() === "SUBMITTED"
          ? [{ ...batch, id: document.id }]
          : [];
      }),
    );

    const [templateSnapshot, assignmentSnapshots] = await Promise.all([
      db.collection(`orgs/${orgId}/studentAssessmentTemplates`).get(),
      getDocumentsByPath(
        unique(batches.map((batch) => text(batch.teacherAssignmentId))).map(
          (assignmentId) => `orgs/${orgId}/teacherAssignments/${assignmentId}`,
        ),
      ),
    ]);
    const allowedSchoolIds = new Set(schools.map((school) => school.id));
    const templates = templateSnapshot.docs.flatMap((snapshot) => {
      const template = row(snapshot.data());
      const templateSchoolId = text(template.schoolId);
      return text(template.academicYearId) === academicYearId &&
        (!templateSchoolId || allowedSchoolIds.has(templateSchoolId))
        ? [{ ...template, id: snapshot.id }]
        : [];
    });
    const assignmentById = new Map(
      assignmentSnapshots.flatMap((snapshot) => {
        const assignment = row(snapshot.data());
        const teacherPersonId = text(assignment.teacherPersonId);
        return snapshot.exists && teacherPersonId
          ? [[snapshot.id, teacherPersonId] as const]
          : [];
      }),
    );
    const peopleSnapshots = await getDocumentsByPath(
      unique(Array.from(assignmentById.values())).map(
        (teacherPersonId) => `orgs/${orgId}/people/${teacherPersonId}`,
      ),
    );
    const nameByPersonId = new Map(
      peopleSnapshots.flatMap((snapshot) => {
        const displayName = text(snapshot.data()?.displayName);
        return snapshot.exists && displayName
          ? [[snapshot.id, displayName] as const]
          : [];
      }),
    );
    const teacherDirectory = Array.from(assignmentById.entries()).map(
      ([assignmentId, teacherPersonId]) => ({
        assignmentId,
        teacherPersonId,
        teacherName: nameByPersonId.get(teacherPersonId) || "غير محدد",
      }),
    );

    return { schools, classes, templates, batches, teacherDirectory };
  },
);