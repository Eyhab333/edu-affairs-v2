"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  GraduationCap,
  Layers3,
  Plus,
  School,
  Shapes,
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

type SchoolSummary = {
  id: string;
  name: string;
  isArchived?: boolean;
  profile?: {
    schoolType?: SchoolTypeValue;
  };
};

type GradeRow = {
  id: string;
  code?: string;
  title: string;
  order: number;
  isArchived?: boolean;
};

type PageData = {
  school: SchoolSummary;
  grades: GradeRow[];
};

function GradesPageSkeleton() {
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

function getEntityLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "الصفوف" : "المستويات";
}

function getEntitySingleLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "صف" : "مستوى";
}

function getEntityDescription(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "عرض الصفوف التابعة للسنة الدراسية الحالية مع إمكانية الانتقال للتعديل أو الإضافة."
    : "عرض مستويات الروضة التابعة للسنة الدراسية الحالية مع إمكانية الانتقال للتعديل أو الإضافة.";
}

function getSchoolTypeBadgeClassName(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "bg-primary/10 text-primary"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default function GradesPage() {
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

    const school = {
      id: schoolSnap.id,
      ...(schoolSnap.data() as Omit<SchoolSummary, "id">),
    };

    const colRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades`,
    );
    const q = query(colRef, orderBy("order", "asc"));
    const snap = await getDocs(q);

    const grades = snap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<GradeRow, "id">),
    }));

    return {
      school,
      grades,
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
      toast.error("تعذر تحميل البيانات");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const schoolName = data?.school.name ?? "المدرسة";
  const rows = data?.grades ?? [];

  const entityLabel = getEntityLabel(schoolType);
  const entitySingleLabel = getEntitySingleLabel(schoolType);

  const totalGrades = rows.length;
  const archivedGrades = rows.filter((row) => row.isArchived).length;
  const activeGrades = totalGrades - archivedGrades;

  if (checkingAuth || loading) {
    return <GradesPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge={entityLabel}
          badgeIcon={
            schoolType === "PRIMARY" ? (
              <GraduationCap className="h-3.5 w-3.5" />
            ) : (
              <Shapes className="h-3.5 w-3.5" />
            )
          }
          title="المدرسة غير موجودة"
          description="تعذر العثور على المدرسة المطلوبة داخل المؤسسة الحالية."
          actions={
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنة
              </Link>
            </Button>
          }
        />

        <FormSection
          title="تعذر تحميل الصفحة"
          description="قد تكون المدرسة محذوفة أو أن الرابط غير صحيح."
        >
          <div className="text-sm text-muted-foreground">
            ارجع إلى السنة الدراسية ثم حاول مرة أخرى.
          </div>
        </FormSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge={entityLabel}
        badgeIcon={
          schoolType === "PRIMARY" ? (
            <GraduationCap className="h-3.5 w-3.5" />
          ) : (
            <Shapes className="h-3.5 w-3.5" />
          )
        }
        title={entityLabel}
        description={getEntityDescription(schoolType)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنة
              </Link>
            </Button>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades/new`}
              >
                <Plus className="h-4 w-4" />
                {`إضافة ${entitySingleLabel}`}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint={`السياق الحالي: ${schoolType === "PRIMARY" ? "صفوف" : "مستويات"}`}
        />
        <InfoCard
          label={`إجمالي ${entityLabel}`}
          value={totalGrades}
          hint={`كل ${entityLabel} المسجلة لهذه السنة`}
        />
        <InfoCard
          label={`${entityLabel} النشطة`}
          value={activeGrades}
          hint={`${entityLabel} غير المؤرشفة`}
        />
        <InfoCard
          label={`${entityLabel} المؤرشفة`}
          value={archivedGrades}
          hint={`${entityLabel} المعلمة كأرشيف`}
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${getSchoolTypeBadgeClassName(
              schoolType,
            )}`}
          >
            {schoolType === "PRIMARY" ? "سياق ابتدائي" : "سياق روضة"}
          </span>

          <span className="text-sm text-muted-foreground">
            {schoolType === "PRIMARY"
              ? "هذه الصفحة تعرض الصفوف الدراسية مثل الأول والثاني والثالث، وسيرتبط بها لاحقًا المسار الأكاديمي والفصول."
              : "هذه الصفحة تعرض مستويات الروضة مثل المستوى الأول والثاني والثالث، وسيرتبط بها لاحقًا الفصول والمتابعات والقياسات."}
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
        title={`قائمة ${entityLabel}`}
        description={
          schoolType === "PRIMARY"
            ? "عرض الصفوف المرتبطة بالسنة الدراسية الحالية."
            : "عرض مستويات الروضة المرتبطة بالسنة الدراسية الحالية."
        }
        contentClassName="space-y-4"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              {schoolType === "PRIMARY" ? (
                <GraduationCap className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Shapes className="h-6 w-6 text-muted-foreground" />
              )}
            </div>

            <div className="space-y-1">
              <p className="font-medium">{`لا توجد ${entityLabel} حتى الآن`}</p>
              <p className="text-sm text-muted-foreground">
                {`يمكنك إضافة أول ${entitySingleLabel} لهذه السنة الدراسية للبدء.`}
              </p>
            </div>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades/new`}
              >
                <Plus className="h-4 w-4" />
                {`إضافة ${entitySingleLabel}`}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((row) => (
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
                        <Layers3 className="h-4 w-4" />
                        الترتيب: {row.order}
                      </span>

                      {row.isArchived ? (
                        <span className="inline-flex items-center gap-1">
                          <Archive className="h-4 w-4" />
                          ضمن الأرشيف
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1">
                        {schoolType === "PRIMARY" ? (
                          <GraduationCap className="h-4 w-4" />
                        ) : (
                          <Shapes className="h-4 w-4" />
                        )}
                        {schoolType === "PRIMARY" ? "صف دراسي" : "مستوى روضة"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades/${row.id}`}
                      >
                        إدارة
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "سيُستخدم هذا الصف لاحقًا في تنظيم الفصول وربطه بالمسارات الأكاديمية مثل العام والتحفيظ والعالمي."
                    : "سيُستخدم هذا المستوى لاحقًا في تنظيم فصول الروضة وربطه بالمتابعات والقياسات الخاصة بالأطفال."}
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
        <span className="font-medium text-foreground">{schoolName}</span>
      </div>
    </div>
  );
}
