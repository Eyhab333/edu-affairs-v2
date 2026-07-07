import { defineSecret, defineString } from "firebase-functions/params";

export const GOOGLE_SERVICE_ACCOUNT_EMAIL = defineSecret(
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
);

export const GOOGLE_PRIVATE_KEY = defineSecret("GOOGLE_PRIVATE_KEY");

export const GOOGLE_WORKSPACE_DOMAIN = defineString(
  "GOOGLE_WORKSPACE_DOMAIN",
  {
    default: "qz.org.sa",
  },
);

export const GOOGLE_FALLBACK_CALENDAR_EMAIL = defineString(
  "GOOGLE_FALLBACK_CALENDAR_EMAIL",
  {
    default: "virtual-classes@qz.org.sa",
  },
);

export type GoogleMeetCalendarOwnerDecision = {
  mode: "TEACHER_CALENDAR" | "FALLBACK_ORG_CALENDAR";
  calendarOwnerEmail: string;
  fallbackReason: string;
};

export function resolveGoogleMeetCalendarOwner(input: {
  teacherEmail?: string | null;
}): GoogleMeetCalendarOwnerDecision {
  const workspaceDomain = GOOGLE_WORKSPACE_DOMAIN.value()
    .trim()
    .toLowerCase();

  const fallbackCalendarEmail = GOOGLE_FALLBACK_CALENDAR_EMAIL.value()
    .trim()
    .toLowerCase();

  const teacherEmail = (input.teacherEmail ?? "").trim().toLowerCase();

  if (!teacherEmail) {
    return {
      mode: "FALLBACK_ORG_CALENDAR",
      calendarOwnerEmail: fallbackCalendarEmail,
      fallbackReason: "TEACHER_EMAIL_MISSING",
    };
  }

  if (!teacherEmail.endsWith(`@${workspaceDomain}`)) {
    return {
      mode: "FALLBACK_ORG_CALENDAR",
      calendarOwnerEmail: fallbackCalendarEmail,
      fallbackReason: "TEACHER_EMAIL_OUTSIDE_DOMAIN",
    };
  }

  return {
    mode: "TEACHER_CALENDAR",
    calendarOwnerEmail: teacherEmail,
    fallbackReason: "",
  };
}