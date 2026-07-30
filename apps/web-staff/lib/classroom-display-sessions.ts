import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import type {
  ClassroomDisplayPhotoFallbackMode,
  ClassroomDisplayPrivacyMode,
  ClassroomDisplaySession,
  MembershipRole,
  ClassroomDisplayThemeKey,
  ClassroomDisplaySessionStatus,
} from "@takween/contracts";
import { ClassroomDisplaySessionSchema } from "@takween/contracts";
import { db } from "@/lib/firebase";

export type CreateClassroomDisplaySessionInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId: string;
  termTitle: string;
  termShortTitle: string;

  classId: string;
  gradeId: string;
  streamId?: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  startedByPersonId: string;
  startedByRoleKey?: MembershipRole;

  privacyMode: ClassroomDisplayPrivacyMode;
  showStudentPhotos: boolean;
  photoFallbackMode: ClassroomDisplayPhotoFallbackMode;

  showLeaderboard: boolean;
  showGamificationFeed: boolean;
  showChallenge: boolean;
  showTimer: boolean;
  showLessonGoal: boolean;

  lessonGoal: string;
  encouragementMessage: string;
  displayThemeKey: ClassroomDisplayThemeKey;
};

export async function createClassroomDisplaySession(
  input: CreateClassroomDisplaySessionInput,
) {
  const now = Date.now();

  const ref = doc(
    collection(db, `orgs/${input.orgId}/classroomDisplaySessions`),
  );

  const session: ClassroomDisplaySession = {
    id: ref.id,

    orgId: input.orgId,
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,

    termId: input.termId,
    termTitle: input.termTitle,
    termShortTitle: input.termShortTitle,

    classId: input.classId,
    gradeId: input.gradeId,
    streamId: input.streamId ?? "",

    subjectKey: input.subjectKey,
    classSubjectOfferingId: input.classSubjectOfferingId,

    startedByPersonId: input.startedByPersonId,
    startedByRoleKey: input.startedByRoleKey,

    status: "ACTIVE",

    privacyMode: input.privacyMode,
    showStudentPhotos: input.showStudentPhotos,
    photoFallbackMode: input.photoFallbackMode,

    showLeaderboard: input.showLeaderboard,
    showGamificationFeed: input.showGamificationFeed,
    showChallenge: input.showChallenge,
    showTimer: input.showTimer,
    showLessonGoal: input.showLessonGoal,

    lessonGoal: input.lessonGoal,
    encouragementMessage: input.encouragementMessage,
    displayThemeKey: input.displayThemeKey,
    startedAt: now,
    lastHeartbeatAt: now,
    createdAt: now,
    updatedAt: now,

    isArchived: false,
  };

  await setDoc(ref, session);

  return session;
}

export async function updateClassroomDisplaySessionStatus(input: {
  orgId: string;
  sessionId: string;
  status: ClassroomDisplaySessionStatus;
}) {
  const now = Date.now();

  const ref = doc(
    db,
    `orgs/${input.orgId}/classroomDisplaySessions/${input.sessionId}`,
  );

  await updateDoc(ref, {
    status: input.status,
    updatedAt: now,
    ...(input.status === "ENDED" ? { endedAt: now } : {}),
    ...(input.status === "ACTIVE" ? { lastHeartbeatAt: now } : {}),
  });
}

export async function findReusableClassroomDisplaySession(input: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
}) {
  const sessionsRef = collection(
    db,
    `orgs/${input.orgId}/classroomDisplaySessions`,
  );

  const snapshot = await getDocs(
    query(
      sessionsRef,
      where("schoolId", "==", input.schoolId),
      where("academicYearId", "==", input.academicYearId),
      where("termId", "==", input.termId),
      where("classId", "==", input.classId),
      where("subjectKey", "==", input.subjectKey),
      where("classSubjectOfferingId", "==", input.classSubjectOfferingId),
    ),
  );

  const sessions: ClassroomDisplaySession[] = [];

  snapshot.forEach((docSnapshot) => {
    const parsed = ClassroomDisplaySessionSchema.safeParse({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    });

    if (!parsed.success) return;

    const session = parsed.data;

    if (session.isArchived) return;

    if (session.status !== "ACTIVE" && session.status !== "PAUSED") {
      return;
    }

    if (session.schoolId !== input.schoolId) return;
    if (session.academicYearId !== input.academicYearId) return;
    if (session.termId !== input.termId) return;
    if (session.classId !== input.classId) return;
    if (session.classSubjectOfferingId !== input.classSubjectOfferingId) {
      return;
    }

    sessions.push(session);
  });

  return (
    sessions.sort((a, b) => {
      return (b.startedAt ?? 0) - (a.startedAt ?? 0);
    })[0] ?? null
  );
}

export async function updateClassroomDisplaySessionTheme(input: {
  orgId: string;
  sessionId: string;
  displayThemeKey: ClassroomDisplayThemeKey;
}) {
  const now = Date.now();

  const ref = doc(
    db,
    `orgs/${input.orgId}/classroomDisplaySessions/${input.sessionId}`,
  );

  await updateDoc(ref, {
    displayThemeKey: input.displayThemeKey,
    updatedAt: now,
  });
}
