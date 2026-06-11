"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileStack, Plus } from "lucide-react";
import { collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type FrameworkStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type TargetKind = "TEACHER" | "STAFF" | "LEADER" | "ADMIN";

type SchoolRow = {
  id: string;
  name: string;
};

type FrameworkRow = {
  id: string;
  orgId: string;
  schoolId?: string;
  title: string;
  targetRoleKey: string;
  targetKind: TargetKind;
  status: FrameworkStatus;
  version: number;
  description?: string;
  isActive?: boolean;
};

type PageData = {
  schools: SchoolRow[];
  frameworks: FrameworkRow[];
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
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getFrameworkStatusLabel(status?: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "ACTIVE":
      return "نشط";
    case "ARCHIVED":
      return "مؤرشف";
    default:
      return status || "—";
  }
}

function getTargetKindLabel(kind?: string) {
  switch (kind) {
    case "TEACHER":
      return "معلم";
    case "STAFF":
      return "موظف";
    case "LEADER":
      return "قيادي";
    case "ADMIN":
      return "إداري";
    default:
      return kind || "—";
  }
}

export default function EvaluationFrameworksPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const frameworksRef = collection(db, `orgs/${orgId}/evaluationFrameworks`);

    const [schoolsSnap, frameworksSnap] = await Promise.all([
      getDocs(query(schoolsRef)),
      getDocs(query(frameworksRef)),
    ]);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const frameworks = frameworksSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<FrameworkRow, "id">),
      }))
      .sort((a, b) => {
        const aTitle = a.title || a.id;
        const bTitle = b.title || b.id;
        return aTitle.localeCompare(bTitle, "ar");
      });

    return { schools, frameworks };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل Frameworks");
  }, [error]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );

  const total = data?.frameworks.length ?? 0;
  const active = data?.frameworks.filter((item) => item.isActive !== false).length ?? 0;
  const drafts =
    data?.frameworks.filter((item) => item.status === "DRAFT").length ?? 0;

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Frameworks"
        badgeIcon={<FileStack className="h-3.5 w-3.5" />}
        title="Frameworks"
        description="تعريف الأطر الأساسية للتقييم حسب الدور والفئة المستهدفة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/orgs/${orgId}/evaluations/frameworks/new`}>
                <Plus className="h-4 w-4" />
                إضافة Framework
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي Frameworks" value={total} hint="كل الأطر المعرفة" />
        <InfoCard label="النشطة" value={active} hint="الصالحة للاستخدام" />
        <InfoCard label="المسودات" value={drafts} hint="تحتاج استكمال أو تفعيل" />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="القائمة"
        description="الأطر المعرفة داخل المؤسسة."
        contentClassName="space-y-4"
      >
        {(data?.frameworks.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
            لا توجد Frameworks حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.frameworks ?? []).map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{row.title}</h3>

                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                      الإصدار {row.version}
                    </span>

                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {getFrameworkStatusLabel(row.status)}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>
                      المدرسة:{" "}
                      <span className="font-medium text-foreground">
                        {row.schoolId ? schoolMap.get(row.schoolId) ?? row.schoolId : "على مستوى المؤسسة"}
                      </span>
                    </div>

                    <div>
                      الفئة المستهدفة:{" "}
                      <span className="font-medium text-foreground">
                        {getTargetKindLabel(row.targetKind)}
                      </span>
                    </div>

                    <div>
                      الدور المستهدف:{" "}
                      <span className="font-medium text-foreground">
                        {row.targetRoleKey}
                      </span>
                    </div>

                    <div>
                      الوصف:{" "}
                      <span className="font-medium text-foreground">
                        {row.description || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}