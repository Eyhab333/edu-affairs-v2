import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
} from "../google-workspace/config";
import {
  GoogleMeetAttendanceRow,
  importGoogleMeetAttendanceFromProvider,
} from "../google-workspace/meet";

type ImportGoogleMeetAttendanceInput = {
  orgId: string;
  sessionId: string;
};

type ParticipantCandidate = {
  id: string;
  refPath: string;
  studentId: string;
  studentName: string;
  joinClickedAt: number;
  guardianNames: string[];
  guardianEmails: string[];
};

type MatchResult = {
  participantId: string;
  rowId: string;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  reason: string;
};

function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `Missing ${fieldName}.`);
  }

  return value.trim();
}

function getString(data: FirebaseFirestore.DocumentData, keys: string[]) {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getNumber(data: FirebaseFirestore.DocumentData, key: string) {
  const value = data[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function normalizeArabicName(value: string) {
  return value
    .toLowerCase()
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(value: string) {
  return normalizeArabicName(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function nameScore(source: string, target: string) {
  const sourceText = normalizeArabicName(source);
  const targetText = normalizeArabicName(target);

  if (!sourceText || !targetText) return 0;

  if (sourceText === targetText) return 35;
  if (sourceText.includes(targetText) || targetText.includes(sourceText)) {
    return 28;
  }

  const sourceTokens = tokenizeName(sourceText);
  const targetTokens = tokenizeName(targetText);

  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0;

  const targetSet = new Set(targetTokens);
  const overlap = sourceTokens.filter((token) => targetSet.has(token)).length;

  if (overlap >= 3) return 25;
  if (overlap === 2) return 18;
  if (overlap === 1) return 8;

  return 0;
}

function scoreCandidate(row: GoogleMeetAttendanceRow, candidate: ParticipantCandidate) {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.joinClickedAt && row.firstJoinAt) {
    const diffMinutes = Math.abs(row.firstJoinAt - candidate.joinClickedAt) / 60_000;

    if (diffMinutes <= 10) {
      score += 70;
      reasons.push(`ضغط ولي الأمر دخول قبل/بعد دخول Google بنحو ${Math.round(diffMinutes)} دقيقة`);
    } else if (diffMinutes <= 20) {
      score += 45;
      reasons.push(`وقت ضغط الدخول قريب من وقت دخول Google (${Math.round(diffMinutes)} دقيقة)`);
    } else if (diffMinutes <= 45) {
      score += 25;
      reasons.push(`يوجد ضغط دخول قريب نسبيًا من دخول Google (${Math.round(diffMinutes)} دقيقة)`);
    }
  }

  const googleName = row.providerParticipantName || "";

  const studentNamePoints = nameScore(googleName, candidate.studentName);
  if (studentNamePoints > 0) {
    score += studentNamePoints;
    reasons.push("الاسم الظاهر في Google قريب من اسم الطالب");
  }

  const guardianNamePoints = Math.max(
    ...candidate.guardianNames.map((name) => nameScore(googleName, name)),
    0,
  );

  if (guardianNamePoints > 0) {
    score += guardianNamePoints;
    reasons.push("الاسم الظاهر في Google قريب من اسم ولي الأمر");
  }

  if (row.durationMinutes >= 20) {
    score += 5;
    reasons.push("مدة الحضور في Google معتبرة");
  }

  let confidence: MatchResult["confidence"] = "NONE";

  if (score >= 75) confidence = "HIGH";
  else if (score >= 45) confidence = "MEDIUM";
  else if (score >= 25) confidence = "LOW";

  return {
    score,
    confidence,
    reason: reasons.join("، "),
  };
}

function buildMatches(
  rows: GoogleMeetAttendanceRow[],
  candidates: ParticipantCandidate[],
): MatchResult[] {
  const proposals: MatchResult[] = [];

  for (const candidate of candidates) {
    for (const row of rows) {
      const result = scoreCandidate(row, candidate);

      if (result.confidence === "NONE") continue;

      proposals.push({
        participantId: candidate.id,
        rowId: row.providerParticipantId,
        score: result.score,
        confidence: result.confidence,
        reason: result.reason,
      });
    }
  }

  proposals.sort((a, b) => b.score - a.score);

  const usedParticipants = new Set<string>();
  const usedRows = new Set<string>();
  const matches: MatchResult[] = [];

  for (const proposal of proposals) {
    if (usedParticipants.has(proposal.participantId)) continue;
    if (usedRows.has(proposal.rowId)) continue;

    usedParticipants.add(proposal.participantId);
    usedRows.add(proposal.rowId);
    matches.push(proposal);
  }

  return matches;
}

export const importGoogleMeetAttendance = onCall(
  {
    region: "me-central2",
    cors: true,
    timeoutSeconds: 120,
    secrets: [GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as Partial<ImportGoogleMeetAttendanceInput>;

    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const sessionId = requireNonEmptyString(input.sessionId, "sessionId");

    const db = getFirestore();
    const now = Date.now();

    const sessionRef = db.doc(`orgs/${orgId}/virtualClassSessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Virtual class session not found.");
    }

    const session = sessionSnap.data() ?? {};

    const calendarOwnerEmail = getString(session, ["providerCalendarOwnerEmail"]);
    const meetingCode = getString(session, ["providerMeetingCode"]);
    const startsAt = getNumber(session, "startsAt");
    const endsAt = getNumber(session, "endsAt");

    if (!calendarOwnerEmail) {
      throw new HttpsError("failed-precondition", "Missing providerCalendarOwnerEmail.");
    }

    if (!meetingCode) {
      throw new HttpsError("failed-precondition", "Missing providerMeetingCode.");
    }

    if (!startsAt || !endsAt) {
      throw new HttpsError("failed-precondition", "Missing session startsAt/endsAt.");
    }

    try {
      await sessionRef.update({
        attendanceImportStatus: "IN_PROGRESS",
        attendanceImportStartedAt: now,
        attendanceImportErrorMessage: "",
        updatedAt: now,
      });

      const providerResult = await importGoogleMeetAttendanceFromProvider({
        calendarOwnerEmail,
        meetingCode,
        startsAt,
        endsAt,
      });

      const participantsSnap = await db
        .collection(`orgs/${orgId}/virtualClassParticipants`)
        .where("sessionId", "==", sessionId)
        .get();

      const studentIds = uniqueStrings(
        participantsSnap.docs.map((doc) => {
          const data = doc.data();
          return getString(data, ["studentId"]);
        }),
      );

      const studentSnaps =
        studentIds.length > 0
          ? await db.getAll(
              ...studentIds.map((studentId) =>
                db.doc(`orgs/${orgId}/students/${studentId}`),
              ),
            )
          : [];

      const studentNameById = new Map<string, string>();

      studentSnaps.forEach((snap) => {
        if (!snap.exists) return;

        const data = snap.data() ?? {};
        const name =
          getString(data, [
            "displayName",
            "fullName",
            "studentName",
            "name",
            "arabicName",
          ]) || snap.id;

        studentNameById.set(snap.id, name);
      });

      const candidates: ParticipantCandidate[] = participantsSnap.docs.map((doc) => {
        const data = doc.data();
        const studentId = getString(data, ["studentId"]);
        const studentName =
          getString(data, ["studentDisplayName", "studentName"]) ||
          studentNameById.get(studentId) ||
          studentId;

        return {
          id: doc.id,
          refPath: doc.ref.path,
          studentId,
          studentName,
          joinClickedAt: getNumber(data, "joinClickedAt"),
          guardianNames: Array.isArray(data.guardianDisplayNames)
            ? data.guardianDisplayNames.filter((value) => typeof value === "string")
            : [],
          guardianEmails: Array.isArray(data.guardianEmails)
            ? data.guardianEmails.filter((value) => typeof value === "string")
            : [],
        };
      });

      const matches = buildMatches(providerResult.rows, candidates);
      const matchByParticipantId = new Map(matches.map((match) => [match.participantId, match]));
      const matchByRowId = new Map(matches.map((match) => [match.rowId, match]));

      const importRef = db
        .collection(`orgs/${orgId}/virtualClassAttendanceImports`)
        .doc();

      const batch = db.batch();

      batch.set(importRef, {
        id: importRef.id,
        orgId,
        sessionId,
        provider: "GOOGLE_MEET",
        status: "IMPORTED",
        conferenceRecordName: providerResult.conferenceRecordName,
        conferenceStartAt: providerResult.conferenceStartAt,
        conferenceEndAt: providerResult.conferenceEndAt,
        providerParticipantCount: providerResult.participantCount,
        matchedCount: matches.length,
        unmatchedCount: Math.max(providerResult.rows.length - matches.length, 0),
        importedByUid: request.auth.uid,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      for (const row of providerResult.rows) {
        const match = matchByRowId.get(row.providerParticipantId);
        const candidate = match
          ? candidates.find((item) => item.id === match.participantId)
          : undefined;

        const rowRef = importRef.collection("rows").doc();

        batch.set(rowRef, {
          id: rowRef.id,
          orgId,
          sessionId,
          importId: importRef.id,

          ...row,

          matchedStudentId: candidate?.studentId ?? "",
          matchedStudentName: candidate?.studentName ?? "",
          matchedParticipantId: candidate?.id ?? "",
          matchConfidence: match?.confidence ?? "NONE",
          matchReason: match?.reason ?? "",

          createdAt: now,
          updatedAt: now,
        });
      }

      for (const candidate of candidates) {
        const match = matchByParticipantId.get(candidate.id);
        const row = match
          ? providerResult.rows.find(
              (item) => item.providerParticipantId === match.rowId,
            )
          : undefined;

        const participantRef = db.doc(candidate.refPath);

        if (!match || !row) {
          batch.update(participantRef, {
            studentDisplayName: candidate.studentName,
            providerAttendanceStatus: "ABSENT",
            providerMatchConfidence: "NONE",
            providerMatchReason: "",
            providerImportedAt: now,
            providerAttendanceImportId: importRef.id,
            updatedAt: now,
          });

          continue;
        }

        batch.update(participantRef, {
          studentDisplayName: candidate.studentName,

          providerAttendanceStatus:
            row.durationMinutes > 0 ? "ATTENDED" : "UNKNOWN",

          providerParticipantId: row.providerParticipantId,
          providerParticipantName: row.providerParticipantName,
          providerParticipantKind: row.providerParticipantKind,
          providerUserResourceName: row.providerUserResourceName,

          providerParticipantEmail: row.providerParticipantEmail,
          providerParticipantEmailSource: row.providerParticipantEmailSource,

          providerFirstJoinAt: row.firstJoinAt,
          providerLastLeaveAt: row.lastLeaveAt,
          providerDurationMinutes: row.durationMinutes,
          providerSessionCount: row.sessionCount,

          providerMatchConfidence: match.confidence,
          providerMatchReason: match.reason,

          providerImportedAt: now,
          providerAttendanceImportId: importRef.id,

          updatedAt: now,
        });
      }

      batch.update(sessionRef, {
        attendanceImportStatus: "IMPORTED",
        attendanceImportedAt: now,
        attendanceImportErrorMessage: "",
        providerConferenceRecordName: providerResult.conferenceRecordName,
        providerAttendanceParticipantCount: providerResult.participantCount,
        providerAttendanceMatchedCount: matches.length,
        providerAttendanceUnmatchedCount: Math.max(
          providerResult.rows.length - matches.length,
          0,
        ),
        updatedAt: now,
      });

      await batch.commit();

      return {
        ok: true,
        importId: importRef.id,
        conferenceRecordName: providerResult.conferenceRecordName,
        participantCount: providerResult.participantCount,
        matchedCount: matches.length,
        unmatchedCount: Math.max(providerResult.rows.length - matches.length, 0),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await sessionRef.update({
        attendanceImportStatus: "FAILED",
        attendanceImportErrorMessage: message,
        attendanceImportFailedAt: Date.now(),
        updatedAt: Date.now(),
      });

      throw new HttpsError("internal", message);
    }
  },
);