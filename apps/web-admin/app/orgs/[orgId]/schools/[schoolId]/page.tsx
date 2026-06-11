"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Bus,
  CalendarDays,
  ClipboardCheck,
  FolderKanban,
  GraduationCap,
  Milestone,
  Save,
  School,
  Settings2,
  Shapes,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ModuleKey, SchoolSchema, SchoolType } from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = z.infer<typeof SchoolType>;
type ModuleKeyValue = z.infer<typeof ModuleKey>;

type SchoolFormData = {
  name: string;
  schoolType: SchoolTypeValue;
  enabledModules: ModuleKeyValue[];
  isArchived: boolean;
};

type FocusCard = {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  soon?: boolean;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function EditSchoolPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="h-[640px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-[640px] animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

function getSchoolTypeLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

function getSchoolTypeDescription(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "تجربة المدرسة الابتدائية تركّز على الصفوف والمسارات الأكاديمية والاختبارات وشؤون الطلاب."
    : "تجربة الروضة تركّز على المستويات والفصول والمتابعات والقياسات المبكرة.";
}

function getSchoolTypeBadgeClassName(type: SchoolTypeValue) {
  return type === "PRIMARY"
    ? "bg-primary/10 text-primary"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function getFocusCards(
  schoolType: SchoolTypeValue,
  orgId: string,
  schoolId: string
): FocusCard[] {
  if (schoolType === "PRIMARY") {
    return [
      {
        title: "السنوات الدراسية",
        description: "إدارة السنوات الدراسية والانتقال منها إلى الصفوف والفصول.",
        icon: <CalendarDays className="h-5 w-5" />,
        href: `/orgs/${orgId}/schools/${schoolId}/years`,
      },
      {
        title: "الصفوف والفصول",
        description: "العمل لاحقًا على صفوف الابتدائي والفصول المرتبطة بها.",
        icon: <GraduationCap className="h-5 w-5" />,
        soon: true,
      },
      {
        title: "المسارات الأكاديمية",
        description: "تمييز العام والتحفيظ والعالمي داخل المدرسة الابتدائية.",
        icon: <Milestone className="h-5 w-5" />,
        soon: true,
      },
      {
        title: "القياسات والاختبارات",
        description: "الاختبار التشخيصي والفتري والقياسات المركزية.",
        icon: <ClipboardCheck className="h-5 w-5" />,
        soon: true,
      },
      {
        title: "شؤون الطلاب",
        description: "الحضور والإحالات والقضايا الطلابية والمتابعة اليومية.",
        icon: <Users className="h-5 w-5" />,
        soon: true,
      },
    ];
  }

  return [
    {
      title: "السنوات الدراسية",
      description: "إدارة السنوات الدراسية والانتقال منها إلى المستويات والفصول.",
      icon: <CalendarDays className="h-5 w-5" />,
      href: `/orgs/${orgId}/schools/${schoolId}/years`,
    },
    {
      title: "المستويات والفصول",
      description: "العمل لاحقًا على مستويات الروضة والفصول الخاصة بكل معلمة.",
      icon: <Shapes className="h-5 w-5" />,
      soon: true,
    },
    {
      title: "المتابعات",
      description: "متابعة القرآن والفاقد وبساتين المعرفة والأرقام.",
      icon: <BookOpenCheck className="h-5 w-5" />,
      soon: true,
    },
    {
      title: "القياسات",
      description: "قياسات المعلمة وقياسات الوكيلة داخل الروضة.",
      icon: <ClipboardCheck className="h-5 w-5" />,
      soon: true,
    },
    {
      title: "الحضور والنقل",
      description: "حضور الأطفال اليومي وحضور الباصات للطلاب المشتركين في النقل.",
      icon: <Bus className="h-5 w-5" />,
      soon: true,
    },
  ];
}

export default function EditSchoolPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; schoolId: string }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;

  const { user, checkingAuth } = useRequireAuth();

  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolTypeValue>("PRIMARY");
  const [enabledModules, setEnabledModules] = useState<ModuleKeyValue[]>([
    "CORE",
    "COMMS",
  ]);
  const [isArchived, setIsArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const moduleOptions = useMemo(
    () => [...ModuleKey.options] as ModuleKeyValue[],
    []
  );

  const loadSchool = useCallback(async (): Promise<SchoolFormData | null> => {
    const ref = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data() as {
      name?: string;
      isArchived?: boolean;
      profile?: {
        schoolType?: SchoolTypeValue;
        enabledModules?: ModuleKeyValue[];
      };
    };

    return {
      name: data.name ?? "",
      schoolType: (data.profile?.schoolType ?? "PRIMARY") as SchoolTypeValue,
      enabledModules: Array.isArray(data.profile?.enabledModules)
        ? (data.profile.enabledModules as ModuleKeyValue[])
        : ["CORE", "COMMS"],
      isArchived: !!data.isArchived,
    };
  }, [orgId, schoolId]);

  const { data, loading, error, notFound } = useDocumentLoader<SchoolFormData>({
    enabled: !!user,
    loader: loadSchool,
    deps: [orgId, schoolId],
  });

  useEffect(() => {
    if (!data) return;

    setName(data.name);
    setSchoolType(data.schoolType);
    setEnabledModules(data.enabledModules);
    setIsArchived(data.isArchived);
  }, [data]);

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل بيانات المدرسة");
    }
  }, [error]);

  function toggleModule(moduleKey: ModuleKeyValue) {
    setEnabledModules((prev) =>
      prev.includes(moduleKey)
        ? prev.filter((item) => item !== moduleKey)
        : [...prev, moduleKey]
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const ref = doc(db, `orgs/${orgId}/schools/${schoolId}`);

      const payload = {
        id: schoolId,
        orgId,
        name: name.trim(),
        profile: {
          schoolType,
          enabledModules,
        },
        isArchived,
      };

      const parsed = SchoolSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n")
        );
      }

      await setDoc(ref, parsed.data, { merge: true });
      toast.success("تم حفظ بيانات المدرسة بنجاح");
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ بيانات المدرسة");
    } finally {
      setSaving(false);
    }
  }

  const focusCards = useMemo(
    () => getFocusCards(schoolType, orgId, schoolId),
    [schoolType, orgId, schoolId]
  );

  if (checkingAuth || loading) {
    return <EditSchoolPageSkeleton />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHero
          badge="المدارس"
          badgeIcon={<School className="h-3.5 w-3.5" />}
          title="المدرسة غير موجودة"
          description="تعذر العثور على السجل المطلوب داخل المؤسسة الحالية."
          actions={
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools`}>
                <ArrowRight className="h-4 w-4" />
                العودة إلى المدارس
              </Link>
            </Button>
          }
        />

        <FormSection
          title="تعذر تحميل السجل"
          description="قد تكون المدرسة محذوفة أو أن الرابط غير صحيح."
        >
          <div className="text-sm text-muted-foreground">
            راجع الرابط الحالي أو ارجع إلى قائمة المدارس ثم اختر المدرسة من
            جديد.
          </div>
        </FormSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="إدارة المدرسة"
        badgeIcon={<School className="h-3.5 w-3.5" />}
        title={name || "المدرسة"}
        description={getSchoolTypeDescription(schoolType)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools`}>
                <ArrowRight className="h-4 w-4" />
                العودة إلى المدارس
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint="يحدد تجربة الإدارة والمسارات الداخلية"
        />
        <InfoCard
          label="عدد الوحدات المفعلة"
          value={enabledModules.length}
          hint="الوحدات الحالية المفعلة على سجل المدرسة"
        />
        <InfoCard
          label="الحالة"
          value={isArchived ? "مؤرشفة" : "نشطة"}
          hint={isArchived ? "السجل معلم كأرشيف" : "السجل متاح للاستخدام"}
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${getSchoolTypeBadgeClassName(
              schoolType
            )}`}
          >
            {schoolType === "PRIMARY"
              ? "تجربة ابتدائي"
              : "تجربة روضة"}
          </span>

          <span className="text-sm text-muted-foreground">
            {schoolType === "PRIMARY"
              ? "تظهر في هذه المدرسة مفاهيم الصفوف والمسارات والاختبارات وشؤون الطلاب."
              : "تظهر في هذه المدرسة مفاهيم المستويات والفصول والمتابعات والقياسات المبكرة."}
          </span>
        </div>
      </div>

      {saveError ? (
        <FormSection
          title="تعذر الحفظ"
          description="حدث خطأ أثناء محاولة حفظ بيانات المدرسة."
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive whitespace-pre-line">
            {saveError}
          </div>
        </FormSection>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <FormSection
          title="البيانات الأساسية"
          description="تعديل بيانات المدرسة وسلوكها الأساسي داخل النظام."
          contentClassName="space-y-5"
        >
          <div className="grid gap-2">
            <label className="text-sm font-medium">اسم المدرسة</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اكتب اسم المدرسة"
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">نوع المدرسة</label>
            <select
              value={schoolType}
              onChange={(e) =>
                setSchoolType(e.target.value as SchoolTypeValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="PRIMARY">ابتدائي</option>
              <option value="KG">روضة</option>
            </select>
            <p className="text-xs text-muted-foreground">
              تغيير النوع سيؤثر على تجربة الإدارة والاختصارات الظاهرة في هذه
              الصفحة.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">الوحدات المفعلة</div>

            <div className="grid gap-3 md:grid-cols-2">
              {moduleOptions.map((moduleKey) => {
                const checked = enabledModules.includes(moduleKey);

                return (
                  <label
                    key={moduleKey}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{moduleKey}</div>
                      <div className="text-xs text-muted-foreground">
                        تفعيل أو تعطيل هذه الوحدة للمدرسة.
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModule(moduleKey)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">أرشفة المدرسة</div>
                <div className="text-xs text-muted-foreground">
                  عند التفعيل ستُعامل المدرسة ككيان مؤرشف داخل النظام.
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
            title="معلومات سريعة"
            description="ملخص سريع للسجل الحالي."
            contentClassName="space-y-3"
          >
            <InfoCard
              label="معرّف المدرسة"
              value={schoolId}
              valueClassName="break-all"
            />
            <InfoCard
              label="معرّف المؤسسة"
              value={orgId}
              valueClassName="break-all"
            />
            <div className="pt-1">
              <StatusBadge archived={Boolean(isArchived)} />
            </div>
          </FormSection>

          <FormSection
            title={
              schoolType === "PRIMARY"
                ? "محاور العمل في الابتدائي"
                : "محاور العمل في الروضة"
            }
            description="اختصارات وسياق العمل التالي داخل هذه المدرسة."
            contentClassName="space-y-3"
          >
            {focusCards.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border bg-card px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    {item.icon}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      {item.soon ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          قريبًا
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs leading-6 text-muted-foreground">
                      {item.description}
                    </p>

                    {item.href ? (
                      <div className="pt-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={item.href}>
                            فتح
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </FormSection>

          <FormSection
            title="روابط مرتبطة"
            description="اختصارات عامة مرتبطة بإدارة المدرسة."
            contentClassName="space-y-2"
          >
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years`}>
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  السنوات الدراسية
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full justify-between">
              <Link href={`/orgs/${orgId}/settings`}>
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  إعدادات المؤسسة
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </FormSection>

          <FormSection
            title="تصور المرحلة القادمة"
            description="هذا الجزء يوضح ما الذي سيتفرع لاحقًا من هذه الصفحة."
            contentClassName="space-y-2"
          >
            <div className="rounded-2xl border px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {schoolType === "PRIMARY" ? (
                  <GraduationCap className="h-4 w-4" />
                ) : (
                  <Shapes className="h-4 w-4" />
                )}
                {schoolType === "PRIMARY"
                  ? "الابتدائي"
                  : "الروضة"}
              </div>

              <div className="mt-2 space-y-2 text-xs leading-6 text-muted-foreground">
                {schoolType === "PRIMARY" ? (
                  <>
                    <p>• صفوف ومراحل ومسارات مثل العام والتحفيظ والعالمي.</p>
                    <p>• قياسات واختبارات فترية ومركزية.</p>
                    <p>• حضور وإحالات وشؤون طلاب.</p>
                  </>
                ) : (
                  <>
                    <p>• مستويات وفصول خاصة بكل معلمة.</p>
                    <p>• قياسات للمعلمة والوكيلة.</p>
                    <p>• متابعات القرآن والفاقد وبساتين المعرفة والأرقام.</p>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FolderKanban className="h-4 w-4" />
                وحدات مرتبطة
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {enabledModules.length > 0 ? (
                  enabledModules.map((moduleKey) => (
                    <span
                      key={moduleKey}
                      className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground"
                    >
                      {moduleKey}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">لا توجد وحدات مفعلة</span>
                )}
              </div>
            </div>

            
          </FormSection>
        </div>
      </div>
    </div>
  );
}