import { google } from "googleapis";

import {
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
} from "./config";

const MEET_SCOPES = ["https://www.googleapis.com/auth/meetings.space.readonly"];

type ConferenceRecord = {
  name: string;
  startTime?: string;
  endTime?: string;
  expireTime?: string;
  space?: string;
};

type MeetParticipant = {
  name: string;
  earliestStartTime?: string;
  latestEndTime?: string;
  signedinUser?: {
    user?: string;
    displayName?: string;
  };
  anonymousUser?: {
    displayName?: string;
  };
  phoneUser?: {
    displayName?: string;
  };
};

type MeetParticipantSession = {
  name: string;
  startTime?: string;
  endTime?: string;
};

type ListConferenceRecordsResponse = {
  conferenceRecords?: ConferenceRecord[];
  nextPageToken?: string;
};

type ListParticipantsResponse = {
  participants?: MeetParticipant[];
  nextPageToken?: string;
};

type ListParticipantSessionsResponse = {
  participantSessions?: MeetParticipantSession[];
  nextPageToken?: string;
};

export type GoogleMeetParticipantEmailSource =
  | "APP_AUTH"
  | "CALENDAR_ATTENDEE"
  | "ADMIN_REPORTS"
  | "MEET_API"
  | "UNKNOWN";

export type GoogleMeetAttendanceMatchConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NONE";

export type GoogleMeetAttendanceSession = {
  sessionName: string;
  joinAt: number;
  leaveAt: number;
  durationMinutes: number;
};

export type GoogleMeetAttendanceRow = {
  providerParticipantId: string;
  providerParticipantName: string;
  providerParticipantKind: "SIGNED_IN" | "ANONYMOUS" | "PHONE" | "UNKNOWN";
  providerUserResourceName: string;

  providerParticipantEmail: string;
  providerParticipantEmailSource: GoogleMeetParticipantEmailSource;

  firstJoinAt: number;
  lastLeaveAt: number;
  durationMinutes: number;
  sessionCount: number;

  sessions: GoogleMeetAttendanceSession[];

  matchedStudentId: string;
  matchedStudentName: string;
  matchedParticipantId: string;
  matchConfidence: GoogleMeetAttendanceMatchConfidence;
  matchReason: string;
};

export type ImportGoogleMeetAttendanceResult = {
  conferenceRecordName: string;
  conferenceStartAt: number;
  conferenceEndAt: number;
  participantCount: number;
  rows: GoogleMeetAttendanceRow[];
};

function getPrivateKey() {
  return GOOGLE_PRIVATE_KEY.value().replace(/\\n/g, "\n");
}

async function getMeetAccessToken(calendarOwnerEmail: string) {
  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL.value(),
    key: getPrivateKey(),
    scopes: MEET_SCOPES,
    subject: calendarOwnerEmail,
  });

  const tokenResponse = await auth.getAccessToken();
  const token =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

  if (!token) {
    throw new Error("Failed to obtain Google Meet API access token.");
  }

  return token;
}

async function meetGet<T>(
  path: string,
  accessToken: string,
  queryParams: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(
    `https://meet.googleapis.com/v2/${path.replace(/^\/+/, "")}`,
  );

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === undefined) return;
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  const body = responseText ? JSON.parse(responseText) : {};

  if (!response.ok) {
    throw new Error(
      `Google Meet API failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

function timestampToMs(value?: string) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getParticipantDisplayName(participant: MeetParticipant) {
  return (
    participant.signedinUser?.displayName ||
    participant.anonymousUser?.displayName ||
    participant.phoneUser?.displayName ||
    ""
  );
}

function getParticipantKind(
  participant: MeetParticipant,
): GoogleMeetAttendanceRow["providerParticipantKind"] {
  if (participant.signedinUser) return "SIGNED_IN";
  if (participant.anonymousUser) return "ANONYMOUS";
  if (participant.phoneUser) return "PHONE";
  return "UNKNOWN";
}

function calculateDurationMinutes(startAt: number, endAt: number) {
  if (!startAt || !endAt || endAt <= startAt) return 0;

  return Math.round(((endAt - startAt) / 60_000) * 100) / 100;
}

async function listConferenceRecords(params: {
  accessToken: string;
  meetingCode: string;
  startsAt: number;
  endsAt: number;
}) {
  const records: ConferenceRecord[] = [];

  const windowStart = new Date(
    params.startsAt - 6 * 60 * 60 * 1000,
  ).toISOString();

  const windowEnd = new Date(
    params.endsAt + 24 * 60 * 60 * 1000,
  ).toISOString();

  const filter = [
    `space.meeting_code = "${params.meetingCode}"`,
    `start_time >= "${windowStart}"`,
    `start_time <= "${windowEnd}"`,
  ].join(" AND ");

  let pageToken = "";

  do {
    const response = await meetGet<ListConferenceRecordsResponse>(
      "conferenceRecords",
      params.accessToken,
      {
        pageSize: 100,
        pageToken: pageToken || undefined,
        filter,
      },
    );

    records.push(...(response.conferenceRecords ?? []));
    pageToken = response.nextPageToken ?? "";
  } while (pageToken);

  return records;
}

function pickBestConferenceRecord(
  records: ConferenceRecord[],
  sessionStartsAt: number,
) {
  if (records.length === 0) return null;

  return [...records].sort((a, b) => {
    const aDistance = Math.abs(timestampToMs(a.startTime) - sessionStartsAt);
    const bDistance = Math.abs(timestampToMs(b.startTime) - sessionStartsAt);

    return aDistance - bDistance;
  })[0];
}

async function listParticipants(params: {
  accessToken: string;
  conferenceRecordName: string;
}) {
  const participants: MeetParticipant[] = [];
  let pageToken = "";

  do {
    const response = await meetGet<ListParticipantsResponse>(
      `${params.conferenceRecordName}/participants`,
      params.accessToken,
      {
        pageSize: 250,
        pageToken: pageToken || undefined,
      },
    );

    participants.push(...(response.participants ?? []));
    pageToken = response.nextPageToken ?? "";
  } while (pageToken);

  return participants;
}

async function listParticipantSessions(params: {
  accessToken: string;
  participantName: string;
}) {
  const sessions: MeetParticipantSession[] = [];
  let pageToken = "";

  do {
    const response = await meetGet<ListParticipantSessionsResponse>(
      `${params.participantName}/participantSessions`,
      params.accessToken,
      {
        pageSize: 250,
        pageToken: pageToken || undefined,
      },
    );

    sessions.push(...(response.participantSessions ?? []));
    pageToken = response.nextPageToken ?? "";
  } while (pageToken);

  return sessions;
}

export async function importGoogleMeetAttendanceFromProvider(params: {
  calendarOwnerEmail: string;
  meetingCode: string;
  startsAt: number;
  endsAt: number;
}): Promise<ImportGoogleMeetAttendanceResult> {
  if (!params.calendarOwnerEmail) {
    throw new Error("Missing calendarOwnerEmail.");
  }

  if (!params.meetingCode) {
    throw new Error("Missing Google Meet meeting code.");
  }

  const accessToken = await getMeetAccessToken(params.calendarOwnerEmail);

  const records = await listConferenceRecords({
    accessToken,
    meetingCode: params.meetingCode,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
  });

  const conferenceRecord = pickBestConferenceRecord(records, params.startsAt);

  if (!conferenceRecord?.name) {
    return {
      conferenceRecordName: "",
      conferenceStartAt: 0,
      conferenceEndAt: 0,
      participantCount: 0,
      rows: [],
    };
  }

  const participants = await listParticipants({
    accessToken,
    conferenceRecordName: conferenceRecord.name,
  });

  const rows: GoogleMeetAttendanceRow[] = [];

  for (const participant of participants) {
    const sessions = await listParticipantSessions({
      accessToken,
      participantName: participant.name,
    });

    const normalizedSessions = sessions
      .map((session) => {
        const joinAt = timestampToMs(session.startTime);
        const leaveAt = timestampToMs(session.endTime);

        return {
          sessionName: session.name,
          joinAt,
          leaveAt,
          durationMinutes: calculateDurationMinutes(joinAt, leaveAt),
        };
      })
      .filter((session) => session.joinAt > 0);

    const durationMinutes =
      Math.round(
        normalizedSessions.reduce(
          (total, session) => total + session.durationMinutes,
          0,
        ) * 100,
      ) / 100;

    rows.push({
      providerParticipantId: participant.name,
      providerParticipantName: getParticipantDisplayName(participant),
      providerParticipantKind: getParticipantKind(participant),
      providerUserResourceName: participant.signedinUser?.user ?? "",

      providerParticipantEmail: "",
      providerParticipantEmailSource: "UNKNOWN",

      firstJoinAt: timestampToMs(participant.earliestStartTime),
      lastLeaveAt: timestampToMs(participant.latestEndTime),
      durationMinutes,
      sessionCount: normalizedSessions.length,

      sessions: normalizedSessions,

      matchedStudentId: "",
      matchedStudentName: "",
      matchedParticipantId: "",
      matchConfidence: "NONE",
      matchReason: "",
    });
  }

  return {
    conferenceRecordName: conferenceRecord.name,
    conferenceStartAt: timestampToMs(conferenceRecord.startTime),
    conferenceEndAt: timestampToMs(conferenceRecord.endTime),
    participantCount: rows.length,
    rows,
  };
}