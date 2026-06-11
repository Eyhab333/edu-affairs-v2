"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Plus } from "lucide-react";
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
  label: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type SubmissionRow = {
  id: string;
  planId: string;
  cycleId?: string;
  orgId?: string;
  schoolId: string;
  academicYearId: string;
  evaluatorPersonId: string;
  evaluatorRoleKey?: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
  targetRoleKey?: string;
  cycleLabel: string;
  templateKey?: string;
  status: string;
  submittedAt?: number;
  reviewedAt?: number;
  approvedAt?: number;
  lockedAt?: number;
  reviewedByPersonId?: string;
  approvedByPersonId?: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  summary?: string;
  recommendations?: string;
};

type PageData = {
  schools: SchoolRow[];
  years: AcademicYearRow[];
  plans: PlanRow[];
  cycles: CycleRow[];
  people: PersonRow[];
  submissions: SubmissionRow[];
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

export default function EvaluationSubmissionsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const cyclesRef = collection(db, `orgs/${orgId}/evaluationCycles`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const submissionsRef = collection(db, `orgs/${orgId}/evaluationSubmissions`);

    const [schoolsSnap, plansSnap, cyclesSnap, peopleSnap, submissionsSnap] =
      await Promise.all([
        getDocs(query(schoolsRef)),
        getDocs(query(plansRef)),
        getDocs(query(cyclesRef)),
        getDocs(query(peopleRef)),
        getDocs(query(submissionsRef)),
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

    const cycles = cyclesSnap.docs.map((item) => ({
      id: item.id,
      label: (item.data() as { label?: string }).label ?? item.id,
    }));

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PersonRow, "id">),
    }));

    const submissions = submissionsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SubmissionRow, "id">),
      }))
      .sort((a, b) => {
        const aTime = a.submittedAt ?? a.approvedAt ?? a.reviewedAt ?? 0;
        const bTime = b.submittedAt ?? b.approvedAt ?? b.reviewedAt ?? 0;
        return bTime - aTime;
      });

    return {
      schools,
      years: yearsNested.flat(),
      plans,
      cycles,
      people,
      submissions,
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Submissions");
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
  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );

  const total = data?.submissions.length ?? 0;
  const drafts =
    data?.submissions.filter((item) => item.status === "DRAFT").length ?? 0;
  const approved =
    data?.submissions.filter((item) => item.status === "APPROVED").length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Submissions"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title="Submissions"
        description="إدخالات التقييم الفعلية المرتبطة بالخطط والدورات."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/submissions/new`}>
                <Plus className="h-4 w-4" />
                إضافة Submission
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي Submissions" value={total} hint="كل إدخالات التقييم" />
        <InfoCard label="المسودات" value={drafts} hint="لم تُرسل بعد" />
        <InfoCard label="المعتمدة" value={approved} hint="APPROVED" />
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
        description="كل الإدخالات الحالية داخل المؤسسة."
        contentClassName="space-y-4"
      >
        {(data?.submissions.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Submissions حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.submissions ?? []).map((row) => {
              const targetId = row.targetPersonId || row.targetTeacherPersonId || "";
              return (
                <div key={row.id} className="rounded-2xl border bg-card p-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {peopleMap.get(targetId) || targetId || "بدون مستهدف"}
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
                        الخطة:{" "}
                        <span className="font-medium text-foreground">
                          {planMap.get(row.planId) ?? row.planId}
                        </span>
                      </div>

                      <div>
                        المقيم:{" "}
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
                    </div>

                    <div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orgs/${orgId}/evaluations/submissions/${row.id}`}>
                          فتح الإدخال
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>
    </div>
  );
}