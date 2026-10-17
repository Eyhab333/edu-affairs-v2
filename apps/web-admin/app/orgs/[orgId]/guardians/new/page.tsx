"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, UserPlus } from "lucide-react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { GuardianSchema, PersonSchema } from "@takween/contracts";
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

export default function NewGuardianPage() {
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
      const peopleRef = collection(db, `orgs/${orgId}/people`);
      const personMatches = [];

      if (nationalId.trim()) {
        const snapshot = await getDocs(
          query(peopleRef, where("nationalId", "==", nationalId.trim())),
        );
        personMatches.push(...snapshot.docs);
      }

      if (personMatches.length === 0 && email.trim()) {
        const snapshot = await getDocs(
          query(peopleRef, where("email", "==", email.trim().toLowerCase())),
        );
        if (
          nationalId.trim() &&
          snapshot.docs.some(
            (item) =>
              typeof item.data().nationalId === "string" &&
              item.data().nationalId.trim() &&
              item.data().nationalId.trim() !== nationalId.trim(),
          )
        ) {
          throw new Error("البريد الإلكتروني مرتبط بشخص له سجل مدني مختلف.");
        }
        personMatches.push(...snapshot.docs);
      }

      if (personMatches.length > 1) {
        throw new Error("يوجد أكثر من شخص مطابق؛ راجع السجل المدني أو البريد الإلكتروني.");
      }

      const existingPerson = personMatches[0];
      const personId = existingPerson?.id ?? generateId("person");
      const guardiansRef = collection(db, `orgs/${orgId}/guardians`);
      const guardianSnapshot = await getDocs(
        query(guardiansRef, where("personId", "==", personId)),
      );
      const activeGuardians = guardianSnapshot.docs.filter(
        (item) => item.data().isArchived !== true,
      );
      const existingGuardian =
        activeGuardians[0] ??
        (guardianSnapshot.docs.length === 1 ? guardianSnapshot.docs[0] : undefined);

      if (activeGuardians.length > 1) {
        throw new Error("يوجد أكثر من سجل ولي أمر نشط لهذا الشخص.");
      }
      if (!existingGuardian && guardianSnapshot.docs.length > 1) {
        throw new Error("يوجد أكثر من سجل ولي أمر مؤرشف لهذا الشخص.");
      }

      const guardianId = existingGuardian?.id ?? `g-parent-${personId}`;

      const personPayload = {
        id: personId,
        displayName: displayName.trim(),
        nationalId: nationalId.trim(),
        phone: phone.trim(),
        email: email.trim(),
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const guardianPayload = {
        id: guardianId,
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

      const parsedGuardian = GuardianSchema.safeParse(guardianPayload);
      if (!parsedGuardian.success) {
        throw new Error(parsedGuardian.error.issues.map((i) => i.message).join("\n"));
      }

      if (!existingPerson) {
        await setDoc(doc(db, `orgs/${orgId}/people/${personId}`), parsedPerson.data);
      }
      await setDoc(
        doc(db, `orgs/${orgId}/guardians/${guardianId}`),
        parsedGuardian.data,
        { merge: true },
      );

      toast.success("تم إنشاء ولي الأمر بنجاح");
      router.push(`/orgs/${orgId}/guardians/${guardianId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء ولي الأمر");
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
        badge="إضافة ولي أمر"
        badgeIcon={<UserPlus className="h-3.5 w-3.5" />}
        title="إضافة ولي أمر"
        description="إنشاء سجل ولي أمر جديد وربطه بشخص داخل المؤسسة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/guardians`}>
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
        title="بيانات ولي الأمر"
        description="أدخل البيانات الأساسية لولي الأمر."
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
              <div className="text-sm font-medium">أرشفة ولي الأمر</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل سيُنشأ السجل كولي أمر مؤرشف.
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
