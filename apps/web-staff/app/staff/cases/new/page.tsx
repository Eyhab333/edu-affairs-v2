"use client";

import {
  type FormEvent,
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileText,
  Loader2,
  Save,
  Search,
  User,
  UserCheck,
} from "lucide-react";

import type {
  AcademicTerm,
  AcademicYear,
  StudentCaseParentVisibility,
  StudentCasePriority,
} from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { useVisibleStudents } from "@/hooks/use-visible-students";
import { db } from "@/lib/firebase";
import {
  createStudentCaseReferral,
  getStudentCaseReferralOptions,
  type StudentCaseReferralRecipient,
} from "@/lib/student-cases";

const PRIORITY_OPTIONS: { value: StudentCasePriority; label: string }[] = [
  { value: "LOW", label: "منخفضة" },
  { value: "NORMAL", label: "عادية" },
  { value: "HIGH", label: "عالية" },
  { value: "URGENT", label: "عاجلة" },
];

const PARENT_VISIBILITY_OPTIONS: {
  value: StudentCaseParentVisibility;
  label: string;
}[] = [
  { value: "INTERNAL_ONLY", label: "داخلي فقط" },
  { value: "SUMMARY_VISIBLE", label: "ملخص لولي الأمر" },
  { value: "FULL_VISIBLE", label: "ظاهر بالكامل لولي الأمر" },
];

const CASE_TYPE_OPTIONS = [
  { value: "BEHAVIOR", label: "سلوكية" },
  {
    value: "HOMEWORK_NEGLECT",
    label: "عدم حل الواجبات / إهمال مستمر",
  },
  { value: "ACADEMIC", label: "تعليمية" },
  { value: "ATTENDANCE", label: "حضور وغياب" },
  { value: "HEALTH", label: "صحية" },
  { value: "SOCIAL", label: "اجتماعية" },
  { value: "OTHER", label: "أخرى" },
];

const TEACHER_ROLE_KEYS = new Set([
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

const VICE_PRINCIPAL_ROLE_BY_TEACHER: Record<string, string> = {
  BOYS_TEACHER: "BOYS_VP",
  GIRLS_TEACHER: "GIRLS_VP",
  KG_TEACHER: "KG_VP",
};

const STUDENT_GUIDE_ROLE_BY_TEACHER: Record<string, string> = {
  BOYS_TEACHER: "BOYS_STUDENT_GUIDE",
  GIRLS_TEACHER: "GIRLS_STUDENT_COUNSELOR",
};

const STUDENT_GUIDE_ROLE_BY_VP: Record<string, string> = {
  BOYS_VP: "BOYS_STUDENT_GUIDE",
  BOYS_STUDENTS_VP: "BOYS_STUDENT_GUIDE",
  GIRLS_VP: "GIRLS_STUDENT_COUNSELOR",
};

const fieldClassName =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15";

function FieldLabel(props: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-2 block text-sm font-medium text-foreground">
      {props.children}
      {props.required ? <span className="text-destructive"> *</span> : null}
    </span>
  );
}

function SectionCard(props: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const Icon = props.icon;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {props.description}
            </p>
          ) : null}
        </div>
      </div>
      {props.children}
    </section>
  );
}

function formatAcademicYearLabel(academicYearId: string) {
  const year = academicYearId.match(/\d{4}/)?.[0];
  return year ? `العام الدراسي ${year}هـ` : "عام دراسي";
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export default function NewStudentCasePage() {
  const router = useRouter();
  const { actor } = useStaffActor();
  const visibleStudents = useVisibleStudents({
    orgId: actor.orgId,
    visibleClasses: actor.visibleClasses,
    enabled: Boolean(actor.orgId),
  });

  const schoolOptions = useMemo(
    () =>
      [...actor.schools].sort((left, right) =>
        left.name.localeCompare(right.name, "ar"),
      ),
    [actor.schools],
  );
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [academicYearOptions, setAcademicYearOptions] = useState<
    AcademicYear[]
  >([]);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);
  const [termId, setTermId] = useState("");
  const [termOptions, setTermOptions] = useState<AcademicTerm[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseTypeKey, setCaseTypeKey] = useState("BEHAVIOR");
  const [priority, setPriority] = useState<StudentCasePriority>("NORMAL");

  const [recipients, setRecipients] = useState<
    StudentCaseReferralRecipient[]
  >([]);
  const [assigneePersonId, setAssigneePersonId] = useState("");
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [parentVisibility, setParentVisibility] =
    useState<StudentCaseParentVisibility>("INTERNAL_ONLY");
  const [parentVisibleSummary, setParentVisibleSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherRoleKey = actor.roles.find((role) =>
    TEACHER_ROLE_KEYS.has(role),
  );
  const isTeacherToVpBehaviorRoute =
    Boolean(teacherRoleKey) && caseTypeKey === "BEHAVIOR";
  const recommendedVpRoleKey = teacherRoleKey
    ? VICE_PRINCIPAL_ROLE_BY_TEACHER[teacherRoleKey]
    : undefined;
  const recommendedGuideRoleKey = teacherRoleKey
    ? STUDENT_GUIDE_ROLE_BY_TEACHER[teacherRoleKey]
    : undefined;
  const isTeacherToGuideHomeworkRoute =
    Boolean(teacherRoleKey && recommendedGuideRoleKey) &&
    caseTypeKey === "HOMEWORK_NEGLECT";
  const vpRoleKey = actor.roles.find(
    (role) => STUDENT_GUIDE_ROLE_BY_VP[role],
  );
  const recommendedGuideRoleForVp = vpRoleKey
    ? STUDENT_GUIDE_ROLE_BY_VP[vpRoleKey]
    : undefined;
  const isVpToGuideAttendanceRoute =
    Boolean(vpRoleKey && recommendedGuideRoleForVp) &&
    caseTypeKey === "ATTENDANCE";
  const recommendedRecipientRoleKey = isTeacherToVpBehaviorRoute
    ? recommendedVpRoleKey
    : isTeacherToGuideHomeworkRoute
      ? recommendedGuideRoleKey
      : isVpToGuideAttendanceRoute
        ? recommendedGuideRoleForVp
        : undefined;
  const hasGuidedReferralRoute =
    isTeacherToVpBehaviorRoute ||
    isTeacherToGuideHomeworkRoute ||
    isVpToGuideAttendanceRoute;

  useEffect(() => {
    if (
      schoolOptions.length > 0 &&
      !schoolOptions.some((school) => school.id === schoolId)
    ) {
      setSchoolId(schoolOptions[0].id);
    }
  }, [schoolId, schoolOptions]);

  useEffect(() => {
    let active = true;

    async function loadAcademicYears() {
      if (!schoolId) {
        setAcademicYearOptions([]);
        setAcademicYearId("");
        return;
      }

      setLoadingAcademicYears(true);
      try {
        const snapshot = await getDocs(
          collection(
            db,
            "orgs",
            actor.orgId,
            "schools",
            schoolId,
            "academicYears",
          ),
        );
        if (!active) return;

        const options = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...(document.data() as Omit<AcademicYear, "id">),
          }))
          .sort((left, right) => right.startsAt - left.startsAt);

        setAcademicYearOptions(options);
        setAcademicYearId((current) => {
          if (options.some((year) => year.id === current)) return current;
          return (
            options.find((year) => year.isActive)?.id ??
            options[0]?.id ??
            ""
          );
        });
      } catch (error) {
        if (!active) return;
        setAcademicYearOptions([]);
        setAcademicYearId("");
        setError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل السنوات الدراسية.",
        );
      } finally {
        if (active) setLoadingAcademicYears(false);
      }
    }

    void loadAcademicYears();
    return () => {
      active = false;
    };
  }, [actor.orgId, schoolId]);

  const configuredCurrentTermId =
    actor.currentTermsByAcademicYear[academicYearId]?.id ?? "";
  const selectedTerm =
    termOptions.find((term) => term.id === termId) ?? null;

  useEffect(() => {
    let active = true;

    async function loadTerms() {
      if (!academicYearId) {
        setTermOptions([]);
        setTermId("");
        return;
      }

      setLoadingTerms(true);
      try {
        const snapshot = await getDocs(
          collection(
            db,
            "orgs",
            actor.orgId,
            "academicYears",
            academicYearId,
            "terms",
          ),
        );
        if (!active) return;

        const options = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...(document.data() as Omit<AcademicTerm, "id">),
          }))
          .sort((left, right) => left.order - right.order);

        setTermOptions(options);
        setTermId((current) => {
          if (options.some((term) => term.id === current)) return current;
          return (
            options.find((term) => term.id === configuredCurrentTermId)?.id ??
            options.find((term) => term.isCurrent)?.id ??
            options.find((term) => term.status === "ACTIVE")?.id ??
            options[0]?.id ??
            ""
          );
        });
      } catch (error) {
        if (!active) return;
        setTermOptions([]);
        setTermId("");
        setError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل الفصول الدراسية.",
        );
      } finally {
        if (active) setLoadingTerms(false);
      }
    }

    void loadTerms();
    return () => {
      active = false;
    };
  }, [academicYearId, actor.orgId, configuredCurrentTermId]);

  const availableStudents = useMemo(() => {
    const rows = (visibleStudents.data?.rows ?? []).filter(
      (row) =>
        row.schoolId === schoolId &&
        row.academicYearId === academicYearId,
    );
    const deduped = new Map(rows.map((row) => [row.studentId, row]));
    const search = normalizeSearch(studentSearch);

    return Array.from(deduped.values()).filter((row) => {
      if (!search) return true;
      return normalizeSearch(`${row.displayName} ${row.classTitle}`).includes(
        search,
      );
    });
  }, [academicYearId, schoolId, studentSearch, visibleStudents.data?.rows]);
  const selectedStudent = useMemo(
    () =>
      (visibleStudents.data?.rows ?? []).find(
        (row) =>
          row.studentId === studentId &&
          row.schoolId === schoolId &&
          row.academicYearId === academicYearId,
      ) ?? null,
    [academicYearId, schoolId, studentId, visibleStudents.data?.rows],
  );
  const selectedRecipient = recipients.find(
    (recipient) => recipient.personId === assigneePersonId,
  );

  useEffect(() => {
    setStudentId("");
    setStudentSearch("");
  }, [schoolId, academicYearId]);

  useEffect(() => {
    let active = true;

    async function loadRecipients() {
      if (!schoolId) {
        setRecipients([]);
        setAssigneePersonId("");
        return;
      }

      setLoadingRecipients(true);
      try {
        const result = await getStudentCaseReferralOptions({
          orgId: actor.orgId,
          schoolId,
        });
        if (!active) return;
        setRecipients(result);
        setAssigneePersonId((current) =>
          result.some((item) => item.personId === current) ? current : "",
        );
      } catch (error) {
        if (!active) return;
        setRecipients([]);
        setAssigneePersonId("");
        setError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل قائمة المحال إليهم.",
        );
      } finally {
        if (active) setLoadingRecipients(false);
      }
    }

    void loadRecipients();
    return () => {
      active = false;
    };
  }, [actor.orgId, schoolId]);

  useEffect(() => {
    if (!hasGuidedReferralRoute || !recommendedRecipientRoleKey) return;

    const recommendedRecipient = recipients.find(
      (recipient) => recipient.roleKey === recommendedRecipientRoleKey,
    );
    if (!recommendedRecipient) return;

    setAssigneePersonId((current) => {
      const currentRecipient = recipients.find(
        (recipient) => recipient.personId === current,
      );
      return currentRecipient?.roleKey === recommendedRecipientRoleKey
        ? current
        : recommendedRecipient.personId;
    });
  }, [
    hasGuidedReferralRoute,
    recipients,
    recommendedRecipientRoleKey,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schoolId || !academicYearId || !selectedTerm) {
      setError("اختر المدرسة والسنة والفصل الدراسي.");
      return;
    }
    if (!selectedStudent) {
      setError("اختر الطالب من القائمة.");
      return;
    }
    if (!title.trim() || !description.trim()) {
      setError("اكتب عنوان القضية ووصفها.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const caseType = CASE_TYPE_OPTIONS.find(
        (item) => item.value === caseTypeKey,
      );
      const createdCase = await createStudentCaseReferral({
        orgId: actor.orgId,
        schoolId,
        academicYearId,
        termId: selectedTerm.id,
        termTitle: selectedTerm.title,
        termShortTitle: selectedTerm.shortTitle,
        student: {
          studentId: selectedStudent.studentId,
          studentDisplayName: selectedStudent.displayName,
          gradeId: selectedStudent.gradeId || undefined,
          gradeTitle: selectedStudent.gradeTitle || undefined,
          classId: selectedStudent.classId || undefined,
          classTitle: selectedStudent.classTitle || undefined,
        },
        title: title.trim(),
        description: description.trim(),
        caseTypeKey,
        caseTypeTitle: caseType?.label,
        priority,
        createdBy: {
          personId: actor.personId,
          displayName:
            actor.person?.displayName ?? actor.userProfile?.displayName,
          roleKey: actor.roles[0],
        },
        ...(selectedRecipient
          ? {
              assignee: {
                personId: selectedRecipient.personId,
                displayName: selectedRecipient.displayName,
                roleKey: selectedRecipient.roleKey,
              },
            }
          : {}),
        parentVisibility,
        parentVisibleSummary: parentVisibleSummary.trim() || undefined,
      });

      router.push(`/staff/cases/${createdCase.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر إنشاء الإحالة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/staff/cases"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowRight className="size-4" />
          الرجوع للقضايا
        </Link>

        <header className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="size-4" /> إحالة طالب جديدة
          </div>
          <h1 className="mt-3 text-2xl font-bold">إنشاء قضية أو إحالة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            اختر السياق والطالب والمستلم من القوائم؛ تُحفظ المعرّفات داخليًا فقط.
          </p>
        </header>

        {error || visibleStudents.error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <p>{error ?? visibleStudents.error}</p>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
        >
          <div className="space-y-6">
            <SectionCard
              icon={Building2}
              title="سياق المدرسة والسنة"
              description="تتغير قائمة الطلاب والمحال إليهم تلقائيًا حسب المدرسة."
            >
              <div className="grid gap-4 md:grid-cols-3">
                <label>
                  <FieldLabel required>المدرسة</FieldLabel>
                  <select
                    value={schoolId}
                    onChange={(event) => setSchoolId(event.target.value)}
                    className={fieldClassName}
                    required
                  >
                    <option value="">اختر المدرسة</option>
                    {schoolOptions.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <FieldLabel required>السنة الدراسية</FieldLabel>
                  <select
                    value={academicYearId}
                    onChange={(event) => setAcademicYearId(event.target.value)}
                    className={fieldClassName}
                    required
                    disabled={!schoolId || loadingAcademicYears}
                  >
                    <option value="">
                      {loadingAcademicYears
                        ? "جاري تحميل السنوات..."
                        : "اختر السنة الدراسية"}
                    </option>
                    {academicYearOptions.map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.title || formatAcademicYearLabel(year.id)}
                        {year.isActive ? " · الحالية" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <FieldLabel required>الفصل الدراسي</FieldLabel>
                  <select
                    value={termId}
                    onChange={(event) => setTermId(event.target.value)}
                    className={fieldClassName}
                    required
                    disabled={loadingTerms || !academicYearId}
                  >
                    <option value="">
                      {loadingTerms
                        ? "جاري تحميل الفصول..."
                        : "اختر الفصل الدراسي"}
                    </option>
                    {termOptions.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.title}
                        {term.isCurrent ? " · الحالي" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </SectionCard>

            <SectionCard
              icon={User}
              title="بيانات الطالب"
              description="ابحث بالاسم أو الفصل، ثم اختر الطالب."
            >
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute right-3 top-3 size-5 text-muted-foreground" />
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  className={`${fieldClassName} pr-10`}
                  placeholder="ابحث عن طالب..."
                  disabled={!academicYearId}
                />
              </div>

              <label>
                <FieldLabel required>الطالب</FieldLabel>
                <select
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  className={fieldClassName}
                  required
                  disabled={visibleStudents.loading || !academicYearId}
                >
                  <option value="">
                    {visibleStudents.loading
                      ? "جاري تحميل الطلاب..."
                      : availableStudents.length
                        ? "اختر الطالب"
                        : "لا يوجد طلاب في هذا السياق"}
                  </option>
                  {availableStudents.map((student) => (
                    <option key={student.studentId} value={student.studentId}>
                      {student.displayName} · {student.classTitle}
                    </option>
                  ))}
                </select>
              </label>

              {selectedStudent ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">الطالب</span>
                    <p className="mt-1 font-medium">{selectedStudent.displayName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الفصل</span>
                    <p className="mt-1 font-medium">{selectedStudent.classTitle}</p>
                  </div>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              icon={FileText}
              title="تصنيف القضية"
              description="اختيار النوع يفتح لك مسار الإحالة والإجراءات المناسبة تلقائيًا."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <FieldLabel>نوع القضية</FieldLabel>
                  <select
                    value={caseTypeKey}
                    onChange={(event) => setCaseTypeKey(event.target.value)}
                    className={fieldClassName}
                  >
                    {CASE_TYPE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel>الأولوية</FieldLabel>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as StudentCasePriority)
                    }
                    className={fieldClassName}
                  >
                    {PRIORITY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </SectionCard>

            {isTeacherToVpBehaviorRoute ? (
              <SectionCard
                icon={ClipboardCheck}
                title="ملاحظات الإحالة: المعلم إلى الوكيل"
                description="إرشادات مختصرة قبل رفع الحالة السلوكية."
              >
                <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">الحالات:</strong>{" "}
                    سلوك متكرر، شغب، عدم احترام، استخدام الجوال أو مضاربة.
                  </li>
                  <li>
                    <strong className="text-foreground">قبل الإحالة:</strong>{" "}
                    توثيق الواقعات، إنذار شفهي، التواصل مع ولي الأمر، وتعزيز
                    إيجابي لمدة أسبوع إلى أسبوعين تقريبًا.
                  </li>
                  <li>
                    اكتب في وصف الإحالة الواقعة والإجراءات المتخذة وتاريخها،
                    ثم سلّمها للوكيل خلال 24 ساعة.
                  </li>
                  <li className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                    المضاربة أو الخطر المباشر يُحال فورًا ولا ينتظر مدة
                    المعالجة الصفية.
                  </li>
                </ul>
              </SectionCard>
            ) : null}

            {isTeacherToGuideHomeworkRoute ? (
              <SectionCard
                icon={ClipboardCheck}
                title="ملاحظات الإحالة: المعلم إلى الموجه الطلابي"
                description="عند عدم حل الواجبات أو استمرار الإهمال."
              >
                <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <li>
                    استدعِ الطالب وحدد السبب: أسري، نفسي، أو ضعف في الفهم.
                  </li>
                  <li>
                    نفّذ خطة علاجية: واجبات مخففة ومتابعة يومية لمدة أسبوعين.
                  </li>
                  <li>
                    أبلغ ولي الأمر هاتفيًا ووثّق التعهد والإجراءات في وصف
                    الإحالة.
                  </li>
                  <li>
                    إذا استمرت المشكلة بعد ذلك، أحل الطالب للموجه الطلابي
                    لدراسة الحالة.
                  </li>
                </ul>
              </SectionCard>
            ) : null}

            {isVpToGuideAttendanceRoute ? (
              <SectionCard
                icon={ClipboardCheck}
                title="متى يحول وكيل شؤون الطلاب الحالة للمرشد؟"
                description="مراحل التعامل مع الغياب حسب درجة المخالفة."
              >
                <div className="space-y-3 text-sm leading-7">
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="font-semibold text-foreground">
                      1. التنبيه — الدرجة الأولى، البند 1-3
                    </p>
                    <p className="text-muted-foreground">
                      غياب يوم واحد بدون عذر: تنبيه شفهي واتصال بولي الأمر،
                      ويعالجها الوكيل دون تحويل للمرشد.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="font-semibold text-foreground">
                      2. استدعاء ولي الأمر — الدرجة الثانية، البند 2-1
                    </p>
                    <p className="text-muted-foreground">
                      تكرار الغياب يومين: استدعاء ولي الأمر وتعهد خطي. إذا
                      تكرر بعد التعهد تُحال الحالة للمرشد.
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <p className="font-semibold text-foreground">
                      3. التحويل للمرشد — الدرجة الثالثة، البند 3-1
                    </p>
                    <p className="text-muted-foreground">
                      3 أيام متفرقة أو يومان متتاليان خلال الفصل: تحويل رسمي،
                      دراسة حالة، زيارة منزلية، خطة علاجية وإشراك لجنة التوجيه
                      والإرشاد.
                    </p>
                  </div>
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                    <p className="font-semibold text-foreground">
                      4. لجنة الانضباط — الدرجتان الرابعة والخامسة
                    </p>
                    <p className="text-muted-foreground">
                      استمرار الغياب 5 أيام فأكثر بعد تدخل المرشد: يرفع المرشد
                      تقريرًا ويحوّل الوكيل الحالة للجنة الانضباط المدرسية.
                    </p>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard icon={FileText} title="بيانات القضية">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2">
                  <FieldLabel required>عنوان القضية</FieldLabel>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className={fieldClassName}
                    placeholder="مثال: تكرار مخالفة سلوكية داخل الفصل"
                    required
                  />
                </label>
                <label className="md:col-span-2">
                  <FieldLabel required>وصف القضية</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-32 w-full resize-y rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="اكتب وصفًا واضحًا لما حدث..."
                    required
                  />
                </label>
              </div>
            </SectionCard>
          </div>

          <aside className="space-y-6">
            <SectionCard
              icon={UserCheck}
              title="الإحالة إلى"
              description={
                isTeacherToVpBehaviorRoute
                  ? "الوكيل هو الجهة المعتمدة لهذا المسار ويُحدد تلقائيًا."
                  : isTeacherToGuideHomeworkRoute
                    ? "الموجه الطلابي هو الجهة المعتمدة لهذا المسار ويُحدد تلقائيًا."
                    : isVpToGuideAttendanceRoute
                      ? "المرشد الطلابي هو الجهة المقترحة عند وصول الغياب لمرحلة التحويل."
                      : "تظهر فقط الجهات المخولة بمعالجة القضايا في المدرسة."
              }
            >
              <label>
                <FieldLabel required={hasGuidedReferralRoute}>
                  المحال إليه
                </FieldLabel>
                <select
                  value={assigneePersonId}
                  onChange={(event) => setAssigneePersonId(event.target.value)}
                  className={fieldClassName}
                  disabled={loadingRecipients || !schoolId}
                >
                  <option value="">
                    {loadingRecipients
                      ? "جاري تحميل المستلمين..."
                      : "بدون إحالة محددة"}
                  </option>
                  {recipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.personId}>
                      {recipient.displayName} · {recipient.roleLabel}
                      {hasGuidedReferralRoute &&
                      recipient.roleKey === recommendedRecipientRoleKey
                        ? " · مقترح"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </SectionCard>

            <SectionCard icon={UserCheck} title="ظهور ولي الأمر">
              <div className="space-y-4">
                <label>
                  <FieldLabel>مستوى الظهور</FieldLabel>
                  <select
                    value={parentVisibility}
                    onChange={(event) =>
                      setParentVisibility(
                        event.target.value as StudentCaseParentVisibility,
                      )
                    }
                    className={fieldClassName}
                  >
                    {PARENT_VISIBILITY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel>ملخص مناسب لولي الأمر</FieldLabel>
                  <textarea
                    value={parentVisibleSummary}
                    onChange={(event) => setParentVisibleSummary(event.target.value)}
                    className="min-h-24 w-full resize-y rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    placeholder="اختياري"
                  />
                </label>
              </div>
            </SectionCard>

            <Button type="submit" className="h-12 w-full" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              إنشاء الإحالة
            </Button>
          </aside>
        </form>
      </div>
    </main>
  );
}
