"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpen, CalendarDays, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { loadTeacherProfile, type ResolvedTeacherAssignment } from "@/lib/teacher-read-model";
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

function TeacherProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="h-[440px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(value?: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

function assignmentStatusLabel(status: string) {
  switch (status) {
    case "ACTIVE": return "نشط";
    case "ENDED": return "منتهٍ";
    case "PENDING": return "معلّق";
    case "INACTIVE": return "غير نشط";
    default: return status || "—";
  }
}

function AssignmentDetails({ assignment }: { assignment: ResolvedTeacherAssignment }) {
  const entries = [
    ["المدرسة", assignment.labels.school],
    ["العام الدراسي", assignment.labels.academicYear],
    ["الفصل الدراسي", assignment.labels.term],
    ["الفصل", assignment.labels.className],
    ["المادة", assignment.labels.subject],
  ].filter(([, value]) => value);

  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-muted/45 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-medium text-foreground">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function TeacherProfilePage() {
  const params = useParams<{ orgId: string; personId: string }>();
  const orgId = params.orgId;
  const personId = params.personId;
  const { user, checkingAuth } = useRequireAuth();
  const loader = useCallback(() => loadTeacherProfile({ orgId, personId }), [orgId, personId]);
  const { data, loading, error, notFound, reload } = useDocumentLoader({
    enabled: !!user,
    loader,
    deps: [orgId, personId],
  });

  useEffect(() => {
    if (error) toast.error("تعذّر تحميل ملف المعلم");
  }, [error]);

  if (checkingAuth || loading) return <TeacherProfileSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="المعلمون"
        badgeIcon={<GraduationCap className="h-3.5 w-3.5" />}
        title="المعلم غير موجود"
        description="لم يُعثر على عضوية معلّم أساسية مرتبطة بهذا الشخص."
        actions={<Button asChild variant="outline"><Link href={`/orgs/${orgId}/teachers`}><ArrowLeft className="h-4 w-4" />العودة إلى الدليل</Link></Button>}
      />
    );
  }

  const account = data?.account;
  const identity = data?.identity;

  return (
    <div className="space-y-6">
      <PageHero
        badge="ملف المعلّم"
        badgeIcon={<GraduationCap className="h-3.5 w-3.5" />}
        title={identity?.displayName ?? "ملف المعلّم"}
        description="عرض معلومات الهوية والحساب والإسنادات التدريسية الجذرية دون تعديلها."
        actions={<Button asChild variant="outline"><Link href={`/orgs/${orgId}/teachers`}><ArrowLeft className="h-4 w-4" />العودة إلى دليل المعلمين</Link></Button>}
      />

      {error ? (
        <FormSection title="حدث خطأ" description="تعذّر تحميل بيانات المعلّم المطلوبة." contentClassName="space-y-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          <Button variant="outline" onClick={() => void reload()}>إعادة المحاولة</Button>
        </FormSection>
      ) : null}

      <FormSection title="الهوية" description="بيانات الشخص الأساسية المرتبطة بحساب المعلّم." contentClassName="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="الاسم" value={identity?.displayName ?? "—"} />
          <InfoCard label="رقم الهوية" value={identity?.nationalId || "—"} />
          <InfoCard label="الجوال" value={identity?.phone || "—"} />
          <InfoCard label="البريد الإلكتروني" value={identity?.email || "—"} />
        </div>
        <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
          <span className="text-muted-foreground">personId: </span>
          <code dir="ltr" className="break-all text-xs">{identity?.personId ?? "—"}</code>
        </div>
      </FormSection>

      <FormSection title="الحساب والعضوية" description="تعرض العضوية الأساسية فقط؛ العضوية الموروثة ظاهرة للتشخيص عند اختلافها." contentClassName="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoCard label="الدور" value={account?.membership.roleKey || "—"} hint={account?.membership.title || undefined} />
          <InfoCard label="حالة العضوية" value={account?.membership.isActive ? "نشطة" : "غير نشطة"} />
          <InfoCard label="الإسنادات الحالية" value={data?.currentAssignments.length ?? 0} />
        </div>
        <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 text-sm md:grid-cols-2">
          <div><span className="text-muted-foreground">البريد في ملف المستخدم: </span><span dir="ltr">{account?.userProfileEmail || "—"}</span></div>
          <div><span className="text-muted-foreground">نطاق المدارس: </span>{(account?.membership.schoolNames ?? []).join("، ") || "—"}</div>
          <div><span className="text-muted-foreground">uid: </span><code dir="ltr" className="break-all text-xs">{account?.uid || "—"}</code></div>
          <div><span className="text-muted-foreground">حسابات العضوية المرتبطة: </span>{account?.membershipCount ?? 0}</div>
        </div>
        {account?.diagnostics.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />تنبيه اتساق الحساب</div>
            <ul className="mt-2 list-disc space-y-1 pr-5">{account.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="الإسنادات التدريسية الحالية" description="الإسنادات الجذرية ذات الحالة ACTIVE والفعّالة ضمن نطاقها الزمني." contentClassName="space-y-4">
        {(data?.currentAssignments.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
            <div><p className="font-medium">لا توجد إسنادات تدريسية حالية</p><p className="mt-1 text-sm text-muted-foreground">تبقى الإسنادات السابقة مرئية في السجل أدناه.</p></div>
          </div>
        ) : (
          <div className="grid gap-4">
            {data?.currentAssignments.map((assignment) => (
              <div key={assignment.id} className="space-y-4 rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold">{assignment.labels.subject || "مادة غير محددة"}</p><p className="mt-1 text-sm text-muted-foreground">بدأ في {formatDate(assignment.startAt)}</p></div>
                  <StatusBadge activeText={assignmentStatusLabel(assignment.status)} />
                </div>
                <AssignmentDetails assignment={assignment} />
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="سجل الإسنادات" description="جميع الإسنادات الجذرية للمعلّم، مرتبة من الأحدث أو الأكثر صلة إلى الأقدم." contentClassName="space-y-4">
        {(data?.assignmentHistory.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
            <div><p className="font-medium">لا يوجد سجل إسنادات</p><p className="mt-1 text-sm text-muted-foreground">لم يُعثر على إسنادات جذرية مرتبطة بهذا المعلّم.</p></div>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader><TableRow><TableHead>المدرسة</TableHead><TableHead>العام الدراسي</TableHead><TableHead>الفصل الدراسي</TableHead><TableHead>الفصل</TableHead><TableHead>المادة</TableHead><TableHead>الحالة</TableHead><TableHead>آخر تاريخ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.assignmentHistory.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{assignment.labels.school}</TableCell>
                      <TableCell>{assignment.labels.academicYear}</TableCell>
                      <TableCell>{assignment.labels.term}</TableCell>
                      <TableCell>{assignment.labels.className}</TableCell>
                      <TableCell>{assignment.labels.subject}</TableCell>
                      <TableCell><StatusBadge archived={assignment.status !== "ACTIVE" || assignment.active === false} activeText={assignmentStatusLabel(assignment.status)} archivedText={assignmentStatusLabel(assignment.status)} /></TableCell>
                      <TableCell>{formatDate(assignment.endedAt || assignment.updatedAt || assignment.createdAt || assignment.startAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 lg:hidden">
              {data?.assignmentHistory.map((assignment) => (
                <div key={assignment.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{assignment.labels.subject}</p><p className="mt-1 text-sm text-muted-foreground">{assignment.labels.school} — {assignment.labels.className}</p></div>
                    <StatusBadge archived={assignment.status !== "ACTIVE" || assignment.active === false} activeText={assignmentStatusLabel(assignment.status)} archivedText={assignmentStatusLabel(assignment.status)} />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{assignment.labels.academicYear}{assignment.labels.term ? ` — ${assignment.labels.term}` : ""}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </FormSection>
    </div>
  );
}
