"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  DoorOpen,
  GraduationCap,
  Layers3,
  Loader2,
  Milestone,
  Plus,
  Save,
  School,
  Shapes,
  Users,
  X,
} from "lucide-react";
import { GradeSchema, SchoolType } from "@takween/contracts";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = "PRIMARY" | "KG";

type OptionRow = {
  id: string;
  title: string;
};

type ClassRow = {
  id: string;
  code?: string;
  title: string;
  gradeId?: string;
  streamId?: string;
  sectionLabel?: string;
  capacity?: number;
  order: number;
  isArchived?: boolean;
};

type PageData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  yearTitle: string;
  grade: {
    id: string;
    title: string;
    code?: string;
    order: number;
    isArchived?: boolean;
  };
  classes: ClassRow[];
  streams: OptionRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getEntitySingleLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "صف" : "مستوى";
}

function getEntityPluralLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "الصفوف" : "المستويات";
}

function getSchoolTypeLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

export default function ManageGradePage() {
  const router = useRouter();
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
    gradeId: string;
  }>();

  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;
  const gradeId = params.gradeId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [isArchived, setIsArchived] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`
    );
    const gradeRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades/${gradeId}`
    );
    const classesRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/classes`
    );
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`
    );

    const [schoolSnap, yearSnap, gradeSnap, classesSnap, streamsSnap] =
      await Promise.all([
        getDoc(schoolRef),
        getDoc(yearRef),
        getDoc(gradeRef),
        getDocs(query(classesRef, orderBy("order", "asc"))),
        getDocs(query(streamsRef, orderBy("order", "asc"))),
      ]);

    if (!schoolSnap.exists() || !yearSnap.exists() || !gradeSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: { schoolType?: SchoolTypeValue };
    };
    const yearData = yearSnap.data() as { title?: string };
    const gradeData = gradeSnap.data() as {
      title?: string;
      code?: string;
      order?: number;
      isArchived?: boolean;
    };

    return {
      schoolName: schoolData.name ?? "المدرسة",
      schoolType: SchoolType.safeParse(schoolData.profile?.schoolType).success
        ? (schoolData.profile?.schoolType as SchoolTypeValue)
        : "PRIMARY",
      yearTitle: yearData.title ?? "السنة الدراسية",
      grade: {
        id: gradeSnap.id,
        title: gradeData.title ?? "",
        code: gradeData.code ?? "",
        order: gradeData.order ?? 0,
        isArchived: !!gradeData.isArchived,
      },
      classes: classesSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ClassRow, "id">),
        }))
        .filter((item) => item.gradeId === gradeId),
      streams: streamsSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
    };
  }, [orgId, schoolId, yearId, gradeId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>(
    {
      enabled: !!user,
      loader: loadPageData,
      deps: [orgId, schoolId, yearId, gradeId],
    }
  );

  useEffect(() => {
    if (!data) return;
    setTitle(data.grade.title);
    setCode(data.grade.code ?? "");
    setOrder(data.grade.order);
    setIsArchived(Boolean(data.grade.isArchived));
  }, [data]);

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل البيانات");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(
    () => data?.schoolType ?? "PRIMARY",
    [data?.schoolType]
  );

  const entitySingleLabel = getEntitySingleLabel(schoolType);
  const streamMap = useMemo(
    () => new Map((data?.streams ?? []).map((item) => [item.id, item.title])),
    [data?.streams]
  );

  const filteredClasses = useMemo(() => {
    const classes = data?.classes ?? [];

    if (schoolType !== "PRIMARY" || !selectedStreamId) {
      return classes;
    }

    return classes.filter((item) => item.streamId === selectedStreamId);
  }, [data?.classes, schoolType, selectedStreamId]);

  const streamCards = useMemo(() => {
    if (schoolType !== "PRIMARY") return [];

    return (data?.streams ?? []).map((stream) => {
      const streamClasses = (data?.classes ?? []).filter(
        (item) => item.streamId === stream.id
      );

      return {
        ...stream,
        totalClasses: streamClasses.length,
        activeClasses: streamClasses.filter((item) => !item.isArchived).length,
      };
    });
  }, [data?.classes, data?.streams, schoolType]);

  const classesWithoutStreamCount = useMemo(() => {
    if (schoolType !== "PRIMARY") return 0;

    return (data?.classes ?? []).filter((item) => !item.streamId).length;
  }, [data?.classes, schoolType]);

  const totalClasses = data?.classes.length ?? 0;
  const activeClasses =
    data?.classes.filter((item) => !item.isArchived).length ?? 0;
  const archivedClasses =
    data?.classes.filter((item) => item.isArchived).length ?? 0;

  const addClassHref =
    schoolType === "PRIMARY"
      ? `/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/new?gradeId=${encodeURIComponent(
          gradeId
        )}&streamId=${encodeURIComponent(selectedStreamId)}`
      : `/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/new?gradeId=${encodeURIComponent(
          gradeId
        )}`;

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        id: gradeId,
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
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n")
        );
      }

      const ref = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades/${gradeId}`
      );

      await setDoc(ref, parsed.data, { merge: true });
      toast.success(`تم حفظ ${entitySingleLabel} بنجاح`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error(`تعذر حفظ ${entitySingleLabel}`);
    } finally {
      setSaving(false);
    }
  }

  function clearStreamFilter() {
    setSelectedStreamId("");
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge={`إدارة ${entitySingleLabel}`}
        badgeIcon={
          schoolType === "PRIMARY" ? (
            <GraduationCap className="h-3.5 w-3.5" />
          ) : (
            <Shapes className="h-3.5 w-3.5" />
          )
        }
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة أو العنصر المطلوب غير موجود."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
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
        badge={`إدارة ${entitySingleLabel}`}
        badgeIcon={
          schoolType === "PRIMARY" ? (
            <GraduationCap className="h-3.5 w-3.5" />
          ) : (
            <Shapes className="h-3.5 w-3.5" />
          )
        }
        title={`${entitySingleLabel}: ${data?.grade.title ?? ""}`}
        description={`${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/grades`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى {getEntityPluralLabel(schoolType)}
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
                  حفظ التعديلات
                </>
              )}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint={`السياق الحالي: ${schoolType === "PRIMARY" ? "صف" : "مستوى"}`}
        />
        <InfoCard
          label={`الفصول التابعة لـ${entitySingleLabel}`}
          value={totalClasses}
          hint="كل الفصول المرتبطة بهذا العنصر"
        />
        <InfoCard
          label="الفصول النشطة"
          value={activeClasses}
          hint="الفصول غير المؤرشفة"
        />
        <InfoCard
          label="الفصول المؤرشفة"
          value={archivedClasses}
          hint="الفصول المعلمة كأرشيف"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <FormSection
          title={`بيانات ${entitySingleLabel}`}
          description={`يمكنك تعديل البيانات الأساسية لهذا ${entitySingleLabel}.`}
          contentClassName="space-y-4"
        >
          {error || saveError ? (
            <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error ?? saveError}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">{`اسم ${entitySingleLabel}`}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

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

        <div className="space-y-6">
          <FormSection
            title={`سياق ${entitySingleLabel}`}
            description="ملخص سريع للعلاقة بين هذا العنصر والفصول التابعة له."
            contentClassName="space-y-3"
          >
            <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
              {schoolType === "PRIMARY"
                ? "في الابتدائي يُستخدم الصف لتجميع الفصول، ويمكن داخل الصف نفسه وجود مسارات أكاديمية متعددة مثل العام والتحفيظ والعالمي."
                : "في الروضة يُستخدم المستوى لتجميع الفصول التابعة له، ثم تنبني عليه المتابعات والقياسات والفصل الأساسي للأطفال."}
            </div>

            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes`}>
                <span className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4" />
                  جميع الفصول
                </span>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            {schoolType === "PRIMARY" ? (
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/streams`}>
                  <span className="flex items-center gap-2">
                    <Milestone className="h-4 w-4" />
                    المسارات
                  </span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </FormSection>

          {schoolType === "PRIMARY" ? (
            <FormSection
              title="تصفية الفصول حسب المسار"
              description="يمكنك حصر الفصول التابعة لهذا الصف داخل مسار أكاديمي محدد."
              contentClassName="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">المسار</label>
                <select
                  value={selectedStreamId}
                  onChange={(e) => setSelectedStreamId(e.target.value)}
                  className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
                >
                  <option value="">الكل</option>
                  {(data?.streams ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={clearStreamFilter}>
                  <X className="h-4 w-4" />
                  مسح التصفية
                </Button>

                <Button asChild>
                  <Link href={addClassHref}>
                    <Plus className="h-4 w-4" />
                    إضافة فصل داخل هذا الصف
                  </Link>
                </Button>
              </div>
            </FormSection>
          ) : (
            <FormSection
              title="إضافة فصل جديد"
              description="إضافة فصل جديد تابع لهذا المستوى."
            >
              <Button asChild>
                <Link href={addClassHref}>
                  <Plus className="h-4 w-4" />
                  إضافة فصل داخل هذا المستوى
                </Link>
              </Button>
            </FormSection>
          )}
        </div>
      </div>

      {schoolType === "PRIMARY" ? (
        <FormSection
          title="المسارات داخل هذا الصف"
          description="عرض سريع للمسارات الأكاديمية وحجم الفصول التابعة لكل مسار داخل هذا الصف."
          contentClassName="space-y-4"
        >
          {streamCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              لا توجد مسارات أكاديمية مسجلة في هذه السنة بعد.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {streamCards.map((stream) => (
                <div key={stream.id} className="rounded-2xl border bg-card p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Milestone className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">{stream.title}</h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard
                        label="إجمالي الفصول"
                        value={stream.totalClasses}
                        hint="الفصول التابعة لهذا الصف داخل هذا المسار"
                      />
                      <InfoCard
                        label="الفصول النشطة"
                        value={stream.activeClasses}
                        hint="غير المؤرشفة"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={selectedStreamId === stream.id ? "default" : "outline"}
                        onClick={() => setSelectedStreamId(stream.id)}
                      >
                        عرض فصول هذا المسار
                      </Button>

                      <Button asChild variant="ghost">
                        <Link
                          href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/new?gradeId=${encodeURIComponent(
                            gradeId
                          )}&streamId=${encodeURIComponent(stream.id)}`}
                        >
                          إضافة فصل داخل المسار
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {classesWithoutStreamCount > 0 ? (
            <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              يوجد <span className="font-medium text-foreground">{classesWithoutStreamCount}</span>{" "}
              فصلًا داخل هذا الصف غير مربوط بأي مسار حتى الآن.
            </div>
          ) : null}
        </FormSection>
      ) : null}

      <FormSection
        title={`الفصول التابعة لـ${entitySingleLabel}`}
        description={
          schoolType === "PRIMARY"
            ? "هذه الفصول مرتبطة بهذا الصف، ويمكن حصرها بمسار معين عند الحاجة."
            : "هذه الفصول مرتبطة بهذا المستوى داخل الروضة."
        }
        contentClassName="space-y-4"
      >
        {filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <DoorOpen className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">
                {totalClasses === 0
                  ? `لا توجد فصول مرتبطة بهذا ${entitySingleLabel} حتى الآن`
                  : "لا توجد فصول مطابقة للتصفية الحالية"}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalClasses === 0
                  ? `يمكنك إضافة أول فصل تابع لهذا ${entitySingleLabel}.`
                  : "جرّب تغيير المسار أو مسح التصفية الحالية."}
              </p>
            </div>

            <Button asChild>
              <Link href={addClassHref}>
                <Plus className="h-4 w-4" />
                إضافة فصل
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredClasses.map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border bg-card p-4 transition hover:bg-muted/20 ${
                  row.isArchived ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {row.title}
                        {row.code ? ` (${row.code})` : ""}
                      </h3>

                      {row.isArchived ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          مؤرشف
                        </span>
                      ) : (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          نشط
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Layers3 className="h-4 w-4" />
                        الترتيب: {row.order}
                      </span>

                      {schoolType === "PRIMARY" && row.streamId ? (
                        <span className="inline-flex items-center gap-1">
                          <Milestone className="h-4 w-4" />
                          المسار: {streamMap.get(row.streamId) ?? row.streamId}
                        </span>
                      ) : null}

                      {row.sectionLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <School className="h-4 w-4" />
                          الرمز: {row.sectionLabel}
                        </span>
                      ) : null}

                      {typeof row.capacity === "number" ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          السعة: {row.capacity}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/classes/${row.id}`}
                      >
                        تعديل الفصل
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "هذا الفصل تابع مباشرة لهذا الصف، وقد يكون مرتبطًا بمسار أكاديمي محدد داخل الابتدائي."
                    : "هذا الفصل تابع مباشرة لهذا المستوى داخل الروضة، ويمكن لاحقًا ربطه بالمعلمة الأساسية والمتابعات والقياسات."}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}