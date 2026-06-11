"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  FolderKanban,
  GraduationCap,
  Layers3,
  Milestone,
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
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";

type SchoolTypeValue = "PRIMARY" | "KG";

type SchoolSummary = {
  id: string;
  name: string;
  isArchived?: boolean;
  profile?: {
    schoolType?: SchoolTypeValue;
    enabledModules?: string[];
  };
};

type AcademicYearRow = {
  id: string;
  title: string;
  startsAt?: number;
  endsAt?: number;
  isActive?: boolean;
};

type PageData = {
  school: SchoolSummary;
  years: AcademicYearRow[];
};

type FocusCard = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

function YearsPageSkeleton() {
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

function formatDate(ts?: number) {
  if (!ts) return "—";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(ts));
  } catch {
    return "—";
  }
}

function getSchoolTypeLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

function getSchoolTypeDescription(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "في المدارس الابتدائية تمثل السنة الدراسية مدخلًا إلى الصفوف والمسارات والفصول والاختبارات."
    : "في الروضات تمثل السنة الدراسية مدخلًا إلى المستويات والفصول والمتابعات والقياسات.";
}

function getSchoolTypeBadgeClassName(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "bg-primary/10 text-primary"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function getFocusCards(type: SchoolTypeValue): FocusCard[] {
  if (type === "PRIMARY") {
    return [
      {
        title: "الصفوف",
        description:
          "الانتقال إلى صفوف السنة الدراسية مثل الأول والثاني والثالث.",
        icon: <GraduationCap className="h-5 w-5" />,
      },
      {
        title: "المسارات",
        description: "تمييز العام والتحفيظ والعالمي داخل السنة الدراسية.",
        icon: <Milestone className="h-5 w-5" />,
      },
      {
        title: "الفصول",
        description: "الفصول المرتبطة بكل صف ومسار داخل السنة الدراسية.",
        icon: <Layers3 className="h-5 w-5" />,
      },
      {
        title: "الاختبارات والقياسات",
        description:
          "التشخيصي والفتري والقياسات المركزية لاحقًا داخل نفس السنة.",
        icon: <BookOpenCheck className="h-5 w-5" />,
      },
    ];
  }

  return [
    {
      title: "المستويات",
      description: "المستوى الأول والثاني والثالث داخل السنة الدراسية.",
      icon: <Shapes className="h-5 w-5" />,
    },
    {
      title: "الفصول",
      description: "الفصول الخاصة بكل معلمة داخل كل مستوى.",
      icon: <Layers3 className="h-5 w-5" />,
    },
    {
      title: "المتابعات",
      description: "متابعة القرآن والفاقد وبساتين المعرفة والأرقام.",
      icon: <BookOpenCheck className="h-5 w-5" />,
    },
    {
      title: "القياسات",
      description: "قياسات المعلمة والوكيلة داخل السنة الدراسية.",
      icon: <FolderKanban className="h-5 w-5" />,
    },
  ];
}

export default function SchoolYearsPage() {
  const params = useParams<{ orgId: string; schoolId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;

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

    const yearsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears`,
    );
    const yearsQuery = query(yearsRef, orderBy("startsAt", "desc"));
    const yearsSnap = await getDocs(yearsQuery);

    const years = yearsSnap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<AcademicYearRow, "id">),
    }));

    return {
      school,
      years,
    };
  }, [orgId, schoolId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPageData,
      deps: [orgId, schoolId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل السنوات الدراسية");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const schoolName = data?.school.name ?? "المدرسة";
  const years = data?.years ?? [];
  const activeYears = years.filter((year) => year.isActive).length;
  const archivedSchool = Boolean(data?.school.isArchived);
  const focusCards = getFocusCards(schoolType);

  if (checkingAuth || loading) {
    return <YearsPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge="السنوات الدراسية"
          badgeIcon={<CalendarDays className="h-3.5 w-3.5" />}
          title="المدرسة غير موجودة"
          description="تعذر العثور على المدرسة المطلوبة داخل المؤسسة الحالية."
          actions={
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools`}>العودة إلى المدارس</Link>
            </Button>
          }
        />

        <FormSection
          title="تعذر تحميل الصفحة"
          description="قد تكون المدرسة محذوفة أو أن الرابط غير صحيح."
        >
          <div className="text-sm text-muted-foreground">
            ارجع إلى قائمة المدارس واختر المدرسة من جديد.
          </div>
        </FormSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="السنوات الدراسية"
        badgeIcon={<CalendarDays className="h-3.5 w-3.5" />}
        title={`السنوات الدراسية - ${schoolName}`}
        description={getSchoolTypeDescription(schoolType)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}`}>
                <School className="h-4 w-4" />
                إدارة المدرسة
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/new`}>
                <Plus className="h-4 w-4" />
                إضافة سنة دراسية
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint="يؤثر على المصطلحات والروابط الداخلية"
        />
        <InfoCard
          label="إجمالي السنوات"
          value={years.length}
          hint="جميع السنوات المسجلة لهذه المدرسة"
        />
        <InfoCard
          label="السنوات النشطة"
          value={activeYears}
          hint="يفضّل عادة وجود سنة نشطة واحدة"
        />
        <InfoCard
          label="حالة المدرسة"
          value={archivedSchool ? "مؤرشفة" : "نشطة"}
          hint={archivedSchool ? "المدرسة معلمة كأرشيف" : "المدرسة متاحة"}
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
              ? "داخل كل سنة ستنتقل لاحقًا إلى الصفوف ثم المسارات ثم الفصول."
              : "داخل كل سنة ستنتقل لاحقًا إلى المستويات ثم الفصول ثم المتابعات والقياسات."}
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
        title={
          schoolType === "PRIMARY"
            ? "محاور العمل داخل السنة الدراسية"
            : "محاور العمل داخل سنة الروضة"
        }
        description="ملخص سريع لما ستقود إليه السنة الدراسية بحسب نوع المدرسة."
        contentClassName="grid gap-3 md:grid-cols-2"
      >
        {focusCards.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border bg-card px-4 py-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                {item.icon}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="text-xs leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </FormSection>

      <FormSection
        title="قائمة السنوات الدراسية"
        description={
          schoolType === "PRIMARY"
            ? "يمكنك من كل سنة الانتقال إلى الصفوف أو الفصول حسب العمل المطلوب."
            : "يمكنك من كل سنة الانتقال إلى المستويات أو الفصول حسب العمل المطلوب."
        }
        contentClassName="space-y-4"
      >
        {years.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <CalendarDays className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد سنوات دراسية حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                أضف أول سنة دراسية لتبدأ ببناء الصفوف أو المستويات داخل هذه
                المدرسة.
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/new`}>
                <Plus className="h-4 w-4" />
                إضافة سنة دراسية
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {years.map((year) => (
              <div
                key={year.id}
                className="rounded-2xl border bg-card px-5 py-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{year.title}</h3>
                      {year.isActive ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          السنة النشطة
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <div>تاريخ البداية: {formatDate(year.startsAt)}</div>
                      <div>تاريخ النهاية: {formatDate(year.endsAt)}</div>
                    </div>

                    <div className="pt-1">
                      <StatusBadge archived={false} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}`}
                      >
                        إدارة السنة
                      </Link>
                    </Button>

                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}/grades`}
                      >
                        {schoolType === "PRIMARY" ? "الصفوف" : "المستويات"}
                      </Link>
                    </Button>

                    {schoolType === "PRIMARY" ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}/streams`}
                        >
                          المسارات
                        </Link>
                      </Button>
                    ) : null}

                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}/subjects`}
                      >
                        المواد
                      </Link>
                    </Button>

                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}/assignments`}
                      >
                        الإسنادات
                      </Link>
                    </Button>

                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${year.id}/classes`}
                      >
                        الفصول
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "هذه السنة الدراسية ستقود إلى الصفوف ثم الفصول، ومع التوسعات القادمة ستظهر فيها المسارات الأكاديمية والاختبارات والقياسات."
                    : "هذه السنة الدراسية ستقود إلى المستويات ثم الفصول، ومع التوسعات القادمة ستظهر فيها المتابعات والقياسات الخاصة بالروضة."}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}
