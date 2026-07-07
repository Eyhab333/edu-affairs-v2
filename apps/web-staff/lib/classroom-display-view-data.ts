import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";

import type {
  Class,
  ClassroomDisplaySession,
  Person,
  School,
  Student,
  StudentEnrollment,
  StudentGamificationEvent,
} from "@takween/contracts";

import {
  buildClassroomDisplayView,
  type ClassroomDisplayFeedItemInput,
  type ClassroomDisplayStudentInput,
  type ClassroomDisplayView,
} from "@takween/domain";

import { db } from "@/lib/firebase";

type StudentDisplayRow = {
  studentId: string;
  displayName: string;
};

export type ClassroomDisplayViewData = {
  session: ClassroomDisplaySession;
  view: ClassroomDisplayView;
  studentsCount: number;
  eventsCount: number;
};

function getStudentDisplayName(params: {
  person: Person | null;
  student: Student | null;
  studentId: string;
}) {
  return (
    params.person?.displayName ||
    params.student?.id ||
    params.studentId ||
    "طالب"
  );
}

function getNickname(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "طالب";
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

async function loadPerson(orgId: string, personId: string) {
  if (!personId) return null;

  const peopleRef = doc(db, `orgs/${orgId}/people/${personId}`);
  const peopleSnap = await getDoc(peopleRef);

  if (peopleSnap.exists()) {
    return {
      id: peopleSnap.id,
      ...(peopleSnap.data() as Omit<Person, "id">),
    } as Person;
  }

  const personsRef = doc(db, `orgs/${orgId}/persons/${personId}`);
  const personsSnap = await getDoc(personsRef);

  if (personsSnap.exists()) {
    return {
      id: personsSnap.id,
      ...(personsSnap.data() as Omit<Person, "id">),
    } as Person;
  }

  return null;
}

export async function loadClassroomDisplaySession(params: {
  orgId: string;
  sessionId: string;
}) {
  const ref = doc(
    db,
    `orgs/${params.orgId}/classroomDisplaySessions/${params.sessionId}`,
  );

  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<ClassroomDisplaySession, "id">),
  } as ClassroomDisplaySession;
}

export function subscribeClassroomDisplaySession(
  params: {
    orgId: string;
    sessionId: string;
  },
  onChange: (session: ClassroomDisplaySession | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const ref = doc(
    db,
    `orgs/${params.orgId}/classroomDisplaySessions/${params.sessionId}`,
  );

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }

      onChange({
        id: snap.id,
        ...(snap.data() as Omit<ClassroomDisplaySession, "id">),
      } as ClassroomDisplaySession);
    },
    onError,
  );
}


export async function loadSchoolName(session: ClassroomDisplaySession) {
  const ref = doc(db, `orgs/${session.orgId}/schools/${session.schoolId}`);
  const snap = await getDoc(ref);

  if (!snap.exists()) return "";

  const school = {
    id: snap.id,
    ...(snap.data() as Omit<School, "id">),
  } as School;

  return school.name || session.schoolId;
}

export async function loadClassTitle(session: ClassroomDisplaySession) {
  const ref = doc(
    db,
    `orgs/${session.orgId}/schools/${session.schoolId}/academicYears/${session.academicYearId}/classes/${session.classId}`,
  );

  const snap = await getDoc(ref);

  if (!snap.exists()) return session.classId;

  const classInfo = {
    id: snap.id,
    ...(snap.data() as Omit<Class, "id">),
  } as Class;

  return classInfo.title || session.classId;
}

export async function loadClassStudents(session: ClassroomDisplaySession) {
  const enrollmentsRef = collection(
    db,
    `orgs/${session.orgId}/studentEnrollments`,
  );

  const enrollmentsSnap = await getDocs(
    query(enrollmentsRef, where("classId", "==", session.classId)),
  );

  const enrollments = enrollmentsSnap.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentEnrollment, "id">),
    }))
    .filter((enrollment) => {
      if (enrollment.status !== "ACTIVE") return false;
      if (enrollment.schoolId !== session.schoolId) return false;
      if (enrollment.academicYearId !== session.academicYearId) return false;
      return true;
    });

  const rows = await Promise.all(
    enrollments.map(async (enrollment) => {
      const studentRef = doc(
        db,
        `orgs/${session.orgId}/students/${enrollment.studentId}`,
      );

      const studentSnap = await getDoc(studentRef);

      const student = studentSnap.exists()
        ? ({
            id: studentSnap.id,
            ...(studentSnap.data() as Omit<Student, "id">),
          } as Student)
        : null;

      const person = await loadPerson(session.orgId, student?.personId ?? "");

      return {
        studentId: enrollment.studentId,
        displayName: getStudentDisplayName({
          person,
          student,
          studentId: enrollment.studentId,
        }),
      };
    }),
  );

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

async function loadSessionGamificationEvents(session: ClassroomDisplaySession) {
  const eventsRef = collection(
    db,
    `orgs/${session.orgId}/studentGamificationEvents`,
  );

  const eventsSnap = await getDocs(
    query(
      eventsRef,
      where("classSubjectOfferingId", "==", session.classSubjectOfferingId),
    ),
  );

  return eventsSnap.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentGamificationEvent, "id">),
    }))
    .filter((event) => {
      if (event.status !== "ACTIVE") return false;
      if (event.schoolId !== session.schoolId) return false;
      if (event.academicYearId !== session.academicYearId) return false;
      if (session.termId && event.termId !== session.termId) return false;
      if (event.classId !== session.classId) return false;
      if (session.subjectKey && event.subjectKey !== session.subjectKey) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
}


export function subscribeSessionGamificationEvents(
  session: ClassroomDisplaySession,
  onChange: (events: StudentGamificationEvent[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const eventsRef = collection(
    db,
    `orgs/${session.orgId}/studentGamificationEvents`,
  );

  const eventsQuery = query(
    eventsRef,
    where("classSubjectOfferingId", "==", session.classSubjectOfferingId),
  );

  return onSnapshot(
    eventsQuery,
    (snap) => {
      const events = snap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<StudentGamificationEvent, "id">),
        }))
        .filter((event) => {
          if (event.status !== "ACTIVE") return false;
          if (event.schoolId !== session.schoolId) return false;
          if (event.academicYearId !== session.academicYearId) return false;
          if (event.termId !== session.termId) return false;
          if (event.classId !== session.classId) return false;

          if (session.subjectKey && event.subjectKey !== session.subjectKey) {
            return false;
          }

          return true;
        })
        .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));

      onChange(events);
    },
    onError,
  );
}


function buildPointsByStudentId(events: StudentGamificationEvent[]) {
  const map = new Map<string, number>();

  for (const event of events) {
    if (event.status !== "ACTIVE") continue;

    const current = map.get(event.studentId) ?? 0;
    map.set(event.studentId, current + Math.max(0, event.value ?? 0));
  }

  return map;
}

export function toStudentInputs(params: {
  students: StudentDisplayRow[];
  events: StudentGamificationEvent[];
}) {
  const pointsByStudentId = buildPointsByStudentId(params.events);

  return params.students.map((student, index): ClassroomDisplayStudentInput => {
    const fullName = student.displayName || "طالب";

    return {
      studentId: student.studentId,
      fullName,
      nickname: getNickname(fullName),
      initials: getInitials(fullName),
      displayAlias: `طالب رقم ${index + 1}`,
      avatarKey: `avatar-${(index % 8) + 1}`,
      photoUrl: "",
      photoConsentStatus: "UNKNOWN",
      points: pointsByStudentId.get(student.studentId) ?? 0,
    };
  });
}


function readGamificationPointsDelta(data: Record<string, unknown>) {
  const candidates = [
    data.pointsDelta,
    data.deltaPoints,
    data.awardedPoints,
    data.pointsAwarded,
    data.scoreDelta,
    data.points,
    data.value,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value
        .replace(/[٠-٩]/g, (digit) =>
          String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
        )
        .replace(/[۰-۹]/g, (digit) =>
          String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)),
        )
        .replace(/[^\d.-]/g, "");

      const parsed = Number(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function toNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[^\d.-]/g, "");

    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function toFeedInputs(events: StudentGamificationEvent[]) {
  return events.map((event): ClassroomDisplayFeedItemInput => {
    const pointsDelta = toNumberValue(event.value);

    return {
      id: event.id,
      studentId: event.studentId,
      title: event.title || event.reasonTitle || "تحفيز جديد",
      description:
        event.description ||
        event.badgeTitle ||
        `${event.value} ${event.valueKind}`,
      createdAt: event.occurredAt ?? event.createdAt ?? Date.now(),
      visibility: event.visibility,

      points: pointsDelta,
      pointsDelta,
      value: pointsDelta,
    };
  });
}

export async function loadClassroomDisplayViewData(params: {
  orgId: string;
  sessionId: string;
}): Promise<ClassroomDisplayViewData | null> {
  const session = await loadClassroomDisplaySession(params);

  if (!session) return null;

  const [schoolName, classTitle, students, events] = await Promise.all([
    loadSchoolName(session),
    loadClassTitle(session),
    loadClassStudents(session),
    loadSessionGamificationEvents(session),
  ]);

  const view = buildClassroomDisplayView({
    session,
    schoolName,
    classTitle,
    subjectTitle: session.subjectKey || "المادة",
    students: toStudentInputs({ students, events }),
    feedItems: toFeedInputs(events),
  });

  return {
    session,
    view,
    studentsCount: students.length,
    eventsCount: events.length,
  };
}