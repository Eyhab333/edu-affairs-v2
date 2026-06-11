"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Loader2,
  RefreshCcw,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import { EvaluationSubmissionSchema } from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildCycleDistributionPreview,
  type DistributionMembership,
  type DistributionPerson,
  type DistributionPlan,
  type DistributionPolicy,
  type DistributionSubmission,
  type DistributionTargetAssignment,
} from "@/lib/evaluation-distribution";
import { buildEvaluationSummaryReadModels } from "@/lib/evaluation-read-model";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type CycleRow = {
  id: string;
  planId: string;
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

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  title: string;
};

type PageData = {
  cycle: CycleRow;
  school: SchoolRow | null;
  year: AcademicYearRow | null;
  plan: DistributionPlan | null;
  memberships: DistributionMembership[];
  policies: DistributionPolicy[];
  people: DistributionPerson[];
  submissions: DistributionSubmission[];
  targetAssignments: DistributionTargetAssignment[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[760px] animate-pulse rounded-2xl bg-muted" />
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

function getSourceLabel(sourceType: string, sourceLabel?: string) {
  if (sourceType === "TARGET_ASSIGNMENT") {
    return `ربط مباشر${sourceLabel ? ` — ${sourceLabel}` : ""}`;
  }
  if (sourceType === "MEMBERSHIP_LINK") {
    return "رابط من العضوية";
  }
  return "بديل عام حسب الدور";
}

export default function EvaluationCycleDetailsPage() {
  const params = useParams<{ orgId: string; cycleId: string }>();
  const orgId = params.orgId;
  const cycleId = params.cycleId;

  const { user, checkingAuth } = useRequireAuth();
  const [generating, setGenerating] = useState(false);

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const cycleRef = doc(db, `orgs/${orgId}/evaluationCycles/${cycleId}`);
    const cycleSnap = await getDoc(cycleRef);

    if (!cycleSnap.exists()) return null;

    const cycle = {
      id: cycleSnap.id,
      ...(cycleSnap.data() as Omit<CycleRow, "id">),
    };

    const schoolSnap = cycle.schoolId
      ? await getDoc(doc(db, `orgs/${orgId}/schools/${cycle.schoolId}`))
      : null;

    const yearSnap = cycle.schoolId
      ? await getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${cycle.schoolId}/academicYears/${cycle.academicYearId}`
          )
        )
      : null;

    const [
      planSnap,
      membershipsSnap,
      policiesSnap,
      peopleSnap,
      submissionsSnap,
      targetAssignmentsSnap,
    ] = await Promise.all([
      getDoc(doc(db, `orgs/${orgId}/evaluationPlans/${cycle.planId}`)),
      getDocs(query(collection(db, `orgs/${orgId}/memberships`))),
      getDocs(query(collection(db, `orgs/${orgId}/evaluatorPolicies`))),
      getDocs(query(collection(db, `orgs/${orgId}/people`))),
      getDocs(query(collection(db, `orgs/${orgId}/evaluationSubmissions`))),
      getDocs(query(collection(db, `orgs/${orgId}/evaluationTargetAssignments`))),
    ]);

    return {
      cycle,
      school:
        schoolSnap && schoolSnap.exists()
          ? ({
              id: schoolSnap.id,
              ...(schoolSnap.data() as Omit<SchoolRow, "id">),
            } as SchoolRow)
          : null,
      year:
        yearSnap && yearSnap.exists()
          ? ({
              id: yearSnap.id,
              title: (yearSnap.data() as { title?: string }).title ?? yearSnap.id,
            } as AcademicYearRow)
          : null,
      plan: planSnap.exists()
        ? ({
            id: planSnap.id,
            ...(planSnap.data() as Omit<DistributionPlan, "id">),
          } as DistributionPlan)
        : null,
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionMembership, "id">),
      })),
      policies: policiesSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionPolicy, "id">),
      })),
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionPerson, "id">),
      })),
      submissions: submissionsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionSubmission, "id">),
      })),
      targetAssignments: targetAssignmentsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionTargetAssignment, "id">),
      })),
    };
  }, [orgId, cycleId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, cycleId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل تفاصيل الدورة");
  }, [error]);

  const preview = useMemo(() => {
    if (!data?.cycle || !data?.plan || !data.cycle.schoolId) return null;

    return buildCycleDistributionPreview({
      schoolId: data.cycle.schoolId,
      plan: data.plan,
      cycle: {
        id: data.cycle.id,
        planId: data.cycle.planId,
        schoolId: data.cycle.schoolId,
        academicYearId: data.cycle.academicYearId,
        label: data.cycle.label,
        isOpen: data.cycle.isOpen,
        isLocked: data.cycle.isLocked,
      },
      memberships: data.memberships,
      policies: data.policies,
      people: data.people,
      existingSubmissions: data.submissions,
      targetAssignments: data.targetAssignments,
    });
  }, [data]);

  async function rebuildSummaryReadModels() {
    const submissionsSnap = await getDocs(
      query(collection(db, `orgs/${orgId}/evaluationSubmissions`))
    );
    const plansSnap = await getDocs(
      query(collection(db, `orgs/${orgId}/evaluationPlans`))
    );
    const peopleSnap = await getDocs(query(collection(db, `orgs/${orgId}/people`)));

    const submissions = submissionsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Record<string, unknown>),
    }));

    const plans = plansSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Record<string, unknown>),
    }));

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Record<string, unknown>),
    }));

    const summaries = buildEvaluationSummaryReadModels({
      orgId,
      submissions: submissions as never,
      plans: plans as never,
      people: people as never,
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
  }

  async function generateDraftSubmissions() {
    if (!data?.cycle || !data?.plan || !data.cycle.schoolId || !preview) return;

    if (data.cycle.isOpen === false) {
      toast.error("هذه الدورة مغلقة.");
      return;
    }

    if (data.cycle.isLocked) {
      toast.error("هذه الدورة مقفلة.");
      return;
    }

    if (preview.assignments.length === 0) {
      toast.error("لا توجد Assignments قابلة للتوليد.");
      return;
    }

    setGenerating(true);

    try {
      const nowMs = Date.now();
      const chunkSize = 400;

      for (let i = 0; i < preview.assignments.length; i += chunkSize) {
        const chunk = preview.assignments.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const payload = {
            id: item.submissionId,
            planId: data.plan.id,
            cycleId: data.cycle.id,
            orgId,
            schoolId: data.cycle.schoolId,
            academicYearId: data.cycle.academicYearId,
            evaluatorPersonId: item.evaluatorPersonId,
            evaluatorRoleKey: data.plan.evaluatorRoleKey || undefined,
            targetPersonId: item.targetPersonId,
            targetTeacherPersonId:
              data.plan.targetKind === "TEACHER" ? item.targetPersonId : "",
            targetRoleKey: data.plan.targetRoleKey || undefined,
            cycleLabel: data.cycle.label,
            templateKey: data.plan.templateKey || "",
            status: "DRAFT",
            submittedAt: undefined,
            reviewedAt: undefined,
            approvedAt: undefined,
            lockedAt: undefined,
            reviewedByPersonId: "",
            approvedByPersonId: "",
            totalScore: 0,
            maxScore: 0,
            weightedScore: 0,
            summary: "",
            recommendations: "",
            createdAt: nowMs,
            updatedAt: nowMs,
          };

          const parsed = EvaluationSubmissionSchema.safeParse(payload);
          if (!parsed.success) {
            throw new Error(
              parsed.error.issues.map((issue) => issue.message).join("\n")
            );
          }

          batch.set(
            doc(db, `orgs/${orgId}/evaluationSubmissions/${item.submissionId}`),
            parsed.data
          );
        }

        await batch.commit();
      }

      await rebuildSummaryReadModels();
      toast.success("تم توليد Draft Submissions بنجاح");
      await reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر توليد Draft Submissions";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="Cycle"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title="تعذر العثور على الدورة"
        description="قد لا تكون هذه الدورة موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/evaluations/cycles`}>
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
        badge="Cycle"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title={data?.cycle.label ?? "Cycle"}
        description="معاينة التوزيع الدقيق ثم توليد Draft Submissions لهذه الدورة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/cycles`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى Cycles
              </Link>
            </Button>

            {data?.cycle.schoolId ? (
              <Button asChild variant="outline">
                <Link href={`/orgs/${orgId}/evaluations/assignments`}>
                  فتح روابط التقييم
                </Link>
              </Button>
            ) : null}

            <Button
              onClick={generateDraftSubmissions}
              disabled={
                generating ||
                !preview ||
                preview.assignments.length === 0 ||
                data?.cycle.isOpen === false ||
                !!data?.cycle.isLocked
              }
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ التوليد...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  توليد Draft Submissions
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <InfoCard label="Policies مطابقة" value={preview?.matchingPoliciesCount ?? 0} hint="Matching policies" />
        <InfoCard label="المقيّمون" value={preview?.evaluators.length ?? 0} hint="Active evaluators" />
        <InfoCard label="المستهدفون" value={preview?.targets.length ?? 0} hint="Active targets" />
        <InfoCard label="سيتم إنشاؤها" value={preview?.assignments.length ?? 0} hint="New drafts" />
        <InfoCard label="غير محلولين" value={preview?.unresolvedTargets.length ?? 0} hint="No evaluator found" />
      </div>

      <FormSection
        title="مصادر التوزيع"
        description="نسبة ما تم ربطه مباشرة وما تم بناؤه من العضويات أو من البديل العام."
        contentClassName="grid gap-4 md:grid-cols-3"
      >
        <InfoCard
          label="ربط مباشر"
          value={preview?.directTargetAssignmentCount ?? 0}
          hint="evaluationTargetAssignments"
        />
        <InfoCard
          label="من العضوية"
          value={preview?.membershipLinkCount ?? 0}
          hint="direct/supervisor/manager/principal links"
        />
        <InfoCard
          label="بديل عام"
          value={preview?.fallbackAssignmentCount ?? 0}
          hint="role fallback"
        />
      </FormSection>

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
        title="معلومات الدورة"
        description="مرجع سريع قبل تنفيذ التوليد."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الخطة:{" "}
          <span className="font-medium text-foreground">
            {data?.plan?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          المدرسة:{" "}
          <span className="font-medium text-foreground">
            {data?.school?.name || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          السنة الدراسية:{" "}
          <span className="font-medium text-foreground">
            {data?.year?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          النوع:{" "}
          <span className="font-medium text-foreground">
            {getCycleTypeLabel(data?.cycle.cycleType)}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          البداية:{" "}
          <span className="font-medium text-foreground">
            {formatDate(data?.cycle.startsAt)}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          النهاية:{" "}
          <span className="font-medium text-foreground">
            {formatDate(data?.cycle.endsAt)}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          دور المقيّم:{" "}
          <span className="font-medium text-foreground">
            {data?.plan?.evaluatorRoleKey || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الدور المستهدف:{" "}
          <span className="font-medium text-foreground">
            {data?.plan?.targetRoleKey || "—"}
          </span>
        </div>
      </FormSection>

      {preview?.issues && preview.issues.length > 0 ? (
        <FormSection
          title="ملاحظات قبل التوليد"
          description="هذه الرسائل تساعدك على فهم سبب عدم توليد بعض العناصر."
          contentClassName="space-y-3"
        >
          {preview.issues.map((issue, index) => (
            <div
              key={index}
              className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
            >
              {issue}
            </div>
          ))}
        </FormSection>
      ) : null}

      <FormSection
        title="المقيّمون"
        description="المقيّمون النشطون المطابقون لهذه الدورة."
        contentClassName="space-y-4"
      >
        {(preview?.evaluators.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا يوجد مقيّمون مطابقون.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(preview?.evaluators ?? []).map((row) => (
              <span
                key={row.personId}
                className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"
              >
                {row.displayName}
              </span>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="المعاينة"
        description="هذه هي التوزيعات التي سيتم إنشاؤها كـ Draft Submissions."
        contentClassName="space-y-4"
      >
        {(preview?.assignments.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد Assignments قابلة للتوليد الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(preview?.assignments ?? []).map((item) => (
              <div key={item.submissionId} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Users className="h-4 w-4" />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      المقيّم:{" "}
                      <span className="font-medium">{item.evaluatorDisplayName}</span>
                    </div>
                    <div>
                      المستهدف:{" "}
                      <span className="font-medium">{item.targetDisplayName}</span>
                    </div>
                    <div>
                      المصدر:{" "}
                      <span className="font-medium">
                        {getSourceLabel(item.sourceType, item.sourceLabel)}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      submissionId: {item.submissionId}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="غير محلولين"
        description="مستهدفون لم يتم العثور لهم على مقيّم مناسب."
        contentClassName="space-y-4"
      >
        {(preview?.unresolvedTargets.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا يوجد مستهدفون غير محلولين.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(preview?.unresolvedTargets ?? []).map((row) => (
              <span
                key={row.personId}
                className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"
              >
                {row.displayName}
              </span>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="تم تخطيهم"
        description="مستهدفون لديهم Draft Submissions موجودة بالفعل لهذه الدورة."
        contentClassName="space-y-4"
      >
        {(preview?.skippedExistingTargets.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا يوجد مستهدفون تم تخطيهم.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(preview?.skippedExistingTargets ?? []).map((row) => (
              <span
                key={row.personId}
                className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"
              >
                {row.displayName}
              </span>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}