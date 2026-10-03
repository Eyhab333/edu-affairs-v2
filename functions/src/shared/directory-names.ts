import { getFirestore } from "firebase-admin/firestore";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/** Resolves staff names with bounded Admin SDK getAll batches. */
export async function loadTeacherNames(orgId: string, personIds: string[]) {
  const db = getFirestore();
  const names = new Map<string, string>();
  const uniquePersonIds = unique(personIds);

  for (let start = 0; start < uniquePersonIds.length; start += 100) {
    const chunk = uniquePersonIds.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...chunk.map((personId) => db.doc(`orgs/${orgId}/people/${personId}`)),
    );

    snapshots.forEach((snapshot, index) => {
      const personId = chunk[index];
      const displayName = text(snapshot.data()?.displayName);
      if (personId && displayName) names.set(personId, displayName);
    });
  }

  return names;
}

/**
 * Resolves student names from the school directory first, then falls back to
 * the student/person records. Keys are `${schoolId}:${studentId}`.
 */
export async function loadMeasurementStudentNames(params: {
  orgId: string;
  lookups: Array<{ schoolId: string; studentId: string }>;
}) {
  const db = getFirestore();
  const uniqueLookups = Array.from(
    new Map(
      params.lookups
        .filter(({ schoolId, studentId }) => schoolId && studentId)
        .map((lookup) => [`${lookup.schoolId}:${lookup.studentId}`, lookup]),
    ).values(),
  );
  const names = new Map<string, string>();

  for (let start = 0; start < uniqueLookups.length; start += 100) {
    const lookupChunk = uniqueLookups.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...lookupChunk.map(({ schoolId, studentId }) =>
        db.doc(`orgs/${params.orgId}/schools/${schoolId}/studentDirectory/${studentId}`),
      ),
    );

    snapshots.forEach((snapshot, index) => {
      const lookup = lookupChunk[index];
      if (!lookup) return;
      const displayName = text(snapshot.data()?.displayName);
      if (displayName) names.set(`${lookup.schoolId}:${lookup.studentId}`, displayName);
    });
  }

  const unresolvedLookups = uniqueLookups.filter(
    ({ schoolId, studentId }) => !names.has(`${schoolId}:${studentId}`),
  );
  const studentsById = new Map<string, Row>();

  for (let start = 0; start < unresolvedLookups.length; start += 100) {
    const lookupChunk = unresolvedLookups.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...lookupChunk.map(({ studentId }) =>
        db.doc(`orgs/${params.orgId}/students/${studentId}`),
      ),
    );

    snapshots.forEach((snapshot, index) => {
      const lookup = lookupChunk[index];
      if (!lookup || !snapshot.exists) return;
      studentsById.set(lookup.studentId, row(snapshot.data()));
    });
  }

  const peopleById = new Map<string, Row>();
  const personIds = unique(
    Array.from(studentsById.values()).map((student) => text(student.personId)),
  );

  for (let start = 0; start < personIds.length; start += 100) {
    const personIdChunk = personIds.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...personIdChunk.map((personId) =>
        db.doc(`orgs/${params.orgId}/people/${personId}`),
      ),
    );

    snapshots.forEach((snapshot, index) => {
      const personId = personIdChunk[index];
      if (!personId || !snapshot.exists) return;
      peopleById.set(personId, row(snapshot.data()));
    });
  }

  unresolvedLookups.forEach(({ schoolId, studentId }) => {
    const student = studentsById.get(studentId);
    const person = peopleById.get(text(student?.personId));
    const displayName =
      text(person?.displayName) ||
      text(person?.fullName) ||
      text(person?.nameAr) ||
      text(person?.name) ||
      text(student?.displayName) ||
      text(student?.fullName) ||
      text(student?.nameAr) ||
      text(student?.name);

    if (displayName) names.set(`${schoolId}:${studentId}`, displayName);
  });

  return names;
}
