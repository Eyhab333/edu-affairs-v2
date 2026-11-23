import "server-only";

import type { Firestore } from "firebase-admin/firestore";

type FirestoreRecord = Record<string, unknown>;

export type ClassStudentStatisticsMode = "current" | "year";

export type AcademicYearOption = {
  id: string;
  title: string;
};

export type ClassStudentStatisticsRow = {
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  academicYearTitle: string;
  gradeId: string;
  gradeTitle: string;
  classId: string;
  classTitle: string;
  studentCount: number;
};

export type ClassStudentStatisticsSchoolGroup = {
  schoolId: string;
  schoolName: string;
  rows: ClassStudentStatisticsRow[];
  totalStudents: number;
};

export type ClassStudentStatisticsReport = {
  scope: {
    mode: ClassStudentStatisticsMode;
    academicYearId: string | null;
    title: string;
  };
  summary: {
    schoolCount: number;
    classCount: number;
    studentCount: number;
  };
  groups: ClassStudentStatisticsSchoolGroup[];
};

type EnrollmentRecord = {
  id: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  classId: string;
  status: string;
  startAt: number;
  createdAt: number;
  updatedAt: number;
};

type SchoolRecord = {
  id: string;
  name: string;
};

type StructureContext = {
  school: SchoolRecord;
  academicYearTitle: string;
  academicYearIsActive: boolean;
  grades: Map<string, string>;
  classes: Map<string, { title: string; gradeId: string }>;
};

const HISTORICAL_PLACEMENT_STATUSES = new Set([
  "ACTIVE",
  "COMPLETED",
  "REPEATING",
  "TRANSFERRED",
  "WITHDRAWN",
  "SUSPENDED",
]);

function readString(data: FirestoreRecord | undefined, field: string) {
  const value = data?.[field];
  return typeof value === "string" ? value.trim() : "";
}

function readTimestamp(data: FirestoreRecord | undefined, field: string) {
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function labelFor(data: FirestoreRecord | undefined, fallback: string) {
  return (
    readString(data, "nameAr") ||
    readString(data, "title") ||
    readString(data, "name") ||
    readString(data, "displayName") ||
    readString(data, "shortTitle") ||
    readString(data, "shortName") ||
    readString(data, "code") ||
    fallback
  );
}

function contextKey(schoolId: string, academicYearId: string) {
  return `${schoolId}::${academicYearId}`;
}

function isArchived(data: FirestoreRecord | undefined) {
  return (
    data?.isArchived === true ||
    data?.archived === true ||
    readString(data, "status").toUpperCase() === "ARCHIVED"
  );
}

function toEnrollment(id: string, data: FirestoreRecord): EnrollmentRecord {
  return {
    id,
    studentId: readString(data, "studentId"),
    schoolId: readString(data, "schoolId"),
    academicYearId: readString(data, "academicYearId"),
    gradeId: readString(data, "gradeId"),
    classId: readString(data, "classId"),
    status: readString(data, "status").toUpperCase(),
    startAt: readTimestamp(data, "startAt"),
    createdAt: readTimestamp(data, "createdAt"),
    updatedAt: readTimestamp(data, "updatedAt"),
  };
}

function compareLatestEnrollment(left: EnrollmentRecord, right: EnrollmentRecord) {
  return (
    right.updatedAt - left.updatedAt ||
    right.startAt - left.startAt ||
    right.createdAt - left.createdAt ||
    right.id.localeCompare(left.id)
  );
}

function selectCurrentEnrollments(params: {
  enrollments: EnrollmentRecord[];
  activeYearByContext: Map<string, boolean>;
  archivedStudentIds: Set<string>;
}) {
  const byStudent = new Map<string, EnrollmentRecord[]>();

  for (const enrollment of params.enrollments) {
    if (!enrollment.studentId || !enrollment.schoolId || !enrollment.classId) continue;
    if (params.archivedStudentIds.has(enrollment.studentId)) continue;

    const existing = byStudent.get(enrollment.studentId) ?? [];
    existing.push(enrollment);
    byStudent.set(enrollment.studentId, existing);
  }

  return Array.from(byStudent.values()).flatMap((items) => {
    const selected = [...items].sort((left, right) => {
      const activeYearDifference =
        Number(
          params.activeYearByContext.get(
            contextKey(right.schoolId, right.academicYearId),
          ) === true,
        ) -
        Number(
          params.activeYearByContext.get(
            contextKey(left.schoolId, left.academicYearId),
          ) === true,
        );

      if (activeYearDifference !== 0) return activeYearDifference;
      return (
        right.startAt - left.startAt ||
        right.updatedAt - left.updatedAt ||
        right.createdAt - left.createdAt ||
        right.id.localeCompare(left.id)
      );
    })[0];

    return selected ? [selected] : [];
  });
}

function selectHistoricalEnrollments(enrollments: EnrollmentRecord[]) {
  const byStudent = new Map<string, EnrollmentRecord[]>();

  for (const enrollment of enrollments) {
    if (!enrollment.studentId || !enrollment.schoolId || !enrollment.classId) continue;
    if (!HISTORICAL_PLACEMENT_STATUSES.has(enrollment.status)) continue;

    const existing = byStudent.get(enrollment.studentId) ?? [];
    existing.push(enrollment);
    byStudent.set(enrollment.studentId, existing);
  }

  return Array.from(byStudent.values()).flatMap((items) => {
    const selected = [...items].sort(compareLatestEnrollment)[0];
    return selected ? [selected] : [];
  });
}

async function loadSchools(db: Firestore, orgId: string) {
  const snapshot = await db.collection(`orgs/${orgId}/schools`).get();
  const schools = new Map<string, SchoolRecord>();

  snapshot.docs.forEach((item) => {
    const data = item.data() as FirestoreRecord;
    if (isArchived(data)) return;
    schools.set(item.id, { id: item.id, name: labelFor(data, item.id) });
  });

  return schools;
}

export async function loadAvailableAcademicYears(params: {
  db: Firestore;
  orgId: string;
}): Promise<AcademicYearOption[]> {
  const schools = await loadSchools(params.db, params.orgId);
  const yearsById = new Map<string, AcademicYearOption>();

  await Promise.all(
    Array.from(schools.keys()).map(async (schoolId) => {
      const snapshot = await params.db
        .collection(`orgs/${params.orgId}/schools/${schoolId}/academicYears`)
        .get();

      snapshot.docs.forEach((item) => {
        const data = item.data() as FirestoreRecord;
        if (isArchived(data)) return;
        if (readString(data, "orgId") && readString(data, "orgId") !== params.orgId) {
          return;
        }
        if (readString(data, "schoolId") && readString(data, "schoolId") !== schoolId) {
          return;
        }
        if (!yearsById.has(item.id)) {
          yearsById.set(item.id, { id: item.id, title: labelFor(data, item.id) });
        }
      });
    }),
  );

  return Array.from(yearsById.values()).sort((left, right) =>
    right.title.localeCompare(left.title, "ar"),
  );
}

async function loadStructureContexts(params: {
  db: Firestore;
  orgId: string;
  enrollments: EnrollmentRecord[];
  schools: Map<string, SchoolRecord>;
}) {
  const requestedContexts = Array.from(
    new Map(
      params.enrollments
        .filter((item) => item.schoolId && item.academicYearId)
        .map((item) => [contextKey(item.schoolId, item.academicYearId), item]),
    ).values(),
  );
  const contexts = new Map<string, StructureContext>();

  await Promise.all(
    requestedContexts.map(async (item) => {
      const school = params.schools.get(item.schoolId) ?? {
        id: item.schoolId,
        name: item.schoolId,
      };
      const yearPath = `orgs/${params.orgId}/schools/${item.schoolId}/academicYears/${item.academicYearId}`;
      const [yearSnapshot, gradesSnapshot, classesSnapshot] = await Promise.all([
        params.db.doc(yearPath).get(),
        params.db.collection(`${yearPath}/grades`).get(),
        params.db.collection(`${yearPath}/classes`).get(),
      ]);
      const yearData = yearSnapshot.exists
        ? (yearSnapshot.data() as FirestoreRecord)
        : undefined;
      const grades = new Map<string, string>();
      const classes = new Map<string, { title: string; gradeId: string }>();

      gradesSnapshot.docs.forEach((grade) => {
        grades.set(grade.id, labelFor(grade.data() as FirestoreRecord, grade.id));
      });
      classesSnapshot.docs.forEach((classItem) => {
        const data = classItem.data() as FirestoreRecord;
        const title = labelFor(data, classItem.id);
        const sectionLabel = readString(data, "sectionLabel");
        classes.set(classItem.id, {
          title:
            sectionLabel && sectionLabel !== title
              ? `${title} - ${sectionLabel}`
              : title,
          gradeId: readString(data, "gradeId"),
        });
      });

      contexts.set(contextKey(item.schoolId, item.academicYearId), {
        school,
        academicYearTitle: labelFor(yearData, item.academicYearId),
        academicYearIsActive: yearData?.isActive === true,
        grades,
        classes,
      });
    }),
  );

  return contexts;
}

function buildReportRows(params: {
  enrollments: EnrollmentRecord[];
  contexts: Map<string, StructureContext>;
}) {
  const studentIdsByClass = new Map<string, Set<string>>();
  const rowContext = new Map<string, EnrollmentRecord>();

  for (const enrollment of params.enrollments) {
    const key = `${enrollment.schoolId}::${enrollment.academicYearId}::${enrollment.classId}`;
    const studentIds = studentIdsByClass.get(key) ?? new Set<string>();
    studentIds.add(enrollment.studentId);
    studentIdsByClass.set(key, studentIds);
    rowContext.set(key, enrollment);
  }

  return Array.from(studentIdsByClass.entries()).map(([key, studentIds]) => {
    const enrollment = rowContext.get(key)!;
    const context = params.contexts.get(
      contextKey(enrollment.schoolId, enrollment.academicYearId),
    );
    const classInfo = context?.classes.get(enrollment.classId);
    const gradeId = enrollment.gradeId || classInfo?.gradeId || "";

    return {
      schoolId: enrollment.schoolId,
      schoolName: context?.school.name || enrollment.schoolId,
      academicYearId: enrollment.academicYearId,
      academicYearTitle: context?.academicYearTitle || enrollment.academicYearId,
      gradeId,
      gradeTitle: gradeId
        ? context?.grades.get(gradeId) || gradeId
        : "غير محدد",
      classId: enrollment.classId,
      classTitle: classInfo?.title || enrollment.classId,
      studentCount: studentIds.size,
    } satisfies ClassStudentStatisticsRow;
  });
}

export async function buildClassStudentStatisticsReport(params: {
  db: Firestore;
  orgId: string;
  mode: ClassStudentStatisticsMode;
  academicYearId?: string;
}): Promise<ClassStudentStatisticsReport> {
  const { db, orgId, mode } = params;
  const academicYearId = params.academicYearId?.trim() || "";

  if (mode === "year" && !academicYearId) {
    throw new Error("ACADEMIC_YEAR_REQUIRED");
  }

  const schools = await loadSchools(db, orgId);
  const availableYears = await loadAvailableAcademicYears({ db, orgId });

  if (mode === "year" && !availableYears.some((item) => item.id === academicYearId)) {
    throw new Error("ACADEMIC_YEAR_NOT_FOUND");
  }

  const enrollmentsSnapshot = await (mode === "current"
    ? db
        .collection(`orgs/${orgId}/studentEnrollments`)
        .where("status", "==", "ACTIVE")
        .get()
    : db
        .collection(`orgs/${orgId}/studentEnrollments`)
        .where("academicYearId", "==", academicYearId)
        .get());

  const enrollments = enrollmentsSnapshot.docs
    .map((item) => toEnrollment(item.id, item.data() as FirestoreRecord))
    .filter((item) => !!item.studentId && !!item.schoolId && !!item.academicYearId);
  const contexts = await loadStructureContexts({
    db,
    orgId,
    enrollments,
    schools,
  });

  let selectedEnrollments: EnrollmentRecord[];
  if (mode === "current") {
    const studentsSnapshot = await db.collection(`orgs/${orgId}/students`).get();
    const archivedStudentIds = new Set(
      studentsSnapshot.docs
        .filter((item) => isArchived(item.data() as FirestoreRecord))
        .map((item) => item.id),
    );
    const activeYearByContext = new Map(
      Array.from(contexts.entries()).map(([key, value]) => [
        key,
        value.academicYearIsActive,
      ]),
    );
    selectedEnrollments = selectCurrentEnrollments({
      enrollments,
      activeYearByContext,
      archivedStudentIds,
    });
  } else {
    selectedEnrollments = selectHistoricalEnrollments(enrollments);
  }

  const rows = buildReportRows({ enrollments: selectedEnrollments, contexts });
  rows.sort(
    (left, right) =>
      left.schoolName.localeCompare(right.schoolName, "ar") ||
      left.gradeTitle.localeCompare(right.gradeTitle, "ar") ||
      left.classTitle.localeCompare(right.classTitle, "ar"),
  );

  const groupsBySchool = new Map<string, ClassStudentStatisticsSchoolGroup>();
  for (const row of rows) {
    const group = groupsBySchool.get(row.schoolId) ?? {
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      rows: [],
      totalStudents: 0,
    };
    group.rows.push(row);
    group.totalStudents += row.studentCount;
    groupsBySchool.set(row.schoolId, group);
  }

  const groups = Array.from(groupsBySchool.values());
  const selectedYear = availableYears.find((item) => item.id === academicYearId);

  return {
    scope: {
      mode,
      academicYearId: mode === "year" ? academicYearId : null,
      title: mode === "current" ? "الوضع الحالي" : selectedYear?.title || academicYearId,
    },
    summary: {
      schoolCount: groups.length,
      classCount: rows.length,
      studentCount: groups.reduce((total, group) => total + group.totalStudents, 0),
    },
    groups,
  };
}
