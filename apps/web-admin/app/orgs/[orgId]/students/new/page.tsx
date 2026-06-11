"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, UserPlus } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { PersonSchema, StudentSchema } from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewStudentPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [displayName, setDisplayName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const nowMs = Date.now();
      const personId = generateId("person");
      const studentId = generateId("student");

      const personPayload = {
        id: personId,
        displayName: displayName.trim(),
        nationalId: nationalId.trim(),
        phone: phone.trim(),
        email: email.trim(),
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const studentPayload = {
        id: studentId,
        personId,
        orgId,
        isArchived,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsedPerson = PersonSchema.safeParse(personPayload);
      if (!parsedPerson.success) {
        throw new Error(parsedPerson.error.issues.map((i) => i.message).join("\n"));
      }

      const parsedStudent = StudentSchema.safeParse(studentPayload);
      if (!parsedStudent.success) {
        throw new Error(parsedStudent.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/people/${personId}`), parsedPerson.data);
      await setDoc(doc(db, `orgs/${orgId}/students/${studentId}`), parsedStudent.data);

      toast.success("تم إنشاء الطالب بنجاح");
      router.push(`/orgs/${orgId}/students/${studentId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء الطالب");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="إضافة طالب"
        badgeIcon={<UserPlus className="h-3.5 w-3.5" />}
        title="إضافة طالب"
        description="إنشاء سجل طالب جديد وربطه بشخص داخل المؤسسة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students`}>
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
        title="بيانات الطالب"
        description="أدخل البيانات الأساسية للطالب."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">الاسم الكامل</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">السجل المدني</label>
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الهاتف</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">البريد الإلكتروني</label>
            <Input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">أرشفة الطالب</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل سيُنشأ السجل كطالب مؤرشف.
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