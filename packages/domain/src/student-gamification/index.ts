import type {
  MembershipRole,
  StudentGamificationEvent,
  StudentGamificationEventSourceType,
  StudentGamificationEventStatus,
  StudentGamificationEventType,
  StudentGamificationEventVisibility,
  StudentGamificationValueKind,
  StudentGamificationRecentEventSnapshot,
  StudentGamificationSummarySnapshot,
  StudentGamificationSubjectSummarySnapshot,
  StudentGamificationClassroomDisplayView,
  StudentGamificationGuardianView,
  StudentGamificationPublicEvent,
  StudentGamificationPublicSubjectSummary,
  StudentGamificationStudentView,
  GamificationAchievementRule,
  GamificationLevelRule,
} from "@takween/contracts";

type BuildIdInput = {
  prefix: string;
  parts: Array<string | number | undefined | null>;
};

function compactIdPart(value: string | number | undefined | null) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildStableId({ prefix, parts }: BuildIdInput) {
  const body = parts.map(compactIdPart).filter(Boolean).join("_");
  return body ? `${prefix}_${body}` : prefix;
}

function assertNonEmpty(value: string | undefined, fieldName: string) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
}

function normalizeEventValue(
  eventType: StudentGamificationEventType,
  value: number,
) {
  if (eventType === "XP_REMOVE" || eventType === "POINTS_REMOVE") {
    return -Math.abs(value);
  }

  if (eventType === "BADGE_REVOKED") {
    return value === 0 ? 0 : -Math.abs(value);
  }

  if (
    eventType === "XP_ADD" ||
    eventType === "POINTS_ADD" ||
    eventType === "BADGE_AWARDED" ||
    eventType === "STREAK_UPDATED" ||
    eventType === "LEVEL_UP" ||
    eventType === "QUEST_COMPLETED"
  ) {
    return Math.abs(value);
  }

  return value;
}

function resolveDefaultValueKind(
  eventType: StudentGamificationEventType,
  valueKind?: StudentGamificationValueKind,
): StudentGamificationValueKind {
  if (valueKind) return valueKind;

  if (eventType === "XP_ADD" || eventType === "XP_REMOVE") return "XP";
  if (eventType === "POINTS_ADD" || eventType === "POINTS_REMOVE") {
    return "POINTS";
  }
  if (eventType === "BADGE_AWARDED" || eventType === "BADGE_REVOKED") {
    return "BADGE_VALUE";
  }
  if (eventType === "STREAK_UPDATED") return "STREAK";
  if (eventType === "LEVEL_UP") return "LEVEL";

  return "CUSTOM";
}

export type StudentGamificationContext = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  gradeId?: string;
  streamId?: string;
  classId?: string;

  subjectKey?: string;
  classSubjectOfferingId?: string;

  teacherAssignmentId?: string;
  operationalAssignmentId?: string;
};

export type StudentGamificationTarget = {
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
};

export type StudentGamificationActor = {
  createdByPersonId: string;
  createdByRoleKey?: MembershipRole;
};

export type BuildStudentGamificationEventInput = {
  id?: string;

  context: StudentGamificationContext;
  student: StudentGamificationTarget;
  actor: StudentGamificationActor;

  eventType: StudentGamificationEventType;
  status?: StudentGamificationEventStatus;
  visibility?: StudentGamificationEventVisibility;

  title?: string;
  description?: string;

  reasonKey?: string;
  reasonTitle?: string;
  category?: string;
  categoryTitle?: string;

  value?: number;
  valueKind?: StudentGamificationValueKind;

  badgeKey?: string;
  badgeTitle?: string;
  levelKey?: string;
  questKey?: string;

  groupEventId?: string;
  groupEventTitle?: string;

  occurredAt?: number;

  sessionId?: string;
  sourceType?: StudentGamificationEventSourceType;
  sourceId?: string;
  sourcePath?: string;

  note?: string;
};

export function buildStudentGamificationEvent(
  input: BuildStudentGamificationEventInput,
): StudentGamificationEvent {
  const occurredAt = input.occurredAt ?? Date.now();

  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");
  assertNonEmpty(input.student.studentId, "student.studentId");
  assertNonEmpty(input.actor.createdByPersonId, "actor.createdByPersonId");

  const value = normalizeEventValue(input.eventType, input.value ?? 0);
  const valueKind = resolveDefaultValueKind(input.eventType, input.valueKind);

  const sourceType = input.sourceType ?? "MANUAL";

  const id =
    input.id ??
    buildStableId({
      prefix: "student_gamification",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.context.subjectKey,
        input.student.studentId,
        sourceType,
        input.sourceId,
        occurredAt,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    studentId: input.student.studentId,
    enrollmentId: input.student.enrollmentId ?? "",
    gradeId: input.student.gradeId ?? input.context.gradeId ?? "",
    streamId: input.student.streamId ?? input.context.streamId ?? "",
    classId: input.student.classId ?? input.context.classId ?? "",

    subjectKey: input.context.subjectKey ?? "",
    classSubjectOfferingId: input.context.classSubjectOfferingId ?? "",

    teacherAssignmentId: input.context.teacherAssignmentId ?? "",
    operationalAssignmentId: input.context.operationalAssignmentId ?? "",

    eventType: input.eventType,
    status: input.status ?? "ACTIVE",
    visibility: input.visibility ?? "STUDENT_DISPLAY",

    title: input.title ?? "",
    description: input.description ?? "",

    reasonKey: input.reasonKey ?? "",
    reasonTitle: input.reasonTitle ?? "",
    category: input.category ?? "",
    categoryTitle: input.categoryTitle ?? "",

    value,
    valueKind,

    badgeKey: input.badgeKey ?? "",
    badgeTitle: input.badgeTitle ?? "",
    levelKey: input.levelKey ?? "",
    questKey: input.questKey ?? "",

    groupEventId: input.groupEventId ?? "",
    groupEventTitle: input.groupEventTitle ?? "",

    createdByPersonId: input.actor.createdByPersonId,
    createdByRoleKey: input.actor.createdByRoleKey,
    occurredAt,

    sessionId: input.sessionId ?? "",
    sourceType,
    sourceId: input.sourceId ?? "",
    sourcePath: input.sourcePath ?? "",

    reversedByPersonId: "",
    reverseReason: "",

    cancelledByPersonId: "",
    cancelReason: "",

    note: input.note ?? "",

    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

export type BuildBulkStudentGamificationEventsInput = Omit<
  BuildStudentGamificationEventInput,
  "id" | "student" | "groupEventId"
> & {
  students: StudentGamificationTarget[];
  groupEventId?: string;
  groupEventTitle?: string;
};

export function buildBulkStudentGamificationEvents(
  input: BuildBulkStudentGamificationEventsInput,
): StudentGamificationEvent[] {
  const occurredAt = input.occurredAt ?? Date.now();

  const groupEventId =
    input.groupEventId ??
    buildStableId({
      prefix: "student_gamification_group",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.context.subjectKey,
        input.eventType,
        input.actor.createdByPersonId,
        occurredAt,
      ],
    });

  return input.students.map((student, index) =>
    buildStudentGamificationEvent({
      ...input,
      id: buildStableId({
        prefix: "student_gamification",
        parts: [groupEventId, student.studentId, index],
      }),
      student,
      groupEventId,
      groupEventTitle: input.groupEventTitle ?? "",
      occurredAt,
    }),
  );
}

export type StudentGamificationSummaryBySubject = {
  subjectKey: string;
  totalEvents: number;
  totalPoints: number;
  totalXp: number;
  badgeEvents: number;
  levelUpEvents: number;
};

export type StudentGamificationSummary = {
  studentId: string;
  totalEvents: number;
  activeEvents: number;
  totalPoints: number;
  totalXp: number;
  badgeAwardedCount: number;
  badgeRevokedCount: number;
  netBadgeCount: number;
  streakEventCount: number;
  levelUpEventCount: number;
  latestEventAt: number | null;
  bySubject: StudentGamificationSummaryBySubject[];
};

function emptySubjectSummary(
  subjectKey: string,
): StudentGamificationSummaryBySubject {
  return {
    subjectKey,
    totalEvents: 0,
    totalPoints: 0,
    totalXp: 0,
    badgeEvents: 0,
    levelUpEvents: 0,
  };
}

export function calculateStudentGamificationSummary(
  studentId: string,
  events: StudentGamificationEvent[],
): StudentGamificationSummary {
  const relevantEvents = events.filter(
    (event) => event.studentId === studentId,
  );
  const activeEvents = relevantEvents.filter(
    (event) => event.status === "ACTIVE",
  );

  const bySubjectMap = new Map<string, StudentGamificationSummaryBySubject>();

  let totalPoints = 0;
  let totalXp = 0;
  let badgeAwardedCount = 0;
  let badgeRevokedCount = 0;
  let streakEventCount = 0;
  let levelUpEventCount = 0;
  let latestEventAt: number | null = null;

  for (const event of activeEvents) {
    const subjectKey = event.subjectKey || "GENERAL";

    if (!bySubjectMap.has(subjectKey)) {
      bySubjectMap.set(subjectKey, emptySubjectSummary(subjectKey));
    }

    const subjectSummary = bySubjectMap.get(subjectKey)!;

    subjectSummary.totalEvents += 1;

    if (event.valueKind === "POINTS") {
      totalPoints += event.value;
      subjectSummary.totalPoints += event.value;
    }

    if (event.valueKind === "XP") {
      totalXp += event.value;
      subjectSummary.totalXp += event.value;
    }

    if (event.eventType === "BADGE_AWARDED") {
      badgeAwardedCount += 1;
      subjectSummary.badgeEvents += 1;
    }

    if (event.eventType === "BADGE_REVOKED") {
      badgeRevokedCount += 1;
      subjectSummary.badgeEvents += 1;
    }

    if (event.eventType === "STREAK_UPDATED") {
      streakEventCount += 1;
    }

    if (event.eventType === "LEVEL_UP") {
      levelUpEventCount += 1;
      subjectSummary.levelUpEvents += 1;
    }

    if (latestEventAt === null || event.occurredAt > latestEventAt) {
      latestEventAt = event.occurredAt;
    }
  }

  return {
    studentId,
    totalEvents: relevantEvents.length,
    activeEvents: activeEvents.length,
    totalPoints,
    totalXp,
    badgeAwardedCount,
    badgeRevokedCount,
    netBadgeCount: badgeAwardedCount - badgeRevokedCount,
    streakEventCount,
    levelUpEventCount,
    latestEventAt,
    bySubject: Array.from(bySubjectMap.values()).sort((a, b) =>
      a.subjectKey.localeCompare(b.subjectKey),
    ),
  };
}

export function filterGamificationEventsForSubject(
  events: StudentGamificationEvent[],
  params: {
    subjectKey?: string;
    classSubjectOfferingId?: string;
  },
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (params.subjectKey && event.subjectKey !== params.subjectKey) {
      return false;
    }

    if (
      params.classSubjectOfferingId &&
      event.classSubjectOfferingId !== params.classSubjectOfferingId
    ) {
      return false;
    }

    return true;
  });
}

export function filterGamificationEventsForClass(
  events: StudentGamificationEvent[],
  params: {
    schoolId?: string;
    academicYearId?: string;
    termId?: string;
    classId?: string;
  },
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (params.schoolId && event.schoolId !== params.schoolId) return false;

    if (
      params.academicYearId &&
      event.academicYearId !== params.academicYearId
    ) {
      return false;
    }

    if (params.termId && event.termId !== params.termId) return false;
    if (params.classId && event.classId !== params.classId) return false;

    return true;
  });
}

export function filterGamificationEventsForGuardian(
  events: StudentGamificationEvent[],
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (event.status !== "ACTIVE") return false;

    return isGamificationVisibleToAudience({
      visibility: event.visibility,
      audience: "GUARDIAN",
    });
  });
}

export function filterGamificationEventsForStudentDisplay(
  events: StudentGamificationEvent[],
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (event.status !== "ACTIVE") return false;

    return isGamificationVisibleToAudience({
      visibility: event.visibility,
      audience: "CLASSROOM_DISPLAY",
    });
  });
}

export type CanCreateStudentGamificationEventInput = {
  actorPersonId: string;
  targetStudentId: string;

  classId?: string;
  subjectKey?: string;

  allowedStudentIds?: string[];
  allowedClassIds?: string[];
  allowedSubjectKeys?: string[];
};

export type CanCreateStudentGamificationEventResult = {
  allowed: boolean;
  reason?: string;
};

export function canCreateStudentGamificationEvent(
  input: CanCreateStudentGamificationEventInput,
): CanCreateStudentGamificationEventResult {
  if (!input.actorPersonId) {
    return {
      allowed: false,
      reason: "ACTOR_REQUIRED",
    };
  }

  if (!input.targetStudentId) {
    return {
      allowed: false,
      reason: "TARGET_STUDENT_REQUIRED",
    };
  }

  if (
    input.allowedStudentIds &&
    input.allowedStudentIds.length > 0 &&
    !input.allowedStudentIds.includes(input.targetStudentId)
  ) {
    return {
      allowed: false,
      reason: "STUDENT_OUT_OF_SCOPE",
    };
  }

  if (
    input.classId &&
    input.allowedClassIds &&
    input.allowedClassIds.length > 0 &&
    !input.allowedClassIds.includes(input.classId)
  ) {
    return {
      allowed: false,
      reason: "CLASS_OUT_OF_SCOPE",
    };
  }

  if (
    input.subjectKey &&
    input.allowedSubjectKeys &&
    input.allowedSubjectKeys.length > 0 &&
    !input.allowedSubjectKeys.includes(input.subjectKey)
  ) {
    return {
      allowed: false,
      reason: "SUBJECT_OUT_OF_SCOPE",
    };
  }

  return {
    allowed: true,
  };
}

export type ReverseStudentGamificationEventInput = {
  reversedAt?: number;
  reversedByPersonId: string;
  reverseReason?: string;
};

export function reverseStudentGamificationEvent(
  event: StudentGamificationEvent,
  input: ReverseStudentGamificationEventInput,
): StudentGamificationEvent {
  const reversedAt = input.reversedAt ?? Date.now();

  assertNonEmpty(input.reversedByPersonId, "reversedByPersonId");

  return {
    ...event,
    status: "REVERSED",
    reversedAt,
    reversedByPersonId: input.reversedByPersonId,
    reverseReason: input.reverseReason ?? "",
    updatedAt: reversedAt,
  };
}

export type CancelStudentGamificationEventInput = {
  cancelledAt?: number;
  cancelledByPersonId: string;
  cancelReason?: string;
};

export function cancelStudentGamificationEvent(
  event: StudentGamificationEvent,
  input: CancelStudentGamificationEventInput,
): StudentGamificationEvent {
  const cancelledAt = input.cancelledAt ?? Date.now();

  assertNonEmpty(input.cancelledByPersonId, "cancelledByPersonId");

  return {
    ...event,
    status: "CANCELLED",
    cancelledAt,
    cancelledByPersonId: input.cancelledByPersonId,
    cancelReason: input.cancelReason ?? "",
    updatedAt: cancelledAt,
  };
}

export type StudentGamificationSummarySnapshotContext = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  enrollmentId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
};

export type BuildStudentGamificationSummarySnapshotInput = {
  id?: string;
  studentId: string;
  context: StudentGamificationSummarySnapshotContext;
  events: StudentGamificationEvent[];

  /**
   * عناوين المواد اختيارية للعرض فقط.
   * مثال:
   * {
   *   MATH: "الرياضيات",
   *   SCIENCE: "العلوم"
   * }
   */
  subjectTitlesByKey?: Record<string, string>;

  /**
   * عدد آخر الأحداث المختصرة داخل snapshot.
   */
  recentEventsLimit?: number;

  computedAt?: number;
};

function eventMatchesSnapshotContext(
  event: StudentGamificationEvent,
  context: StudentGamificationSummarySnapshotContext,
) {
  if (event.orgId !== context.orgId) return false;
  if (event.schoolId !== context.schoolId) return false;
  if (event.academicYearId !== context.academicYearId) return false;

  if (context.termId && event.termId !== context.termId) return false;
  if (context.classId && event.classId !== context.classId) return false;
  if (context.gradeId && event.gradeId !== context.gradeId) return false;
  if (context.streamId && event.streamId !== context.streamId) return false;

  return true;
}

function getSnapshotSubjectKey(event: StudentGamificationEvent) {
  return event.subjectKey || "GENERAL";
}

function createSubjectSummarySnapshot(params: {
  subjectKey: string;
  subjectTitle?: string;
  classSubjectOfferingId?: string;
}): StudentGamificationSubjectSummarySnapshot {
  return {
    subjectKey: params.subjectKey,
    subjectTitle: params.subjectTitle ?? "",
    classSubjectOfferingId: params.classSubjectOfferingId ?? "",

    totalEvents: 0,
    activeEvents: 0,

    totalPoints: 0,
    totalXp: 0,

    badgeAwardedCount: 0,
    badgeRevokedCount: 0,
    netBadgeCount: 0,

    streakEventCount: 0,
    levelUpEventCount: 0,
  };
}

function addEventToSubjectSummarySnapshot(
  summary: StudentGamificationSubjectSummarySnapshot,
  event: StudentGamificationEvent,
) {
  summary.totalEvents += 1;

  if (event.status !== "ACTIVE") {
    return;
  }

  summary.activeEvents += 1;

  if (event.valueKind === "POINTS") {
    summary.totalPoints += event.value;
  }

  if (event.valueKind === "XP") {
    summary.totalXp += event.value;
  }

  if (event.eventType === "BADGE_AWARDED") {
    summary.badgeAwardedCount += 1;
  }

  if (event.eventType === "BADGE_REVOKED") {
    summary.badgeRevokedCount += 1;
  }

  summary.netBadgeCount = summary.badgeAwardedCount - summary.badgeRevokedCount;

  if (event.eventType === "STREAK_UPDATED") {
    summary.streakEventCount += 1;
  }

  if (event.eventType === "LEVEL_UP") {
    summary.levelUpEventCount += 1;
  }

  if (!summary.latestEventAt || event.occurredAt > summary.latestEventAt) {
    summary.latestEventAt = event.occurredAt;
  }
}

function toRecentEventSnapshot(params: {
  event: StudentGamificationEvent;
  subjectTitle?: string;
}): StudentGamificationRecentEventSnapshot {
  const { event, subjectTitle } = params;

  return {
    id: event.id,

    studentId: event.studentId,

    eventType: event.eventType,
    status: event.status,
    visibility: event.visibility,

    title: event.title ?? "",
    description: event.description ?? "",

    reasonKey: event.reasonKey ?? "",
    reasonTitle: event.reasonTitle ?? "",

    category: event.category ?? "",
    categoryTitle: event.categoryTitle ?? "",

    value: event.value,
    valueKind: event.valueKind,

    badgeKey: event.badgeKey ?? "",
    badgeTitle: event.badgeTitle ?? "",

    subjectKey: event.subjectKey ?? "",
    subjectTitle: subjectTitle ?? "",
    classSubjectOfferingId: event.classSubjectOfferingId ?? "",

    occurredAt: event.occurredAt,
  };
}

export function buildStudentGamificationSummarySnapshot(
  input: BuildStudentGamificationSummarySnapshotInput,
): StudentGamificationSummarySnapshot {
  assertNonEmpty(input.studentId, "studentId");
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");

  const computedAt = input.computedAt ?? Date.now();
  const recentEventsLimit = input.recentEventsLimit ?? 10;

  const relevantEvents = input.events.filter((event) => {
    if (event.studentId !== input.studentId) return false;

    return eventMatchesSnapshotContext(event, input.context);
  });

  const activeEvents = relevantEvents.filter(
    (event) => event.status === "ACTIVE",
  );

  let totalPoints = 0;
  let totalXp = 0;

  let badgeAwardedCount = 0;
  let badgeRevokedCount = 0;

  let streakEventCount = 0;
  let levelUpEventCount = 0;

  let latestEventAt: number | undefined;

  let staffOnlyEventsCount = 0;
  let studentDisplayEventsCount = 0;
  let guardianVisibleEventsCount = 0;
  let publicLeaderboardEventsCount = 0;

  const bySubjectMap = new Map<
    string,
    StudentGamificationSubjectSummarySnapshot
  >();

  for (const event of relevantEvents) {
    const subjectKey = getSnapshotSubjectKey(event);
    const subjectTitle = input.subjectTitlesByKey?.[subjectKey] ?? "";

    if (!bySubjectMap.has(subjectKey)) {
      bySubjectMap.set(
        subjectKey,
        createSubjectSummarySnapshot({
          subjectKey,
          subjectTitle,
          classSubjectOfferingId: event.classSubjectOfferingId,
        }),
      );
    }

    const subjectSummary = bySubjectMap.get(subjectKey)!;
    addEventToSubjectSummarySnapshot(subjectSummary, event);

    if (event.status !== "ACTIVE") {
      continue;
    }

    if (event.valueKind === "POINTS") {
      totalPoints += event.value;
    }

    if (event.valueKind === "XP") {
      totalXp += event.value;
    }

    if (event.eventType === "BADGE_AWARDED") {
      badgeAwardedCount += 1;
    }

    if (event.eventType === "BADGE_REVOKED") {
      badgeRevokedCount += 1;
    }

    if (event.eventType === "STREAK_UPDATED") {
      streakEventCount += 1;
    }

    if (event.eventType === "LEVEL_UP") {
      levelUpEventCount += 1;
    }

    if (!latestEventAt || event.occurredAt > latestEventAt) {
      latestEventAt = event.occurredAt;
    }

    switch (event.visibility) {
      case "STAFF_ONLY":
        staffOnlyEventsCount += 1;
        break;

      case "STUDENT_DISPLAY":
        studentDisplayEventsCount += 1;
        break;

      case "GUARDIAN_VISIBLE":
        guardianVisibleEventsCount += 1;
        break;

      case "PUBLIC_LEADERBOARD":
        publicLeaderboardEventsCount += 1;
        break;

      default:
        break;
    }
  }

  const recentEvents = activeEvents
    .slice()
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, recentEventsLimit)
    .map((event) =>
      toRecentEventSnapshot({
        event,
        subjectTitle:
          input.subjectTitlesByKey?.[getSnapshotSubjectKey(event)] ?? "",
      }),
    );

  const id =
    input.id ??
    buildStableId({
      prefix: "student_gamification_summary",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.studentId,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    studentId: input.studentId,
    enrollmentId: input.context.enrollmentId ?? "",

    gradeId: input.context.gradeId ?? "",
    streamId: input.context.streamId ?? "",
    classId: input.context.classId ?? "",

    totalEvents: relevantEvents.length,
    activeEvents: activeEvents.length,

    totalPoints,
    totalXp,

    badgeAwardedCount,
    badgeRevokedCount,
    netBadgeCount: badgeAwardedCount - badgeRevokedCount,

    streakEventCount,
    levelUpEventCount,

    latestEventAt,

    staffOnlyEventsCount,
    studentDisplayEventsCount,
    guardianVisibleEventsCount,
    publicLeaderboardEventsCount,

    studentVisibleEventsCount:
      studentDisplayEventsCount +
      guardianVisibleEventsCount +
      publicLeaderboardEventsCount,

    guardianEligibleEventsCount:
      guardianVisibleEventsCount + publicLeaderboardEventsCount,

    bySubject: Array.from(bySubjectMap.values()).sort((a, b) =>
      a.subjectKey.localeCompare(b.subjectKey),
    ),

    recentEvents,

    computedAt,

    createdAt: computedAt,
    updatedAt: computedAt,
  };
}

export type StudentGamificationLeaderboardContext = {
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;

  termId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;

  subjectKey?: string;
  classSubjectOfferingId?: string;
};

export type StudentGamificationLeaderboardSortBy =
  | "POINTS"
  | "XP"
  | "BADGES"
  | "TOTAL_VALUE"
  | "LATEST_EVENT";

export type StudentGamificationLeaderboardRow = {
  rank: number;

  studentId: string;
  enrollmentId: string;
  studentDisplayName: string;

  schoolId: string;
  academicYearId: string;

  termId: string;
  gradeId: string;
  streamId: string;
  classId: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  totalEvents: number;
  activeEvents: number;

  totalPoints: number;
  totalXp: number;
  totalValue: number;

  badgeAwardedCount: number;
  badgeRevokedCount: number;
  netBadgeCount: number;

  streakEventCount: number;
  levelUpEventCount: number;

  latestEventAt: number | null;
};

export type BuildStudentGamificationLeaderboardInput = {
  events: StudentGamificationEvent[];

  context?: StudentGamificationLeaderboardContext;

  studentDisplayNamesById?: Record<string, string>;

  sortBy?: StudentGamificationLeaderboardSortBy;

  limit?: number;

  includeInactiveEvents?: boolean;
};

function gamificationEventMatchesLeaderboardContext(params: {
  event: StudentGamificationEvent;
  context?: StudentGamificationLeaderboardContext;
}) {
  const { event, context } = params;

  if (!context) return true;

  if (context.orgId && event.orgId !== context.orgId) return false;
  if (context.schoolId && event.schoolId !== context.schoolId) return false;

  if (
    context.academicYearId &&
    event.academicYearId !== context.academicYearId
  ) {
    return false;
  }

  if (context.termId && event.termId !== context.termId) return false;
  if (context.gradeId && event.gradeId !== context.gradeId) return false;
  if (context.streamId && event.streamId !== context.streamId) return false;
  if (context.classId && event.classId !== context.classId) return false;

  if (context.subjectKey && event.subjectKey !== context.subjectKey) {
    return false;
  }

  if (
    context.classSubjectOfferingId &&
    event.classSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  return true;
}

function createLeaderboardRow(params: {
  event: StudentGamificationEvent;
  studentDisplayName?: string;
}): StudentGamificationLeaderboardRow {
  const { event, studentDisplayName } = params;

  return {
    rank: 0,

    studentId: event.studentId,
    enrollmentId: event.enrollmentId ?? "",
    studentDisplayName: studentDisplayName || event.studentId,

    schoolId: event.schoolId,
    academicYearId: event.academicYearId,

    termId: event.termId ?? "",
    gradeId: event.gradeId ?? "",
    streamId: event.streamId ?? "",
    classId: event.classId ?? "",

    subjectKey: event.subjectKey ?? "",
    classSubjectOfferingId: event.classSubjectOfferingId ?? "",

    totalEvents: 0,
    activeEvents: 0,

    totalPoints: 0,
    totalXp: 0,
    totalValue: 0,

    badgeAwardedCount: 0,
    badgeRevokedCount: 0,
    netBadgeCount: 0,

    streakEventCount: 0,
    levelUpEventCount: 0,

    latestEventAt: null,
  };
}

function addEventToLeaderboardRow(
  row: StudentGamificationLeaderboardRow,
  event: StudentGamificationEvent,
  includeInactiveEvents: boolean,
) {
  row.totalEvents += 1;

  if (event.status !== "ACTIVE") {
    if (!includeInactiveEvents) return;
  } else {
    row.activeEvents += 1;
  }

  if (event.valueKind === "POINTS") {
    row.totalPoints += event.value;
  }

  if (event.valueKind === "XP") {
    row.totalXp += event.value;
  }

  if (event.valueKind === "POINTS" || event.valueKind === "XP") {
    row.totalValue += event.value;
  }

  if (event.eventType === "BADGE_AWARDED") {
    row.badgeAwardedCount += 1;
  }

  if (event.eventType === "BADGE_REVOKED") {
    row.badgeRevokedCount += 1;
  }

  row.netBadgeCount = row.badgeAwardedCount - row.badgeRevokedCount;

  if (event.eventType === "STREAK_UPDATED") {
    row.streakEventCount += 1;
  }

  if (event.eventType === "LEVEL_UP") {
    row.levelUpEventCount += 1;
  }

  if (row.latestEventAt === null || event.occurredAt > row.latestEventAt) {
    row.latestEventAt = event.occurredAt;
  }
}

function sortLeaderboardRows(
  rows: StudentGamificationLeaderboardRow[],
  sortBy: StudentGamificationLeaderboardSortBy,
) {
  return rows.slice().sort((a, b) => {
    switch (sortBy) {
      case "XP":
        return (
          b.totalXp - a.totalXp ||
          b.totalPoints - a.totalPoints ||
          b.netBadgeCount - a.netBadgeCount ||
          (b.latestEventAt ?? 0) - (a.latestEventAt ?? 0)
        );

      case "BADGES":
        return (
          b.netBadgeCount - a.netBadgeCount ||
          b.totalPoints - a.totalPoints ||
          b.totalXp - a.totalXp ||
          (b.latestEventAt ?? 0) - (a.latestEventAt ?? 0)
        );

      case "TOTAL_VALUE":
        return (
          b.totalValue - a.totalValue ||
          b.netBadgeCount - a.netBadgeCount ||
          (b.latestEventAt ?? 0) - (a.latestEventAt ?? 0)
        );

      case "LATEST_EVENT":
        return (
          (b.latestEventAt ?? 0) - (a.latestEventAt ?? 0) ||
          b.totalPoints - a.totalPoints ||
          b.totalXp - a.totalXp
        );

      case "POINTS":
      default:
        return (
          b.totalPoints - a.totalPoints ||
          b.totalXp - a.totalXp ||
          b.netBadgeCount - a.netBadgeCount ||
          (b.latestEventAt ?? 0) - (a.latestEventAt ?? 0)
        );
    }
  });
}

export function buildStudentGamificationLeaderboard(
  input: BuildStudentGamificationLeaderboardInput,
): StudentGamificationLeaderboardRow[] {
  const sortBy = input.sortBy ?? "POINTS";
  const includeInactiveEvents = input.includeInactiveEvents ?? false;

  const rowsByStudentId = new Map<string, StudentGamificationLeaderboardRow>();

  const relevantEvents = input.events.filter((event) => {
    if (!includeInactiveEvents && event.status !== "ACTIVE") return false;

    return gamificationEventMatchesLeaderboardContext({
      event,
      context: input.context,
    });
  });

  for (const event of relevantEvents) {
    if (!rowsByStudentId.has(event.studentId)) {
      rowsByStudentId.set(
        event.studentId,
        createLeaderboardRow({
          event,
          studentDisplayName: input.studentDisplayNamesById?.[event.studentId],
        }),
      );
    }

    const row = rowsByStudentId.get(event.studentId)!;

    addEventToLeaderboardRow(row, event, includeInactiveEvents);
  }

  const sortedRows = sortLeaderboardRows(
    Array.from(rowsByStudentId.values()),
    sortBy,
  );

  const limitedRows =
    typeof input.limit === "number" && input.limit > 0
      ? sortedRows.slice(0, input.limit)
      : sortedRows;

  return limitedRows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export type StudentGamificationPublicViewContext = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  enrollmentId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;

  subjectKey?: string;
  subjectTitle?: string;
  classSubjectOfferingId?: string;
};

export type BuildStudentGamificationStudentViewInput = {
  id?: string;
  studentId: string;
  context: StudentGamificationPublicViewContext;
  events: StudentGamificationEvent[];
  subjectTitlesByKey?: Record<string, string>;
  recentEventsLimit?: number;
  computedAt?: number;
};

export type BuildStudentGamificationGuardianViewInput = {
  id?: string;
  guardianId?: string;
  studentId: string;
  studentDisplayName?: string;
  context: StudentGamificationPublicViewContext;
  events: StudentGamificationEvent[];
  subjectTitlesByKey?: Record<string, string>;
  recentEventsLimit?: number;
  computedAt?: number;
};

export type BuildStudentGamificationClassroomDisplayViewInput = {
  id?: string;
  context: StudentGamificationPublicViewContext;
  events: StudentGamificationEvent[];
  subjectTitlesByKey?: Record<string, string>;
  recentEventsLimit?: number;
  computedAt?: number;
};

function publicEventMatchesContext(params: {
  event: StudentGamificationEvent;
  context: StudentGamificationPublicViewContext;
}) {
  const { event, context } = params;

  if (event.orgId !== context.orgId) return false;
  if (event.schoolId !== context.schoolId) return false;
  if (event.academicYearId !== context.academicYearId) return false;

  if (context.termId && event.termId !== context.termId) return false;
  if (context.gradeId && event.gradeId !== context.gradeId) return false;
  if (context.streamId && event.streamId !== context.streamId) return false;
  if (context.classId && event.classId !== context.classId) return false;

  if (context.subjectKey && event.subjectKey !== context.subjectKey) {
    return false;
  }

  if (
    context.classSubjectOfferingId &&
    event.classSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  return true;
}

export function filterEventsForStudentView(
  events: StudentGamificationEvent[],
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (event.status !== "ACTIVE") return false;

    return isGamificationVisibleToAudience({
      visibility: event.visibility,
      audience: "STUDENT",
    });
  });
}

export function filterEventsForGuardianView(
  events: StudentGamificationEvent[],
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (event.status !== "ACTIVE") return false;

    return isGamificationVisibleToAudience({
      visibility: event.visibility,
      audience: "GUARDIAN",
    });
  });
}

export function filterEventsForClassroomDisplayView(
  events: StudentGamificationEvent[],
): StudentGamificationEvent[] {
  return events.filter((event) => {
    if (event.status !== "ACTIVE") return false;

    return isGamificationVisibleToAudience({
      visibility: event.visibility,
      audience: "CLASSROOM_DISPLAY",
    });
  });
}

function resolvePublicSubjectTitle(params: {
  event: StudentGamificationEvent;
  context?: StudentGamificationPublicViewContext;
  subjectTitlesByKey?: Record<string, string>;
}) {
  const { event, context, subjectTitlesByKey } = params;

  const subjectKey = event.subjectKey || "GENERAL";

  return subjectTitlesByKey?.[subjectKey] || context?.subjectTitle || "";
}

function toPublicGamificationEvent(params: {
  event: StudentGamificationEvent;
  context?: StudentGamificationPublicViewContext;
  subjectTitlesByKey?: Record<string, string>;
}): StudentGamificationPublicEvent {
  const { event, context, subjectTitlesByKey } = params;

  return {
    id: event.id,

    orgId: event.orgId,
    schoolId: event.schoolId,
    academicYearId: event.academicYearId,

    termId: event.termId ?? "",
    termTitle: event.termTitle ?? "",
    termShortTitle: event.termShortTitle ?? "",

    studentId: event.studentId,
    enrollmentId: event.enrollmentId ?? "",

    gradeId: event.gradeId ?? "",
    streamId: event.streamId ?? "",
    classId: event.classId ?? "",

    subjectKey: event.subjectKey ?? "",
    subjectTitle: resolvePublicSubjectTitle({
      event,
      context,
      subjectTitlesByKey,
    }),
    classSubjectOfferingId: event.classSubjectOfferingId ?? "",

    eventType: event.eventType,
    visibility: event.visibility,

    title: event.title ?? "",
    description: event.description ?? "",

    reasonKey: event.reasonKey ?? "",
    reasonTitle: event.reasonTitle ?? "",

    category: event.category ?? "",
    categoryTitle: event.categoryTitle ?? "",

    value: event.value,
    valueKind: event.valueKind,

    badgeKey: event.badgeKey ?? "",
    badgeTitle: event.badgeTitle ?? "",

    occurredAt: event.occurredAt,
  };
}

function createPublicSubjectSummary(params: {
  subjectKey: string;
  subjectTitle?: string;
  classSubjectOfferingId?: string;
}): StudentGamificationPublicSubjectSummary {
  return {
    subjectKey: params.subjectKey,
    subjectTitle: params.subjectTitle ?? "",
    classSubjectOfferingId: params.classSubjectOfferingId ?? "",

    totalEvents: 0,

    totalPoints: 0,
    totalXp: 0,

    badgeAwardedCount: 0,
    netBadgeCount: 0,
  };
}

function addPublicEventToSubjectSummary(
  summary: StudentGamificationPublicSubjectSummary,
  event: StudentGamificationEvent,
) {
  summary.totalEvents += 1;

  if (event.valueKind === "POINTS") {
    summary.totalPoints += event.value;
  }

  if (event.valueKind === "XP") {
    summary.totalXp += event.value;
  }

  if (event.eventType === "BADGE_AWARDED") {
    summary.badgeAwardedCount += 1;
  }

  if (event.eventType === "BADGE_REVOKED") {
    summary.netBadgeCount -= 1;
  }

  if (event.eventType === "BADGE_AWARDED") {
    summary.netBadgeCount += 1;
  }

  if (!summary.latestEventAt || event.occurredAt > summary.latestEventAt) {
    summary.latestEventAt = event.occurredAt;
  }
}

function buildPublicSubjectSummaries(params: {
  events: StudentGamificationEvent[];
  context: StudentGamificationPublicViewContext;
  subjectTitlesByKey?: Record<string, string>;
}) {
  const map = new Map<string, StudentGamificationPublicSubjectSummary>();

  for (const event of params.events) {
    const subjectKey = event.subjectKey || "GENERAL";

    if (!map.has(subjectKey)) {
      map.set(
        subjectKey,
        createPublicSubjectSummary({
          subjectKey,
          subjectTitle: resolvePublicSubjectTitle({
            event,
            context: params.context,
            subjectTitlesByKey: params.subjectTitlesByKey,
          }),
          classSubjectOfferingId: event.classSubjectOfferingId,
        }),
      );
    }

    addPublicEventToSubjectSummary(map.get(subjectKey)!, event);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.subjectKey.localeCompare(b.subjectKey),
  );
}

function buildPublicTotals(events: StudentGamificationEvent[]) {
  let totalPoints = 0;
  let totalXp = 0;
  let badgeAwardedCount = 0;
  let badgeRevokedCount = 0;
  let levelUpEventCount = 0;
  let latestEventAt: number | undefined;

  for (const event of events) {
    if (event.valueKind === "POINTS") {
      totalPoints += event.value;
    }

    if (event.valueKind === "XP") {
      totalXp += event.value;
    }

    if (event.eventType === "BADGE_AWARDED") {
      badgeAwardedCount += 1;
    }

    if (event.eventType === "BADGE_REVOKED") {
      badgeRevokedCount += 1;
    }

    if (event.eventType === "LEVEL_UP") {
      levelUpEventCount += 1;
    }

    if (!latestEventAt || event.occurredAt > latestEventAt) {
      latestEventAt = event.occurredAt;
    }
  }

  return {
    totalPoints,
    totalXp,
    badgeAwardedCount,
    badgeRevokedCount,
    netBadgeCount: badgeAwardedCount - badgeRevokedCount,
    levelUpEventCount,
    latestEventAt,
  };
}

function getRecentPublicEvents(params: {
  events: StudentGamificationEvent[];
  context: StudentGamificationPublicViewContext;
  subjectTitlesByKey?: Record<string, string>;
  limit: number;
}) {
  return params.events
    .slice()
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, params.limit)
    .map((event) =>
      toPublicGamificationEvent({
        event,
        context: params.context,
        subjectTitlesByKey: params.subjectTitlesByKey,
      }),
    );
}

export function buildStudentGamificationStudentView(
  input: BuildStudentGamificationStudentViewInput,
): StudentGamificationStudentView {
  assertNonEmpty(input.studentId, "studentId");
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");

  const computedAt = input.computedAt ?? Date.now();
  const recentEventsLimit = input.recentEventsLimit ?? 10;

  const visibleEvents = filterEventsForStudentView(input.events).filter(
    (event) => {
      if (event.studentId !== input.studentId) return false;

      return publicEventMatchesContext({
        event,
        context: input.context,
      });
    },
  );

  const totals = buildPublicTotals(visibleEvents);

  const id =
    input.id ??
    buildStableId({
      prefix: "student_gamification_student_view",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.studentId,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    studentId: input.studentId,
    enrollmentId: input.context.enrollmentId ?? "",

    gradeId: input.context.gradeId ?? "",
    streamId: input.context.streamId ?? "",
    classId: input.context.classId ?? "",

    audience: "STUDENT",

    totalVisibleEvents: visibleEvents.length,

    totalPoints: totals.totalPoints,
    totalXp: totals.totalXp,

    badgeAwardedCount: totals.badgeAwardedCount,
    netBadgeCount: totals.netBadgeCount,

    levelUpEventCount: totals.levelUpEventCount,
    latestEventAt: totals.latestEventAt,

    bySubject: buildPublicSubjectSummaries({
      events: visibleEvents,
      context: input.context,
      subjectTitlesByKey: input.subjectTitlesByKey,
    }),

    recentEvents: getRecentPublicEvents({
      events: visibleEvents,
      context: input.context,
      subjectTitlesByKey: input.subjectTitlesByKey,
      limit: recentEventsLimit,
    }),

    computedAt,

    createdAt: computedAt,
    updatedAt: computedAt,
  };
}

export function buildStudentGamificationGuardianView(
  input: BuildStudentGamificationGuardianViewInput,
): StudentGamificationGuardianView {
  assertNonEmpty(input.studentId, "studentId");
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");

  const computedAt = input.computedAt ?? Date.now();
  const recentEventsLimit = input.recentEventsLimit ?? 10;

  const visibleEvents = filterEventsForGuardianView(input.events).filter(
    (event) => {
      if (event.studentId !== input.studentId) return false;

      return publicEventMatchesContext({
        event,
        context: input.context,
      });
    },
  );

  const totals = buildPublicTotals(visibleEvents);

  const id =
    input.id ??
    buildStableId({
      prefix: "student_gamification_guardian_view",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.guardianId,
        input.studentId,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    guardianId: input.guardianId ?? "",

    studentId: input.studentId,
    enrollmentId: input.context.enrollmentId ?? "",

    studentDisplayName: input.studentDisplayName ?? "",

    gradeId: input.context.gradeId ?? "",
    streamId: input.context.streamId ?? "",
    classId: input.context.classId ?? "",

    audience: "GUARDIAN",

    totalVisibleEvents: visibleEvents.length,

    totalPoints: totals.totalPoints,
    totalXp: totals.totalXp,

    badgeAwardedCount: totals.badgeAwardedCount,
    netBadgeCount: totals.netBadgeCount,

    levelUpEventCount: totals.levelUpEventCount,
    latestEventAt: totals.latestEventAt,

    bySubject: buildPublicSubjectSummaries({
      events: visibleEvents,
      context: input.context,
      subjectTitlesByKey: input.subjectTitlesByKey,
    }),

    recentEvents: getRecentPublicEvents({
      events: visibleEvents,
      context: input.context,
      subjectTitlesByKey: input.subjectTitlesByKey,
      limit: recentEventsLimit,
    }),

    computedAt,

    createdAt: computedAt,
    updatedAt: computedAt,
  };
}

export function buildStudentGamificationClassroomDisplayView(
  input: BuildStudentGamificationClassroomDisplayViewInput,
): StudentGamificationClassroomDisplayView {
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");

  const computedAt = input.computedAt ?? Date.now();
  const recentEventsLimit = input.recentEventsLimit ?? 20;

  const visibleEvents = filterEventsForClassroomDisplayView(
    input.events,
  ).filter((event) =>
    publicEventMatchesContext({
      event,
      context: input.context,
    }),
  );

  const id =
    input.id ??
    buildStableId({
      prefix: "student_gamification_classroom_display_view",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.context.subjectKey,
        input.context.classSubjectOfferingId,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    gradeId: input.context.gradeId ?? "",
    streamId: input.context.streamId ?? "",
    classId: input.context.classId ?? "",

    subjectKey: input.context.subjectKey ?? "",
    subjectTitle: input.context.subjectTitle ?? "",
    classSubjectOfferingId: input.context.classSubjectOfferingId ?? "",

    audience: "CLASSROOM_DISPLAY",

    totalVisibleEvents: visibleEvents.length,

    recentEvents: getRecentPublicEvents({
      events: visibleEvents,
      context: input.context,
      subjectTitlesByKey: input.subjectTitlesByKey,
      limit: recentEventsLimit,
    }),

    computedAt,

    createdAt: computedAt,
    updatedAt: computedAt,
  };
}

export type ClassroomDisplayGamificationFeedItem = {
  id: string;

  studentId: string;
  studentDisplayName: string;

  message: string;
  emoji: string;

  eventType: StudentGamificationEventType;
  visibility: StudentGamificationEventVisibility;

  subjectKey: string;
  subjectTitle: string;
  classSubjectOfferingId: string;

  reasonTitle: string;
  badgeTitle: string;

  value: number;
  valueKind: StudentGamificationValueKind;

  occurredAt: number;
};

export type ClassroomDisplayGamificationFeed = {
  id: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId: string;
  termTitle: string;
  termShortTitle: string;

  gradeId: string;
  streamId: string;
  classId: string;

  subjectKey: string;
  subjectTitle: string;
  classSubjectOfferingId: string;

  totalItems: number;
  items: ClassroomDisplayGamificationFeedItem[];

  computedAt: number;
};

export type BuildClassroomDisplayGamificationFeedInput = {
  id?: string;

  context: StudentGamificationPublicViewContext;
  events: StudentGamificationEvent[];

  studentDisplayNamesById?: Record<string, string>;
  subjectTitlesByKey?: Record<string, string>;

  /**
   * عدد العناصر التي تظهر في الشاشة.
   */
  limit?: number;

  /**
   * اختياري: عرض أحداث آخر مدة فقط.
   * مثال: آخر 10 دقائق أو آخر يوم.
   */
  maxAgeMs?: number;

  /**
   * وقت الحساب.
   */
  computedAt?: number;
};

function resolveClassroomDisplayEmoji(event: StudentGamificationEvent) {
  if (event.badgeTitle || event.eventType === "BADGE_AWARDED") return "🏅";
  if (event.eventType === "POINTS_ADD") return "⭐";
  if (event.eventType === "XP_ADD") return "✨";
  if (event.eventType === "LEVEL_UP") return "🚀";
  if (event.eventType === "QUEST_COMPLETED") return "🎯";
  if (event.eventType === "POSITIVE_NOTE") return "👏";
  if (event.eventType === "STREAK_UPDATED") return "🔥";

  return "🌟";
}

function buildClassroomDisplayMessage(params: {
  event: StudentGamificationEvent;
  studentDisplayName: string;
}) {
  const { event, studentDisplayName } = params;

  if (event.badgeTitle) {
    return `${studentDisplayName} حصل على شارة ${event.badgeTitle}`;
  }

  if (event.reasonTitle) {
    return `${studentDisplayName} — ${event.reasonTitle}`;
  }

  if (event.eventType === "POINTS_ADD") {
    return `${studentDisplayName} حصل على ${event.value} نقطة`;
  }

  if (event.eventType === "XP_ADD") {
    return `${studentDisplayName} حصل على ${event.value} XP`;
  }

  if (event.eventType === "LEVEL_UP") {
    return `${studentDisplayName} وصل إلى مستوى جديد`;
  }

  if (event.eventType === "QUEST_COMPLETED") {
    return `${studentDisplayName} أنجز مهمة`;
  }

  if (event.eventType === "POSITIVE_NOTE") {
    return `${studentDisplayName} حصل على ملاحظة إيجابية`;
  }

  return `${studentDisplayName} حصل على تحفيز جديد`;
}

function toClassroomDisplayFeedItem(params: {
  event: StudentGamificationEvent;
  context: StudentGamificationPublicViewContext;
  studentDisplayNamesById?: Record<string, string>;
  subjectTitlesByKey?: Record<string, string>;
}): ClassroomDisplayGamificationFeedItem {
  const { event, context, studentDisplayNamesById, subjectTitlesByKey } =
    params;

  const studentDisplayName =
    studentDisplayNamesById?.[event.studentId] || event.studentId;

  const subjectKey = event.subjectKey || context.subjectKey || "";
  const subjectTitle =
    subjectTitlesByKey?.[subjectKey] || context.subjectTitle || "";

  return {
    id: event.id,

    studentId: event.studentId,
    studentDisplayName,

    message: buildClassroomDisplayMessage({
      event,
      studentDisplayName,
    }),
    emoji: resolveClassroomDisplayEmoji(event),

    eventType: event.eventType,
    visibility: event.visibility,

    subjectKey,
    subjectTitle,
    classSubjectOfferingId:
      event.classSubjectOfferingId ?? context.classSubjectOfferingId ?? "",

    reasonTitle: event.reasonTitle ?? "",
    badgeTitle: event.badgeTitle ?? "",

    value: event.value,
    valueKind: event.valueKind,

    occurredAt: event.occurredAt,
  };
}

export function buildClassroomDisplayGamificationFeed(
  input: BuildClassroomDisplayGamificationFeedInput,
): ClassroomDisplayGamificationFeed {
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");

  const computedAt = input.computedAt ?? Date.now();
  const limit = input.limit ?? 20;

  const visibleEvents = filterEventsForClassroomDisplayView(input.events)
    .filter((event) =>
      publicEventMatchesContext({
        event,
        context: input.context,
      }),
    )
    .filter((event) => {
      if (!input.maxAgeMs) return true;

      return computedAt - event.occurredAt <= input.maxAgeMs;
    })
    .sort((a, b) => b.occurredAt - a.occurredAt);

  const items = visibleEvents.slice(0, limit).map((event) =>
    toClassroomDisplayFeedItem({
      event,
      context: input.context,
      studentDisplayNamesById: input.studentDisplayNamesById,
      subjectTitlesByKey: input.subjectTitlesByKey,
    }),
  );

  const id =
    input.id ??
    buildStableId({
      prefix: "classroom_display_gamification_feed",
      parts: [
        input.context.orgId,
        input.context.schoolId,
        input.context.academicYearId,
        input.context.termId,
        input.context.classId,
        input.context.subjectKey,
        input.context.classSubjectOfferingId,
      ],
    });

  return {
    id,

    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId ?? "",
    termTitle: input.context.termTitle ?? "",
    termShortTitle: input.context.termShortTitle ?? "",

    gradeId: input.context.gradeId ?? "",
    streamId: input.context.streamId ?? "",
    classId: input.context.classId ?? "",

    subjectKey: input.context.subjectKey ?? "",
    subjectTitle: input.context.subjectTitle ?? "",
    classSubjectOfferingId: input.context.classSubjectOfferingId ?? "",

    totalItems: items.length,
    items,

    computedAt,
  };
}

export type StudentGamificationProgressContext = {
  orgId: string;
  schoolId?: string;
  academicYearId?: string;

  termId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;

  subjectKey?: string;
  classSubjectOfferingId?: string;
};

export type StudentGamificationProgressStats = {
  studentId: string;

  totalEvents: number;
  activeEvents: number;

  totalPoints: number;
  totalXp: number;

  badgeAwardedCount: number;
  badgeRevokedCount: number;
  netBadgeCount: number;

  levelUpEventCount: number;
  streakEventCount: number;

  latestEventAt: number | null;

  reasonCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  badgeCounts: Record<string, number>;
};

export type StudentGamificationLevelResult = {
  studentId: string;

  stats: StudentGamificationProgressStats;

  currentLevel: {
    id: string;
    key: string;
    title: string;
    description: string;
    levelNumber: number;

    emoji: string;
    iconKey: string;
    imageUrl: string;

    color: string;
    backgroundColor: string;
  } | null;

  nextLevel: {
    id: string;
    key: string;
    title: string;
    description: string;
    levelNumber: number;

    minPoints: number;
    minXp: number;
    minBadges: number;

    emoji: string;
    iconKey: string;
    imageUrl: string;

    color: string;
    backgroundColor: string;
  } | null;

  progressToNextLevelPercentage: number;
  remainingPointsToNextLevel: number;
  remainingXpToNextLevel: number;
  remainingBadgesToNextLevel: number;
};

export type UnlockedGamificationAchievement = {
  ruleId: string;
  ruleKey: string;
  title: string;
  description: string;

  kind: string;
  category: string;
  categoryTitle: string;

  triggerMetric: string;
  thresholdValue: number;
  currentValue: number;

  rewardEventType: StudentGamificationEventType;
  rewardBadgeId: string;
  rewardBadgeKey: string;
  rewardBadgeTitle: string;
  rewardValue: number;
  rewardValueKind: StudentGamificationValueKind;
  defaultVisibility: StudentGamificationEventVisibility;

  emoji: string;
  iconKey: string;
  imageUrl: string;

  color: string;
  backgroundColor: string;
};

export type PendingGamificationAchievement = {
  ruleId: string;
  ruleKey: string;
  title: string;
  description: string;

  triggerMetric: string;
  thresholdValue: number;
  currentValue: number;
  progressPercentage: number;
};

export type ResolveUnlockedGamificationAchievementsResult = {
  studentId: string;
  stats: StudentGamificationProgressStats;
  unlocked: UnlockedGamificationAchievement[];
  pending: PendingGamificationAchievement[];
};

function progressRuleMatchesContext(params: {
  rule: {
    orgId: string;
    scopeType: string;
    scopeId?: string;

    schoolId?: string;
    academicYearId?: string;
    termId?: string;

    gradeId?: string;
    classId?: string;

    subjectKey?: string;
    classSubjectOfferingId?: string;
  };
  context: StudentGamificationProgressContext;
}) {
  const { rule, context } = params;

  if (rule.orgId !== context.orgId) return false;

  if (rule.schoolId && rule.schoolId !== context.schoolId) return false;

  if (rule.academicYearId && rule.academicYearId !== context.academicYearId) {
    return false;
  }

  if (rule.termId && rule.termId !== context.termId) return false;
  if (rule.gradeId && rule.gradeId !== context.gradeId) return false;
  if (rule.classId && rule.classId !== context.classId) return false;

  if (rule.subjectKey && rule.subjectKey !== context.subjectKey) {
    return false;
  }

  if (
    rule.classSubjectOfferingId &&
    rule.classSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  switch (rule.scopeType) {
    case "ORG":
      return true;

    case "SCHOOL":
      return Boolean(context.schoolId) && rule.scopeId === context.schoolId;

    case "ACADEMIC_YEAR":
      return (
        Boolean(context.academicYearId) &&
        rule.scopeId === context.academicYearId
      );

    case "TERM":
      return Boolean(context.termId) && rule.scopeId === context.termId;

    case "GRADE":
      return Boolean(context.gradeId) && rule.scopeId === context.gradeId;

    case "CLASS":
      return Boolean(context.classId) && rule.scopeId === context.classId;

    case "SUBJECT":
      return (
        Boolean(context.subjectKey) &&
        (rule.scopeId === context.subjectKey ||
          rule.subjectKey === context.subjectKey)
      );

    case "CLASS_SUBJECT_OFFERING":
      return (
        Boolean(context.classSubjectOfferingId) &&
        (rule.scopeId === context.classSubjectOfferingId ||
          rule.classSubjectOfferingId === context.classSubjectOfferingId)
      );

    default:
      return false;
  }
}

function gamificationProgressEventMatchesContext(params: {
  event: StudentGamificationEvent;
  context?: StudentGamificationProgressContext;
}) {
  const { event, context } = params;

  if (!context) return true;

  if (event.orgId !== context.orgId) return false;

  if (context.schoolId && event.schoolId !== context.schoolId) return false;

  if (
    context.academicYearId &&
    event.academicYearId !== context.academicYearId
  ) {
    return false;
  }

  if (context.termId && event.termId !== context.termId) return false;
  if (context.gradeId && event.gradeId !== context.gradeId) return false;
  if (context.streamId && event.streamId !== context.streamId) return false;
  if (context.classId && event.classId !== context.classId) return false;

  if (context.subjectKey && event.subjectKey !== context.subjectKey) {
    return false;
  }

  if (
    context.classSubjectOfferingId &&
    event.classSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  return true;
}

function incrementCounter(
  source: Record<string, number>,
  key: string | undefined,
) {
  const safeKey = key || "UNKNOWN";
  source[safeKey] = (source[safeKey] ?? 0) + 1;
}

function buildStudentGamificationProgressStats(params: {
  studentId: string;
  events: StudentGamificationEvent[];
  context?: StudentGamificationProgressContext;
}): StudentGamificationProgressStats {
  const relevantEvents = params.events.filter((event) => {
    if (event.studentId !== params.studentId) return false;

    return gamificationProgressEventMatchesContext({
      event,
      context: params.context,
    });
  });

  const activeEvents = relevantEvents.filter(
    (event) => event.status === "ACTIVE",
  );

  const reasonCounts: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};
  const badgeCounts: Record<string, number> = {};

  let totalPoints = 0;
  let totalXp = 0;

  let badgeAwardedCount = 0;
  let badgeRevokedCount = 0;

  let levelUpEventCount = 0;
  let streakEventCount = 0;

  let latestEventAt: number | null = null;

  for (const event of activeEvents) {
    if (event.valueKind === "POINTS") {
      totalPoints += event.value;
    }

    if (event.valueKind === "XP") {
      totalXp += event.value;
    }

    if (event.eventType === "BADGE_AWARDED") {
      badgeAwardedCount += 1;
      incrementCounter(badgeCounts, event.badgeKey);
    }

    if (event.eventType === "BADGE_REVOKED") {
      badgeRevokedCount += 1;
      incrementCounter(badgeCounts, event.badgeKey);
    }

    if (event.eventType === "LEVEL_UP") {
      levelUpEventCount += 1;
    }

    if (event.eventType === "STREAK_UPDATED") {
      streakEventCount += 1;
    }

    incrementCounter(reasonCounts, event.reasonKey);
    incrementCounter(eventTypeCounts, event.eventType);

    if (latestEventAt === null || event.occurredAt > latestEventAt) {
      latestEventAt = event.occurredAt;
    }
  }

  return {
    studentId: params.studentId,

    totalEvents: relevantEvents.length,
    activeEvents: activeEvents.length,

    totalPoints,
    totalXp,

    badgeAwardedCount,
    badgeRevokedCount,
    netBadgeCount: badgeAwardedCount - badgeRevokedCount,

    levelUpEventCount,
    streakEventCount,

    latestEventAt,

    reasonCounts,
    eventTypeCounts,
    badgeCounts,
  };
}

function levelRuleIsReached(params: {
  rule: GamificationLevelRule;
  stats: StudentGamificationProgressStats;
}) {
  const { rule, stats } = params;

  if (stats.totalPoints < rule.minPoints) return false;
  if (stats.totalXp < rule.minXp) return false;
  if (stats.netBadgeCount < rule.minBadges) return false;

  return true;
}

function calculateLevelProgressPercentage(params: {
  nextRule: GamificationLevelRule | null;
  stats: StudentGamificationProgressStats;
}) {
  const { nextRule, stats } = params;

  if (!nextRule) return 100;

  const ratios: number[] = [];

  if (nextRule.minPoints > 0) {
    ratios.push(stats.totalPoints / nextRule.minPoints);
  }

  if (nextRule.minXp > 0) {
    ratios.push(stats.totalXp / nextRule.minXp);
  }

  if (nextRule.minBadges > 0) {
    ratios.push(stats.netBadgeCount / nextRule.minBadges);
  }

  if (ratios.length === 0) return 100;

  const minRatio = Math.min(...ratios);

  return Math.max(0, Math.min(100, Math.round(minRatio * 100)));
}

export function calculateStudentGamificationLevel(params: {
  studentId: string;
  events: StudentGamificationEvent[];
  levelRules: GamificationLevelRule[];
  context: StudentGamificationProgressContext;
}): StudentGamificationLevelResult {
  assertNonEmpty(params.studentId, "studentId");
  assertNonEmpty(params.context.orgId, "context.orgId");

  const stats = buildStudentGamificationProgressStats({
    studentId: params.studentId,
    events: params.events,
    context: params.context,
  });

  const rules = params.levelRules
    .filter((rule) => rule.status === "ACTIVE")
    .filter((rule) =>
      progressRuleMatchesContext({
        rule,
        context: params.context,
      }),
    )
    .slice()
    .sort((a, b) => a.levelNumber - b.levelNumber || a.order - b.order);

  const reachedRules = rules.filter((rule) =>
    levelRuleIsReached({
      rule,
      stats,
    }),
  );

  const currentRule =
    reachedRules.length > 0 ? reachedRules[reachedRules.length - 1] : null;

  const nextRule =
    rules.find((rule) => {
      if (currentRule && rule.levelNumber <= currentRule.levelNumber) {
        return false;
      }

      return !levelRuleIsReached({
        rule,
        stats,
      });
    }) ?? null;

  return {
    studentId: params.studentId,

    stats,

    currentLevel: currentRule
      ? {
          id: currentRule.id,
          key: currentRule.key,
          title: currentRule.title,
          description: currentRule.description ?? "",
          levelNumber: currentRule.levelNumber,

          emoji: currentRule.emoji ?? "",
          iconKey: currentRule.iconKey ?? "",
          imageUrl: currentRule.imageUrl ?? "",

          color: currentRule.color ?? "",
          backgroundColor: currentRule.backgroundColor ?? "",
        }
      : null,

    nextLevel: nextRule
      ? {
          id: nextRule.id,
          key: nextRule.key,
          title: nextRule.title,
          description: nextRule.description ?? "",
          levelNumber: nextRule.levelNumber,

          minPoints: nextRule.minPoints,
          minXp: nextRule.minXp,
          minBadges: nextRule.minBadges,

          emoji: nextRule.emoji ?? "",
          iconKey: nextRule.iconKey ?? "",
          imageUrl: nextRule.imageUrl ?? "",

          color: nextRule.color ?? "",
          backgroundColor: nextRule.backgroundColor ?? "",
        }
      : null,

    progressToNextLevelPercentage: calculateLevelProgressPercentage({
      nextRule,
      stats,
    }),

    remainingPointsToNextLevel: nextRule
      ? Math.max(0, nextRule.minPoints - stats.totalPoints)
      : 0,

    remainingXpToNextLevel: nextRule
      ? Math.max(0, nextRule.minXp - stats.totalXp)
      : 0,

    remainingBadgesToNextLevel: nextRule
      ? Math.max(0, nextRule.minBadges - stats.netBadgeCount)
      : 0,
  };
}

function getAchievementCurrentValue(params: {
  rule: GamificationAchievementRule;
  stats: StudentGamificationProgressStats;
  levelResult?: StudentGamificationLevelResult;
}) {
  const { rule, stats, levelResult } = params;

  switch (rule.triggerMetric) {
    case "TOTAL_POINTS":
      return stats.totalPoints;

    case "TOTAL_XP":
      return stats.totalXp;

    case "BADGE_COUNT":
      if (rule.triggerBadgeKey) {
        return stats.badgeCounts[rule.triggerBadgeKey] ?? 0;
      }

      return stats.netBadgeCount;

    case "REASON_COUNT":
      if (!rule.triggerReasonKey) return 0;
      return stats.reasonCounts[rule.triggerReasonKey] ?? 0;

    case "EVENT_TYPE_COUNT":
      if (!rule.triggerEventType) return 0;
      return stats.eventTypeCounts[rule.triggerEventType] ?? 0;

    case "LEVEL_REACHED":
      return levelResult?.currentLevel?.levelNumber ?? 0;

    case "CUSTOM":
    default:
      return 0;
  }
}

function achievementRuleMatchesRequiredSubject(params: {
  rule: GamificationAchievementRule;
  context: StudentGamificationProgressContext;
}) {
  const { rule, context } = params;

  if (
    rule.requiredSubjectKey &&
    rule.requiredSubjectKey !== context.subjectKey
  ) {
    return false;
  }

  if (
    rule.requiredClassSubjectOfferingId &&
    rule.requiredClassSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  return true;
}

export function resolveUnlockedGamificationAchievements(params: {
  studentId: string;
  events: StudentGamificationEvent[];
  achievementRules: GamificationAchievementRule[];
  levelRules?: GamificationLevelRule[];
  context: StudentGamificationProgressContext;
}): ResolveUnlockedGamificationAchievementsResult {
  assertNonEmpty(params.studentId, "studentId");
  assertNonEmpty(params.context.orgId, "context.orgId");

  const stats = buildStudentGamificationProgressStats({
    studentId: params.studentId,
    events: params.events,
    context: params.context,
  });

  const levelResult =
    params.levelRules && params.levelRules.length > 0
      ? calculateStudentGamificationLevel({
          studentId: params.studentId,
          events: params.events,
          levelRules: params.levelRules,
          context: params.context,
        })
      : undefined;

  const rules = params.achievementRules
    .filter((rule) => rule.status === "ACTIVE")
    .filter((rule) =>
      progressRuleMatchesContext({
        rule,
        context: params.context,
      }),
    )
    .filter((rule) =>
      achievementRuleMatchesRequiredSubject({
        rule,
        context: params.context,
      }),
    )
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ar"));

  const unlocked: UnlockedGamificationAchievement[] = [];
  const pending: PendingGamificationAchievement[] = [];

  for (const rule of rules) {
    const currentValue = getAchievementCurrentValue({
      rule,
      stats,
      levelResult,
    });

    const isUnlocked = currentValue >= rule.thresholdValue;

    if (isUnlocked) {
      unlocked.push({
        ruleId: rule.id,
        ruleKey: rule.key,
        title: rule.title,
        description: rule.description ?? "",

        kind: rule.kind,
        category: rule.category ?? "",
        categoryTitle: rule.categoryTitle ?? "",

        triggerMetric: rule.triggerMetric,
        thresholdValue: rule.thresholdValue,
        currentValue,

        rewardEventType: rule.rewardEventType,
        rewardBadgeId: rule.rewardBadgeId ?? "",
        rewardBadgeKey: rule.rewardBadgeKey ?? "",
        rewardBadgeTitle: rule.rewardBadgeTitle ?? "",
        rewardValue: rule.rewardValue,
        rewardValueKind: rule.rewardValueKind,
        defaultVisibility: rule.defaultVisibility,

        emoji: rule.emoji ?? "",
        iconKey: rule.iconKey ?? "",
        imageUrl: rule.imageUrl ?? "",

        color: rule.color ?? "",
        backgroundColor: rule.backgroundColor ?? "",
      });

      continue;
    }

    pending.push({
      ruleId: rule.id,
      ruleKey: rule.key,
      title: rule.title,
      description: rule.description ?? "",

      triggerMetric: rule.triggerMetric,
      thresholdValue: rule.thresholdValue,
      currentValue,

      progressPercentage:
        rule.thresholdValue > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round((currentValue / rule.thresholdValue) * 100),
              ),
            )
          : 0,
    });
  }

  return {
    studentId: params.studentId,
    stats,
    unlocked,
    pending,
  };
}

export type BuildUnlockedAchievementRewardEventsInput = {
  student: StudentGamificationTarget;

  context: StudentGamificationContext;

  actor: StudentGamificationActor;

  /**
   * كل أحداث الطالب الحالية + الأحداث الجديدة التي تم إنشاؤها للتو.
   * مهم أن تمرر الأحداث بعد إضافة التحفيز اليدوي حتى يتم حساب الإنجاز بناءً عليها.
   */
  events: StudentGamificationEvent[];

  achievementRules: GamificationAchievementRule[];
  levelRules?: GamificationLevelRule[];

  /**
   * وقت موحد لإنشاء أحداث المكافآت.
   */
  occurredAt?: number;

  /**
   * مسار اختياري للمصدر، لو أردنا لاحقًا ربطه بمكان القاعدة.
   */
  sourcePathPrefix?: string;
};

function isAchievementRewardEventForRule(params: {
  event: StudentGamificationEvent;
  studentId: string;
  rule: GamificationAchievementRule;
}) {
  const { event, studentId, rule } = params;

  if (event.studentId !== studentId) return false;
  if (event.status !== "ACTIVE") return false;

  if (event.sourceType !== "CUSTOM") return false;
  if (event.sourceId !== rule.id) return false;

  return (
    event.reasonKey === `achievement-unlocked:${rule.key}` ||
    event.category === "ACHIEVEMENT_REWARD"
  );
}

function countExistingAchievementRewardEvents(params: {
  events: StudentGamificationEvent[];
  studentId: string;
  rule: GamificationAchievementRule;
}) {
  return params.events.filter((event) =>
    isAchievementRewardEventForRule({
      event,
      studentId: params.studentId,
      rule: params.rule,
    }),
  ).length;
}

function canCreateAchievementRewardEvent(params: {
  events: StudentGamificationEvent[];
  studentId: string;
  rule: GamificationAchievementRule;
}) {
  const existingCount = countExistingAchievementRewardEvents({
    events: params.events,
    studentId: params.studentId,
    rule: params.rule,
  });

  if (!params.rule.isRepeatable) {
    return existingCount === 0;
  }

  if (params.rule.repeatLimit > 0) {
    return existingCount < params.rule.repeatLimit;
  }

  return true;
}

export function buildUnlockedAchievementRewardEvents(
  input: BuildUnlockedAchievementRewardEventsInput,
): StudentGamificationEvent[] {
  assertNonEmpty(input.student.studentId, "student.studentId");
  assertNonEmpty(input.context.orgId, "context.orgId");
  assertNonEmpty(input.context.schoolId, "context.schoolId");
  assertNonEmpty(input.context.academicYearId, "context.academicYearId");
  assertNonEmpty(input.actor.createdByPersonId, "actor.createdByPersonId");

  const occurredAt = input.occurredAt ?? Date.now();

  const progressContext: StudentGamificationProgressContext = {
    orgId: input.context.orgId,
    schoolId: input.context.schoolId,
    academicYearId: input.context.academicYearId,

    termId: input.context.termId,
    gradeId: input.student.gradeId ?? input.context.gradeId,
    streamId: input.student.streamId ?? input.context.streamId,
    classId: input.student.classId ?? input.context.classId,

    subjectKey: input.context.subjectKey,
    classSubjectOfferingId: input.context.classSubjectOfferingId,
  };

  const achievementsResult = resolveUnlockedGamificationAchievements({
    studentId: input.student.studentId,
    events: input.events,
    achievementRules: input.achievementRules,
    levelRules: input.levelRules,
    context: progressContext,
  });

  const rewardEvents: StudentGamificationEvent[] = [];

  for (const achievement of achievementsResult.unlocked) {
    const rule = input.achievementRules.find(
      (item) => item.id === achievement.ruleId,
    );

    if (!rule) continue;

    const canCreateReward = canCreateAchievementRewardEvent({
      events: [...input.events, ...rewardEvents],
      studentId: input.student.studentId,
      rule,
    });

    if (!canCreateReward) continue;

    const rewardEvent = buildStudentGamificationEvent({
      context: input.context,
      student: input.student,
      actor: input.actor,

      eventType: achievement.rewardEventType,
      visibility: achievement.defaultVisibility,

      title: `فتح إنجاز: ${achievement.title}`,
      description: achievement.description,

      reasonKey: `achievement-unlocked:${achievement.ruleKey}`,
      reasonTitle: `فتح إنجاز: ${achievement.title}`,

      category: "ACHIEVEMENT_REWARD",
      categoryTitle: "مكافأة إنجاز",

      value: achievement.rewardValue,
      valueKind: achievement.rewardValueKind,

      badgeKey: achievement.rewardBadgeKey,
      badgeTitle: achievement.rewardBadgeTitle,

      groupEventTitle: "",

      occurredAt,

      sourceType: "CUSTOM",
      sourceId: achievement.ruleId,
      sourcePath: input.sourcePathPrefix
        ? `${input.sourcePathPrefix}/${achievement.ruleId}`
        : "",

      note: `تم إنشاء هذه المكافأة تلقائيًا بعد تحقق شرط الإنجاز: ${achievement.title}`,
    });

    rewardEvents.push(rewardEvent);
  }

  return rewardEvents;
}

export type GamificationVisibilityAudience =
  | "STAFF"
  | "STUDENT"
  | "GUARDIAN"
  | "CLASSROOM_DISPLAY"
  | "PUBLIC_LEADERBOARD";

export function isGamificationVisibleToAudience(params: {
  visibility?: string;
  audience: GamificationVisibilityAudience;
}) {
  const visibility = params.visibility || "STAFF_ONLY";

  if (visibility === "EVERYONE") return true;

  /**
   * الموظفون داخل web-staff يرون السجل التشغيلي كاملًا.
   * أما باقي الواجهات فتحتاج سياسة ظهور صريحة.
   */
  if (params.audience === "STAFF") return true;

  if (params.audience === "STUDENT") {
    return (
      visibility === "STUDENT_DISPLAY" ||
      visibility === "GUARDIAN_VISIBLE" ||
      visibility === "PUBLIC_LEADERBOARD"
    );
  }

  if (params.audience === "GUARDIAN") {
    return (
      visibility === "GUARDIAN_VISIBLE" || visibility === "PUBLIC_LEADERBOARD"
    );
  }

  if (params.audience === "CLASSROOM_DISPLAY") {
    return (
      visibility === "STUDENT_DISPLAY" || visibility === "PUBLIC_LEADERBOARD"
    );
  }

  if (params.audience === "PUBLIC_LEADERBOARD") {
    return visibility === "PUBLIC_LEADERBOARD";
  }

  return false;
}
