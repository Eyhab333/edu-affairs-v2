import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "me-central2";

type FirestoreData = Record<string, unknown>;

type GuardianContext = {
  orgId: string;
  guardianId: string;
};

type ChildSeed = {
  orgId: string;
  studentId: string;
  relationType: string;
};

type ChildRecord = ChildSeed & {
  personId: string;
  enrollment: FirestoreData;
};

type ParentStudentSummary = {
  orgId: string;
  studentId: string;
  studentName: string;
  relationType: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  academicYearTitle: string;
  gradeId: string;
  gradeTitle: string;
  classId: string;
  classTitle: string;
};

function readString(data: FirestoreData | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(data: FirestoreData | undefined, key: string): number {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readLabel(
  data: FirestoreData | undefined,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = readString(data, key);
    if (value) return value;
  }

  return fallback;
}

function isActiveGuardianLink(data: FirestoreData, now: number): boolean {
  if (data.active === false || data.isActive === false) return false;
  if (data.isArchived === true) return false;

  const status = readString(data, "status");
  if (["INACTIVE", "DELETED", "CANCELLED"].includes(status)) {
    return false;
  }

  const startAt = readNumber(data, "startAt");
  const endAt = readNumber(data, "endAt");

  if (startAt > now) return false;
  if (endAt > 0 && endAt < now) return false;

  return true;
}

function isGuardianOwnedByUser(params: {
  data: FirestoreData;
  orgId: string;
  userPersonId: string;
  uid: string;
}): boolean {
  const { data, orgId, userPersonId, uid } = params;

  if (data.isArchived === true) return false;
  if (readString(data, "personId") !== userPersonId) return false;

  const declaredOrgId = readString(data, "orgId");
  if (declaredOrgId && declaredOrgId !== orgId) return false;

  const linkedUids = ["uid", "authUid", "userUid"]
    .map((key) => readString(data, key))
    .filter(Boolean);

  return linkedUids.length === 0 || linkedUids.includes(uid);
}

function resolveOrgId(ref: DocumentReference): string {
  const orgRef = ref.parent.parent;

  if (!orgRef || orgRef.parent.id !== "orgs") {
    return "";
  }

  return orgRef.id;
}

function uniqueRefs(refs: DocumentReference[]): DocumentReference[] {
  return Array.from(
    new Map(refs.map((ref) => [ref.path, ref])).values(),
  );
}

async function loadDataByPath(params: {
  db: Firestore;
  refs: DocumentReference[];
}): Promise<Map<string, FirestoreData>> {
  const result = new Map<string, FirestoreData>();
  const refs = uniqueRefs(params.refs);

  if (refs.length === 0) return result;

  const snapshots = await params.db.getAll(...refs);

  for (const snapshot of snapshots) {
    if (snapshot.exists) {
      result.set(snapshot.ref.path, snapshot.data() ?? {});
    }
  }

  return result;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function loadActiveEnrollments(params: {
  db: Firestore;
  children: Array<ChildSeed & { personId: string }>;
}): Promise<Map<string, FirestoreData>> {
  const byOrg = new Map<string, string[]>();

  for (const child of params.children) {
    const ids = byOrg.get(child.orgId) ?? [];
    ids.push(child.studentId);
    byOrg.set(child.orgId, ids);
  }

  const enrollments = new Map<string, FirestoreData>();

  for (const [orgId, studentIds] of byOrg) {
    for (const studentIdChunk of chunk(
      Array.from(new Set(studentIds)),
      10,
    )) {
      const snapshot = await params.db
        .collection(`orgs/${orgId}/studentEnrollments`)
        .where("studentId", "in", studentIdChunk)
        .get();

      for (const document of snapshot.docs) {
        const data = document.data() as FirestoreData;
        const studentId = readString(data, "studentId");

        if (!studentId || readString(data, "status") !== "ACTIVE") {
          continue;
        }

        if (data.isArchived === true) continue;

        const declaredOrgId = readString(data, "orgId");
        if (declaredOrgId && declaredOrgId !== orgId) continue;

        const key = `${orgId}::${studentId}`;
        const existing = enrollments.get(key);

        if (
          !existing ||
          readNumber(data, "updatedAt") > readNumber(existing, "updatedAt")
        ) {
          enrollments.set(key, data);
        }
      }
    }
  }

  return enrollments;
}

function relationPriority(relationType: string): number {
  switch (relationType) {
    case "FATHER":
      return 0;
    case "MOTHER":
      return 1;
    default:
      return 2;
  }
}

/**
 * Returns only students whose guardian record and active GuardianLink belong
 * to the authenticated user. No organization or student identifier is
 * accepted from the client.
 */
export const getMyGuardianChildren = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const db = getFirestore();
    const userSnapshot = await db.doc(`users/${uid}`).get();

    if (!userSnapshot.exists) {
      throw new HttpsError(
        "failed-precondition",
        "User profile is not available.",
      );
    }

    const userPersonId = readString(
      userSnapshot.data() as FirestoreData | undefined,
      "personId",
    );

    if (!userPersonId) {
      throw new HttpsError(
        "failed-precondition",
        "User profile is not linked to a person.",
      );
    }

    const now = Date.now();
    const guardianSnapshot = await db
      .collectionGroup("guardians")
      .where("personId", "==", userPersonId)
      .get();

    const guardians: GuardianContext[] = [];

    for (const document of guardianSnapshot.docs) {
      const orgId = resolveOrgId(document.ref);
      const data = document.data() as FirestoreData;

      if (
        !orgId ||
        !isGuardianOwnedByUser({
          data,
          orgId,
          userPersonId,
          uid,
        })
      ) {
        continue;
      }

      guardians.push({ orgId, guardianId: document.id });
    }

    const childrenByKey = new Map<string, ChildSeed>();

    for (const guardian of guardians) {
      const linksSnapshot = await db
        .collection(`orgs/${guardian.orgId}/guardianLinks`)
        .where("guardianId", "==", guardian.guardianId)
        .get();

      for (const document of linksSnapshot.docs) {
        const data = document.data() as FirestoreData;
        const studentId = readString(data, "studentId");
        const declaredOrgId = readString(data, "orgId");
        const guardianUid = readString(data, "guardianUid");

        if (!studentId || !isActiveGuardianLink(data, now)) continue;
        if (declaredOrgId && declaredOrgId !== guardian.orgId) continue;
        if (guardianUid && guardianUid !== uid) continue;

        const relationType = readString(data, "relationType") || "OTHER";
        const key = `${guardian.orgId}::${studentId}`;
        const existing = childrenByKey.get(key);

        if (
          !existing ||
          relationPriority(relationType) <
            relationPriority(existing.relationType)
        ) {
          childrenByKey.set(key, {
            orgId: guardian.orgId,
            studentId,
            relationType,
          });
        }
      }
    }

    const childSeeds = Array.from(childrenByKey.values());
    const studentDataByPath = await loadDataByPath({
      db,
      refs: childSeeds.map((child) =>
        db.doc(`orgs/${child.orgId}/students/${child.studentId}`),
      ),
    });

    const childrenWithoutEnrollment = childSeeds.flatMap((seed) => {
      const data = studentDataByPath.get(
        `orgs/${seed.orgId}/students/${seed.studentId}`,
      );

      if (!data || data.isArchived === true) return [];

      const declaredOrgId = readString(data, "orgId");
      if (declaredOrgId && declaredOrgId !== seed.orgId) return [];

      return [
        {
          ...seed,
          personId: readString(data, "personId"),
        },
      ];
    });

    const enrollmentByChildKey = await loadActiveEnrollments({
      db,
      children: childrenWithoutEnrollment,
    });

    const children: ChildRecord[] = childrenWithoutEnrollment.map((child) => ({
      ...child,
      enrollment:
        enrollmentByChildKey.get(`${child.orgId}::${child.studentId}`) ?? {},
    }));

    const peopleDataByPath = await loadDataByPath({
      db,
      refs: children
        .filter((child) => child.personId)
        .map((child) =>
          db.doc(`orgs/${child.orgId}/people/${child.personId}`),
        ),
    });

    const schoolDataByPath = await loadDataByPath({
      db,
      refs: children
        .filter((child) => Boolean(readString(child.enrollment, "schoolId")))
        .map((child) => {
          const schoolId = readString(child.enrollment, "schoolId");
          return db.doc(`orgs/${child.orgId}/schools/${schoolId}`);
        }),
    });

    const academicYearRefs: DocumentReference[] = [];
    const gradeRefs: DocumentReference[] = [];
    const classRefs: DocumentReference[] = [];

    for (const child of children) {
      const schoolId = readString(child.enrollment, "schoolId");
      const academicYearId = readString(child.enrollment, "academicYearId");
      const gradeId = readString(child.enrollment, "gradeId");
      const classId = readString(child.enrollment, "classId");

      if (!schoolId || !academicYearId) continue;

      const academicPath =
        `orgs/${child.orgId}/schools/${schoolId}/academicYears/${academicYearId}`;

      academicYearRefs.push(db.doc(academicPath));

      if (gradeId) {
        gradeRefs.push(db.doc(`${academicPath}/grades/${gradeId}`));
      }

      if (classId) {
        classRefs.push(db.doc(`${academicPath}/classes/${classId}`));
      }
    }

    const [academicYearDataByPath, gradeDataByPath, classDataByPath] =
      await Promise.all([
        loadDataByPath({ db, refs: academicYearRefs }),
        loadDataByPath({ db, refs: gradeRefs }),
        loadDataByPath({ db, refs: classRefs }),
      ]);

    const summaries: ParentStudentSummary[] = children.map((child) => {
      const schoolId = readString(child.enrollment, "schoolId");
      const academicYearId = readString(child.enrollment, "academicYearId");
      const gradeId = readString(child.enrollment, "gradeId");
      const classId = readString(child.enrollment, "classId");
      const academicPath = schoolId && academicYearId
        ? `orgs/${child.orgId}/schools/${schoolId}/academicYears/${academicYearId}`
        : "";

      return {
        orgId: child.orgId,
        studentId: child.studentId,
        studentName: readLabel(
          peopleDataByPath.get(
            `orgs/${child.orgId}/people/${child.personId}`,
          ),
          ["displayName", "fullName", "name"],
          "طالب بدون اسم",
        ),
        relationType: child.relationType,
        schoolId,
        schoolName: readLabel(
          schoolId
            ? schoolDataByPath.get(`orgs/${child.orgId}/schools/${schoolId}`)
            : undefined,
          ["name", "nameAr", "title"],
          schoolId,
        ),
        academicYearId,
        academicYearTitle: readLabel(
          academicPath ? academicYearDataByPath.get(academicPath) : undefined,
          ["title", "name"],
          academicYearId,
        ),
        gradeId,
        gradeTitle: readLabel(
          academicPath && gradeId
            ? gradeDataByPath.get(`${academicPath}/grades/${gradeId}`)
            : undefined,
          ["title", "name"],
          gradeId,
        ),
        classId,
        classTitle: readLabel(
          academicPath && classId
            ? classDataByPath.get(`${academicPath}/classes/${classId}`)
            : undefined,
          ["title", "name"],
          classId,
        ),
      };
    });

    summaries.sort((first, second) =>
      first.studentName.localeCompare(second.studentName, "ar"),
    );

    return {
      ok: true,
      children: summaries,
    };
  },
);
