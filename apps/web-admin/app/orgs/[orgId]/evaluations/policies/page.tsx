"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, ShieldCheck } from "lucide-react";
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

type PolicyRow = {
  id: string;
  orgId: string;
  schoolId?: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  scopeType?: string;
  scopeId?: string;
  canEvaluate?: boolean;
  canApprove?: boolean;
  notes?: string;
  isActive?: boolean;
};

type PageData = {
  schools: SchoolRow[];
  policies: PolicyRow[];
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

export default function EvaluatorPoliciesPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const policiesRef = collection(db, `orgs/${orgId}/evaluatorPolicies`);

    const [schoolsSnap, policiesSnap] = await Promise.all([
      getDocs(query(schoolsRef)),
      getDocs(query(policiesRef)),
    ]);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const policies = policiesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PolicyRow, "id">),
      }))
      .sort((a, b) =>
        `${a.evaluatorRoleKey}-${a.targetRoleKey}`.localeCompare(
          `${b.evaluatorRoleKey}-${b.targetRoleKey}`,
          "ar"
        )
      );

    return { schools, policies };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Evaluator Policies");
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );

  const total = data?.policies.length ?? 0;
  const active = data?.policies.filter((item) => item.isActive !== false).length ?? 0;
  const approvers =
    data?.policies.filter((item) => item.canApprove === true).length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Evaluator Policies"
        badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="Evaluator Policies"
        description="من يقيّم من، وعلى أي نطاق، ومن يملك صلاحية الاعتماد."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/policies/new`}>
                <Plus className="h-4 w-4" />
                إضافة Policy
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي Policies" value={total} hint="كل السياسات المعرفة" />
        <InfoCard label="النشطة" value={active} hint="الفعالة حاليًا" />
        <InfoCard label="لها اعتماد" value={approvers} hint="canApprove = true" />
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
        description="سياسات التقييم الحالية."
        contentClassName="space-y-4"
      >
        {(data?.policies.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Policies حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.policies ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">
                      {row.evaluatorRoleKey} ← {row.targetRoleKey}
                    </h3>

                    {row.isActive === false ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        غير نشط
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        نشط
                      </span>
                    )}
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>
                      المدرسة:{" "}
                      <span className="font-medium text-foreground">
                        {row.schoolId ? schoolMap.get(row.schoolId) ?? row.schoolId : "على مستوى المؤسسة"}
                      </span>
                    </div>

                    <div>
                      النطاق:{" "}
                      <span className="font-medium text-foreground">
                        {row.scopeType || "SCHOOL"} / {row.scopeId || "—"}
                      </span>
                    </div>

                    <div>
                      التقييم:{" "}
                      <span className="font-medium text-foreground">
                        {row.canEvaluate ? "نعم" : "لا"}
                      </span>
                      {" "}— الاعتماد:{" "}
                      <span className="font-medium text-foreground">
                        {row.canApprove ? "نعم" : "لا"}
                      </span>
                    </div>

                    <div>
                      ملاحظات:{" "}
                      <span className="font-medium text-foreground">
                        {row.notes || "—"}
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