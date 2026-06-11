"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildEvaluationSummaryReadModels,
  getSubmissionTargetPersonId,
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
  evaluatorPersonId: string;
  status: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  summary?: string;
  recommendations?: string;
  submittedAt?: number;
  approvedAt?: number;
  reviewedAt?: number;
  lockedAt?: number;
  cancelledAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type PageData = {
  person: PersonRow;
  summary: EvaluationSummaryReadModel | null;
  submissions: SubmissionRow[];
  people: PersonRow[];
  plans: PlanRow[];
  schools: SchoolRow[];
  years: AcademicYearRow[];
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

export default function EvaluationSummaryDetailsPage() {
  const params = useParams<{ orgId: string; targetPersonId: string }>();
  const orgId = params.orgId;
  const targetPersonId = params.targetPersonId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const personRef = doc(db, `orgs/${orgId}/people/${targetPersonId}`);
    const summaryRef = doc(db, `orgs/${orgId}/evaluationSummaryReadModels/${targetPersonId}`);
    const submissionsRef = collection(db, `orgs/${orgId}/evaluationSubmissions`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);

    const [personSnap, summarySnap, submissionsSnap, peopleSnap, plansSnap, schoolsSnap] =
      await Promise.all([
        getDoc(personRef),
        getDoc(summaryRef),
        getDocs(query(submissionsRef)),
        getDocs(query(peopleRef)),
        getDocs(query(plansRef)),
        getDocs(query(schoolsRef)),
      ]);

    if (!personSnap.exists()) return null;

    const person = {
      id: personSnap.id,
      ...(personSnap.data() as Omit<PersonRow, "id">),
    };

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PersonRow, "id">),
    }));

    const plans = plansSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PlanRow, "id">),
    }));

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

    const submissions = submissionsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SubmissionRow, "id">),
      }))
      .filter((item) => getSubmissionTargetPersonId(item) === targetPersonId)
      .sort((a, b) => {
        const aTime = a.updatedAt ?? a.approvedAt ?? a.reviewedAt ?? a.submittedAt ?? a.createdAt ?? 0;
        const bTime = b.updatedAt ?? b.approvedAt ?? b.reviewedAt ?? b.submittedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
      });

    let summary: EvaluationSummaryReadModel | null = null;

    if (summarySnap.exists()) {
      summary = {
        id: summarySnap.id,
        ...(summarySnap.data() as Omit<EvaluationSummaryReadModel, "id">),
      };
    } else if (submissions.length > 0) {
      summary =
        buildEvaluationSummaryReadModels({
          orgId,
          submissions,
          people,
          plans,
        }).find((item) => item.targetPersonId === targetPersonId) ?? null;
    }

    return {
      person,
      summary,
      submissions,
      people,
      plans,
      schools,
      years: yearsNested.flat(),
    };
  }, [orgId, targetPersonId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, targetPersonId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل تفاصيل الملخص");
  }, [error]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );
  const planMap = useMemo(
    () => new Map((data?.plans ?? []).map((item) => [item.id, item.title || item.id])),
    [data?.plans]
  );
  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years]
  );

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="Summary Details"
        badgeIcon={<BarChart3 className="h-3.5 w-3.5" />}
        title="تعذر العثور على المستهدف"
        description="قد لا يكون الشخص موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/evaluations/summary`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Summary Details"
        badgeIcon={<BarChart3 className="h-3.5 w-3.5" />}
        title={data?.person.displayName ?? targetPersonId}
        description="تفاصيل الملخص التجميعي لهذا المستهدف."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/summary`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى Summary
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/people/${targetPersonId}`}>
                فتح الشخص
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="إجمالي الإدخالات" value={summary?.totalSubmissions ?? 0} hint="totalSubmissions" />
        <InfoCard label="المعتمدة" value={summary?.approvedCount ?? 0} hint="approvedCount" />
        <InfoCard label="النسبة العامة %" value={summary?.overallPercentage ?? 0} hint="overallPercentage" />
        <InfoCard label="weighted avg" value={summary?.weightedScoreAverage ?? 0} hint="weightedScoreAverage" />
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
        title="الملخص العام"
        description="أهم مؤشرات هذا المستهدف."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الدور المستهدف:{" "}
          <span className="font-medium text-foreground">
            {summary?.targetRoleKey || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          آخر حالة:{" "}
          <span className="font-medium text-foreground">
            {getStatusLabel(summary?.latestStatus)}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          آخر خطة:{" "}
          <span className="font-medium text-foreground">
            {summary?.latestPlanTitle || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          آخر دورة:{" "}
          <span className="font-medium text-foreground">
            {summary?.latestCycleLabel || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          مجموع الدرجات:{" "}
          <span className="font-medium text-foreground">
            {summary?.totalScoreSum ?? 0} / {summary?.maxScoreSum ?? 0}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          آخر تحديث:{" "}
          <span className="font-medium text-foreground">
            {formatDate(summary?.updatedAt)}
          </span>
        </div>
      </FormSection>

      <FormSection
        title="الإدخالات"
        description="كل الإدخالات المرتبطة بهذا المستهدف."
        contentClassName="space-y-4"
      >
        {(data?.submissions.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Submissions لهذا المستهدف حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.submissions ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {planMap.get(row.planId) ?? row.planId}
                      </h3>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {getStatusLabel(row.status)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {row.cycleLabel}
                      </span>
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
                          {schoolMap.get(row.schoolId) ?? row.schoolId}
                        </span>
                      </div>

                      <div>
                        السنة الدراسية:{" "}
                        <span className="font-medium text-foreground">
                          {yearMap.get(row.academicYearId) ?? row.academicYearId}
                        </span>
                      </div>

                      <div>
                        الدرجات:{" "}
                        <span className="font-medium text-foreground">
                          {row.totalScore ?? 0} / {row.maxScore ?? 0}
                        </span>
                        {" "}— weighted:{" "}
                        <span className="font-medium text-foreground">
                          {row.weightedScore ?? 0}
                        </span>
                      </div>

                      <div>
                        الملخص:{" "}
                        <span className="font-medium text-foreground">
                          {row.summary || "—"}
                        </span>
                      </div>

                      <div>
                        submittedAt:{" "}
                        <span className="font-medium text-foreground">
                          {formatDate(row.submittedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/orgs/${orgId}/evaluations/submissions/${row.id}`}>
                        فتح الإدخال
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