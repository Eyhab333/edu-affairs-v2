"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bus,
  CheckCircle2,
  Plus,
  Route,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    enabledModules?: string[];
    schoolType?: string;
  };
};

type AcademicYearRow = {
  id: string;
  title: string;
};

type EnrollmentRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId?: string;
  classId?: string;
  status?: string;
  startAt?: number;
  endAt?: number;
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
};

type SchoolDayRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  dayAt: number;
  mode: string;
  status: string;
  note?: string;
};

type TransportAttendanceRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  schoolDayId: string;
  studentId: string;
  enrollmentId?: string;
  transportEnrollmentId: string;
  routeId: string;
  tripDirection: string;
  status: string;
  recordedByPersonId: string;
  recorderRoleKey: string;
  recordedAt: number;
  note?: string;
};

type PageData = {
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  enrollment: EnrollmentRow | null;
  routes: TransportRouteRow[];
  transportEnrollments: TransportEnrollmentRow[];
  schoolDays: SchoolDayRow[];
  transportAttendanceRows: TransportAttendanceRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
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

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(timestamp)
  );
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getTransportDirectionLabel(value?: string) {
  switch (value) {
    case "TO_SCHOOL":
      return "إلى المدرسة";
    case "FROM_SCHOOL":
      return "من المدرسة";
    case "ROUND_TRIP":
      return "ذهاب وعودة";
    default:
      return value || "—";
  }
}

function getTransportEnrollmentStatusLabel(value?: string) {
  switch (value) {
    case "ACTIVE":
      return "نشط";
    case "PAUSED":
      return "موقوف مؤقتًا";
    case "ENDED":
      return "منتهي";
    default:
      return value || "—";
  }
}

function getTripDirectionLabel(value?: string) {
  switch (value) {
    case "MORNING_TO_SCHOOL":
      return "الصباح إلى المدرسة";
    case "AFTERNOON_FROM_SCHOOL":
      return "العودة من المدرسة";
    default:
      return value || "—";
  }
}

function getTransportAttendanceStatusLabel(value?: string) {
  switch (value) {
    case "BOARDED":
      return "صعد الحافلة";
    case "NOT_BOARDED":
      return "لم يصعد";
    case "DROPPED_OFF":
      return "نزل من الحافلة";
    case "NOT_DROPPED_OFF":
      return "لم ينزل";
    case "EXCUSED":
      return "بعذر";
    default:
      return value || "—";
  }
}

function isTransportEnabled(school: SchoolRow | null) {
  return (school?.profile?.enabledModules ?? []).includes("TRANSPORT");
}

export default function StudentTransportPage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

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
        where("studentId", "==", studentId)
      )
    );

    const transportEnrollmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentTransportEnrollments`),
        where("studentId", "==", studentId)
      )
    );

    const transportAttendancePromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentTransportAttendanceRecords`),
        where("studentId", "==", studentId)
      )
    );

    const [personSnap, enrollmentsSnap, transportEnrollmentsSnap, transportAttendanceSnap] =
      await Promise.all([
        personPromise,
        enrollmentsPromise,
        transportEnrollmentsPromise,
        transportAttendancePromise,
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

    const transportAttendanceRows = transportAttendanceSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<TransportAttendanceRow, "id">),
      }))
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));

    if (!enrollment) {
      return {
        student,
        person,
        school: null,
        academicYear: null,
        enrollment: null,
        routes: [],
        transportEnrollments,
        schoolDays: [],
        transportAttendanceRows,
      };
    }

    const [schoolSnap, academicYearSnap, routesSnap, schoolDaysSnap] =
      await Promise.all([
        getDoc(doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`)),
        getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`
          )
        ),
        getDocs(
          query(
            collection(db, `orgs/${orgId}/transportRoutes`),
            where("schoolId", "==", enrollment.schoolId)
          )
        ),
        getDocs(
          query(
            collection(db, `orgs/${orgId}/schoolDays`),
            where("schoolId", "==", enrollment.schoolId)
          )
        ),
      ]);

    const school =
      schoolSnap.exists()
        ? ({
            id: schoolSnap.id,
            ...(schoolSnap.data() as Omit<SchoolRow, "id">),
          } as SchoolRow)
        : null;

    const academicYear =
      academicYearSnap.exists()
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
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));

    const schoolDays = schoolDaysSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolDayRow, "id">),
      }))
      .filter((item) => item.academicYearId === enrollment.academicYearId)
      .sort((a, b) => Number(b.dayAt || 0) - Number(a.dayAt || 0));

    return {
      student,
      person,
      school,
      academicYear,
      enrollment,
      routes,
      transportEnrollments,
      schoolDays,
      transportAttendanceRows,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل النقل المدرسي");
  }, [error]);

  const routeMap = useMemo(
    () => new Map((data?.routes ?? []).map((item) => [item.id, item.title])),
    [data?.routes]
  );

  const schoolDayMap = useMemo(
    () => new Map((data?.schoolDays ?? []).map((item) => [item.id, item])),
    [data?.schoolDays]
  );

  const currentTransportEnrollment = useMemo(
    () => pickCurrentTransportEnrollment(data?.transportEnrollments ?? []),
    [data?.transportEnrollments]
  );

  const totalRecords = data?.transportAttendanceRows.length ?? 0;
  const successCount =
    data?.transportAttendanceRows.filter((row) =>
      ["BOARDED", "DROPPED_OFF"].includes(row.status)
    ).length ?? 0;
  const missedCount =
    data?.transportAttendanceRows.filter((row) =>
      ["NOT_BOARDED", "NOT_DROPPED_OFF"].includes(row.status)
    ).length ?? 0;
  const excusedCount =
    data?.transportAttendanceRows.filter((row) => row.status === "EXCUSED").length ??
    0;

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="النقل المدرسي"
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

  const transportEnabled = isTransportEnabled(data?.school ?? null);

  return (
    <div className="space-y-6">
      <PageHero
        badge="النقل المدرسي"
        badgeIcon={<Bus className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="الاشتراك في الباص وسجل حضور الحافلة للطالب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى ملف الطالب
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}/transport/enrollment`}>
                <Route className="h-4 w-4" />
                إدارة الاشتراك
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/transport/attendance/new`}>
                <Plus className="h-4 w-4" />
                تسجيل حضور الحافلة
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="إجمالي السجلات" value={totalRecords} hint="كل سجلات الحافلة" />
        <InfoCard label="نجاح النقل" value={successCount} hint="صعود/نزول ناجح" />
        <InfoCard label="فوات النقل" value={missedCount} hint="لم يصعد أو لم ينزل" />
        <InfoCard label="بعذر" value={excusedCount} hint="سجلات معذورة" />
      </div>

      {!transportEnabled ? (
        <FormSection
          title="تنبيه"
          description="وحدة النقل غير مفعلة على المدرسة الحالية."
          contentClassName="space-y-3"
        >
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            المدرسة الحالية لا تحتوي على module باسم TRANSPORT. المساحة هنا تعمل،
            لكن الأفضل تفعيل الوحدة من إعدادات المدرسة.
          </div>
        </FormSection>
      ) : null}

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات المطلوبة."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="الربط الحالي"
        description="المدرسة والسنة الدراسية والقيد الحالي."
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
        title="الاشتراك الحالي"
        description="إذا لم يوجد اشتراك نشط، فغالبًا ولي الأمر يتولى التوصيل."
        contentClassName="space-y-4"
      >
        {!currentTransportEnrollment ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا يوجد اشتراك نقل نشط لهذا الطالب حاليًا.
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                الخط:{" "}
                <span className="font-medium text-foreground">
                  {routeMap.get(currentTransportEnrollment.routeId) ??
                    currentTransportEnrollment.routeId}
                </span>
              </div>
              <div>
                الاتجاه:{" "}
                <span className="font-medium text-foreground">
                  {getTransportDirectionLabel(currentTransportEnrollment.direction)}
                </span>
              </div>
              <div>
                الحالة:{" "}
                <span className="font-medium text-foreground">
                  {getTransportEnrollmentStatusLabel(
                    currentTransportEnrollment.status
                  )}
                </span>
              </div>
              <div>
                البداية:{" "}
                <span className="font-medium text-foreground">
                  {formatDate(currentTransportEnrollment.startAt)}
                </span>
                {" "}— النهاية:{" "}
                <span className="font-medium text-foreground">
                  {formatDate(currentTransportEnrollment.endAt)}
                </span>
              </div>
              {currentTransportEnrollment.note ? (
                <div>
                  الملاحظة:{" "}
                  <span className="font-medium text-foreground">
                    {currentTransportEnrollment.note}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </FormSection>

      <FormSection
        title="سجل الحافلة"
        description="آخر ما تم تسجيله لهذا الطالب في النقل المدرسي."
        contentClassName="space-y-4"
      >
        {(data?.transportAttendanceRows.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد سجلات نقل مدرسي لهذا الطالب حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.transportAttendanceRows ?? []).map((row) => {
              const day = schoolDayMap.get(row.schoolDayId);
              return (
                <div key={row.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">
                          {formatDate(day?.dayAt)}
                        </h3>

                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                          {getTripDirectionLabel(row.tripDirection)}
                        </span>

                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {getTransportAttendanceStatusLabel(row.status)}
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          الخط:{" "}
                          <span className="font-medium text-foreground">
                            {routeMap.get(row.routeId) ?? row.routeId}
                          </span>
                        </div>

                        <div>
                          وقت التسجيل:{" "}
                          <span className="font-medium text-foreground">
                            {formatDateTime(row.recordedAt)}
                          </span>
                        </div>

                        <div>
                          دور المسجّل:{" "}
                          <span className="font-medium text-foreground">
                            {row.recorderRoleKey}
                          </span>
                        </div>

                        {row.note ? (
                          <div>
                            الملاحظة:{" "}
                            <span className="font-medium text-foreground">
                              {row.note}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/orgs/${orgId}/students/${studentId}/transport/attendance/new?schoolDayId=${row.schoolDayId}&tripDirection=${row.tripDirection}`}
                        >
                          تحديث السجل
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>
    </div>
  );
}