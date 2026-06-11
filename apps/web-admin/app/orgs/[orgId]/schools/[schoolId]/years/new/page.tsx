"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, setDoc } from "firebase/firestore";
import { ArrowLeft, CalendarRange, Loader2, Save, School } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { DetailPageSkeleton } from "@/components/shared/PageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AcademicYearSchema } from "@takween/contracts";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function parseDateInputToMs(value: string) {
  if (!value) return NaN;

  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return NaN;

  const [year, month, day] = parts;
  return new Date(year, month - 1, day).getTime();
}

export default function NewAcademicYearPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; schoolId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;

  const { checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const startsAtMs = parseDateInputToMs(startsAt);
      const endsAtMs = parseDateInputToMs(endsAt);

      if (!title.trim()) {
        throw new Error("عنوان السنة الدراسية مطلوب");
      }

      if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
        throw new Error("تأكد من صحة تاريخ البداية وتاريخ النهاية");
      }

      if (endsAtMs < startsAtMs) {
        throw new Error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      }

      const ref = doc(collection(db, `orgs/${orgId}/schools/${schoolId}/academicYears`));
      const payload = {
        id: ref.id,
        orgId,
        schoolId,
        title: title.trim(),
        startsAt: startsAtMs,
        endsAt: endsAtMs,
        isActive,
      };

      const parsed = AcademicYearSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم إنشاء السنة الدراسية بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("فشل إنشاء السنة الدراسية");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return <DetailPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="السنوات الدراسية"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title="إضافة سنة دراسية"
        description="إنشاء سنة دراسية جديدة للمدرسة الحالية."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنوات
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  إنشاء السنة
                </>
              )}
            </Button>
          </>
        }
      />

      <FormSection
        title="بيانات السنة الدراسية"
        description="أدخل بيانات السنة الدراسية ثم أنشئ السجل."
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="year-title">عنوان السنة الدراسية</Label>
          <Input
            id="year-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: 1447 هـ"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="starts-at">تاريخ البداية</Label>
            <Input
              id="starts-at"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ends-at">تاريخ النهاية</Label>
            <Input
              id="ends-at"
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">تعيينها كسنة نشطة</div>
              <div className="text-xs text-muted-foreground">
                استخدم هذا الخيار إذا كانت هذه السنة هي الحالية داخل المدرسة.
              </div>
            </div>

            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          بعد إنشاء السنة، يمكنك الانتقال مباشرة لإضافة الصفوف والفصول.
        </div>

        <Button asChild variant="outline" className="w-full justify-between">
          <Link href={`/orgs/${orgId}/schools/${schoolId}`}>
            <span>الرجوع إلى المدرسة</span>
            <School className="h-4 w-4" />
          </Link>
        </Button>
      </FormSection>
    </div>
  );
}