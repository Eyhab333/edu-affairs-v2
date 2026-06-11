"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
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
  nationalId?: string;
  email?: string;
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

type GradeRow = {
  id: string;
  title: string;
};

type ClassRow = {
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
  streamId?: string;
  status?: string;
  startAt?: number;
  endAt?: number;
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

type AttendanceRow = {
  id: string;
  schoolDayId: string;
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  classId?: string;
  status: string;
  source?: string;
  recordedByPersonId: string;
  recorderRoleKey: string;
  recordedAt: number;
  lateMinutes?: number;
  note?: string;
};

type PageData = {
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  grade: GradeRow | null;
  classRow: ClassRow | null;
  enrollment: EnrollmentRow | null;
  schoolDays: SchoolDayRow[];
  attendanceRows: AttendanceRow[];
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

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
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
      return "غياب بعذر";
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

function getSchoolDayStatusLabel(status?: string) {
  switch (status) {
    case "PLANNED":
      return "مخطط";
    case "ACTIVE":
      return "نشط";
    case "CLOSED":
      return "مغلق";
    case "CANCELLED":
      return "ملغي";
    default:
      return status || "—";
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

function isAttendanceEnabled(school: SchoolRow | null) {
  return (school?.profile?.enabledModules ?? []).includes("ATTENDANCE");
}

export default function StudentAttendancePage() {
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

    const attendancePromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentAttendanceRecords`),
        where("studentId", "==", studentId)
      )
    );

    const [personSnap, enrollmentsSnap, attendanceSnap] = await Promise.all([
      personPromise,
      enrollmentsPromise,
      attendancePromise,
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
        grade: null,
        classRow: null,
        enrollment: null,
        schoolDays: [],
        attendanceRows: attendanceSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<AttendanceRow, "id">),
        })),
      };
    }

    const schoolPromise = getDoc(doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`));
    const academicYearPromise = getDoc(
      doc(
        db,
        `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`
      )
    );

    const gradePromise = enrollment.gradeId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/grades/${enrollment.gradeId}`
          )
        )
      : Promise.resolve(null);

    const classPromise = enrollment.classId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/classes/${enrollment.classId}`
          )
        )
      : Promise.resolve(null);

    const schoolDaysPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/schoolDays`),
        where("schoolId", "==", enrollment.schoolId)
      )
    );

    const [schoolSnap, academicYearSnap, gradeSnap, classSnap, schoolDaysSnap] =
      await Promise.all([
        schoolPromise,
        academicYearPromise,
        gradePromise,
        classPromise,
        schoolDaysPromise,
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

    const grade =
      gradeSnap && "exists" in gradeSnap && gradeSnap.exists()
        ? ({
            id: gradeSnap.id,
            title: (gradeSnap.data() as { title?: string }).title ?? gradeSnap.id,
          } as GradeRow)
        : null;

    const classRow =
      classSnap && "exists" in classSnap && classSnap.exists()
        ? ({
            id: classSnap.id,
            title: (classSnap.data() as { title?: string }).title ?? classSnap.id,
          } as ClassRow)
        : null;

    const schoolDays = schoolDaysSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolDayRow, "id">),
      }))
      .filter((row) => row.academicYearId === enrollment.academicYearId)
      .sort((a, b) => Number(b.dayAt || 0) - Number(a.dayAt || 0));

    const attendanceRows = attendanceSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AttendanceRow, "id">),
      }))
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));

    return {
      student,
      person,
      school,
      academicYear,
      grade,
      classRow,
      enrollment,
      schoolDays,
      attendanceRows,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل حضور الطالب");
  }, [error]);

  const dayMap = useMemo(
    () => new Map((data?.schoolDays ?? []).map((item) => [item.id, item])),
    [data?.schoolDays]
  );

  const rows = useMemo(() => {
    return (data?.attendanceRows ?? [])
      .map((row) => ({
        ...row,
        schoolDay: dayMap.get(row.schoolDayId) ?? null,
      }))
      .sort((a, b) => {
        const aDay = Number(a.schoolDay?.dayAt || 0);
        const bDay = Number(b.schoolDay?.dayAt || 0);
        if (bDay !== aDay) return bDay - aDay;
        return Number(b.recordedAt || 0) - Number(a.recordedAt || 0);
      });
  }, [data?.attendanceRows, dayMap]);

  const totalRecords = rows.length;
  const presentCount = rows.filter((row) =>
    ["PRESENT", "REMOTE_PRESENT"].includes(row.status)
  ).length;
  const absentCount = rows.filter((row) =>
    ["ABSENT", "EXCUSED_ABSENT", "REMOTE_ABSENT"].includes(row.status)
  ).length;
  const lateCount = rows.filter((row) => row.status === "LATE").length;

  const recordedDayIds = useMemo(
    () => new Set(rows.map((row) => row.schoolDayId)),
    [rows]
  );

  const missingRecentDays = useMemo(() => {
    return (data?.schoolDays ?? [])
      .filter((day) => !recordedDayIds.has(day.id))
      .filter((day) => !["HOLIDAY", "SUSPENDED"].includes(day.mode))
      .filter((day) => day.status !== "CANCELLED")
      .slice(0, 10);
  }, [data?.schoolDays, recordedDayIds]);

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="الحضور الدراسي"
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

  const attendanceEnabled = isAttendanceEnabled(data?.school ?? null);

  return (
    <div className="space-y-6">
      <PageHero
        badge="الحضور الدراسي"
        badgeIcon={<CalendarDays className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="سجل الحضور والغياب والتأخر للأيام الدراسية."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى ملف الطالب
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/attendance/new`}>
                <Plus className="h-4 w-4" />
                إضافة / تحديث حضور
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="إجمالي السجلات" value={totalRecords} hint="كل ما تم تسجيله للطالب" />
        <InfoCard label="الحضور" value={presentCount} hint="يشمل الحضور عن بعد" />
        <InfoCard label="الغياب" value={absentCount} hint="يشمل الغياب بعذر وعن بعد" />
        <InfoCard label="التأخر" value={lateCount} hint="عدد مرات التأخر" />
      </div>

      {!attendanceEnabled ? (
        <FormSection
          title="تنبيه"
          description="وحدة الحضور ليست مفعلة على المدرسة الحالية."
          contentClassName="space-y-3"
        >
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            المدرسة الحالية لا تحتوي على module باسم ATTENDANCE، لذلك المساحة هنا تعمل
            كمرحلة أولى، لكن الأفضل تفعيل الوحدة من إعدادات المدرسة.
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
        title="البيانات الحالية"
        description="ملخص ربط الطالب بالسنة والمدرسة والفصل الحالي."
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

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الصف / المستوى:{" "}
          <span className="font-medium text-foreground">
            {data?.grade?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الفصل:{" "}
          <span className="font-medium text-foreground">
            {data?.classRow?.title || "—"}
          </span>
        </div>
      </FormSection>

      <FormSection
        title="أيام حديثة بلا تسجيل حضور"
        description="أقرب أيام دراسية لم يتم تسجيل حضور لهذا الطالب فيها بعد."
        contentClassName="space-y-4"
      >
        {missingRecentDays.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد أيام حديثة ناقصة، أو لم تُنشأ أيام دراسية بعد.
          </div>
        ) : (
          <div className="grid gap-4">
            {missingRecentDays.map((day) => (
              <div key={day.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="font-semibold">{formatDate(day.dayAt)}</div>
                    <div className="text-sm text-muted-foreground">
                      النمط: {getSchoolDayModeLabel(day.mode)}
                      {" "}— الحالة: {getSchoolDayStatusLabel(day.status)}
                    </div>
                    {day.note ? (
                      <div className="text-sm text-muted-foreground">
                        الملاحظة: {day.note}
                      </div>
                    ) : null}
                  </div>

                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/orgs/${orgId}/students/${studentId}/attendance/new?schoolDayId=${day.id}`}
                    >
                      تسجيل الحضور
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="سجل الحضور"
        description="آخر السجلات المسجلة لهذا الطالب."
        contentClassName="space-y-4"
      >
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد سجلات حضور لهذا الطالب حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {formatDate(row.schoolDay?.dayAt)}
                      </h3>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {getAttendanceStatusLabel(row.status)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getSchoolDayModeLabel(row.schoolDay?.mode)}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div>
                        اليوم الدراسي:{" "}
                        <span className="font-medium text-foreground">
                          {row.schoolDay?.id || row.schoolDayId}
                        </span>
                      </div>

                      <div>
                        وقت التسجيل:{" "}
                        <span className="font-medium text-foreground">
                          {formatDateTime(row.recordedAt)}
                        </span>
                      </div>

                      <div>
                        المسجِّل:{" "}
                        <span className="font-medium text-foreground">
                          {row.recorderRoleKey || "—"}
                        </span>
                      </div>

                      {row.status === "LATE" ? (
                        <div>
                          دقائق التأخر:{" "}
                          <span className="font-medium text-foreground">
                            {row.lateMinutes ?? 0}
                          </span>
                        </div>
                      ) : null}

                      {row.note ? (
                        <div>
                          الملاحظة:{" "}
                          <span className="font-medium text-foreground">
                            {row.note}
                          </span>
                        </div>
                      ) : null}

                      {row.schoolDay?.note ? (
                        <div>
                          ملاحظة اليوم الدراسي:{" "}
                          <span className="font-medium text-foreground">
                            {row.schoolDay.note}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/students/${studentId}/attendance/new?schoolDayId=${row.schoolDayId}`}
                      >
                        تحديث السجل
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}