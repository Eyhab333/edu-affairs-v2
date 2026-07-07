"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock, Save, Video } from "lucide-react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";
import { getOrgId } from "@/lib/org";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";

type StudentEnrollmentRow = {
  id: string;
  studentId?: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  status?: string;
};

type GuardianLinkRow = {
  id: string;
  studentId?: string;
  guardianId?: string;
  guardianUid?: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  active?: boolean;
};

type GuardianRow = {
  id: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  userId?: string;
};

type GuardianRefsByStudentId = Record<
  string,
  {
    guardianIds: string[];
    guardianUids: string[];
  }
>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

type CreateVirtualClassSessionWithMeetResult = {
  ok: boolean;
  sessionId: string;
  targetCount: number;
  providerProvisioningStatus: "PENDING" | "READY" | "FAILED";
  joinUrl?: string;
  errorMessage?: string;
};

function readString(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultStartTime() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return toDatetimeLocalValue(now);
}

function getDefaultEndTime() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 2);
  return toDatetimeLocalValue(now);
}

function parseDatetimeLocal(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return `https://${trimmed}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function createJoinToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readGuardianUid(data: {
  guardianUid?: string;
  uid?: string;
  authUid?: string;
  userUid?: string;
  userId?: string;
}) {
  return (
    data.guardianUid?.trim() ||
    data.uid?.trim() ||
    data.authUid?.trim() ||
    data.userUid?.trim() ||
    data.userId?.trim() ||
    ""
  );
}

function buildSessionNotificationBody(params: {
  studentCount: number;
  subjectTitle: string;
  subjectKey: string;
  startsAt: number;
}) {
  const subjectLabel = params.subjectTitle || params.subjectKey || "المادة";

  const startsAtText = new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(params.startsAt));

  return `تم جدولة حصة افتراضية في ${subjectLabel}، موعدها ${startsAtText}.`;
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

export default function NewSubjectVirtualClassPage() {
  const params = useParams<{
    classId: string;
    offeringId: string;
  }>();

  const router = useRouter();
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

  const [title, setTitle] = useState(
    subjectTitle ? `حصة ${subjectTitle}` : "حصة افتراضية",
  );
  const [description, setDescription] = useState("");

  const [startsAtInput, setStartsAtInput] = useState(getDefaultStartTime);
  const [endsAtInput, setEndsAtInput] = useState(getDefaultEndTime);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setError("يجب تسجيل الدخول أولًا.");
      return;
    }

    if (!orgId) {
      setError("تعذر تحديد المؤسسة الحالية.");
      return;
    }

    const cleanTitle = title.trim();

    const startsAt = parseDatetimeLocal(startsAtInput);
    const endsAt = parseDatetimeLocal(endsAtInput);

    if (!cleanTitle) {
      setError("اكتب عنوان الحصة.");
      return;
    }

    if (!schoolId || !academicYearId || !classId || !classSubjectOfferingId) {
      setError("بيانات الفصل أو المادة غير مكتملة في الرابط.");
      return;
    }

    if (!termId || !termTitle || !termShortTitle) {
      setError("بيانات الفصل الدراسي غير مكتملة في الرابط.");
      return;
    }

    if (!startsAt || !endsAt) {
      setError("حدد وقت البداية والنهاية بشكل صحيح.");
      return;
    }

    if (endsAt <= startsAt) {
      setError("وقت النهاية يجب أن يكون بعد وقت البداية.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const createSessionWithMeet = httpsCallable(
        functions,
        "createVirtualClassSessionWithMeet",
      );

      const result = await createSessionWithMeet({
        orgId,
        schoolId,
        academicYearId,

        termId,
        termTitle,
        termShortTitle,

        classId,
        gradeId,
        streamId,

        subjectKey,
        subjectTitle,
        classSubjectOfferingId,

        title: cleanTitle,
        description: description.trim(),

        startsAt,
        endsAt,

        teacherEmail: user.email ?? "",

        /**
         * مؤقتًا نستخدم uid إلى أن نربطها بـ personId من actor.
         */
        createdByPersonId: user.uid,
      });

      const data = result.data as CreateVirtualClassSessionWithMeetResult;

      if (!data.ok) {
        throw new Error(
          data.errorMessage ||
            "تم إنشاء الحصة لكن تعذر إنشاء رابط Google Meet.",
        );
      }

      router.push(listHref);
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

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
            <Link
              href={listHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع لقائمة الحصص
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Video className="h-4 w-4" />
              إنشاء حصة افتراضية
            </div>

            <div>
              <h1 className="text-2xl font-bold">
                {subjectTitle || subjectKey || "المادة"} — حصة جديدة
              </h1>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                أنشئ حصة Google Meet مرتبطة بهذه المادة والفصل الدراسي.
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
            </div>
          </div>
        </div>
      </section>

      {!orgId ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          تعذر تحديد المؤسسة الحالية. تأكد من اختيار المؤسسة قبل إنشاء الحصة.
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <div className="font-bold">تعذر حفظ الحصة</div>
          <div className="mt-1">{error}</div>
        </section>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-semibold">
                عنوان الحصة
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="مثال: مراجعة الوحدة الأولى"
              />
            </div>

            <div className="rounded-2xl border bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
              سيتم إنشاء رابط Google Meet تلقائيًا عند حفظ الحصة.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="startsAt" className="text-sm font-semibold">
                  وقت البداية
                </label>
                <input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAtInput}
                  onChange={(event) => setStartsAtInput(event.target.value)}
                  className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="endsAt" className="text-sm font-semibold">
                  وقت النهاية
                </label>
                <input
                  id="endsAt"
                  type="datetime-local"
                  value={endsAtInput}
                  onChange={(event) => setEndsAtInput(event.target.value)}
                  className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-semibold">
                وصف مختصر
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="اكتب هدف الحصة أو تعليمات الدخول..."
              />
            </div>
          </section>

          <aside className="space-y-4 rounded-3xl border bg-background p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <CalendarClock className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">بيانات الربط</h2>
                <p className="text-xs text-muted-foreground">
                  تحفظ تلقائيًا مع الحصة.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="rounded-2xl border px-3 py-2">
                <div className="text-xs text-muted-foreground">المدرسة</div>
                <div className="font-semibold">{schoolId || "غير محدد"}</div>
              </div>

              <div className="rounded-2xl border px-3 py-2">
                <div className="text-xs text-muted-foreground">السنة</div>
                <div className="font-semibold">
                  {academicYearId || "غير محدد"}
                </div>
              </div>

              <div className="rounded-2xl border px-3 py-2">
                <div className="text-xs text-muted-foreground">الفصل</div>
                <div className="font-semibold">{classId}</div>
              </div>

              <div className="rounded-2xl border px-3 py-2">
                <div className="text-xs text-muted-foreground">المادة</div>
                <div className="font-semibold">
                  {subjectTitle || subjectKey || "غير محددة"}
                </div>
              </div>

              <div className="rounded-2xl border px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  الفصل الدراسي
                </div>
                <div className="font-semibold">
                  {termShortTitle || termTitle || termId || "غير محدد"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-muted p-3 text-xs leading-6 text-muted-foreground">
              في الخطوة التالية سننشئ المشاركين تلقائيًا لكل طلاب الفصل، لذلك
              سيظهر عدد الطلاب المستهدفين في القائمة بعد 15C.
            </div>
          </aside>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-5">
          <Button asChild type="button" variant="outline">
            <Link href={listHref}>إلغاء</Link>
          </Button>

          <Button type="submit" disabled={saving || checkingAuth}>
            <Save className="h-4 w-4" />
            {saving ? "جاري الحفظ..." : "حفظ الحصة"}
          </Button>
        </div>
      </form>
    </main>
  );
}
