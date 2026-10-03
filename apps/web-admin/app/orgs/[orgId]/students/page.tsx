"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Search, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { loadStudentDirectory } from "@/lib/student-read-model";
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

function StudentsPageSkeleton() {
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

function enrollmentStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE": return "نشط";
    case "COMPLETED": return "مكتمل";
    case "REPEATING": return "إعادة";
    case "TRANSFERRED": return "منقول";
    case "WITHDRAWN": return "منسحب";
    case "SUSPENDED": return "موقوف";
    case "PENDING": return "معلّق";
    default: return status || "—";
  }
}

export default function StudentsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { user, checkingAuth } = useRequireAuth();
  const [schoolId, setSchoolId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadDirectory = useCallback(() => loadStudentDirectory({ db, orgId }), [orgId]);
  const { data, loading, error, notFound, reload } = useDocumentLoader({
    enabled: !!user,
    loader: loadDirectory,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل دليل الطلاب");
  }, [error]);

  const schoolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (data?.rows ?? []).forEach((row) => {
      if (!row.currentEnrollment) return;
      counts.set(row.currentEnrollment.schoolId, (counts.get(row.currentEnrollment.schoolId) ?? 0) + 1);
    });
    return counts;
  }, [data?.rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (schoolId && row.currentEnrollment?.schoolId !== schoolId) return false;
      if (!normalizedSearch) return true;
      return [row.displayName, row.nationalId].join(" ").toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [data?.rows, schoolId, searchTerm]);

  const archivedCount = (data?.rows ?? []).filter((row) => row.isArchived).length;
  const currentEnrollmentCount = (data?.rows ?? []).filter((row) => row.currentEnrollment).length;

  if (checkingAuth || loading) return <StudentsPageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="الطلاب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على المؤسسة"
        description="قد تكون المؤسسة غير موجودة أو لا تملك صلاحية الوصول إليها."
        actions={<Button asChild variant="outline"><Link href="/orgs"><ArrowLeft className="h-4 w-4" />العودة</Link></Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="الطلاب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={`دليل الطلاب - ${data?.orgName ?? orgId}`}
        description="عرض الطلاب ومواضعهم الحالية من القيود الدراسية التشغيلية المعتمدة."
        actions={<Button asChild variant="outline"><Link href={`/orgs/${orgId}`}><ArrowLeft className="h-4 w-4" />العودة إلى المؤسسة</Link></Button>}
      />

      <div className="flex justify-start">
        <Button asChild>
          <Link href={`/orgs/${orgId}/students/new`}>
            <Plus className="h-4 w-4" />
            {"إضافة طالب"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="إجمالي الطلاب" value={data?.rows.length ?? 0} hint="يشمل الطلاب المؤرشفين" />
        <InfoCard label="ذوو القيد النشط" value={currentEnrollmentCount} hint="بحسب القيد التشغيلي الحالي" />
        <InfoCard label="الطلاب المؤرشفون" value={archivedCount} hint="حالة سجل الطالب مستقلة عن القيد" />
      </div>

      {error ? (
        <FormSection title="حدث خطأ" description="تعذر تحميل البيانات المطلوبة." contentClassName="space-y-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          <Button variant="outline" onClick={() => void reload()}>إعادة المحاولة</Button>
        </FormSection>
      ) : null}

      <FormSection title="البحث والتصفية" description="صفِّ الطلاب حسب المدرسة، ثم ابحث بالاسم أو رقم الهوية." contentClassName="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr_auto]">
          <div className="space-y-2">
            <label htmlFor="school-filter" className="text-sm font-medium">المدرسة</label>
            <select id="school-filter" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">كل المدارس ({data?.rows.length ?? 0})</option>
              {(data?.schools ?? []).map((school) => <option key={school.id} value={school.id}>{school.name} ({schoolCounts.get(school.id) ?? 0})</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="student-search" className="text-sm font-medium">البحث</label>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
              <Input id="student-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ابحث باسم الطالب أو رقم الهوية" className="pr-9" />
            </div>
          </div>
          <Button className="self-end" variant="outline" onClick={() => { setSchoolId(""); setSearchTerm(""); }}><X className="h-4 w-4" />مسح</Button>
        </div>
        <p className="text-sm text-muted-foreground">المعروض الآن: <span className="font-medium text-foreground">{filteredRows.length}</span> طالبًا.</p>
      </FormSection>

      <FormSection title="قائمة الطلاب" description="الموضع المعروض هو أحدث قيد نشط، مع تفضيل السنة الدراسية المعلَّمة كنشطة." contentClassName="space-y-4">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <Users className="h-7 w-7 text-muted-foreground" />
            <div><p className="font-medium">لا توجد نتائج مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب تغيير المدرسة المحددة أو عبارة البحث.</p></div>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow><TableHead>الطالب</TableHead><TableHead>رقم الهوية</TableHead><TableHead>المدرسة</TableHead><TableHead>المستوى</TableHead><TableHead>الفصل</TableHead><TableHead>حالة القيد</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const enrollment = row.currentEnrollment;
                    return <TableRow key={row.id}>
                      <TableCell><Link href={`/orgs/${orgId}/students/${row.id}`} className="font-medium hover:text-primary hover:underline">{row.displayName}</Link>{row.isArchived ? <div className="mt-1"><StatusBadge archived /></div> : null}</TableCell>
                      <TableCell>{row.nationalId || "—"}</TableCell>
                      <TableCell>{enrollment?.labels.school || "لا يوجد قيد نشط"}</TableCell>
                      <TableCell>{enrollment?.labels.grade || "—"}</TableCell>
                      <TableCell>{enrollment?.labels.className || "—"}</TableCell>
                      <TableCell><StatusBadge archived={!enrollment} activeText={enrollmentStatusLabel(enrollment?.status ?? "")} archivedText="لا يوجد قيد نشط" /></TableCell>
                    </TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {filteredRows.map((row) => {
                const enrollment = row.currentEnrollment;
                return <Link key={row.id} href={`/orgs/${orgId}/students/${row.id}`} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><UserRound className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate font-semibold">{row.displayName}</p><p className="mt-1 text-sm text-muted-foreground">{row.nationalId || "بدون رقم هوية"}</p></div></div>
                    <StatusBadge archived={!enrollment} activeText="نشط" archivedText="بلا قيد" />
                  </div>
                  {enrollment ? <div className="mt-4 grid gap-1 text-sm text-muted-foreground"><span>{enrollment.labels.school}</span><span>{[enrollment.labels.grade, enrollment.labels.className].filter(Boolean).join(" — ") || "—"}</span></div> : null}
                </Link>;
              })}
            </div>
          </>
        )}
      </FormSection>
    </div>
  );
}
