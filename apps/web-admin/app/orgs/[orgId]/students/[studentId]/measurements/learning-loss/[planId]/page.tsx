"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: string;
  };
};

type AcademicYearRow = {
  id: string;
  title: string;
};

type GradeRow = {
  id: string;
  title: string;
  code?: string;
};

type ClassRow = {
  id: string;
  title: string;
};

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  isActive?: boolean;
  scopeType?: string;
  scopeId?: string;
  schoolId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };
};

type LearningLossSkillRow = {
  id?: string;
  title?: string;
  description?: string;
  domain?: string;
  severity?: string;
};

type LearningLossActionRow = {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  dueAt?: number;
  completedAt?: number;
  note?: string;
};

type StudentLearningLossPlanRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  classId?: string;

  sourceType?: string;
  sourceAssessmentRecordId?: string;
  sourceTrackerEntryId?: string;
  sourceTemplateId?: string;
  sourceKind?: string;
  sourceTitle?: string;

  subjectKey?: string;

  lostSkills?: LearningLossSkillRow[];

  planTitle?: string;
  planText?: string;
  remediationActions?: LearningLossActionRow[];

  planStartAt?: number;
  planEndAt?: number;

  ownerPersonId?: string;
  ownerRoleKey?: string;

  baselineScore?: number;
  baselineMaxScore?: number;
  baselineMeasuredAt?: number;

  firstCheckScore?: number;
  firstCheckMaxScore?: number;
  firstCheckMeasuredAt?: number;
  firstCheckNote?: string;

  secondCheckScore?: number;
  secondCheckMaxScore?: number;
  secondCheckMeasuredAt?: number;
  secondCheckNote?: string;

  improvementDelta?: number;
  improvementPercentage?: number;
  improvementIndicator?: string;

  status?: string;

  createdByPersonId?: string;
  createdByRoleKey?: string;

  closedAt?: number;
  closedByPersonId?: string;
  closeNote?: string;

  cancelledAt?: number;
  cancelledByPersonId?: string;
  cancelReason?: string;

  tags?: string[];
  note?: string;

  createdAt?: number;
  updatedAt?: number;
};

type PageData = {
  plan: StudentLearningLossPlanRow;
  student: StudentRow | null;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  grade: GradeRow | null;
  classRow: ClassRow | null;
  memberships: MembershipRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[760px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function toDateInputValue(timestamp?: number) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToMs(value: string) {
  if (!value) return null;

  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseOptionalNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;

  const num = Number(clean);
  return Number.isFinite(num) ? num : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function membershipMatchesSchool(membership: MembershipRow, schoolId: string) {
  const scopeType = String(membership.scopeType || "").trim();
  const scopeId = String(membership.scopeId || "").trim();
  const directSchoolId = String(membership.schoolId || "").trim();
  const schoolIds = Array.isArray(membership.scopes?.schoolIds)
    ? membership.scopes.schoolIds
    : [];

  if (membership.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (directSchoolId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

function pickCurrentMembership(
  memberships: MembershipRow[],
  uid: string | undefined,
  schoolId: string
) {
  if (!uid) return null;

  const rows = memberships.filter(
    (item) => item.uid === uid && item.isActive !== false
  );

  return (
    rows.find((item) => membershipMatchesSchool(item, schoolId)) ??
    rows.find((item) => String(item.scopeType || "") === "ORG") ??
    rows[0] ??
    null
  );
}

function getSchoolTypeLabel(value?: string) {
  switch (value) {
    case "KG":
      return "روضة";
    case "PRIMARY":
      return "ابتدائي";
    default:
      return value || "—";
  }
}

function getLearningLossStatusLabel(value?: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "ACTIVE":
      return "نشطة";
    case "IN_PROGRESS":
      return "قيد التنفيذ";
    case "IMPROVED":
      return "تحسن";
    case "PARTIALLY_IMPROVED":
      return "تحسن جزئي";
    case "NOT_IMPROVED":
      return "لم يتحسن";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "—";
  }
}

function getLearningLossSourceLabel(value?: string) {
  switch (value) {
    case "ASSESSMENT_RECORD":
      return "من قياس رسمي";
    case "TRACKER_ENTRY":
      return "من متابعة";
    case "MANUAL":
      return "يدوي";
    default:
      return value || "—";
  }
}

function getImprovementIndicatorLabel(value?: string) {
  switch (value) {
    case "UNKNOWN":
      return "غير محدد";
    case "IMPROVED":
      return "تحسن";
    case "PARTIAL_IMPROVEMENT":
      return "تحسن جزئي";
    case "NO_IMPROVEMENT":
      return "لا يوجد تحسن";
    case "REGRESSED":
      return "تراجع";
    default:
      return value || "—";
  }
}

function getSeverityLabel(value?: string) {
  switch (value) {
    case "LOW":
      return "منخفض";
    case "MEDIUM":
      return "متوسط";
    case "HIGH":
      return "مرتفع";
    case "CRITICAL":
      return "حرج";
    default:
      return value || "—";
  }
}

function getActionStatusLabel(value?: string) {
  switch (value) {
    case "PLANNED":
      return "مخطط";
    case "IN_PROGRESS":
      return "قيد التنفيذ";
    case "DONE":
      return "تم";
    case "CANCELLED":
      return "ملغي";
    default:
      return value || "—";
  }
}

function formatScore(score?: number, maxScore?: number) {
  const hasScore = typeof score === "number";
  const hasMax = typeof maxScore === "number";

  if (hasScore && hasMax) return `${score} / ${maxScore}`;
  if (hasScore) return `${score}`;
  if (hasMax) return `— / ${maxScore}`;

  return "—";
}

function calculateImprovement(args: {
  baselineScore?: number;
  baselineMaxScore?: number;
  latestScore?: number;
  latestMaxScore?: number;
}) {
  const { baselineScore, baselineMaxScore, latestScore, latestMaxScore } = args;

  if (typeof baselineScore !== "number" || typeof latestScore !== "number") {
    return {
      improvementDelta: undefined as number | undefined,
      improvementPercentage: undefined as number | undefined,
      improvementIndicator: "UNKNOWN",
    };
  }

  const improvementDelta = round2(latestScore - baselineScore);

  let improvementPercentage: number | undefined;

  if (
    typeof baselineMaxScore === "number" &&
    baselineMaxScore > 0 &&
    typeof latestMaxScore === "number" &&
    latestMaxScore > 0
  ) {
    const baselinePercent = (baselineScore / baselineMaxScore) * 100;
    const latestPercent = (latestScore / latestMaxScore) * 100;
    improvementPercentage = round2(latestPercent - baselinePercent);
  }

  let improvementIndicator = "UNKNOWN";

  const valueForIndicator =
    typeof improvementPercentage === "number"
      ? improvementPercentage
      : improvementDelta;

  if (valueForIndicator > 0) {
    improvementIndicator =
      typeof improvementPercentage === "number" && improvementPercentage >= 20
        ? "IMPROVED"
        : "PARTIAL_IMPROVEMENT";
  } else if (valueForIndicator === 0) {
    improvementIndicator = "NO_IMPROVEMENT";
  } else if (valueForIndicator < 0) {
    improvementIndicator = "REGRESSED";
  }

  return {
    improvementDelta,
    improvementPercentage,
    improvementIndicator,
  };
}

function statusFromIndicator(indicator: string) {
  switch (indicator) {
    case "IMPROVED":
      return "IMPROVED";
    case "PARTIAL_IMPROVEMENT":
      return "PARTIALLY_IMPROVED";
    case "NO_IMPROVEMENT":
    case "REGRESSED":
      return "NOT_IMPROVED";
    default:
      return "IN_PROGRESS";
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>

        {icon ? (
          <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
        ) : null}
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

function TextareaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  minHeightClassName = "min-h-28",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${minHeightClassName} w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50`}
      />
    </div>
  );
}

export default function StudentLearningLossPlanPage() {
  const params = useParams<{
    orgId: string;
    studentId: string;
    planId: string;
  }>();

  const orgId = params.orgId;
  const studentId = params.studentId;
  const planId = params.planId;

  const { user, checkingAuth } = useRequireAuth();

  const [firstCheckScore, setFirstCheckScore] = useState("");
  const [firstCheckMaxScore, setFirstCheckMaxScore] = useState("");
  const [firstCheckMeasuredAt, setFirstCheckMeasuredAt] = useState("");
  const [firstCheckNote, setFirstCheckNote] = useState("");

  const [secondCheckScore, setSecondCheckScore] = useState("");
  const [secondCheckMaxScore, setSecondCheckMaxScore] = useState("");
  const [secondCheckMeasuredAt, setSecondCheckMeasuredAt] = useState("");
  const [secondCheckNote, setSecondCheckNote] = useState("");

  const [status, setStatus] = useState("AUTO");
  const [closeNote, setCloseNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [appliedPlanId, setAppliedPlanId] = useState("");

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const planSnap = await getDoc(
      doc(db, `orgs/${orgId}/studentLearningLossPlans/${planId}`)
    );

    if (!planSnap.exists()) return null;

    const plan = {
      id: planSnap.id,
      ...(planSnap.data() as Omit<StudentLearningLossPlanRow, "id">),
    };

    if (plan.studentId !== studentId) {
      throw new Error("خطة الفاقد لا تخص هذا الطالب");
    }

    const studentPromise = getDoc(doc(db, `orgs/${orgId}/students/${studentId}`));

    const schoolPromise = getDoc(doc(db, `orgs/${orgId}/schools/${plan.schoolId}`));

    const academicYearPromise = getDoc(
      doc(
        db,
        `orgs/${orgId}/schools/${plan.schoolId}/academicYears/${plan.academicYearId}`
      )
    );

    const gradePromise = plan.gradeId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${plan.schoolId}/academicYears/${plan.academicYearId}/grades/${plan.gradeId}`
          )
        )
      : Promise.resolve(null);

    const classPromise = plan.classId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${plan.schoolId}/academicYears/${plan.academicYearId}/classes/${plan.classId}`
          )
        )
      : Promise.resolve(null);

    const membershipsPromise = getDocs(collection(db, `orgs/${orgId}/memberships`));

    const [
      studentSnap,
      schoolSnap,
      academicYearSnap,
      gradeSnap,
      classSnap,
      membershipsSnap,
    ] = await Promise.all([
      studentPromise,
      schoolPromise,
      academicYearPromise,
      gradePromise,
      classPromise,
      membershipsPromise,
    ]);

    const student = studentSnap.exists()
      ? ({
          id: studentSnap.id,
          ...(studentSnap.data() as Omit<StudentRow, "id">),
        } as StudentRow)
      : null;

    const personPromise = student?.personId
      ? getDoc(doc(db, `orgs/${orgId}/people/${student.personId}`))
      : Promise.resolve(null);

    const personSnap = await personPromise;

    const person =
      personSnap && "exists" in personSnap && personSnap.exists()
        ? ({
            id: personSnap.id,
            ...(personSnap.data() as Omit<PersonRow, "id">),
          } as PersonRow)
        : null;

    const school = schoolSnap.exists()
      ? ({
          id: schoolSnap.id,
          ...(schoolSnap.data() as Omit<SchoolRow, "id">),
        } as SchoolRow)
      : null;

    const academicYear = academicYearSnap.exists()
      ? ({
          id: academicYearSnap.id,
          title:
            (academicYearSnap.data() as { title?: string }).title ??
            academicYearSnap.id,
        } as AcademicYearRow)
      : null;

    const grade =
      gradeSnap && "exists" in gradeSnap && gradeSnap.exists()
        ? ({
            id: gradeSnap.id,
            title: (gradeSnap.data() as { title?: string }).title ?? gradeSnap.id,
            code: (gradeSnap.data() as { code?: string }).code ?? "",
          } as GradeRow)
        : null;

    const classRow =
      classSnap && "exists" in classSnap && classSnap.exists()
        ? ({
            id: classSnap.id,
            title: (classSnap.data() as { title?: string }).title ?? classSnap.id,
          } as ClassRow)
        : null;

    const memberships = membershipsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<MembershipRow, "id">),
    }));

    return {
      plan,
      student,
      person,
      school,
      academicYear,
      grade,
      classRow,
      memberships,
    };
  }, [orgId, studentId, planId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPage,
      deps: [orgId, studentId, planId],
    });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل خطة الفاقد");
  }, [error]);

  useEffect(() => {
    const plan = data?.plan;
    if (!plan) return;
    if (appliedPlanId === plan.id) return;

    setFirstCheckScore(
      typeof plan.firstCheckScore === "number" ? String(plan.firstCheckScore) : ""
    );
    setFirstCheckMaxScore(
      typeof plan.firstCheckMaxScore === "number"
        ? String(plan.firstCheckMaxScore)
        : ""
    );
    setFirstCheckMeasuredAt(toDateInputValue(plan.firstCheckMeasuredAt));
    setFirstCheckNote(plan.firstCheckNote || "");

    setSecondCheckScore(
      typeof plan.secondCheckScore === "number"
        ? String(plan.secondCheckScore)
        : ""
    );
    setSecondCheckMaxScore(
      typeof plan.secondCheckMaxScore === "number"
        ? String(plan.secondCheckMaxScore)
        : ""
    );
    setSecondCheckMeasuredAt(toDateInputValue(plan.secondCheckMeasuredAt));
    setSecondCheckNote(plan.secondCheckNote || "");

    setStatus("AUTO");
    setCloseNote(plan.closeNote || "");

    setAppliedPlanId(plan.id);
  }, [data?.plan, appliedPlanId]);

  const preview = useMemo(() => {
    const plan = data?.plan;
    if (!plan) {
      return {
        improvementDelta: undefined as number | undefined,
        improvementPercentage: undefined as number | undefined,
        improvementIndicator: "UNKNOWN",
        resolvedStatus: "IN_PROGRESS",
      };
    }

    const firstScore = parseOptionalNumber(firstCheckScore);
    const firstMaxScore = parseOptionalNumber(firstCheckMaxScore);

    const secondScore = parseOptionalNumber(secondCheckScore);
    const secondMaxScore = parseOptionalNumber(secondCheckMaxScore);

    const latestScore =
      typeof secondScore === "number"
        ? secondScore
        : typeof firstScore === "number"
          ? firstScore
          : undefined;

    const latestMaxScore =
      typeof secondScore === "number"
        ? typeof secondMaxScore === "number"
          ? secondMaxScore
          : plan.secondCheckMaxScore
        : typeof firstScore === "number"
          ? typeof firstMaxScore === "number"
            ? firstMaxScore
            : plan.firstCheckMaxScore
          : undefined;

    const improvement = calculateImprovement({
      baselineScore: plan.baselineScore,
      baselineMaxScore: plan.baselineMaxScore,
      latestScore,
      latestMaxScore,
    });

    const resolvedStatus =
      status === "AUTO" ? statusFromIndicator(improvement.improvementIndicator) : status;

    return {
      ...improvement,
      resolvedStatus,
    };
  }, [
    data?.plan,
    firstCheckScore,
    firstCheckMaxScore,
    secondCheckScore,
    secondCheckMaxScore,
    status,
  ]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!data?.plan) return;

    setSaving(true);
    setSaveError(null);

    try {
      const plan = data.plan;

      const firstScore = parseOptionalNumber(firstCheckScore);
      const firstMaxScore = parseOptionalNumber(firstCheckMaxScore);
      const firstMeasuredAt = firstCheckMeasuredAt
        ? dateInputToMs(firstCheckMeasuredAt)
        : null;

      const secondScore = parseOptionalNumber(secondCheckScore);
      const secondMaxScore = parseOptionalNumber(secondCheckMaxScore);
      const secondMeasuredAt = secondCheckMeasuredAt
        ? dateInputToMs(secondCheckMeasuredAt)
        : null;

      if (typeof firstScore === "number" && !firstMeasuredAt) {
        throw new Error("حدد تاريخ القياس الأول");
      }

      if (typeof secondScore === "number" && !secondMeasuredAt) {
        throw new Error("حدد تاريخ القياس الثاني");
      }

      const currentMembership = pickCurrentMembership(
        data.memberships,
        user?.uid,
        plan.schoolId
      );

      const nowMs = Date.now();

      const updatePayload: Record<string, unknown> = {
        status: preview.resolvedStatus,
        improvementIndicator: preview.improvementIndicator,
        updatedAt: nowMs,
      };

      if (typeof firstScore === "number") {
        updatePayload.firstCheckScore = firstScore;
      }

      if (typeof firstMaxScore === "number") {
        updatePayload.firstCheckMaxScore = firstMaxScore;
      }

      if (firstMeasuredAt) {
        updatePayload.firstCheckMeasuredAt = firstMeasuredAt;
      }

      updatePayload.firstCheckNote = firstCheckNote.trim();

      if (typeof secondScore === "number") {
        updatePayload.secondCheckScore = secondScore;
      }

      if (typeof secondMaxScore === "number") {
        updatePayload.secondCheckMaxScore = secondMaxScore;
      }

      if (secondMeasuredAt) {
        updatePayload.secondCheckMeasuredAt = secondMeasuredAt;
      }

      updatePayload.secondCheckNote = secondCheckNote.trim();

      if (typeof preview.improvementDelta === "number") {
        updatePayload.improvementDelta = preview.improvementDelta;
      }

      if (typeof preview.improvementPercentage === "number") {
        updatePayload.improvementPercentage = preview.improvementPercentage;
      }

      if (preview.resolvedStatus === "CLOSED") {
        updatePayload.closedAt = plan.closedAt || nowMs;
        updatePayload.closedByPersonId = currentMembership?.personId || "";
        updatePayload.closeNote = closeNote.trim();
      }

      await updateDoc(
        doc(db, `orgs/${orgId}/studentLearningLossPlans/${plan.id}`),
        updatePayload
      );

      toast.success("تم تحديث خطة الفاقد");
      await reload();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر تحديث خطة الفاقد");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="الفاقد التعليمي"
        badgeIcon={<TrendingUp className="h-3.5 w-3.5" />}
        title="تعذر العثور على خطة الفاقد"
        description="قد تكون الخطة غير موجودة أو لا تخص هذا الطالب."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}/measurements`}>
              <ArrowLeft className="h-4 w-4" />
              العودة للقياسات
            </Link>
          </Button>
        }
      />
    );
  }

  const plan = data?.plan;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <PageHero
        badge="الفاقد التعليمي"
        badgeIcon={<TrendingUp className="h-3.5 w-3.5" />}
        title={plan?.planTitle || plan?.sourceTitle || "خطة فاقد تعليمي"}
        description="إدارة القياس الأول والثاني للخطة العلاجية وحساب مؤشر التحسن."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}/measurements`}>
              <ArrowLeft className="h-4 w-4" />
              العودة للقياسات
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="القياس الأساسي"
          value={formatScore(plan?.baselineScore, plan?.baselineMaxScore)}
          hint={formatDate(plan?.baselineMeasuredAt)}
        />

        <StatCard
          label="القياس الأول"
          value={formatScore(
            parseOptionalNumber(firstCheckScore) ?? plan?.firstCheckScore,
            parseOptionalNumber(firstCheckMaxScore) ?? plan?.firstCheckMaxScore
          )}
          hint={firstCheckMeasuredAt || formatDate(plan?.firstCheckMeasuredAt)}
        />

        <StatCard
          label="القياس الثاني"
          value={formatScore(
            parseOptionalNumber(secondCheckScore) ?? plan?.secondCheckScore,
            parseOptionalNumber(secondCheckMaxScore) ?? plan?.secondCheckMaxScore
          )}
          hint={secondCheckMeasuredAt || formatDate(plan?.secondCheckMeasuredAt)}
        />

        <StatCard
          label="مؤشر التحسن"
          value={getImprovementIndicatorLabel(preview.improvementIndicator)}
          hint={
            typeof preview.improvementPercentage === "number"
              ? `${preview.improvementPercentage}%`
              : typeof preview.improvementDelta === "number"
                ? `فرق: ${preview.improvementDelta}`
                : "غير محدد"
          }
          icon={
            preview.improvementIndicator === "REGRESSED" ? (
              <TrendingDown className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )
          }
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

          <Button variant="outline" type="button" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      {saveError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      <FormSection
        title="الربط الحالي"
        description="بيانات الطالب والقيد المرتبط بالخطة."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <InfoLine
          label="الطالب"
          value={data?.person?.displayName || data?.student?.id || "—"}
        />
        <InfoLine label="المدرسة" value={data?.school?.name || "—"} />
        <InfoLine
          label="نوع المدرسة"
          value={getSchoolTypeLabel(data?.school?.profile?.schoolType)}
        />
        <InfoLine
          label="السنة / الصف / الفصل"
          value={
            [
              data?.academicYear?.title,
              data?.grade?.title,
              data?.classRow?.title,
            ]
              .filter(Boolean)
              .join(" - ") || "—"
          }
        />
      </FormSection>

      <FormSection
        title="ملخص الخطة"
        description="مصدر الخطة والمهارات المفقودة والإجراءات العلاجية."
        contentClassName="space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <InfoLine
            label="مصدر الخطة"
            value={getLearningLossSourceLabel(plan?.sourceType)}
          />
          <InfoLine
            label="حالة الخطة الحالية"
            value={getLearningLossStatusLabel(plan?.status)}
          />
          <InfoLine
            label="الحالة بعد الحفظ"
            value={getLearningLossStatusLabel(preview.resolvedStatus)}
          />
          <InfoLine label="تاريخ البداية" value={formatDate(plan?.planStartAt)} />
          <InfoLine label="تاريخ النهاية" value={formatDate(plan?.planEndAt)} />
          <InfoLine label="آخر تحديث" value={formatDateTime(plan?.updatedAt)} />
        </div>

        {plan?.planText ? (
          <div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm leading-7 text-muted-foreground whitespace-pre-wrap">
            {plan.planText}
          </div>
        ) : null}

        {plan?.lostSkills?.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium">المهارات المفقودة</div>

            <div className="grid gap-3 md:grid-cols-2">
              {plan.lostSkills.map((skill, index) => (
                <div
                  key={`${skill.id || skill.title || index}`}
                  className="rounded-2xl border bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">
                      {skill.title || "مهارة غير مسماة"}
                    </div>

                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {getSeverityLabel(skill.severity)}
                    </span>

                    {skill.domain ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {skill.domain}
                      </span>
                    ) : null}
                  </div>

                  {skill.description ? (
                    <div className="mt-2 text-xs leading-6 text-muted-foreground">
                      {skill.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {plan?.remediationActions?.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium">إجراءات المعالجة</div>

            <div className="grid gap-3">
              {plan.remediationActions.map((action, index) => (
                <div
                  key={`${action.id || action.title || index}`}
                  className="rounded-2xl border bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">
                      {action.title || "إجراء غير مسمى"}
                    </div>

                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {getActionStatusLabel(action.status)}
                    </span>

                    {action.dueAt ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        مستحق: {formatDate(action.dueAt)}
                      </span>
                    ) : null}
                  </div>

                  {action.description ? (
                    <div className="mt-2 text-xs leading-6 text-muted-foreground">
                      {action.description}
                    </div>
                  ) : null}

                  {action.note ? (
                    <div className="mt-2 text-xs leading-6 text-muted-foreground">
                      {action.note}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="تحديث قياسات الخطة العلاجية"
        description="سجل القياس الأول والثاني، وسيتم حساب التحسن تلقائيًا."
        contentClassName="space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="firstCheckScore">درجة القياس الأول</Label>
            <Input
              id="firstCheckScore"
              type="number"
              min="0"
              value={firstCheckScore}
              disabled={saving}
              onChange={(event) => setFirstCheckScore(event.target.value)}
              placeholder="مثال: 55"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstCheckMaxScore">الدرجة الكبرى للقياس الأول</Label>
            <Input
              id="firstCheckMaxScore"
              type="number"
              min="0"
              value={firstCheckMaxScore}
              disabled={saving}
              onChange={(event) => setFirstCheckMaxScore(event.target.value)}
              placeholder="مثال: 100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstCheckMeasuredAt">تاريخ القياس الأول</Label>
            <Input
              id="firstCheckMeasuredAt"
              type="date"
              value={firstCheckMeasuredAt}
              disabled={saving}
              onChange={(event) => setFirstCheckMeasuredAt(event.target.value)}
            />
          </div>

          <TextareaField
            id="firstCheckNote"
            label="ملاحظة القياس الأول"
            value={firstCheckNote}
            disabled={saving}
            onChange={setFirstCheckNote}
            placeholder="ملاحظة اختيارية..."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="secondCheckScore">درجة القياس الثاني</Label>
            <Input
              id="secondCheckScore"
              type="number"
              min="0"
              value={secondCheckScore}
              disabled={saving}
              onChange={(event) => setSecondCheckScore(event.target.value)}
              placeholder="مثال: 75"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondCheckMaxScore">الدرجة الكبرى للقياس الثاني</Label>
            <Input
              id="secondCheckMaxScore"
              type="number"
              min="0"
              value={secondCheckMaxScore}
              disabled={saving}
              onChange={(event) => setSecondCheckMaxScore(event.target.value)}
              placeholder="مثال: 100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondCheckMeasuredAt">تاريخ القياس الثاني</Label>
            <Input
              id="secondCheckMeasuredAt"
              type="date"
              value={secondCheckMeasuredAt}
              disabled={saving}
              onChange={(event) => setSecondCheckMeasuredAt(event.target.value)}
            />
          </div>

          <TextareaField
            id="secondCheckNote"
            label="ملاحظة القياس الثاني"
            value={secondCheckNote}
            disabled={saving}
            onChange={setSecondCheckNote}
            placeholder="ملاحظة اختيارية..."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            id="status"
            label="حالة الخطة بعد الحفظ"
            value={status}
            disabled={saving}
            onChange={setStatus}
          >
            <option value="AUTO">تحديد تلقائي حسب مؤشر التحسن</option>
            <option value="ACTIVE">نشطة</option>
            <option value="IN_PROGRESS">قيد التنفيذ</option>
            <option value="IMPROVED">تحسن</option>
            <option value="PARTIALLY_IMPROVED">تحسن جزئي</option>
            <option value="NOT_IMPROVED">لم يتحسن</option>
            <option value="CLOSED">مغلقة</option>
          </SelectField>

          <TextareaField
            id="closeNote"
            label="ملاحظة الإغلاق"
            value={closeNote}
            disabled={saving || preview.resolvedStatus !== "CLOSED"}
            onChange={setCloseNote}
            placeholder="تظهر عند إغلاق الخطة..."
          />
        </div>
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !plan}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          حفظ تحديث الخطة
        </Button>
      </div>

      {preview.improvementIndicator === "IMPROVED" ? (
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            الخطة تشير إلى تحسن واضح في مستوى الطالب.
          </div>
        </div>
      ) : null}
    </form>
  );
}