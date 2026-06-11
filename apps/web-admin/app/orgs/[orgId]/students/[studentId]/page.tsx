"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Bus,
  BusFront,
  CalendarDays,
  FileText,
  GraduationCap,
  Link2,
  Plus,
  Ruler,
  School,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { EnrollmentStatus, GuardianRelationType } from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type PersonRow = {
  id: string;
  displayName?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
};

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type GuardianRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type GuardianLinkRow = {
  id: string;
  orgId: string;
  studentId: string;
  guardianId: string;
  relationType: (typeof GuardianRelationType.options)[number];
  active?: boolean;
  startAt?: number;
  endAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type YearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type LabelRow = {
  id: string;
  title: string;
};

type EnrollmentRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
  status: (typeof EnrollmentStatus.options)[number];
  startAt: number;
  endAt?: number;
};

type GuardianListRow = GuardianRow & {
  displayName: string;
  nationalId: string;
  phone: string;
  email: string;
};

type StudentCaseRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  caseTypeId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  originKind: string;
  currentOwnerRoleKey: string;
  currentAssignedPersonId?: string;
  createdByPersonId: string;
  createdByRoleKey?: string;
  createdAt: number;
  latestNote?: string;
  guardianNotifiedOnCreate?: boolean;
  guardianNotifiedOnForward?: boolean;
  guardianNotifiedOnClose?: boolean;
  resolvedAt?: number;
  closedAt?: number;
  cancelledAt?: number;
};

type PageData = {
  student: StudentRow;
  person: PersonRow;
  schools: SchoolRow[];
  years: YearRow[];
  grades: LabelRow[];
  streams: LabelRow[];
  classes: LabelRow[];
  enrollments: EnrollmentRow[];
  guardians: GuardianListRow[];
  guardianLinks: GuardianLinkRow[];
  studentCases: StudentCaseRow[];
  people: PersonRow[];
};

function StudentPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
      <div className="h-[280px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA").format(new Date(timestamp));
}

function getEnrollmentStatusLabel(status?: string) {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "COMPLETED":
      return "مكتمل";
    case "REPEATING":
      return "إعادة";
    case "TRANSFERRED":
      return "منقول";
    case "WITHDRAWN":
      return "منسحب";
    case "SUSPENDED":
      return "موقوف";
    case "PENDING":
      return "معلّق";
    default:
      return status || "—";
  }
}

function getRelationLabel(relation?: string) {
  switch (relation) {
    case "FATHER":
      return "الأب";
    case "MOTHER":
      return "الأم";
    case "OTHER":
      return "أخرى";
    default:
      return relation || "—";
  }
}

function getCaseStatusLabel(status?: string) {
  switch (status) {
    case "OPEN":
      return "مفتوحة";
    case "IN_PROGRESS":
      return "قيد المعالجة";
    case "REFERRED":
      return "محوّلة";
    case "RESOLVED":
      return "محلولة";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status || "—";
  }
}

function getCasePriorityLabel(priority?: string) {
  switch (priority) {
    case "LOW":
      return "منخفضة";
    case "MEDIUM":
      return "متوسطة";
    case "HIGH":
      return "عالية";
    case "CRITICAL":
      return "حرجة";
    default:
      return priority || "—";
  }
}

export default function StudentProfilePage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const loadProfile = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const guardiansRef = collection(db, `orgs/${orgId}/guardians`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const guardianLinksRef = collection(db, `orgs/${orgId}/guardianLinks`);
    const studentCasesRef = collection(db, `orgs/${orgId}/studentCases`);

    const [
      studentSnap,
      schoolsSnap,
      guardiansSnap,
      peopleSnap,
      guardianLinksSnap,
      studentCasesSnap,
    ] = await Promise.all([
      getDoc(studentRef),
      getDocs(schoolsRef),
      getDocs(guardiansRef),
      getDocs(peopleRef),
      getDocs(guardianLinksRef),
      getDocs(studentCasesRef),
    ]);

    if (!studentSnap.exists()) {
      return null;
    }

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PersonRow, "id">),
    }));

    const peopleMap = new Map<string, PersonRow>();
    people.forEach((item) => {
      peopleMap.set(item.id, item);
    });

    const guardians = guardiansSnap.docs.map((item) => {
      const guardian = item.data() as GuardianRow;
      const person = peopleMap.get(guardian.personId);

      return {
        id: item.id,
        personId: guardian.personId,
        orgId: guardian.orgId,
        isArchived: !!guardian.isArchived,
        displayName: person?.displayName ?? item.id,
        nationalId: person?.nationalId ?? "",
        phone: person?.phone ?? "",
        email: person?.email ?? "",
      };
    });

    const person = peopleMap.get(student.personId) ?? {
      id: student.personId,
      displayName: student.personId,
      nationalId: "",
      phone: "",
      email: "",
    };

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(
          db,
          `orgs/${orgId}/schools/${school.id}/academicYears`,
        );
        const yearsSnap = await getDocs(yearsRef);

        return yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));
      }),
    );

    const years = yearsNested.flat();

    const labelsNested = await Promise.all(
      years.map(async (year) => {
        const gradesRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/grades`,
        );
        const streamsRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/streams`,
        );
        const classesRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/classes`,
        );

        const [gradesSnap, streamsSnap, classesSnap] = await Promise.all([
          getDocs(gradesRef),
          getDocs(streamsRef),
          getDocs(classesRef),
        ]);

        return {
          grades: gradesSnap.docs.map((item) => ({
            id: item.id,
            title: (item.data() as { title?: string }).title ?? item.id,
          })),
          streams: streamsSnap.docs.map((item) => ({
            id: item.id,
            title: (item.data() as { title?: string }).title ?? item.id,
          })),
          classes: classesSnap.docs.map((item) => ({
            id: item.id,
            title: (item.data() as { title?: string }).title ?? item.id,
          })),
        };
      }),
    );

    const grades = labelsNested.flatMap((item) => item.grades);
    const streams = labelsNested.flatMap((item) => item.streams);
    const classes = labelsNested.flatMap((item) => item.classes);

    const enrollmentSnaps = await Promise.all(
      years.map(async (year) => {
        const enrollmentsRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/studentEnrollments`,
        );

        return getDocs(
          query(
            enrollmentsRef,
            where("studentId", "==", studentId),
            where("orgId", "==", orgId),
          ),
        );
      }),
    );

    const enrollments = enrollmentSnaps
      .flatMap((snap) =>
        snap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EnrollmentRow, "id">),
        })),
      )
      .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));

    const guardianLinks = guardianLinksSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<GuardianLinkRow, "id">),
      }))
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));

    const studentCases = studentCasesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StudentCaseRow, "id">),
      }))
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return {
      student,
      person,
      schools,
      years,
      grades,
      streams,
      classes,
      enrollments,
      guardians,
      guardianLinks,
      studentCases,
      people,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadProfile,
      deps: [orgId, studentId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل ملف الطالب");
    }
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools],
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years],
  );
  const gradeMap = useMemo(
    () => new Map((data?.grades ?? []).map((item) => [item.id, item.title])),
    [data?.grades],
  );
  const streamMap = useMemo(
    () => new Map((data?.streams ?? []).map((item) => [item.id, item.title])),
    [data?.streams],
  );
  const classMap = useMemo(
    () => new Map((data?.classes ?? []).map((item) => [item.id, item.title])),
    [data?.classes],
  );
  const guardianMap = useMemo(
    () => new Map((data?.guardians ?? []).map((item) => [item.id, item])),
    [data?.guardians],
  );
  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item])),
    [data?.people],
  );

  const totalEnrollments = data?.enrollments.length ?? 0;
  const activeEnrollments =
    data?.enrollments.filter((item) => item.status === "ACTIVE").length ?? 0;

  const totalGuardianLinks = data?.guardianLinks.length ?? 0;
  const activeGuardianLinks =
    data?.guardianLinks.filter((item) => item.active !== false).length ?? 0;

  const totalCases = data?.studentCases.length ?? 0;
  const openCases =
    data?.studentCases.filter((item) =>
      ["OPEN", "IN_PROGRESS", "REFERRED"].includes(item.status),
    ).length ?? 0;
  const criticalCases =
    data?.studentCases.filter((item) => item.priority === "CRITICAL").length ??
    0;
  const latestCases = (data?.studentCases ?? []).slice(0, 5);

  const currentOwners = useMemo(() => {
    const openRows = (data?.studentCases ?? []).filter((item) =>
      ["OPEN", "IN_PROGRESS", "REFERRED"].includes(item.status),
    );

    const seen = new Set<string>();
    const result: Array<{
      type: "person" | "role";
      id: string;
      label: string;
    }> = [];

    for (const item of openRows) {
      if (item.currentAssignedPersonId) {
        const person = peopleMap.get(item.currentAssignedPersonId);
        const key = `person:${item.currentAssignedPersonId}`;

        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            type: "person",
            id: item.currentAssignedPersonId,
            label: person?.displayName ?? item.currentAssignedPersonId,
          });
        }
      } else if (item.currentOwnerRoleKey) {
        const key = `role:${item.currentOwnerRoleKey}`;

        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            type: "role",
            id: item.currentOwnerRoleKey,
            label: item.currentOwnerRoleKey,
          });
        }
      }
    }

    return result;
  }, [data?.studentCases, peopleMap]);

  if (checkingAuth || loading) {
    return <StudentPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="ملف الطالب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد يكون الطالب غير موجود داخل المؤسسة الحالية."
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
        badge="ملف الطالب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={data?.person.displayName ?? "الطالب"}
        description="عرض بيانات الطالب الأساسية وقيوده الدراسية وروابط أولياء الأمور."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/students/${studentId}/attendance`}>
                <CalendarDays className="h-4 w-4" />
                الحضور الدراسي
              </Link>
            </Button>

            <Button asChild variant="outline" size="sm">
              <Link href={`/orgs/${orgId}/students/${studentId}/transport`}>
                <Bus className="h-4 w-4" />
                الباص والنقل
              </Link>
            </Button>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/students/${studentId}/enrollments/new`}
              >
                <Plus className="h-4 w-4" />
                إضافة قيد
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/guardians/new`}>
                <Plus className="h-4 w-4" />
                ربط ولي أمر
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="إجمالي القيود"
          value={totalEnrollments}
          hint="كل القيود المرتبطة بالطالب"
        />
        <InfoCard
          label="القيود النشطة"
          value={activeEnrollments}
          hint="القيود الحالية"
        />
        <InfoCard
          label="روابط أولياء الأمور"
          value={totalGuardianLinks}
          hint={`النشطة: ${activeGuardianLinks}`}
        />
        <InfoCard
          label="السجل المدني"
          value={data?.person.nationalId || "—"}
          hint="من بيانات الشخص المرتبط"
        />
      </div>

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
        title="البيانات الأساسية"
        description="الهوية الأساسية للطالب داخل المؤسسة."
        contentClassName="space-y-4"
      >
        <div className="rounded-2xl border bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <UserRound className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="text-base font-semibold">
                {data?.person.displayName ?? "—"}
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {data?.person.nationalId ? (
                  <span>السجل المدني: {data.person.nationalId}</span>
                ) : null}
                {data?.person.phone ? (
                  <span>الهاتف: {data.person.phone}</span>
                ) : null}
                {data?.person.email ? (
                  <span>البريد: {data.person.email}</span>
                ) : null}
                {data?.student.isArchived ? (
                  <span>الحالة: مؤرشف</span>
                ) : (
                  <span>الحالة: نشط</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </FormSection>

      

      <FormSection
        title="مساحات الطالب"
        description="بوابة واضحة إلى الوحدات القادمة داخل ملف الطالب."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <ShieldAlert className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="font-medium">القضايا والسجل السلوكي</div>
              <div className="text-sm text-muted-foreground">
                إحالات الطالب، المخالفات، التعهدات، ومسار القضية.
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href={`/orgs/${orgId}/students/${studentId}/cases`}>
                  فتح المساحة
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <CalendarDays className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="font-medium">الحضور الدراسي</div>
              <div className="text-sm text-muted-foreground">
                حضور وغياب وتأخر الطالب في الأيام الدراسية.
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href={`/orgs/${orgId}/students/${studentId}/attendance`}>
                  فتح المساحة
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <BusFront className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="font-medium">الباص والنقل</div>
              <div className="text-sm text-muted-foreground">
                اشتراك الباص، النقل المدرسي، والحضور في الحافلة.
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href={`/orgs/${orgId}/students/${studentId}/transport`}>
                  فتح المساحة
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Ruler className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="font-medium">القياسات والمتابعات</div>
              <div className="text-sm text-muted-foreground">
                قياسات الروضة والابتدائي والمتابعات الأكاديمية.
              </div>

              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/orgs/${orgId}/students/${studentId}/measurements`}
                >
                  فتح المساحة
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <FileText className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <div className="font-medium">الملاحظات</div>
              <div className="text-sm text-muted-foreground">
                ملاحظات تربوية وتعليمية وإدارية مرتبطة بالطالب.
              </div>

              <Button asChild variant="outline" size="sm">
                <Link href={`/orgs/${orgId}/students/${studentId}/notes`}>
                  فتح المساحة
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="روابط أولياء الأمور"
        description="أولياء الأمور المرتبطون بهذا الطالب."
        contentClassName="space-y-4"
      >
        {totalGuardianLinks === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد روابط حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                ابدأ بربط أول ولي أمر مع هذا الطالب.
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/guardians/new`}>
                <Plus className="h-4 w-4" />
                ربط ولي أمر
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.guardianLinks ?? []).map((link) => {
              const guardian = guardianMap.get(link.guardianId);

              return (
                <div key={link.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {getRelationLabel(link.relationType)}
                        </span>

                        {link.active === false ? (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            غير نشط
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                            نشط
                          </span>
                        )}
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          ولي الأمر:{" "}
                          <span className="font-medium text-foreground">
                            {guardian?.displayName ?? link.guardianId}
                          </span>
                        </div>

                        {guardian?.nationalId ? (
                          <div>
                            السجل المدني:{" "}
                            <span className="font-medium text-foreground">
                              {guardian.nationalId}
                            </span>
                          </div>
                        ) : null}

                        {guardian?.phone ? (
                          <div>
                            الهاتف:{" "}
                            <span className="font-medium text-foreground">
                              {guardian.phone}
                            </span>
                          </div>
                        ) : null}

                        <div>
                          البداية:{" "}
                          <span className="font-medium text-foreground">
                            {formatDate(link.startAt)}
                          </span>
                        </div>

                        {link.endAt ? (
                          <div>
                            النهاية:{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(link.endAt)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/orgs/${orgId}/guardians/${link.guardianId}`}
                        >
                          فتح ولي الأمر
                        </Link>
                      </Button>

                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/orgs/${orgId}/students/${studentId}/guardians/${link.id}`}
                        >
                          تعديل الرابط
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

      <FormSection
        title="القيود الدراسية"
        description="القيود الدراسية الحالية والسابقة لهذا الطالب."
        contentClassName="space-y-4"
      >
        {totalEnrollments === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد قيود دراسية حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                ابدأ بإضافة أول قيد دراسي لهذا الطالب.
              </p>
            </div>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/students/${studentId}/enrollments/new`}
              >
                <Plus className="h-4 w-4" />
                إضافة قيد
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.enrollments ?? []).map((enrollment) => (
              <div
                key={enrollment.id}
                className="rounded-2xl border bg-card p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {getEnrollmentStatusLabel(enrollment.status)}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        المدرسة:{" "}
                        <span className="font-medium text-foreground">
                          {schoolMap.get(enrollment.schoolId) ??
                            enrollment.schoolId}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <School className="h-4 w-4" />
                        السنة:{" "}
                        <span className="font-medium text-foreground">
                          {yearMap.get(enrollment.academicYearId) ??
                            enrollment.academicYearId}
                        </span>
                      </div>

                      {enrollment.gradeId ? (
                        <div className="inline-flex items-center gap-2">
                          <GraduationCap className="h-4 w-4" />
                          الصف/المستوى:{" "}
                          <span className="font-medium text-foreground">
                            {gradeMap.get(enrollment.gradeId) ??
                              enrollment.gradeId}
                          </span>
                        </div>
                      ) : null}

                      {enrollment.streamId ? (
                        <div>
                          المسار:{" "}
                          <span className="font-medium text-foreground">
                            {streamMap.get(enrollment.streamId) ??
                              enrollment.streamId}
                          </span>
                        </div>
                      ) : null}

                      {enrollment.classId ? (
                        <div>
                          الفصل:{" "}
                          <span className="font-medium text-foreground">
                            {classMap.get(enrollment.classId) ??
                              enrollment.classId}
                          </span>
                        </div>
                      ) : null}

                      <div>
                        البداية:{" "}
                        <span className="font-medium text-foreground">
                          {formatDate(enrollment.startAt)}
                        </span>
                      </div>

                      {enrollment.endAt ? (
                        <div>
                          النهاية:{" "}
                          <span className="font-medium text-foreground">
                            {formatDate(enrollment.endAt)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/students/${studentId}/enrollments/${enrollment.id}`}
                      >
                        تعديل القيد
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>


      <FormSection
        title="لوحة القضايا"
        description="ملخص سريع لحالة القضايا الحالية لهذا الطالب."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            label="إجمالي القضايا"
            value={totalCases}
            hint="كل القضايا المرتبطة بالطالب"
          />
          <InfoCard
            label="القضايا المفتوحة"
            value={openCases}
            hint="ما زالت قيد العمل"
          />
          <InfoCard
            label="القضايا الحرجة"
            value={criticalCases}
            hint="أولوية CRITICAL"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}/cases`}>
              <ShieldAlert className="h-4 w-4" />
              فتح كل القضايا
            </Link>
          </Button>

          <Button asChild>
            <Link href={`/orgs/${orgId}/students/${studentId}/cases/new`}>
              <Plus className="h-4 w-4" />
              إضافة قضية
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-3 text-sm font-medium">المالكون الحاليون</div>

          {currentOwners.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              لا توجد قضايا مفتوحة حاليًا، وبالتالي لا يوجد مالكون حاليون
              ظاهرون.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentOwners.map((owner) =>
                owner.type === "person" ? (
                  <Button
                    key={`${owner.type}:${owner.id}`}
                    asChild
                    variant="outline"
                    size="sm"
                  >
                    <Link href={`/orgs/${orgId}/people/${owner.id}`}>
                      {owner.label}
                    </Link>
                  </Button>
                ) : (
                  <span
                    key={`${owner.type}:${owner.id}`}
                    className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {owner.label}
                  </span>
                ),
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="mb-3 text-sm font-medium">آخر القضايا</div>

          {latestCases.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              لا توجد قضايا حتى الآن.
            </div>
          ) : (
            <div className="grid gap-3">
              {latestCases.map((item) => {
                const assignedPerson = item.currentAssignedPersonId
                  ? peopleMap.get(item.currentAssignedPersonId)
                  : null;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border bg-background px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/orgs/${orgId}/students/${studentId}/cases/${item.id}`}
                            className="font-medium hover:underline"
                          >
                            {item.title}
                          </Link>

                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                            {getCaseStatusLabel(item.status)}
                          </span>

                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            {getCasePriorityLabel(item.priority)}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground">
                          <div>
                            المالك الحالي:{" "}
                            {assignedPerson ? (
                              <Link
                                href={`/orgs/${orgId}/people/${assignedPerson.id}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {assignedPerson.displayName ??
                                  assignedPerson.id}
                              </Link>
                            ) : (
                              <span className="font-medium text-foreground">
                                {item.currentOwnerRoleKey || "—"}
                              </span>
                            )}
                          </div>

                          <div>
                            آخر ملخص:{" "}
                            <span className="font-medium text-foreground">
                              {item.latestNote || "—"}
                            </span>
                          </div>

                          <div>
                            تاريخ الإنشاء:{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(item.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/orgs/${orgId}/students/${studentId}/cases/${item.id}`}
                          >
                            فتح القضية
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </FormSection>
    </div>
  );
}
