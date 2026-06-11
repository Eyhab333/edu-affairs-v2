"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  GraduationCap,
  Layers3,
  Milestone,
  School,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { SchoolType } from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolTypeValue = "PRIMARY" | "KG";
type AcademicStreamKindValue = "GENERAL" | "QURAN" | "INTERNATIONAL" | "CUSTOM";

type SchoolSummary = {
  id: string;
  name: string;
  profile?: {
    schoolType?: SchoolTypeValue;
  };
};

type AcademicYearSummary = {
  id: string;
  title: string;
  isActive?: boolean;
};

type StreamRow = {
  id: string;
  code?: string;
  title: string;
  kind?: AcademicStreamKindValue;
  shortLabel?: string;
  order?: number;
  isActive?: boolean;
  isArchived?: boolean;
};

type PageData = {
  school: SchoolSummary;
  year: AcademicYearSummary;
  streams: StreamRow[];
};

function StreamsPageSkeleton() {
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
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getSchoolTypeLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

function getStreamKindLabel(kind?: AcademicStreamKindValue) {
  switch (kind) {
    case "GENERAL":
      return "عام";
    case "QURAN":
      return "تحفيظ";
    case "INTERNATIONAL":
      return "عالمي";
    case "CUSTOM":
      return "مخصص";
    default:
      return "—";
  }
}

export default function AcademicStreamsPage() {
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
  }>();

  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const schoolSnap = await getDoc(schoolRef);

    if (!schoolSnap.exists()) {
      return null;
    }

    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`,
    );
    const yearSnap = await getDoc(yearRef);

    if (!yearSnap.exists()) {
      return null;
    }

    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`,
    );
    const streamsQuery = query(streamsRef, orderBy("order", "asc"));
    const streamsSnap = await getDocs(streamsQuery);

    return {
      school: {
        id: schoolSnap.id,
        ...(schoolSnap.data() as Omit<SchoolSummary, "id">),
      },
      year: {
        id: yearSnap.id,
        ...(yearSnap.data() as Omit<AcademicYearSummary, "id">),
      },
      streams: streamsSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<StreamRow, "id">),
      })),
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPageData,
      deps: [orgId, schoolId, yearId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل المسارات الأكاديمية");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const streams = data?.streams ?? [];
  const activeStreams = streams.filter(
    (item) => item.isActive !== false,
  ).length;
  const archivedStreams = streams.filter((item) => item.isArchived).length;

  if (checkingAuth || loading) {
    return <StreamsPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge="المسارات الأكاديمية"
          badgeIcon={<Milestone className="h-3.5 w-3.5" />}
          title="تعذر العثور على السجل المطلوب"
          description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  العودة إلى السنة
                </Link>
              </Button>

              <Button asChild>
                <Link
                  href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams/new`}
                >
                  إضافة مسار
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (schoolType === "KG") {
    return (
      <div className="space-y-6">
        <PageHero
          badge="المسارات الأكاديمية"
          badgeIcon={<Milestone className="h-3.5 w-3.5" />}
          title="المسارات الأكاديمية غير مستخدمة في الروضات"
          description="في الروضات نعمل على المستويات والفصول والمتابعات والقياسات، وليس على مسارات مثل العام والتحفيظ والعالمي."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  العودة إلى السنة
                </Link>
              </Button>

              <Button asChild>
                <Link
                  href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams/new`}
                >
                  إضافة مسار
                </Link>
              </Button>
            </div>
          }
        />

        <FormSection
          title="السياق الحالي"
          description="هذه الصفحة مخصصة للابتدائي فقط."
        >
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            المدرسة الحالية من نوع{" "}
            <span className="font-medium text-foreground">روضة</span>، لذلك
            المسارات الأكاديمية غير مطبقة هنا.
          </div>
        </FormSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="المسارات الأكاديمية"
        badgeIcon={<Milestone className="h-3.5 w-3.5" />}
        title={`المسارات الأكاديمية - ${data?.school.name ?? "المدرسة"}`}
        description={`إدارة مسارات السنة الدراسية ${data?.year.title ?? ""} داخل المدرسة الابتدائية، مثل العام والتحفيظ والعالمي.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنة
              </Link>
            </Button>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams/new`}
              >
                إضافة مسار
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint="هذه الصفحة مخصصة للابتدائي"
        />
        <InfoCard
          label="السنة الدراسية"
          value={data?.year.title ?? "—"}
          hint={data?.year.isActive ? "السنة النشطة" : "سنة غير نشطة"}
        />
        <InfoCard
          label="إجمالي المسارات"
          value={streams.length}
          hint="كل المسارات المسجلة لهذه السنة"
        />
        <InfoCard
          label="المسارات النشطة"
          value={activeStreams}
          hint={`المؤرشفة: ${archivedStreams}`}
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            سياق ابتدائي
          </span>

          <span className="text-sm text-muted-foreground">
            المسارات الأكاديمية هنا تفصل بين العام والتحفيظ والعالمي، وسترتبط
            لاحقًا بالصفوف والفصول والإسنادات التعليمية.
          </span>
        </div>
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
        title="ملخص الدور الذي تؤديه المسارات"
        description="توضيح سريع لكيفية استخدام المسارات داخل الابتدائي."
        contentClassName="grid gap-3 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Milestone className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold">المسار</h3>
              <p className="text-xs leading-6 text-muted-foreground">
                يمثل نوع البرنامج داخل المرحلة مثل العام أو التحفيظ أو العالمي.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Layers3 className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold">الارتباطات اللاحقة</h3>
              <p className="text-xs leading-6 text-muted-foreground">
                ستُستخدم المسارات لاحقًا في تنظيم الصفوف والفصول والمواد
                وإسنادات المعلمين.
              </p>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="قائمة المسارات"
        description="المسارات المسجلة داخل هذه السنة الدراسية."
        contentClassName="space-y-4"
      >
        {streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Milestone className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد مسارات أكاديمية حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                يمكنك البدء بالمسارات الأساسية مثل العام والتحفيظ والعالمي.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {streams.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border bg-card p-4 transition hover:bg-muted/20 ${
                  row.isArchived ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {row.title}
                        {row.code ? ` (${row.code})` : ""}
                      </h3>

                      {row.isArchived ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          مؤرشف
                        </span>
                      ) : (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          نشط
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Milestone className="h-4 w-4" />
                        النوع: {getStreamKindLabel(row.kind)}
                      </span>

                      {row.shortLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <School className="h-4 w-4" />
                          الرمز المختصر: {row.shortLabel}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1">
                        <Layers3 className="h-4 w-4" />
                        الترتيب: {row.order ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams/${row.id}`}
                      >
                        تعديل
                      </Link>
                    </Button>

                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}
                      >
                        الفصول
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  هذا المسار سيُستخدم لاحقًا في ربط الفصول والمواد وإسنادات
                  المعلمين وتنظيم تجربة الابتدائي داخل المدرسة.
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="روابط مرتبطة"
        description="اختصارات مرتبطة بهذه السنة الدراسية."
        contentClassName="space-y-2"
      >
        <Button asChild variant="outline" className="w-full justify-between">
          <Link
            href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}
          >
            <span className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              الصفوف
            </span>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <Button asChild variant="outline" className="w-full justify-between">
          <Link
            href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}
          >
            <span className="flex items-center gap-2">
              <School className="h-4 w-4" />
              الفصول
            </span>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </FormSection>

      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        المدرسة الحالية:{" "}
        <span className="font-medium text-foreground">
          {data?.school.name ?? "—"}
        </span>{" "}
        — السنة الدراسية:{" "}
        <span className="font-medium text-foreground">
          {data?.year.title ?? "—"}
        </span>
      </div>
    </div>
  );
}
