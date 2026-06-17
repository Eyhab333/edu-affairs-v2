import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "me-central2";

type CommunicationTarget = {
  id: string;
  targetKind: "SCHOOL_ADMIN" | "CLASS_TEACHER" | "SUBJECT_TEACHER";
  title: string;
  subtitle: string;

  targetUid: string;
  targetPersonId: string;
  targetRoleKey: string;
  targetDisplayName: string;

  subjectKey: string;
  subjectTitle: string;
  classSubjectOfferingId: string;

  assignmentId: string;
};

type GetStudentCommunicationTargetsResult = {
  ok: true;
  orgId: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  gradeId: string;
  targets: CommunicationTarget[];
};

function readNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpsError("invalid-argument", `${fieldName} is required`);
  }

  return trimmed;
}

function readOptionalString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function readString(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readStringArray(
  data: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = data?.[key];

  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function isActiveRecord(data: Record<string, unknown>) {
  if (data.status && data.status !== "ACTIVE") return false;
  if (data.isActive === false) return false;
  if (data.active === false) return false;
  if (data.isArchived === true) return false;
  return true;
}

async function readDoc(path: string) {
  const db = getFirestore();
  const snap = await db.doc(path).get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    path: snap.ref.path,
    ...(snap.data() as Record<string, unknown>),
  };
}

async function findActiveGuardianLink(params: {
  orgId: string;
  guardianUid: string;
  studentId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/guardianLinks`)
    .where("guardianUid", "==", params.guardianUid)
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (
      data.studentId === params.studentId &&
      data.active === true &&
      data.isArchived !== true
    ) {
      return {
        id: doc.id,
        path: doc.ref.path,
        ...data,
      };
    }
  }

  return null;
}

async function findActiveEnrollment(params: {
  orgId: string;
  studentId: string;
  schoolId?: string;
  academicYearId?: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/studentEnrollments`)
    .where("studentId", "==", params.studentId)
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (!isActiveRecord(data)) continue;

    if (params.schoolId && data.schoolId !== params.schoolId) continue;

    if (
      params.academicYearId &&
      data.academicYearId !== params.academicYearId
    ) {
      continue;
    }

    return {
      id: doc.id,
      path: doc.ref.path,
      ...data,
    };
  }

  return null;
}

async function findMembershipByPersonId(params: {
  orgId: string;
  personId: string;
}) {
  if (!params.personId) return null;

  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/memberships`)
    .where("personId", "==", params.personId)
    .limit(10)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;

    if (isActiveRecord(data)) {
      return {
        id: doc.id,
        path: doc.ref.path,
        ...data,
      };
    }
  }

  return null;
}

function membershipCanAccessSchool(
  membership: Record<string, unknown>,
  schoolId: string,
) {
  const scopes = membership.scopes;

  if (!scopes || typeof scopes !== "object" || Array.isArray(scopes)) {
    return false;
  }

  const scopeData = scopes as Record<string, unknown>;

  if (scopeData.canAccessAllSchools === true) return true;

  const schoolIds = readStringArray(scopeData, "schoolIds");

  return schoolIds.includes(schoolId);
}

async function findSchoolAdminMembership(params: {
  orgId: string;
  schoolId: string;
}) {
  const db = getFirestore();

  const roleKeys = [
    "school_admin",
    "principal",
    "school_leader",
    "platform_owner",
  ];

  for (const roleKey of roleKeys) {
    const snap = await db
      .collection(`orgs/${params.orgId}/memberships`)
      .where("roleKey", "==", roleKey)
      .limit(20)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;

      if (!isActiveRecord(data)) continue;

      if (!membershipCanAccessSchool(data, params.schoolId)) continue;

      return {
        id: doc.id,
        path: doc.ref.path,
        ...data,
      };
    }
  }

  return null;
}

async function resolveDisplayName(params: {
  orgId: string;
  uid: string;
  personId: string;
  fallback: string;
}) {
  const user = params.uid ? await readDoc(`users/${params.uid}`) : null;
  const person = params.personId
    ? await readDoc(`orgs/${params.orgId}/people/${params.personId}`)
    : null;

  return (
    readString(user, "displayName") ||
    readString(user, "name") ||
    readString(person, "displayName") ||
    readString(person, "name") ||
    readString(person, "nameAr") ||
    readString(person, "email") ||
    params.fallback
  );
}

async function loadOfferings(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/classSubjectOfferings`)
    .where("classId", "==", params.classId)
    .limit(100)
    .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      path: doc.ref.path,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((item) => {
      if (!isActiveRecord(item)) return false;
      if (readString(item, "schoolId") !== params.schoolId) return false;
if (readString(item, "academicYearId") !== params.academicYearId) return false;
      return true;
    });
}

function findOfferingForAssignment(
  offerings: Array<Record<string, unknown>>,
  assignment: Record<string, unknown>,
) {
  const classSubjectOfferingId = readString(
    assignment,
    "classSubjectOfferingId",
  );
  const subjectKey = readString(assignment, "subjectKey");

  if (classSubjectOfferingId) {
    const byId = offerings.find((item) => item.id === classSubjectOfferingId);
    if (byId) return byId;
  }

  if (subjectKey) {
    const bySubject = offerings.find((item) => {
      return readString(item, "subjectKey") === subjectKey;
    });

    if (bySubject) return bySubject;
  }

  return null;
}

async function loadTeacherAssignments(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}) {
  const db = getFirestore();

  const snap = await db
    .collection(`orgs/${params.orgId}/teacherAssignments`)
    .where("schoolId", "==", params.schoolId)
    .limit(200)
    .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      path: doc.ref.path,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((item) => {
      if (!isActiveRecord(item)) return false;
      if (readString(item, "academicYearId") !== params.academicYearId) return false;

      const classId = readString(item, "classId");
      const targetScopeId = readString(item, "targetScopeId");

      if (classId && classId !== params.classId) return false;
      if (targetScopeId && targetScopeId !== params.classId) return false;

      if (!classId && !targetScopeId) return false;

      return true;
    });
}

function dedupeTargets(targets: CommunicationTarget[]) {
  const map = new Map<string, CommunicationTarget>();

  for (const target of targets) {
    const key = [
      target.targetKind,
      target.targetUid,
      target.subjectKey,
      target.classSubjectOfferingId,
    ].join(":");

    if (!map.has(key)) {
      map.set(key, target);
    }
  }

  return [...map.values()];
}

export const getStudentCommunicationTargets = onCall(
  {
    region: REGION,
  },
  async (request): Promise<GetStudentCommunicationTargetsResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to get communication targets.",
      );
    }

    const input = request.data as Record<string, unknown>;

    const orgId = readNonEmptyString(input.orgId, "orgId");
    const studentId = readNonEmptyString(input.studentId, "studentId");

    const requestedSchoolId = readOptionalString(input.schoolId);
    const requestedAcademicYearId = readOptionalString(input.academicYearId);

    const student = await readDoc(`orgs/${orgId}/students/${studentId}`);

    if (!student) {
      throw new HttpsError("not-found", "Student not found.");
    }

    const guardianLink = await findActiveGuardianLink({
      orgId,
      guardianUid: uid,
      studentId,
    });

    if (!guardianLink) {
      throw new HttpsError(
        "permission-denied",
        "You are not linked to this student.",
      );
    }

    const enrollment = await findActiveEnrollment({
      orgId,
      studentId,
      schoolId: requestedSchoolId,
      academicYearId: requestedAcademicYearId,
    });

    if (!enrollment) {
      throw new HttpsError(
        "failed-precondition",
        "No active enrollment found for this student.",
      );
    }

    const schoolId = readString(enrollment, "schoolId");
    const academicYearId = readString(enrollment, "academicYearId");
    const classId = readString(enrollment, "classId");
    const gradeId = readString(enrollment, "gradeId");

    const targets: CommunicationTarget[] = [];

    const schoolAdminMembership = await findSchoolAdminMembership({
      orgId,
      schoolId,
    });

    if (schoolAdminMembership) {
      const targetUid = readString(schoolAdminMembership, "uid");
      const targetPersonId =
        readString(schoolAdminMembership, "personId") || targetUid;
      const targetRoleKey =
        readString(schoolAdminMembership, "roleKey") ||
        readString(schoolAdminMembership, "role") ||
        "school_admin";

      if (targetUid) {
        targets.push({
          id: "school-admin",
          targetKind: "SCHOOL_ADMIN",
          title: "إدارة المدرسة",
          subtitle: "للاستفسارات العامة والمتابعة الإدارية الخاصة بالطالب.",

          targetUid,
          targetPersonId,
          targetRoleKey,
          targetDisplayName: "إدارة المدرسة",

          subjectKey: "",
          subjectTitle: "",
          classSubjectOfferingId: "",

          assignmentId: "",
        });
      }
    }

    const offerings = await loadOfferings({
      orgId,
      schoolId,
      academicYearId,
      classId,
    });

    const assignments = await loadTeacherAssignments({
      orgId,
      schoolId,
      academicYearId,
      classId,
    });

    for (const assignment of assignments) {
      const teacherPersonId = readString(assignment, "teacherPersonId");

      if (!teacherPersonId) continue;

      const membership = await findMembershipByPersonId({
        orgId,
        personId: teacherPersonId,
      });

      if (!membership) continue;

      const targetUid = readString(membership, "uid");

      if (!targetUid) continue;

      const targetRoleKey =
        readString(membership, "roleKey") ||
        readString(membership, "role") ||
        "teacher";

      const targetDisplayName = await resolveDisplayName({
        orgId,
        uid: targetUid,
        personId: teacherPersonId,
        fallback: "معلم",
      });

      const assignmentKind = readString(assignment, "assignmentKind");
      const subjectKey = readString(assignment, "subjectKey");
      const isClassTeacher =
        assignmentKind === "CLASS_TEACHER" || subjectKey === "GENERAL";

      const offering = findOfferingForAssignment(offerings, assignment);

      const resolvedSubjectKey =
        isClassTeacher
          ? "GENERAL"
          : subjectKey || readString(offering, "subjectKey");

      const subjectTitle =
        isClassTeacher
          ? "معلم الفصل"
          : readString(assignment, "subjectTitle") ||
            readString(assignment, "subjectName") ||
            readString(offering, "subjectTitle") ||
            readString(offering, "displayName") ||
            resolvedSubjectKey;

      const classSubjectOfferingId = isClassTeacher
        ? ""
        : readString(assignment, "classSubjectOfferingId") ||
          readString(offering, "id");

      targets.push({
        id: isClassTeacher
          ? `class-teacher:${targetUid}`
          : `subject-teacher:${resolvedSubjectKey}:${targetUid}`,
        targetKind: isClassTeacher ? "CLASS_TEACHER" : "SUBJECT_TEACHER",
        title: isClassTeacher ? "معلم الفصل" : `معلم ${subjectTitle}`,
        subtitle: isClassTeacher
          ? targetDisplayName
          : `${targetDisplayName} - ${subjectTitle}`,

        targetUid,
        targetPersonId: teacherPersonId,
        targetRoleKey,
        targetDisplayName,

        subjectKey: resolvedSubjectKey,
        subjectTitle,
        classSubjectOfferingId,

        assignmentId: readString(assignment, "id"),
      });
    }

    return {
      ok: true,
      orgId,
      studentId,
      schoolId,
      academicYearId,
      classId,
      gradeId,
      targets: dedupeTargets(targets),
    };
  },
);