"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ListChecks, Plus } from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type FrameworkRow = {
  id: string;
  title: string;
  targetRoleKey: string;
  targetKind: string;
  version: number;
  status: string;
};

type RubricItemRow = {
  id: string;
  frameworkId: string;
  templateKey: string;
  title: string;
  category: string;
  description?: string;
  order: number;
  maxScore: number;
  weight: number;
  tags?: string[];
  isRequired?: boolean;
  isActive?: boolean;
};

type PageData = {
  framework: FrameworkRow;
  items: RubricItemRow[];
};

type RubricItemsGroup = [string, RubricItemRow[]];

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




export default function EvaluationRubricItemsPage() {
  const params = useParams<{ orgId: string; frameworkId: string }>();
  const orgId = params.orgId;
  const frameworkId = params.frameworkId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const frameworkRef = doc(db, `orgs/${orgId}/evaluationFrameworks/${frameworkId}`);
    const itemsRef = collection(db, `orgs/${orgId}/evaluationRubricItems`);

    const [frameworkSnap, itemsSnap] = await Promise.all([
      getDoc(frameworkRef),
      getDocs(query(itemsRef, where("frameworkId", "==", frameworkId))),
    ]);

    if (!frameworkSnap.exists()) {
      return null;
    }

    const items = itemsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<RubricItemRow, "id">),
      }))
      .sort((a, b) => a.order - b.order);

    return {
      framework: {
        id: frameworkSnap.id,
        ...(frameworkSnap.data() as Omit<FrameworkRow, "id">),
      },
      items,
    };
  }, [orgId, frameworkId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, frameworkId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل بنود الـ Rubric");
  }, [error]);

  const total = data?.items.length ?? 0;
  const active = data?.items.filter((item) => item.isActive !== false).length ?? 0;
  const requiredCount =
    data?.items.filter((item) => item.isRequired !== false).length ?? 0;



    
  const grouped = useMemo(() => {
    const map = new Map<string, RubricItemRow[]>();
    for (const item of data?.items ?? []) {
      const key = item.templateKey || "GENERAL";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [data?.items]);


const visibleGroups: RubricItemsGroup[] =
  grouped.length === 0 ? [["GENERAL", []]] : grouped;

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="Rubric Items"
        badgeIcon={<ListChecks className="h-3.5 w-3.5" />}
        title="تعذر العثور على الـ Framework"
        description="قد لا يكون هذا الـ Framework موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/evaluations/frameworks`}>
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
        badge="Rubric Items"
        badgeIcon={<ListChecks className="h-3.5 w-3.5" />}
        title={data?.framework.title ?? "Rubric Items"}
        description="إدارة بنود التقييم التفصيلية المرتبطة بهذا الـ Framework."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/frameworks`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى Frameworks
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/frameworks/${frameworkId}/rubric-items/new`}>
                <Plus className="h-4 w-4" />
                إضافة بند
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي البنود" value={total} hint="كل بنود الـ Framework" />
        <InfoCard label="البنود النشطة" value={active} hint="isActive = true" />
        <InfoCard label="البنود المطلوبة" value={requiredCount} hint="isRequired = true" />
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

      {visibleGroups.map(([templateKey, items]) => (
  <FormSection
    key={templateKey}
    title={`templateKey: ${templateKey}`}
    description="البنود المرتبطة بهذا القالب داخل الـ Framework."
    contentClassName="space-y-4"
  >
    {items.length === 0 ? (
      <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        لا توجد بنود بعد.
      </div>
    ) : (
      <div className="grid gap-4">
        {items.map((row) => (
                  <div key={row.id} className="rounded-2xl border bg-card p-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">
                          {row.order}. {row.title}
                        </h3>

                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                          {row.category}
                        </span>

                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          max: {row.maxScore}
                        </span>

                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          weight: {row.weight}
                        </span>

                        {row.isRequired !== false ? (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                            مطلوب
                          </span>
                        ) : null}

                        {row.isActive === false ? (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            غير نشط
                          </span>
                        ) : null}
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          الوصف:{" "}
                          <span className="font-medium text-foreground">
                            {row.description || "—"}
                          </span>
                        </div>

                        <div>
                          الوسوم:{" "}
                          <span className="font-medium text-foreground">
                            {(row.tags ?? []).length > 0 ? row.tags?.join("، ") : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        )
      )}
    </div>
  );
}