"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  MembershipRole,
  StudentTransportAttendanceRecordSchema,
  TransportAttendanceStatus,
  TransportTripDirection,
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
  schoolDayId: string;
  studentId: string;
  transportEnrollmentId: string;
  routeId: string;
  tripDirection: string;
  status: string;
  note?: string;
};

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  isActive?: boolean;
  schoolId?: string;
  scopeType?: string;
  scopeId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };
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
  memberships: MembershipRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-[740px] animate-pulse rounded-2xl bg-muted" />
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

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(timestamp)
  );
}

function membershipMatchesSchool(membership: MembershipRow, schoolId: string) {
  const scopeType = String(membership.scopeType || "");
  const scopeId = String(membership.scopeId || "");
  const directSchoolId = String(membership.schoolId || "");
  const schoolIds = Array.isArray(membership.scopes?.schoolIds)
    ? membership.scopes?.schoolIds
    : [];

  if (membership.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (directSchoolId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

function pickRecorderMembership(
  memberships: MembershipRow[],
  uid: string | undefined,
  schoolId: string
) {
  if (!uid) return null;

  const rows = memberships.filter(
    (item) => item.uid === uid && item.isActive !== false
  );

  return (
    rows.find((item) => membershipMatchesSchool(item, schoolId)) ??
    rows.find((item) => String(item.scopeType || "") === "ORG") ??
    rows[0] ??
    null
  );
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewStudentTransportAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const schoolDayIdFromQuery = searchParams.get("schoolDayId") || "";
  const tripDirectionFromQuery = searchParams.get("tripDirection") || "";

  const { user, checkingAuth } = useRequireAuth();

  const [transportEnrollmentId, setTransportEnrollmentId] = useState("");
  const [schoolDayId, setSchoolDayId] = useState("");
  const [tripDirection, setTripDirection] =
    useState<(typeof TransportTripDirection.options)[number]>(
      "MORNING_TO_SCHOOL"
    );
  const [status, setStatus] =
    useState<(typeof TransportAttendanceStatus.options)[number]>("BOARDED");
  const [note, setNote] = useState("");
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
        where("studentId", "==", studentId)
      )
    );

    const transportEnrollmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentTransportEnrollments`),
        where("studentId", "==", studentId)
      )
    );

    const membershipsPromise = getDocs(query(collection(db, `orgs/${orgId}/memberships`)));

    const [personSnap, enrollmentsSnap, transportEnrollmentsSnap, membershipsSnap] =
      await Promise.all([
        personPromise,
        enrollmentsPromise,
        transportEnrollmentsPromise,
        membershipsPromise,
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
        schoolDays: [],
        transportAttendanceRows: [],
        memberships: membershipsSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<MembershipRow, "id">),
        })),
      };
    }

    const [schoolSnap, academicYearSnap, routesSnap, schoolDaysSnap, transportAttendanceSnap] =
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
        getDocs(
          query(
            collection(db, `orgs/${orgId}/studentTransportAttendanceRecords`),
            where("studentId", "==", studentId)
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
      .filter((item) => item.status !== "CANCELLED")
      .sort((a, b) => Number(b.dayAt || 0) - Number(a.dayAt || 0));

    const transportAttendanceRows = transportAttendanceSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<TransportAttendanceRow, "id">),
    }));

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
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<MembershipRow, "id">),
      })),
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل صفحة تسجيل حضور الحافلة");
  }, [error]);

  useEffect(() => {
    if (!data) return;

    setTransportEnrollmentId(data.transportEnrollments[0]?.id || "");
    setSchoolDayId(schoolDayIdFromQuery || data.schoolDays[0]?.id || "");
    setTripDirection(
      (tripDirectionFromQuery as (typeof TransportTripDirection.options)[number]) ||
        "MORNING_TO_SCHOOL"
    );
  }, [data, schoolDayIdFromQuery, tripDirectionFromQuery]);

  const selectedTransportEnrollment = useMemo(
    () =>
      (data?.transportEnrollments ?? []).find(
        (item) => item.id === transportEnrollmentId
      ) ?? null,
    [data?.transportEnrollments, transportEnrollmentId]
  );

  const selectedRouteTitle = useMemo(() => {
    if (!selectedTransportEnrollment) return "";
    const route = (data?.routes ?? []).find(
      (item) => item.id === selectedTransportEnrollment.routeId
    );
    return route?.title || selectedTransportEnrollment.routeId;
  }, [data?.routes, selectedTransportEnrollment]);

  const existingRow = useMemo(() => {
    return (data?.transportAttendanceRows ?? []).find(
      (item) =>
        item.transportEnrollmentId === transportEnrollmentId &&
        item.schoolDayId === schoolDayId &&
        item.tripDirection === tripDirection
    );
  }, [data?.transportAttendanceRows, transportEnrollmentId, schoolDayId, tripDirection]);

  useEffect(() => {
    if (!existingRow) {
      setStatus("BOARDED");
      setNote("");
      return;
    }

    setStatus(
      (existingRow.status as (typeof TransportAttendanceStatus.options)[number]) ||
        "BOARDED"
    );
    setNote(existingRow.note || "");
  }, [existingRow]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!data?.enrollment || !data.school || !data.academicYear) {
        throw new Error("لا يوجد قيد دراسي نشط للطالب.");
      }

      if (!selectedTransportEnrollment) {
        throw new Error("يجب اختيار اشتراك نقل صالح.");
      }

      if (!schoolDayId) {
        throw new Error("يجب اختيار اليوم الدراسي.");
      }

      const recorderMembership = pickRecorderMembership(
        data.memberships,
        user?.uid,
        data.enrollment.schoolId
      );

      if (!recorderMembership?.personId) {
        throw new Error("تعذر تحديد الشخص المسجِّل من العضوية الحالية.");
      }

      const recorderRoleKey = String(
        recorderMembership.roleKey || recorderMembership.role || ""
      );

      if (!recorderRoleKey) {
        throw new Error("تعذر تحديد roleKey للمسجّل الحالي.");
      }

      const nowMs = Date.now();
      const docId =
        existingRow?.id ||
        `transport-attendance-${studentId}-${schoolDayId}-${tripDirection}`;

      const payload = {
        id: docId,
        orgId,
        schoolId: data.enrollment.schoolId,
        academicYearId: data.enrollment.academicYearId,
        schoolDayId,

        studentId,
        enrollmentId: data.enrollment.id || "",
        transportEnrollmentId: selectedTransportEnrollment.id,
        routeId: selectedTransportEnrollment.routeId,

        tripDirection,
        status,

        recordedByPersonId: recorderMembership.personId,
        recorderRoleKey: recorderRoleKey as (typeof MembershipRole.options)[number],
        recordedAt: nowMs,
        note: note.trim(),
        createdAt: existingRow ? undefined : nowMs,
        updatedAt: nowMs,
      };

      const parsed = StudentTransportAttendanceRecordSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n")
        );
      }

      await setDoc(
        doc(db, `orgs/${orgId}/studentTransportAttendanceRecords/${docId}`),
        parsed.data,
        { merge: true }
      );

      toast.success(existingRow ? "تم تحديث سجل الحافلة" : "تم تسجيل حضور الحافلة");
      router.push(`/orgs/${orgId}/students/${studentId}/transport`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ سجل الحافلة");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="حضور الحافلة"
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
        badge="حضور الحافلة"
        badgeIcon={<Bus className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="إضافة أو تحديث سجل صعود/نزول الحافلة."
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
                  حفظ السجل
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="بيانات السجل"
        description="اختر الاشتراك واليوم الدراسي واتجاه الرحلة."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        {!data?.enrollment ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            لا يوجد قيد دراسي نشط للطالب.
          </div>
        ) : null}

        {(data?.transportEnrollments.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            لا يوجد اشتراك نقل لهذا الطالب. أنشئ الاشتراك أولًا.
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اشتراك النقل</label>
          <select
            value={transportEnrollmentId}
            onChange={(e) => setTransportEnrollmentId(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            disabled={(data?.transportEnrollments.length ?? 0) === 0}
          >
            <option value="">اختر</option>
            {(data?.transportEnrollments ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.routeId} — {item.direction} — {item.status}
              </option>
            ))}
          </select>
        </div>

        {selectedTransportEnrollment ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            الخط:{" "}
            <span className="font-medium text-foreground">{selectedRouteTitle}</span>
            {" "}— الاتجاه:{" "}
            <span className="font-medium text-foreground">
              {selectedTransportEnrollment.direction}
            </span>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">اليوم الدراسي</label>
            <select
              value={schoolDayId}
              onChange={(e) => setSchoolDayId(e.target.value)}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={(data?.transportEnrollments.length ?? 0) === 0}
            >
              <option value="">اختر</option>
              {(data?.schoolDays ?? []).map((day) => (
                <option key={day.id} value={day.id}>
                  {formatDate(day.dayAt)} — {day.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">اتجاه الرحلة</label>
            <select
              value={tripDirection}
              onChange={(e) =>
                setTripDirection(
                  e.target.value as (typeof TransportTripDirection.options)[number]
                )
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={(data?.transportEnrollments.length ?? 0) === 0}
            >
              {TransportTripDirection.options.map((item) => (
                <option key={item} value={item}>
                  {getTripDirectionLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {existingRow ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-primary">
            يوجد سجل سابق لهذا اليوم/الاتجاه وسيتم تحديثه عند الحفظ.
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">الحالة</label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(
                e.target.value as (typeof TransportAttendanceStatus.options)[number]
              )
            }
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            disabled={(data?.transportEnrollments.length ?? 0) === 0}
          >
            {TransportAttendanceStatus.options.map((item) => (
              <option key={item} value={item}>
                {getTransportAttendanceStatusLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملاحظة</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            disabled={(data?.transportEnrollments.length ?? 0) === 0}
          />
        </div>
      </FormSection>
    </div>
  );
}