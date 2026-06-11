"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MembershipRole } from "@takween/contracts";
import { ArrowLeft, Loader2, Route, Save } from "lucide-react";
import { collection, doc, getDocs, query, setDoc } from "firebase/firestore";
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

export default function NewEvaluationAssignmentPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);

  const [schoolId, setSchoolId] = useState("");
  const [targetPersonId, setTargetPersonId] = useState("");
  const [evaluatorPersonId, setEvaluatorPersonId] = useState("");
  const [evaluatorRoleKey, setEvaluatorRoleKey] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");
  const [relationType, setRelationType] = useState("MANUAL_OVERRIDE");
  const [priority, setPriority] = useState("1");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MembershipRole.options], []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [schoolsSnap, peopleSnap] = await Promise.all([
          getDocs(query(collection(db, `orgs/${orgId}/schools`))),
          getDocs(query(collection(db, `orgs/${orgId}/people`))),
        ]);

        if (cancelled) return;

        setSchools(
          schoolsSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<SchoolRow, "id">),
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

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("evaluation-target-assignment");
      const nowMs = Date.now();

      await setDoc(
        doc(db, `orgs/${orgId}/evaluationTargetAssignments/${id}`),
        {
          id,
          orgId,
          schoolId: schoolId || "",
          targetPersonId,
          evaluatorPersonId,
          evaluatorRoleKey: evaluatorRoleKey || "",
          targetRoleKey: targetRoleKey || "",
          relationType: relationType || "MANUAL_OVERRIDE",
          priority: Number(priority || 1),
          notes: notes.trim(),
          isActive,
          createdAt: nowMs,
          updatedAt: nowMs,
        }
      );

      toast.success("تم إنشاء رابط التقييم");
      router.push(`/orgs/${orgId}/evaluations/assignments`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الرابط");
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
        badge="رابط تقييم جديد"
        badgeIcon={<Route className="h-3.5 w-3.5" />}
        title="إضافة رابط تقييم دقيق"
        description="ربط مستهدف بمقيّم فعلي ليُستخدم أولًا أثناء التوزيع."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/assignments`}>
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
        title="بيانات الرابط"
        description="هذا الرابط يُقدَّم على الروابط العامة عند التوليد."
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
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">evaluatorRoleKey</label>
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
            <label className="text-sm font-medium">targetRoleKey</label>
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
            <label className="text-sm font-medium">relationType</label>
            <select
              value={relationType}
              onChange={(e) => setRelationType(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="MANUAL_OVERRIDE">MANUAL_OVERRIDE</option>
              <option value="DIRECT_SUPERVISOR">DIRECT_SUPERVISOR</option>
              <option value="SCHOOL_MANAGER">SCHOOL_MANAGER</option>
              <option value="VICE_PRINCIPAL">VICE_PRINCIPAL</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">priority</label>
            <Input
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="text-sm font-medium">نشط</div>
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