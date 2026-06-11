"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarRange, Plus } from "lucide-react";
import { collection, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type PlanRow = {
  id: string;
  title: string;
};

type CycleRow = {
  id: string;
  planId: string;
  orgId?: string;
  schoolId?: string;
  academicYearId: string;
  cycleType: string;
  label: string;
  order: number;
  startsAt?: number;
  endsAt?: number;
  isOpen?: boolean;
  isLocked?: boolean;
};

type PageData = {
  schools: SchoolRow[];
  years: AcademicYearRow[];
  plans: PlanRow[];
  cycles: CycleRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA").format(new Date(timestamp));
}

function getCycleTypeLabel(value?: string) {
  switch (value) {
    case "WEEK":
      return "أسبوع";
    case "VISIT":
      return "زيارة";
    case "MONTH":
      return "شهر";
    case "TERM":
      return "فصل";
    case "PERIODIC_ANALYSIS":
      return "تحليل فتري";
    case "CUSTOM":
      return "مخصص";
    default:
      return value || "—";
  }
}

export default function EvaluationCyclesPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const cyclesRef = collection(db, `orgs/${orgId}/evaluationCycles`);

    const [schoolsSnap, plansSnap, cyclesSnap] = await Promise.all([
      getDocs(query(schoolsRef)),
      getDocs(query(plansRef)),
      getDocs(query(cyclesRef)),
    ]);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(
          db,
          `orgs/${orgId}/schools/${school.id}/academicYears`
        );
        const yearsSnap = await getDocs(query(yearsRef));

        return yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));
      })
    );

    const plans = plansSnap.docs.map((item) => ({
      id: item.id,
      title: (item.data() as { title?: string }).title ?? item.id,
    }));

    const cycles = cyclesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CycleRow, "id">),
      }))
      .sort((a, b) => {
        const aKey = `${a.planId}-${a.order}`;
        const bKey = `${b.planId}-${b.order}`;
        return aKey.localeCompare(bKey, "ar");
      });

    return {
      schools,
      years: yearsNested.flat(),
      plans,
      cycles,
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Cycles");
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years]
  );
  const planMap = useMemo(
    () => new Map((data?.plans ?? []).map((item) => [item.id, item.title])),
    [data?.plans]
  );

  const total = data?.cycles.length ?? 0;
  const openCount = data?.cycles.filter((item) => item.isOpen !== false).length ?? 0;
  const lockedCount = data?.cycles.filter((item) => item.isLocked === true).length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Cycles"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title="Cycles"
        description="الدورات التشغيلية المرتبطة بخطط التقييم."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/cycles/new`}>
                <Plus className="h-4 w-4" />
                إضافة Cycle
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي Cycles" value={total} hint="كل الدورات المعرفة" />
        <InfoCard label="المفتوحة" value={openCount} hint="isOpen = true" />
        <InfoCard label="المقفلة" value={lockedCount} hint="isLocked = true" />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات."
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
        title="القائمة"
        description="الدورات المعرفة حاليًا داخل المؤسسة."
        contentClassName="space-y-4"
      >
        {(data?.cycles.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Cycles حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.cycles ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{row.label}</h3>

                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                      {getCycleTypeLabel(row.cycleType)}
                    </span>

                    {row.isOpen === false ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        مغلقة
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        مفتوحة
                      </span>
                    )}

                    {row.isLocked ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        مقفلة
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>
                      الخطة:{" "}
                      <span className="font-medium text-foreground">
                        {planMap.get(row.planId) ?? row.planId}
                      </span>
                    </div>

                    <div>
                      المدرسة:{" "}
                      <span className="font-medium text-foreground">
                        {row.schoolId ? schoolMap.get(row.schoolId) ?? row.schoolId : "—"}
                      </span>
                    </div>

                    <div>
                      السنة الدراسية:{" "}
                      <span className="font-medium text-foreground">
                        {yearMap.get(row.academicYearId) ?? row.academicYearId}
                      </span>
                    </div>

                    <div>
                      الترتيب:{" "}
                      <span className="font-medium text-foreground">{row.order}</span>
                    </div>

                    <div>
                      البداية:{" "}
                      <span className="font-medium text-foreground">
                        {formatDate(row.startsAt)}
                      </span>
                      {" "}— النهاية:{" "}
                      <span className="font-medium text-foreground">
                        {formatDate(row.endsAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/evaluations/cycles/${row.id}`}>
                        فتح الدورة
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