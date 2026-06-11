"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  getAvailableOrgsForUser,
  OrgRecord,
  setOrgId,
} from "@/lib/org";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type PlatformOrgRow = OrgRecord & {
  locale?: {
    timezone?: string;
  };
};

function PlatformPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

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

function getRoleLabel(role?: string) {
  switch (role) {
    case "superadmin":
    case "super_admin":
    case "super-admin":
      return "سوبر أدمن";
    case "platform_owner":
      return "مالك المنصة";
    case "platform_admin":
      return "مدير المنصة";
    case "org_owner":
      return "مالك المؤسسة";
    case "org_admin":
      return "مدير المؤسسة";
    case "school_admin":
      return "مدير مدرسة";
    case "school_manager":
      return "مشرف مدرسة";
    case "staff":
      return "موظف";
    case "teacher":
      return "معلم";
    case "viewer":
      return "مستعرض";
    default:
      return "بدون دور محدد";
  }
}

export default function PlatformOrgsPage() {
  const { user, checkingAuth } = useRequireAuth();

  const loadAccessibleOrgs = useCallback(async (): Promise<PlatformOrgRow[]> => {
    if (!user?.uid) {
      return [];
    }

    const rows = await getAvailableOrgsForUser(user.uid);
    return rows as PlatformOrgRow[];
  }, [user?.uid]);

  const { data, loading, error, reload } = useDocumentLoader<PlatformOrgRow[]>({
    enabled: !!user?.uid,
    loader: loadAccessibleOrgs,
    deps: [user?.uid],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل المؤسسات المتاحة");
    }
  }, [error]);

  const rows = data ?? [];
  const totalOrgs = rows.length;
  const activeOrgs = rows.filter((row) => row.status === "active").length;

  if (checkingAuth || loading) {
    return <PlatformPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="مستوى المنصة"
        badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="المؤسسات المتاحة"
        description="المؤسسات التي يملك المستخدم الحالي صلاحية الوصول إليها."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="إجمالي المؤسسات"
          value={totalOrgs}
          hint="المؤسسات المرتبطة بعضويتك الحالية"
        />
        <InfoCard
          label="المؤسسات النشطة"
          value={activeOrgs}
          hint="المؤسسات المتاحة حاليًا"
        />
        <InfoCard
          label="المستخدم الحالي"
          value={user?.email ?? "—"}
          hint="الحساب المسجل دخوله الآن"
          valueClassName="break-all"
        />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل قائمة المؤسسات المتاحة للمستخدم الحالي."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {String(error)}
          </div>

          <div>
            <Button variant="outline" onClick={() => void reload()}>
              إعادة المحاولة
            </Button>
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="المؤسسات المتاحة"
        description="اختر المؤسسة التي تريد الدخول إليها."
        contentClassName="space-y-4"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد مؤسسات متاحة لهذا الحساب</p>
              <p className="text-sm text-muted-foreground">
                تأكد من وجود عضوية فعالة للمستخدم الحالي داخل مؤسسة واحدة على الأقل.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const displayName =
                row.nameAr ?? row.shortName ?? row.nameEn ?? row.id;

              return (
                <div
                  key={row.id}
                  className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold">{displayName}</h3>
                      <p className="text-sm text-muted-foreground">
                        المعرف: {row.id}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                        {getStatusLabel(row.status)}
                      </span>

                      {row.role ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                          {getRoleLabel(row.role)}
                        </span>
                      ) : null}

                      {row.locale?.timezone ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                          {row.locale.timezone}
                        </span>
                      ) : null}
                    </div>

                    <Button asChild variant="outline" className="w-full justify-between">
                      <Link
                        href={`/orgs/${row.id}`}
                        onClick={() => user?.uid && setOrgId(user.uid, row.id)}
                      >
                        <span>الدخول إلى المؤسسة</span>
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>
    </div>
  );
}