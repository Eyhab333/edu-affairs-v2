import type {
  SchoolActivity,
  SchoolActivityRegistration,
  SchoolActivityRegistrationStatus,
} from "@takween/contracts";

export type ActivityStudentContext = {
  studentId: string;
  schoolId: string;
  academicYearId: string;
  termId?: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
};

export type ActivitySeats = {
  capacity?: number;
  confirmedCount: number;
  waitlistedCount: number;
  availableSeats?: number;
  isFull: boolean;
};

export type ActivityRegistrationBlockReason =
  | "ACTIVITY_NOT_PARENT_VISIBLE"
  | "ACTIVITY_NOT_REGISTERABLE"
  | "ACTIVITY_CANCELLED_OR_ARCHIVED"
  | "STUDENT_NOT_TARGETED"
  | "REGISTRATION_NOT_OPEN"
  | "ALREADY_REGISTERED"
  | "ACTIVITY_FULL"
  | "GUARDIAN_CONSENT_REQUIRED";

export type ActivityRegistrationDecision = {
  allowed: boolean;
  reason?: ActivityRegistrationBlockReason;
  nextStatus?: SchoolActivityRegistrationStatus;
  seats: ActivitySeats;
};

const parentVisibleStatuses = new Set<SchoolActivity["status"]>([
  "PUBLISHED",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
]);

const cancelledOrArchivedStatuses = new Set<SchoolActivity["status"]>([
  "CANCELLED",
  "ARCHIVED",
]);

const activeRegistrationStatuses = new Set<SchoolActivityRegistrationStatus>([
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "ATTENDED",
  "ABSENT",
  "COMPLETED",
]);

function includesOrAll(values: string[], value?: string) {
  if (!values.length) return true;
  if (!value) return false;
  return values.includes(value);
}

export function calculateActivitySeats(
  activity: Pick<
    SchoolActivity,
    "capacity" | "confirmedCount" | "waitlistedCount"
  >,
): ActivitySeats {
  const confirmedCount = activity.confirmedCount ?? 0;
  const waitlistedCount = activity.waitlistedCount ?? 0;

  if (typeof activity.capacity !== "number") {
    return {
      capacity: undefined,
      confirmedCount,
      waitlistedCount,
      availableSeats: undefined,
      isFull: false,
    };
  }

  const availableSeats = Math.max(activity.capacity - confirmedCount, 0);

  return {
    capacity: activity.capacity,
    confirmedCount,
    waitlistedCount,
    availableSeats,
    isFull: availableSeats <= 0,
  };
}

export function isActivityParentVisible(activity: SchoolActivity): boolean {
  if (activity.visibility !== "PARENT_VISIBLE") return false;
  if (cancelledOrArchivedStatuses.has(activity.status)) return false;

  return parentVisibleStatuses.has(activity.status);
}

export function isStudentTargetedByActivity(
  activity: Pick<
    SchoolActivity,
    "schoolId" | "academicYearId" | "targetAudience"
  >,
  student: ActivityStudentContext,
): boolean {
  if (activity.schoolId !== student.schoolId) return false;
  if (activity.academicYearId !== student.academicYearId) return false;

  const audience = activity.targetAudience;

  if (!includesOrAll(audience.schoolIds, student.schoolId)) return false;
  if (!includesOrAll(audience.gradeIds, student.gradeId)) return false;
  if (!includesOrAll(audience.streamIds, student.streamId)) return false;
  if (!includesOrAll(audience.classIds, student.classId)) return false;
  if (!includesOrAll(audience.studentIds, student.studentId)) return false;

  return true;
}

export function isActivityRegistrationWindowOpen(
  activity: Pick<
    SchoolActivity,
    "status" | "registrationOpensAt" | "registrationClosesAt"
  >,
  nowMs: number,
): boolean {
  if (activity.status !== "REGISTRATION_OPEN") return false;

  if (
    typeof activity.registrationOpensAt === "number" &&
    nowMs < activity.registrationOpensAt
  ) {
    return false;
  }

  if (
    typeof activity.registrationClosesAt === "number" &&
    nowMs > activity.registrationClosesAt
  ) {
    return false;
  }

  return true;
}

export function hasActiveActivityRegistration(
  registrations: SchoolActivityRegistration[],
  activityId: string,
  studentId: string,
): boolean {
  return registrations.some((registration) => {
    return (
      registration.activityId === activityId &&
      registration.studentId === studentId &&
      activeRegistrationStatuses.has(registration.status)
    );
  });
}

export function resolveActivityRegistrationStatus(
  activity: Pick<SchoolActivity, "allowWaitlist" | "capacity" | "confirmedCount" | "waitlistedCount">,
): SchoolActivityRegistrationStatus {
  const seats = calculateActivitySeats(activity);

  if (!seats.isFull) {
    return "CONFIRMED";
  }

  if (activity.allowWaitlist) {
    return "WAITLISTED";
  }

  return "PENDING";
}

export function canRegisterStudentInActivity(params: {
  activity: SchoolActivity;
  student: ActivityStudentContext;
  existingRegistrations: SchoolActivityRegistration[];
  nowMs: number;
  consentAccepted?: boolean;
}): ActivityRegistrationDecision {
  const {
    activity,
    student,
    existingRegistrations,
    nowMs,
    consentAccepted = false,
  } = params;

  const seats = calculateActivitySeats(activity);

  if (!isActivityParentVisible(activity)) {
    return {
      allowed: false,
      reason: "ACTIVITY_NOT_PARENT_VISIBLE",
      seats,
    };
  }

  if (cancelledOrArchivedStatuses.has(activity.status)) {
    return {
      allowed: false,
      reason: "ACTIVITY_CANCELLED_OR_ARCHIVED",
      seats,
    };
  }

  if (activity.registrationMode !== "GUARDIAN_REGISTRATION") {
    return {
      allowed: false,
      reason: "ACTIVITY_NOT_REGISTERABLE",
      seats,
    };
  }

  if (!isStudentTargetedByActivity(activity, student)) {
    return {
      allowed: false,
      reason: "STUDENT_NOT_TARGETED",
      seats,
    };
  }

  if (!isActivityRegistrationWindowOpen(activity, nowMs)) {
    return {
      allowed: false,
      reason: "REGISTRATION_NOT_OPEN",
      seats,
    };
  }

  if (
    hasActiveActivityRegistration(
      existingRegistrations,
      activity.id,
      student.studentId,
    )
  ) {
    return {
      allowed: false,
      reason: "ALREADY_REGISTERED",
      seats,
    };
  }

  if (activity.requiresGuardianConsent && !consentAccepted) {
    return {
      allowed: false,
      reason: "GUARDIAN_CONSENT_REQUIRED",
      seats,
    };
  }

  if (seats.isFull && !activity.allowWaitlist) {
    return {
      allowed: false,
      reason: "ACTIVITY_FULL",
      seats,
    };
  }

  return {
    allowed: true,
    nextStatus: resolveActivityRegistrationStatus(activity),
    seats,
  };
}

export function filterActivitiesForStudent(params: {
  activities: SchoolActivity[];
  student: ActivityStudentContext;
}): SchoolActivity[] {
  const { activities, student } = params;

  return activities.filter((activity) => {
    return (
      isActivityParentVisible(activity) &&
      isStudentTargetedByActivity(activity, student)
    );
  });
}

export function buildActivityRegistrationCounts(
  registrations: SchoolActivityRegistration[],
): Pick<
  SchoolActivity,
  "registeredCount" | "confirmedCount" | "waitlistedCount" | "attendedCount"
> {
  return registrations.reduce(
    (counts, registration) => {
      if (activeRegistrationStatuses.has(registration.status)) {
        counts.registeredCount += 1;
      }

      if (registration.status === "CONFIRMED") {
        counts.confirmedCount += 1;
      }

      if (registration.status === "WAITLISTED") {
        counts.waitlistedCount += 1;
      }

      if (
        registration.status === "ATTENDED" ||
        registration.status === "COMPLETED"
      ) {
        counts.attendedCount += 1;
      }

      return counts;
    },
    {
      registeredCount: 0,
      confirmedCount: 0,
      waitlistedCount: 0,
      attendedCount: 0,
    },
  );
}