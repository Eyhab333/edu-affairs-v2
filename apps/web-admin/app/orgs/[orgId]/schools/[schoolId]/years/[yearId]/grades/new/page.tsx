"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, Loader2, Plus, Save, Shapes } from "lucide-react";
import { GradeSchema, SchoolType } from "@takween/contracts";
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

type SummaryData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  yearTitle: string;
};

function getEntitySingleLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "صف" : "مستوى";
}

function getPageTitle(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "إضافة صف" : "إضافة مستوى";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewGradePage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; schoolId: string; yearId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<SummaryData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`);

    const [schoolSnap, yearSnap] = await Promise.all([getDoc(schoolRef), getDoc(yearRef)]);

    if (!schoolSnap.exists() || !yearSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: { schoolType?: SchoolTypeValue };
    };
    const yearData = yearSnap.data() as { title?: string };

    return {
      schoolName: schoolData.name ?? "المدرسة",
      schoolType: SchoolType.safeParse(schoolData.profile?.schoolType).success
        ? (schoolData.profile?.schoolType as SchoolTypeValue)
        : "PRIMARY",
      yearTitle: yearData.title ?? "السنة الدراسية",
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound } = useDocumentLoader<SummaryData>({
    enabled: !!user,
    loader: loadSummary,
    deps: [orgId, schoolId, yearId],
  });

  const schoolType = useMemo<SchoolTypeValue>(
    () => data?.schoolType ?? "PRIMARY",
    [data?.schoolType]
  );

  const entitySingleLabel = getEntitySingleLabel(schoolType);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId(schoolType === "PRIMARY" ? "grade" : "level");

      const payload = {
        id,
        orgId,
        schoolId,
        academicYearId: yearId,
        title: title.trim(),
        code: code.trim(),
        order,
        isArchived,
      };

      const parsed = GradeSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      const ref = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades/${id}`
      );

      await setDoc(ref, parsed.data);
      toast.success(`تم إنشاء ${entitySingleLabel} بنجاح`);
      router.push(`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error(`تعذر إنشاء ${entitySingleLabel}`);
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge={getPageTitle(schoolType)}
          badgeIcon={
            schoolType === "PRIMARY" ? (
              <GraduationCap className="h-3.5 w-3.5" />
            ) : (
              <Shapes className="h-3.5 w-3.5" />
            )
          }
          title="تعذر العثور على السجل المطلوب"
          description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
          actions={
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge={getPageTitle(schoolType)}
        badgeIcon={
          schoolType === "PRIMARY" ? (
            <GraduationCap className="h-3.5 w-3.5" />
          ) : (
            <Shapes className="h-3.5 w-3.5" />
          )
        }
        title={getPageTitle(schoolType)}
        description={`إضافة ${entitySingleLabel} جديد داخل ${data?.yearTitle ?? "السنة الدراسية"} — ${data?.schoolName ?? "المدرسة"}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
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
        title={`بيانات ${entitySingleLabel}`}
        description={`أدخل البيانات الأساسية ثم احفظ ${entitySingleLabel} الجديد.`}
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">{`اسم ${entitySingleLabel}`}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={schoolType === "PRIMARY" ? "مثال: الصف الأول" : "مثال: المستوى الأول"}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الكود</label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={schoolType === "PRIMARY" ? "G1" : "L1"}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الترتيب</label>
          <Input
            type="number"
            value={String(order)}
            onChange={(e) => setOrder(Number(e.target.value || 0))}
            placeholder="0"
          />
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">{`أرشفة ${entitySingleLabel}`}</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل سيُسجل العنصر كأرشيف داخل النظام.
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