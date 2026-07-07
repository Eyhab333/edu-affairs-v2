"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  Plus,
  RefreshCw,
  Video,
} from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getOrgId } from "@/lib/org";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";

type VirtualClassSessionRow = {
  id: string;

  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  termId?: string;

  classId?: string;
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

  startsAt?: number;
  endsAt?: number;

  status?: string;

  targetCount?: number;
  createdAt?: number;
  updatedAt?: number;
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

function buildNewVirtualClassHref(params: {
  classId: string;
  offeringId: string;
  searchParams: URLSearchParams;
}) {
  const queryString = params.searchParams.toString();

  return `/staff/classes/${encodeURIComponent(
    params.classId,
  )}/subjects/${encodeURIComponent(
    params.offeringId,
  )}/virtual-classes/new${queryString ? `?${queryString}` : ""}`;
}

function mapSessionDoc(id: string, data: DocumentData): VirtualClassSessionRow {
  return {
    id,

    orgId: data.orgId,
    schoolId: data.schoolId,
    academicYearId: data.academicYearId,
    termId: data.termId,

    classId: data.classId,
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

    startsAt: data.startsAt,
    endsAt: data.endsAt,

    status: data.status,

    targetCount: data.targetCount,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export default function SubjectVirtualClassesPage() {
  const params = useParams<{
    classId: string;
    offeringId: string;
  }>();

  const searchParams = useSearchParams();
  const { user, checkingAuth } = useRequireAuth();

  const classId = params.classId;
  const offeringId = params.offeringId;

  const schoolId = readString(searchParams, "schoolId");
  const academicYearId = readString(searchParams, "academicYearId");
  const gradeId = readString(searchParams, "gradeId");
  const streamId = readString(searchParams, "streamId");

  const termId = readString(searchParams, "termId");
  const termTitle = readString(searchParams, "termTitle");
  const termShortTitle = readString(searchParams, "termShortTitle");

  const subjectKey = readString(searchParams, "subjectKey");
  const subjectTitle = readString(searchParams, "subjectTitle");
  const classSubjectOfferingId =
    readString(searchParams, "classSubjectOfferingId") || offeringId;

  const [sessions, setSessions] = useState<VirtualClassSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const orgId = useMemo(() => {
    if (!user?.uid) return "";
    return getOrgId(user.uid) ?? "";
  }, [user?.uid]);

  const newVirtualClassHref = useMemo(() => {
    return buildNewVirtualClassHref({
      classId,
      offeringId,
      searchParams: new URLSearchParams(searchParams.toString()),
    });
  }, [classId, offeringId, searchParams]);

  const loadSessions = useCallback(async () => {
    if (!user || !orgId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const sessionsRef = collection(db, `orgs/${orgId}/virtualClassSessions`);

      /**
       * نستخدم فلترًا واحدًا فقط لتجنب الحاجة إلى Composite Index الآن.
       * ثم نفلتر باقي السياق في الذاكرة.
       */
      const sessionsQuery = query(
        sessionsRef,
        where("classSubjectOfferingId", "==", classSubjectOfferingId),
      );

      const snap = await getDocs(sessionsQuery);

      const rows = snap.docs
        .map((docSnap) => mapSessionDoc(docSnap.id, docSnap.data()))
        .filter((item) => item.classId === classId)
        .filter((item) => item.schoolId === schoolId)
        .filter((item) => item.academicYearId === academicYearId)
        .filter((item) => !termId || item.termId === termId)
        .filter((item) => !subjectKey || item.subjectKey === subjectKey)
        .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));

      setSessions(rows);
    } catch (loadError: unknown) {
      setSessions([]);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [
    user,
    orgId,
    classSubjectOfferingId,
    classId,
    schoolId,
    academicYearId,
    termId,
    subjectKey,
  ]);

  useEffect(() => {
    if (checkingAuth) return;
    void loadSessions();
  }, [checkingAuth, loadSessions]);

  if (checkingAuth) {
    return (
      <main className="p-6">
        <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          جاري التحقق من تسجيل الدخول...
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Video className="h-4 w-4" />
              الحصص الافتراضية
            </div>

            <div>
              <h1 className="text-2xl font-bold">
                {subjectTitle || subjectKey || "المادة"} — الحصص الافتراضية
              </h1>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                جدولة ومتابعة حصص Google Meet لهذه المادة داخل الفصل المحدد.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border px-3 py-1">
                الفصل: {classId}
              </span>
              <span className="rounded-full border px-3 py-1">
                المادة: {subjectKey || "غير محددة"}
              </span>
              <span className="rounded-full border px-3 py-1">
                الفصل الدراسي:{" "}
                {termShortTitle || termTitle || termId || "غير محدد"}
              </span>
              {gradeId ? (
                <span className="rounded-full border px-3 py-1">
                  الصف: {gradeId}
                </span>
              ) : null}
              {streamId ? (
                <span className="rounded-full border px-3 py-1">
                  المسار: {streamId}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSessions()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>

            <Button asChild>
              <Link href={newVirtualClassHref}>
                <Plus className="h-4 w-4" />
                إنشاء حصة
              </Link>
            </Button>
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
          <div className="font-bold">تعذر تحميل الحصص الافتراضية</div>
          <div className="mt-1">{error}</div>
        </section>
      ) : null}

      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">قائمة الحصص</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الحصص المجدولة أو المنتهية لهذه المادة.
            </p>
          </div>

          <div className="rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">
            {sessions.length.toLocaleString("ar-SA")} حصة
          </div>
        </div>

        {loading ? (
          <div className="mt-5 rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            جاري تحميل الحصص الافتراضية...
          </div>
        ) : null}

        {!loading && sessions.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed p-8 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-bold">لا توجد حصص افتراضية بعد</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              ابدأ بإنشاء أول حصة Google Meet لهذه المادة.
            </p>

            <Button asChild className="mt-4">
              <Link href={newVirtualClassHref}>
                <Plus className="h-4 w-4" />
                إنشاء حصة
              </Link>
            </Button>
          </div>
        ) : null}

        {!loading && sessions.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {sessions.map((session) => (
              <article
                key={session.id}
                className="rounded-3xl border bg-background p-4 transition hover:bg-muted/40"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">
                        {session.title || "حصة افتراضية"}
                      </h3>

                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {getStatusLabel(session.status)}
                      </span>

                      <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                        {getProviderLabel(session.provider)}
                      </span>

                      <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                        {getProvisioningStatusLabel(
                          session.providerProvisioningStatus,
                        )}
                      </span>
                    </div>
                    {session.providerProvisioningStatus === "FAILED" ? (
                      <p className="text-sm leading-7 text-red-600 dark:text-red-300">
                        {session.providerProvisioningErrorMessage ||
                          "تعذر إنشاء رابط Google Meet."}
                      </p>
                    ) : null}
                    {session.description ? (
                      <p className="text-sm leading-7 text-muted-foreground">
                        {session.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border px-3 py-1">
                        البداية: {formatDateTime(session.startsAt)}
                      </span>
                      <span className="rounded-full border px-3 py-1">
                        النهاية: {formatDateTime(session.endsAt)}
                      </span>
                      <span className="rounded-full border px-3 py-1">
                        الطلاب المستهدفون:{" "}
                        {(session.targetCount ?? 0).toLocaleString("ar-SA")}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {session.joinUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={session.joinUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          فتح Meet
                        </a>
                      </Button>
                    ) : null}

                    <Button asChild size="sm">
                      <Link
                        href={`/staff/classes/${encodeURIComponent(
                          classId,
                        )}/subjects/${encodeURIComponent(
                          offeringId,
                        )}/virtual-classes/${encodeURIComponent(
                          session.id,
                        )}?${searchParams.toString()}`}
                      >
                        التفاصيل
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
