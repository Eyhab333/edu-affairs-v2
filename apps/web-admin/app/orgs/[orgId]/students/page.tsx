"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, Download, LoaderCircle, Plus, Search, UserRound, Users, X } from "lucide-react";
import type { User } from "firebase/auth";
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

type AcademicYearOption = {
  id: string;
  title: string;
};

type ClassStudentStatisticsReport = {
  scope: { mode: "current" | "year"; academicYearId: string | null; title: string };
  summary: { schoolCount: number; classCount: number; studentCount: number };
  groups: Array<{
    schoolId: string;
    schoolName: string;
    totalStudents: number;
    rows: Array<{
      schoolId: string;
      schoolName: string;
      gradeId: string;
      gradeTitle: string;
      classId: string;
      classTitle: string;
      studentCount: number;
    }>;
  }>;
};

function classStatisticsUrl({
  orgId,
  mode,
  format = "json",
  academicYearId,
}: {
  orgId: string;
  mode: "metadata" | "current" | "year";
  format?: "json" | "xlsx";
  academicYearId?: string;
}) {
  const query = new URLSearchParams({ mode, format });
  if (academicYearId) query.set("academicYearId", academicYearId);
  return `/api/orgs/${encodeURIComponent(orgId)}/students/class-statistics?${query.toString()}`;
}

async function authorizedStatisticsFetch(user: User, url: string) {
  const token = await user.getIdToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.ok) return response;

  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error || "تعذر تحميل إحصائية الطلاب حسب الفصول.");
}

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
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [statisticsScope, setStatisticsScope] = useState("current");
  const [statistics, setStatistics] = useState<ClassStudentStatisticsReport | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsExporting, setStatisticsExporting] = useState(false);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);

  const loadDirectory = useCallback(() => loadStudentDirectory({ db, orgId }), [orgId]);
  const { data, loading, error, notFound, reload } = useDocumentLoader({
    enabled: !!user,
    loader: loadDirectory,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل دليل الطلاب");
  }, [error]);

  useEffect(() => {
    if (!user || !orgId) return;

    let cancelled = false;
    void authorizedStatisticsFetch(user, classStatisticsUrl({ orgId, mode: "metadata" }))
      .then(async (response) => response.json() as Promise<{ academicYears?: AcademicYearOption[] }>)
      .then((payload) => {
        if (!cancelled) setAcademicYears(payload.academicYears ?? []);
      })
      .catch(() => {
        if (!cancelled) setAcademicYears([]);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, user]);

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
  const selectedStatisticsMode = statisticsScope === "current" ? "current" : "year";
  const selectedAcademicYearId = selectedStatisticsMode === "year" ? statisticsScope : undefined;

  const loadStatistics = useCallback(async () => {
    if (!user || !orgId) return;

    setStatisticsLoading(true);
    setStatisticsError(null);
    try {
      const response = await authorizedStatisticsFetch(user, classStatisticsUrl({
        orgId,
        mode: selectedStatisticsMode,
        academicYearId: selectedAcademicYearId,
      }));
      setStatistics(await response.json() as ClassStudentStatisticsReport);
    } catch (statisticsLoadError) {
      const message = statisticsLoadError instanceof Error
        ? statisticsLoadError.message
        : "تعذر تحميل إحصائية الطلاب حسب الفصول.";
      setStatisticsError(message);
      toast.error(message);
    } finally {
      setStatisticsLoading(false);
    }
  }, [orgId, selectedAcademicYearId, selectedStatisticsMode, user]);

  const exportStatistics = useCallback(async () => {
    if (!user || !orgId) return;

    setStatisticsExporting(true);
    setStatisticsError(null);
    try {
      const response = await authorizedStatisticsFetch(user, classStatisticsUrl({
        orgId,
        mode: selectedStatisticsMode,
        format: "xlsx",
        academicYearId: selectedAcademicYearId,
      }));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename=\"?([^\";]+)\"?/)?.[1]
        || "class-student-statistics.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (statisticsExportError) {
      const message = statisticsExportError instanceof Error
        ? statisticsExportError.message
        : "تعذر تصدير إحصائية الطلاب حسب الفصول.";
      setStatisticsError(message);
      toast.error(message);
    } finally {
      setStatisticsExporting(false);
    }
  }, [orgId, selectedAcademicYearId, selectedStatisticsMode, user]);

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

      <FormSection
        title="إحصائية الطلاب حسب الفصول"
        description="حمّل الإحصائية عند الحاجة، ثم صدّر نفس النتائج إلى Excel."
        contentClassName="space-y-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="w-full max-w-sm space-y-2">
            <label htmlFor="class-statistics-scope" className="text-sm font-medium">الفترة</label>
            <select
              id="class-statistics-scope"
              value={statisticsScope}
              onChange={(event) => {
                setStatisticsScope(event.target.value);
                setStatistics(null);
                setStatisticsError(null);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="current">الوضع الحالي</option>
              {academicYears.map((academicYear) => (
                <option key={academicYear.id} value={academicYear.id}>{academicYear.title}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void loadStatistics()} disabled={!user || statisticsLoading || statisticsExporting}>
              {statisticsLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              عرض الإحصائية
            </Button>
            <Button variant="outline" onClick={() => void exportStatistics()} disabled={!user || statisticsLoading || statisticsExporting}>
              {statisticsExporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              تصدير Excel
            </Button>
          </div>
        </div>

        {statisticsError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {statisticsError}
          </div>
        ) : null}

        {statistics ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">النطاق: <span className="font-medium text-foreground">{statistics.scope.title}</span></p>
            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard label="إجمالي الطلاب" value={statistics.summary.studentCount} />
              <InfoCard label="عدد المدارس" value={statistics.summary.schoolCount} />
              <InfoCard label="عدد الفصول" value={statistics.summary.classCount} />
            </div>

            {statistics.groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                لا توجد قيود طلاب مطابقة لهذا النطاق.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المدرسة</TableHead>
                    <TableHead>الصف</TableHead>
                    <TableHead>الفصل</TableHead>
                    <TableHead className="text-end">عدد الطلاب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statistics.groups.map((group) => (
                    <Fragment key={group.schoolId}>
                      {group.rows.map((row) => (
                        <TableRow key={`${row.schoolId}-${row.classId}`}>
                          <TableCell>{row.schoolName}</TableCell>
                          <TableCell>{row.gradeTitle}</TableCell>
                          <TableCell>{row.classTitle}</TableCell>
                          <TableCell className="text-end tabular-nums">{row.studentCount}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={3}>إجمالي المدرسة: {group.schoolName}</TableCell>
                        <TableCell className="text-end tabular-nums">{group.totalStudents}</TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                  <TableRow className="bg-primary/10 font-bold">
                    <TableCell colSpan={3}>الإجمالي العام</TableCell>
                    <TableCell className="text-end tabular-nums">{statistics.summary.studentCount}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </FormSection>

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
