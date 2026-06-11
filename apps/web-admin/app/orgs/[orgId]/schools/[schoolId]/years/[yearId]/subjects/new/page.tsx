"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SubjectSchema, SchoolType } from "@takween/contracts";
import { ArrowLeft, BookOpen, Loader2, Save } from "lucide-react";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = "PRIMARY" | "KG";

type OptionRow = {
  id: string;
  title: string;
};

type SummaryData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  yearTitle: string;
  streams: OptionRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId() {
  return `subject-${Date.now()}`;
}

export default function NewSubjectPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; schoolId: string; yearId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [streamId, setStreamId] = useState("");
  const [appliesToAllStreams, setAppliesToAllStreams] = useState(true);
  const [category, setCategory] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<SummaryData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`);
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`
    );

    const [schoolSnap, yearSnap, streamsSnap] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
    ]);

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
      streams: streamsSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
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

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId();

      const payload = {
        id,
        orgId,
        schoolId,
        academicYearId: yearId,
        code: code.trim(),
        key: subjectKey.trim(),
        title: title.trim(),
        streamId: schoolType === "PRIMARY" && !appliesToAllStreams ? streamId || "" : "",
        appliesToAllStreams: schoolType === "PRIMARY" ? appliesToAllStreams : true,
        category: schoolType === "KG" ? category.trim() : "",
        order,
        isArchived,
      };

      const parsed = SubjectSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      const ref = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/subjects/${id}`
      );

      await setDoc(ref, parsed.data);
      toast.success("تم إنشاء المادة بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء المادة");
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
        badge="إضافة مادة"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects`}>
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
        badge="إضافة مادة"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="إضافة مادة"
        description={`إضافة مادة جديدة داخل ${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects`}>
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
        title="بيانات المادة"
        description="أدخل البيانات الأساسية ثم احفظ المادة."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اسم المادة</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: الرياضيات" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الكود</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المفتاح</label>
            <Input value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} placeholder="MATH_PRIMARY" />
          </div>
        </div>

        {schoolType === "PRIMARY" ? (
          <>
            <div className="rounded-2xl border px-4 py-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">مشتركة لكل المسارات</div>
                  <div className="text-xs text-muted-foreground">
                    عند التفعيل تصبح المادة عامة لكل المسارات داخل الابتدائي.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={appliesToAllStreams}
                  onChange={(e) => setAppliesToAllStreams(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>

            {!appliesToAllStreams ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">المسار</label>
                <select
                  value={streamId}
                  onChange={(e) => setStreamId(e.target.value)}
                  className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
                >
                  <option value="">اختر</option>
                  {(data?.streams ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-medium">الفئة</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="مثال: قيم / أركان / قرآن / أرقام"
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الترتيب</label>
            <Input
              type="number"
              value={String(order)}
              onChange={(e) => setOrder(Number(e.target.value || 0))}
            />
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">أرشفة المادة</div>
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
        </div>
      </FormSection>
    </div>
  );
}