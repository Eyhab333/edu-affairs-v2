"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { ArrowLeft, Building2, School, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import {
  DetailPageSkeleton,
  PageMessageState,
} from "@/components/shared/PageState";
import { Button } from "@/components/ui/button";

type OrgDoc = {
  id: string;
  nameAr?: string;
  nameEn?: string;
  shortName?: string;
  status?: string;
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
  };
  locale?: {
    language?: string;
    direction?: string;
    timezone?: string;
    countryCode?: string;
    currency?: string;
  };
  features?: {
    enabledModules?: string[];
  };
  settings?: {
    academicStructureMode?: string;
    allowMultipleActiveAcademicYears?: boolean;
    supportedSchoolTypes?: string[];
  };
};

type OrgDashboardData = {
  org: OrgDoc;
  schoolsCount: number;
};

function getStatusLabel(status?: string) {
  switch (status) {
    case "active":
      return "نشطة";
    case "inactive":
      return "غير نشطة";
    case "archived":
      return "مؤرشفة";
    default:
      return "غير محدد";
  }
}

function getAcademicStructureModeLabel(mode?: string) {
  switch (mode) {
    case "stages":
      return "مراحل";
    case "grades":
      return "صفوف";
    case "levels":
      return "مستويات";
    default:
      return "غير محدد";
  }
}

export default function OrgDashboardPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = typeof params?.orgId === "string" ? params.orgId : "";

  const { user, checkingAuth } = useRequireAuth();

  const loadOrgDashboard = useCallback(async (): Promise<OrgDashboardData | null> => {
    if (!orgId) {
      return null;
    }

    try {
      console.log("[OrgDashboardPage] route orgId:", orgId);
      console.log("[OrgDashboardPage] current uid:", user?.uid);
      console.log("[OrgDashboardPage] current email:", user?.email);

      const orgRef = doc(db, "orgs", orgId);
      const orgSnap = await getDoc(orgRef);

      console.log("[OrgDashboardPage] org read success:", orgSnap.exists());

      if (!orgSnap.exists()) {
        return null;
      }

      let schoolsCount = 0;

      try {
        const schoolsRef = collection(db, "orgs", orgId, "schools");
        const schoolsSnap = await getDocs(schoolsRef);
        schoolsCount = schoolsSnap.size;

        console.log("[OrgDashboardPage] schools read success. count:", schoolsCount);
      } catch (schoolsError) {
        console.error("[OrgDashboardPage] schools read failed:", schoolsError);
        throw new Error("تعذر تحميل المدارس التابعة للمؤسسة. تحقق من صلاحيات قراءة schools.");
      }

      return {
        org: {
          id: orgSnap.id,
          ...(orgSnap.data() as Omit<OrgDoc, "id">),
        },
        schoolsCount,
      };
    } catch (error) {
      console.error("[OrgDashboardPage] loadOrgDashboard failed:", error);
      throw error;
    }
  }, [orgId, user?.email, user?.uid]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<OrgDashboardData>({
    enabled: !!user && !!orgId,
    loader: loadOrgDashboard,
    deps: [orgId, user?.uid],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل بيانات المؤسسة");
    }
  }, [error]);

  if (checkingAuth || loading) {
    return <DetailPageSkeleton />;
  }

  if (notFound || !orgId) {
    return (
      <PageMessageState
        title="المؤسسة غير موجودة"
        description="تعذر العثور على المؤسسة المطلوبة أو أن الرابط غير صحيح."
        action={
          <Button asChild variant="outline">
            <Link href="/orgs">
              <ArrowLeft className="h-4 w-4" />
              <span>العودة إلى المؤسسات</span>
            </Link>
          </Button>
        }
      />
    );
  }

  if (error || !data) {
    return (
      <PageMessageState
        title="حدث خطأ"
        description={
          typeof error === "string"
            ? error
            : "تعذر تحميل بيانات المؤسسة. تحقق من Firestore Rules ومن وجود عضوية للمستخدم داخل المؤسسة."
        }
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void reload()}>
              إعادة المحاولة
            </Button>
            <Button asChild variant="ghost">
              <Link href="/orgs">
                <ArrowLeft className="h-4 w-4" />
                <span>العودة إلى المؤسسات</span>
              </Link>
            </Button>
          </div>
        }
      />
    );
  }

  const { org, schoolsCount } = data;
  const displayName = org.nameAr ?? org.shortName ?? org.nameEn ?? org.id;
  const enabledModules = org.features?.enabledModules ?? [];
  const supportedSchoolTypes = org.settings?.supportedSchoolTypes ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        badge="المؤسسة"
        badgeIcon={<Building2 className="h-3.5 w-3.5" />}
        title={displayName}
        description="نظرة عامة على المؤسسة وإعداداتها العامة وعدد المدارس التابعة لها."
        actions={
          <Button asChild variant="outline">
            <Link href="/orgs">
              <ArrowLeft className="h-4 w-4" />
              <span>العودة إلى المؤسسات</span>
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="حالة المؤسسة"
          value={getStatusLabel(org.status)}
          hint={`المعرف: ${org.id}`}
        />
        <InfoCard
          label="عدد المدارس"
          value={schoolsCount}
          hint="إجمالي المدارس التابعة لهذه المؤسسة"
        />
        <InfoCard
          label="المنطقة الزمنية"
          value={org.locale?.timezone ?? "غير محدد"}
          hint="المنطقة الزمنية المعتمدة بالمؤسسة"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <FormSection
          title="البيانات الأساسية"
          description="بيانات التعريف الأساسية للمؤسسة."
          contentClassName="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="الاسم بالعربية"
              value={org.nameAr ?? "—"}
            />
            <InfoCard
              label="الاسم بالإنجليزية"
              value={org.nameEn ?? "—"}
            />
            <InfoCard
              label="الاسم المختصر"
              value={org.shortName ?? "—"}
            />
            <InfoCard
              label="الحالة"
              value={getStatusLabel(org.status)}
            />
          </div>
        </FormSection>

        <FormSection
          title="الإعدادات العامة"
          description="الإعدادات المرتبطة ببنية المؤسسة."
          contentClassName="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="نمط الهيكل الأكاديمي"
              value={getAcademicStructureModeLabel(
                org.settings?.academicStructureMode
              )}
            />
            <InfoCard
              label="سنوات أكاديمية متعددة"
              value={
                org.settings?.allowMultipleActiveAcademicYears ? "مسموح" : "غير مسموح"
              }
            />
            <InfoCard
              label="اللغة"
              value={org.locale?.language ?? "—"}
            />
            <InfoCard
              label="الاتجاه"
              value={org.locale?.direction ?? "—"}
            />
            <InfoCard
              label="الدولة"
              value={org.locale?.countryCode ?? "—"}
            />
            <InfoCard
              label="العملة"
              value={org.locale?.currency ?? "—"}
            />
          </div>
        </FormSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <FormSection
          title="الهوية البصرية"
          description="إعدادات الألوان الرئيسية للمؤسسة."
          contentClassName="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="اللون الأساسي"
              value={org.branding?.primaryColor ?? "—"}
            />
            <InfoCard
              label="اللون الثانوي"
              value={org.branding?.secondaryColor ?? "—"}
            />
          </div>
        </FormSection>

        <FormSection
          title="الوحدات والأنواع المدعومة"
          description="الوحدات المفعلة وأنواع المدارس المدعومة."
          contentClassName="space-y-4"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">الوحدات المفعلة</h3>
              </div>

              {enabledModules.length ? (
                <div className="flex flex-wrap gap-2">
                  {enabledModules.map((moduleName) => (
                    <span
                      key={moduleName}
                      className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      {moduleName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد وحدات مفعلة.</p>
              )}
            </div>

            <div className="rounded-2xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                <School className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">أنواع المدارس المدعومة</h3>
              </div>

              {supportedSchoolTypes.length ? (
                <div className="flex flex-wrap gap-2">
                  {supportedSchoolTypes.map((typeName) => (
                    <span
                      key={typeName}
                      className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
                    >
                      {typeName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  لا توجد أنواع مدارس محددة.
                </p>
              )}
            </div>
          </div>
        </FormSection>
      </div>
    </div>
  );
}