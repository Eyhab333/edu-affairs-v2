"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Filter,
  GraduationCap,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
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
import { Input } from "@/components/ui/input";

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: SchoolTypeValue;
    track?: SchoolTrackValue;
  };
};

type PersonRow = AssignmentPersonRow & {
  email?: string;
  nationalId?: string;
  phone?: string;
};

type MembershipRow = OperationalMembershipRow & {
  orgId?: string;
};

type PageData = {
  org: {
    id: string;
    nameAr?: string;
    nameEn?: string;
    shortName?: string;
  };
  schools: SchoolRow[];
  people: PersonRow[];
  memberships: MembershipRow[];
};

function DirectoryPageSkeleton() {
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
      <div className="h-[220px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getOrgDisplayName(
  org: PageData["org"] | null | undefined,
  fallback: string,
) {
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
  const schoolIds = Array.isArray(row.scopes?.schoolIds)
    ? row.scopes?.schoolIds
    : [];

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
  schoolMap: Map<string, SchoolRow>,
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

export default function OrgPeoplePage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const orgRef = doc(db, `orgs/${orgId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);

    const [orgSnap, schoolsSnap, peopleSnap, membershipsSnap] =
      await Promise.all([
        getDoc(orgRef),
        getDocs(query(schoolsRef, orderBy("name", "asc"))),
        getDocs(query(peopleRef, orderBy("displayName", "asc"))),
        getDocs(membershipsRef),
      ]);

    if (!orgSnap.exists()) {
      return null;
    }

    return {
      org: {
        id: orgSnap.id,
        ...(orgSnap.data() as Omit<PageData["org"], "id">),
      },
      schools: schoolsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolRow, "id">),
      })),
      people: peopleSnap.docs.map((item) => {
        const person = item.data() as {
          displayName?: string;
          email?: string;
          nationalId?: string;
          phone?: string;
        };

        return {
          id: item.id,
          displayName: person.displayName ?? item.id,
          email: person.email ?? "",
          nationalId: person.nationalId ?? "",
          phone: person.phone ?? "",
        };
      }),
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<MembershipRow, "id">),
      })),
    };
  }, [orgId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPageData,
      deps: [orgId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل دليل الأشخاص");
    }
  }, [error]);

  useEffect(() => {
    if (!selectedSchoolId && (data?.schools.length ?? 0) === 1) {
      setSelectedSchoolId(data?.schools[0].id ?? "");
    }
  }, [data?.schools, selectedSchoolId]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item])),
    [data?.schools],
  );

  const { teacherOptions, supervisorOptions } = useMemo(() => {
    if (!selectedSchoolId) {
      return {
        teacherOptions: [] as ReturnType<
          typeof buildAssignmentPersonOptions
        >["teacherOptions"],
        supervisorOptions: [] as ReturnType<
          typeof buildAssignmentPersonOptions
        >["supervisorOptions"],
      };
    }

    const school = schoolMap.get(selectedSchoolId);

    return buildAssignmentPersonOptions({
      people: data?.people ?? [],
      memberships: data?.memberships ?? [],
      schoolType: school?.profile?.schoolType ?? "PRIMARY",
      schoolTrack: school?.profile?.track,
      schoolId: selectedSchoolId,
    });
  }, [data?.people, data?.memberships, selectedSchoolId, schoolMap]);

  const teacherEligibleSet = useMemo(
    () => new Set(teacherOptions.map((item) => item.id)),
    [teacherOptions],
  );
  const supervisorEligibleSet = useMemo(
    () => new Set(supervisorOptions.map((item) => item.id)),
    [supervisorOptions],
  );

  const roleOptions = useMemo(() => {
    const values = new Set<string>();

    for (const item of data?.memberships ?? []) {
      const roleKey = normalizeRoleKey(item);
      if (!roleKey) continue;

      if (
        selectedSchoolId &&
        !membershipMatchesSchool(item, selectedSchoolId)
      ) {
        continue;
      }

      values.add(roleKey);
    }

    return Array.from(values).sort((a, b) =>
      getRoleLabel(a).localeCompare(getRoleLabel(b), "ar"),
    );
  }, [data?.memberships, selectedSchoolId]);

  const personMembershipsMap = useMemo(() => {
    const map = new Map<string, MembershipRow[]>();

    for (const item of data?.memberships ?? []) {
      if (!item.personId) continue;

      if (
        selectedSchoolId &&
        !membershipMatchesSchool(item, selectedSchoolId)
      ) {
        continue;
      }

      const arr = map.get(item.personId) ?? [];
      arr.push(item);
      map.set(item.personId, arr);
    }

    return map;
  }, [data?.memberships, selectedSchoolId]);

  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (data?.people ?? []).filter((person) => {
      const memberships = personMembershipsMap.get(person.id) ?? [];

      if (selectedRoleKey) {
        const hasRole = memberships.some(
          (item) => normalizeRoleKey(item) === selectedRoleKey,
        );
        if (!hasRole) return false;
      }

      if (normalizedSearch) {
        const haystack = [
          person.displayName,
          person.email,
          person.nationalId,
          person.phone,
          ...memberships.map((item) => getRoleLabel(normalizeRoleKey(item))),
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) return false;
      }

      if (selectedSchoolId) {
        const hasMatchingMembership = memberships.length > 0;
        if (!hasMatchingMembership) return false;
      }

      return true;
    });
  }, [
    data?.people,
    personMembershipsMap,
    selectedRoleKey,
    searchTerm,
    selectedSchoolId,
  ]);

  const totalPeople = data?.people.length ?? 0;
  const visiblePeople = filteredPeople.length;
  const eligibleTeachers = selectedSchoolId ? teacherOptions.length : 0;
  const eligibleSupervisors = selectedSchoolId ? supervisorOptions.length : 0;

  function clearFilters() {
    setSelectedSchoolId("");
    setSelectedRoleKey("");
    setSearchTerm("");
  }

  if (checkingAuth || loading) {
    return <DirectoryPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="دليل الأشخاص"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة أو لا تملك صلاحية الوصول إليها."
        actions={
          <Button asChild variant="outline">
            <Link href="/orgs">
              <ArrowLeft className="h-4 w-4" />
              العودة إلى المؤسسات
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="دليل الأشخاص"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={`الأشخاص - ${getOrgDisplayName(data?.org, orgId)}`}
        description="عرض الأشخاص وعضوياتهم التشغيلية داخل المؤسسة، مع توضيح صلاحيتهم للإسنادات التعليمية بحسب المدرسة المختارة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى المؤسسة
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="إجمالي الأشخاص"
          value={totalPeople}
          hint="كل الأشخاص المسجلين داخل المؤسسة"
        />
        <InfoCard
          label="المعروض حاليًا"
          value={visiblePeople}
          hint="بعد تطبيق الفلاتر الحالية"
        />
        <InfoCard
          label="صالحون كمعلمين"
          value={eligibleTeachers}
          hint={selectedSchoolId ? "وفق المدرسة المختارة" : "اختر مدرسة أولًا"}
        />
        <InfoCard
          label="صالحون كمشرفين"
          value={eligibleSupervisors}
          hint={selectedSchoolId ? "وفق المدرسة المختارة" : "اختر مدرسة أولًا"}
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

      <FormSection
        title="تصفية الدليل"
        description="يمكنك التصفية حسب المدرسة أو الدور أو البحث النصي."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">المدرسة</label>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {(data?.schools ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الدور التشغيلي</label>
            <select
              value={selectedRoleKey}
              onChange={(e) => setSelectedRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {getRoleLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-medium">بحث</label>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث بالاسم أو البريد أو الدور"
                className="pr-9"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearFilters}>
            <X className="h-4 w-4" />
            مسح التصفية
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {selectedSchoolId ? (
            <>
              الأهلية للإسنادات الآن محسوبة على مدرسة:{" "}
              <span className="font-medium text-foreground">
                {schoolMap.get(selectedSchoolId)?.name ?? selectedSchoolId}
              </span>
            </>
          ) : (
            "اختر مدرسة لعرض الأهلية الدقيقة للإسنادات التعليمية."
          )}
        </div>
      </FormSection>

      <FormSection
        title="قائمة الأشخاص"
        description="كل بطاقة تعرض الشخص، عضوياته التشغيلية، ومدى صلاحيته للإسنادات التعليمية في المدرسة المختارة."
        contentClassName="space-y-4"
      >
        {filteredPeople.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد نتائج مطابقة</p>
              <p className="text-sm text-muted-foreground">
                جرّب تغيير المدرسة أو الدور أو كلمة البحث.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredPeople.map((person) => {
              const memberships = personMembershipsMap.get(person.id) ?? [];

              return (
                <div key={person.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-xl bg-primary/10 p-2 text-primary">
                          <UserRound className="h-4 w-4" />
                        </div>

                        <div>
                          <h3 className="text-base font-bold">
                            {person.displayName}
                          </h3>
                          <div className="text-sm text-muted-foreground">
                            {person.email || "بدون بريد"}{" "}
                            {person.nationalId ? `— ${person.nationalId}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedSchoolId ? (
                          <>
                            {teacherEligibleSet.has(person.id) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                <GraduationCap className="h-3.5 w-3.5" />
                                صالح كمعلم/ـة
                              </span>
                            ) : null}

                            {supervisorEligibleSet.has(person.id) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                صالح كمشرف
                              </span>
                            ) : null}

                            {!teacherEligibleSet.has(person.id) &&
                            !supervisorEligibleSet.has(person.id) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                غير مستخدم حاليًا في الإسنادات لهذه المدرسة
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            اختر مدرسة لمعرفة الأهلية
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orgs/${orgId}/people/${person.id}`}>
                          عرض الملف
                        </Link>
                      </Button>
                    </div>

                    <div className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      العضويات الحالية:{" "}
                      <span className="font-medium text-foreground">
                        {memberships.length}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {memberships.length === 0 ? (
                      <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                        لا توجد عضويات تشغيلية مطابقة للفلاتر الحالية.
                      </div>
                    ) : (
                      memberships.map((membership) => {
                        const roleKey = normalizeRoleKey(membership);

                        return (
                          <div
                            key={membership.id}
                            className="rounded-2xl border bg-card px-4 py-4"
                          >
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
                                  {membership.title
                                    ? `${membership.title} — `
                                    : ""}
                                  {getScopeLabel(membership, schoolMap)}
                                </div>
                              </div>

                              {selectedSchoolId &&
                              membershipMatchesSchool(
                                membership,
                                selectedSchoolId,
                              ) ? (
                                <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                                  ضمن المدرسة المختارة
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title="المدارس المرتبطة"
        description="مرجع سريع للمدارس داخل المؤسسة الحالية."
        contentClassName="grid gap-3 md:grid-cols-2"
      >
        {(data?.schools ?? []).map((school) => (
          <div key={school.id} className="rounded-2xl border bg-card px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Building2 className="h-4 w-4" />
              </div>

              <div className="space-y-1">
                <div className="font-medium">{school.name}</div>
                <div className="text-sm text-muted-foreground">
                  {getSchoolTypeLabel(school.profile?.schoolType)} —{" "}
                  {getTrackLabel(school.profile?.track)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </FormSection>
    </div>
  );
}
