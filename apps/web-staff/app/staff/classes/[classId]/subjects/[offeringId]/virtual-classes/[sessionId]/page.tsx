"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Users,
  Video,
  XCircle,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";

import { db, functions } from "@/lib/firebase";
import { getOrgId } from "@/lib/org";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";

import { httpsCallable } from "firebase/functions";

type VirtualClassSessionRow = {
  id: string;

  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  classId?: string;
  gradeId?: string;
  streamId?: string;

  subjectKey?: string;
  subjectTitle?: string;
  classSubjectOfferingId?: string;

  title?: string;
  description?: string;

  provider?: string;
  joinUrl?: string;

  providerProvisioningStatus?: string;
  providerProvisioningErrorMessage?: string;
  providerCalendarOwnerEmail?: string;
  googleMeetProvisioningMode?: string;
  providerCalendarEventId?: string;
  providerMeetingCode?: string;
  attendanceImportStatus?: string;
  providerAttendanceParticipantCount?: number;
  providerAttendanceMatchedCount?: number;
  providerAttendanceUnmatchedCount?: number;
  startsAt?: number;
  endsAt?: number;

  status?: string;

  targetStudentIds?: string[];
  targetCount?: number;
  attendanceReviewedAt?: number;
  attendanceReviewedByPersonId?: string;
  createdAt?: number;
  updatedAt?: number;
};

type VirtualClassParticipantRow = {
  id: string;

  orgId?: string;
  sessionId?: string;

  studentId?: string;
  guardianIds?: string[];

  joinToken?: string;
  joinClickedAt?: number;
  joinClickedByGuardianId?: string;
  joinClickedDeviceId?: string;

  providerParticipantName?: string;
  providerParticipantEmail?: string;
  providerParticipantId?: string;

  providerJoinAt?: number;
  providerLeaveAt?: number;
  providerDurationMinutes?: number;

  platformJoinStatus?: string;
  providerAttendanceStatus?: string;
  finalAttendanceStatus?: string;

  reviewedByPersonId?: string;
  reviewedAt?: number;

  teacherNote?: string;
  studentDisplayName?: string;

  providerParticipantKind?: string;
  providerUserResourceName?: string;
  providerFirstJoinAt?: number;
  providerLastLeaveAt?: number;
  providerSessionCount?: number;
  providerMatchConfidence?: string;
  providerMatchReason?: string;
  createdAt?: number;
  updatedAt?: number;
};

type ImportGoogleMeetAttendanceResult = {
  ok: boolean;
  importId: string;
  conferenceRecordName: string;
  participantCount: number;
  matchedCount: number;
  unmatchedCount: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function readString(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function formatDateTime(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(value?: number) {
  if (typeof value !== "number") return "غير محدد";
  return `${value.toLocaleString("ar-SA")} دقيقة`;
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "SCHEDULED":
      return "مجدولة";
    case "LIVE":
      return "مباشرة";
    case "ENDED":
      return "منتهية";
    case "ATTENDANCE_IMPORTED":
      return "تم جلب الحضور";
    case "ATTENDANCE_REVIEWED":
      return "تم اعتماد الحضور";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status || "غير محدد";
  }
}

function getAttendanceStatusLabel(status?: string) {
  switch (status) {
    case "SCHEDULED":
      return "مجدول";
    case "JOIN_CLICKED":
      return "ضغط دخول";
    case "ATTENDED":
      return "حاضر";
    case "LATE":
      return "متأخر";
    case "LEFT_EARLY":
      return "خرج مبكرًا";
    case "ABSENT":
      return "غائب";
    case "EXCUSED":
      return "بعذر";
    case "UNKNOWN":
      return "غير معروف";
    default:
      return status || "غير معروف";
  }
}

function getProviderLabel(provider?: string) {
  switch (provider) {
    case "GOOGLE_MEET":
      return "Google Meet";
    case "ZOOM":
      return "Zoom";
    case "MICROSOFT_TEAMS":
      return "Microsoft Teams";
    case "EXTERNAL_LINK":
      return "رابط خارجي";
    default:
      return provider || "Google Meet";
  }
}

function getAttendanceIcon(status?: string) {
  switch (status) {
    case "ATTENDED":
      return CheckCircle2;
    case "ABSENT":
      return XCircle;
    case "JOIN_CLICKED":
    case "LATE":
    case "LEFT_EARLY":
      return Clock;
    default:
      return Users;
  }
}

function buildListHref(params: {
  classId: string;
  offeringId: string;
  searchParams: URLSearchParams;
}) {
  const queryString = params.searchParams.toString();

  return `/staff/classes/${encodeURIComponent(
    params.classId,
  )}/subjects/${encodeURIComponent(
    params.offeringId,
  )}/virtual-classes${queryString ? `?${queryString}` : ""}`;
}

function mapSessionDoc(id: string, data: DocumentData): VirtualClassSessionRow {
  return {
    id,

    orgId: data.orgId,
    schoolId: data.schoolId,
    academicYearId: data.academicYearId,
    termId: data.termId,
    termTitle: data.termTitle,
    termShortTitle: data.termShortTitle,

    classId: data.classId,
    gradeId: data.gradeId,
    streamId: data.streamId,

    subjectKey: data.subjectKey,
    subjectTitle: data.subjectTitle,
    classSubjectOfferingId: data.classSubjectOfferingId,

    title: data.title,
    description: data.description,

    provider: data.provider,
    joinUrl: data.joinUrl,

    providerProvisioningStatus: data.providerProvisioningStatus,
    providerProvisioningErrorMessage: data.providerProvisioningErrorMessage,
    providerCalendarOwnerEmail: data.providerCalendarOwnerEmail,
    googleMeetProvisioningMode: data.googleMeetProvisioningMode,
    providerCalendarEventId: data.providerCalendarEventId,
    providerMeetingCode: data.providerMeetingCode,
    attendanceImportStatus: data.attendanceImportStatus,
    providerAttendanceParticipantCount: data.providerAttendanceParticipantCount,
    providerAttendanceMatchedCount: data.providerAttendanceMatchedCount,
    providerAttendanceUnmatchedCount: data.providerAttendanceUnmatchedCount,
    startsAt: data.startsAt,
    endsAt: data.endsAt,

    status: data.status,

    targetStudentIds: data.targetStudentIds,
    targetCount: data.targetCount,
    attendanceReviewedAt: data.attendanceReviewedAt,
    attendanceReviewedByPersonId: data.attendanceReviewedByPersonId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function mapParticipantDoc(
  id: string,
  data: DocumentData,
): VirtualClassParticipantRow {
  return {
    id,

    orgId: data.orgId,
    sessionId: data.sessionId,

    studentId: data.studentId,
    guardianIds: data.guardianIds,

    joinToken: data.joinToken,
    joinClickedAt: data.joinClickedAt,
    joinClickedByGuardianId: data.joinClickedByGuardianId,
    joinClickedDeviceId: data.joinClickedDeviceId,

    providerParticipantName: data.providerParticipantName,
    providerParticipantEmail: data.providerParticipantEmail,
    providerParticipantId: data.providerParticipantId,

    providerJoinAt: data.providerJoinAt,
    providerLeaveAt: data.providerLeaveAt,
    providerDurationMinutes: data.providerDurationMinutes,

    platformJoinStatus: data.platformJoinStatus,
    providerAttendanceStatus: data.providerAttendanceStatus,
    finalAttendanceStatus: data.finalAttendanceStatus,

    reviewedByPersonId: data.reviewedByPersonId,
    reviewedAt: data.reviewedAt,

    teacherNote: data.teacherNote,
    studentDisplayName: data.studentDisplayName,

    providerParticipantKind: data.providerParticipantKind,
    providerUserResourceName: data.providerUserResourceName,
    providerFirstJoinAt: data.providerFirstJoinAt,
    providerLastLeaveAt: data.providerLastLeaveAt,
    providerSessionCount: data.providerSessionCount,
    providerMatchConfidence: data.providerMatchConfidence,
    providerMatchReason: data.providerMatchReason,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function getProvisioningStatusLabel(status?: string) {
  switch (status) {
    case "NOT_REQUESTED":
      return "لم يبدأ إنشاء الرابط";
    case "PENDING":
      return "جاري تجهيز الرابط";
    case "READY":
      return "الرابط جاهز";
    case "FAILED":
      return "فشل إنشاء الرابط";
    default:
      return status || "غير محدد";
  }
}

export default function SubjectVirtualClassDetailsPage() {
  const params = useParams<{
    classId: string;
    offeringId: string;
    sessionId: string;
  }>();

  const searchParams = useSearchParams();
  const { user, checkingAuth } = useRequireAuth();

  const classId = params.classId;
  const offeringId = params.offeringId;
  const sessionId = params.sessionId;

  const subjectKey = readString(searchParams, "subjectKey");
  const subjectTitle = readString(searchParams, "subjectTitle");
  const termId = readString(searchParams, "termId");
  const termTitle = readString(searchParams, "termTitle");
  const termShortTitle = readString(searchParams, "termShortTitle");

  const [session, setSession] = useState<VirtualClassSessionRow | null>(null);
  const [participants, setParticipants] = useState<
    VirtualClassParticipantRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingParticipantId, setSavingParticipantId] = useState("");

  const [importingAttendance, setImportingAttendance] = useState(false);
  const [attendanceImportMessage, setAttendanceImportMessage] = useState("");

  const [reviewingAttendance, setReviewingAttendance] = useState(false);

  const orgId = useMemo(() => {
    if (!user?.uid) return "";
    return getOrgId(user.uid) ?? "";
  }, [user?.uid]);

  const listHref = useMemo(() => {
    return buildListHref({
      classId,
      offeringId,
      searchParams: new URLSearchParams(searchParams.toString()),
    });
  }, [classId, offeringId, searchParams]);

  const stats = useMemo(() => {
    const total = participants.length;

    const joined = participants.filter(
      (item) => item.platformJoinStatus === "JOIN_CLICKED",
    ).length;

    const attended = participants.filter(
      (item) => item.finalAttendanceStatus === "ATTENDED",
    ).length;

    const absent = participants.filter(
      (item) => item.finalAttendanceStatus === "ABSENT",
    ).length;

    const unknown = participants.filter(
      (item) =>
        !item.finalAttendanceStatus || item.finalAttendanceStatus === "UNKNOWN",
    ).length;

    return {
      total,
      joined,
      attended,
      absent,
      unknown,
    };
  }, [participants]);

  const loadData = useCallback(async () => {
    if (!user || !orgId) {
      setSession(null);
      setParticipants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const sessionRef = doc(
        db,
        `orgs/${orgId}/virtualClassSessions/${sessionId}`,
      );

      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        setSession(null);
        setParticipants([]);
        setError("لم يتم العثور على الحصة الافتراضية.");
        return;
      }

      const nextSession = mapSessionDoc(sessionSnap.id, sessionSnap.data());

      const participantsRef = collection(
        db,
        `orgs/${orgId}/virtualClassParticipants`,
      );

      const participantsQuery = query(
        participantsRef,
        where("sessionId", "==", sessionId),
      );

      const participantsSnap = await getDocs(participantsQuery);

      const nextParticipants = participantsSnap.docs
        .map((docSnap) => mapParticipantDoc(docSnap.id, docSnap.data()))
        .sort((a, b) => (a.studentId ?? "").localeCompare(b.studentId ?? ""));

      setSession(nextSession);
      setParticipants(nextParticipants);
    } catch (loadError: unknown) {
      setSession(null);
      setParticipants([]);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [user, orgId, sessionId]);

  const updateFinalAttendanceStatus = useCallback(
    async (participantId: string, nextStatus: string) => {
      if (!user || !orgId) return;

      setSavingParticipantId(participantId);
      setError("");

      try {
        const now = Date.now();

        await updateDoc(
          doc(db, `orgs/${orgId}/virtualClassParticipants/${participantId}`),
          {
            finalAttendanceStatus: nextStatus,
            reviewedByPersonId: user.uid,
            reviewedAt: now,
            updatedAt: now,
          },
        );

        setParticipants((current) =>
          current.map((item) =>
            item.id === participantId
              ? {
                  ...item,
                  finalAttendanceStatus: nextStatus,
                  reviewedByPersonId: user.uid,
                  reviewedAt: now,
                  updatedAt: now,
                }
              : item,
          ),
        );
      } catch (saveError: unknown) {
        setError(getErrorMessage(saveError));
      } finally {
        setSavingParticipantId("");
      }
    },
    [user, orgId],
  );

  const reviewAttendance = useCallback(async () => {
    if (!user || !orgId || !session) return;

    setReviewingAttendance(true);
    setError("");

    try {
      const now = Date.now();

      await updateDoc(
        doc(db, `orgs/${orgId}/virtualClassSessions/${session.id}`),
        {
          status: "ATTENDANCE_REVIEWED",
          attendanceReviewedAt: now,
          attendanceReviewedByPersonId: user.uid,
          updatedAt: now,
        },
      );

      setSession((current) =>
        current
          ? {
              ...current,
              status: "ATTENDANCE_REVIEWED",
              attendanceReviewedAt: now,
              attendanceReviewedByPersonId: user.uid,
              updatedAt: now,
            }
          : current,
      );
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError));
    } finally {
      setReviewingAttendance(false);
    }
  }, [user, orgId, session]);

  useEffect(() => {
    if (checkingAuth) return;
    void loadData();
  }, [checkingAuth, loadData]);

  if (checkingAuth) {
    return (
      <main className="p-6">
        <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          جاري التحقق من تسجيل الدخول...
        </div>
      </main>
    );
  }

  async function importGoogleAttendance() {
    if (!session) return;

    setImportingAttendance(true);
    setAttendanceImportMessage("");

    try {
      const callable = httpsCallable(functions, "importGoogleMeetAttendance");

      const result = await callable({
        orgId,
        sessionId,
      });

      const data = result.data as ImportGoogleMeetAttendanceResult;

      setAttendanceImportMessage(
        `تم جلب حضور Google Meet: ${data.participantCount} مشارك، تم ربط ${data.matchedCount} طالب.`,
      );
    } catch (error) {
      setAttendanceImportMessage(
        error instanceof Error ? error.message : "تعذر جلب حضور Google Meet.",
      );
    } finally {
      setImportingAttendance(false);
    }
  }

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="space-y-3">
            <Link
              href={listHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع لقائمة الحصص
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Video className="h-4 w-4" />
              تفاصيل الحصة الافتراضية
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={importingAttendance || !session?.providerMeetingCode}
              onClick={() => void importGoogleAttendance()}
            >
              {importingAttendance
                ? "جاري جلب الحضور..."
                : "جلب حضور Google Meet"}
            </Button>
            {attendanceImportMessage ? (
              <p className="text-sm text-muted-foreground">
                {attendanceImportMessage}
              </p>
            ) : null}
            <div>
              <h1 className="text-2xl font-bold">
                {session?.title || "حصة افتراضية"}
              </h1>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                عرض بيانات الحصة والمشاركين وحالة الحضور الأولية.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border px-3 py-1">
                الفصل: {session?.classId || classId}
              </span>
              <span className="rounded-full border px-3 py-1">
                المادة:{" "}
                {session?.subjectTitle ||
                  subjectTitle ||
                  session?.subjectKey ||
                  subjectKey ||
                  "غير محددة"}
              </span>
              <span className="rounded-full border px-3 py-1">
                الفصل الدراسي:{" "}
                {session?.termShortTitle ||
                  termShortTitle ||
                  session?.termTitle ||
                  termTitle ||
                  session?.termId ||
                  termId ||
                  "غير محدد"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void reviewAttendance()}
              disabled={
                loading ||
                reviewingAttendance ||
                !session ||
                session.status === "ATTENDANCE_REVIEWED"
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              {reviewingAttendance
                ? "جاري الاعتماد..."
                : session?.status === "ATTENDANCE_REVIEWED"
                  ? "تم اعتماد الحضور"
                  : "اعتماد الحضور"}
            </Button>

            {session?.joinUrl ? (
              <Button asChild>
                <a href={session.joinUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  فتح Google Meet
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {!orgId ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          تعذر تحديد المؤسسة الحالية. تأكد من اختيار المؤسسة قبل فتح الصفحة.
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <div className="font-bold">تعذر تحميل تفاصيل الحصة</div>
          <div className="mt-1">{error}</div>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          جاري تحميل تفاصيل الحصة...
        </section>
      ) : null}

      {!loading && session ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">حالة الحصة</div>
              <div className="mt-2 text-xl font-bold">
                {getStatusLabel(session.status)}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">المزوّد</div>
              <div className="mt-2 text-xl font-bold">
                {getProviderLabel(session.provider)}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">
                حالة رابط Meet
              </div>
              <div className="mt-2 text-xl font-bold">
                {getProvisioningStatusLabel(session.providerProvisioningStatus)}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">بداية الحصة</div>
              <div className="mt-2 text-lg font-bold">
                {formatDateTime(session.startsAt)}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">نهاية الحصة</div>
              <div className="mt-2 text-lg font-bold">
                {formatDateTime(session.endsAt)}
              </div>
            </div>
          </section>

          {session.providerProvisioningStatus === "FAILED" ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              <div className="font-bold">تعذر إنشاء رابط Google Meet</div>
              <div className="mt-1">
                {session.providerProvisioningErrorMessage ||
                  "حدث خطأ غير معروف."}
              </div>
            </section>
          ) : null}

          {session.description ? (
            <section className="rounded-3xl border bg-card p-6 shadow-sm">
              <h2 className="font-bold">وصف الحصة</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {session.description}
              </p>
            </section>
          ) : null}

          {session.status === "ATTENDANCE_REVIEWED" ? (
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="font-bold">تم اعتماد حضور هذه الحصة</div>
              <div className="mt-1">
                وقت الاعتماد: {formatDateTime(session.attendanceReviewedAt)}
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">المستهدفون</div>
              <div className="mt-2 text-2xl font-bold">
                {stats.total.toLocaleString("ar-SA")}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">ضغطوا دخول</div>
              <div className="mt-2 text-2xl font-bold">
                {stats.joined.toLocaleString("ar-SA")}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">حاضر</div>
              <div className="mt-2 text-2xl font-bold">
                {stats.attended.toLocaleString("ar-SA")}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">غائب</div>
              <div className="mt-2 text-2xl font-bold">
                {stats.absent.toLocaleString("ar-SA")}
              </div>
            </div>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="text-sm text-muted-foreground">غير معروف</div>
              <div className="mt-2 text-2xl font-bold">
                {stats.unknown.toLocaleString("ar-SA")}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="font-bold">المشاركون</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  قائمة الطلاب المستهدفين في هذه الحصة.
                </p>
              </div>

              <div className="rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">
                {participants.length.toLocaleString("ar-SA")} طالب
              </div>
            </div>

            {participants.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                لا يوجد مشاركون لهذه الحصة. أنشئ حصة جديدة بعد تفعيل 15C أو تحقق
                من سجلات المشاركين.
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-3xl border">
                <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-3 border-b bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
                  <div>الطالب</div>
                  <div>دخول المنصة</div>
                  <div>تقرير Google</div>
                  <div>الحضور النهائي</div>
                  <div>مدة Google</div>
                </div>

                <div className="divide-y">
                  {participants.map((participant) => {
                    const AttendanceIcon = getAttendanceIcon(
                      participant.finalAttendanceStatus,
                    );

                    return (
                      <article
                        key={participant.id}
                        className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] md:items-center"
                      >
                        <div className="space-y-1">
                          <div className="font-bold">
                            {participant.studentDisplayName ||
                              participant.studentId ||
                              "طالب غير محدد"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {participant.studentId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            أولياء الأمور:{" "}
                            {(
                              participant.guardianIds ?? []
                            ).length.toLocaleString("ar-SA")}
                          </div>
                        </div>

                        <div>
                          <div className="md:hidden text-xs text-muted-foreground">
                            دخول المنصة
                          </div>
                          <div className="font-semibold">
                            {getAttendanceStatusLabel(
                              participant.platformJoinStatus,
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {participant.joinClickedAt
                              ? formatDateTime(participant.joinClickedAt)
                              : "لم يضغط دخول"}
                          </div>
                        </div>

                        <div>
                          <div className="md:hidden text-xs text-muted-foreground">
                            تقرير Google
                          </div>
                          <div className="font-semibold">
                            {getAttendanceStatusLabel(
                              participant.providerAttendanceStatus,
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {participant.providerParticipantName ||
                              participant.providerParticipantEmail ||
                              "لا توجد بيانات"}
                          </div>
                        </div>

                        <div>
                          <div className="md:hidden text-xs text-muted-foreground">
                            الحضور النهائي
                          </div>

                          <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold">
                              <AttendanceIcon className="h-4 w-4" />
                              {getAttendanceStatusLabel(
                                participant.finalAttendanceStatus,
                              )}
                            </div>

                            <select
                              value={
                                participant.finalAttendanceStatus || "UNKNOWN"
                              }
                              disabled={savingParticipantId === participant.id}
                              onChange={(event) =>
                                void updateFinalAttendanceStatus(
                                  participant.id,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border bg-background px-3 py-2 text-xs outline-none transition focus:border-primary"
                            >
                              <option value="UNKNOWN">غير معروف</option>
                              <option value="ATTENDED">حاضر</option>
                              <option value="LATE">متأخر</option>
                              <option value="LEFT_EARLY">خرج مبكرًا</option>
                              <option value="ABSENT">غائب</option>
                              <option value="EXCUSED">بعذر</option>
                            </select>

                            {savingParticipantId === participant.id ? (
                              <div className="text-xs text-muted-foreground">
                                جاري الحفظ...
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <div className="md:hidden text-xs text-muted-foreground">
                            مدة Google
                          </div>
                          <div className="font-semibold">
                            {formatDuration(
                              participant.providerDurationMinutes,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            الثقة:{" "}
                            {participant.providerMatchConfidence || "NONE"}
                          </div>

                          {participant.providerMatchReason ? (
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {participant.providerMatchReason}
                            </div>
                          ) : null}
                          <div className="text-xs text-muted-foreground">
                            {participant.reviewedAt
                              ? `روجع: ${formatDateTime(participant.reviewedAt)}`
                              : "لم يراجع"}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
