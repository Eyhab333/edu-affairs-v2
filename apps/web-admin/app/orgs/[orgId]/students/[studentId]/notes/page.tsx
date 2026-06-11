"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  MembershipRole,
  StudentNoteCategory,
  StudentNoteFollowUpStatus,
  StudentNotePriority,
  StudentNoteSchema,
  StudentNoteVisibility,
} from "@takween/contracts";
import {
  ArrowLeft,
  Archive,
  Loader2,
  Plus,
  Save,
  StickyNote,
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

type EnrollmentRow = {
  id: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId?: string;
  classId?: string;
  status?: string;
  startAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  title: string;
};

type GradeRow = {
  id: string;
  title: string;
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

type StudentNoteRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  enrollmentId?: string;
  gradeId?: string;
  classId?: string;

  category: string;
  priority: string;
  visibility: string;
  status: string;

  title?: string;
  body: string;

  recordedByPersonId: string;
  recordedByRoleKey?: string;
  recordedAt: number;

  followUpStatus?: string;
  followUpAt?: number;
  followUpByPersonId?: string;
  followUpNote?: string;

  linkedCaseId?: string;
  linkedAttendanceRecordId?: string;
  linkedTransportAttendanceRecordId?: string;
  linkedAssessmentRecordId?: string;
  linkedTrackerEntryId?: string;

  tags?: string[];

  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number;
  archivedByPersonId?: string;
  cancelledAt?: number;
  cancelledByPersonId?: string;
  cancelReason?: string;
};

type PageData = {
  student: StudentRow;
  person: PersonRow | null;
  school: SchoolRow | null;
  academicYear: AcademicYearRow | null;
  grade: GradeRow | null;
  classRow: ClassRow | null;
  enrollment: EnrollmentRow | null;
  notes: StudentNoteRow[];
  memberships: MembershipRow[];
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
      <div className="h-[720px] animate-pulse rounded-2xl bg-muted" />
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

  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
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

function getMembershipRoleKey(membership: MembershipRow | null) {
  const raw = String(membership?.roleKey || membership?.role || "").trim();

  if (
    MembershipRole.options.includes(
      raw as (typeof MembershipRole.options)[number]
    )
  ) {
    return raw as (typeof MembershipRole.options)[number];
  }

  return "";
}

function getCategoryLabel(value?: string) {
  switch (value) {
    case "GENERAL":
      return "عامة";
    case "EDUCATIONAL":
      return "تعليمية";
    case "BEHAVIORAL":
      return "سلوكية";
    case "ADMINISTRATIVE":
      return "إدارية";
    case "ATTENDANCE":
      return "حضور";
    case "TRANSPORT":
      return "نقل";
    case "GUARDIAN_COMMUNICATION":
      return "تواصل مع ولي الأمر";
    default:
      return value || "—";
  }
}

function getPriorityLabel(value?: string) {
  switch (value) {
    case "INFO":
      return "معلومة";
    case "FOLLOW_UP":
      return "تحتاج متابعة";
    case "IMPORTANT":
      return "مهمة";
    case "URGENT":
      return "عاجلة";
    default:
      return value || "—";
  }
}

function getVisibilityLabel(value?: string) {
  switch (value) {
    case "STAFF_ONLY":
      return "للطاقم فقط";
    case "SCHOOL_LEADERSHIP":
      return "للقيادة المدرسية";
    case "GUARDIAN_VISIBLE":
      return "تظهر لولي الأمر";
    default:
      return value || "—";
  }
}

function getFollowUpStatusLabel(value?: string) {
  switch (value) {
    case "NONE":
      return "لا توجد متابعة";
    case "NEEDED":
      return "تحتاج متابعة";
    case "DONE":
      return "تمت المتابعة";
    case "CANCELLED":
      return "ألغيت المتابعة";
    default:
      return value || "—";
  }
}

function getStatusLabel(value?: string) {
  switch (value) {
    case "ACTIVE":
      return "نشطة";
    case "ARCHIVED":
      return "مؤرشفة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "—";
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
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
  children: React.ReactNode;
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

export default function StudentNotesPage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] =
    useState<(typeof StudentNoteCategory.options)[number]>("GENERAL");
  const [priority, setPriority] =
    useState<(typeof StudentNotePriority.options)[number]>("INFO");
  const [visibility, setVisibility] =
    useState<(typeof StudentNoteVisibility.options)[number]>("STAFF_ONLY");
  const [followUpStatus, setFollowUpStatus] =
    useState<(typeof StudentNoteFollowUpStatus.options)[number]>("NONE");
  const [followUpAt, setFollowUpAt] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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

    const notesPromise = getDocs(
      query(
        collection(db, `orgs/${orgId}/studentNotes`),
        where("studentId", "==", studentId)
      )
    );

    const membershipsPromise = getDocs(
      query(collection(db, `orgs/${orgId}/memberships`))
    );

    const [personSnap, enrollmentsSnap, notesSnap, membershipsSnap] =
      await Promise.all([
        personPromise,
        enrollmentsPromise,
        notesPromise,
        membershipsPromise,
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

    const notes = notesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StudentNoteRow, "id">),
      }))
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0));

    const memberships = membershipsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<MembershipRow, "id">),
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
        notes,
        memberships,
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
          } as GradeRow)
        : null;

    const classRow =
      classSnap && "exists" in classSnap && classSnap.exists()
        ? ({
            id: classSnap.id,
            title: (classSnap.data() as { title?: string }).title ?? classSnap.id,
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
      notes,
      memberships,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPage,
      deps: [orgId, studentId],
    });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل ملاحظات الطالب");
  }, [error]);

  const activeNotes = useMemo(
    () =>
      (data?.notes ?? []).filter(
        (item) => item.status !== "ARCHIVED" && item.status !== "CANCELLED"
      ),
    [data?.notes]
  );

  const followUpNeededCount = activeNotes.filter(
    (item) => item.followUpStatus === "NEEDED"
  ).length;

  const importantCount = activeNotes.filter((item) =>
    ["IMPORTANT", "URGENT"].includes(item.priority)
  ).length;

  const guardianVisibleCount = activeNotes.filter(
    (item) => item.visibility === "GUARDIAN_VISIBLE"
  ).length;

  async function handleCreateNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!data?.enrollment) {
      toast.error("لا يوجد قيد دراسي نشط للطالب");
      return;
    }

    if (!data.school) {
      toast.error("لا توجد مدرسة مرتبطة بالقيد الحالي");
      return;
    }

    const cleanBody = body.trim();

    if (!cleanBody) {
      toast.error("اكتب نص الملاحظة أولًا");
      return;
    }

    if (followUpStatus === "NEEDED" && !followUpAt) {
      toast.error("حدد تاريخ المتابعة عند اختيار تحتاج متابعة");
      return;
    }

    const recorderMembership = pickRecorderMembership(
      data.memberships,
      user?.uid,
      data.enrollment.schoolId
    );

    if (!recorderMembership?.personId) {
      toast.error("تعذر تحديد الشخص الذي يسجل الملاحظة من العضوية الحالية");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const nowMs = Date.now();
      const docId = `student-note-${studentId}-${nowMs}`;
      const roleKey = getMembershipRoleKey(recorderMembership);
      const followUpAtMs = followUpAt ? new Date(followUpAt).getTime() : null;
      const tags = tagsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        id: docId,

        orgId,
        schoolId: data.enrollment.schoolId,
        academicYearId: data.enrollment.academicYearId,

        studentId,
        enrollmentId: data.enrollment.id || "",
        gradeId: data.enrollment.gradeId || "",
        classId: data.enrollment.classId || "",

        category,
        priority,
        visibility,
        status: "ACTIVE",

        title: title.trim(),
        body: cleanBody,

        recordedByPersonId: recorderMembership.personId,
        ...(roleKey ? { recordedByRoleKey: roleKey } : {}),
        recordedAt: nowMs,

        followUpStatus,
        ...(followUpAtMs ? { followUpAt: followUpAtMs } : {}),
        followUpByPersonId: "",
        followUpNote: "",

        linkedCaseId: "",
        linkedAttendanceRecordId: "",
        linkedTransportAttendanceRecordId: "",
        linkedAssessmentRecordId: "",
        linkedTrackerEntryId: "",

        tags,

        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = StudentNoteSchema.parse(payload);

      await setDoc(doc(db, `orgs/${orgId}/studentNotes/${docId}`), parsed);

      setTitle("");
      setBody("");
      setCategory("GENERAL");
      setPriority("INFO");
      setVisibility("STAFF_ONLY");
      setFollowUpStatus("NONE");
      setFollowUpAt("");
      setTagsText("");

      toast.success("تم حفظ الملاحظة");
      await reload();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ الملاحظة");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveNote(note: StudentNoteRow) {
    if (!data?.enrollment) return;

    const recorderMembership = pickRecorderMembership(
      data.memberships,
      user?.uid,
      data.enrollment.schoolId
    );

    setArchivingId(note.id);

    try {
      const nowMs = Date.now();

      await updateDoc(doc(db, `orgs/${orgId}/studentNotes/${note.id}`), {
        status: "ARCHIVED",
        archivedAt: nowMs,
        archivedByPersonId: recorderMembership?.personId || "",
        updatedAt: nowMs,
      });

      toast.success("تمت أرشفة الملاحظة");
      await reload();
    } catch {
      toast.error("تعذر أرشفة الملاحظة");
    } finally {
      setArchivingId(null);
    }
  }

  if (checkingAuth || loading) return <PageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="الملاحظات"
        badgeIcon={<StickyNote className="h-3.5 w-3.5" />}
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
        badge="الملاحظات"
        badgeIcon={<StickyNote className="h-3.5 w-3.5" />}
        title={data?.person?.displayName || data?.student.id || "الطالب"}
        description="ملاحظات تربوية وتعليمية وإدارية مرتبطة بالطالب."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى ملف الطالب
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="الملاحظات النشطة"
          value={activeNotes.length}
          hint="غير المؤرشفة وغير الملغاة"
        />
        <StatCard
          label="تحتاج متابعة"
          value={followUpNeededCount}
          hint="ملاحظات عليها إجراء لاحق"
        />
        <StatCard
          label="مهمة / عاجلة"
          value={importantCount}
          hint="أولوية مرتفعة"
        />
        <StatCard
          label="ظاهرة لولي الأمر"
          value={guardianVisibleCount}
          hint="قابلة للإظهار مستقبلًا في تطبيق ولي الأمر"
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
        description="بيانات القيد الدراسي الذي ستُربط به الملاحظة الجديدة."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          المدرسة:{" "}
          <span className="font-medium text-foreground">
            {data?.school?.name || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          السنة الدراسية:{" "}
          <span className="font-medium text-foreground">
            {data?.academicYear?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الصف:{" "}
          <span className="font-medium text-foreground">
            {data?.grade?.title || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          الفصل:{" "}
          <span className="font-medium text-foreground">
            {data?.classRow?.title || "—"}
          </span>
        </div>
      </FormSection>

      <FormSection
        title="إضافة ملاحظة"
        description="سجل ملاحظة عامة مستقلة على الطالب."
        contentClassName="space-y-4"
      >
        {!data?.enrollment ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            لا يوجد قيد دراسي نشط لهذا الطالب. يمكن عرض الملاحظات السابقة، لكن
            إضافة ملاحظة جديدة تحتاج قيدًا دراسيًا.
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <form onSubmit={handleCreateNote} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان مختصر</Label>
              <Input
                id="title"
                value={title}
                disabled={!data?.enrollment || saving}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثال: ملاحظة أثناء الحصة"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">وسوم اختيارية</Label>
              <Input
                id="tags"
                value={tagsText}
                disabled={!data?.enrollment || saving}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="افصل بين الوسوم بفاصلة"
              />
            </div>

            <SelectField
              id="category"
              label="التصنيف"
              value={category}
              disabled={!data?.enrollment || saving}
              onChange={(value) =>
                setCategory(value as (typeof StudentNoteCategory.options)[number])
              }
            >
              {StudentNoteCategory.options.map((item) => (
                <option key={item} value={item}>
                  {getCategoryLabel(item)}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="priority"
              label="الأولوية"
              value={priority}
              disabled={!data?.enrollment || saving}
              onChange={(value) =>
                setPriority(value as (typeof StudentNotePriority.options)[number])
              }
            >
              {StudentNotePriority.options.map((item) => (
                <option key={item} value={item}>
                  {getPriorityLabel(item)}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="visibility"
              label="الظهور"
              value={visibility}
              disabled={!data?.enrollment || saving}
              onChange={(value) =>
                setVisibility(
                  value as (typeof StudentNoteVisibility.options)[number]
                )
              }
            >
              {StudentNoteVisibility.options.map((item) => (
                <option key={item} value={item}>
                  {getVisibilityLabel(item)}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="followUpStatus"
              label="حالة المتابعة"
              value={followUpStatus}
              disabled={!data?.enrollment || saving}
              onChange={(value) => {
                const next =
                  value as (typeof StudentNoteFollowUpStatus.options)[number];
                setFollowUpStatus(next);
                if (next !== "NEEDED") setFollowUpAt("");
              }}
            >
              {StudentNoteFollowUpStatus.options.map((item) => (
                <option key={item} value={item}>
                  {getFollowUpStatusLabel(item)}
                </option>
              ))}
            </SelectField>

            <div className="space-y-2">
              <Label htmlFor="followUpAt">تاريخ المتابعة</Label>
              <Input
                id="followUpAt"
                type="date"
                value={followUpAt}
                disabled={
                  !data?.enrollment || saving || followUpStatus !== "NEEDED"
                }
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">نص الملاحظة</Label>
            <textarea
              id="body"
              value={body}
              disabled={!data?.enrollment || saving}
              onChange={(event) => setBody(event.target.value)}
              placeholder="اكتب الملاحظة هنا..."
              className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!data?.enrollment || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ الملاحظة
            </Button>
          </div>
        </form>
      </FormSection>

      <FormSection
        title="سجل الملاحظات"
        description="آخر الملاحظات المسجلة على الطالب."
        contentClassName="space-y-4"
      >
        {(data?.notes.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">لا توجد ملاحظات بعد</div>
            <div className="mt-1 text-sm text-muted-foreground">
              ابدأ بإضافة أول ملاحظة من النموذج أعلاه.
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.notes ?? []).map((note) => (
              <div key={note.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {note.title || getCategoryLabel(note.category)}
                      </h3>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                        {getCategoryLabel(note.category)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getPriorityLabel(note.priority)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getVisibilityLabel(note.visibility)}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {getStatusLabel(note.status)}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {note.body}
                    </p>

                    {note.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <div>تاريخ التسجيل: {formatDateTime(note.recordedAt)}</div>
                      <div>
                        المتابعة: {getFollowUpStatusLabel(note.followUpStatus)}
                      </div>
                      <div>
                        تاريخ المتابعة:{" "}
                        {note.followUpAt
                          ? formatDate(note.followUpAt)
                          : toDateInputValue(note.followUpAt) || "—"}
                      </div>
                    </div>
                  </div>

                  {note.status === "ACTIVE" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archivingId === note.id}
                      onClick={() => void handleArchiveNote(note)}
                    >
                      {archivingId === note.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      أرشفة
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}