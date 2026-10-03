import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

type FirestoreRecord = Record<string, unknown>;

export type StudentIdentity = {
  id: string;
  personId: string;
  orgId: string;
  isArchived: boolean;
  displayName: string;
  nationalId: string;
  phone: string;
  email: string;
};

export type EnrollmentRecord = {
  id: string;
  orgId: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  streamId: string;
  classId: string;
  status: string;
  startAt: number;
  endAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type EnrollmentLabels = {
  school: string;
  academicYear: string;
  grade: string;
  stream: string;
  className: string;
  academicYearIsActive: boolean;
};

export type ResolvedEnrollment = EnrollmentRecord & {
  labels: EnrollmentLabels;
};

export type StudentDirectoryRow = StudentIdentity & {
  currentEnrollment: ResolvedEnrollment | null;
  activeEnrollmentCount: number;
};

export type StudentDirectoryData = {
  orgName: string;
  schools: Array<{ id: string; name: string }>;
  rows: StudentDirectoryRow[];
};

export type StudentProfileData = {
  student: StudentIdentity;
  currentEnrollment: ResolvedEnrollment | null;
  activeEnrollmentCount: number;
  enrollmentHistory: ResolvedEnrollment[];
};

type SchoolRecord = {
  id: string;
  name: string;
};

type EnrollmentContext = {
  schools: Map<string, SchoolRecord>;
  years: Map<string, { title: string; isActive: boolean }>;
  grades: Map<string, string>;
  streams: Map<string, string>;
  classes: Map<string, { label: string; gradeId: string; streamId: string }>;
};

function readString(data: FirestoreRecord | undefined, field: string) {
  const value = data?.[field];
  return typeof value === "string" ? value.trim() : "";
}

function readTimestamp(data: FirestoreRecord | undefined, field: string) {
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function contextKey(schoolId: string, academicYearId: string) {
  return `${schoolId}::${academicYearId}`;
}

function itemKey(schoolId: string, academicYearId: string, id: string) {
  return `${schoolId}::${academicYearId}::${id}`;
}

function labelFor(data: FirestoreRecord | undefined, fallback: string) {
  return (
    readString(data, "title") ||
    readString(data, "name") ||
    readString(data, "code") ||
    fallback
  );
}

function toEnrollment(id: string, data: FirestoreRecord): EnrollmentRecord {
  return {
    id,
    orgId: readString(data, "orgId"),
    studentId: readString(data, "studentId"),
    schoolId: readString(data, "schoolId"),
    academicYearId: readString(data, "academicYearId"),
    gradeId: readString(data, "gradeId"),
    streamId: readString(data, "streamId"),
    classId: readString(data, "classId"),
    status: readString(data, "status"),
    startAt: readTimestamp(data, "startAt"),
    endAt: readTimestamp(data, "endAt") || undefined,
    createdAt: readTimestamp(data, "createdAt"),
    updatedAt: readTimestamp(data, "updatedAt"),
  };
}

async function loadEnrollmentContext(params: {
  db: Firestore;
  orgId: string;
  enrollments: EnrollmentRecord[];
  knownSchools?: SchoolRecord[];
}): Promise<EnrollmentContext> {
  const { db, orgId, enrollments, knownSchools = [] } = params;
  const schools = new Map(knownSchools.map((school) => [school.id, school]));
  const contexts = Array.from(
    new Map(
      enrollments
        .filter((item) => item.schoolId && item.academicYearId)
        .map((item) => [contextKey(item.schoolId, item.academicYearId), item]),
    ).values(),
  );

  const missingSchoolIds = Array.from(
    new Set(contexts.map((item) => item.schoolId).filter((id) => !schools.has(id))),
  );
  const missingSchoolSnapshots = await Promise.all(
    missingSchoolIds.map((schoolId) =>
      getDoc(doc(db, `orgs/${orgId}/schools/${schoolId}`)),
    ),
  );
  missingSchoolSnapshots.forEach((snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data() as FirestoreRecord;
    schools.set(snapshot.id, { id: snapshot.id, name: labelFor(data, snapshot.id) });
  });

  const contextResults = await Promise.all(
    contexts.map(async (item) => {
      const yearPath = `orgs/${orgId}/schools/${item.schoolId}/academicYears/${item.academicYearId}`;
      const [yearSnapshot, gradesSnapshot, streamsSnapshot, classesSnapshot] =
        await Promise.all([
          getDoc(doc(db, yearPath)),
          getDocs(collection(db, `${yearPath}/grades`)),
          getDocs(collection(db, `${yearPath}/streams`)),
          getDocs(collection(db, `${yearPath}/classes`)),
        ]);

      return { item, yearSnapshot, gradesSnapshot, streamsSnapshot, classesSnapshot };
    }),
  );

  const years = new Map<string, { title: string; isActive: boolean }>();
  const grades = new Map<string, string>();
  const streams = new Map<string, string>();
  const classes = new Map<string, { label: string; gradeId: string; streamId: string }>();

  contextResults.forEach((result) => {
    const { item, yearSnapshot, gradesSnapshot, streamsSnapshot, classesSnapshot } = result;
    const key = contextKey(item.schoolId, item.academicYearId);
    const yearData = yearSnapshot.exists()
      ? (yearSnapshot.data() as FirestoreRecord)
      : undefined;
    years.set(key, {
      title: labelFor(yearData, item.academicYearId),
      isActive: yearData?.isActive === true,
    });

    gradesSnapshot.docs.forEach((snapshot) => {
      grades.set(
        itemKey(item.schoolId, item.academicYearId, snapshot.id),
        labelFor(snapshot.data() as FirestoreRecord, snapshot.id),
      );
    });
    streamsSnapshot.docs.forEach((snapshot) => {
      streams.set(
        itemKey(item.schoolId, item.academicYearId, snapshot.id),
        labelFor(snapshot.data() as FirestoreRecord, snapshot.id),
      );
    });
    classesSnapshot.docs.forEach((snapshot) => {
      const data = snapshot.data() as FirestoreRecord;
      const sectionLabel = readString(data, "sectionLabel");
      const title = labelFor(data, snapshot.id);
      classes.set(itemKey(item.schoolId, item.academicYearId, snapshot.id), {
        label: sectionLabel && sectionLabel !== title ? `${title} - ${sectionLabel}` : title,
        gradeId: readString(data, "gradeId"),
        streamId: readString(data, "streamId"),
      });
    });
  });

  return { schools, years, grades, streams, classes };
}

function resolveEnrollment(
  enrollment: EnrollmentRecord,
  context: EnrollmentContext,
): ResolvedEnrollment {
  const yearKey = contextKey(enrollment.schoolId, enrollment.academicYearId);
  const year = context.years.get(yearKey);

  const classInfo = enrollment.classId
    ? context.classes.get(itemKey(enrollment.schoolId, enrollment.academicYearId, enrollment.classId))
    : undefined;
  const gradeId = enrollment.gradeId || classInfo?.gradeId || "";
  const streamId = enrollment.streamId || classInfo?.streamId || "";

  return {
    ...enrollment,
    labels: {
      school: context.schools.get(enrollment.schoolId)?.name || enrollment.schoolId,
      academicYear: year?.title || enrollment.academicYearId,
      grade: gradeId
        ? context.grades.get(itemKey(enrollment.schoolId, enrollment.academicYearId, gradeId)) || gradeId
        : "",
      stream: streamId
        ? context.streams.get(itemKey(enrollment.schoolId, enrollment.academicYearId, streamId)) || streamId
        : "",
      className: enrollment.classId
        ? classInfo?.label || enrollment.classId
        : "",
      academicYearIsActive: year?.isActive === true,
    },
  };
}

function resolveCurrentEnrollment(enrollments: ResolvedEnrollment[]) {
  const active = enrollments.filter((item) => item.status === "ACTIVE");
  if (active.length === 0) return null;

  return [...active].sort((left, right) => {
    const activeYearDifference = Number(right.labels.academicYearIsActive) - Number(left.labels.academicYearIsActive);
    if (activeYearDifference !== 0) return activeYearDifference;
    return right.startAt - left.startAt || right.updatedAt - left.updatedAt;
  })[0];
}

function toStudentIdentity(params: {
  id: string;
  data: FirestoreRecord;
  people: Map<string, FirestoreRecord>;
}): StudentIdentity {
  const personId = readString(params.data, "personId");
  const person = params.people.get(personId);

  return {
    id: params.id,
    personId,
    orgId: readString(params.data, "orgId"),
    isArchived: params.data.isArchived === true,
    displayName: readString(person, "displayName") || params.id,
    nationalId: readString(person, "nationalId"),
    phone: readString(person, "phone"),
    email: readString(person, "email"),
  };
}

export async function loadStudentDirectory(params: {
  db: Firestore;
  orgId: string;
}): Promise<StudentDirectoryData | null> {
  const { db, orgId } = params;
  const [orgSnapshot, studentsSnapshot, peopleSnapshot, schoolsSnapshot, activeEnrollmentsSnapshot] =
    await Promise.all([
      getDoc(doc(db, `orgs/${orgId}`)),
      getDocs(collection(db, `orgs/${orgId}/students`)),
      getDocs(collection(db, `orgs/${orgId}/people`)),
      getDocs(collection(db, `orgs/${orgId}/schools`)),
      getDocs(
        query(
          collection(db, `orgs/${orgId}/studentEnrollments`),
          where("status", "==", "ACTIVE"),
        ),
      ),
    ]);

  if (!orgSnapshot.exists()) return null;

  const schools = schoolsSnapshot.docs
    .map((snapshot) => ({
      id: snapshot.id,
      name: labelFor(snapshot.data() as FirestoreRecord, snapshot.id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
  const people = new Map(
    peopleSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data() as FirestoreRecord]),
  );
  const activeEnrollments = activeEnrollmentsSnapshot.docs.map((snapshot) =>
    toEnrollment(snapshot.id, snapshot.data() as FirestoreRecord),
  );
  const context = await loadEnrollmentContext({ db, orgId, enrollments: activeEnrollments, knownSchools: schools });
  const activeByStudent = new Map<string, ResolvedEnrollment[]>();
  activeEnrollments.map((item) => resolveEnrollment(item, context)).forEach((item) => {
    const existing = activeByStudent.get(item.studentId) || [];
    existing.push(item);
    activeByStudent.set(item.studentId, existing);
  });

  const rows = studentsSnapshot.docs
    .map((snapshot) => {
      const student = toStudentIdentity({
        id: snapshot.id,
        data: snapshot.data() as FirestoreRecord,
        people,
      });
      const active = activeByStudent.get(student.id) || [];
      return {
        ...student,
        currentEnrollment: resolveCurrentEnrollment(active),
        activeEnrollmentCount: active.length,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

  const orgData = orgSnapshot.data() as FirestoreRecord;
  return {
    orgName:
      readString(orgData, "nameAr") ||
      readString(orgData, "name") ||
      readString(orgData, "shortName") ||
      readString(orgData, "nameEn") ||
      orgId,
    schools,
    rows,
  };
}

export async function loadStudentProfile(params: {
  db: Firestore;
  orgId: string;
  studentId: string;
}): Promise<StudentProfileData | null> {
  const { db, orgId, studentId } = params;
  const studentSnapshot = await getDoc(doc(db, `orgs/${orgId}/students/${studentId}`));
  if (!studentSnapshot.exists()) return null;

  const studentData = studentSnapshot.data() as FirestoreRecord;
  const personId = readString(studentData, "personId");
  const [personSnapshot, enrollmentsSnapshot] = await Promise.all([
    personId ? getDoc(doc(db, `orgs/${orgId}/people/${personId}`)) : Promise.resolve(null),
    getDocs(
      query(
        collection(db, `orgs/${orgId}/studentEnrollments`),
        where("studentId", "==", studentId),
      ),
    ),
  ]);

  const people = new Map<string, FirestoreRecord>();
  if (personSnapshot?.exists()) {
    people.set(personSnapshot.id, personSnapshot.data() as FirestoreRecord);
  }

  const student = toStudentIdentity({ id: studentSnapshot.id, data: studentData, people });
  const enrollments = enrollmentsSnapshot.docs.map((snapshot) =>
    toEnrollment(snapshot.id, snapshot.data() as FirestoreRecord),
  );
  const context = await loadEnrollmentContext({ db, orgId, enrollments });
  const enrollmentHistory = enrollments
    .map((item) => resolveEnrollment(item, context))
    .sort((left, right) => right.startAt - left.startAt || right.createdAt - left.createdAt);
  const activeEnrollments = enrollmentHistory.filter((item) => item.status === "ACTIVE");

  return {
    student,
    currentEnrollment: resolveCurrentEnrollment(activeEnrollments),
    activeEnrollmentCount: activeEnrollments.length,
    enrollmentHistory,
  };
}
