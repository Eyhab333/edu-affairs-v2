"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, GraduationCap, Search, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";

import { loadTeacherDirectory } from "@/lib/teacher-read-model";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function TeachersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function TeachersPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { user, checkingAuth } = useRequireAuth();
  const [schoolId, setSchoolId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loader = useCallback(() => loadTeacherDirectory({ orgId }), [orgId]);
  const { data, loading, error, notFound, reload } = useDocumentLoader({
    enabled: !!user,
    loader,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذّر تحميل دليل المعلمين");
  }, [error]);

  const schoolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.rows ?? []).forEach((row) => {
      row.schoolIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return counts;
  }, [data?.rows]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (schoolId && !row.schoolIds.includes(schoolId)) return false;
      return !query || [row.displayName, row.email].join(" ").toLocaleLowerCase().includes(query);
    });
  }, [data?.rows, schoolId, searchTerm]);

  const activeMembershipCount = (data?.rows ?? []).filter((row) => row.membership.isActive).length;
  const assignedTeacherCount = (data?.rows ?? []).filter((row) => row.activeAssignmentCount > 0).length;

  if (checkingAuth || loading) return <TeachersPageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="المعلمون"
        badgeIcon={<GraduationCap className="h-3.5 w-3.5" />}
        title="تعذّر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة أو لا تملك صلاحية الوصول إليها."
        actions={
          <Button asChild variant="outline">
            <Link href="/orgs"><ArrowLeft className="h-4 w-4" />العودة</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="إدارة المعلمين"
        badgeIcon={<GraduationCap className="h-3.5 w-3.5" />}
        title={`دليل المعلمين - ${data?.orgName ?? orgId}`}
        description="عرض حسابات المعلمين وعضوياتهم الأساسية وإسناداتهم التدريسية الحالية."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}`}><ArrowLeft className="h-4 w-4" />العودة إلى المؤسسة</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي المعلمين" value={data?.rows.length ?? 0} hint="بحسب العضوية الأساسية للمنظمة" />
        <InfoCard label="عضويات نشطة" value={activeMembershipCount} hint="حالة العضوية مستقلة عن الإسنادات" />
        <InfoCard label="لديهم إسنادات نشطة" value={assignedTeacherCount} hint="إسنادات جذرية حالية فقط" />
      </div>

      {error ? (
        <FormSection title="حدث خطأ" description="تعذّر تحميل بيانات المعلمين المطلوبة." contentClassName="space-y-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          <Button variant="outline" onClick={() => void reload()}>إعادة المحاولة</Button>
        </FormSection>
      ) : null}

      <FormSection title="البحث والتصفية" description="صفِّ حسب المدرسة، ثم ابحث بالاسم أو البريد الإلكتروني." contentClassName="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_auto]">
          <div className="space-y-2">
            <label htmlFor="teacher-school-filter" className="text-sm font-medium">المدرسة</label>
            <select
              id="teacher-school-filter"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">كل المدارس ({data?.rows.length ?? 0})</option>
              {(data?.schools ?? []).map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name} ({schoolCounts.get(school.id) ?? 0})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="teacher-search" className="text-sm font-medium">البحث</label>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                id="teacher-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="ابحث باسم المعلم أو بريده الإلكتروني"
                className="pr-9"
              />
            </div>
          </div>
          <Button className="self-end" variant="outline" onClick={() => { setSchoolId(""); setSearchTerm(""); }}>
            <X className="h-4 w-4" />مسح
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          المعروض الآن: <span className="font-medium text-foreground">{filteredRows.length}</span> معلّمًا/معلّمة.
        </p>
      </FormSection>

      <FormSection title="قائمة المعلمين" description="تعتمد حالة العضوية على العضوية الأساسية، وعدد الإسنادات على السجلات الجذرية الحالية." contentClassName="space-y-4">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <Users className="h-7 w-7 text-muted-foreground" />
            <div>
              <p className="font-medium">لا توجد نتائج مطابقة</p>
              <p className="mt-1 text-sm text-muted-foreground">جرّب تغيير المدرسة المحددة أو عبارة البحث.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المعلم/المعلمة</TableHead>
                    <TableHead>البريد الإلكتروني</TableHead>
                    <TableHead>المدرسة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإسنادات النشطة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.personId}>
                      <TableCell>
                        <Link href={`/orgs/${orgId}/teachers/${row.personId}`} className="font-medium hover:text-primary hover:underline">
                          {row.displayName}
                        </Link>
                        {row.employeeNumber ? <div className="mt-1 text-xs text-muted-foreground">رقم الموظف: {row.employeeNumber}</div> : null}
                      </TableCell>
                      <TableCell dir="ltr">{row.email || "—"}</TableCell>
                      <TableCell>{row.schoolNames.join("، ") || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge archived={!row.membership.isActive} activeText="عضوية نشطة" archivedText="عضوية غير نشطة" />
                      </TableCell>
                      <TableCell>{row.activeAssignmentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {filteredRows.map((row) => (
                <Link key={row.personId} href={`/orgs/${orgId}/teachers/${row.personId}`} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{row.displayName}</p>
                        <p dir="ltr" className="mt-1 truncate text-sm text-muted-foreground">{row.email || "—"}</p>
                      </div>
                    </div>
                    <StatusBadge archived={!row.membership.isActive} activeText="نشطة" archivedText="غير نشطة" />
                  </div>
                  <div className="mt-4 grid gap-1 text-sm text-muted-foreground">
                    <span>{row.schoolNames.join("، ") || "—"}</span>
                    <span>الإسنادات النشطة: {row.activeAssignmentCount}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </FormSection>
    </div>
  );
}
