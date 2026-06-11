"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  EvaluationFrameworkSchema,
  EvaluationFrameworkStatus,
  EvaluationTargetKind,
  MembershipRole,
} from "@takween/contracts";
import { ArrowLeft, FileStack, Loader2, Save } from "lucide-react";
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

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewEvaluationFrameworkPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [title, setTitle] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");
  const [targetKind, setTargetKind] =
    useState<(typeof EvaluationTargetKind.options)[number]>("TEACHER");
  const [status, setStatus] =
    useState<(typeof EvaluationFrameworkStatus.options)[number]>("DRAFT");
  const [version, setVersion] = useState("1");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MembershipRole.options], []);
  const targetKindOptions = useMemo(() => [...EvaluationTargetKind.options], []);
  const statusOptions = useMemo(() => [...EvaluationFrameworkStatus.options], []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDocs(query(collection(db, `orgs/${orgId}/schools`)));
        if (cancelled) return;

        setSchools(
          snap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<SchoolRow, "id">),
          }))
        );
      } catch {
        toast.error("تعذر تحميل المدارس");
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
      const id = generateId("evaluation-framework");
      const nowMs = Date.now();

      const payload = {
        id,
        orgId,
        schoolId: schoolId || "",
        title: title.trim(),
        targetRoleKey: targetRoleKey || undefined,
        targetKind,
        status,
        version: Number(version || 1),
        description: description.trim(),
        isActive,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluationFrameworkSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/evaluationFrameworks/${id}`), parsed.data);

      toast.success("تم إنشاء الـ Framework بنجاح");
      router.push(`/orgs/${orgId}/evaluations/frameworks`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الـ Framework");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[680px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="Framework جديد"
        badgeIcon={<FileStack className="h-3.5 w-3.5" />}
        title="إضافة Framework"
        description="تعريف إطار تقييم جديد داخل المؤسسة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/frameworks`}>
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
        title="بيانات الإطار"
        description="أدخل العنوان والدور المستهدف والحالة والإصدار."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">العنوان</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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

          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as (typeof EvaluationFrameworkStatus.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الإصدار</label>
            <Input
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
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