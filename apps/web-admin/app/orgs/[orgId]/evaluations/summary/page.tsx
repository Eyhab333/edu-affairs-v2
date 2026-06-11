"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, Loader2, RefreshCcw } from "lucide-react";
import {
  collection,
  getDocs,
  query,
  setDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildEvaluationSummaryReadModels,
  type EvaluationSummaryReadModel,
} from "@/lib/evaluation-read-model";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type PersonRow = {
  id: string;
  displayName?: string;
};

type PlanRow = {
  id: string;
  title?: string;
};

type SubmissionRow = {
  id: string;
  orgId?: string;
  planId: string;
  cycleId?: string;
  cycleLabel?: string;
  schoolId: string;
  academicYearId: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
  targetRoleKey?: string;
  status: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  submittedAt?: number;
  approvedAt?: number;
  reviewedAt?: number;
  lockedAt?: number;
  cancelledAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

type PageData = {
  summaries: EvaluationSummaryReadModel[];
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
      <div className="h-[560px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مُرسل";
    case "UNDER_REVIEW":
      return "قيد المراجعة";
    case "APPROVED":
      return "معتمد";
    case "RETURNED":
      return "معاد";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغى";
    default:
      return status || "—";
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export default function EvaluationSummaryPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();
  const [rebuilding, setRebuilding] = useState(false);

  const loadPage = useCallback(async (): Promise<PageData> => {
    const summariesRef = collection(db, `orgs/${orgId}/evaluationSummaryReadModels`);
    const summariesSnap = await getDocs(query(summariesRef));

    const summaries = summariesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationSummaryReadModel, "id">),
      }))
      .sort((a, b) => {
        if ((b.overallPercentage ?? 0) !== (a.overallPercentage ?? 0)) {
          return (b.overallPercentage ?? 0) - (a.overallPercentage ?? 0);
        }
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });

    return { summaries };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Summary Dashboard");
  }, [error]);

  async function rebuildAll() {
    setRebuilding(true);

    try {
      const submissionsSnap = await getDocs(
        query(collection(db, `orgs/${orgId}/evaluationSubmissions`))
      );
      const peopleSnap = await getDocs(query(collection(db, `orgs/${orgId}/people`)));
      const plansSnap = await getDocs(query(collection(db, `orgs/${orgId}/evaluationPlans`)));

      const submissions = submissionsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SubmissionRow, "id">),
      }));

      const people = peopleSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      }));

      const plans = plansSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PlanRow, "id">),
      }));

      const summaries = buildEvaluationSummaryReadModels({
        orgId,
        submissions,
        people,
        plans,
      });

      const chunkSize = 400;

      for (let i = 0; i < summaries.length; i += chunkSize) {
        const chunk = summaries.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const row of chunk) {
          batch.set(
            doc(db, `orgs/${orgId}/evaluationSummaryReadModels/${row.id}`),
            row,
            { merge: true }
          );
        }

        await batch.commit();
      }

      toast.success("تمت إعادة بناء Summary Read Models");
      await reload();
    } catch {
      toast.error("تعذر إعادة بناء Summary Read Models");
    } finally {
      setRebuilding(false);
    }
  }

  const totalTargets = data?.summaries.length ?? 0;
  const approvedTargets =
    data?.summaries.filter((item) => item.approvedCount > 0).length ?? 0;
  const averagePercentage =
    totalTargets > 0
      ? round2(
          (data?.summaries ?? []).reduce(
            (sum, item) => sum + Number(item.overallPercentage || 0),
            0
          ) / totalTargets
        )
      : 0;
  const totalApprovedSubmissions =
    data?.summaries.reduce((sum, item) => sum + Number(item.approvedCount || 0), 0) ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Summary Dashboard"
        badgeIcon={<BarChart3 className="h-3.5 w-3.5" />}
        title="Evaluation Summary Dashboard"
        description="ملخصات التقييم لكل مستهدف داخل المؤسسة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button onClick={rebuildAll} disabled={rebuilding}>
              {rebuilding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ إعادة البناء...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  إعادة بناء الملخصات
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="عدد المستهدفين" value={totalTargets} hint="Targets in read model" />
        <InfoCard label="لهم اعتماد" value={approvedTargets} hint="approvedCount > 0" />
        <InfoCard label="المتوسط العام %" value={averagePercentage} hint="overallPercentage avg" />
        <InfoCard label="إدخالات معتمدة" value={totalApprovedSubmissions} hint="sum approvedCount" />
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
        title="الملخصات"
        description="ملخص كل مستهدف مع آخر دورة وعدد الإدخالات والنسبة العامة."
        contentClassName="space-y-4"
      >
        {(data?.summaries.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Summary Read Models حتى الآن. استخدم زر إعادة البناء أو احفظ بعض الـ Submissions أولًا.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.summaries ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{row.targetDisplayName}</h3>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {row.targetRoleKey || "—"}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getStatusLabel(row.latestStatus)}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div>
                        آخر خطة:{" "}
                        <span className="font-medium text-foreground">
                          {row.latestPlanTitle || "—"}
                        </span>
                      </div>

                      <div>
                        آخر دورة:{" "}
                        <span className="font-medium text-foreground">
                          {row.latestCycleLabel || "—"}
                        </span>
                      </div>

                      <div>
                        إجمالي الإدخالات:{" "}
                        <span className="font-medium text-foreground">
                          {row.totalSubmissions}
                        </span>
                        {" "}— المعتمدة:{" "}
                        <span className="font-medium text-foreground">
                          {row.approvedCount}
                        </span>
                      </div>

                      <div>
                        النسبة العامة:{" "}
                        <span className="font-medium text-foreground">
                          {row.overallPercentage}%
                        </span>
                        {" "}— weighted avg:{" "}
                        <span className="font-medium text-foreground">
                          {row.weightedScoreAverage}
                        </span>
                      </div>

                      <div>
                        آخر تحديث:{" "}
                        <span className="font-medium text-foreground">
                          {formatDate(row.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/people/${row.targetPersonId}`}>
                        فتح الشخص
                      </Link>
                    </Button>

                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/evaluations/summary/${row.targetPersonId}`}>
                        فتح التفاصيل
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