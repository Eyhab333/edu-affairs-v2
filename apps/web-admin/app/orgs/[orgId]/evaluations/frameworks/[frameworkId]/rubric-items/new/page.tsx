"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EvaluationRubricItemSchema } from "@takween/contracts";
import { ArrowLeft, ListChecks, Loader2, Save } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FrameworkRow = {
  id: string;
  title: string;
  targetRoleKey: string;
  targetKind: string;
  version: number;
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewRubricItemPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; frameworkId: string }>();
  const orgId = params.orgId;
  const frameworkId = params.frameworkId;

  const { checkingAuth } = useRequireAuth();

  const [templateKey, setTemplateKey] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("0");
  const [maxScore, setMaxScore] = useState("5");
  const [weight, setWeight] = useState("1");
  const [tagsText, setTagsText] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadFramework = useCallback(async (): Promise<FrameworkRow | null> => {
    const frameworkRef = doc(db, `orgs/${orgId}/evaluationFrameworks/${frameworkId}`);
    const frameworkSnap = await getDoc(frameworkRef);

    if (!frameworkSnap.exists()) return null;

    return {
      id: frameworkSnap.id,
      ...(frameworkSnap.data() as Omit<FrameworkRow, "id">),
    };
  }, [orgId, frameworkId]);

  const { data, loading, notFound } = useDocumentLoader<FrameworkRow | null>({
    enabled: true,
    loader: loadFramework,
    deps: [orgId, frameworkId],
  });

  useEffect(() => {
    if (!templateKey && data?.title) {
      setTemplateKey("GENERAL");
    }
  }, [data?.title, templateKey]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("rubric-item");
      const nowMs = Date.now();

      const payload = {
        id,
        frameworkId,
        templateKey: templateKey.trim(),
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        order: Number(order || 0),
        maxScore: Number(maxScore || 0),
        weight: Number(weight || 0),
        tags: tagsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        isRequired,
        isActive,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluationRubricItemSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(
        doc(db, `orgs/${orgId}/evaluationRubricItems/${id}`),
        parsed.data
      );

      toast.success("تم إنشاء البند بنجاح");
      router.push(`/orgs/${orgId}/evaluations/frameworks/${frameworkId}/rubric-items`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء البند");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[680px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <PageHero
        badge="Rubric Item"
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
        badge="Rubric Item"
        badgeIcon={<ListChecks className="h-3.5 w-3.5" />}
        title="إضافة بند Rubric"
        description={`Framework: ${data.title}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/frameworks/${frameworkId}/rubric-items`}>
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
        title="بيانات البند"
        description="أدخل بيانات البند كما سيظهر داخل الـ Submission."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">templateKey</label>
            <Input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">category</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">order</label>
            <Input type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">maxScore</label>
            <Input type="number" min={0} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">weight</label>
            <Input type="number" min={0} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">tags (comma separated)</label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">البند مطلوب</div>
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">البند نشط</div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        </div>
      </FormSection>
    </div>
  );
}