"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  EvaluationSubmissionSchema,
  EvaluationSubmissionStatus,
} from "@takween/contracts";
import { ArrowLeft, ClipboardCheck, Loader2, Save } from "lucide-react";
import { collection, getDocs, query, setDoc, doc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PlanRow = {
  id: string;
  schoolId?: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  targetKind: string;
  templateKey: string;
  title: string;
};

type CycleRow = {
  id: string;
  planId: string;
  schoolId?: string;
  academicYearId: string;
  label: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getSubmissionStatusLabel(status?: string) {
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

export default function NewEvaluationSubmissionPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);

  const [planId, setPlanId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [evaluatorPersonId, setEvaluatorPersonId] = useState("");
  const [targetPersonId, setTargetPersonId] = useState("");
  const [status, setStatus] =
    useState<(typeof EvaluationSubmissionStatus.options)[number]>("DRAFT");
  const [totalScore, setTotalScore] = useState("0");
  const [maxScore, setMaxScore] = useState("0");
  const [weightedScore, setWeightedScore] = useState("0");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [plansSnap, cyclesSnap, peopleSnap] = await Promise.all([
          getDocs(query(collection(db, `orgs/${orgId}/evaluationPlans`))),
          getDocs(query(collection(db, `orgs/${orgId}/evaluationCycles`))),
          getDocs(query(collection(db, `orgs/${orgId}/people`))),
        ]);

        if (cancelled) return;

        setPlans(
          plansSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<PlanRow, "id">),
          }))
        );

        setCycles(
          cyclesSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<CycleRow, "id">),
          }))
        );

        setPeople(
          peopleSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<PersonRow, "id">),
          }))
        );
      } catch {
        toast.error("تعذر تحميل البيانات المرجعية");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === planId),
    [plans, planId]
  );

  const cycleOptions = useMemo(
    () => cycles.filter((item) => item.planId === planId),
    [cycles, planId]
  );

  useEffect(() => {
    if (cycleId && !cycleOptions.some((item) => item.id === cycleId)) {
      setCycleId("");
    }
  }, [cycleId, cycleOptions]);

  const selectedCycle = useMemo(
    () => cycleOptions.find((item) => item.id === cycleId),
    [cycleOptions, cycleId]
  );

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!selectedPlan) throw new Error("يجب اختيار Plan.");
      if (!selectedCycle) throw new Error("يجب اختيار Cycle.");

      const id = generateId("evaluation-submission");
      const nowMs = Date.now();

      const isTeacherTarget = selectedPlan.targetKind === "TEACHER";

      const payload = {
        id,
        planId,
        cycleId,
        orgId,
        schoolId: selectedCycle.schoolId || selectedPlan.schoolId || "",
        academicYearId: selectedCycle.academicYearId,
        evaluatorPersonId,
        evaluatorRoleKey: selectedPlan.evaluatorRoleKey || undefined,
        targetPersonId,
        targetTeacherPersonId: isTeacherTarget ? targetPersonId : "",
        targetRoleKey: selectedPlan.targetRoleKey || undefined,
        cycleLabel: selectedCycle.label,
        templateKey: selectedPlan.templateKey || "",
        status,
        submittedAt: status === "SUBMITTED" ? nowMs : undefined,
        reviewedAt: undefined,
        approvedAt: undefined,
        lockedAt: undefined,
        reviewedByPersonId: "",
        approvedByPersonId: "",
        totalScore: Number(totalScore || 0),
        maxScore: Number(maxScore || 0),
        weightedScore: Number(weightedScore || 0),
        summary: summary.trim(),
        recommendations: recommendations.trim(),
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluationSubmissionSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/evaluationSubmissions/${id}`), parsed.data);

      toast.success("تم إنشاء الـ Submission بنجاح");
      router.push(`/orgs/${orgId}/evaluations/submissions/${id}`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الـ Submission");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[720px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="Submission جديدة"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title="إضافة Submission"
        description="إنشاء إدخال تقييم جديد مرتبط بخطة ودورة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/submissions`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="بيانات الإدخال"
        description="اختر الخطة والدورة والمقيّم والمستهدف."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Cycle</label>
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {cycleOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">المقيّم</label>
            <select
              value={evaluatorPersonId}
              onChange={(e) => setEvaluatorPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {people.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName ?? item.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المستهدف</label>
            <select
              value={targetPersonId}
              onChange={(e) => setTargetPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {people.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName ?? item.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedPlan && selectedCycle ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            <div>
              evaluatorRoleKey:{" "}
              <span className="font-medium text-foreground">
                {selectedPlan.evaluatorRoleKey}
              </span>
            </div>
            <div>
              targetRoleKey:{" "}
              <span className="font-medium text-foreground">
                {selectedPlan.targetRoleKey}
              </span>
            </div>
            <div>
              templateKey:{" "}
              <span className="font-medium text-foreground">
                {selectedPlan.templateKey}
              </span>
            </div>
            <div>
              cycleLabel:{" "}
              <span className="font-medium text-foreground">
                {selectedCycle.label}
              </span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof EvaluationSubmissionStatus.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {EvaluationSubmissionStatus.options.map((item) => (
                <option key={item} value={item}>
                  {getSubmissionStatusLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">totalScore</label>
            <Input
              type="number"
              min={0}
              value={totalScore}
              onChange={(e) => setTotalScore(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">maxScore</label>
            <Input
              type="number"
              min={0}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">weightedScore</label>
            <Input
              type="number"
              min={0}
              value={weightedScore}
              onChange={(e) => setWeightedScore(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الملخص</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">التوصيات</label>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
      </FormSection>
    </div>
  );
}