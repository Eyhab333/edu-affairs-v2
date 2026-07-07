import type { ClassroomDisplaySession } from "@takween/contracts";

export type ClassroomDisplayStudentPhotoConsentStatus =
  | "UNKNOWN"
  | "APPROVED"
  | "DECLINED"
  | "REVOKED"
  | "EXPIRED";

export type ClassroomDisplayStudentInput = {
  studentId: string;
  fullName: string;
  nickname?: string;
  initials?: string;
  displayAlias?: string;
  avatarKey?: string;
  photoUrl?: string;
  photoConsentStatus?: ClassroomDisplayStudentPhotoConsentStatus;
  points?: number;
  rank?: number;
};

export type ClassroomDisplayFeedItemInput = {
  id: string;
  studentId: string;
  title: string;
  description?: string;
  createdAt: number;
  points?: number;
  pointsDelta?: number;
  value?: number;
  visibility:
    | "STAFF_ONLY"
    | "STUDENT_DISPLAY"
    | "GUARDIAN_VISIBLE"
    | "STUDENT_AND_GUARDIAN_VISIBLE"
    | "PUBLIC_LEADERBOARD"
    | "EVERYONE";
};

export type ClassroomDisplayStudentView = {
  studentId: string;
  displayName: string;
  avatarKey: string;
  photoUrl: string;
  points: number;
  rank?: number;
};

export type ClassroomDisplayFeedItemView = {
  id: string;
  studentId: string;
  studentDisplayName: string;
  title: string;
  description: string;
  createdAt: number;
};

export type BuildClassroomDisplayViewInput = {
  session: ClassroomDisplaySession;
  classTitle: string;
  subjectTitle?: string;
  schoolName?: string;
  students: ClassroomDisplayStudentInput[];
  feedItems?: ClassroomDisplayFeedItemInput[];
};

export type ClassroomDisplayView = {
  sessionId: string;
  status: ClassroomDisplaySession["status"];
  header: {
    schoolName: string;
    classTitle: string;
    subjectTitle: string;
    lessonGoal: string;
    encouragementMessage: string;
  };
  settings: {
    privacyMode: ClassroomDisplaySession["privacyMode"];
    showLeaderboard: boolean;
    showGamificationFeed: boolean;
    showChallenge: boolean;
    showTimer: boolean;
    showLessonGoal: boolean;
    showStudentPhotos: boolean;
  };
  students: ClassroomDisplayStudentView[];
  leaderboard: ClassroomDisplayStudentView[];
  feedItems: ClassroomDisplayFeedItemView[];
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function resolveDisplayName(
  session: ClassroomDisplaySession,
  student: ClassroomDisplayStudentInput,
  index: number,
) {
  if (session.privacyMode === "FULL_NAME") {
    return student.fullName;
  }

  if (session.privacyMode === "NICKNAME") {
    return student.nickname || student.fullName.split(/\s+/)[0] || "طالب";
  }

  if (session.privacyMode === "INITIALS_ONLY") {
    return student.initials || getInitials(student.fullName) || "طالب";
  }

  if (session.privacyMode === "DISPLAY_ALIAS") {
    return student.displayAlias || `طالب رقم ${index + 1}`;
  }

  if (session.privacyMode === "ANONYMOUS_NUMBER") {
    return `طالب رقم ${index + 1}`;
  }

  return "";
}

function resolvePhotoUrl(
  session: ClassroomDisplaySession,
  student: ClassroomDisplayStudentInput,
) {
  if (!session.showStudentPhotos) return "";
  if (student.photoConsentStatus !== "APPROVED") return "";
  return student.photoUrl || "";
}

function canShowFeedItem(item: ClassroomDisplayFeedItemInput) {
  return (
    item.visibility === "STUDENT_DISPLAY" ||
    item.visibility === "STUDENT_AND_GUARDIAN_VISIBLE" ||
    item.visibility === "PUBLIC_LEADERBOARD"
  );
}

function resolveFeedItemPoints(item: ClassroomDisplayFeedItemInput) {
  return item.points ?? item.pointsDelta ?? item.value ?? 0;
}

export function buildClassroomDisplayView(
  input: BuildClassroomDisplayViewInput,
): ClassroomDisplayView {
  const students = input.students.map((student, index) => ({
    studentId: student.studentId,
    displayName: resolveDisplayName(input.session, student, index),
    avatarKey: student.avatarKey || "",
    photoUrl: resolvePhotoUrl(input.session, student),
    points: student.points ?? 0,
    rank: student.rank,
  }));

  const studentMap = new Map(
    students.map((student) => [student.studentId, student]),
  );

  const leaderboard = [...students]
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  const feedItems = (input.feedItems ?? [])
    .filter(canShowFeedItem)
    .filter((item) => studentMap.has(item.studentId))
    .slice(0, 10)
    .map((item) => {
      const pointsDelta = resolveFeedItemPoints(item);

      return {
        id: item.id,
        studentId: item.studentId,
        studentDisplayName:
          studentMap.get(item.studentId)?.displayName || "طالب",
        title: item.title,
        description: item.description || "",
        createdAt: item.createdAt,

        points: pointsDelta,
        pointsDelta,
        value: pointsDelta,
      };
    });

  return {
    sessionId: input.session.id,
    status: input.session.status,
    header: {
      schoolName: input.schoolName || "",
      classTitle: input.classTitle,
      subjectTitle: input.subjectTitle || "",
      lessonGoal: input.session.lessonGoal || "",
      encouragementMessage: input.session.encouragementMessage || "",
    },
    settings: {
      privacyMode: input.session.privacyMode,
      showLeaderboard: input.session.showLeaderboard,
      showGamificationFeed: input.session.showGamificationFeed,
      showChallenge: input.session.showChallenge,
      showTimer: input.session.showTimer,
      showLessonGoal: input.session.showLessonGoal,
      showStudentPhotos: input.session.showStudentPhotos,
    },
    students,
    leaderboard: input.session.showLeaderboard ? leaderboard : [],
    feedItems: input.session.showGamificationFeed ? feedItems : [],
  };
}
