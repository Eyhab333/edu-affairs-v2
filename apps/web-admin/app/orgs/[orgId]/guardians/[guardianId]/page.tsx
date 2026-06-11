"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Link2,
  Mail,
  Phone,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { GuardianRelationType } from "@takween/contracts";
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

type GuardianRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type StudentRow = {
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

type PageData = {
  guardian: GuardianRow;
  person: PersonRow;
  students: Array<
    StudentRow & {
      displayName: string;
      nationalId: string;
    }
  >;
  links: GuardianLinkRow[];
};

function GuardianPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[280px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA").format(new Date(timestamp));
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

export default function GuardianProfilePage() {
  const params = useParams<{ orgId: string; guardianId: string }>();
  const orgId = params.orgId;
  const guardianId = params.guardianId;

  const { user, checkingAuth } = useRequireAuth();

  const loadProfile = useCallback(async (): Promise<PageData | null> => {
    const guardianRef = doc(db, `orgs/${orgId}/guardians/${guardianId}`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const studentsRef = collection(db, `orgs/${orgId}/students`);
    const linksRef = collection(db, `orgs/${orgId}/guardianLinks`);

    const [guardianSnap, peopleSnap, studentsSnap, linksSnap] = await Promise.all([
      getDoc(guardianRef),
      getDocs(query(peopleRef)),
      getDocs(query(studentsRef)),
      getDocs(query(linksRef)),
    ]);

    if (!guardianSnap.exists()) {
      return null;
    }

    const guardian = {
      id: guardianSnap.id,
      ...(guardianSnap.data() as Omit<GuardianRow, "id">),
    };

    const peopleMap = new Map<string, PersonRow>();
    peopleSnap.docs.forEach((item) => {
      peopleMap.set(item.id, {
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      });
    });

    const students = studentsSnap.docs.map((item) => {
      const student = item.data() as StudentRow;
      const person = peopleMap.get(student.personId);

      return {
        id: item.id,
        personId: student.personId,
        orgId: student.orgId,
        isArchived: !!student.isArchived,
        displayName: person?.displayName ?? item.id,
        nationalId: person?.nationalId ?? "",
      };
    });

    const links = linksSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<GuardianLinkRow, "id">),
      }))
      .filter((item) => item.guardianId === guardianId)
      .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));

    return {
      guardian,
      person: peopleMap.get(guardian.personId) ?? {
        id: guardian.personId,
        displayName: guardian.personId,
      },
      students,
      links,
    };
  }, [orgId, guardianId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadProfile,
    deps: [orgId, guardianId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل ملف ولي الأمر");
    }
  }, [error]);

  const studentMap = useMemo(
    () => new Map((data?.students ?? []).map((item) => [item.id, item])),
    [data?.students]
  );

  const totalLinks = data?.links.length ?? 0;
  const activeLinks = data?.links.filter((item) => item.active !== false).length ?? 0;

  if (checkingAuth || loading) {
    return <GuardianPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="ملف ولي الأمر"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على ولي الأمر"
        description="قد يكون ولي الأمر غير موجود داخل المؤسسة الحالية."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/guardians`}>
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
        badge="ملف ولي الأمر"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={data?.person.displayName ?? "ولي الأمر"}
        description="عرض بيانات ولي الأمر وروابطه مع الطلاب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/guardians`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/guardians/${guardianId}/links/new`}>
                <Plus className="h-4 w-4" />
                ربط طالب
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="عدد الروابط"
          value={totalLinks}
          hint="كل الروابط المرتبطة بولي الأمر"
        />
        <InfoCard
          label="الروابط النشطة"
          value={activeLinks}
          hint="الروابط الفعالة حاليًا"
        />
        <InfoCard
          label="الحالة"
          value={data?.guardian.isArchived ? "مؤرشف" : "نشط"}
          hint="على مستوى سجل ولي الأمر"
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
        description="الهوية الأساسية لولي الأمر داخل المؤسسة."
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
                {data?.person.nationalId ? <span>السجل المدني: {data.person.nationalId}</span> : null}
                {data?.person.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {data.person.phone}
                  </span>
                ) : null}
                {data?.person.email ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {data.person.email}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="روابط الطلاب"
        description="الطلاب المرتبطون بولي الأمر الحالي."
        contentClassName="space-y-4"
      >
        {totalLinks === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد روابط حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                ابدأ بربط أول طالب مع ولي الأمر هذا.
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/guardians/${guardianId}/links/new`}>
                <Plus className="h-4 w-4" />
                ربط طالب
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.links ?? []).map((link) => {
              const student = studentMap.get(link.studentId);

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
                          الطالب:{" "}
                          <span className="font-medium text-foreground">
                            {student?.displayName ?? link.studentId}
                          </span>
                        </div>

                        {student?.nationalId ? (
                          <div>
                            السجل المدني:{" "}
                            <span className="font-medium text-foreground">
                              {student.nationalId}
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
                        <Link href={`/orgs/${orgId}/students/${link.studentId}`}>
                          فتح الطالب
                        </Link>
                      </Button>

                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/orgs/${orgId}/guardians/${guardianId}/links/${link.id}`}
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
    </div>
  );
}