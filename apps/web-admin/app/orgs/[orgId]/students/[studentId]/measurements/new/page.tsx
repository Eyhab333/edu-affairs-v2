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
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  TrendingUp,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  LearningLossActionStatus,
  LearningLossSkillSeverity,
  MembershipRole,
  StudentAssessmentRecordSchema,
  StudentLearningLossPlanSchema,
  StudentTrackerEntrySchema,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecordMode = "ASSESSMENT" | "TRACKER" | "LEARNING_LOSS";

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
    schoolType?: "KG" | "PRIMARY" | string;
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

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  title?: string;
  isActive?: boolean;
  scopeType?: string;
  scopeId?: string;
  schoolId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };
};

type StudentAssessmentTemplateRow = {
  id: string;
  orgId?: string;
  schoolId?: string;
  schoolType?: string;
  title: string;
  kind?: string;
  assessmentSlot?: string;
  evaluatorRoleKey?: string;
  code?: string;
  description?: string;
  subjectKey?: string;
  order?: number;
  maxScore?: number;
  scoreType?: string;
  passingScore?: number;
  applicableGradeIds?: string[];
  applicableGradeCodes?: string[];
  applicableClassIds?: string[];
  applicableStreamIds?: string[];
  requiresLearningLossFollowUp?: boolean;
  learningLossThresholdScore?: number;
  learningLossThresholdPercentage?: number;
  isActive?: boolean;
};

type StudentTrackerTemplateRow = {
  id: string;
  orgId?: string;
  schoolId?: string;
  schoolType?: string;
  title: string;
  kind?: string;
  evaluatorRoleKey?: string;
  code?: string;
  description?: string;
  subjectKey?: string;
  scoreType?: string;
  maxScore?: number;
  defaultLessonTitle?: string;
  isContinuous?: boolean;
  isActive?: boolean;
};

type SourceAssessmentRecordRow = {
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

type PageData = {
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  grade: GradeRow | null;
  classRow: ClassRow | null;
  enrollment: EnrollmentRow | null;
  memberships: MembershipRow[];
  assessmentTemplates: StudentAssessmentTemplateRow[];
  trackerTemplates: StudentTrackerTemplateRow[];
  sourceAssessmentRecord: SourceAssessmentRecordRow | null;
  sourceAssessmentTemplate: StudentAssessmentTemplateRow | null;
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-[760px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getTodayInputValue() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
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

function pickCurrentEnrollment(rows: EnrollmentRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const aActive = a.status === "ACTIVE" ? 1 : 0;
    const bActive = b.status === "ACTIVE" ? 1 : 0;

    if (bActive !== aActive) return bActive - aActive;

    return Number(b.startAt || 0) - Number(a.startAt || 0);
  });

  return sorted[0] ?? null;
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

function pickRecorderMembership(
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

function resolveMembershipRoleKey(raw: string | undefined) {
  const value = String(raw || "").trim();

  if (
    MembershipRole.options.includes(
      value as (typeof MembershipRole.options)[number]
    )
  ) {
    return value as (typeof MembershipRole.options)[number];
  }

  return "";
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

function getRecordModeLabel(value: RecordMode) {
  switch (value) {
    case "ASSESSMENT":
      return "قياس رسمي";
    case "TRACKER":
      return "متابعة مستمرة";
    case "LEARNING_LOSS":
      return "خطة فاقد تعليمي";
    default:
      return value;
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

function getScoreTypeLabel(value?: string) {
  switch (value) {
    case "NUMERIC":
      return "رقمي";
    case "LEVEL":
      return "مستوى";
    case "BOOLEAN":
      return "نعم / لا";
    case "TEXT_ONLY":
      return "نص فقط";
    default:
      return value || "—";
  }
}

function templateAppliesToCurrentEnrollment(args: {
  template: StudentAssessmentTemplateRow | StudentTrackerTemplateRow;
  schoolType?: string;
  schoolId?: string;
  enrollment: EnrollmentRow | null;
  grade: GradeRow | null;
}) {
  const { template, schoolType, schoolId, enrollment, grade } = args;

  if (template.isActive === false) return false;

  if (template.schoolType && schoolType && template.schoolType !== schoolType) {
    return false;
  }

  const templateSchoolId = String(template.schoolId || "").trim();
  if (templateSchoolId && schoolId && templateSchoolId !== schoolId) {
    return false;
  }

  const assessmentTemplate = template as StudentAssessmentTemplateRow;

  const applicableGradeIds = Array.isArray(
    assessmentTemplate.applicableGradeIds
  )
    ? assessmentTemplate.applicableGradeIds
    : [];

  const applicableGradeCodes = Array.isArray(
    assessmentTemplate.applicableGradeCodes
  )
    ? assessmentTemplate.applicableGradeCodes
    : [];

  const applicableClassIds = Array.isArray(
    assessmentTemplate.applicableClassIds
  )
    ? assessmentTemplate.applicableClassIds
    : [];

  const applicableStreamIds = Array.isArray(
    assessmentTemplate.applicableStreamIds
  )
    ? assessmentTemplate.applicableStreamIds
    : [];

  if (
    applicableGradeIds.length &&
    (!enrollment?.gradeId || !applicableGradeIds.includes(enrollment.gradeId))
  ) {
    return false;
  }

  if (
    applicableGradeCodes.length &&
    (!grade?.code || !applicableGradeCodes.includes(grade.code))
  ) {
    return false;
  }

  if (
    applicableClassIds.length &&
    (!enrollment?.classId || !applicableClassIds.includes(enrollment.classId))
  ) {
    return false;
  }

  if (
    applicableStreamIds.length &&
    (!enrollment?.streamId || !applicableStreamIds.includes(enrollment.streamId))
  ) {
    return false;
  }

  return true;
}

function calculateLearningLossDecision(args: {
  template: StudentAssessmentTemplateRow;
  score: number | null;
  maxScore: number | null;
  passed?: boolean;
}) {
  const { template, score, maxScore, passed } = args;

  if (!template.requiresLearningLossFollowUp) {
    return {
      needsLearningLossFollowUp: false,
      learningLossTriggerReason: "",
    };
  }

  if (template.scoreType === "BOOLEAN" && passed === false) {
    return {
      needsLearningLossFollowUp: true,
      learningLossTriggerReason:
        "نتيجة القياس غير مجتازة، والقالب يتطلب متابعة فاقد تعليمي.",
    };
  }

  if (typeof score !== "number") {
    return {
      needsLearningLossFollowUp: false,
      learningLossTriggerReason: "",
    };
  }

  const thresholdScore =
    typeof template.learningLossThresholdScore === "number"
      ? template.learningLossThresholdScore
      : null;

  if (thresholdScore !== null && score < thresholdScore) {
    return {
      needsLearningLossFollowUp: true,
      learningLossTriggerReason: `درجة الطالب أقل من حد الفاقد المحدد في القالب (${thresholdScore}).`,
    };
  }

  const thresholdPercentage =
    typeof template.learningLossThresholdPercentage === "number"
      ? template.learningLossThresholdPercentage
      : null;

  if (
    thresholdPercentage !== null &&
    typeof maxScore === "number" &&
    maxScore > 0
  ) {
    const percentage = Math.round((score / maxScore) * 100);

    if (percentage < thresholdPercentage) {
      return {
        needsLearningLossFollowUp: true,
        learningLossTriggerReason: `نسبة الطالب ${percentage}% أقل من حد الفاقد المحدد في القالب (${thresholdPercentage}%).`,
      };
    }
  }

  return {
    needsLearningLossFollowUp: false,
    learningLossTriggerReason: "",
  };
}

function parseLostSkills(text: string) {
  return text
    .split(/\n|،|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `skill-${index + 1}`,
      title,
      description: "",
      domain: "",
      severity: LearningLossSkillSeverity.enum.MEDIUM,
    }));
}

function parseRemediationActions(text: string) {
  return text
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `action-${index + 1}`,
      title,
      description: "",
      status: LearningLossActionStatus.enum.PLANNED,
      note: "",
    }));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-start transition hover:bg-muted/40 ${
        active ? "border-primary bg-primary/5" : "bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`rounded-xl p-2 ${
            active ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {icon}
        </div>

        <div className="space-y-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
    </button>
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function NewStudentMeasurementPage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const router = useRouter();

  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [queryReady, setQueryReady] = useState(false);
  const [requestedMode, setRequestedMode] = useState("");
  const [sourceAssessmentRecordId, setSourceAssessmentRecordId] = useState("");

  const [mode, setMode] = useState<RecordMode>("ASSESSMENT");

  const [assessmentTemplateId, setAssessmentTemplateId] = useState("");
  const [trackerTemplateId, setTrackerTemplateId] = useState("");

  const [measuredAt, setMeasuredAt] = useState(getTodayInputValue());
  const [recordedAt, setRecordedAt] = useState(getTodayInputValue());

  const [assessmentScore, setAssessmentScore] = useState("");
  const [assessmentLevel, setAssessmentLevel] = useState("");
  const [assessmentPassed, setAssessmentPassed] = useState("unset");
  const [assessmentNotes, setAssessmentNotes] = useState("");

  const [trackerTopicTitle, setTrackerTopicTitle] = useState("");
  const [trackerLessonTitle, setTrackerLessonTitle] = useState("");
  const [trackerScore, setTrackerScore] = useState("");
  const [trackerValueText, setTrackerValueText] = useState("");
  const [trackerLevel, setTrackerLevel] = useState("");
  const [trackerCompleted, setTrackerCompleted] = useState("unset");
  const [trackerNotes, setTrackerNotes] = useState("");

  const [planTitle, setPlanTitle] = useState("");
  const [lostSkillsText, setLostSkillsText] = useState("");
  const [planText, setPlanText] = useState("");
  const [remediationActionsText, setRemediationActionsText] = useState("");
  const [planStartAt, setPlanStartAt] = useState(getTodayInputValue());
  const [planEndAt, setPlanEndAt] = useState("");
  const [baselineScore, setBaselineScore] = useState("");
  const [baselineMaxScore, setBaselineMaxScore] = useState("");
  const [planNote, setPlanNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [appliedSourceAssessmentRecordId, setAppliedSourceAssessmentRecordId] =
    useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    setRequestedMode(params.get("mode")?.trim() || "");
    setSourceAssessmentRecordId(
      params.get("sourceAssessmentRecordId")?.trim() || ""
    );
    setQueryReady(true);
  }, []);

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
        where("studentId", "==", studentId)
      )
    );

    const membershipsPromise = getDocs(
      query(collection(db, `orgs/${orgId}/memberships`))
    );

    const assessmentTemplatesPromise = getDocs(
      collection(db, `orgs/${orgId}/studentAssessmentTemplates`)
    );

    const trackerTemplatesPromise = getDocs(
      collection(db, `orgs/${orgId}/studentTrackerTemplates`)
    );

    const sourceAssessmentRecordPromise = sourceAssessmentRecordId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/studentAssessmentRecords/${sourceAssessmentRecordId}`
          )
        )
      : Promise.resolve(null);

    const [
      personSnap,
      enrollmentsSnap,
      membershipsSnap,
      assessmentTemplatesSnap,
      trackerTemplatesSnap,
      sourceAssessmentRecordSnap,
    ] = await Promise.all([
      personPromise,
      enrollmentsPromise,
      membershipsPromise,
      assessmentTemplatesPromise,
      trackerTemplatesPromise,
      sourceAssessmentRecordPromise,
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

    const memberships = membershipsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<MembershipRow, "id">),
    }));

    const allAssessmentTemplates = assessmentTemplatesSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentAssessmentTemplateRow, "id">),
    }));

    const allTrackerTemplates = trackerTemplatesSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentTrackerTemplateRow, "id">),
    }));

    const sourceAssessmentRecord =
      sourceAssessmentRecordSnap &&
      "exists" in sourceAssessmentRecordSnap &&
      sourceAssessmentRecordSnap.exists()
        ? ({
            id: sourceAssessmentRecordSnap.id,
            ...(sourceAssessmentRecordSnap.data() as Omit<
              SourceAssessmentRecordRow,
              "id"
            >),
          } as SourceAssessmentRecordRow)
        : null;

    if (
      sourceAssessmentRecord &&
      sourceAssessmentRecord.studentId !== studentId
    ) {
      throw new Error("القياس المصدر لا يخص هذا الطالب");
    }

    const sourceAssessmentTemplate = sourceAssessmentRecord
      ? allAssessmentTemplates.find(
          (template) => template.id === sourceAssessmentRecord.templateId
        ) ?? null
      : null;

    if (!enrollment) {
      return {
        student,
        person,
        school: null,
        academicYear: null,
        grade: null,
        classRow: null,
        enrollment: null,
        memberships,
        assessmentTemplates: allAssessmentTemplates,
        trackerTemplates: allTrackerTemplates,
        sourceAssessmentRecord,
        sourceAssessmentTemplate,
      };
    }

    const schoolPromise = getDoc(
      doc(db, `orgs/${orgId}/schools/${enrollment.schoolId}`)
    );

    const academicYearPromise = getDoc(
      doc(
        db,
        `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}`
      )
    );

    const gradePromise = enrollment.gradeId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/grades/${enrollment.gradeId}`
          )
        )
      : Promise.resolve(null);

    const classPromise = enrollment.classId
      ? getDoc(
          doc(
            db,
            `orgs/${orgId}/schools/${enrollment.schoolId}/academicYears/${enrollment.academicYearId}/classes/${enrollment.classId}`
          )
        )
      : Promise.resolve(null);

    const [schoolSnap, academicYearSnap, gradeSnap, classSnap] =
      await Promise.all([
        schoolPromise,
        academicYearPromise,
        gradePromise,
        classPromise,
      ]);

    const school =
      schoolSnap.exists()
        ? ({
            id: schoolSnap.id,
            ...(schoolSnap.data() as Omit<SchoolRow, "id">),
          } as SchoolRow)
        : null;

    const academicYear =
      academicYearSnap.exists()
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

    const schoolType = school?.profile?.schoolType;

    const assessmentTemplates = allAssessmentTemplates
      .filter((template) =>
        templateAppliesToCurrentEnrollment({
          template,
          schoolType,
          schoolId: enrollment.schoolId,
          enrollment,
          grade,
        })
      )
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

    const trackerTemplates = allTrackerTemplates
      .filter((template) =>
        templateAppliesToCurrentEnrollment({
          template,
          schoolType,
          schoolId: enrollment.schoolId,
          enrollment,
          grade,
        })
      )
      .sort((a, b) => String(a.title).localeCompare(String(b.title), "ar"));

    return {
      student,
      person,
      school,
      academicYear,
      grade,
      classRow,
      enrollment,
      memberships,
      assessmentTemplates,
      trackerTemplates,
      sourceAssessmentRecord,
      sourceAssessmentTemplate,
    };
  }, [orgId, studentId, sourceAssessmentRecordId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user && queryReady,
    loader: loadPage,
    deps: [orgId, studentId, sourceAssessmentRecordId, queryReady],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل بيانات القياسات والمتابعات");
  }, [error]);

  useEffect(() => {
    if (requestedMode === "learningLoss" && sourceAssessmentRecordId) {
      setMode("LEARNING_LOSS");
    }
  }, [requestedMode, sourceAssessmentRecordId]);

  useEffect(() => {
    const record = data?.sourceAssessmentRecord;
    if (!record) return;
    if (appliedSourceAssessmentRecordId === record.id) return;

    const sourceTitle =
      data?.sourceAssessmentTemplate?.title ||
      getAssessmentKindLabel(record.kind);

    setMode("LEARNING_LOSS");

    setPlanTitle((current) =>
      current.trim() ? current : `خطة فاقد تعليمي - ${sourceTitle}`
    );

    setBaselineScore((current) =>
      current.trim() || typeof record.score !== "number"
        ? current
        : String(record.score)
    );

    setBaselineMaxScore((current) =>
      current.trim() || typeof record.maxScore !== "number"
        ? current
        : String(record.maxScore)
    );

    setPlanNote((current) =>
      current.trim()
        ? current
        : record.learningLossTriggerReason ||
          `تم فتح هذه الخطة من القياس: ${sourceTitle}`
    );

    setAppliedSourceAssessmentRecordId(record.id);
  }, [
    data?.sourceAssessmentRecord,
    data?.sourceAssessmentTemplate,
    appliedSourceAssessmentRecordId,
  ]);

  useEffect(() => {
    if (!assessmentTemplateId && data?.assessmentTemplates.length) {
      setAssessmentTemplateId(data.assessmentTemplates[0].id);
    }

    if (!trackerTemplateId && data?.trackerTemplates.length) {
      setTrackerTemplateId(data.trackerTemplates[0].id);
    }
  }, [
    assessmentTemplateId,
    trackerTemplateId,
    data?.assessmentTemplates,
    data?.trackerTemplates,
  ]);

  const selectedAssessmentTemplate = useMemo(() => {
    return (
      data?.assessmentTemplates.find(
        (item) => item.id === assessmentTemplateId
      ) ?? null
    );
  }, [assessmentTemplateId, data?.assessmentTemplates]);

  const selectedTrackerTemplate = useMemo(() => {
    return (
      data?.trackerTemplates.find((item) => item.id === trackerTemplateId) ??
      null
    );
  }, [trackerTemplateId, data?.trackerTemplates]);

  async function handleSaveAssessment() {
    if (!data?.enrollment || !data.school) {
      throw new Error("لا يوجد قيد دراسي نشط للطالب");
    }

    if (!selectedAssessmentTemplate) {
      throw new Error("اختر قالب القياس أولًا");
    }

    if (!selectedAssessmentTemplate.kind) {
      throw new Error("قالب القياس لا يحتوي على kind");
    }

    const recorderMembership = pickRecorderMembership(
      data.memberships,
      user?.uid,
      data.enrollment.schoolId
    );

    if (!recorderMembership?.personId) {
      throw new Error("تعذر تحديد الشخص الذي يسجل القياس");
    }

    const recorderRoleKey = resolveMembershipRoleKey(
      selectedAssessmentTemplate.evaluatorRoleKey ||
        recorderMembership.roleKey ||
        recorderMembership.role
    );

    if (!recorderRoleKey) {
      throw new Error("تعذر تحديد دور مسجل القياس");
    }

    const measuredAtMs = dateInputToMs(measuredAt);
    if (!measuredAtMs) {
      throw new Error("حدد تاريخ القياس");
    }

    const scoreType = selectedAssessmentTemplate.scoreType || "NUMERIC";
    const score = parseOptionalNumber(assessmentScore);
    const maxScore =
      typeof selectedAssessmentTemplate.maxScore === "number"
        ? selectedAssessmentTemplate.maxScore
        : null;

    if (scoreType === "NUMERIC" && typeof score !== "number") {
      throw new Error("أدخل درجة القياس");
    }

    if (scoreType === "LEVEL" && !assessmentLevel.trim()) {
      throw new Error("أدخل مستوى الطالب");
    }

    const passed =
      scoreType === "BOOLEAN"
        ? assessmentPassed === "true"
          ? true
          : assessmentPassed === "false"
            ? false
            : undefined
        : undefined;

    if (scoreType === "BOOLEAN" && typeof passed !== "boolean") {
      throw new Error("حدد نتيجة الاجتياز");
    }

    const learningLossDecision = calculateLearningLossDecision({
      template: selectedAssessmentTemplate,
      score,
      maxScore,
      passed,
    });

    const nowMs = Date.now();
    const docId = `student-assessment-${studentId}-${selectedAssessmentTemplate.id}-${nowMs}`;

    const payload = {
      id: docId,
      orgId,
      schoolId: data.enrollment.schoolId,
      academicYearId: data.enrollment.academicYearId,

      studentId,
      enrollmentId: data.enrollment.id || "",
      gradeId: data.enrollment.gradeId || "",
      classId: data.enrollment.classId || "",

      templateId: selectedAssessmentTemplate.id,
      kind: selectedAssessmentTemplate.kind,
      assessmentSlot: selectedAssessmentTemplate.assessmentSlot || "CUSTOM",
      subjectKey: selectedAssessmentTemplate.subjectKey || "",

      evaluatorRoleKey: recorderRoleKey,
      assessedByPersonId: recorderMembership.personId,
      measuredAt: measuredAtMs,

      ...(typeof score === "number" ? { score } : {}),
      ...(typeof maxScore === "number" ? { maxScore } : {}),
      ...(assessmentLevel.trim() ? { level: assessmentLevel.trim() } : {}),
      ...(typeof passed === "boolean" ? { passed } : {}),

      notes: assessmentNotes.trim(),
      status: "PUBLISHED",

      needsLearningLossFollowUp:
        learningLossDecision.needsLearningLossFollowUp,
      learningLossPlanId: "",
      learningLossTriggerReason:
        learningLossDecision.learningLossTriggerReason,

      createdAt: nowMs,
      updatedAt: nowMs,
    };

    const parsed = StudentAssessmentRecordSchema.parse(payload);

    await setDoc(
      doc(db, `orgs/${orgId}/studentAssessmentRecords/${docId}`),
      parsed
    );

    if (learningLossDecision.needsLearningLossFollowUp) {
      toast.warning("تم حفظ القياس، وهذا السجل يحتاج خطة فاقد تعليمي");
    } else {
      toast.success("تم حفظ القياس الرسمي");
    }
  }

  async function handleSaveTracker() {
    if (!data?.enrollment || !data.school) {
      throw new Error("لا يوجد قيد دراسي نشط للطالب");
    }

    if (!selectedTrackerTemplate) {
      throw new Error("اختر قالب المتابعة أولًا");
    }

    if (!selectedTrackerTemplate.kind) {
      throw new Error("قالب المتابعة لا يحتوي على kind");
    }

    const recorderMembership = pickRecorderMembership(
      data.memberships,
      user?.uid,
      data.enrollment.schoolId
    );

    if (!recorderMembership?.personId) {
      throw new Error("تعذر تحديد الشخص الذي يسجل المتابعة");
    }

    const recorderRoleKey = resolveMembershipRoleKey(
      selectedTrackerTemplate.evaluatorRoleKey ||
        recorderMembership.roleKey ||
        recorderMembership.role
    );

    if (!recorderRoleKey) {
      throw new Error("تعذر تحديد دور مسجل المتابعة");
    }

    const recordedAtMs = dateInputToMs(recordedAt);
    if (!recordedAtMs) {
      throw new Error("حدد تاريخ المتابعة");
    }

    const scoreType = selectedTrackerTemplate.scoreType || "NUMERIC";
    const score = parseOptionalNumber(trackerScore);
    const maxScore =
      typeof selectedTrackerTemplate.maxScore === "number"
        ? selectedTrackerTemplate.maxScore
        : null;

    if (scoreType === "NUMERIC" && typeof score !== "number") {
      throw new Error("أدخل درجة المتابعة");
    }

    if (scoreType === "LEVEL" && !trackerLevel.trim()) {
      throw new Error("أدخل مستوى المتابعة");
    }

    if (scoreType === "TEXT_ONLY" && !trackerValueText.trim()) {
      throw new Error("أدخل قيمة المتابعة النصية");
    }

    const completed =
      trackerCompleted === "true"
        ? true
        : trackerCompleted === "false"
          ? false
          : undefined;

    const nowMs = Date.now();
    const docId = `student-tracker-${studentId}-${selectedTrackerTemplate.id}-${nowMs}`;

    const payload = {
      id: docId,
      orgId,
      schoolId: data.enrollment.schoolId,
      academicYearId: data.enrollment.academicYearId,

      studentId,
      enrollmentId: data.enrollment.id || "",
      gradeId: data.enrollment.gradeId || "",
      classId: data.enrollment.classId || "",

      templateId: selectedTrackerTemplate.id,
      kind: selectedTrackerTemplate.kind,
      evaluatorRoleKey: recorderRoleKey,
      recordedByPersonId: recorderMembership.personId,
      recordedAt: recordedAtMs,

      topicTitle: trackerTopicTitle.trim(),
      lessonKey: "",
      lessonTitle:
        trackerLessonTitle.trim() ||
        selectedTrackerTemplate.defaultLessonTitle ||
        "",

      ...(typeof score === "number" ? { score } : {}),
      ...(typeof maxScore === "number" ? { maxScore } : {}),
      valueText: trackerValueText.trim(),
      level: trackerLevel.trim(),
      ...(typeof completed === "boolean" ? { completed } : {}),

      notes: trackerNotes.trim(),
      status: "RECORDED",

      createdAt: nowMs,
      updatedAt: nowMs,
    };

    const parsed = StudentTrackerEntrySchema.parse(payload);

    await setDoc(
      doc(db, `orgs/${orgId}/studentTrackerEntries/${docId}`),
      parsed
    );

    toast.success("تم حفظ المتابعة المستمرة");
  }

  async function handleSaveLearningLossPlan() {
    if (!data?.enrollment || !data.school) {
      throw new Error("لا يوجد قيد دراسي نشط للطالب");
    }

    const recorderMembership = pickRecorderMembership(
      data.memberships,
      user?.uid,
      data.enrollment.schoolId
    );

    if (!recorderMembership?.personId) {
      throw new Error("تعذر تحديد الشخص الذي ينشئ خطة الفاقد");
    }

    const recorderRoleKey = resolveMembershipRoleKey(
      recorderMembership.roleKey || recorderMembership.role
    );

    const sourceRecord = data.sourceAssessmentRecord;

    if (sourceRecord?.learningLossPlanId) {
      throw new Error("هذا القياس مرتبط بالفعل بخطة فاقد تعليمي");
    }

    const sourceTitle = sourceRecord
      ? data.sourceAssessmentTemplate?.title ||
        getAssessmentKindLabel(sourceRecord.kind)
      : "";

    const lostSkills = parseLostSkills(lostSkillsText);

    if (lostSkills.length === 0) {
      throw new Error("أدخل مهارة مفقودة واحدة على الأقل");
    }

    if (!planText.trim()) {
      throw new Error("أدخل نص الخطة العلاجية");
    }

    const planStartAtMs = dateInputToMs(planStartAt);
    if (!planStartAtMs) {
      throw new Error("حدد تاريخ بداية الخطة");
    }

    const planEndAtMs = planEndAt ? dateInputToMs(planEndAt) : null;

    const baselineScoreNumber = parseOptionalNumber(baselineScore);
    const baselineMaxScoreNumber = parseOptionalNumber(baselineMaxScore);

    const resolvedBaselineScore =
      typeof baselineScoreNumber === "number"
        ? baselineScoreNumber
        : sourceRecord?.score;

    const resolvedBaselineMaxScore =
      typeof baselineMaxScoreNumber === "number"
        ? baselineMaxScoreNumber
        : sourceRecord?.maxScore;

    const resolvedBaselineMeasuredAt =
      sourceRecord?.measuredAt ?? planStartAtMs;

    const nowMs = Date.now();
    const docId = `learning-loss-plan-${studentId}-${nowMs}`;

    const payload = {
      id: docId,

      orgId,
      schoolId: data.enrollment.schoolId,
      academicYearId: data.enrollment.academicYearId,

      studentId,
      enrollmentId: data.enrollment.id || "",
      gradeId: data.enrollment.gradeId || "",
      classId: data.enrollment.classId || "",

      sourceType: sourceRecord ? "ASSESSMENT_RECORD" : "MANUAL",
      sourceAssessmentRecordId: sourceRecord?.id || "",
      sourceTrackerEntryId: "",
      sourceTemplateId: sourceRecord?.templateId || "",
      sourceKind: sourceRecord?.kind || "",
      sourceTitle,

      subjectKey: sourceRecord?.subjectKey || "",

      lostSkills,

      planTitle: planTitle.trim(),
      planText: planText.trim(),
      remediationActions: parseRemediationActions(remediationActionsText),

      planStartAt: planStartAtMs,
      ...(planEndAtMs ? { planEndAt: planEndAtMs } : {}),

      ownerPersonId: recorderMembership.personId,
      ...(recorderRoleKey ? { ownerRoleKey: recorderRoleKey } : {}),

      ...(typeof resolvedBaselineScore === "number"
        ? { baselineScore: resolvedBaselineScore }
        : {}),
      ...(typeof resolvedBaselineMaxScore === "number"
        ? { baselineMaxScore: resolvedBaselineMaxScore }
        : {}),
      ...(typeof resolvedBaselineScore === "number"
        ? { baselineMeasuredAt: resolvedBaselineMeasuredAt }
        : {}),

      improvementIndicator: "UNKNOWN",

      status: "ACTIVE",

      createdByPersonId: recorderMembership.personId,
      ...(recorderRoleKey ? { createdByRoleKey: recorderRoleKey } : {}),

      tags: [],
      note: planNote.trim(),

      createdAt: nowMs,
      updatedAt: nowMs,
    };

    const parsed = StudentLearningLossPlanSchema.parse(payload);

    await setDoc(
      doc(db, `orgs/${orgId}/studentLearningLossPlans/${docId}`),
      parsed
    );

    if (sourceRecord) {
      await updateDoc(
        doc(db, `orgs/${orgId}/studentAssessmentRecords/${sourceRecord.id}`),
        {
          learningLossPlanId: docId,
          updatedAt: nowMs,
        }
      );
    }

    toast.success("تم حفظ خطة الفاقد التعليمي");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setSaveError(null);

    try {
      if (mode === "ASSESSMENT") {
        await handleSaveAssessment();
      } else if (mode === "TRACKER") {
        await handleSaveTracker();
      } else {
        await handleSaveLearningLossPlan();
      }

      router.push(`/orgs/${orgId}/students/${studentId}/measurements`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ السجل");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || !queryReady || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="إضافة سجل"
        badgeIcon={<Plus className="h-3.5 w-3.5" />}
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

  const scoreType =
    mode === "ASSESSMENT"
      ? selectedAssessmentTemplate?.scoreType || "NUMERIC"
      : selectedTrackerTemplate?.scoreType || "NUMERIC";

  const canSave = !!data?.enrollment && !saving;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHero
        badge="القياسات والمتابعات"
        badgeIcon={<Plus className="h-3.5 w-3.5" />}
        title="إضافة سجل جديد"
        description={`إضافة ${getRecordModeLabel(mode)} إلى ملف الطالب.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}/measurements`}>
              <ArrowLeft className="h-4 w-4" />
              العودة للقياسات
            </Link>
          </Button>
        }
      />

      <FormSection
        title="الربط الحالي"
        description="سيتم ربط السجل الجديد بالقيد الدراسي الحالي."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <InfoLine
          label="الطالب"
          value={data?.person?.displayName || data?.student.id || "—"}
        />
        <InfoLine label="المدرسة" value={data?.school?.name || "—"} />
        <InfoLine
          label="نوع المدرسة"
          value={getSchoolTypeLabel(data?.school?.profile?.schoolType)}
        />
        <InfoLine
          label="الصف / الفصل"
          value={
            [data?.grade?.title, data?.classRow?.title]
              .filter(Boolean)
              .join(" - ") || "—"
          }
        />
      </FormSection>

      {!data?.enrollment ? (
        <FormSection
          title="لا يوجد قيد دراسي نشط"
          description="لا يمكن إضافة قياس أو متابعة بدون قيد دراسي واضح."
          contentClassName="space-y-3"
        >
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            أضف قيدًا دراسيًا للطالب أولًا من مساحة القيود الدراسية.
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="نوع السجل"
        description="اختر نوع السجل الذي تريد إضافته."
        contentClassName="grid gap-4 md:grid-cols-3"
      >
        <ModeCard
          active={mode === "ASSESSMENT"}
          icon={<ClipboardList className="h-4 w-4" />}
          title="قياس رسمي"
          description="اختبار أو قياس مرتبط بقالب رسمي."
          onClick={() => setMode("ASSESSMENT")}
        />

        <ModeCard
          active={mode === "TRACKER"}
          icon={<BookOpenCheck className="h-4 w-4" />}
          title="متابعة مستمرة"
          description="متابعة قرآن، فاقد، أرقام، أو متابعة مخصصة."
          onClick={() => setMode("TRACKER")}
        />

        <ModeCard
          active={mode === "LEARNING_LOSS"}
          icon={<TrendingUp className="h-4 w-4" />}
          title="خطة فاقد تعليمي"
          description="خطة علاجية يدوية للمهارات المفقودة."
          onClick={() => setMode("LEARNING_LOSS")}
        />
      </FormSection>

      {saveError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      {mode === "ASSESSMENT" ? (
        <FormSection
          title="بيانات القياس الرسمي"
          description="اختر القالب ثم أدخل نتيجة الطالب."
          contentClassName="space-y-4"
        >
          {data?.assessmentTemplates.length === 0 ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              لا توجد قوالب قياس مفعلة مناسبة لهذا الطالب.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              id="assessmentTemplate"
              label="قالب القياس"
              value={assessmentTemplateId}
              disabled={!canSave}
              onChange={(value) => setAssessmentTemplateId(value)}
            >
              {data?.assessmentTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title} — {getAssessmentKindLabel(template.kind)} —{" "}
                  {getAssessmentSlotLabel(template.assessmentSlot)}
                </option>
              ))}
            </SelectField>

            <div className="space-y-2">
              <Label htmlFor="measuredAt">تاريخ القياس</Label>
              <Input
                id="measuredAt"
                type="date"
                value={measuredAt}
                disabled={!canSave}
                onChange={(event) => setMeasuredAt(event.target.value)}
              />
            </div>

            <InfoLine
              label="نوع الدرجة"
              value={getScoreTypeLabel(selectedAssessmentTemplate?.scoreType)}
            />

            <InfoLine
              label="الدرجة الكبرى"
              value={
                typeof selectedAssessmentTemplate?.maxScore === "number"
                  ? String(selectedAssessmentTemplate.maxScore)
                  : "—"
              }
            />

            {scoreType === "NUMERIC" ? (
              <div className="space-y-2">
                <Label htmlFor="assessmentScore">درجة الطالب</Label>
                <Input
                  id="assessmentScore"
                  type="number"
                  min="0"
                  value={assessmentScore}
                  disabled={!canSave}
                  onChange={(event) => setAssessmentScore(event.target.value)}
                  placeholder="مثال: 75"
                />
              </div>
            ) : null}

            {scoreType === "LEVEL" ? (
              <div className="space-y-2">
                <Label htmlFor="assessmentLevel">المستوى</Label>
                <Input
                  id="assessmentLevel"
                  value={assessmentLevel}
                  disabled={!canSave}
                  onChange={(event) => setAssessmentLevel(event.target.value)}
                  placeholder="مثال: متقن / متوسط / يحتاج دعم"
                />
              </div>
            ) : null}

            {scoreType === "BOOLEAN" ? (
              <SelectField
                id="assessmentPassed"
                label="نتيجة الاجتياز"
                value={assessmentPassed}
                disabled={!canSave}
                onChange={(value) => setAssessmentPassed(value)}
              >
                <option value="unset">اختر النتيجة</option>
                <option value="true">مجتاز</option>
                <option value="false">غير مجتاز</option>
              </SelectField>
            ) : null}
          </div>

          {selectedAssessmentTemplate?.requiresLearningLossFollowUp ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-800 dark:text-amber-300">
              هذا القالب قد ينتج عنه فاقد تعليمي حسب الحد المحدد في القالب.
              عند انخفاض النتيجة سيتم تمييز السجل بأنه يحتاج خطة فاقد.
            </div>
          ) : null}

          <TextareaField
            id="assessmentNotes"
            label="ملاحظات القياس"
            value={assessmentNotes}
            disabled={!canSave}
            onChange={setAssessmentNotes}
            placeholder="ملاحظات اختيارية..."
          />
        </FormSection>
      ) : null}

      {mode === "TRACKER" ? (
        <FormSection
          title="بيانات المتابعة المستمرة"
          description="اختر قالب المتابعة ثم أدخل نتيجة أو ملاحظة المتابعة."
          contentClassName="space-y-4"
        >
          {data?.trackerTemplates.length === 0 ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              لا توجد قوالب متابعة مفعلة مناسبة لهذا الطالب.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              id="trackerTemplate"
              label="قالب المتابعة"
              value={trackerTemplateId}
              disabled={!canSave}
              onChange={(value) => setTrackerTemplateId(value)}
            >
              {data?.trackerTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title} — {getTrackerKindLabel(template.kind)}
                </option>
              ))}
            </SelectField>

            <div className="space-y-2">
              <Label htmlFor="recordedAt">تاريخ المتابعة</Label>
              <Input
                id="recordedAt"
                type="date"
                value={recordedAt}
                disabled={!canSave}
                onChange={(event) => setRecordedAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trackerTopicTitle">الموضوع</Label>
              <Input
                id="trackerTopicTitle"
                value={trackerTopicTitle}
                disabled={!canSave}
                onChange={(event) => setTrackerTopicTitle(event.target.value)}
                placeholder="مثال: سورة الناس / حرف أ / الأرقام من 1 إلى 5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trackerLessonTitle">الدرس</Label>
              <Input
                id="trackerLessonTitle"
                value={trackerLessonTitle}
                disabled={!canSave}
                onChange={(event) => setTrackerLessonTitle(event.target.value)}
                placeholder={selectedTrackerTemplate?.defaultLessonTitle || ""}
              />
            </div>

            <InfoLine
              label="نوع المتابعة"
              value={getScoreTypeLabel(selectedTrackerTemplate?.scoreType)}
            />

            <InfoLine
              label="الدرجة الكبرى"
              value={
                typeof selectedTrackerTemplate?.maxScore === "number"
                  ? String(selectedTrackerTemplate.maxScore)
                  : "—"
              }
            />

            {scoreType === "NUMERIC" ? (
              <div className="space-y-2">
                <Label htmlFor="trackerScore">درجة المتابعة</Label>
                <Input
                  id="trackerScore"
                  type="number"
                  min="0"
                  value={trackerScore}
                  disabled={!canSave}
                  onChange={(event) => setTrackerScore(event.target.value)}
                  placeholder="مثال: 8"
                />
              </div>
            ) : null}

            {scoreType === "LEVEL" ? (
              <div className="space-y-2">
                <Label htmlFor="trackerLevel">المستوى</Label>
                <Input
                  id="trackerLevel"
                  value={trackerLevel}
                  disabled={!canSave}
                  onChange={(event) => setTrackerLevel(event.target.value)}
                  placeholder="مثال: متقن / نامي / يحتاج دعم"
                />
              </div>
            ) : null}

            {scoreType === "TEXT_ONLY" ? (
              <div className="space-y-2">
                <Label htmlFor="trackerValueText">قيمة نصية</Label>
                <Input
                  id="trackerValueText"
                  value={trackerValueText}
                  disabled={!canSave}
                  onChange={(event) => setTrackerValueText(event.target.value)}
                  placeholder="مثال: حفظ السورة كاملة"
                />
              </div>
            ) : null}

            <SelectField
              id="trackerCompleted"
              label="هل اكتملت المتابعة؟"
              value={trackerCompleted}
              disabled={!canSave}
              onChange={(value) => setTrackerCompleted(value)}
            >
              <option value="unset">غير محدد</option>
              <option value="true">مكتملة</option>
              <option value="false">غير مكتملة</option>
            </SelectField>
          </div>

          <TextareaField
            id="trackerNotes"
            label="ملاحظات المتابعة"
            value={trackerNotes}
            disabled={!canSave}
            onChange={setTrackerNotes}
            placeholder="ملاحظات اختيارية..."
          />
        </FormSection>
      ) : null}

      {mode === "LEARNING_LOSS" ? (
        <FormSection
          title="بيانات خطة الفاقد التعليمي"
          description="أدخل المهارات المفقودة والخطة العلاجية وإجراءات المعالجة."
          contentClassName="space-y-4"
        >
          {data?.sourceAssessmentRecord ? (
            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm leading-7 text-amber-800 dark:text-amber-300">
              سيتم إنشاء خطة الفاقد من القياس:{" "}
              <span className="font-medium">
                {data.sourceAssessmentTemplate?.title ||
                  getAssessmentKindLabel(data.sourceAssessmentRecord.kind)}
              </span>
              . سيتم ربط الخطة بهذا القياس تلقائيًا بعد الحفظ.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="planTitle">عنوان الخطة</Label>
              <Input
                id="planTitle"
                value={planTitle}
                disabled={!canSave}
                onChange={(event) => setPlanTitle(event.target.value)}
                placeholder="مثال: خطة علاجية لمهارات القراءة"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="planStartAt">تاريخ بداية الخطة</Label>
              <Input
                id="planStartAt"
                type="date"
                value={planStartAt}
                disabled={!canSave}
                onChange={(event) => setPlanStartAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="planEndAt">تاريخ نهاية الخطة</Label>
              <Input
                id="planEndAt"
                type="date"
                value={planEndAt}
                disabled={!canSave}
                onChange={(event) => setPlanEndAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baselineScore">القياس الأساسي</Label>
              <Input
                id="baselineScore"
                type="number"
                min="0"
                value={baselineScore}
                disabled={!canSave}
                onChange={(event) => setBaselineScore(event.target.value)}
                placeholder="مثال: 35"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baselineMaxScore">
                الدرجة الكبرى للقياس الأساسي
              </Label>
              <Input
                id="baselineMaxScore"
                type="number"
                min="0"
                value={baselineMaxScore}
                disabled={!canSave}
                onChange={(event) => setBaselineMaxScore(event.target.value)}
                placeholder="مثال: 100"
              />
            </div>
          </div>

          <TextareaField
            id="lostSkillsText"
            label="المهارات المفقودة"
            value={lostSkillsText}
            disabled={!canSave}
            onChange={setLostSkillsText}
            placeholder={
              "اكتب كل مهارة في سطر مستقل\nمثال:\nتمييز حرف أ\nقراءة كلمات قصيرة\nجمع الأعداد حتى 10"
            }
          />

          <TextareaField
            id="planText"
            label="نص الخطة العلاجية"
            value={planText}
            disabled={!canSave}
            onChange={setPlanText}
            placeholder="اكتب وصف الخطة العلاجية..."
            minHeightClassName="min-h-36"
          />

          <TextareaField
            id="remediationActionsText"
            label="إجراءات المعالجة"
            value={remediationActionsText}
            disabled={!canSave}
            onChange={setRemediationActionsText}
            placeholder={
              "اكتب كل إجراء في سطر مستقل\nمثال:\nجلسة قراءة فردية مرتين أسبوعيًا\nواجب قصير يومي\nمراجعة مع ولي الأمر"
            }
          />

          <TextareaField
            id="planNote"
            label="ملاحظات إضافية"
            value={planNote}
            disabled={!canSave}
            onChange={setPlanNote}
            placeholder="ملاحظات اختيارية..."
          />
        </FormSection>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSave}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          حفظ السجل
        </Button>
      </div>
    </form>
  );
}