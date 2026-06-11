"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, RefreshCcw, Route } from "lucide-react";
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

type PersonRow = {
  id: string;
  displayName?: string;
};

type AssignmentRow = {
  id: string;
  schoolId?: string;
  targetPersonId: string;
  evaluatorPersonId: string;
  evaluatorRoleKey?: string;
  targetRoleKey?: string;
  relationType?: string;
  priority?: number;
  isActive?: boolean;
  notes?: string;
  sourceType?: string;
  sourcePlanIds?: string[];
  sourcePlanTitles?: string[];
};

type PageData = {
  schools: SchoolRow[];
  people: PersonRow[];
  assignments: AssignmentRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function EvaluationAssignmentsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const [schoolsSnap, peopleSnap, assignmentsSnap] = await Promise.all([
      getDocs(query(collection(db, `orgs/${orgId}/schools`))),
      getDocs(query(collection(db, `orgs/${orgId}/people`))),
      getDocs(query(collection(db, `orgs/${orgId}/evaluationTargetAssignments`))),
    ]);

    return {
      schools: schoolsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolRow, "id">),
      })),
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      })),
      assignments: assignmentsSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<AssignmentRow, "id">),
        }))
        .sort((a, b) => Number(a.priority ?? 9999) - Number(b.priority ?? 9999)),
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل روابط التقييم");
  }, [error]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );

  const total = data?.assignments.length ?? 0;
  const active = data?.assignments.filter((item) => item.isActive !== false).length ?? 0;
  const schoolScoped =
    data?.assignments.filter((item) => String(item.schoolId || "").trim()).length ?? 0;
  const autoBootstrap =
    data?.assignments.filter((item) => item.sourceType === "DIRECT_LINK" || item.sourceType === "UNIQUE_ROLE_MATCH").length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="روابط التقييم"
        badgeIcon={<Route className="h-3.5 w-3.5" />}
        title="روابط التقييم الدقيقة"
        description="ربط مستهدف محدد بمقيّم فعلي محدد قبل اللجوء إلى التوزيع العام."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/assignments/bootstrap`}>
                <RefreshCcw className="h-4 w-4" />
                Bootstrap تلقائي
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/assignments/new`}>
                <Plus className="h-4 w-4" />
                إضافة رابط
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="إجمالي الروابط" value={total} hint="كل الروابط المعرفة" />
        <InfoCard label="النشطة" value={active} hint="isActive = true" />
        <InfoCard label="مرتبطة بمدرسة" value={schoolScoped} hint="school scoped" />
        <InfoCard label="مولدة تلقائيًا" value={autoBootstrap} hint="bootstrap generated" />
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
        description="هذه الروابط تُستخدم أولًا عند توليد Draft Submissions."
        contentClassName="space-y-4"
      >
        {(data?.assignments.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد روابط تقييم دقيقة حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.assignments ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">
                      {peopleMap.get(row.targetPersonId) ?? row.targetPersonId}
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

                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      priority: {row.priority ?? 9999}
                    </span>

                    {row.sourceType ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {row.sourceType}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>
                      المقيّم:{" "}
                      <span className="font-medium text-foreground">
                        {peopleMap.get(row.evaluatorPersonId) ?? row.evaluatorPersonId}
                      </span>
                    </div>

                    <div>
                      المدرسة:{" "}
                      <span className="font-medium text-foreground">
                        {row.schoolId ? schoolMap.get(row.schoolId) ?? row.schoolId : "على مستوى المؤسسة"}
                      </span>
                    </div>

                    <div>
                      relationType:{" "}
                      <span className="font-medium text-foreground">
                        {row.relationType || "MANUAL_OVERRIDE"}
                      </span>
                    </div>

                    <div>
                      evaluatorRoleKey / targetRoleKey:{" "}
                      <span className="font-medium text-foreground">
                        {row.evaluatorRoleKey || "—"} / {row.targetRoleKey || "—"}
                      </span>
                    </div>

                    <div>
                      source plans:{" "}
                      <span className="font-medium text-foreground">
                        {(row.sourcePlanTitles ?? []).length > 0
                          ? row.sourcePlanTitles?.join("، ")
                          : "—"}
                      </span>
                    </div>

                    <div>
                      notes:{" "}
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