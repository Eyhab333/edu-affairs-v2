"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Route, Save } from "lucide-react";
import { collection, getDocs, query, writeBatch, doc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildEvaluationAssignmentsBootstrapPreview,
  type BootstrapPlan,
} from "@/lib/evaluation-assignment-bootstrap";
import type {
  DistributionMembership,
  DistributionPerson,
  DistributionTargetAssignment,
} from "@/lib/evaluation-distribution";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolRow = {
  id: string;
  name: string;
};

type PageData = {
  schools: SchoolRow[];
  people: DistributionPerson[];
  memberships: DistributionMembership[];
  plans: BootstrapPlan[];
  existingAssignments: DistributionTargetAssignment[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[760px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getUnresolvedReasonLabel(reason: string) {
  switch (reason) {
    case "NO_SCHOOL_SCOPE":
      return "لا يوجد نطاق مدرسة واضح للمستهدف";
    case "NO_EVALUATOR_MATCH":
      return "لا يوجد مقيّم مطابق";
    case "MULTIPLE_EVALUATORS":
      return "يوجد أكثر من مقيّم مطابق ولم يتم الحسم";
    case "MISSING_TARGET_PERSON":
      return "العضوية بدون personId";
    default:
      return reason;
  }
}

export default function EvaluationAssignmentsBootstrapPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();
  const [schoolId, setSchoolId] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPage = useCallback(async (): Promise<PageData> => {
    const [schoolsSnap, peopleSnap, membershipsSnap, plansSnap, assignmentsSnap] =
      await Promise.all([
        getDocs(query(collection(db, `orgs/${orgId}/schools`))),
        getDocs(query(collection(db, `orgs/${orgId}/people`))),
        getDocs(query(collection(db, `orgs/${orgId}/memberships`))),
        getDocs(query(collection(db, `orgs/${orgId}/evaluationPlans`))),
        getDocs(query(collection(db, `orgs/${orgId}/evaluationTargetAssignments`))),
      ]);

    return {
      schools: schoolsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolRow, "id">),
      })),
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionPerson, "id">),
      })),
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionMembership, "id">),
      })),
      plans: plansSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
        ...(item.data() as Omit<BootstrapPlan, "id" | "title">),
      })),
      existingAssignments: assignmentsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<DistributionTargetAssignment, "id">),
      })),
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل bootstrap");
  }, [error]);

  const filteredPlans = useMemo(() => {
    return (data?.plans ?? []).filter((plan) => {
      if (schoolId && String(plan.schoolId || "") !== schoolId) return false;
      if (targetRoleKey && String(plan.targetRoleKey || "") !== targetRoleKey) return false;
      return true;
    });
  }, [data?.plans, schoolId, targetRoleKey]);

  const preview = useMemo(() => {
    if (!data) return null;

    const plansForPreview =
      schoolId || targetRoleKey ? filteredPlans : data.plans;

    return buildEvaluationAssignmentsBootstrapPreview({
      schools: data.schools,
      people: data.people,
      memberships: data.memberships,
      plans: plansForPreview,
      existingAssignments: data.existingAssignments,
    });
  }, [data, filteredPlans, schoolId, targetRoleKey]);

  async function persistProposals() {
    if (!preview || preview.proposed.length === 0) {
      toast.error("لا توجد روابط مقترحة للحفظ.");
      return;
    }

    setSaving(true);

    try {
      const nowMs = Date.now();
      const chunkSize = 400;

      for (let i = 0; i < preview.proposed.length; i += chunkSize) {
        const chunk = preview.proposed.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const row of chunk) {
          const docId = `eval-assignment-${row.schoolId}-${row.targetPersonId}-${row.targetRoleKey}-${row.evaluatorPersonId}-${row.evaluatorRoleKey}`;

          batch.set(
            doc(db, `orgs/${orgId}/evaluationTargetAssignments/${docId}`),
            {
              id: docId,
              orgId,
              schoolId: row.schoolId,
              targetPersonId: row.targetPersonId,
              evaluatorPersonId: row.evaluatorPersonId,
              evaluatorRoleKey: row.evaluatorRoleKey,
              targetRoleKey: row.targetRoleKey,
              relationType: row.relationType,
              priority: row.priority,
              isActive: true,
              sourceType: row.sourceType,
              sourcePlanIds: row.sourcePlanIds,
              sourcePlanTitles: row.sourcePlanTitles,
              notes: `AUTO_BOOTSTRAP | plans: ${row.sourcePlanTitles.join("، ")}`,
              createdAt: nowMs,
              updatedAt: nowMs,
            },
            { merge: true }
          );
        }

        await batch.commit();
      }

      toast.success("تم إنشاء روابط التقييم الدقيقة بنجاح");
      router.push(`/orgs/${orgId}/evaluations/assignments`);
      router.refresh();
    } catch {
      toast.error("تعذر حفظ الروابط المقترحة");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Bootstrap Assignments"
        badgeIcon={<Route className="h-3.5 w-3.5" />}
        title="Bootstrap روابط التقييم الدقيقة"
        description="معاينة الروابط المقترحة من العضويات والعلاقات الحالية ثم حفظها دفعة واحدة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/assignments`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى Assignments
              </Link>
            </Button>

            <Button
              onClick={persistProposals}
              disabled={saving || (preview?.proposed.length ?? 0) === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ المقترحات
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-6">
        <InfoCard label="Plans" value={preview?.stats.plansCount ?? 0} hint="بعد الفلاتر" />
        <InfoCard label="Targets" value={preview?.stats.targetsSeen ?? 0} hint="Targets seen" />
        <InfoCard label="Proposed" value={preview?.stats.proposedCount ?? 0} hint="قابلة للحفظ" />
        <InfoCard label="Skipped" value={preview?.stats.skippedCount ?? 0} hint="موجودة مسبقًا" />
        <InfoCard label="Direct links" value={preview?.stats.directLinkCount ?? 0} hint="من direct/supervisor..." />
        <InfoCard label="Unique matches" value={preview?.stats.uniqueRoleMatchCount ?? 0} hint="Evaluator unique by role" />
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
        title="الفلاتر"
        description="يمكنك تضييق الـ bootstrap قبل الحفظ."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">المدرسة</label>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">الكل</option>
            {(data?.schools ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الدور المستهدف</label>
          <input
            value={targetRoleKey}
            onChange={(e) => setTargetRoleKey(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            placeholder="مثال: teacher"
          />
        </div>
      </FormSection>

      {preview?.issues && preview.issues.length > 0 ? (
        <FormSection
          title="ملاحظات"
          description="تنبيهات عامة على المعاينة الحالية."
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
        title="المقترحات"
        description="هذه الروابط سيتم حفظها داخل evaluationTargetAssignments."
        contentClassName="space-y-4"
      >
        {(preview?.proposed.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد مقترحات قابلة للحفظ حاليًا.
          </div>
        ) : (
          <div className="grid gap-4">
            {(preview?.proposed ?? []).map((row) => (
              <div key={row.key} className="rounded-2xl border bg-card p-4">
                <div className="space-y-2 text-sm">
                  <div className="font-semibold">
                    {row.targetDisplayName} ← {row.evaluatorDisplayName}
                  </div>
                  <div className="text-muted-foreground">
                    المدرسة: <span className="font-medium text-foreground">{row.schoolLabel}</span>
                  </div>
                  <div className="text-muted-foreground">
                    الأدوار:{" "}
                    <span className="font-medium text-foreground">
                      {row.targetRoleKey} / {row.evaluatorRoleKey}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    المصدر: <span className="font-medium text-foreground">{row.sourceType}</span>
                    {" "}— relationType:{" "}
                    <span className="font-medium text-foreground">{row.relationType}</span>
                  </div>
                  <div className="text-muted-foreground">
                    plans:{" "}
                    <span className="font-medium text-foreground">
                      {row.sourcePlanTitles.join("، ")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="تم تخطيها"
        description="روابط موجودة بالفعل داخل evaluationTargetAssignments."
        contentClassName="space-y-4"
      >
        {(preview?.skippedExisting.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد عناصر تم تخطيها.
          </div>
        ) : (
          <div className="grid gap-4">
            {(preview?.skippedExisting ?? []).map((row) => (
              <div key={row.key} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="font-semibold">
                  {row.targetDisplayName} ← {row.evaluatorDisplayName}
                </div>
                <div className="mt-2 text-muted-foreground">
                  المدرسة: <span className="font-medium text-foreground">{row.schoolLabel}</span>
                  {" "}— plans:{" "}
                  <span className="font-medium text-foreground">{row.sourcePlanTitles.join("، ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="غير محلولة"
        description="حالات تحتاج تدخلك قبل أن يكتمل الربط التلقائي."
        contentClassName="space-y-4"
      >
        {(preview?.unresolved.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد حالات غير محلولة.
          </div>
        ) : (
          <div className="grid gap-4">
            {(preview?.unresolved ?? []).map((row) => (
              <div key={row.key} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="font-semibold">{row.targetDisplayName}</div>
                <div className="mt-2 text-muted-foreground">
                  المدرسة: <span className="font-medium text-foreground">{row.schoolLabel}</span>
                  {" "}— targetRole:{" "}
                  <span className="font-medium text-foreground">{row.targetRoleKey}</span>
                  {" "}— evaluatorRole:{" "}
                  <span className="font-medium text-foreground">{row.evaluatorRoleKey}</span>
                </div>
                <div className="mt-2 text-destructive">
                  {getUnresolvedReasonLabel(row.reason)}
                </div>
                <div className="mt-2 text-muted-foreground">
                  plans:{" "}
                  <span className="font-medium text-foreground">
                    {row.sourcePlanTitles.join("، ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}