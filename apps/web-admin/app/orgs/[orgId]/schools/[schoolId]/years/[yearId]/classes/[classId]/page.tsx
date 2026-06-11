"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  DoorOpen,
  GraduationCap,
  Loader2,
  Save,
  Shapes,
} from "lucide-react";
import { ClassSchema, SchoolType } from "@takween/contracts";
import { collection, doc, getDoc, getDocs, query, orderBy, setDoc } from "firebase/firestore";
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
  grades: OptionRow[];
  streams: OptionRow[];
  classItem: {
    id: string;
    title: string;
    code?: string;
    gradeId?: string;
    streamId?: string;
    sectionLabel?: string;
    capacity?: number;
    order: number;
    isArchived?: boolean;
  };
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function EditClassPage() {
  const router = useRouter();
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
    classId: string;
  }>();

  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;
  const classId = params.classId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`);
    const classRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/classes/${classId}`
    );
    const gradesRef = collection(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades`);
    const streamsRef = collection(db, `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`);

    const [schoolSnap, yearSnap, classSnap, gradesSnap, streamsSnap] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDoc(classRef),
      getDocs(query(gradesRef, orderBy("order", "asc"))),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists() || !classSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: { schoolType?: SchoolTypeValue };
    };
    const yearData = yearSnap.data() as { title?: string };
    const classData = classSnap.data() as {
      title?: string;
      code?: string;
      gradeId?: string;
      streamId?: string;
      sectionLabel?: string;
      capacity?: number;
      order?: number;
      isArchived?: boolean;
    };

    return {
      schoolName: schoolData.name ?? "المدرسة",
      schoolType: SchoolType.safeParse(schoolData.profile?.schoolType).success
        ? (schoolData.profile?.schoolType as SchoolTypeValue)
        : "PRIMARY",
      yearTitle: yearData.title ?? "السنة الدراسية",
      grades: gradesSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      streams: streamsSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      classItem: {
        id: classSnap.id,
        title: classData.title ?? "",
        code: classData.code ?? "",
        gradeId: classData.gradeId ?? "",
        streamId: classData.streamId ?? "",
        sectionLabel: classData.sectionLabel ?? "",
        capacity: classData.capacity,
        order: classData.order ?? 0,
        isArchived: !!classData.isArchived,
      },
    };
  }, [orgId, schoolId, yearId, classId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, schoolId, yearId, classId],
  });

  useEffect(() => {
    if (!data) return;
    setTitle(data.classItem.title);
    setCode(data.classItem.code ?? "");
    setGradeId(data.classItem.gradeId ?? "");
    setStreamId(data.classItem.streamId ?? "");
    setSectionLabel(data.classItem.sectionLabel ?? "");
    setCapacity(
      typeof data.classItem.capacity === "number" ? String(data.classItem.capacity) : ""
    );
    setOrder(data.classItem.order ?? 0);
    setIsArchived(Boolean(data.classItem.isArchived));
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
        id: classId,
        orgId,
        schoolId,
        academicYearId: yearId,
        gradeId: gradeId || undefined,
        streamId: schoolType === "PRIMARY" ? streamId || "" : "",
        code: code.trim(),
        title: title.trim(),
        sectionLabel: sectionLabel.trim(),
        capacity: capacity.trim() ? Number(capacity) : undefined,
        order,
        isArchived,
      };

      const parsed = ClassSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      }

      const ref = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/classes/${classId}`
      );

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم حفظ الفصل بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ الفصل");
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
        badge="تعديل فصل"
        badgeIcon={<DoorOpen className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة أو الفصل غير موجود."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}>
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
        badge="تعديل فصل"
        badgeIcon={<DoorOpen className="h-3.5 w-3.5" />}
        title="تعديل فصل"
        description={`${data?.classItem.title ?? ""} — ${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}>
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

      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        {schoolType === "PRIMARY" ? (
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            في الابتدائي يمكن ربط الفصل بصف ومسار أكاديمي.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Shapes className="h-4 w-4" />
            في الروضة يرتبط الفصل عادة بمستوى ومعلمة، ويمكن استخدام اسم خاص للفصل.
          </div>
        )}
      </div>

      <FormSection
        title="بيانات الفصل"
        description="عدّل البيانات الأساسية ثم احفظ."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">اسم الفصل</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الكود</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
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
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {schoolType === "PRIMARY" ? "الصف" : "المستوى"}
            </label>
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {data?.grades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {schoolType === "PRIMARY" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">المسار</label>
              <select
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">اختر</option>
                {data?.streams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">رمز/حرف الفصل</label>
            <Input value={sectionLabel} onChange={(e) => setSectionLabel(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">السعة</label>
            <Input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">أرشفة الفصل</div>
              <div className="text-xs text-muted-foreground">
                عند التفعيل سيُسجل الفصل كأرشيف داخل النظام.
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