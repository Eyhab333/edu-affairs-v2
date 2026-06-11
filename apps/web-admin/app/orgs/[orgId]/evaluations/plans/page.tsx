"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, GitBranch, Plus } from "lucide-react";
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

type FrameworkRow = {
  id: string;
  title: string;
};

type PlanRow = {
  id: string;
  frameworkId: string;
  orgId?: string;
  schoolId?: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  targetKind: string;
  templateKey: string;
  title: string;
  frequencyType: string;
  cycleType?: string;
  weeksCount?: number;
  visitsCount?: number;
  monthsCount?: number;
  termsCount?: number;
  approvalMode?: string;
  tags?: string[];
  isActive?: boolean;
  description?: string;
};

type PageData = {
  schools: SchoolRow[];
  frameworks: FrameworkRow[];
  plans: PlanRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function EvaluationPlansPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const frameworksRef = collection(db, `orgs/${orgId}/evaluationFrameworks`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);

    const [schoolsSnap, frameworksSnap, plansSnap] = await Promise.all([
      getDocs(query(schoolsRef)),
      getDocs(query(frameworksRef)),
      getDocs(query(plansRef)),
    ]);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const frameworks = frameworksSnap.docs.map((item) => ({
      id: item.id,
      title: (item.data() as { title?: string }).title ?? item.id,
    }));

    const plans = plansSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PlanRow, "id">),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));

    return { schools, frameworks, plans };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Plans");
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const frameworkMap = useMemo(
    () => new Map((data?.frameworks ?? []).map((item) => [item.id, item.title])),
    [data?.frameworks]
  );

  const total = data?.plans.length ?? 0;
  const active = data?.plans.filter((item) => item.isActive !== false).length ?? 0;
  const approvals =
    data?.plans.filter((item) => item.approvalMode && item.approvalMode !== "NONE").length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Plans"
        badgeIcon={<GitBranch className="h-3.5 w-3.5" />}
        title="Plans"
        description="تعريف الخطط العملية للتقييم مثل الأسبوعي والزيارات والتحليل."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/plans/new`}>
                <Plus className="h-4 w-4" />
                إضافة Plan
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي Plans" value={total} hint="كل الخطط المعرفة" />
        <InfoCard label="النشطة" value={active} hint="الخطط الفعالة" />
        <InfoCard label="تحتاج اعتمادًا" value={approvals} hint="approvalMode ≠ NONE" />
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
        description="الخطط المعرفة داخل المؤسسة."
        contentClassName="space-y-4"
      >
        {(data?.plans.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Plans حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.plans ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{row.title}</h3>

                    {row.isActive === false ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        غير نشط
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        نشط
                      </span>
                    )}

                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {row.frequencyType}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>
                      Framework:{" "}
                      <span className="font-medium text-foreground">
                        {frameworkMap.get(row.frameworkId) ?? row.frameworkId}
                      </span>
                    </div>

                    <div>
                      المدرسة:{" "}
                      <span className="font-medium text-foreground">
                        {row.schoolId ? schoolMap.get(row.schoolId) ?? row.schoolId : "على مستوى المؤسسة"}
                      </span>
                    </div>

                    <div>
                      المقيّم ← المستهدف:{" "}
                      <span className="font-medium text-foreground">
                        {row.evaluatorRoleKey} ← {row.targetRoleKey}
                      </span>
                    </div>

                    <div>
                      templateKey:{" "}
                      <span className="font-medium text-foreground">
                        {row.templateKey}
                      </span>
                    </div>

                    <div>
                      الاعتماد:{" "}
                      <span className="font-medium text-foreground">
                        {row.approvalMode || "NONE"}
                      </span>
                    </div>

                    <div>
                      الوسوم:{" "}
                      <span className="font-medium text-foreground">
                        {(row.tags ?? []).length > 0 ? row.tags?.join("، ") : "—"}
                      </span>
                    </div>

                    <div>
                      الوصف:{" "}
                      <span className="font-medium text-foreground">
                        {row.description || "—"}
                      </span>
                    </div>
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