"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type PageData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  yearTitle: string;
  streams: OptionRow[];
  subject: {
    id: string;
    code?: string;
    key?: string;
    title: string;
    streamId?: string;
    appliesToAllStreams?: boolean;
    category?: string;
    order?: number;
    isArchived?: boolean;
  };
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function EditSubjectPage() {
  const router = useRouter();
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
    subjectId: string;
  }>();

  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;
  const subjectId = params.subjectId;

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

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`);
    const subjectRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/subjects/${subjectId}`
    );
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`
    );

    const [schoolSnap, yearSnap, subjectSnap, streamsSnap] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDoc(subjectRef),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists() || !subjectSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: { schoolType?: SchoolTypeValue };
    };
    const yearData = yearSnap.data() as { title?: string };
    const subjectData = subjectSnap.data() as {
      code?: string;
      key?: string;
      title?: string;
      streamId?: string;
      appliesToAllStreams?: boolean;
      category?: string;
      order?: number;
      isArchived?: boolean;
    };

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
      subject: {
        id: subjectSnap.id,
        code: subjectData.code ?? "",
        key: subjectData.key ?? "",
        title: subjectData.title ?? "",
        streamId: subjectData.streamId ?? "",
        appliesToAllStreams: subjectData.appliesToAllStreams !== false,
        category: subjectData.category ?? "",
        order: subjectData.order ?? 0,
        isArchived: !!subjectData.isArchived,
      },
    };
  }, [orgId, schoolId, yearId, subjectId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, schoolId, yearId, subjectId],
  });

  useEffect(() => {
    if (!data) return;

    setTitle(data.subject.title);
    setCode(data.subject.code ?? "");
    setSubjectKey(data.subject.key ?? "");
    setStreamId(data.subject.streamId ?? "");
    setAppliesToAllStreams(data.subject.appliesToAllStreams !== false);
    setCategory(data.subject.category ?? "");
    setOrder(data.subject.order ?? 0);
    setIsArchived(Boolean(data.subject.isArchived));
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
        id: subjectId,
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
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/subjects/${subjectId}`
      );

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم حفظ المادة بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/subjects`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ المادة");
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
        badge="تعديل مادة"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة أو المادة غير موجودة."
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
        badge="تعديل مادة"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="تعديل مادة"
        description={`${data?.subject.title ?? ""} — ${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
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
        description="عدّل البيانات الأساسية للمادة."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اسم المادة</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الكود</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المفتاح</label>
            <Input value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} />
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
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
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