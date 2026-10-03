"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, BookOpen, CalendarDays, GraduationCap, Loader2, LogOut, Pencil, RefreshCcw, Users } from "lucide-react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  studentIdentityUpdateErrorMessage,
  transferStudent,
  transferStudentErrorMessage,
  updateStudentIdentity,
} from "@/lib/student-management";
import { loadStudentProfile, type ResolvedEnrollment } from "@/lib/student-read-model";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import StatusBadge from "@/components/shared/StatusBadge";
import EndStudentEnrollmentDialog from "@/components/students/EndStudentEnrollmentDialog";
import ReEnrollStudentDialog from "@/components/students/ReEnrollStudentDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StudentPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
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

function EnrollmentDetails({ enrollment }: { enrollment: ResolvedEnrollment }) {
  const entries = [
    ["المدرسة", enrollment.labels.school],
    ["العام الدراسي", enrollment.labels.academicYear],
    ["المستوى", enrollment.labels.grade],
    ["المسار", enrollment.labels.stream],
    ["الفصل", enrollment.labels.className],
  ].filter(([, value]) => value);

  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-muted/45 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-medium text-foreground">{value}</div>
        </div>
      ))}
    </div>
  );
}

type IdentityFormValues = {
  displayName: string;
  nationalId: string;
  phone: string;
  email: string;
};

const identityFields: Array<keyof IdentityFormValues> = [
  "displayName",
  "nationalId",
  "phone",
  "email",
];

function createOperationId(prefix = "student-identity") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type FirestoreRecord = Record<string, unknown>;
type TransferSchoolOption = { id: string; label: string };
type TransferClassOption = { id: string; label: string; gradeLabel: string };

function readRecordString(data: FirestoreRecord, field: string) {
  const value = data[field];
  return typeof value === "string" ? value.trim() : "";
}

function labelForRecord(data: FirestoreRecord, fallback: string) {
  return (
    readRecordString(data, "title") ||
    readRecordString(data, "name") ||
    readRecordString(data, "code") ||
    fallback
  );
}

function isSelectableClass(data: FirestoreRecord) {
  return (
    data.isArchived !== true &&
    data.isActive !== false &&
    (!readRecordString(data, "status") || readRecordString(data, "status") === "ACTIVE")
  );
}

export default function StudentProfilePage() {
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;
  const { user, checkingAuth } = useRequireAuth();
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityFormValues>({
    displayName: "",
    nationalId: "",
    phone: "",
    email: "",
  });
  const [identityOperationId, setIdentityOperationId] = useState<string | null>(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaveError, setIdentitySaveError] = useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [targetSchoolId, setTargetSchoolId] = useState("");
  const [targetAcademicYearId, setTargetAcademicYearId] = useState("");
  const [targetAcademicYearLabel, setTargetAcademicYearLabel] = useState("");
  const [targetClassId, setTargetClassId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferOperationId, setTransferOperationId] = useState<string | null>(null);
  const [transferSchools, setTransferSchools] = useState<TransferSchoolOption[]>([]);
  const [transferClasses, setTransferClasses] = useState<TransferClassOption[]>([]);
  const [loadingTransferSchools, setLoadingTransferSchools] = useState(false);
  const [loadingTransferYear, setLoadingTransferYear] = useState(false);
  const [loadingTransferClasses, setLoadingTransferClasses] = useState(false);
  const [targetYearAvailable, setTargetYearAvailable] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferLoadError, setTransferLoadError] = useState<string | null>(null);
  const [transferSaveError, setTransferSaveError] = useState<string | null>(null);
  const [endEnrollmentDialogOpen, setEndEnrollmentDialogOpen] = useState(false);
  const [reEnrollDialogOpen, setReEnrollDialogOpen] = useState(false);

  const loadProfile = useCallback(
    () => loadStudentProfile({ db, orgId, studentId }),
    [orgId, studentId],
  );
  const { data, loading, error, notFound, reload } = useDocumentLoader({
    enabled: !!user,
    loader: loadProfile,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل ملف الطالب");
  }, [error]);

  useEffect(() => {
    if (!transferDialogOpen || !user) return;

    let active = true;
    setLoadingTransferSchools(true);
    setTransferLoadError(null);
    void getDocs(collection(db, `orgs/${orgId}/schools`))
      .then((snapshot) => {
        if (!active) return;
        setTransferSchools(
          snapshot.docs
            .filter((item) => (item.data() as FirestoreRecord).isArchived !== true)
            .map((item) => ({
              id: item.id,
              label: labelForRecord(item.data() as FirestoreRecord, item.id),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setTransferLoadError("تعذر تحميل المدارس المتاحة للنقل.");
      })
      .finally(() => {
        if (active) setLoadingTransferSchools(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, transferDialogOpen, user]);

  useEffect(() => {
    setTransferClasses([]);
    setTargetClassId("");
    setTargetYearAvailable(false);
    if (!transferDialogOpen || !targetSchoolId || !targetAcademicYearId) return;

    let active = true;
    setLoadingTransferYear(true);
    setTransferLoadError(null);
    void getDoc(
      doc(
        db,
        `orgs/${orgId}/schools/${targetSchoolId}/academicYears/${targetAcademicYearId}`,
      ),
    )
      .then((snapshot) => {
        if (!active) return;
        if (!snapshot.exists() || (snapshot.data() as FirestoreRecord).isActive === false) {
          setTargetAcademicYearLabel("");
          setTransferLoadError("العام الدراسي الحالي غير متاح في المدرسة المختارة.");
          return;
        }
        setTargetAcademicYearLabel(
          labelForRecord(snapshot.data() as FirestoreRecord, targetAcademicYearId),
        );
        setTargetYearAvailable(true);
      })
      .catch(() => {
        if (active) setTransferLoadError("تعذر تحميل العام الدراسي للمدرسة المختارة.");
      })
      .finally(() => {
        if (active) setLoadingTransferYear(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, targetAcademicYearId, targetSchoolId, transferDialogOpen]);

  useEffect(() => {
    if (
      !transferDialogOpen ||
      !targetSchoolId ||
      !targetAcademicYearId ||
      !targetYearAvailable
    ) {
      return;
    }

    let active = true;
    setLoadingTransferClasses(true);
    setTransferLoadError(null);
    const yearPath = `orgs/${orgId}/schools/${targetSchoolId}/academicYears/${targetAcademicYearId}`;
    void Promise.all([
      getDocs(collection(db, `${yearPath}/classes`)),
      getDocs(collection(db, `${yearPath}/grades`)),
    ])
      .then(([classesSnapshot, gradesSnapshot]) => {
        if (!active) return;
        const gradeLabels = new Map(
          gradesSnapshot.docs.map((item) => [
            item.id,
            labelForRecord(item.data() as FirestoreRecord, item.id),
          ]),
        );
        setTransferClasses(
          classesSnapshot.docs
            .filter((item) => isSelectableClass(item.data() as FirestoreRecord))
            .map((item) => {
              const classData = item.data() as FirestoreRecord;
              const title = labelForRecord(classData, item.id);
              const sectionLabel = readRecordString(classData, "sectionLabel");
              const gradeId = readRecordString(classData, "gradeId");
              return {
                id: item.id,
                label:
                  sectionLabel && sectionLabel !== title
                    ? `${title} - ${sectionLabel}`
                    : title,
                gradeLabel: gradeId ? gradeLabels.get(gradeId) || gradeId : "",
              };
            })
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setTransferLoadError("تعذر تحميل الفصول المتاحة للنقل.");
      })
      .finally(() => {
        if (active) setLoadingTransferClasses(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, targetAcademicYearId, targetSchoolId, targetYearAvailable, transferDialogOpen]);

  const openIdentityEditor = () => {
    if (!data?.student || data.student.isArchived) return;

    setIdentityForm({
      displayName: data.student.displayName,
      nationalId: data.student.nationalId,
      phone: data.student.phone,
      email: data.student.email,
    });
    setIdentityOperationId(createOperationId());
    setIdentitySaveError(null);
    setIdentityDialogOpen(true);
  };

  const handleIdentityDialogOpenChange = (open: boolean) => {
    if (!open && identitySaving) return;

    setIdentityDialogOpen(open);
    if (!open) {
      setIdentitySaveError(null);
      setIdentityOperationId(null);
    }
  };

  const selectedTransferClass = useMemo(
    () => transferClasses.find((item) => item.id === targetClassId) ?? null,
    [targetClassId, transferClasses],
  );

  const openTransferDialog = () => {
    const currentEnrollment = data?.currentEnrollment;
    if (!data?.student || data.student.isArchived || !currentEnrollment) return;

    setTargetSchoolId(currentEnrollment.schoolId);
    setTargetAcademicYearId(currentEnrollment.academicYearId);
    setTargetAcademicYearLabel(currentEnrollment.labels.academicYear);
    setTargetClassId("");
    setTransferClasses([]);
    setTargetYearAvailable(false);
    setTransferReason("");
    setTransferOperationId(createOperationId("student-transfer"));
    setTransferLoadError(null);
    setTransferSaveError(null);
    setTransferDialogOpen(true);
  };

  const handleTransferDialogOpenChange = (open: boolean) => {
    if (!open && transferSaving) return;

    setTransferDialogOpen(open);
    if (!open) {
      setTransferSaveError(null);
      setTransferLoadError(null);
      setTransferOperationId(null);
    }
  };

  const handleTransferSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.student || !data.currentEnrollment || transferSaving) return;

    const reason = transferReason.trim();
    if (!targetSchoolId || !targetAcademicYearId || !targetClassId || !reason) {
      setTransferSaveError("أكمل بيانات النقل المطلوبة.");
      return;
    }

    setTransferSaving(true);
    setTransferSaveError(null);
    try {
      const operationId = transferOperationId ?? createOperationId("student-transfer");
      if (!transferOperationId) setTransferOperationId(operationId);

      const result = await transferStudent({
        orgId,
        studentId,
        target: {
          schoolId: targetSchoolId,
          academicYearId: targetAcademicYearId,
          classId: targetClassId,
        },
        transferReason: reason,
        operationId,
      });

      await reload();
      setTransferDialogOpen(false);
      setTransferSaveError(null);
      setTransferOperationId(null);
      toast.success(
        result.noChange
          ? "الطالب موجود بالفعل في الفصل المحدد."
          : "تم نقل الطالب بنجاح.",
      );
    } catch (saveError) {
      const message = transferStudentErrorMessage(saveError);
      setTransferSaveError(message);
      toast.error(message);
    } finally {
      setTransferSaving(false);
    }
  };

  const updateIdentityField = (field: keyof IdentityFormValues, value: string) => {
    setIdentityForm((current) => ({ ...current, [field]: value }));
  };

  const handleIdentitySave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!data?.student || identitySaving) return;

    const values: IdentityFormValues = {
      displayName: identityForm.displayName.trim(),
      nationalId: identityForm.nationalId.trim(),
      phone: identityForm.phone.trim(),
      email: identityForm.email.trim(),
    };

    if (!values.displayName) {
      setIdentitySaveError("الاسم مطلوب.");
      return;
    }

    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setIdentitySaveError("صيغة البريد الإلكتروني غير صحيحة.");
      return;
    }

    const current: IdentityFormValues = {
      displayName: data.student.displayName,
      nationalId: data.student.nationalId,
      phone: data.student.phone,
      email: data.student.email,
    };
    const changes: Partial<IdentityFormValues> = {};

    identityFields.forEach((field) => {
      if (values[field] !== current[field]) {
        changes[field] = values[field];
      }
    });

    if (Object.keys(changes).length === 0) {
      toast.info("لا توجد تغييرات لحفظها.");
      handleIdentityDialogOpenChange(false);
      return;
    }

    setIdentitySaving(true);
    setIdentitySaveError(null);

    try {
      const operationId = identityOperationId ?? createOperationId();
      if (!identityOperationId) setIdentityOperationId(operationId);

      const result = await updateStudentIdentity({
        orgId,
        studentId,
        changes,
        operationId,
      });

      await reload();
      setIdentityDialogOpen(false);
      setIdentitySaveError(null);
      setIdentityOperationId(null);
      toast.success(
        result.noChange ? "لم تتغير بيانات هوية الطالب." : "تم تحديث بيانات هوية الطالب.",
      );
    } catch (saveError) {
      const message = studentIdentityUpdateErrorMessage(saveError);
      setIdentitySaveError(message);
      toast.error(message);
    } finally {
      setIdentitySaving(false);
    }
  };

  if (checkingAuth || loading) return <StudentPageSkeleton />;

  if (notFound) {
    return (
      <PageHero
        badge="ملف الطالب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد يكون الطالب غير موجود داخل المؤسسة الحالية."
        actions={<Button asChild variant="outline"><Link href={`/orgs/${orgId}/students`}><ArrowLeft className="h-4 w-4" />العودة إلى الطلاب</Link></Button>}
      />
    );
  }

  const currentEnrollment = data?.currentEnrollment ?? null;
  const activeEnrollmentCount = data?.activeEnrollmentCount ?? 0;
  const canManageCurrentEnrollment =
    !!currentEnrollment &&
    activeEnrollmentCount === 1 &&
    data?.student.isArchived !== true;
  const canReEnroll =
    activeEnrollmentCount === 0 && data?.student.isArchived !== true;

  return (
    <div className="space-y-6">
      <PageHero
        badge="ملف الطالب"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={data?.student.displayName ?? "الطالب"}
        description="عرض الهوية والقيود الدراسية التشغيلية الحالية والسابقة."
        actions={<Button asChild variant="outline"><Link href={`/orgs/${orgId}/students`}><ArrowLeft className="h-4 w-4" />العودة إلى الطلاب</Link></Button>}
      />

      {error ? (
        <FormSection title="حدث خطأ" description="تعذر تحميل البيانات المطلوبة." contentClassName="space-y-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
          <Button variant="outline" onClick={() => void reload()}>إعادة المحاولة</Button>
        </FormSection>
      ) : null}

      <FormSection title="هوية الطالب" description="بيانات الهوية من سجل الشخص المرتبط بالطالب." contentClassName="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">تُحفظ التعديلات في سجل الشخص المرتبط بالطالب.</p>
          <Button
            type="button"
            variant="outline"
            onClick={openIdentityEditor}
            disabled={!data?.student || data.student.isArchived}
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
        </div>
        {data?.student.isArchived ? (
          <p className="text-sm text-muted-foreground">لا يمكن تعديل هوية سجل طالب مؤرشف.</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="الاسم" value={data?.student.displayName ?? "—"} />
          <InfoCard label="رقم الهوية" value={data?.student.nationalId || "—"} />
          <InfoCard label="حالة سجل الطالب" value={data?.student.isArchived ? "مؤرشف" : "غير مؤرشف"} />
          <InfoCard label="رقم الجوال" value={data?.student.phone || "—"} />
          <InfoCard label="البريد الإلكتروني" value={data?.student.email || "—"} />
        </div>
        <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">studentId: </span><code dir="ltr" className="break-all text-xs">{data?.student.id}</code></div>
          <div><span className="text-muted-foreground">personId: </span><code dir="ltr" className="break-all text-xs">{data?.student.personId || "—"}</code></div>
        </div>
      </FormSection>

      <FormSection title="القيد الحالي" description="يُعرض القيد ذو الحالة ACTIVE، مع تفضيل القيد في السنة الدراسية المعلَّمة كنشطة." contentClassName="space-y-4">
        {currentEnrollment ? (
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><GraduationCap className="h-5 w-5" /></div><div><p className="font-semibold">القيد النشط</p><p className="text-sm text-muted-foreground">بدأ في {formatDate(currentEnrollment.startAt)}</p></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge activeText={enrollmentStatusLabel(currentEnrollment.status)} />
                {canManageCurrentEnrollment ? (
                  <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openTransferDialog}
                  disabled={data?.student.isArchived}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  نقل الطالب
                </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEndEnrollmentDialogOpen(true)}
                    >
                      <LogOut className="h-4 w-4" />
                      إنهاء القيد
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <EnrollmentDetails enrollment={currentEnrollment} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
            <BookOpen className="h-7 w-7 text-muted-foreground" />
            <div><p className="font-medium">لا يوجد قيد نشط حاليًا</p><p className="mt-1 text-sm text-muted-foreground">تبقى القيود السابقة ظاهرة في السجل أدناه.</p></div>
            {canReEnroll ? (
              <Button type="button" onClick={() => setReEnrollDialogOpen(true)}>
                <RefreshCcw className="h-4 w-4" />
                إعادة قيد الطالب
              </Button>
            ) : null}
          </div>
        )}
      </FormSection>

      <FormSection title="سجل القيود الدراسية" description="جميع القيود التشغيلية المعتمدة لهذا الطالب، مرتبة من الأحدث إلى الأقدم." contentClassName="space-y-4">
        {data?.activeEnrollmentCount && data.activeEnrollmentCount > 1 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            يوجد أكثر من قيد نشط لهذا الطالب؛ يعرض القسم السابق القيد في السنة النشطة أو الأحدث.
          </div>
        ) : null}

        {(data?.enrollmentHistory.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
            <div><p className="font-medium">لا توجد قيود دراسية</p><p className="mt-1 text-sm text-muted-foreground">لم يُعثر على أي قيد تشغيلي مرتبط بهذا الطالب.</p></div>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader><TableRow><TableHead>المدرسة</TableHead><TableHead>العام الدراسي</TableHead><TableHead>المستوى</TableHead><TableHead>الفصل</TableHead><TableHead>الحالة</TableHead><TableHead>البداية</TableHead><TableHead>النهاية</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.enrollmentHistory.map((enrollment) => <TableRow key={enrollment.id}>
                    <TableCell>{enrollment.labels.school}</TableCell>
                    <TableCell>{enrollment.labels.academicYear}</TableCell>
                    <TableCell>{enrollment.labels.grade || "—"}</TableCell>
                    <TableCell>{enrollment.labels.className || "—"}</TableCell>
                    <TableCell><StatusBadge archived={enrollment.status !== "ACTIVE"} activeText={enrollmentStatusLabel(enrollment.status)} archivedText={enrollmentStatusLabel(enrollment.status)} /></TableCell>
                    <TableCell>{formatDate(enrollment.startAt)}</TableCell>
                    <TableCell>{formatDate(enrollment.endAt)}</TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {data?.enrollmentHistory.map((enrollment) => <div key={enrollment.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{enrollment.labels.school}</p><p className="mt-1 text-sm text-muted-foreground">{enrollment.labels.academicYear}</p></div><StatusBadge archived={enrollment.status !== "ACTIVE"} activeText={enrollmentStatusLabel(enrollment.status)} archivedText={enrollmentStatusLabel(enrollment.status)} /></div>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground"><span>{[enrollment.labels.grade, enrollment.labels.stream, enrollment.labels.className].filter(Boolean).join(" — ") || "—"}</span><span>البداية: {formatDate(enrollment.startAt)}</span>{enrollment.endAt ? <span>النهاية: {formatDate(enrollment.endAt)}</span> : null}</div>
              </div>)}
            </div>
          </>
        )}
      </FormSection>

      <Dialog open={identityDialogOpen} onOpenChange={handleIdentityDialogOpenChange}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!identitySaving}>
          <DialogHeader>
            <DialogTitle>تعديل بيانات الطالب</DialogTitle>
            <DialogDescription>
              تُحدّث هذه العملية الهوية الأساسية في سجل الشخص المرتبط بالطالب فقط.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleIdentitySave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-display-name">الاسم</Label>
              <Input
                id="student-display-name"
                value={identityForm.displayName}
                onChange={(event) => updateIdentityField("displayName", event.target.value)}
                disabled={identitySaving}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-national-id">رقم الهوية</Label>
                <Input
                  id="student-national-id"
                  value={identityForm.nationalId}
                  onChange={(event) => updateIdentityField("nationalId", event.target.value)}
                  disabled={identitySaving}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-phone">رقم الجوال</Label>
                <Input
                  id="student-phone"
                  type="tel"
                  value={identityForm.phone}
                  onChange={(event) => updateIdentityField("phone", event.target.value)}
                  disabled={identitySaving}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-email">البريد الإلكتروني</Label>
              <Input
                id="student-email"
                type="email"
                value={identityForm.email}
                onChange={(event) => updateIdentityField("email", event.target.value)}
                disabled={identitySaving}
                dir="ltr"
              />
            </div>

            {identitySaveError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {identitySaveError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleIdentityDialogOpenChange(false)}
                disabled={identitySaving}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={identitySaving}>
                {identitySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={handleTransferDialogOpenChange}>
        <DialogContent className="sm:max-w-xl" showCloseButton={!transferSaving}>
          <DialogHeader>
            <DialogTitle>نقل الطالب</DialogTitle>
            <DialogDescription>
              يُغلق القيد الحالي ويُنشئ قيدًا نشطًا جديدًا في العام الدراسي نفسه.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTransferSave} className="space-y-5">
            <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
              <div>
                <p className="font-medium">القيد الحالي</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  تُعرض بيانات القيد الحالي للمرجعية فقط.
                </p>
              </div>
              {data?.currentEnrollment ? (
                <EnrollmentDetails enrollment={data.currentEnrollment} />
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transfer-school">المدرسة الجديدة</Label>
                <select
                  id="transfer-school"
                  value={targetSchoolId}
                  onChange={(event) => setTargetSchoolId(event.target.value)}
                  disabled={loadingTransferSchools || transferSaving}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    {loadingTransferSchools ? "جارٍ تحميل المدارس..." : "اختر المدرسة"}
                  </option>
                  {transferSchools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer-academic-year">العام الدراسي</Label>
                <Input
                  id="transfer-academic-year"
                  value={
                    loadingTransferYear
                      ? "جارٍ تحميل العام الدراسي..."
                      : targetAcademicYearLabel || "غير متاح"
                  }
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  النقل متاح داخل العام الدراسي الحالي فقط.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="transfer-class">الفصل الجديد</Label>
                <select
                  id="transfer-class"
                  value={targetClassId}
                  onChange={(event) => setTargetClassId(event.target.value)}
                  disabled={
                    !targetYearAvailable || loadingTransferClasses || transferSaving
                  }
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    {loadingTransferClasses ? "جارٍ تحميل الفصول..." : "اختر الفصل"}
                  </option>
                  {transferClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedTransferClass?.gradeLabel ? (
              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
                المستوى: {" "}
                <span className="font-medium">{selectedTransferClass.gradeLabel}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="transfer-reason">سبب النقل</Label>
              <Input
                id="transfer-reason"
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
                disabled={transferSaving}
                maxLength={1000}
                required
              />
            </div>

            {transferLoadError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {transferLoadError}
              </p>
            ) : null}
            {transferSaveError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {transferSaveError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleTransferDialogOpenChange(false)}
                disabled={transferSaving}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={
                  transferSaving ||
                  !!transferLoadError ||
                  !targetYearAvailable
                }
              >
                {transferSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                تأكيد النقل
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {currentEnrollment && canManageCurrentEnrollment ? (
        <EndStudentEnrollmentDialog
          enrollment={currentEnrollment}
          open={endEnrollmentDialogOpen}
          orgId={orgId}
          studentId={studentId}
          onOpenChange={setEndEnrollmentDialogOpen}
          onSucceeded={() => reload()}
        />
      ) : null}

      {canReEnroll ? (
        <ReEnrollStudentDialog
          open={reEnrollDialogOpen}
          orgId={orgId}
          studentId={studentId}
          onOpenChange={setReEnrollDialogOpen}
          onSucceeded={() => reload()}
        />
      ) : null}
    </div>
  );
}
