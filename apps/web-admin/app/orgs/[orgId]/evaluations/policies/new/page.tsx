"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  EvaluatorPolicySchema,
  MembershipRole,
  MembershipScopeType,
} from "@takween/contracts";
import { ArrowLeft, Loader2, Save, ShieldCheck } from "lucide-react";
import { collection, getDocs, query, setDoc, doc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";

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

export default function NewEvaluatorPolicyPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [evaluatorRoleKey, setEvaluatorRoleKey] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");
  const [scopeType, setScopeType] =
    useState<(typeof MembershipScopeType.options)[number]>("SCHOOL");
  const [scopeId, setScopeId] = useState("");
  const [canEvaluate, setCanEvaluate] = useState(true);
  const [canApprove, setCanApprove] = useState(false);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MembershipRole.options], []);
  const scopeOptions = useMemo(() => [...MembershipScopeType.options], []);

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
      const id = generateId("evaluator-policy");
      const nowMs = Date.now();

      const payload = {
        id,
        orgId,
        schoolId: schoolId || "",
        evaluatorRoleKey: evaluatorRoleKey || undefined,
        targetRoleKey: targetRoleKey || undefined,
        scopeType,
        scopeId: scopeId.trim(),
        canEvaluate,
        canApprove,
        notes: notes.trim(),
        isActive,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluatorPolicySchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/evaluatorPolicies/${id}`), parsed.data);

      toast.success("تم إنشاء الـ Policy بنجاح");
      router.push(`/orgs/${orgId}/evaluations/policies`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الـ Policy");
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
        badge="Policy جديدة"
        badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="إضافة Evaluator Policy"
        description="تعريف قاعدة تقييم جديدة داخل المؤسسة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/policies`}>
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
        title="بيانات السياسة"
        description="من يقيّم من، وعلى أي نطاق، وهل يملك اعتمادًا."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع النطاق</label>
            <select
              value={scopeType}
              onChange={(e) =>
                setScopeType(e.target.value as (typeof MembershipScopeType.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {scopeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">معرّف النطاق</label>
            <input
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">يسمح بالتقييم</div>
              <input
                type="checkbox"
                checked={canEvaluate}
                onChange={(e) => setCanEvaluate(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">يسمح بالاعتماد</div>
              <input
                type="checkbox"
                checked={canApprove}
                onChange={(e) => setCanApprove(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
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
        </div>
      </FormSection>
    </div>
  );
}