"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Building2,
  GraduationCap,
  Plus,
  School,
  Shapes,
} from "lucide-react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SchoolRow = {
  id: string;
  name: string;
  isArchived?: boolean;
  profile?: {
    schoolType?: "PRIMARY" | "KG";
    enabledModules?: string[];
    track?: "BOYS" | "GIRLS" | "MIXED";
  };
};

function SchoolsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
      <div className="h-[320px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[320px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getSchoolTypeLabel(type?: "PRIMARY" | "KG") {
  if (type === "PRIMARY") return "ابتدائي";
  if (type === "KG") return "روضة";
  return "—";
}

function getTrackLabel(track?: "BOYS" | "GIRLS" | "MIXED") {
  if (track === "BOYS") return "بنين";
  if (track === "GIRLS") return "بنات";
  if (track === "MIXED") return "مختلط";
  return "—";
}

function SchoolGroupTable({
  title,
  description,
  icon,
  rows,
  orgId,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rows: SchoolRow[];
  orgId: string;
}) {
  return (
    <FormSection
      title={title}
      description={description}
      contentClassName="p-0"
      //titleIcon={icon}
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="rounded-2xl bg-muted p-4">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>

          <div className="space-y-1">
            <p className="font-medium">لا توجد مدارس في هذا القسم</p>
            <p className="text-sm text-muted-foreground">
              يمكنك إضافة مدرسة جديدة أو مراجعة البيانات المستوردة.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم المدرسة</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المسار</TableHead>
                <TableHead className="text-right">Modules</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.isArchived ? "opacity-60" : undefined}
                >
                  <TableCell className="font-medium">{row.name}</TableCell>

                  <TableCell>
                    {getSchoolTypeLabel(row.profile?.schoolType)}
                  </TableCell>

                  <TableCell>{getTrackLabel(row.profile?.track)}</TableCell>

                  <TableCell className="max-w-[320px]">
                    {(row.profile?.enabledModules ?? []).length > 0
                      ? row.profile?.enabledModules?.length
                      : "—"}
                  </TableCell>

                  <TableCell>
                    <StatusBadge archived={Boolean(row.isArchived)} />
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orgs/${orgId}/schools/${row.id}`}>
                          إدارة المدرسة
                        </Link>
                      </Button>

                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/orgs/${orgId}/schools/${row.id}/years`}>
                          السنوات الدراسية
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FormSection>
  );
}

export default function SchoolsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const loadSchools = useCallback(async (): Promise<SchoolRow[]> => {
    const colRef = collection(db, `orgs/${orgId}/schools`);
    const q = query(colRef, orderBy("name"));
    const snap = await getDocs(q);

    return snap.docs.map((docItem) => ({
      id: docItem.id,
      ...(docItem.data() as Omit<SchoolRow, "id">),
    }));
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<SchoolRow[]>({
    enabled: !!user,
    loader: loadSchools,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل قائمة المدارس");
    }
  }, [error]);

  const rows = data ?? [];

  const primaryRows = rows.filter(
    (row) => row.profile?.schoolType === "PRIMARY",
  );
  const kgRows = rows.filter((row) => row.profile?.schoolType === "KG");

  const totalSchools = rows.length;
  const archivedSchools = rows.filter((row) => row.isArchived).length;
  const activeSchools = totalSchools - archivedSchools;

  if (checkingAuth || loading) {
    return <SchoolsPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="إدارة المدارس"
        badgeIcon={<School className="h-3.5 w-3.5" />}
        title="المدارس"
        description="عرض المدارس مجمعة حسب النوع لتمييز تجربة الابتدائي عن الروضات من بداية التنقل."
        actions={
          <Button asChild>
            <Link href={`/orgs/${orgId}/schools/new`}>
              <Plus className="h-4 w-4" />
              إضافة مدرسة
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="إجمالي المدارس"
          value={totalSchools}
          hint="يشمل المدارس النشطة والمؤرشفة"
        />
        <InfoCard
          label="المدارس الابتدائية"
          value={primaryRows.length}
          hint="جميع مدارس PRIMARY"
        />
        <InfoCard
          label="الروضات"
          value={kgRows.length}
          hint="جميع مدارس KG"
        />
        <InfoCard
          label="المدارس المؤرشفة"
          value={archivedSchools}
          hint={`النشطة حاليًا: ${activeSchools}`}
        />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات المطلوبة."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>

          <div>
            <Button variant="outline" onClick={() => void reload()}>
              إعادة المحاولة
            </Button>
          </div>
        </FormSection>
      ) : null}

      {rows.length === 0 ? (
        <FormSection
          title="قائمة المدارس"
          description="لا توجد مدارس مرتبطة بالمؤسسة حاليًا."
        >
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              <p className="font-medium">لا توجد مدارس حتى الآن</p>
              <p className="text-sm text-muted-foreground">
                ابدأ بإضافة أول مدرسة لربطها بالمؤسسة الحالية.
              </p>
            </div>

            <Button asChild>
              <Link href={`/orgs/${orgId}/schools/new`}>
                <Plus className="h-4 w-4" />
                إضافة مدرسة
              </Link>
            </Button>
          </div>
        </FormSection>
      ) : (
        <>
          <SchoolGroupTable
            title="المدارس الابتدائية"
            description="مدارس المرحلة الابتدائية، بما فيها الصفوف والمسارات الدراسية مثل العام والتحفيظ والعالمي."
            icon={<GraduationCap className="h-4 w-4" />}
            rows={primaryRows}
            orgId={orgId}
          />

          <SchoolGroupTable
            title="الروضات"
            description="الروضات مع فصل التجربة الخاصة بالمستويات والمتابعات والقياسات المبكرة."
            icon={<Shapes className="h-4 w-4" />}
            rows={kgRows}
            orgId={orgId}
          />
        </>
      )}
    </div>
  );
}