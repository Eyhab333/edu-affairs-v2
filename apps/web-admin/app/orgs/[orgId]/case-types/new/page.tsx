"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  ShieldAlert,
} from "lucide-react";
import {
  MembershipRole,
  SchoolType,
  StudentCaseTypeSchema,
} from "@takween/contracts";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getSchoolTypeLabel(type: string) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

export default function NewCaseTypePage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [schoolType, setSchoolType] = useState<"PRIMARY" | "KG">("PRIMARY");
  const [defaultOwnerRoleKey, setDefaultOwnerRoleKey] = useState("");
  const [allowedForwardToRoleKeys, setAllowedForwardToRoleKeys] = useState<string[]>([]);
  const [allowTeacherCreate, setAllowTeacherCreate] = useState(true);
  const [allowGuardianCreate, setAllowGuardianCreate] = useState(false);
  const [notifyGuardianOnCreate, setNotifyGuardianOnCreate] = useState(false);
  const [notifyGuardianOnForward, setNotifyGuardianOnForward] = useState(false);
  const [notifyGuardianOnClose, setNotifyGuardianOnClose] = useState(false);
  const [autoCloseWhenResolved, setAutoCloseWhenResolved] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roleOptions = useMemo(() => [...MembershipRole.options], []);

  function toggleAllowedRole(roleKey: string) {
    setAllowedForwardToRoleKeys((prev) =>
      prev.includes(roleKey)
        ? prev.filter((item) => item !== roleKey)
        : [...prev, roleKey]
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("case-type");
      const nowMs = Date.now();

      const payload = {
        id,
        title: title.trim(),
        schoolType,
        defaultOwnerRoleKey,
        allowedForwardToRoleKeys,
        allowTeacherCreate,
        allowGuardianCreate,
        notifyGuardianOnCreate,
        notifyGuardianOnForward,
        notifyGuardianOnClose,
        autoCloseWhenResolved,
        isActive,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = StudentCaseTypeSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/studentCaseTypes/${id}`), parsed.data);

      toast.success("تم إنشاء نوع القضية بنجاح");
      router.push(`/orgs/${orgId}/case-types`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء نوع القضية");
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
        badge="إضافة نوع قضية"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="إضافة نوع قضية"
        description="تعريف نوع جديد لاستخدامه في قضايا الطلاب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/case-types`}>
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
        title="بيانات النوع"
        description="أدخل العنوان والمرحلة والمالك الافتراضي."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان النوع</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المرحلة</label>
            <select
              value={schoolType}
              onChange={(e) => setSchoolType(e.target.value as "PRIMARY" | "KG")}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {SchoolType.options.map((item) => (
                <option key={item} value={item}>
                  {getSchoolTypeLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">المالك الافتراضي للقضية</label>
          <select
            value={defaultOwnerRoleKey}
            onChange={(e) => setDefaultOwnerRoleKey(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">اختر</option>
            {roleOptions.map((roleKey) => (
              <option key={roleKey} value={roleKey}>
                {roleKey}
              </option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection
        title="سياسات الإنشاء والإشعارات"
        description="السياسات الأساسية لهذا النوع."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        {[
          {
            label: "السماح للمعلم بالإنشاء",
            checked: allowTeacherCreate,
            onChange: setAllowTeacherCreate,
          },
          {
            label: "السماح لولي الأمر بالإنشاء",
            checked: allowGuardianCreate,
            onChange: setAllowGuardianCreate,
          },
          {
            label: "إشعار ولي الأمر عند الإنشاء",
            checked: notifyGuardianOnCreate,
            onChange: setNotifyGuardianOnCreate,
          },
          {
            label: "إشعار ولي الأمر عند التحويل",
            checked: notifyGuardianOnForward,
            onChange: setNotifyGuardianOnForward,
          },
          {
            label: "إشعار ولي الأمر عند الإغلاق",
            checked: notifyGuardianOnClose,
            onChange: setNotifyGuardianOnClose,
          },
          {
            label: "إغلاق تلقائي عند الحل",
            checked: autoCloseWhenResolved,
            onChange: setAutoCloseWhenResolved,
          },
          {
            label: "النوع نشط",
            checked: isActive,
            onChange: setIsActive,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">{item.label}</div>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.onChange(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        ))}
      </FormSection>

      <FormSection
        title="الأدوار المسموح التحويل إليها"
        description="حدد الأدوار التي يمكن تحويل القضية إليها لاحقًا."
        contentClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {roleOptions.map((roleKey) => (
          <label
            key={roleKey}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          >
            <span className="text-sm">{roleKey}</span>
            <input
              type="checkbox"
              checked={allowedForwardToRoleKeys.includes(roleKey)}
              onChange={() => toggleAllowedRole(roleKey)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        ))}
      </FormSection>
    </div>
  );
}