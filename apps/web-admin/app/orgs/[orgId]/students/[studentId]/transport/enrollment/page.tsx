"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  StudentTransportDirection,
  StudentTransportEnrollmentSchema,
  StudentTransportEnrollmentStatus,
} from "@takween/contracts";
import { ArrowLeft, Bus, Loader2, Save } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type EnrollmentRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  status?: string;
  startAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  title: string;
};

type TransportRouteRow = {
  id: string;
  orgId: string;
  schoolId: string;
  title: string;
  busSupervisorPersonId?: string;
  isActive?: boolean;
};

type TransportEnrollmentRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId?: string;
  routeId: string;
  direction: string;
  status: string;
  startAt: number;
  endAt?: number;
  note?: string;
  createdAt?: number;
};

type PageData = {
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  enrollment: EnrollmentRow | null;
  routes: TransportRouteRow[];
  transportEnrollments: TransportEnrollmentRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-[720px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function pickCurrentEnrollment(rows: EnrollmentRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 1 : 0;
    const bActive = b.status === "ACTIVE" ? 1 : 0;

    if (bActive !== aActive) return bActive - aActive;
    return Number(b.startAt || 0) - Number(a.startAt || 0);
  });

  return sorted[0] ?? null;
}

function pickCurrentTransportEnrollment(rows: TransportEnrollmentRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 1 : 0;
    const bActive = b.status === "ACTIVE" ? 1 : 0;

    if (bActive !== aActive) return bActive - aActive;
    return Number(b.startAt || 0) - Number(a.startAt || 0);
  });

  return sorted[0] ?? null;
}

function toDateInputValue(timestamp?: number) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(timestamp),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function StudentTransportEnrollmentPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [routeId, setRouteId] = useState("");
  const [direction, setDirection] =
    useState<(typeof StudentTransportDirection.options)[number]>("ROUND_TRIP");
  const [status, setStatus] =
    useState<(typeof StudentTransportEnrollmentStatus.options)[number]>(
      "ACTIVE",
    );
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [note, setNote] = useState("");
  const [createdAt, setCreatedAt] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) return null;

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const personPromise = student.personId
      ? getDoc(doc(db, `orgs/${orgId}/people/${student.personId}`))
      : Promise.resolve(null);

    const enrollmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentEnrollments`),
        where("studentId", "==", studentId),
      ),
    );

    const transportEnrollmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentTransportEnrollments`),
        where("studentId", "==", studentId),
      ),
    );

    const [personSnap, enrollmentsSnap, transportEnrollmentsSnap] =
      await Promise.all([
        personPromise,
        enrollmentsPromise,
        transportEnrollmentsPromise,
      ]);

    const person =
      personSnap && "exists" in personSnap && personSnap.exists()
        ? ({
            id: personSnap.id,
            ...(personSnap.data() as Omit<PersonRow, "id">),
          } as PersonRow)
        : null;

    const enrollments = enrollmentsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EnrollmentRow, "id">),
    }));

    const enrollment = pickCurrentEnrollment(enrollments);

    const transportEnrollments = transportEnrollmentsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<TransportEnrollmentRow, "id">),
      }))
      .sort((a, b) => Number(b.startAt || 0) - Number(a.startAt || 0));

    if (!enrollment) {
      return {
        student,
        person,
        school: null,
        academicYear: null,
        enrollment: null,
        routes: [],
        transportEnrollments,
      };
    }

    const [schoolSnap, academicYearSnap, routesSnap] = await Promise.all([
      getDoc(doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`)),
      getDoc(
        doc(
          db,
          `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`,
        ),
      ),
      getDocs(
        query(
          collection(db, `orgs/${orgId}/transportRoutes`),
          where("schoolId", "==", enrollment.schoolId),
        ),
      ),
    ]);

    const school = schoolSnap.exists()
      ? ({
          id: schoolSnap.id,
          ...(schoolSnap.data() as Omit<SchoolRow, "id">),
        } as SchoolRow)
      : null;

    const academicYear = academicYearSnap.exists()
      ? ({
          id: academicYearSnap.id,
          title:
            (academicYearSnap.data() as { title?: string }).title ??
            academicYearSnap.id,
        } as AcademicYearRow)
      : null;

    const routes = routesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<TransportRouteRow, "id">),
      }))
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));

    return {
      student,
      person,
      school,
      academicYear,
      enrollment,
      routes,
      transportEnrollments,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل اشتراك النقل");
  }, [error]);

  const currentTransportEnrollment = useMemo(
    () => pickCurrentTransportEnrollment(data?.transportEnrollments ?? []),
    [data?.transportEnrollments],
  );

  useEffect(() => {
    if (!currentTransportEnrollment) return;

    setRouteId(currentTransportEnrollment.routeId || "");
    setDirection(
      (currentTransportEnrollment.direction as (typeof StudentTransportDirection.options)[number]) ||
        "ROUND_TRIP",
    );
    setStatus(
      (currentTransportEnrollment.status as (typeof StudentTransportEnrollmentStatus.options)[number]) ||
        "ACTIVE",
    );
    setStartAt(toDateInputValue(currentTransportEnrollment.startAt));
    setEndAt(toDateInputValue(currentTransportEnrollment.endAt));
    setNote(currentTransportEnrollment.note || "");
    setCreatedAt(currentTransportEnrollment.createdAt);
  }, [currentTransportEnrollment]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!data?.enrollment || !data.school || !data.academicYear) {
        throw new Error("لا يوجد قيد دراسي نشط للطالب.");
      }

      if (!routeId) {
        throw new Error("يجب اختيار خط نقل.");
      }

      const nowMs = Date.now();
      const docId =
        currentTransportEnrollment?.id ||
        `transport-enrollment-${studentId}-${routeId}`;

      const payload = {
        id: docId,
        orgId,
        schoolId: data.enrollment.schoolId,
        academicYearId: data.enrollment.academicYearId,
        studentId,
        enrollmentId: data.enrollment.id || "",
        routeId,
        direction,
        status,
        startAt: startAt ? new Date(startAt).getTime() : nowMs,
        endAt: endAt ? new Date(endAt).getTime() : undefined,
        note: note.trim(),
        createdAt: createdAt ?? nowMs,
        updatedAt: nowMs,
        ...(endAt ? { endAt: new Date(endAt).getTime() } : {}),
      };

      const parsed = StudentTransportEnrollmentSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n"),
        );
      }

      await setDoc(
        doc(db, `orgs/${orgId}/studentTransportEnrollments/${docId}`),
        parsed.data,
        { merge: true },
      );

      toast.success("تم حفظ اشتراك النقل بنجاح");
      router.push(`/orgs/${orgId}/students/${studentId}/transport`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ اشتراك النقل");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="اشتراك النقل"
        badgeIcon={<Bus className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد لا يكون هذا الطالب موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="اشتراك النقل"
        badgeIcon={<Bus className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="إضافة أو تحديث اشتراك الباص. عند عدم وجود اشتراك يعتبر ولي الأمر هو المسؤول عن التوصيل."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}/transport`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى النقل
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ الاشتراك
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="الربط الحالي"
        description="مرجع سريع قبل حفظ الاشتراك."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          المدرسة:{" "}
          <span className="font-medium text-foreground">
            {data?.school?.name || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          السنة الدراسية:{" "}
          <span className="font-medium text-foreground">
            {data?.academicYear?.title || "—"}
          </span>
        </div>
      </FormSection>

      <FormSection
        title="بيانات الاشتراك"
        description="اختر خط النقل والاتجاه وحالة الاشتراك."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        {!data?.enrollment ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            لا يوجد قيد دراسي نشط للطالب، لذلك لا يمكن ربطه باشتراك نقل الآن.
          </div>
        ) : null}

        {currentTransportEnrollment ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            الاشتراك الحالي يبدأ من{" "}
            <span className="font-medium text-foreground">
              {formatDate(currentTransportEnrollment.startAt)}
            </span>{" "}
            وحالته{" "}
            <span className="font-medium text-foreground">
              {currentTransportEnrollment.status}
            </span>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">خط النقل</label>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            disabled={!data?.enrollment}
          >
            <option value="">اختر</option>
            {(data?.routes ?? []).map((route) => (
              <option key={route.id} value={route.id}>
                {route.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">اتجاه الاشتراك</label>
            <select
              value={direction}
              onChange={(e) =>
                setDirection(
                  e.target
                    .value as (typeof StudentTransportDirection.options)[number],
                )
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={!data?.enrollment}
            >
              {StudentTransportDirection.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target
                    .value as (typeof StudentTransportEnrollmentStatus.options)[number],
                )
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={!data?.enrollment}
            >
              {StudentTransportEnrollmentStatus.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">بداية الاشتراك</label>
            <Input
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={!data?.enrollment}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نهاية الاشتراك</label>
            <Input
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              disabled={!data?.enrollment}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملاحظة</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            disabled={!data?.enrollment}
          />
        </div>
      </FormSection>
    </div>
  );
}
