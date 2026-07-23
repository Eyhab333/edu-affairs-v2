import { getFirestore } from "firebase-admin/firestore";

import { buildSchoolStudentDirectoryEntry } from "@takween/domain";

type FirestoreRecord = Record<string, unknown>;

export type BackfillSchoolStudentDirectoryInput = {
  orgId: string;
  schoolId: string;
};

export type BackfillSchoolStudentDirectoryResult = {
  orgId: string;
  schoolId: string;
  activeEnrollments: number;
  uniqueStudents: number;
  writtenEntries: number;
  missingStudents: number;
  missingPeople: number;
};

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

export async function backfillSchoolStudentDirectory(
  input: BackfillSchoolStudentDirectoryInput,
): Promise<BackfillSchoolStudentDirectoryResult> {
  const db = getFirestore();

  const enrollmentsSnapshot = await db
    .collection(`orgs/${input.orgId}/studentEnrollments`)
    .where("schoolId", "==", input.schoolId)
    .get();

  const activeEnrollments: Array<FirestoreRecord & { id: string }> =
    enrollmentsSnapshot.docs
      .map((document): FirestoreRecord & { id: string } => ({
        id: document.id,
        ...document.data(),
      }))
      .filter((enrollment) => enrollment.status === "ACTIVE")
      .filter(
        (enrollment) =>
          typeof enrollment.studentId === "string" &&
          enrollment.studentId.trim(),
      );

  const enrollmentByStudentId = new Map<string, FirestoreRecord>();

  for (const enrollment of activeEnrollments) {
    const studentId = String(enrollment.studentId).trim();

    if (!enrollmentByStudentId.has(studentId)) {
      enrollmentByStudentId.set(studentId, enrollment);
    }
  }

  let writtenEntries = 0;
  let missingStudents = 0;
  let missingPeople = 0;

  const nowIso = new Date().toISOString();
  let batch = db.batch();
  let batchSize = 0;

  for (const [studentId, enrollment] of enrollmentByStudentId) {
    const studentSnapshot = await db
      .doc(`orgs/${input.orgId}/students/${studentId}`)
      .get();

    const student = studentSnapshot.exists
      ? (studentSnapshot.data() as FirestoreRecord)
      : undefined;

    if (!student) {
      missingStudents += 1;
    }

    const personId = readString(student, ["personId"]);

    let person: FirestoreRecord | undefined;

    if (personId) {
      const personSnapshot = await db
        .doc(`orgs/${input.orgId}/people/${personId}`)
        .get();

      if (personSnapshot.exists) {
        person = personSnapshot.data() as FirestoreRecord;
      } else {
        missingPeople += 1;
      }
    } else {
      missingPeople += 1;
    }

    const displayName =
      readString(person, ["displayName", "fullName", "nameAr", "name"]) ||
      readString(student, ["displayName", "fullName", "nameAr", "name"]) ||
      readString(enrollment, [
        "studentDisplayName",
        "displayName",
        "studentName",
      ]) ||
      studentId;

    const entry = buildSchoolStudentDirectoryEntry({
      orgId: input.orgId,
      schoolId: input.schoolId,

      studentId,
      personId,

      displayName,

      nationalId: readString(person, ["nationalId", "nationalIdNumber"]),
      phone: readString(person, ["phone", "phoneNumber", "mobile"]),
      email: readString(person, ["email"]),

      isActive: true,
      updatedAtIso: nowIso,
    });

    const directoryRef = db.doc(
      `orgs/${input.orgId}/schools/${input.schoolId}/studentDirectory/${studentId}`,
    );

    batch.set(directoryRef, entry, { merge: true });

    writtenEntries += 1;
    batchSize += 1;

    if (batchSize === 400) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return {
    orgId: input.orgId,
    schoolId: input.schoolId,
    activeEnrollments: activeEnrollments.length,
    uniqueStudents: enrollmentByStudentId.size,
    writtenEntries,
    missingStudents,
    missingPeople,
  };
}
