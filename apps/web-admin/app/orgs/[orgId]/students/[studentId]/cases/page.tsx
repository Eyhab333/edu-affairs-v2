"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Plus,
  School,
  ShieldAlert,
  Tag,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
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
};

type StudentRow = {
  id: string;
  personId: string;
};

type YearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type SchoolRow = {
  id: string;
  name: string;
};

type CaseTypeRow = {
  id: string;
  title: string;
};

type CaseRow = {
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
  caseTypes: CaseTypeRow[];
  cases: CaseRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[480px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA").format(new Date(timestamp));
}

function getStatusLabel(status?: string) {
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

function getPriorityLabel(priority?: string) {
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

export default function StudentCasesPage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const caseTypesRef = collection(db, `orgs/${orgId}/studentCaseTypes`);
    const casesRef = collection(db, `orgs/${orgId}/studentCases`);

    const [studentSnap, peopleSnap, schoolsSnap, caseTypesSnap, casesSnap] =
      await Promise.all([
        getDoc(studentRef),
        getDocs(query(peopleRef)),
        getDocs(query(schoolsRef)),
        getDocs(query(caseTypesRef)),
        getDocs(query(casesRef)),
      ]);

    if (!studentSnap.exists()) return null;

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const peopleMap = new Map<string, PersonRow>();
    peopleSnap.docs.forEach((item) => {
      peopleMap.set(item.id, {
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      });
    });

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(db, `orgs/${orgId}/schools/${school.id}/academicYears`);
        const yearsSnap = await getDocs(query(yearsRef));

        return yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));
      })
    );

    const caseTypes = caseTypesSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<CaseTypeRow, "id">),
    }));

    const cases = casesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CaseRow, "id">),
      }))
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return {
      student,
      person: peopleMap.get(student.personId) ?? {
        id: student.personId,
        displayName: student.personId,
      },
      schools,
      years: yearsNested.flat(),
      caseTypes,
      cases,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل قضايا الطالب");
  }, [error]);

  const caseTypeMap = useMemo(
    () => new Map((data?.caseTypes ?? []).map((item) => [item.id, item.title])),
    [data?.caseTypes]
  );
  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years]
  );

  const totalCases = data?.cases.length ?? 0;
  const openCases =
    data?.cases.filter((item) =>
      ["OPEN", "IN_PROGRESS", "REFERRED"].includes(item.status)
    ).length ?? 0;
  const closedCases =
    data?.cases.filter((item) =>
      ["RESOLVED", "CLOSED", "CANCELLED"].includes(item.status)
    ).length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="قضايا الطالب"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد يكون الطالب غير موجود."
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
        badge="قضايا الطالب"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title={`قضايا الطالب - ${data?.person.displayName ?? "الطالب"}`}
        description="عرض القضايا الحالية والسابقة المرتبطة بالطالب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى ملف الطالب
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/case-types`}>
                <Tag className="h-4 w-4" />
                أنواع القضايا
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/cases/new`}>
                <Plus className="h-4 w-4" />
                إضافة قضية
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي القضايا" value={totalCases} hint="كل القضايا المرتبطة بالطالب" />
        <InfoCard label="القضايا المفتوحة" value={openCases} hint="ما زالت قيد العمل" />
        <InfoCard label="القضايا المغلقة" value={closedCases} hint="المغلقة أو الملغاة أو المحلولة" />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات المطلوبة."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {String(error)}
          </div>

          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="القائمة"
        description="القضايا المرتبطة بهذا الطالب."
        contentClassName="space-y-4"
      >
        {totalCases === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد قضايا حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                ابدأ بإنشاء أول قضية لهذا الطالب.
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/${studentId}/cases/new`}>
                <Plus className="h-4 w-4" />
                إضافة قضية
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.cases ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{row.title}</h3>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {getStatusLabel(row.status)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getPriorityLabel(row.priority)}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div>
                        النوع:{" "}
                        <span className="font-medium text-foreground">
                          {caseTypeMap.get(row.caseTypeId) ?? row.caseTypeId}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        المدرسة:{" "}
                        <span className="font-medium text-foreground">
                          {schoolMap.get(row.schoolId) ?? row.schoolId}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <School className="h-4 w-4" />
                        السنة:{" "}
                        <span className="font-medium text-foreground">
                          {yearMap.get(row.academicYearId) ?? row.academicYearId}
                        </span>
                      </div>

                      <div>
                        المالك الحالي:{" "}
                        <span className="font-medium text-foreground">
                          {row.currentOwnerRoleKey}
                        </span>
                      </div>

                      <div>
                        آخر تحديث مختصر:{" "}
                        <span className="font-medium text-foreground">
                          {row.latestNote || "—"}
                        </span>
                      </div>

                      <div>
                        تاريخ الإنشاء:{" "}
                        <span className="font-medium text-foreground">
                          {formatDate(row.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/students/${studentId}/cases/${row.id}`}>
                        فتح القضية
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