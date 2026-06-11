"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Bus,
  DoorOpen,
  GraduationCap,
  Layers3,
  Milestone,
  Plus,
  School,
  Shapes,
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

type OptionRow = {
  id: string;
  title: string;
};

type ClassRow = {
  id: string;
  code?: string;
  title: string;
  gradeId?: string;
  streamId?: string;
  sectionLabel?: string;
  capacity?: number;
  order: number;
  isArchived?: boolean;
};

type PageData = {
  school: SchoolSummary;
  grades: OptionRow[];
  streams: OptionRow[];
  classes: ClassRow[];
};

function ClassesPageSkeleton() {
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
    ? "عرض الفصول التابعة للسنة الدراسية الحالية مع ربطها بالصفوف والمسارات الأكاديمية."
    : "عرض فصول الروضة التابعة للسنة الدراسية الحالية مع ربطها بالمستويات والمعلمات والمتابعات.";
}

function getSchoolTypeBadgeClassName(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "bg-primary/10 text-primary"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export default function ClassesPage() {
  const params = useParams<{ orgId: string; schoolId: string; yearId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("");

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

    const classesRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/classes`
    );
    const gradesRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades`
    );
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`
    );

    const [classesSnap, gradesSnap, streamsSnap] = await Promise.all([
      getDocs(query(classesRef, orderBy("order", "asc"))),
      getDocs(query(gradesRef, orderBy("order", "asc"))),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
    ]);

    const classes = classesSnap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<ClassRow, "id">),
    }));

    const grades = gradesSnap.docs.map((docItem) => ({
      id: docItem.id,
      title: (docItem.data() as { title?: string }).title ?? docItem.id,
    }));

    const streams = streamsSnap.docs.map((docItem) => ({
      id: docItem.id,
      title: (docItem.data() as { title?: string }).title ?? docItem.id,
    }));

    return {
      school,
      grades,
      streams,
      classes,
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, schoolId, yearId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل الفصول");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const schoolName = data?.school.name ?? "المدرسة";
  const rows = data?.classes ?? [];
  const gradeOptions = data?.grades ?? [];
  const streamOptions = data?.streams ?? [];

  const gradeMap = useMemo(
    () => new Map(gradeOptions.map((item) => [item.id, item.title])),
    [gradeOptions]
  );
  const streamMap = useMemo(
    () => new Map(streamOptions.map((item) => [item.id, item.title])),
    [streamOptions]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (selectedGradeId && row.gradeId !== selectedGradeId) {
        return false;
      }

      if (schoolType === "PRIMARY" && selectedStreamId && row.streamId !== selectedStreamId) {
        return false;
      }

      return true;
    });
  }, [rows, selectedGradeId, selectedStreamId, schoolType]);

  const totalClasses = rows.length;
  const archivedClasses = rows.filter((row) => row.isArchived).length;
  const activeClasses = totalClasses - archivedClasses;

  const addClassHref =
    schoolType === "PRIMARY"
      ? `/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/new?gradeId=${encodeURIComponent(
          selectedGradeId
        )}&streamId=${encodeURIComponent(selectedStreamId)}`
      : `/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/new?gradeId=${encodeURIComponent(
          selectedGradeId
        )}`;

  function clearFilters() {
    setSelectedGradeId("");
    setSelectedStreamId("");
  }

  if (checkingAuth || loading) {
    return <ClassesPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge="الفصول"
          badgeIcon={<DoorOpen className="h-3.5 w-3.5" />}
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
        badge="الفصول"
        badgeIcon={<DoorOpen className="h-3.5 w-3.5" />}
        title="الفصول"
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
              <Link href={addClassHref}>
                <Plus className="h-4 w-4" />
                إضافة فصل
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint={
            schoolType === "PRIMARY"
              ? "سياق الفصول الابتدائية"
              : "سياق فصول الروضة"
          }
        />
        <InfoCard
          label="إجمالي الفصول"
          value={totalClasses}
          hint="كل الفصول المسجلة لهذه السنة"
        />
        <InfoCard
          label="الفصول النشطة"
          value={activeClasses}
          hint="الفصول غير المؤرشفة"
        />
        <InfoCard
          label="الفصول المؤرشفة"
          value={archivedClasses}
          hint="الفصول المعلمة كأرشيف"
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${getSchoolTypeBadgeClassName(
              schoolType
            )}`}
          >
            {schoolType === "PRIMARY" ? "سياق ابتدائي" : "سياق روضة"}
          </span>

          <span className="text-sm text-muted-foreground">
            {schoolType === "PRIMARY"
              ? "في الابتدائي يرتبط الفصل عادة بصف ومسار مثل العام أو التحفيظ أو العالمي."
              : "في الروضة يرتبط الفصل عادة بمستوى ومعلمة، ثم تتفرع عليه المتابعات والقياسات."}
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
        title="تصفية الفصول"
        description={
          schoolType === "PRIMARY"
            ? "يمكنك تصفية الفصول حسب الصف والمسار لتسهيل الإدارة."
            : "يمكنك تصفية فصول الروضة حسب المستوى."
        }
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {schoolType === "PRIMARY" ? "الصف" : "المستوى"}
            </label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {gradeOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {schoolType === "PRIMARY" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">المسار</label>
              <select
                value={selectedStreamId}
                onChange={(e) => setSelectedStreamId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">الكل</option>
                {streamOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex items-end">
            <Button variant="outline" onClick={clearFilters} className="w-full md:w-auto">
              <X className="h-4 w-4" />
              مسح التصفية
            </Button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          المعروض الآن: <span className="font-medium text-foreground">{filteredRows.length}</span>{" "}
          من أصل <span className="font-medium text-foreground">{rows.length}</span> فصلًا.
        </div>
      </FormSection>

      <FormSection
        title="ملخص سياق الفصول"
        description="توضيح سريع لما يمثله الفصل داخل هذا النوع من المدارس."
        contentClassName="grid gap-3 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              {schoolType === "PRIMARY" ? (
                <GraduationCap className="h-5 w-5" />
              ) : (
                <Shapes className="h-5 w-5" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                {schoolType === "PRIMARY" ? "الفصل في الابتدائي" : "الفصل في الروضة"}
              </h3>
              <p className="text-xs leading-6 text-muted-foreground">
                {schoolType === "PRIMARY"
                  ? "يرتبط بالصف الدراسي، وقد يرتبط أيضًا بمسار أكاديمي مثل العام أو التحفيظ أو العالمي."
                  : "يرتبط بالمستوى الدراسي داخل الروضة، ويكون غالبًا تابعًا لمعلمة محددة وفصل مسمى."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              {schoolType === "PRIMARY" ? (
                <Milestone className="h-5 w-5" />
              ) : (
                <Bus className="h-5 w-5" />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                {schoolType === "PRIMARY" ? "المسارات لاحقًا" : "المتابعات لاحقًا"}
              </h3>
              <p className="text-xs leading-6 text-muted-foreground">
                {schoolType === "PRIMARY"
                  ? "سيظهر لاحقًا ربط أوضح بين الفصول والمسارات والمواد والإسنادات التعليمية."
                  : "سيظهر لاحقًا ربط أوضح بين الفصول والمتابعات والقياسات والحضور والنقل."}
              </p>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="قائمة الفصول"
        description={
          schoolType === "PRIMARY"
            ? "عرض الفصول المرتبطة بالسنة الدراسية الحالية في سياق الابتدائي."
            : "عرض فصول الروضة المرتبطة بالسنة الدراسية الحالية."
        }
        contentClassName="space-y-4"
      >
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <DoorOpen className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">
                {rows.length === 0 ? "لا توجد فصول حتى الآن" : "لا توجد نتائج مطابقة للتصفية"}
              </p>
              <p className="text-sm text-muted-foreground">
                {rows.length === 0
                  ? "يمكنك إضافة أول فصل لهذه السنة الدراسية للبدء."
                  : "جرّب تغيير الصف أو المسار أو امسح التصفية الحالية."}
              </p>
            </div>

            <Button asChild>
              <Link href={addClassHref}>
                <Plus className="h-4 w-4" />
                إضافة فصل
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRows.map((row) => (
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

                      {row.gradeId ? (
                        <span className="inline-flex items-center gap-1">
                          {schoolType === "PRIMARY" ? (
                            <GraduationCap className="h-4 w-4" />
                          ) : (
                            <Shapes className="h-4 w-4" />
                          )}
                          {schoolType === "PRIMARY"
                            ? `الصف: ${gradeMap.get(row.gradeId) ?? row.gradeId}`
                            : `المستوى: ${gradeMap.get(row.gradeId) ?? row.gradeId}`}
                        </span>
                      ) : null}

                      {schoolType === "PRIMARY" && row.streamId ? (
                        <span className="inline-flex items-center gap-1">
                          <Milestone className="h-4 w-4" />
                          المسار: {streamMap.get(row.streamId) ?? row.streamId}
                        </span>
                      ) : null}

                      {row.sectionLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <School className="h-4 w-4" />
                          الرمز: {row.sectionLabel}
                        </span>
                      ) : null}

                      {typeof row.capacity === "number" ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          السعة: {row.capacity}
                        </span>
                      ) : null}

                      {row.isArchived ? (
                        <span className="inline-flex items-center gap-1">
                          <Archive className="h-4 w-4" />
                          ضمن الأرشيف
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/${row.id}`}
                      >
                        تعديل
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "يُستخدم هذا الفصل داخل الابتدائي لربط الطلاب والإسنادات التعليمية، وقد يرتبط لاحقًا بصف ومسار ومواد متعددة."
                    : "يُستخدم هذا الفصل داخل الروضة لربط الأطفال والمعلمة الأساسية والمتابعات والقياسات المرتبطة بالفصل."}
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
          <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
            <span className="flex items-center gap-2">
              {schoolType === "PRIMARY" ? (
                <GraduationCap className="h-4 w-4" />
              ) : (
                <Shapes className="h-4 w-4" />
              )}
              {schoolType === "PRIMARY" ? "الصفوف" : "المستويات"}
            </span>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        {schoolType === "PRIMARY" ? (
          <Button asChild variant="outline" className="w-full justify-between">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams`}>
              <span className="flex items-center gap-2">
                <Milestone className="h-4 w-4" />
                المسارات
              </span>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </FormSection>

      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        المدرسة الحالية: <span className="font-medium text-foreground">{schoolName}</span>
      </div>
    </div>
  );
}