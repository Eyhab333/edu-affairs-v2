"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Search, UserRound, Users, X } from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type StudentListRow = StudentRow & {
  displayName: string;
  nationalId: string;
  phone: string;
  email: string;
};

type PageData = {
  org: {
    id: string;
    nameAr?: string;
    nameEn?: string;
    shortName?: string;
  };
  students: StudentListRow[];
};

function StudentsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[220px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getOrgDisplayName(
  org: PageData["org"] | null | undefined,
  fallback: string
) {
  return org?.nameAr ?? org?.shortName ?? org?.nameEn ?? fallback;
}

export default function StudentsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const [searchTerm, setSearchTerm] = useState("");

  const loadStudents = useCallback(async (): Promise<PageData | null> => {
    const orgRef = doc(db, `orgs/${orgId}`);
    const studentsRef = collection(db, `orgs/${orgId}/students`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);

    const [orgSnap, studentsSnap, peopleSnap] = await Promise.all([
      getDoc(orgRef),
      getDocs(query(studentsRef)),
      getDocs(query(peopleRef)),
    ]);

    if (!orgSnap.exists()) {
      return null;
    }

    const peopleMap = new Map<string, PersonRow>();
    peopleSnap.docs.forEach((item) => {
      peopleMap.set(item.id, {
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      });
    });

    const rows: StudentListRow[] = studentsSnap.docs
      .map((item) => {
        const student = item.data() as StudentRow;
        const person = peopleMap.get(student.personId);

        return {
          id: item.id,
          personId: student.personId,
          orgId: student.orgId,
          isArchived: !!student.isArchived,
          displayName: person?.displayName ?? item.id,
          nationalId: person?.nationalId ?? "",
          phone: person?.phone ?? "",
          email: person?.email ?? "",
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return {
      org: {
        id: orgSnap.id,
        ...(orgSnap.data() as Omit<PageData["org"], "id">),
      },
      students: rows,
    };
  }, [orgId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadStudents,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل قائمة الطلاب");
    }
  }, [error]);

  const rows = data?.students ?? [];

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((item) => {
      const haystack = [
        item.displayName,
        item.nationalId,
        item.phone,
        item.email,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, searchTerm]);

  const totalStudents = rows.length;
  const archivedStudents = rows.filter((item) => item.isArchived).length;
  const activeStudents = totalStudents - archivedStudents;

  if (checkingAuth || loading) {
    return <StudentsPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="الطلاب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة أو لا تملك صلاحية الوصول إليها."
        actions={
          <Button asChild variant="outline">
            <Link href="/orgs">
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
        badge="الطلاب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={`الطلاب - ${getOrgDisplayName(data?.org, orgId)}`}
        description="عرض جميع الطلاب المسجلين داخل المؤسسة الحالية."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى المؤسسة
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/new`}>
                <Plus className="h-4 w-4" />
                إضافة طالب
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="إجمالي الطلاب"
          value={totalStudents}
          hint="يشمل النشط والمؤرشف"
        />
        <InfoCard
          label="الطلاب النشطون"
          value={activeStudents}
          hint="غير المؤرشفين"
        />
        <InfoCard
          label="الطلاب المؤرشفون"
          value={archivedStudents}
          hint="المعلَّمون كأرشيف"
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
        title="بحث"
        description="ابحث باسم الطالب أو السجل المدني أو الهاتف أو البريد."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث عن طالب"
              className="pr-9"
            />
          </div>

          <Button variant="outline" onClick={() => setSearchTerm("")}>
            <X className="h-4 w-4" />
            مسح
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          المعروض الآن:{" "}
          <span className="font-medium text-foreground">{filteredRows.length}</span>{" "}
          من أصل{" "}
          <span className="font-medium text-foreground">{totalStudents}</span>{" "}
          طالبًا.
        </div>
      </FormSection>

      <FormSection
        title="قائمة الطلاب"
        description="الطلاب المسجلون داخل المؤسسة الحالية."
        contentClassName="space-y-4"
      >
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">
                {totalStudents === 0 ? "لا يوجد طلاب حتى الآن" : "لا توجد نتائج مطابقة"}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalStudents === 0
                  ? "ابدأ بإضافة أول طالب داخل المؤسسة."
                  : "جرّب تعديل كلمة البحث."}
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/students/new`}>
                <Plus className="h-4 w-4" />
                إضافة طالب
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border bg-card p-4 ${row.isArchived ? "opacity-60" : ""}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <UserRound className="h-4 w-4" />
                      </div>

                      <div>
                        <div className="text-base font-semibold">{row.displayName}</div>
                        <div className="text-sm text-muted-foreground">
                          {row.nationalId || "بدون سجل مدني"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {row.phone ? <span>الهاتف: {row.phone}</span> : null}
                      {row.email ? <span>البريد: {row.email}</span> : null}
                      {row.isArchived ? <span>الحالة: مؤرشف</span> : <span>الحالة: نشط</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/students/${row.id}`}>
                        عرض الملف
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