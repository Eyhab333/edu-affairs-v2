"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Copy,
  FolderKanban,
  GraduationCap,
  Loader2,
  Save,
  School,
} from "lucide-react";
import { toast } from "sonner";

import { db, functions } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import { AcademicYearSchema } from "@takween/contracts";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import {
  DetailPageSkeleton,
  PageMessageState,
} from "@/components/shared/PageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SourceYearOption = {
  id: string;
  title: string;
  startsAt: number;
};

type AcademicYearFormData = {
  title: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

type LoaderData = {
  year: AcademicYearFormData;
  allYears: SourceYearOption[];
};

type BusyAction = "save" | "set-active" | "clone" | null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDateInput(ms?: number) {
  if (!ms) return "";
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputToMs(value: string) {
  if (!value) return NaN;

  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return NaN;

  const [year, month, day] = parts;
  return new Date(year, month - 1, day).getTime();
}

export default function EditAcademicYearPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; schoolId: string; yearId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(false);

  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceYearId, setSourceYearId] = useState("");
  const [cloneOut, setCloneOut] = useState<unknown>(null);

  const loadYearPage = useCallback(async (): Promise<LoaderData | null> => {
    const yearsCol = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears`
    );
    const yearsSnap = await getDocs(query(yearsCol, orderBy("startsAt", "desc")));
    const allYears = yearsSnap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<SourceYearOption, "id">),
    }));

    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`
    );
    const yearSnap = await getDoc(yearRef);

    if (!yearSnap.exists()) {
      return null;
    }

    const data = yearSnap.data() as any;

    return {
      year: {
        title: data.title ?? "",
        startsAt: formatDateInput(data.startsAt),
        endsAt: formatDateInput(data.endsAt),
        isActive: !!data.isActive,
      },
      allYears,
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<LoaderData>({
    enabled: !!user,
    loader: loadYearPage,
    deps: [orgId, schoolId, yearId],
  });

  useEffect(() => {
    if (!data) return;

    setTitle(data.year.title);
    setStartsAt(data.year.startsAt);
    setEndsAt(data.year.endsAt);
    setIsActive(data.year.isActive);

    const defaultSource = data.allYears.find((item) => item.id !== yearId);
    setSourceYearId(defaultSource?.id ?? "");
  }, [data, yearId]);

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل بيانات السنة الدراسية");
    }
  }, [error]);

  const sourceYearOptions = useMemo(
    () => (data?.allYears ?? []).filter((item) => item.id !== yearId),
    [data, yearId]
  );

  async function save() {
    setBusyAction("save");
    setSaveError(null);

    try {
      const yearRef = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`
      );

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

      const payload = {
        id: yearId,
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

      await setDoc(yearRef, parsed.data, { merge: true });
      toast.success("تم حفظ السنة الدراسية بنجاح");
      router.push(`/orgs/${orgId}/schools/${schoolId}/years`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("فشل حفظ البيانات");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetActive() {
    setBusyAction("set-active");
    setSaveError(null);

    try {
      const call = httpsCallable(functions, "setActiveAcademicYear");
      await call({
        orgId,
        schoolId,
        academicYearId: yearId,
      });

      setIsActive(true);
      toast.success("تم تعيين السنة الدراسية كسنة نشطة");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر تعيين السنة الدراسية النشطة");
    } finally {
      setBusyAction(null);
    }
  }

  async function cloneFromYear() {
    setBusyAction("clone");
    setSaveError(null);
    setCloneOut(null);

    try {
      if (!sourceYearId) {
        throw new Error("اختر السنة المصدر أولًا");
      }

      const call = httpsCallable(functions, "cloneAcademicStructure");
      const response = await call({
        orgId,
        schoolId,
        sourceYearId,
        targetYearId: yearId,
      });

      setCloneOut(response.data);
      toast.success("تم نسخ الصفوف والفصول بنجاح");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("فشلت عملية النسخ");
    } finally {
      setBusyAction(null);
    }
  }

  if (checkingAuth || loading) {
    return <DetailPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageMessageState
        title="السنة الدراسية غير موجودة"
        description="تعذر العثور على السنة الدراسية المطلوبة أو ربما تم حذفها."
        action={
          <Button asChild>
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى السنوات الدراسية
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="السنة الدراسية"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title="تعديل السنة الدراسية"
        description="تحديث بيانات السنة الدراسية، تعيينها كسنة نشطة، أو نسخ الهيكل الأكاديمي من سنة أخرى."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنوات
              </Link>
            </Button>

            <Button onClick={save} disabled={busyAction !== null}>
              {busyAction === "save" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ التعديلات
                </>
              )}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <FormSection
          title="بيانات السنة الدراسية"
          description="عدّل عنوان السنة وتواريخها الأساسية ثم احفظ التغييرات."
        >
          {error || saveError ? (
            <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error ?? saveError}
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
                <div className="text-sm font-medium">السنة النشطة</div>
                <div className="text-xs text-muted-foreground">
                  السنة النشطة هي المرجع الحالي للصفوف والفصول في المدرسة.
                </div>
              </div>

              <div className="text-sm font-semibold text-primary">
                {isActive ? "نعم" : "لا"}
              </div>
            </label>
          </div>

          {!isActive ? (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleSetActive}
                disabled={busyAction !== null}
              >
                {busyAction === "set-active" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري التفعيل...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    تعيين كسنة نشطة
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </FormSection>

        <div className="space-y-4">
          <FormSection
            title="معلومات سريعة"
            description="ملخص مرتبط بالسجل الحالي."
            contentClassName="space-y-3"
          >
            <InfoCard label="معرّف المؤسسة" value={orgId} valueClassName="break-all" />
            <InfoCard label="معرّف المدرسة" value={schoolId} valueClassName="break-all" />
            <InfoCard label="معرّف السنة الدراسية" value={yearId} valueClassName="break-all" />
            <InfoCard label="الحالة" value={isActive ? "نشطة" : "غير نشطة"} />
          </FormSection>

          <FormSection
            title="روابط مرتبطة"
            description="اختصارات للانتقال إلى الشاشات التابعة."
            contentClassName="space-y-3"
          >
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/schools/${schoolId}`}>
                <span>المدرسة</span>
                <School className="h-4 w-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
                <span>الصفوف</span>
                <GraduationCap className="h-4 w-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}>
                <span>الفصول</span>
                <FolderKanban className="h-4 w-4" />
              </Link>
            </Button>
          </FormSection>
        </div>
      </div>

      <FormSection
        title="نسخ الصفوف والفصول"
        description="انسخ الهيكل الأكاديمي من سنة سابقة إلى السنة الحالية."
      >
        <div className="space-y-2">
          <Label htmlFor="source-year">السنة المصدر</Label>
          <select
            id="source-year"
            value={sourceYearId}
            onChange={(e) => setSourceYearId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">اختر السنة المصدر</option>
            {sourceYearOptions.map((year) => (
              <option key={year.id} value={year.id}>
                {year.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={cloneFromYear}
            disabled={busyAction !== null || !sourceYearId}
          >
            {busyAction === "clone" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري النسخ...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                نسخ من السنة المحددة
              </>
            )}
          </Button>

          <Button variant="ghost" onClick={() => void reload()} disabled={busyAction !== null}>
            إعادة تحميل البيانات
          </Button>
        </div>

        {cloneOut ? (
          <div className="rounded-2xl border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">ناتج العملية</p>
            <pre className="overflow-x-auto text-xs leading-6">
              {JSON.stringify(cloneOut, null, 2)}
            </pre>
          </div>
        ) : null}
      </FormSection>
    </div>
  );
}