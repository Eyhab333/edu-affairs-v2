"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Loader2,
  Plus,
  Ruler,
  TrendingUp,
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

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";

type ActiveTab = "assessments" | "trackers" | "learningLoss";

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type EnrollmentRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId?: string;
  classId?: string;
  streamId?: string;
  status?: string;
  startAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: string;
    track?: string;
    gender?: string;
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

type StudentAssessmentTemplateRow = {
  id: string;
  title: string;
  kind?: string;
  assessmentSlot?: string;
  schoolType?: string;
  evaluatorRoleKey?: string;
  subjectKey?: string;
  maxScore?: number;
  scoreType?: string;
  passingScore?: number;
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
  isActive?: boolean;
};

type StudentTrackerTemplateRow = {
  id: string;
  title: string;
  kind?: string;
  schoolType?: string;
  evaluatorRoleKey?: string;
  subjectKey?: string;
  scoreType?: string;
  maxScore?: number;
  defaultLessonTitle?: string;
  isContinuous?: boolean;
  isActive?: boolean;
};

type StudentAssessmentRecordRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  classId?: string;
  templateId: string;
  kind: string;
  assessmentSlot?: string;
  subjectKey?: string;
  evaluatorRoleKey?: string;
  assessedByPersonId: string;
  measuredAt: number;
  score?: number;
  maxScore?: number;
  level?: string;
  passed?: boolean;
  notes?: string;
  status?: string;
  needsLearningLossFollowUp?: boolean;
  learningLossPlanId?: string;
  learningLossTriggerReason?: string;
  createdAt?: number;
  updatedAt?: number;
};

type StudentTrackerEntryRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  classId?: string;
  templateId: string;
  kind: string;
  evaluatorRoleKey?: string;
  recordedByPersonId: string;
  recordedAt: number;
  topicTitle?: string;
  lessonKey?: string;
  lessonTitle?: string;
  score?: number;
  maxScore?: number;
  valueText?: string;
  level?: string;
  completed?: boolean;
  notes?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
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
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  grade: GradeRow | null;
  classRow: ClassRow | null;
  enrollment: EnrollmentRow | null;

  assessments: StudentAssessmentRecordRow[];
  assessmentTemplates: StudentAssessmentTemplateRow[];

  trackerEntries: StudentTrackerEntryRow[];
  trackerTemplates: StudentTrackerTemplateRow[];

  learningLossPlans: StudentLearningLossPlanRow[];
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
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

function pickCurrentEnrollment(rows: EnrollmentRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 1 : 0;
    const bActive = b.status === "ACTIVE" ? 1 : 0;

    if (bActive !== aActive) return bActive - aActive;

    return Number(b.startAt || 0) - Number(a.startAt || 0);
  });

  return sorted[0] ?? null;
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

function getAssessmentKindLabel(value?: string) {
  switch (value) {
    case "KG_TEACHER_MEASUREMENT":
      return "قياس معلمة الروضة";
    case "KG_VP_MEASUREMENT":
      return "قياس وكيلة الروضة";
    case "KG_MEASUREMENT_1":
      return "قياس الروضة الأول";
    case "KG_MEASUREMENT_2":
      return "قياس الروضة الثاني";
    case "KG_MEASUREMENT_3":
      return "قياس الروضة الثالث";
    case "PRIMARY_DIAGNOSTIC_TEST":
      return "اختبار تشخيصي";
    case "PRIMARY_PERIODIC_TEST_1":
      return "اختبار فتري أول";
    case "PRIMARY_PERIODIC_TEST_2":
      return "اختبار فتري ثاني";
    case "PRIMARY_CENTRAL_MEASUREMENT_1":
      return "قياس مركزي أول";
    case "PRIMARY_CENTRAL_MEASUREMENT_2":
      return "قياس مركزي ثاني";
    case "CUSTOM_ASSESSMENT":
      return "قياس مخصص";
    default:
      return value || "—";
  }
}

function getAssessmentSlotLabel(value?: string) {
  switch (value) {
    case "KG_MEASUREMENT_1":
      return "قياس أول";
    case "KG_MEASUREMENT_2":
      return "قياس ثاني";
    case "KG_MEASUREMENT_3":
      return "قياس ثالث";
    case "PRIMARY_DIAGNOSTIC":
      return "تشخيصي";
    case "PRIMARY_PERIODIC_1":
      return "فتري أول";
    case "PRIMARY_PERIODIC_2":
      return "فتري ثاني";
    case "PRIMARY_CENTRAL_1":
      return "مركزي أول";
    case "PRIMARY_CENTRAL_2":
      return "مركزي ثاني";
    case "CUSTOM":
      return "مخصص";
    default:
      return value || "—";
  }
}

function getAssessmentStatusLabel(value?: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "PUBLISHED":
      return "منشور";
    case "LOCKED":
      return "مغلق";
    case "CANCELLED":
      return "ملغي";
    default:
      return value || "—";
  }
}

function getTrackerKindLabel(value?: string) {
  switch (value) {
    case "KG_QURAN_TRACKER":
      return "متابعة القرآن";
    case "KG_LEARNING_GARDENS_TRACKER":
      return "بساتين المعرفة";
    case "KG_NUMBERS_TRACKER":
      return "متابعة الأرقام";
    case "KG_LOSS_TRACKER":
      return "متابعة الفاقد";
    case "PRIMARY_QURAN_TRACKER":
      return "متابعة القرآن";
    case "PRIMARY_LOSS_TRACKER":
      return "متابعة الفاقد";
    case "CUSTOM_TRACKER":
      return "متابعة مخصصة";
    default:
      return value || "—";
  }
}

function getTrackerStatusLabel(value?: string) {
  switch (value) {
    case "RECORDED":
      return "مسجل";
    case "REVIEWED":
      return "تمت المراجعة";
    case "LOCKED":
      return "مغلق";
    case "CANCELLED":
      return "ملغي";
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

function getPassLabel(value?: boolean) {
  if (value === true) return "مجتاز";
  if (value === false) return "غير مجتاز";
  return "—";
}

function getCompletedLabel(value?: boolean) {
  if (value === true) return "مكتمل";
  if (value === false) return "غير مكتمل";
  return "—";
}

function formatScore(score?: number, maxScore?: number) {
  const hasScore = typeof score === "number";
  const hasMax = typeof maxScore === "number";

  if (hasScore && hasMax) return `${score} / ${maxScore}`;
  if (hasScore) return `${score}`;
  if (hasMax) return `— / ${maxScore}`;

  return "—";
}

function getPercentage(score?: number, maxScore?: number) {
  if (typeof score !== "number") return null;
  if (typeof maxScore !== "number" || maxScore <= 0) return null;

  return Math.round((score / maxScore) * 100);
}

function isOpenLearningLossStatus(status?: string) {
  return ["DRAFT", "ACTIVE", "IN_PROGRESS"].includes(status || "ACTIVE");
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="justify-between gap-3"
    >
      <span>{label}</span>
      <span
        className={
          active
            ? "rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs"
            : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        }
      >
        {count}
      </span>
    </Button>
  );
}

export default function StudentMeasurementsPage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>("assessments");

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) return null;

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const personPromise = student.personId
      ? getDoc(doc(db, `orgs/${orgId}/people/${student.personId}`))
      : Promise.resolve(null);

    const enrollmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentEnrollments`),
        where("studentId", "==", studentId),
      ),
    );

    const assessmentsPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentAssessmentRecords`),
        where("studentId", "==", studentId),
      ),
    );

    const trackerEntriesPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentTrackerEntries`),
        where("studentId", "==", studentId),
      ),
    );

    const learningLossPlansPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentLearningLossPlans`),
        where("studentId", "==", studentId),
      ),
    );

    const assessmentTemplatesPromise = getDocs(
      collection(db, `orgs/${orgId}/studentAssessmentTemplates`),
    );

    const trackerTemplatesPromise = getDocs(
      collection(db, `orgs/${orgId}/studentTrackerTemplates`),
    );

    const [
      personSnap,
      enrollmentsSnap,
      assessmentsSnap,
      trackerEntriesSnap,
      learningLossPlansSnap,
      assessmentTemplatesSnap,
      trackerTemplatesSnap,
    ] = await Promise.all([
      personPromise,
      enrollmentsPromise,
      assessmentsPromise,
      trackerEntriesPromise,
      learningLossPlansPromise,
      assessmentTemplatesPromise,
      trackerTemplatesPromise,
    ]);

    const person =
      personSnap && "exists" in personSnap && personSnap.exists()
        ? ({
            id: personSnap.id,
            ...(personSnap.data() as Omit<PersonRow, "id">),
          } as PersonRow)
        : null;

    const enrollments = enrollmentsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EnrollmentRow, "id">),
    }));

    const enrollment = pickCurrentEnrollment(enrollments);

    const assessments = assessmentsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StudentAssessmentRecordRow, "id">),
      }))
      .sort((a, b) => Number(b.measuredAt || 0) - Number(a.measuredAt || 0));

    const trackerEntries = trackerEntriesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StudentTrackerEntryRow, "id">),
      }))
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));

    const learningLossPlans = learningLossPlansSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StudentLearningLossPlanRow, "id">),
      }))
      .sort((a, b) => {
        const aTime = Number(a.updatedAt || a.planStartAt || a.createdAt || 0);
        const bTime = Number(b.updatedAt || b.planStartAt || b.createdAt || 0);
        return bTime - aTime;
      });

    const assessmentTemplates = assessmentTemplatesSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentAssessmentTemplateRow, "id">),
    }));

    const trackerTemplates = trackerTemplatesSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentTrackerTemplateRow, "id">),
    }));

    if (!enrollment) {
      return {
        student,
        person,
        school: null,
        academicYear: null,
        grade: null,
        classRow: null,
        enrollment: null,
        assessments,
        assessmentTemplates,
        trackerEntries,
        trackerTemplates,
        learningLossPlans,
      };
    }

    const schoolPromise = getDoc(
      doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`),
    );

    const academicYearPromise = getDoc(
      doc(
        db,
        `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`,
      ),
    );

    const gradePromise = enrollment.gradeId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/grades/${enrollment.gradeId}`,
          ),
        )
      : Promise.resolve(null);

    const classPromise = enrollment.classId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/classes/${enrollment.classId}`,
          ),
        )
      : Promise.resolve(null);

    const [schoolSnap, academicYearSnap, gradeSnap, classSnap] =
      await Promise.all([
        schoolPromise,
        academicYearPromise,
        gradePromise,
        classPromise,
      ]);

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
            title:
              (gradeSnap.data() as { title?: string }).title ?? gradeSnap.id,
            code: (gradeSnap.data() as { code?: string }).code ?? "",
          } as GradeRow)
        : null;

    const classRow =
      classSnap && "exists" in classSnap && classSnap.exists()
        ? ({
            id: classSnap.id,
            title:
              (classSnap.data() as { title?: string }).title ?? classSnap.id,
          } as ClassRow)
        : null;

    return {
      student,
      person,
      school,
      academicYear,
      grade,
      classRow,
      enrollment,
      assessments,
      assessmentTemplates,
      trackerEntries,
      trackerTemplates,
      learningLossPlans,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPage,
      deps: [orgId, studentId],
    });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل القياسات والمتابعات");
  }, [error]);

  const assessmentTemplateMap = useMemo(() => {
    return new Map(
      (data?.assessmentTemplates ?? []).map((item) => [item.id, item]),
    );
  }, [data?.assessmentTemplates]);

  const trackerTemplateMap = useMemo(() => {
    return new Map(
      (data?.trackerTemplates ?? []).map((item) => [item.id, item]),
    );
  }, [data?.trackerTemplates]);

  const activeAssessments = useMemo(
    () =>
      (data?.assessments ?? []).filter((item) => item.status !== "CANCELLED"),
    [data?.assessments],
  );

  const activeTrackerEntries = useMemo(
    () =>
      (data?.trackerEntries ?? []).filter(
        (item) => item.status !== "CANCELLED",
      ),
    [data?.trackerEntries],
  );

  const activeLearningLossPlans = useMemo(
    () =>
      (data?.learningLossPlans ?? []).filter(
        (item) => item.status !== "CANCELLED",
      ),
    [data?.learningLossPlans],
  );

  const openLearningLossPlans = activeLearningLossPlans.filter((item) =>
    isOpenLearningLossStatus(item.status),
  );

  const averageAssessmentPercentage = useMemo(() => {
    const percentages = activeAssessments
      .map((item) => getPercentage(item.score, item.maxScore))
      .filter((item): item is number => typeof item === "number");

    if (!percentages.length) return "—";

    const total = percentages.reduce((sum, item) => sum + item, 0);
    return `${Math.round(total / percentages.length)}%`;
  }, [activeAssessments]);

  const completedTrackerCount = activeTrackerEntries.filter(
    (item) => item.completed === true,
  ).length;

  const needsLearningLossCount = activeAssessments.filter(
    (item) => item.needsLearningLossFollowUp && !item.learningLossPlanId,
  ).length;

  const latestActivityAt = Math.max(
    0,
    ...activeAssessments.map((item) => Number(item.measuredAt || 0)),
    ...activeTrackerEntries.map((item) => Number(item.recordedAt || 0)),
    ...activeLearningLossPlans.map((item) =>
      Number(item.updatedAt || item.planStartAt || item.createdAt || 0),
    ),
  );

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="القياسات والمتابعات"
        badgeIcon={<Ruler className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد لا يكون هذا الطالب موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students`}>
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
        badge="القياسات والمتابعات"
        badgeIcon={<Ruler className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="لوحة واحدة للقياسات الرسمية، المتابعات المستمرة، وخطط الفاقد التعليمي."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى ملف الطالب
              </Link>
            </Button>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/students/${studentId}/measurements/new`}
              >
                <Plus className="h-4 w-4" />
                إضافة سجل
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="القياسات الرسمية"
          value={activeAssessments.length}
          hint="اختبارات وقياسات مرتبطة بالقالب"
        />
        <StatCard
          label="متوسط القياسات"
          value={averageAssessmentPercentage}
          hint="للقياسات الرقمية فقط"
        />
        <StatCard
          label="المتابعات المستمرة"
          value={activeTrackerEntries.length}
          hint={`${completedTrackerCount} مكتملة`}
        />
        <StatCard
          label="خطط الفاقد المفتوحة"
          value={openLearningLossPlans.length}
          hint={`تحتاج متابعة: ${needsLearningLossCount}`}
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

          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="الربط الحالي"
        description="القيد الدراسي الذي تُقرأ عليه القياسات والمتابعات."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          المدرسة:{" "}
          <span className="font-medium text-foreground">
            {data?.school?.name || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          نوع المدرسة:{" "}
          <span className="font-medium text-foreground">
            {getSchoolTypeLabel(data?.school?.profile?.schoolType)}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          السنة الدراسية:{" "}
          <span className="font-medium text-foreground">
            {data?.academicYear?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الصف / الفصل:{" "}
          <span className="font-medium text-foreground">
            {[data?.grade?.title, data?.classRow?.title]
              .filter(Boolean)
              .join(" - ") || "—"}
          </span>
        </div>
      </FormSection>

      {!data?.enrollment ? (
        <FormSection
          title="تنبيه"
          description="لا يوجد قيد دراسي نشط للطالب."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            يمكن عرض السجلات السابقة إن وجدت، لكن إضافة قياسات أو متابعات جديدة
            لاحقًا ستحتاج إلى قيد دراسي واضح.
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="مركز القياسات والمتابعات"
        description={`آخر نشاط: ${latestActivityAt ? formatDateTime(latestActivityAt) : "—"}`}
        contentClassName="space-y-5"
      >
        <div className="flex flex-wrap gap-2">
          <TabButton
            active={activeTab === "assessments"}
            label="القياسات الرسمية"
            count={activeAssessments.length}
            onClick={() => setActiveTab("assessments")}
          />

          <TabButton
            active={activeTab === "trackers"}
            label="المتابعات المستمرة"
            count={activeTrackerEntries.length}
            onClick={() => setActiveTab("trackers")}
          />

          <TabButton
            active={activeTab === "learningLoss"}
            label="الفاقد التعليمي"
            count={activeLearningLossPlans.length}
            onClick={() => setActiveTab("learningLoss")}
          />
        </div>

        {activeTab === "assessments" ? (
          <div className="space-y-4">
            {activeAssessments.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
                title="لا توجد قياسات رسمية بعد"
                description="سيظهر هنا الاختبار التشخيصي، الاختبارات الفترية، القياسات المركزية، وقياسات الروضة عند تسجيلها."
              />
            ) : (
              <div className="grid gap-4">
                {activeAssessments.map((record) => {
                  const template = assessmentTemplateMap.get(record.templateId);
                  const percentage = getPercentage(
                    record.score,
                    record.maxScore,
                  );
                  const needsLoss =
                    record.needsLearningLossFollowUp &&
                    !record.learningLossPlanId;

                  return (
                    <div
                      key={record.id}
                      className="rounded-2xl border bg-card p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold">
                              {template?.title ||
                                getAssessmentKindLabel(record.kind)}
                            </h3>

                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                              {getAssessmentKindLabel(record.kind)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getAssessmentSlotLabel(record.assessmentSlot)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getAssessmentStatusLabel(record.status)}
                            </span>

                            {typeof percentage === "number" ? (
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                                {percentage}%
                              </span>
                            ) : null}

                            {needsLoss ? (
                              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
                                يحتاج خطة فاقد
                              </span>
                            ) : null}

                            {record.learningLossPlanId ? (
                              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                                له خطة فاقد
                              </span>
                            ) : null}
                          </div>

                          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-4">
                            <div>
                              الدرجة:{" "}
                              <span className="font-medium text-foreground">
                                {formatScore(record.score, record.maxScore)}
                              </span>
                            </div>

                            <div>
                              المستوى:{" "}
                              <span className="font-medium text-foreground">
                                {record.level || "—"}
                              </span>
                            </div>

                            <div>
                              الاجتياز:{" "}
                              <span className="font-medium text-foreground">
                                {getPassLabel(record.passed)}
                              </span>
                            </div>

                            <div>
                              التاريخ:{" "}
                              <span className="font-medium text-foreground">
                                {formatDate(record.measuredAt)}
                              </span>
                            </div>
                          </div>

                          {record.learningLossTriggerReason ? (
                            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                              {record.learningLossTriggerReason}
                            </div>
                          ) : null}

                          {needsLoss ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  href={`/orgs/${orgId}/students/${studentId}/measurements/new?mode=learningLoss&sourceAssessmentRecordId=${record.id}`}
                                >
                                  <TrendingUp className="h-4 w-4" />
                                  فتح خطة فاقد من هذا القياس
                                </Link>
                              </Button>
                            </div>
                          ) : null}

                          {record.notes ? (
                            <p className="whitespace-pre-wrap rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-7 text-muted-foreground">
                              {record.notes}
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border px-4 py-3 text-center">
                          <div className="text-xs text-muted-foreground">
                            النتيجة
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {formatScore(record.score, record.maxScore)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "trackers" ? (
          <div className="space-y-4">
            {activeTrackerEntries.length === 0 ? (
              <EmptyState
                icon={
                  <BookOpenCheck className="h-5 w-5 text-muted-foreground" />
                }
                title="لا توجد متابعات مستمرة بعد"
                description="سيظهر هنا سجل القرآن، الفاقد، بساتين المعرفة، الأرقام، أو أي متابعة مخصصة."
              />
            ) : (
              <div className="grid gap-4">
                {activeTrackerEntries.map((entry) => {
                  const template = trackerTemplateMap.get(entry.templateId);
                  const percentage = getPercentage(entry.score, entry.maxScore);

                  return (
                    <div
                      key={entry.id}
                      className="rounded-2xl border bg-card p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold">
                              {template?.title ||
                                getTrackerKindLabel(entry.kind)}
                            </h3>

                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                              {getTrackerKindLabel(entry.kind)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getTrackerStatusLabel(entry.status)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getCompletedLabel(entry.completed)}
                            </span>

                            {typeof percentage === "number" ? (
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                                {percentage}%
                              </span>
                            ) : null}
                          </div>

                          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-4">
                            <div>
                              الموضوع:{" "}
                              <span className="font-medium text-foreground">
                                {entry.topicTitle || "—"}
                              </span>
                            </div>

                            <div>
                              الدرس:{" "}
                              <span className="font-medium text-foreground">
                                {entry.lessonTitle || "—"}
                              </span>
                            </div>

                            <div>
                              الدرجة:{" "}
                              <span className="font-medium text-foreground">
                                {formatScore(entry.score, entry.maxScore)}
                              </span>
                            </div>

                            <div>
                              التاريخ:{" "}
                              <span className="font-medium text-foreground">
                                {formatDate(entry.recordedAt)}
                              </span>
                            </div>
                          </div>

                          {entry.level || entry.valueText ? (
                            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                              <div>
                                المستوى:{" "}
                                <span className="font-medium text-foreground">
                                  {entry.level || "—"}
                                </span>
                              </div>

                              <div>
                                القيمة:{" "}
                                <span className="font-medium text-foreground">
                                  {entry.valueText || "—"}
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {entry.notes ? (
                            <p className="whitespace-pre-wrap rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-7 text-muted-foreground">
                              {entry.notes}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-muted/40">
                          {entry.completed ? (
                            <BookOpenCheck className="h-6 w-6 text-primary" />
                          ) : (
                            <Loader2 className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "learningLoss" ? (
          <div className="space-y-4">
            {activeLearningLossPlans.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-5 w-5 text-muted-foreground" />}
                title="لا توجد خطط فاقد تعليمي بعد"
                description="سيظهر هنا سجل المهارات المفقودة، الخطة العلاجية، القياس الأول والثاني، ومؤشر التحسن."
              />
            ) : (
              <div className="grid gap-4">
                {activeLearningLossPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border bg-card p-4">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold">
                              {plan.planTitle ||
                                plan.sourceTitle ||
                                "خطة فاقد تعليمي"}
                            </h3>

                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                              {getLearningLossStatusLabel(plan.status)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getLearningLossSourceLabel(plan.sourceType)}
                            </span>

                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                              {getImprovementIndicatorLabel(
                                plan.improvementIndicator,
                              )}
                            </span>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            الفترة:{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(plan.planStartAt)}
                            </span>{" "}
                            إلى{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(plan.planEndAt)}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-2xl border px-4 py-3 text-center">
                          <div className="text-xs text-muted-foreground">
                            التحسن
                          </div>
                          <div className="mt-1 text-xl font-bold">
                            {typeof plan.improvementPercentage === "number"
                              ? `${Math.round(plan.improvementPercentage)}%`
                              : "—"}
                          </div>
                        </div>
                      </div>

                      {plan.lostSkills?.length ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            المهارات المفقودة
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            {plan.lostSkills.map((skill, index) => (
                              <div
                                key={`${skill.id || skill.title || index}`}
                                className="rounded-2xl border bg-muted/30 px-4 py-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium">
                                    {skill.title || "مهارة غير مسماة"}
                                  </div>

                                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                                    {getSeverityLabel(skill.severity)}
                                  </span>

                                  {skill.domain ? (
                                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
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

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border px-4 py-3">
                          <div className="text-xs text-muted-foreground">
                            القياس الأساسي
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {formatScore(
                              plan.baselineScore,
                              plan.baselineMaxScore,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(plan.baselineMeasuredAt)}
                          </div>
                        </div>

                        <div className="rounded-2xl border px-4 py-3">
                          <div className="text-xs text-muted-foreground">
                            القياس الأول للخطة
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {formatScore(
                              plan.firstCheckScore,
                              plan.firstCheckMaxScore,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(plan.firstCheckMeasuredAt)}
                          </div>
                        </div>

                        <div className="rounded-2xl border px-4 py-3">
                          <div className="text-xs text-muted-foreground">
                            القياس الثاني للخطة
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {formatScore(
                              plan.secondCheckScore,
                              plan.secondCheckMaxScore,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(plan.secondCheckMeasuredAt)}
                          </div>
                        </div>
                      </div>

                      {plan.planText ? (
                        <p className="whitespace-pre-wrap rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-7 text-muted-foreground">
                          {plan.planText}
                        </p>
                      ) : null}

                      {plan.remediationActions?.length ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            إجراءات المعالجة
                          </div>

                          <div className="grid gap-2">
                            {plan.remediationActions.map((action, index) => (
                              <div
                                key={`${action.id || action.title || index}`}
                                className="rounded-2xl border px-4 py-3"
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

                      {plan.note ? (
                        <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                          {plan.note}
                        </div>
                      ) : null}

                      <div className="flex justify-end">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/orgs/${orgId}/students/${studentId}/measurements/learning-loss/${plan.id}`}
                          >
                            إدارة خطة الفاقد
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </FormSection>
    </div>
  );
}
