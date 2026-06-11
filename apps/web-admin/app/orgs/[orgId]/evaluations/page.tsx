"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  FileStack,
  GitBranch,
  ShieldCheck,
  Building2,
  Route,
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

type OrgRow = {
  id: string;
  nameAr?: string;
  nameEn?: string;
  shortName?: string;
};

type PageData = {
  org: OrgRow;
  frameworksCount: number;
  activeFrameworksCount: number;
  policiesCount: number;
  activePoliciesCount: number;
  plansCount: number;
  activePlansCount: number;
  summariesCount: number;
};

function PageSkeleton() {
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
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getOrgDisplayName(org: OrgRow | null | undefined, fallback: string) {
  return org?.nameAr ?? org?.shortName ?? org?.nameEn ?? fallback;
}

export default function EvaluationsDashboardPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const orgRef = doc(db, `orgs/${orgId}`);
    const frameworksRef = collection(db, `orgs/${orgId}/evaluationFrameworks`);
    const policiesRef = collection(db, `orgs/${orgId}/evaluatorPolicies`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const summariesRef = collection(
      db,
      `orgs/${orgId}/evaluationSummaryReadModels`,
    );

    const [orgSnap, frameworksSnap, policiesSnap, plansSnap, summariesSnap] =
      await Promise.all([
        getDoc(orgRef),
        getDocs(query(frameworksRef)),
        getDocs(query(policiesRef)),
        getDocs(query(plansRef)),
        getDocs(query(summariesRef)),
      ]);

    if (!orgSnap.exists()) {
      return null;
    }

    const frameworks = frameworksSnap.docs.map(
      (item) => item.data() as { isActive?: boolean },
    );
    const policies = policiesSnap.docs.map(
      (item) => item.data() as { isActive?: boolean },
    );
    const plans = plansSnap.docs.map(
      (item) => item.data() as { isActive?: boolean },
    );

    return {
      org: {
        id: orgSnap.id,
        ...(orgSnap.data() as Omit<OrgRow, "id">),
      },
      frameworksCount: frameworks.length,
      activeFrameworksCount: frameworks.filter(
        (item) => item.isActive !== false,
      ).length,
      policiesCount: policies.length,
      activePoliciesCount: policies.filter((item) => item.isActive !== false)
        .length,
      plansCount: plans.length,
      activePlansCount: plans.filter((item) => item.isActive !== false).length,
      summariesCount: summariesSnap.size,
    };
  }, [orgId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPage,
      deps: [orgId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل لوحة التقييمات");
    }
  }, [error]);

  if (checkingAuth || loading) {
    return <PageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="التقييمات"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title="تعذر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}`}>
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
        badge="التقييمات"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title={`التقييمات - ${getOrgDisplayName(data?.org, orgId)}`}
        description="نواة محرك تقييم المعلمين والإداريين داخل المؤسسة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى المؤسسة
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="Frameworks"
          value={data?.frameworksCount ?? 0}
          hint={`النشطة: ${data?.activeFrameworksCount ?? 0}`}
        />
        <InfoCard
          label="Evaluator Policies"
          value={data?.policiesCount ?? 0}
          hint={`النشطة: ${data?.activePoliciesCount ?? 0}`}
        />
        <InfoCard
          label="Plans"
          value={data?.plansCount ?? 0}
          hint={`النشطة: ${data?.activePlansCount ?? 0}`}
        />
        <InfoCard
          label="Summary Models"
          value={data?.summariesCount ?? 0}
          hint="ملخصات المستهدفين"
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
        title="المسارات الأساسية"
        description="ابدأ من هنا في بناء محرك التقييمات."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Route className="h-4 w-4" />
              </div>
              <div className="font-medium">Evaluation Assignments</div>
            </div>

            <div className="text-sm text-muted-foreground">
              روابط دقيقة تحدد من يقيم من قبل اللجوء إلى التوزيع العام حسب
              الدور.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/assignments`}>
                <span>فتح Assignments</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="font-medium">Reports</div>
            </div>

            <div className="text-sm text-muted-foreground">
              تقارير مقارنة حسب المدرسة والخطة والدورة والدور المستهدف.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/reports`}>
                <span>فتح Reports</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <FileStack className="h-4 w-4" />
              </div>
              <div className="font-medium">Frameworks</div>
            </div>

            <div className="text-sm text-muted-foreground">
              تعريف القوالب الأساسية للتقييم وإصداراتها وأدوارها المستهدفة.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/frameworks`}>
                <span>فتح Frameworks</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="font-medium">Evaluator Policies</div>
            </div>

            <div className="text-sm text-muted-foreground">
              تحديد من يقيّم من، وعلى أي نطاق، وهل يملك صلاحية اعتماد.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/policies`}>
                <span>فتح Policies</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <GitBranch className="h-4 w-4" />
              </div>
              <div className="font-medium">Plans</div>
            </div>

            <div className="text-sm text-muted-foreground">
              تعريف الخطط مثل الأسبوعي، الزيارات، التحليل الفتري، والاعتماد.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/plans`}>
                <span>فتح Plans</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="font-medium">Summary Dashboard</div>
            </div>

            <div className="text-sm text-muted-foreground">
              ملخصات التقييم لكل مستهدف، وآخر دورة، والنسبة العامة، وعدد
              الإدخالات.
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full justify-between"
            >
              <Link href={`/orgs/${orgId}/evaluations/summary`}>
                <span>فتح Summary</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  );
}
