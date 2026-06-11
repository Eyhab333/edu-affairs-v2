"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  EvaluationApprovalMode,
  EvaluationCycleType,
  EvaluationFrequencyType,
  EvaluationPlanSchema,
  EvaluationTargetKind,
  MembershipRole,
} from "@takween/contracts";
import { ArrowLeft, GitBranch, Loader2, Save } from "lucide-react";
import { collection, getDocs, query, setDoc, doc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolRow = {
  id: string;
  name: string;
};

type FrameworkRow = {
  id: string;
  title: string;
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewEvaluationPlanPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkRow[]>([]);

  const [frameworkId, setFrameworkId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [evaluatorRoleKey, setEvaluatorRoleKey] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");
  const [targetKind, setTargetKind] =
    useState<(typeof EvaluationTargetKind.options)[number]>("TEACHER");
  const [templateKey, setTemplateKey] = useState("");
  const [title, setTitle] = useState("");
  const [frequencyType, setFrequencyType] =
    useState<(typeof EvaluationFrequencyType.options)[number]>("WEEKLY");
  const [cycleType, setCycleType] = useState("");
  const [weeksCount, setWeeksCount] = useState("0");
  const [visitsCount, setVisitsCount] = useState("0");
  const [monthsCount, setMonthsCount] = useState("0");
  const [termsCount, setTermsCount] = useState("0");
  const [approvalMode, setApprovalMode] =
    useState<(typeof EvaluationApprovalMode.options)[number]>("NONE");
  const [tagsText, setTagsText] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MembershipRole.options], []);
  const targetKindOptions = useMemo(() => [...EvaluationTargetKind.options], []);
  const frequencyOptions = useMemo(() => [...EvaluationFrequencyType.options], []);
  const cycleOptions = useMemo(() => [...EvaluationCycleType.options], []);
  const approvalOptions = useMemo(() => [...EvaluationApprovalMode.options], []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [schoolsSnap, frameworksSnap] = await Promise.all([
          getDocs(query(collection(db, `orgs/${orgId}/schools`))),
          getDocs(query(collection(db, `orgs/${orgId}/evaluationFrameworks`))),
        ]);

        if (cancelled) return;

        setSchools(
          schoolsSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<SchoolRow, "id">),
          }))
        );

        setFrameworks(
          frameworksSnap.docs.map((item) => ({
            id: item.id,
            title: (item.data() as { title?: string }).title ?? item.id,
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

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("evaluation-plan");
      const nowMs = Date.now();

      const tags = tagsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        id,
        frameworkId: frameworkId || undefined,
        orgId,
        schoolId: schoolId || "",
        evaluatorRoleKey: evaluatorRoleKey || undefined,
        targetRoleKey: targetRoleKey || undefined,
        targetKind,
        templateKey: templateKey.trim(),
        title: title.trim(),
        frequencyType,
        cycleType: cycleType || undefined,
        weeksCount: Number(weeksCount || 0),
        visitsCount: Number(visitsCount || 0),
        monthsCount: Number(monthsCount || 0),
        termsCount: Number(termsCount || 0),
        approvalMode,
        tags,
        isActive,
        description: description.trim(),
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluationPlanSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/evaluationPlans/${id}`), parsed.data);

      toast.success("تم إنشاء الـ Plan بنجاح");
      router.push(`/orgs/${orgId}/evaluations/plans`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الـ Plan");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[780px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="Plan جديدة"
        badgeIcon={<GitBranch className="h-3.5 w-3.5" />}
        title="إضافة Evaluation Plan"
        description="تعريف خطة تقييم جديدة مرتبطة بـ Framework."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/plans`}>
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
        title="بيانات الخطة"
        description="أدخل الـ Framework والدورين والتكرار والاعتماد."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Framework</label>
            <select
              value={frameworkId}
              onChange={(e) => setFrameworkId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {frameworks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المدرسة</label>
            <select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">على مستوى المؤسسة</option>
              {schools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">دور المقيّم</label>
            <select
              value={evaluatorRoleKey}
              onChange={(e) => setEvaluatorRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الدور المستهدف</label>
            <select
              value={targetRoleKey}
              onChange={(e) => setTargetRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الفئة المستهدفة</label>
            <select
              value={targetKind}
              onChange={(e) =>
                setTargetKind(e.target.value as (typeof EvaluationTargetKind.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {targetKindOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان الخطة</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">templateKey</label>
            <Input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">frequencyType</label>
            <select
              value={frequencyType}
              onChange={(e) =>
                setFrequencyType(
                  e.target.value as (typeof EvaluationFrequencyType.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {frequencyOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">cycleType</label>
            <select
              value={cycleType}
              onChange={(e) => setCycleType(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {cycleOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">approvalMode</label>
            <select
              value={approvalMode}
              onChange={(e) =>
                setApprovalMode(
                  e.target.value as (typeof EvaluationApprovalMode.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {approvalOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">weeksCount</label>
            <Input type="number" min={0} value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">visitsCount</label>
            <Input type="number" min={0} value={visitsCount} onChange={(e) => setVisitsCount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">monthsCount</label>
            <Input type="number" min={0} value={monthsCount} onChange={(e) => setMonthsCount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">termsCount</label>
            <Input type="number" min={0} value={termsCount} onChange={(e) => setTermsCount(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الوسوم (comma separated)</label>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الوصف</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="text-sm font-medium">مفعّل</div>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      </FormSection>
    </div>
  );
}