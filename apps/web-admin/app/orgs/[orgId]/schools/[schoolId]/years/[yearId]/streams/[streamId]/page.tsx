"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AcademicStreamSchema, SchoolType } from "@takween/contracts";
import { ArrowLeft, Loader2, Milestone, Save } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = "PRIMARY" | "KG";
type StreamKindValue = "GENERAL" | "QURAN" | "INTERNATIONAL" | "CUSTOM";

type PageData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  yearTitle: string;
  stream: {
    id: string;
    title: string;
    code?: string;
    shortLabel?: string;
    kind?: StreamKindValue;
    order?: number;
    isActive?: boolean;
    isArchived?: boolean;
  };
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function EditStreamPage() {
  const router = useRouter();
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
    streamId: string;
  }>();

  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;
  const streamId = params.streamId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [shortLabel, setShortLabel] = useState("");
  const [kind, setKind] = useState<StreamKindValue>("GENERAL");
  const [order, setOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`);
    const streamRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams/${streamId}`
    );

    const [schoolSnap, yearSnap, streamSnap] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDoc(streamRef),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists() || !streamSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: { schoolType?: SchoolTypeValue };
    };
    const yearData = yearSnap.data() as { title?: string };
    const streamData = streamSnap.data() as {
      title?: string;
      code?: string;
      shortLabel?: string;
      kind?: StreamKindValue;
      order?: number;
      isActive?: boolean;
      isArchived?: boolean;
    };

    return {
      schoolName: schoolData.name ?? "المدرسة",
      schoolType: SchoolType.safeParse(schoolData.profile?.schoolType).success
        ? (schoolData.profile?.schoolType as SchoolTypeValue)
        : "PRIMARY",
      yearTitle: yearData.title ?? "السنة الدراسية",
      stream: {
        id: streamSnap.id,
        title: streamData.title ?? "",
        code: streamData.code ?? "",
        shortLabel: streamData.shortLabel ?? "",
        kind: streamData.kind ?? "GENERAL",
        order: streamData.order ?? 0,
        isActive: streamData.isActive !== false,
        isArchived: !!streamData.isArchived,
      },
    };
  }, [orgId, schoolId, yearId, streamId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, schoolId, yearId, streamId],
  });

  useEffect(() => {
    if (!data) return;
    setTitle(data.stream.title);
    setCode(data.stream.code ?? "");
    setShortLabel(data.stream.shortLabel ?? "");
    setKind((data.stream.kind ?? "GENERAL") as StreamKindValue);
    setOrder(data.stream.order ?? 0);
    setIsActive(data.stream.isActive !== false);
    setIsArchived(Boolean(data.stream.isArchived));
  }, [data]);

  const schoolType = useMemo<SchoolTypeValue>(
    () => data?.schoolType ?? "PRIMARY",
    [data?.schoolType]
  );

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        id: streamId,
        orgId,
        schoolId,
        academicYearId: yearId,
        code: code.trim(),
        title: title.trim(),
        kind,
        shortLabel: shortLabel.trim(),
        order,
        isActive,
        isArchived,
      };

      const parsed = AcademicStreamSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      const ref = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams/${streamId}`
      );

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم حفظ المسار بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ المسار");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="تعديل مسار"
        badgeIcon={<Milestone className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة أو المسار غير موجود."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  if (schoolType === "KG") {
    return (
      <PageHero
        badge="تعديل مسار"
        badgeIcon={<Milestone className="h-3.5 w-3.5" />}
        title="المسارات غير مستخدمة في الروضات"
        description="هذه الصفحة مخصصة للمدارس الابتدائية فقط."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
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
        badge="تعديل مسار"
        badgeIcon={<Milestone className="h-3.5 w-3.5" />}
        title="تعديل مسار أكاديمي"
        description={`${data?.stream.title ?? ""} — ${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams`}>
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
          </>
        }
      />

      <FormSection
        title="بيانات المسار"
        description="عدّل البيانات الأساسية للمسار الأكاديمي."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اسم المسار</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الكود</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الرمز المختصر</label>
            <Input value={shortLabel} onChange={(e) => setShortLabel(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع المسار</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StreamKindValue)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="GENERAL">عام</option>
              <option value="QURAN">تحفيظ</option>
              <option value="INTERNATIONAL">عالمي</option>
              <option value="CUSTOM">مخصص</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الترتيب</label>
            <Input
              type="number"
              value={String(order)}
              onChange={(e) => setOrder(Number(e.target.value || 0))}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">المسار نشط</div>
                <div className="text-xs text-muted-foreground">يمكن استخدامه حاليًا في الصفوف والفصول.</div>
              </div>

              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">أرشفة المسار</div>
                <div className="text-xs text-muted-foreground">عند التفعيل سيُعامل كمسار مؤرشف.</div>
              </div>

              <input
                type="checkbox"
                checked={isArchived}
                onChange={(e) => setIsArchived(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        </div>
      </FormSection>
    </div>
  );
}