"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildAssignmentPersonOptions,
  type AssignmentPersonRow,
  type OperationalMembershipRow,
  type SchoolTrackValue,
  type SchoolTypeValue,
} from "@/lib/assignment-people";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: SchoolTypeValue;
    track?: SchoolTrackValue;
  };
};

type AcademicYearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type PersonRow = AssignmentPersonRow & {
  email?: string;
  nationalId?: string;
  phone?: string;
};

type MembershipRow = OperationalMembershipRow & {
  orgId?: string;
  createdAt?: number;
  updatedAt?: number;
};

type AssignmentRow = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  teacherPersonId: string;
  supervisorPersonId?: string;
  assignmentKind?: string;
  targetScopeType?: string;
  targetScopeId?: string;
  coverageMode?: string;
  subjectKey?: string;
  subjectId?: string;
  gradeId?: string;
  streamId?: string;
  isHomeroom?: boolean;
  roleInAssignment?: string;
  status?: string;
  note?: string;
  startAt?: number;
  endAt?: number;
};

type PageData = {
  org: {
    id: string;
    nameAr?: string;
    nameEn?: string;
    shortName?: string;
  };
  person: PersonRow;
  schools: SchoolRow[];
  years: AcademicYearRow[];
  people: AssignmentPersonRow[];
  memberships: MembershipRow[];
  assignments: AssignmentRow[];
};

function PersonPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[260px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getOrgDisplayName(org: PageData["org"] | null | undefined, fallback: string) {
  return org?.nameAr ?? org?.shortName ?? org?.nameEn ?? fallback;
}

function getSchoolTypeLabel(type?: SchoolTypeValue) {
  if (type === "PRIMARY") return "ابتدائي";
  if (type === "KG") return "روضة";
  return "—";
}

function getTrackLabel(track?: SchoolTrackValue) {
  if (track === "BOYS") return "بنين";
  if (track === "GIRLS") return "بنات";
  if (track === "MIXED") return "مختلط";
  return "—";
}

function normalizeRoleKey(row: MembershipRow): string {
  return String(row.roleKey || row.role || "").trim();
}

function membershipMatchesSchool(row: MembershipRow, schoolId: string) {
  const scopeType = String(row.scopeType || "").trim();
  const scopeId = String(row.scopeId || "").trim();
  const schoolIds = Array.isArray(row.scopes?.schoolIds) ? row.scopes?.schoolIds : [];

  if (row.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

function getRoleLabel(role: string) {
  switch (role) {
    case "platform_owner":
      return "مالك المنصة";
    case "platform_admin":
      return "مدير المنصة";
    case "org_owner":
      return "مالك المؤسسة";
    case "org_admin":
      return "مدير المؤسسة";
    case "school_admin":
      return "إداري مدرسة";
    case "school_manager":
      return "مشرف مدرسة";
    case "staff":
      return "موظف";
    case "teacher":
      return "معلم";

    case "ORG_SUPERVISION_HEAD":
      return "رئيس الإشراف";

    case "ADMIN_SUPERVISOR":
      return "مشرف/ة إداري/ة";
    case "ADMIN_ASSISTANT":
      return "مساعد/ة إداري/ة";
    case "MEDIA_SPECIALIST":
      return "إعلامي/ة";
    case "HR_SPECIALIST":
      return "موارد بشرية";
    case "ACTIVITY_COORD":
      return "رائد/ة نشاط";
    case "SCHOOL_MONITOR":
      return "مراقب/ة";

    case "BOYS_PRINCIPAL":
      return "مدير بنين";
    case "BOYS_EDU_VP":
      return "وكيل تعليمي - بنين";
    case "BOYS_STUDENT_GUIDE":
      return "موجه طلابي - بنين";
    case "BOYS_STUDENTS_VP":
      return "وكيل شؤون الطلاب - بنين";
    case "BOYS_TEACHERS_VP":
      return "وكيل شؤون المعلمين - بنين";
    case "BOYS_EDU_SUPERVISOR":
      return "مشرف تعليمي - بنين";
    case "BOYS_TEACHER":
      return "معلم - بنين";

    case "GIRLS_PRINCIPAL":
      return "مديرة";
    case "GIRLS_VP":
      return "وكيلة";
    case "GIRLS_STUDENT_COUNSELOR":
      return "موجهة طلابية";
    case "GIRLS_EDU_SUPERVISOR":
      return "مشرفة تعليمية";
    case "GIRLS_TEACHER":
      return "معلمة";

    case "KG_PRINCIPAL":
      return "مديرة روضة";
    case "KG_VP":
      return "وكيلة روضة";
    case "KG_EDU_SUPERVISOR":
      return "مشرفة تعليمية - روضات";
    case "KG_VALUES_COORD":
      return "منسقة قيم";
    case "KG_TEACHER":
      return "معلمة روضة";

    case "BUS_SUPERVISOR":
      return "مشرف/ة حافلة";

    default:
      return role || "بدون دور";
  }
}

function getScopeLabel(
  membership: MembershipRow,
  schoolMap: Map<string, SchoolRow>
) {
  const scopeType = String(membership.scopeType || "").trim();
  const scopeId = String(membership.scopeId || "").trim();

  if (scopeType === "ORG" || !scopeType) return "مستوى المؤسسة";

  if (scopeType === "SCHOOL") {
    const school = schoolMap.get(scopeId);
    return school ? school.name : `مدرسة: ${scopeId}`;
  }

  if (scopeType === "GRADE") return `صف/مستوى: ${scopeId}`;
  if (scopeType === "CLASS") return `فصل: ${scopeId}`;
  if (scopeType === "STREAM") return `مسار: ${scopeId}`;

  return `${scopeType}: ${scopeId || "—"}`;
}

function getMembershipSchoolId(membership: MembershipRow): string | null {
  const scopeType = String(membership.scopeType || "").trim();
  const scopeId = String(membership.scopeId || "").trim();

  if (scopeType === "SCHOOL" && scopeId) {
    return scopeId;
  }

  const schoolIds = Array.isArray(membership.scopes?.schoolIds)
    ? membership.scopes.schoolIds
    : [];

  if (schoolIds.length === 1) {
    return schoolIds[0];
  }

  return null;
}

function getAssignmentKindLabel(kind?: string) {
  switch (kind) {
    case "CLASS_TEACHER":
      return "معلم/ـة فصل";
    case "SUBJECT_TEACHER":
      return "معلم/ـة مادة";
    case "VALUES_TEACHER":
      return "معلم/ـة قيم";
    case "CORNERS_TEACHER":
      return "معلم/ـة أركان";
    case "QURAN_TEACHER":
      return "معلم/ـة قرآن";
    case "SUPPORT_TEACHER":
      return "معلم/ـة دعم";
    case "ACTIVITY_TEACHER":
      return "معلم/ـة نشاط";
    case "CUSTOM":
      return "إسناد مخصص";
    default:
      return kind || "—";
  }
}

function getAssignmentStatusLabel(status?: string) {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "PENDING":
      return "معلّق";
    case "ENDED":
      return "منتهٍ";
    default:
      return status || "—";
  }
}

function getAssignmentScopeLabel(
  assignment: AssignmentRow,
  schoolMap: Map<string, SchoolRow>,
  yearMap: Map<string, AcademicYearRow>
) {
  const scopeType = String(assignment.targetScopeType || "").trim();
  const scopeId = String(assignment.targetScopeId || "").trim();

  if (scopeType === "SCHOOL") {
    const school = schoolMap.get(scopeId || assignment.schoolId || "");
    return school?.name ?? scopeId ?? "المدرسة";
  }

  if (scopeType === "GRADE") return `صف/مستوى: ${scopeId}`;
  if (scopeType === "CLASS") return `فصل: ${scopeId}`;
  if (scopeType === "STREAM") return `مسار: ${scopeId}`;

  const year = yearMap.get(assignment.academicYearId || "");
  return year?.title ?? scopeId ?? "—";
}

export default function OrgPersonPage() {
  const params = useParams<{ orgId: string; personId: string }>();
  const orgId = params.orgId;
  const personId = params.personId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const orgRef = doc(db, `orgs/${orgId}`);
    const personRef = doc(db, `orgs/${orgId}/people/${personId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);

    const [orgSnap, personSnap, schoolsSnap, peopleSnap, membershipsSnap] = await Promise.all([
      getDoc(orgRef),
      getDoc(personRef),
      getDocs(query(schoolsRef, orderBy("name", "asc"))),
      getDocs(query(peopleRef, orderBy("displayName", "asc"))),
      getDocs(membershipsRef),
    ]);

    if (!orgSnap.exists() || !personSnap.exists()) {
      return null;
    }

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(db, `orgs/${orgId}/schools/${school.id}/academicYears`);
        const yearsSnap = await getDocs(yearsRef);

        return yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));
      })
    );

    const years = yearsNested.flat();

    const assignmentsNested = await Promise.all(
      years.map(async (year) => {
        const assignmentsRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/teacherAssignments`
        );
        const assignmentsSnap = await getDocs(query(assignmentsRef, orderBy("startAt", "desc")));

        return assignmentsSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<AssignmentRow, "id">),
        }));
      })
    );

    return {
      org: {
        id: orgSnap.id,
        ...(orgSnap.data() as Omit<PageData["org"], "id">),
      },
      person: {
        id: personSnap.id,
        ...((personSnap.data() as Omit<PersonRow, "id">) || {}),
      },
      schools,
      years,
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        displayName:
          (item.data() as { displayName?: string }).displayName ?? item.id,
      })),
      memberships: membershipsSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<MembershipRow, "id">),
        }))
        .filter((item) => item.personId === personId),
      assignments: assignmentsNested.flat(),
    };
  }, [orgId, personId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, personId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل بيانات الشخص");
    }
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item])),
    [data?.schools]
  );

  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item])),
    [data?.years]
  );

  const roleKeys = useMemo(() => {
    const values = new Set<string>();
    for (const item of data?.memberships ?? []) {
      const role = normalizeRoleKey(item);
      if (role) values.add(role);
    }
    return Array.from(values).sort((a, b) => getRoleLabel(a).localeCompare(getRoleLabel(b), "ar"));
  }, [data?.memberships]);

  const schoolEligibility = useMemo(() => {
    return (data?.schools ?? []).map((school) => {
      const { teacherOptions, supervisorOptions } = buildAssignmentPersonOptions({
        people: data?.people ?? [],
        memberships: data?.memberships ?? [],
        schoolType: school.profile?.schoolType ?? "PRIMARY",
        schoolTrack: school.profile?.track,
        schoolId: school.id,
      });

      return {
        school,
        isTeacherEligible: teacherOptions.some((item) => item.id === personId),
        isSupervisorEligible: supervisorOptions.some((item) => item.id === personId),
        matchingMemberships: (data?.memberships ?? []).filter((item) =>
          membershipMatchesSchool(item, school.id)
        ),
      };
    });
  }, [data?.schools, data?.people, data?.memberships, personId]);

  const relatedAssignments = useMemo(() => {
    return (data?.assignments ?? [])
      .filter(
        (item) =>
          item.teacherPersonId === personId || item.supervisorPersonId === personId
      )
      .map((item) => ({
        ...item,
        isTeacher: item.teacherPersonId === personId,
        isSupervisor: item.supervisorPersonId === personId,
      }))
      .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));
  }, [data?.assignments, personId]);

  const activeMemberships = (data?.memberships ?? []).filter((item) => item.isActive !== false).length;
  const teacherEligibleCount = schoolEligibility.filter((item) => item.isTeacherEligible).length;
  const supervisorEligibleCount = schoolEligibility.filter((item) => item.isSupervisorEligible).length;

  if (checkingAuth || loading) {
    return <PersonPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="الشخص"
        badgeIcon={<UserRound className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المؤسسة أو الشخص غير موجود."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/people`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى دليل الأشخاص
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="الشخص"
        badgeIcon={<UserRound className="h-3.5 w-3.5" />}
        title={data?.person.displayName ?? "الشخص"}
        description={`ملف الشخص داخل ${getOrgDisplayName(data?.org, orgId)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/people`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى دليل الأشخاص
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/people/${personId}/memberships/new`}>
                <Plus className="h-4 w-4" />
                إضافة عضوية
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="عدد العضويات"
          value={data?.memberships.length ?? 0}
          hint={`النشطة: ${activeMemberships}`}
        />
        <InfoCard
          label="الأدوار المختلفة"
          value={roleKeys.length}
          hint="بحسب العضويات التشغيلية"
        />
        <InfoCard
          label="صالح كمعلم/ـة"
          value={teacherEligibleCount}
          hint="عدد المدارس التي يظهر فيها ضمن قوائم المعلمين"
        />
        <InfoCard
          label="صالح كمشرف"
          value={supervisorEligibleCount}
          hint="عدد المدارس التي يظهر فيها ضمن قوائم المشرفين"
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
          <div>
            <Button variant="outline" onClick={() => void reload()}>
              إعادة المحاولة
            </Button>
          </div>
        </FormSection>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <FormSection
          title="البيانات الأساسية"
          description="معلومات الشخص الأساسية داخل المؤسسة."
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
                  {data?.person.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {data.person.email}
                    </span>
                  ) : null}

                  {data?.person.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      {data.person.phone}
                    </span>
                  ) : null}

                  {data?.person.nationalId ? (
                    <span>السجل المدني: {data.person.nationalId}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card px-4 py-4">
            <div className="text-sm font-medium">الأدوار المستخلصة</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {roleKeys.length > 0 ? (
                roleKeys.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {getRoleLabel(item)}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">لا توجد أدوار مستخلصة</span>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection
          title="العضويات التشغيلية"
          description="كل العضويات الحالية لهذا الشخص داخل المؤسسة."
          contentClassName="space-y-3"
        >
          {(data?.memberships.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              لا توجد عضويات تشغيلية مسجلة لهذا الشخص.
            </div>
          ) : (
            (data?.memberships ?? []).map((membership) => {
              const roleKey = normalizeRoleKey(membership);

              return (
                <div key={membership.id} className="rounded-2xl border bg-card px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {getRoleLabel(roleKey)}
                        </span>

                        {membership.isActive === false ? (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            غير نشط
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            نشط
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {membership.title ? `${membership.title} — ` : ""}
                        {getScopeLabel(membership, schoolMap)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {getMembershipSchoolId(membership) ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/orgs/${orgId}/schools/${getMembershipSchoolId(membership)}`}>
                            <ExternalLink className="h-4 w-4" />
                            فتح المدرسة
                          </Link>
                        </Button>
                      ) : null}

                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/orgs/${orgId}/people/${personId}/memberships/${membership.id}`}
                        >
                          تعديل
                        </Link>
                      </Button>

                      <Button asChild variant="destructive" size="sm">
                        <Link
                          href={`/orgs/${orgId}/people/${personId}/memberships/${membership.id}/delete`}
                        >
                          حذف
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </FormSection>
      </div>

      <FormSection
        title="الإسنادات التعليمية المرتبطة"
        description="الإسنادات التي يظهر فيها هذا الشخص كمعلم/ـة أو كمشرف."
        contentClassName="space-y-4"
      >
        {relatedAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد إسنادات مرتبطة بهذا الشخص</p>
              <p className="text-sm text-muted-foreground">
                لم يتم العثور على إسنادات يظهر فيها هذا الشخص كمعلم أو كمشرف.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {relatedAssignments.map((assignment) => {
              const school = schoolMap.get(assignment.schoolId || "");
              const year = yearMap.get(assignment.academicYearId || "");

              return (
                <div key={assignment.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {getAssignmentKindLabel(assignment.assignmentKind)}
                        </span>

                        {assignment.isTeacher ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            <GraduationCap className="h-3.5 w-3.5" />
                            كمعلم/ـة
                          </span>
                        ) : null}

                        {assignment.isSupervisor ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            كمشرف
                          </span>
                        ) : null}

                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {getAssignmentStatusLabel(assignment.status)}
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <Link
                            href={`/orgs/${orgId}/schools/${assignment.schoolId}`}
                            className="hover:underline"
                          >
                            {school?.name ?? assignment.schoolId ?? "المدرسة"}
                          </Link>
                        </div>

                        <div className="inline-flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          المادة: {assignment.subjectKey || assignment.subjectId || "GENERAL"}
                        </div>

                        <div>
                          السنة الدراسية:{" "}
                          <span className="font-medium text-foreground">
                            {year?.title ?? assignment.academicYearId ?? "—"}
                          </span>
                        </div>

                        <div>
                          النطاق:{" "}
                          <span className="font-medium text-foreground">
                            {getAssignmentScopeLabel(assignment, schoolMap, yearMap)}
                          </span>
                        </div>

                        <div>
                          التغطية:{" "}
                          <span className="font-medium text-foreground">
                            {assignment.coverageMode === "ALL_CLASSES_IN_SCOPE"
                              ? "كل الفصول ضمن النطاق"
                              : "فصول محددة"}
                          </span>
                        </div>

                        {assignment.note ? (
                          <div className="rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6">
                            {assignment.note}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {assignment.schoolId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/orgs/${orgId}/schools/${assignment.schoolId}`}>
                            <ExternalLink className="h-4 w-4" />
                            فتح المدرسة
                          </Link>
                        </Button>
                      ) : null}

                      {assignment.schoolId && assignment.academicYearId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/orgs/${orgId}/schools/${assignment.schoolId}/years/${assignment.academicYearId}/assignments/${assignment.id}`}
                          >
                            فتح الإسناد
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="الأهلية للإسنادات التعليمية حسب المدرسة"
        description="يوضح هذا القسم هل يظهر الشخص داخل قوائم المعلمين أو المشرفين في كل مدرسة."
        contentClassName="grid gap-4"
      >
        {schoolEligibility.map((item) => (
          <div key={item.school.id} className="rounded-2xl border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>

                  <div>
                    <Link
                      href={`/orgs/${orgId}/schools/${item.school.id}`}
                      className="font-semibold hover:underline"
                    >
                      {item.school.name}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {getSchoolTypeLabel(item.school.profile?.schoolType)} —{" "}
                      {getTrackLabel(item.school.profile?.track)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.isTeacherEligible ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      <GraduationCap className="h-3.5 w-3.5" />
                      صالح كمعلم/ـة
                    </span>
                  ) : null}

                  {item.isSupervisorEligible ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      صالح كمشرف
                    </span>
                  ) : null}

                  {!item.isTeacherEligible && !item.isSupervisorEligible ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      لا يظهر في قوائم الإسنادات لهذه المدرسة
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                العضويات المطابقة:{" "}
                <span className="font-medium text-foreground">
                  {item.matchingMemberships.length}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {item.matchingMemberships.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                  لا توجد عضويات تشغيلية مرتبطة بهذه المدرسة.
                </div>
              ) : (
                item.matchingMemberships.map((membership) => {
                  const roleKey = normalizeRoleKey(membership);

                  return (
                    <div
                      key={membership.id}
                      className="rounded-2xl border bg-card px-4 py-4"
                    >
                      <div className="text-sm font-medium">
                        {getRoleLabel(roleKey)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {membership.title ? `${membership.title} — ` : ""}
                        {getScopeLabel(membership, schoolMap)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </FormSection>
    </div>
  );
}