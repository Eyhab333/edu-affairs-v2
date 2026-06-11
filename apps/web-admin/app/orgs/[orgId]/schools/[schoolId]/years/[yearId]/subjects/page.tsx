"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Layers3,
  Milestone,
  Plus,
  Shapes,
  Tags,
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

type OptionRow = {
  id: string;
  title: string;
};

type SubjectRow = {
  id: string;
  code?: string;
  key?: string;
  title: string;
  streamId?: string;
  appliesToAllStreams?: boolean;
  category?: string;
  order?: number;
  isArchived?: boolean;
};

type PageData = {
  school: {
    id: string;
    name: string;
    profile?: {
      schoolType?: SchoolTypeValue;
    };
  };
  year: {
    id: string;
    title: string;
  };
  streams: OptionRow[];
  subjects: SubjectRow[];
};

function SubjectsPageSkeleton() {
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

function getPageDescription(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "إدارة المواد داخل السنة الدراسية مع ربطها لاحقًا بالمسارات والفصول والإسنادات التعليمية."
    : "إدارة مواد الروضة مثل القيم والأركان والقرآن والأرقام وبساتين المعرفة.";
}

export default function SubjectsPage() {
  const params = useParams<{ orgId: string; schoolId: string; yearId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`
    );
    const subjectsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/subjects`
    );
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`
    );

    const [schoolSnap, yearSnap, subjectsSnap, streamsSnap] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDocs(query(subjectsRef, orderBy("order", "asc"))),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists()) {
      return null;
    }

    return {
      school: {
        id: schoolSnap.id,
        ...(schoolSnap.data() as Omit<PageData["school"], "id">),
      },
      year: {
        id: yearSnap.id,
        ...(yearSnap.data() as Omit<PageData["year"], "id">),
      },
      streams: streamsSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      subjects: subjectsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SubjectRow, "id">),
      })),
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, schoolId, yearId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل المواد");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const streamMap = useMemo(
    () => new Map((data?.streams ?? []).map((item) => [item.id, item.title])),
    [data?.streams]
  );

  const categoryOptions = useMemo(() => {
    const values = new Set(
      (data?.subjects ?? [])
        .map((item) => (item.category ?? "").trim())
        .filter(Boolean)
    );
    return Array.from(values);
  }, [data?.subjects]);

  const filteredSubjects = useMemo(() => {
    return (data?.subjects ?? []).filter((item) => {
      if (schoolType === "PRIMARY" && selectedStreamId) {
        if (item.appliesToAllStreams) return false;
        if (item.streamId !== selectedStreamId) return false;
      }

      if (schoolType === "KG" && selectedCategory) {
        if ((item.category ?? "") !== selectedCategory) return false;
      }

      return true;
    });
  }, [data?.subjects, schoolType, selectedStreamId, selectedCategory]);

  const totalSubjects = data?.subjects.length ?? 0;
  const activeSubjects =
    data?.subjects.filter((item) => !item.isArchived).length ?? 0;
  const archivedSubjects =
    data?.subjects.filter((item) => item.isArchived).length ?? 0;

  function clearFilters() {
    setSelectedStreamId("");
    setSelectedCategory("");
  }

  if (checkingAuth || loading) {
    return <SubjectsPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="المواد"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى السنة
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="المواد"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title={`المواد - ${data?.school.name ?? "المدرسة"}`}
        description={getPageDescription(schoolType)}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنة
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects/new`}>
                <Plus className="h-4 w-4" />
                إضافة مادة
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint="يحدد شكل عرض المواد"
        />
        <InfoCard
          label="إجمالي المواد"
          value={totalSubjects}
          hint="كل المواد المسجلة لهذه السنة"
        />
        <InfoCard
          label="المواد النشطة"
          value={activeSubjects}
          hint="المواد غير المؤرشفة"
        />
        <InfoCard
          label="المواد المؤرشفة"
          value={archivedSubjects}
          hint="المواد المعلمة كأرشيف"
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              schoolType === "PRIMARY"
                ? "bg-primary/10 text-primary"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {schoolType === "PRIMARY" ? "مواد الابتدائي" : "مواد الروضة"}
          </span>

          <span className="text-sm text-muted-foreground">
            {schoolType === "PRIMARY"
              ? "في الابتدائي يمكن ربط المادة بمسار معين أو جعلها مشتركة لكل المسارات."
              : "في الروضة يمكن استخدام الفئة لتجميع المواد مثل القيم والأركان والقرآن والأرقام."}
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
        title="تصفية المواد"
        description={
          schoolType === "PRIMARY"
            ? "يمكنك تصفية المواد حسب المسار."
            : "يمكنك تصفية المواد حسب الفئة."
        }
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {schoolType === "PRIMARY" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">المسار</label>
              <select
                value={selectedStreamId}
                onChange={(e) => setSelectedStreamId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">الكل</option>
                {(data?.streams ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">الفئة</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">الكل</option>
                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            <Button variant="outline" onClick={clearFilters}>
              <X className="h-4 w-4" />
              مسح التصفية
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          المعروض الآن:{" "}
          <span className="font-medium text-foreground">
            {filteredSubjects.length}
          </span>{" "}
          من أصل{" "}
          <span className="font-medium text-foreground">
            {totalSubjects}
          </span>{" "}
          مادة.
        </div>
      </FormSection>

      <FormSection
        title="قائمة المواد"
        description="عرض المواد المسجلة داخل هذه السنة الدراسية."
        contentClassName="space-y-4"
      >
        {filteredSubjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">
                {totalSubjects === 0 ? "لا توجد مواد حتى الآن" : "لا توجد نتائج مطابقة للتصفية"}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalSubjects === 0
                  ? "ابدأ بإضافة أول مادة لهذه السنة الدراسية."
                  : "جرّب تغيير التصفية أو مسحها."}
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects/new`}>
                <Plus className="h-4 w-4" />
                إضافة مادة
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredSubjects.map((row) => (
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
                      {row.key ? (
                        <span className="inline-flex items-center gap-1">
                          <Tags className="h-4 w-4" />
                          المفتاح: {row.key}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1">
                        <Layers3 className="h-4 w-4" />
                        الترتيب: {row.order ?? 0}
                      </span>

                      {schoolType === "PRIMARY" ? (
                        row.appliesToAllStreams ? (
                          <span className="inline-flex items-center gap-1">
                            <Milestone className="h-4 w-4" />
                            جميع المسارات
                          </span>
                        ) : row.streamId ? (
                          <span className="inline-flex items-center gap-1">
                            <Milestone className="h-4 w-4" />
                            المسار: {streamMap.get(row.streamId) ?? row.streamId}
                          </span>
                        ) : null
                      ) : row.category ? (
                        <span className="inline-flex items-center gap-1">
                          <Shapes className="h-4 w-4" />
                          الفئة: {row.category}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects/${row.id}`}
                      >
                        تعديل
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "ستُستخدم هذه المادة لاحقًا في الإسنادات التعليمية وربط المعلم بالصف والمسار والفصل."
                    : "ستُستخدم هذه المادة لاحقًا في تنظيم المتابعات أو المواد المشتركة مثل القيم والأركان والقرآن والأرقام."}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}