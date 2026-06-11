"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  MembershipRole,
  StudentAttendanceRecordSchema,
  StudentAttendanceStatus,
} from "@takween/contracts";
import { ArrowLeft, CalendarDays, Loader2, Save } from "lucide-react";
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
  gradeId?: string;
  classId?: string;
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

type SchoolDayRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  dayAt: number;
  mode: string;
  status: string;
  note?: string;
};

type ExistingAttendanceRow = {
  id: string;
  schoolDayId: string;
  studentId: string;
  status: string;
  lateMinutes?: number;
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
  schoolDays: SchoolDayRow[];
  existingRows: ExistingAttendanceRow[];
  memberships: MembershipRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-[720px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function getAttendanceStatusLabel(status?: string) {
  switch (status) {
    case "PRESENT":
      return "حاضر";
    case "ABSENT":
      return "غائب";
    case "LATE":
      return "متأخر";
    case "EXCUSED_ABSENT":
      return "غائب بعذر";
    case "REMOTE_PRESENT":
      return "حاضر عن بعد";
    case "REMOTE_ABSENT":
      return "غائب عن بعد";
    default:
      return status || "—";
  }
}

function getSchoolDayModeLabel(mode?: string) {
  switch (mode) {
    case "ON_SITE":
      return "حضوري";
    case "REMOTE":
      return "عن بعد";
    case "SUSPENDED":
      return "معلّق";
    case "HOLIDAY":
      return "إجازة";
    default:
      return mode || "—";
  }
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
  schoolId: string,
) {
  if (!uid) return null;

  const rows = memberships.filter(
    (item) => item.uid === uid && item.isActive !== false,
  );

  return (
    rows.find((item) => membershipMatchesSchool(item, schoolId)) ??
    rows.find((item) => String(item.scopeType || "") === "ORG") ??
    rows[0] ??
    null
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewStudentAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const schoolDayIdFromQuery = searchParams.get("schoolDayId") || "";

  const { user, checkingAuth } = useRequireAuth();

  const [schoolDayId, setSchoolDayId] = useState("");
  const [status, setStatus] =
    useState<(typeof StudentAttendanceStatus.options)[number]>("PRESENT");
  const [lateMinutes, setLateMinutes] = useState("0");
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
        where("studentId", "==", studentId),
      ),
    );

    const membershipsPromise = getDocs(
      query(collection(db, `orgs/${orgId}/memberships`)),
    );

    const [personSnap, enrollmentsSnap, membershipsSnap] = await Promise.all([
      personPromise,
      enrollmentsPromise,
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

    if (!enrollment) {
      return {
        student,
        person,
        school: null,
        academicYear: null,
        enrollment: null,
        schoolDays: [],
        existingRows: [],
        memberships: membershipsSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<MembershipRow, "id">),
        })),
      };
    }

    const [schoolSnap, academicYearSnap, schoolDaysSnap, attendanceSnap] =
      await Promise.all([
        getDoc(doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`)),
        getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`,
          ),
        ),
        getDocs(
          query(
            collection(db, `orgs/${orgId}/schoolDays`),
            where("schoolId", "==", enrollment.schoolId),
          ),
        ),
        getDocs(
          query(
            collection(db, `orgs/${orgId}/studentAttendanceRecords`),
            where("studentId", "==", studentId),
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

    const schoolDays = schoolDaysSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolDayRow, "id">),
      }))
      .filter((item) => item.academicYearId === enrollment.academicYearId)
      .filter((item) => item.status !== "CANCELLED")
      .sort((a, b) => Number(b.dayAt || 0) - Number(a.dayAt || 0));

    const existingRows = attendanceSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<ExistingAttendanceRow, "id">),
    }));

    return {
      student,
      person,
      school,
      academicYear,
      enrollment,
      schoolDays,
      existingRows,
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
    if (error) toast.error("تعذر تحميل صفحة تسجيل الحضور");
  }, [error]);

  useEffect(() => {
    if (!data) return;

    const initialSchoolDayId =
      schoolDayIdFromQuery || data.schoolDays[0]?.id || "";

    setSchoolDayId(initialSchoolDayId);

    const existing = data.existingRows.find(
      (item) => item.schoolDayId === initialSchoolDayId,
    );

    if (existing) {
      setStatus(
        (existing.status as (typeof StudentAttendanceStatus.options)[number]) ||
          "PRESENT",
      );
      setLateMinutes(String(existing.lateMinutes ?? 0));
      setNote(existing.note || "");
    } else {
      setStatus("PRESENT");
      setLateMinutes("0");
      setNote("");
    }
  }, [data, schoolDayIdFromQuery]);

  const selectedDay = useMemo(
    () =>
      (data?.schoolDays ?? []).find((item) => item.id === schoolDayId) ?? null,
    [data?.schoolDays, schoolDayId],
  );

  const existingRow = useMemo(
    () =>
      (data?.existingRows ?? []).find(
        (item) => item.schoolDayId === schoolDayId,
      ) ?? null,
    [data?.existingRows, schoolDayId],
  );

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!data?.enrollment || !data.school || !data.academicYear) {
        throw new Error("لا يوجد قيد دراسي نشط للطالب.");
      }

      if (!schoolDayId) {
        throw new Error("يجب اختيار اليوم الدراسي.");
      }

      const recorderMembership = pickRecorderMembership(
        data.memberships,
        user?.uid,
        data.enrollment.schoolId,
      );

      if (!recorderMembership?.personId) {
        throw new Error("تعذر تحديد الشخص المسجِّل من العضوية الحالية.");
      }

      const recorderRoleKey = String(
        recorderMembership.roleKey || recorderMembership.role || "",
      );

      if (!recorderRoleKey) {
        throw new Error("تعذر تحديد roleKey للمسجِّل الحالي.");
      }

      const nowMs = Date.now();
      const docId = existingRow?.id || `attendance-${studentId}-${schoolDayId}`;

      const payload = {
        id: docId,
        orgId,
        schoolId: data.enrollment.schoolId,
        academicYearId: data.enrollment.academicYearId,
        schoolDayId,

        studentId,
        enrollmentId: data.enrollment.id || "",
        gradeId: data.enrollment.gradeId || "",
        classId: data.enrollment.classId || "",

        status,
        source: "MANUAL",
        recordedByPersonId: recorderMembership.personId,
        recorderRoleKey:
          recorderRoleKey as (typeof MembershipRole.options)[number],
        recordedAt: nowMs,
        lateMinutes: status === "LATE" ? Number(lateMinutes || 0) : 0,
        note: note.trim(),
        updatedAt: nowMs,
        ...(existingRow ? {} : { createdAt: nowMs }),
      };

      const parsed = StudentAttendanceRecordSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n"),
        );
      }

      await setDoc(
        doc(db, `orgs/${orgId}/studentAttendanceRecords/${docId}`),
        parsed.data,
        { merge: true },
      );

      toast.success(
        existingRow ? "تم تحديث سجل الحضور" : "تم تسجيل الحضور بنجاح",
      );
      router.push(`/orgs/${orgId}/students/${studentId}/attendance`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ سجل الحضور");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="تسجيل حضور"
        badgeIcon={<CalendarDays className="h-3.5 w-3.5" />}
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
        badge="تسجيل حضور"
        badgeIcon={<CalendarDays className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="إضافة أو تحديث سجل الحضور لهذا الطالب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}/attendance`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى الحضور
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
        title="معلومات الطالب الحالية"
        description="مرجع سريع قبل تسجيل الحضور."
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
        title="بيانات السجل"
        description="اختر اليوم الدراسي وحدد حالة الطالب."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        {!data?.enrollment ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            لا يوجد قيد دراسي نشط للطالب، لذلك لا يمكن تسجيل حضور الآن.
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اليوم الدراسي</label>
          <select
            value={schoolDayId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSchoolDayId(nextId);

              const existing = (data?.existingRows ?? []).find(
                (item) => item.schoolDayId === nextId,
              );

              if (existing) {
                setStatus(
                  (existing.status as (typeof StudentAttendanceStatus.options)[number]) ||
                    "PRESENT",
                );
                setLateMinutes(String(existing.lateMinutes ?? 0));
                setNote(existing.note || "");
              } else {
                setStatus("PRESENT");
                setLateMinutes("0");
                setNote("");
              }
            }}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            disabled={!data?.enrollment}
          >
            <option value="">اختر</option>
            {(data?.schoolDays ?? []).map((day) => (
              <option key={day.id} value={day.id}>
                {formatDate(day.dayAt)} — {getSchoolDayModeLabel(day.mode)} —{" "}
                {day.id}
              </option>
            ))}
          </select>
        </div>

        {selectedDay ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            <div>
              التاريخ:{" "}
              <span className="font-medium text-foreground">
                {formatDate(selectedDay.dayAt)}
              </span>
            </div>
            <div>
              النمط:{" "}
              <span className="font-medium text-foreground">
                {getSchoolDayModeLabel(selectedDay.mode)}
              </span>{" "}
              — الحالة:{" "}
              <span className="font-medium text-foreground">
                {selectedDay.status}
              </span>
            </div>
            {selectedDay.note ? (
              <div>
                ملاحظة اليوم:{" "}
                <span className="font-medium text-foreground">
                  {selectedDay.note}
                </span>
              </div>
            ) : null}
            {existingRow ? (
              <div className="mt-2 text-primary">
                يوجد سجل سابق لهذا اليوم، وسيتم تحديثه عند الحفظ.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target
                    .value as (typeof StudentAttendanceStatus.options)[number],
                )
              }
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={!data?.enrollment}
            >
              {StudentAttendanceStatus.options.map((item) => (
                <option key={item} value={item}>
                  {getAttendanceStatusLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">دقائق التأخر</label>
            <Input
              type="number"
              min={0}
              value={lateMinutes}
              onChange={(e) => setLateMinutes(e.target.value)}
              disabled={!data?.enrollment || status !== "LATE"}
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
