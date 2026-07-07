import { google, calendar_v3 } from "googleapis";

import {
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
} from "./config";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export type CreateGoogleMeetCalendarEventInput = {
  calendarOwnerEmail: string;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number;
  conferenceRequestId: string;
  timeZone?: string;
};

export type CreateGoogleMeetCalendarEventResult = {
  calendarId: string;
  eventId: string;
  htmlLink: string;
  organizerEmail: string;
  meetUrl: string;
  meetingCode: string;
  conferenceRequestId: string;
  ready: boolean;
};

function getPrivateKey() {
  return GOOGLE_PRIVATE_KEY.value().replace(/\\n/g, "\n");
}

function getMeetUrl(event: calendar_v3.Schema$Event) {
  const videoEntryPoint = event.conferenceData?.entryPoints?.find(
    (entryPoint) => entryPoint.entryPointType === "video" && entryPoint.uri,
  );

  return videoEntryPoint?.uri ?? event.hangoutLink ?? "";
}

export async function createGoogleMeetCalendarEvent(
  input: CreateGoogleMeetCalendarEventInput,
): Promise<CreateGoogleMeetCalendarEventResult> {
  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL.value(),
    key: getPrivateKey(),
    scopes: CALENDAR_SCOPES,
    subject: input.calendarOwnerEmail,
  });

  const calendar = google.calendar({
    version: "v3",
    auth,
  });

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "none",
    requestBody: {
      summary: input.title,
      description: input.description || "حصة افتراضية عبر منصة الشؤون التعليمية",
      start: {
        dateTime: new Date(input.startsAt).toISOString(),
        timeZone: input.timeZone ?? "Asia/Riyadh",
      },
      end: {
        dateTime: new Date(input.endsAt).toISOString(),
        timeZone: input.timeZone ?? "Asia/Riyadh",
      },
      conferenceData: {
        createRequest: {
          requestId: input.conferenceRequestId,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    },
  });

  const event = response.data;
  const meetUrl = getMeetUrl(event);

  return {
    calendarId: "primary",
    eventId: event.id ?? "",
    htmlLink: event.htmlLink ?? "",
    organizerEmail: event.organizer?.email ?? "",
    meetUrl,
    meetingCode: event.conferenceData?.conferenceId ?? "",
    conferenceRequestId: input.conferenceRequestId,
    ready: !!meetUrl,
  };
}