"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, ShieldAlert } from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolTypeValue = "PRIMARY" | "KG";

type CaseTypeRow = {
  id: string;
  title: string;
  schoolType: SchoolTypeValue;
  defaultOwnerRoleKey: string;
  allowedForwardToRoleKeys?: string[];
  allowTeacherCreate?: boolean;
  allowGuardianCreate?: boolean;
  notifyGuardianOnCreate?: boolean;
  notifyGuardianOnForward?: boolean;
  notifyGuardianOnClose?: boolean;
  autoCloseWhenResolved?: boolean;
  isActive?: boolean;
};

type PageData = {
  org: {
    id: string;
    nameAr?: string;
    nameEn?: string;
    shortName?: string;
  };
  caseTypes: CaseTypeRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[480px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getOrgDisplayName(
  org: PageData["org"] | null | undefined,
  fallback: string
) {
  return org?.nameAr ?? org?.shortName ?? org?.nameEn ?? fallback;
}

function getSchoolTypeLabel(type?: string) {
  switch (type) {
    case "PRIMARY":
      return "ابتدائي";
    case "KG":
      return "روضة";
    default:
      return type || "—";
  }
}

export default function CaseTypesPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const orgRef = doc(db, `orgs/${orgId}`);
    const caseTypesRef = collection(db, `orgs/${orgId}/studentCaseTypes`);

    const [orgSnap, caseTypesSnap] = await Promise.all([
      getDoc(orgRef),
      getDocs(query(caseTypesRef)),
    ]);

    if (!orgSnap.exists()) return null;

    const caseTypes = caseTypesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CaseTypeRow, "id">),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));

    return {
      org: {
        id: orgSnap.id,
        ...(orgSnap.data() as Omit<PageData["org"], "id">),
      },
      caseTypes,
    };
  }, [orgId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل أنواع القضايا");
  }, [error]);

  const rows = data?.caseTypes ?? [];
  const total = rows.length;
  const active = rows.filter((row) => row.isActive !== false).length;
  const inactive = total - active;

  const grouped = useMemo(() => {
    return {
      PRIMARY: rows.filter((row) => row.schoolType === "PRIMARY"),
      KG: rows.filter((row) => row.schoolType === "KG"),
    };
  }, [rows]);

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="أنواع القضايا"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="تعذر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href="/orgs">
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
        badge="أنواع القضايا"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title={`أنواع القضايا - ${getOrgDisplayName(data?.org, orgId)}`}
        description="تعريف الأنواع الأساسية التي ستُستخدم عند إنشاء قضايا الطلاب."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى المؤسسة
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/case-types/new`}>
                <Plus className="h-4 w-4" />
                إضافة نوع قضية
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي الأنواع" value={total} hint="كل الأنواع المعرفة" />
        <InfoCard label="الأنواع النشطة" value={active} hint="القابلة للاستخدام الآن" />
        <InfoCard label="الأنواع غير النشطة" value={inactive} hint="المعطلة مؤقتًا" />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات المطلوبة."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {String(error)}
          </div>

          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      {(["PRIMARY", "KG"] as const).map((schoolType) => (
        <FormSection
          key={schoolType}
          title={`أنواع ${getSchoolTypeLabel(schoolType)}`}
          description={`الأنواع المعرفة لمرحلة ${getSchoolTypeLabel(schoolType)}.`}
          contentClassName="space-y-4"
        >
          {grouped[schoolType].length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              لا توجد أنواع معرفة لهذه المرحلة بعد.
            </div>
          ) : (
            <div className="grid gap-4">
              {grouped[schoolType].map((row) => (
                <div key={row.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">{row.title}</h3>

                        {row.isActive === false ? (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            غير نشط
                          </span>
                        ) : (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                            نشط
                          </span>
                        )}
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          المالك الافتراضي:{" "}
                          <span className="font-medium text-foreground">
                            {row.defaultOwnerRoleKey}
                          </span>
                        </div>

                        <div>
                          السماح للمعلم بالإنشاء:{" "}
                          <span className="font-medium text-foreground">
                            {row.allowTeacherCreate ? "نعم" : "لا"}
                          </span>
                        </div>

                        <div>
                          السماح لولي الأمر بالإنشاء:{" "}
                          <span className="font-medium text-foreground">
                            {row.allowGuardianCreate ? "نعم" : "لا"}
                          </span>
                        </div>

                        <div>
                          التحويل المسموح إلى:{" "}
                          <span className="font-medium text-foreground">
                            {(row.allowedForwardToRoleKeys ?? []).length > 0
                              ? row.allowedForwardToRoleKeys?.join("، ")
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      ))}
    </div>
  );
}