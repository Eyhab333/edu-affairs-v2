"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  FileWarning,
  GitBranch,
  Settings2,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import PlanChangeDialog, {
  type EvaluationPersonOption,
  type EvaluationTargetOption,
} from "@/components/evaluations/PlanChangeDialog";
import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FirestoreRow = { id: string; [key: string]: unknown };

type PlanDiagnostic = {
  plan: FirestoreRow;
  framework: FirestoreRow | null;
  school: FirestoreRow | null;
  people: FirestoreRow[];
  cycles: FirestoreRow[];
  targetAssignments: FirestoreRow[];
  evaluatorAssignments: FirestoreRow[];
  submissions: FirestoreRow[];
};

const SUBMISSION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED",
  "APPROVED",
  "LOCKED",
  "CANCELLED",
] as const;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numeric(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function statusOf(row: FirestoreRow) {
  const status = text(row.status).toUpperCase();
  if (status) return status;
  return row.isActive === false ? "PAUSED" : "ACTIVE";
}

function active(row: FirestoreRow) {
  return statusOf(row) === "ACTIVE";
}

function personLabel(row: FirestoreRow | undefined, fallback: string) {
  return (
    text(row?.displayName) ||
    text(row?.fullName) ||
    text(row?.name) ||
    fallback
  );
}

function cycleOrder(row: FirestoreRow) {
  return numeric(
    row.cycleNumber,
    numeric(row.visitNumber, numeric(row.sequence, numeric(row.order, 999999))),
  );
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "ACTIVE" || status === "OPEN" || status === "APPROVED") {
    return "default";
  }
  if (status === "REMOVED" || status === "CANCELLED" || status === "ARCHIVED") {
    return "secondary";
  }
  return "outline";
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function EvaluationPlanDiagnosticPage() {
  const params = useParams<{ orgId: string; planId: string }>();
  const orgId = params.orgId;
  const planId = params.planId;
  const { user, checkingAuth } = useRequireAuth();

  const loadPlan = useCallback(async (): Promise<PlanDiagnostic | null> => {
    const basePath = `orgs/${orgId}`;
    const planSnapshot = await getDoc(doc(db, `${basePath}/evaluationPlans/${planId}`));
    if (!planSnapshot.exists()) return null;

    const plan = { id: planSnapshot.id, ...planSnapshot.data() } as FirestoreRow;
    const frameworkId = text(plan.frameworkId);
    const schoolId = text(plan.schoolId);
    const [frameworkSnapshot, schoolSnapshot, peopleSnapshot, cyclesSnapshot, targetsSnapshot, assignmentsSnapshot, submissionsSnapshot] = await Promise.all([
      frameworkId
        ? getDoc(doc(db, `${basePath}/evaluationFrameworks/${frameworkId}`))
        : Promise.resolve(null),
      schoolId
        ? getDoc(doc(db, `${basePath}/schools/${schoolId}`))
        : Promise.resolve(null),
      getDocs(query(collection(db, `${basePath}/people`))),
      getDocs(query(collection(db, `${basePath}/evaluationCycles`), where("planId", "==", planId))),
      getDocs(query(collection(db, `${basePath}/evaluationTargetAssignments`), where("planId", "==", planId))),
      getDocs(query(collection(db, `${basePath}/evaluationEvaluatorAssignments`), where("planId", "==", planId))),
      getDocs(query(collection(db, `${basePath}/evaluationSubmissions`), where("planId", "==", planId))),
    ]);

    const rows = (snapshot: typeof cyclesSnapshot) =>
      snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as FirestoreRow);

    return {
      plan,
      framework: frameworkSnapshot && frameworkSnapshot.exists()
        ? ({ id: frameworkSnapshot.id, ...frameworkSnapshot.data() } as FirestoreRow)
        : null,
      school: schoolSnapshot && schoolSnapshot.exists()
        ? ({ id: schoolSnapshot.id, ...schoolSnapshot.data() } as FirestoreRow)
        : null,
      people: rows(peopleSnapshot),
      cycles: rows(cyclesSnapshot).sort((left, right) => cycleOrder(left) - cycleOrder(right)),
      targetAssignments: rows(targetsSnapshot),
      evaluatorAssignments: rows(assignmentsSnapshot),
      submissions: rows(submissionsSnapshot),
    };
  }, [orgId, planId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PlanDiagnostic>({
    enabled: !!user,
    loader: loadPlan,
    deps: [orgId, planId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل تشخيص خطة التقييم.");
  }, [error]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((person) => [person.id, person])),
    [data?.people],
  );
  const people = useMemo<EvaluationPersonOption[]>(
    () =>
      (data?.people ?? [])
        .map((person) => ({
          id: person.id,
          displayName: personLabel(person, person.id),
          ...(text(person.email) ? { email: text(person.email) } : {}),
          ...(text(person.roleKey) || text(person.role)
            ? { roleKey: text(person.roleKey) || text(person.role) }
            : {}),
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar")),
    [data?.people],
  );
  const activeTargets = useMemo<EvaluationTargetOption[]>(
    () =>
      (data?.targetAssignments ?? [])
        .filter(active)
        .map((target) => {
          const person = peopleMap.get(text(target.targetPersonId));
          return {
            id: text(target.targetPersonId),
            displayName:
              personLabel(person, text(target.targetDisplayName) || text(target.targetPersonId)),
            ...(text(person?.email) || text(target.targetEmail)
              ? { email: text(person?.email) || text(target.targetEmail) }
              : {}),
            ...(text(target.targetRoleKey)
              ? { roleKey: text(target.targetRoleKey) }
              : {}),
          };
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar")),
    [data?.targetAssignments, peopleMap],
  );

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound || !data) {
    return (
      <FormSection title="الخطة غير موجودة" description="تعذر العثور على خطة التقييم المطلوبة.">
        <Button asChild variant="outline">
          <Link href={`/orgs/${orgId}/evaluations/plans`}>
            <ArrowLeft className="h-4 w-4" />
            العودة إلى الخطط
          </Link>
        </Button>
      </FormSection>
    );
  }

  const planStatus = statusOf(data.plan);
  const submissionCounts = Object.fromEntries(
    SUBMISSION_STATUSES.map((status) => [
      status,
      data.submissions.filter((submission) => text(submission.status).toUpperCase() === status).length,
    ]),
  ) as Record<(typeof SUBMISSION_STATUSES)[number], number>;
  const activeTargetCount = data.targetAssignments.filter(active).length;
  const activeAssignmentCount = data.evaluatorAssignments.filter(active).length;

  return (
    <div className="space-y-6">
      <PageHero
        badge="تشخيص الخطة"
        badgeIcon={<Settings2 className="h-3.5 w-3.5" />}
        title={text(data.plan.title, data.plan.id)}
        description="عرض تشغيلي للدورات والمستهدفين والمقيّمين وحالة الإرسالات. لا تُحتسب الإرسالات المفقودة كدرجات."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/plans`}>
                <ArrowLeft className="h-4 w-4" />
                الخطط
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void reload()}>
              تحديث التشخيص
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="الدورات" value={data.cycles.length} hint={`الصالحة: ${data.cycles.filter((cycle) => ["OPEN", "ACTIVE", ""].includes(statusOf(cycle))).length}`} />
        <InfoCard label="المستهدفون النشطون" value={activeTargetCount} hint="ضمن هذه الخطة" />
        <InfoCard label="إسنادات المقيمين النشطة" value={activeAssignmentCount} hint="الأوزان نسبية ومطبّعة عند التجميع" />
        <InfoCard label="الإرسالات" value={data.submissions.length} hint={`المعتمدة: ${submissionCounts.APPROVED}`} />
      </div>

      {error ? (
        <FormSection title="حدث خطأ" description="تعذر تحميل بعض بيانات الخطة." contentClassName="space-y-4">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          <Button variant="outline" onClick={() => void reload()}>إعادة المحاولة</Button>
        </FormSection>
      ) : null}

      <FormSection title="بيانات الخطة" description="المعرفات والسياق التشغيلي المعتمد.">
        <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div><span className="text-muted-foreground">معرف الخطة: </span><span className="font-mono">{data.plan.id}</span></div>
          <div><span className="text-muted-foreground">الإطار: </span>{text(data.framework?.title) || text(data.plan.frameworkId, "—")}</div>
          <div><span className="text-muted-foreground">معرف الإطار: </span><span className="font-mono">{text(data.plan.frameworkId, "—")}</span></div>
          <div><span className="text-muted-foreground">المدرسة: </span>{text(data.school?.name) || text(data.school?.nameAr) || text(data.plan.schoolId, "—")}</div>
          <div><span className="text-muted-foreground">السنة / الفصل: </span>{text(data.plan.academicYearId, "—")} / {text(data.plan.termId, "—")}</div>
          <div className="flex items-center gap-2"><span className="text-muted-foreground">الحالة: </span><Badge variant={statusVariant(planStatus)}>{planStatus}</Badge></div>
        </div>
      </FormSection>

      <FormSection
        title="إدارة آمنة"
        description="كل إجراء يبدأ بمعاينة خادمية، ويُعاد التحقق منه على الخادم عند التنفيذ."
        contentClassName="flex flex-wrap gap-2"
      >
        <PlanChangeDialog
          orgId={orgId}
          planId={planId}
          action="ADD_TARGET"
          people={people}
          activeTargets={activeTargets}
          onApplied={() => void reload()}
          trigger={<Button><Users className="h-4 w-4" />إضافة مستهدف</Button>}
        />
        <PlanChangeDialog
          orgId={orgId}
          planId={planId}
          action="REPLACE_TARGET"
          people={people}
          activeTargets={activeTargets}
          onApplied={() => void reload()}
          trigger={<Button variant="outline">استبدال مستهدف</Button>}
        />
        <PlanChangeDialog
          orgId={orgId}
          planId={planId}
          action="REMOVE_TARGET"
          people={people}
          activeTargets={activeTargets}
          onApplied={() => void reload()}
          trigger={<Button variant="outline">إزالة من الخطة</Button>}
        />
        <PlanChangeDialog
          orgId={orgId}
          planId={planId}
          action="SET_CYCLE_COUNT"
          people={people}
          activeTargets={activeTargets}
          onApplied={() => void reload()}
          trigger={<Button variant="outline"><CalendarRange className="h-4 w-4" />تعديل عدد الدورات</Button>}
        />
      </FormSection>

      <FormSection title="الدورات" description="الترتيب يُقرأ من cycleNumber ثم sequence ثم order." contentClassName="overflow-x-auto">
        <table className="w-full min-w-[680px] text-right text-sm">
          <thead className="border-b text-muted-foreground"><tr><th className="px-3 py-3">العنوان</th><th className="px-3 py-3">المعرف</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">الترتيب</th></tr></thead>
          <tbody>
            {data.cycles.map((cycle) => <tr key={cycle.id} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{text(cycle.title) || text(cycle.shortTitle) || "—"}</td><td className="px-3 py-3 font-mono text-xs">{cycle.id}</td><td className="px-3 py-3"><Badge variant={statusVariant(statusOf(cycle))}>{statusOf(cycle)}</Badge></td><td className="px-3 py-3">{cycleOrder(cycle) === 999999 ? "—" : cycleOrder(cycle)}</td></tr>)}
          </tbody>
        </table>
      </FormSection>

      <FormSection title="المستهدفون" description="تظهر الإسنادات النشطة أولًا؛ لا يؤدي الإزالة إلى حذف الإرسالات التاريخية." contentClassName="overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="border-b text-muted-foreground"><tr><th className="px-3 py-3">الاسم</th><th className="px-3 py-3">personId</th><th className="px-3 py-3">البريد</th><th className="px-3 py-3">الدور</th><th className="px-3 py-3">الحالة</th></tr></thead>
          <tbody>
            {[...data.targetAssignments].sort((left, right) => Number(active(right)) - Number(active(left))).map((target) => {
              const person = peopleMap.get(text(target.targetPersonId));
              return <tr key={target.id} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{personLabel(person, text(target.targetDisplayName) || text(target.targetPersonId))}</td><td className="px-3 py-3 font-mono text-xs">{text(target.targetPersonId, "—")}</td><td className="px-3 py-3">{text(person?.email) || text(target.targetEmail, "—")}</td><td className="px-3 py-3">{text(target.targetRoleLabel) || text(target.targetRoleKey, "—")}</td><td className="px-3 py-3"><Badge variant={statusVariant(statusOf(target))}>{statusOf(target)}</Badge></td></tr>;
            })}
          </tbody>
        </table>
      </FormSection>

      <FormSection title="المقيّمون حسب المستهدف والدورة" description="الأوزان تُحفظ كأوزان نسبية ولا يُشترط أن مجموعها 100." contentClassName="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-right text-sm">
          <thead className="border-b text-muted-foreground"><tr><th className="px-3 py-3">المستهدف</th><th className="px-3 py-3">الدورة</th><th className="px-3 py-3">المقيّم</th><th className="px-3 py-3">personId / البريد</th><th className="px-3 py-3">الوزن</th><th className="px-3 py-3">الحالة</th></tr></thead>
          <tbody>
            {[...data.evaluatorAssignments].sort((left, right) => `${text(left.targetPersonId)}-${cycleOrder(left)}`.localeCompare(`${text(right.targetPersonId)}-${cycleOrder(right)}`, "ar")).map((assignment) => {
              const target = peopleMap.get(text(assignment.targetPersonId));
              const evaluator = peopleMap.get(text(assignment.evaluatorPersonId));
              return <tr key={assignment.id} className="border-b last:border-0"><td className="px-3 py-3">{personLabel(target, text(assignment.targetDisplayName) || text(assignment.targetPersonId))}</td><td className="px-3 py-3">{text(assignment.cycleTitle) || text(assignment.cycleId, "—")}</td><td className="px-3 py-3 font-medium">{personLabel(evaluator, text(assignment.evaluatorDisplayName) || text(assignment.evaluatorPersonId))}</td><td className="px-3 py-3"><div className="font-mono text-xs">{text(assignment.evaluatorPersonId, "—")}</div><div className="text-xs text-muted-foreground">{text(evaluator?.email) || text(assignment.evaluatorEmail, "—")}</div></td><td className="px-3 py-3">{numeric(assignment.weight, 0)}</td><td className="px-3 py-3"><Badge variant={statusVariant(statusOf(assignment))}>{statusOf(assignment)}</Badge></td></tr>;
            })}
          </tbody>
        </table>
      </FormSection>

      <FormSection title="حالة الإرسالات" description="عدادات حالة فقط؛ لا تُفسر الإرسالات المفقودة على أنها صفر." contentClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUBMISSION_STATUSES.map((status) => <InfoCard key={status} label={status} value={submissionCounts[status]} hint="إرسال ضمن هذه الخطة" />)}
      </FormSection>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium"><FileWarning className="h-4 w-4" />حماية السجل التاريخي</div>
        <p className="mt-1 text-muted-foreground">لا تحذف هذه الإدارة الإرسالات أو تغيّر الدرجات المعتمدة أو المقفلة. تظهر الإرسالات التاريخية في المعاينة قبل أي إزالة أو استبدال أو تقليص للدورات.</p>
      </div>
    </div>
  );
}
