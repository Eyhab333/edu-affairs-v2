"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, setDoc } from "firebase/firestore";
import { ArrowLeft, Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { DetailPageSkeleton } from "@/components/shared/PageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ModuleKey, SchoolSchema, SchoolType } from "@takween/contracts";

type SchoolTypeValue = (typeof SchoolType.options)[number];
type ModuleKeyValue = (typeof ModuleKey.options)[number];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewSchoolPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolTypeValue>("PRIMARY");
  const [enabledModules, setEnabledModules] = useState<ModuleKeyValue[]>([
    "CORE",
    "COMMS",
  ]);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const moduleOptions = useMemo(
    () => [...ModuleKey.options] as ModuleKeyValue[],
    []
  );

  function toggleModule(moduleKey: ModuleKeyValue) {
    setEnabledModules((prev) =>
      prev.includes(moduleKey)
        ? prev.filter((item) => item !== moduleKey)
        : [...prev, moduleKey]
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const ref = doc(collection(db, `orgs/${orgId}/schools`));
      const payload = {
        id: ref.id,
        orgId,
        name: name.trim(),
        profile: {
          schoolType,
          enabledModules,
        },
        isArchived,
      };

      const parsed = SchoolSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم إنشاء المدرسة بنجاح");
      router.push(`/orgs/${orgId}/schools`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("فشل إنشاء المدرسة");
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
        badge="إدارة المدارس"
        badgeIcon={<Building2 className="h-3.5 w-3.5" />}
        title="إضافة مدرسة"
        description="إنشاء مدرسة جديدة داخل المؤسسة الحالية."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى المدارس
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
                  إنشاء المدرسة
                </>
              )}
            </Button>
          </>
        }
      />

      <FormSection
        title="بيانات المدرسة"
        description="أدخل البيانات الأساسية ثم أنشئ السجل."
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="school-name">اسم المدرسة</Label>
          <Input
            id="school-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: منار الريادة بنين"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="school-type">نوع المدرسة</Label>
          <select
            id="school-type"
            value={schoolType}
            onChange={(e) => setSchoolType(e.target.value as SchoolTypeValue)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SchoolType.options.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <Label>الوحدات المفعلة</Label>

          <div className="grid gap-3 sm:grid-cols-2">
            {moduleOptions.map((moduleKey) => {
              const checked = enabledModules.includes(moduleKey);

              return (
                <label
                  key={moduleKey}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition hover:bg-muted/50"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{moduleKey}</div>
                    <div className="text-xs text-muted-foreground">
                      تفعيل أو تعطيل هذه الوحدة للمدرسة
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModule(moduleKey)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">إنشاء كمدرسة مؤرشفة</div>
              <div className="text-xs text-muted-foreground">
                غالبًا اترك هذا الخيار غير مفعّل عند الإنشاء.
              </div>
            </div>

            <input
              type="checkbox"
              checked={isArchived}
              onChange={(e) => setIsArchived(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      </FormSection>
    </div>
  );
}