"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, UserPlus } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  createStudent,
  createStudentErrorMessage,
} from "@/lib/student-management";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FirestoreRecord = Record<string, unknown>;

type SchoolOption = { id: string; label: string };
type AcademicYearOption = { id: string; label: string };
type ClassOption = { id: string; label: string; gradeLabel: string };

function readString(data: FirestoreRecord, field: string) {
  const value = data[field];
  return typeof value === "string" ? value.trim() : "";
}

function labelFor(data: FirestoreRecord, fallback: string) {
  return (
    readString(data, "title") ||
    readString(data, "name") ||
    readString(data, "code") ||
    fallback
  );
}

function isActiveClass(data: FirestoreRecord) {
  return (
    data.isArchived !== true &&
    data.isActive !== false &&
    (!readString(data, "status") || readString(data, "status") === "ACTIVE")
  );
}

function createOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `create-student-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function NewStudentPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { user, checkingAuth } = useRequireAuth();

  const [displayName, setDisplayName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [operationId] = useState(createOperationId);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;
    setLoadingSchools(true);
    setLoadError("");

    void getDocs(collection(db, `orgs/${orgId}/schools`))
      .then((snapshot) => {
        if (!active) return;
        setSchools(
          snapshot.docs
            .filter((item) => (item.data() as FirestoreRecord).isArchived !== true)
            .map((item) => ({
              id: item.id,
              label: labelFor(item.data() as FirestoreRecord, item.id),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setLoadError("تعذر تحميل المدارس المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingSchools(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, user]);

  useEffect(() => {
    setAcademicYears([]);
    setAcademicYearId("");
    setClasses([]);
    setClassId("");
    if (!schoolId) return;

    let active = true;
    setLoadingAcademicYears(true);
    setLoadError("");

    void getDocs(
      collection(db, `orgs/${orgId}/schools/${schoolId}/academicYears`),
    )
      .then((snapshot) => {
        if (!active) return;
        setAcademicYears(
          snapshot.docs
            .filter((item) => (item.data() as FirestoreRecord).isActive !== false)
            .map((item) => ({
              id: item.id,
              label: labelFor(item.data() as FirestoreRecord, item.id),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setLoadError("تعذر تحميل الأعوام الدراسية المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingAcademicYears(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, schoolId]);

  useEffect(() => {
    setClasses([]);
    setClassId("");
    if (!schoolId || !academicYearId) return;

    let active = true;
    setLoadingClasses(true);
    setLoadError("");
    const basePath = `orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}`;

    void Promise.all([
      getDocs(collection(db, `${basePath}/classes`)),
      getDocs(collection(db, `${basePath}/grades`)),
    ])
      .then(([classesSnapshot, gradesSnapshot]) => {
        if (!active) return;
        const gradeLabels = new Map(
          gradesSnapshot.docs.map((item) => [
            item.id,
            labelFor(item.data() as FirestoreRecord, item.id),
          ]),
        );
        setClasses(
          classesSnapshot.docs
            .filter((item) => isActiveClass(item.data() as FirestoreRecord))
            .map((item) => {
              const data = item.data() as FirestoreRecord;
              const title = labelFor(data, item.id);
              const sectionLabel = readString(data, "sectionLabel");
              const gradeId = readString(data, "gradeId");
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
        if (active) setLoadError("تعذر تحميل الفصول المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });

    return () => {
      active = false;
    };
  }, [academicYearId, orgId, schoolId]);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === classId) ?? null,
    [classId, classes],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const identity = {
      displayName: displayName.trim(),
      nationalId: nationalId.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };

    if (!identity.displayName || !identity.nationalId || !schoolId || !academicYearId || !classId) {
      setSaveError("أكمل بيانات الطالب والموضع الدراسي المطلوب.");
      return;
    }
    if (identity.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) {
      setSaveError("صيغة البريد الإلكتروني غير صحيحة.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const result = await createStudent({
        orgId,
        identity,
        placement: { schoolId, academicYearId, classId },
        operationId,
      });
      toast.success("تم إنشاء الطالب وقيده الدراسي بنجاح.");
      router.push(`/orgs/${orgId}/students/${result.studentId}`);
      router.refresh();
    } catch (error) {
      const message = createStudentErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="إضافة طالب"
        badgeIcon={<UserPlus className="h-3.5 w-3.5" />}
        title="إضافة طالب"
        description="إنشاء الطالب وقيده الدراسي الأول عبر الخدمة الإدارية المعتمدة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى الطلاب
            </Link>
          </Button>
        }
      />

      <form className="space-y-6" onSubmit={handleSubmit}>
        <FormSection
          title="بيانات الطالب"
          description="تُحفظ الهوية والسجل الدراسي معًا عند نجاح العملية."
          contentClassName="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="display-name">الاسم</label>
              <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="national-id">رقم الهوية</label>
              <Input id="national-id" value={nationalId} onChange={(event) => setNationalId(event.target.value)} required dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="phone">رقم الجوال</label>
              <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">البريد الإلكتروني</label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="القيد الدراسي الأول"
          description="اختر المدرسة ثم العام الدراسي ثم الفصل. المستوى يُستنتج من الفصل المعتمد."
          contentClassName="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="school">المدرسة</label>
              <select id="school" value={schoolId} onChange={(event) => setSchoolId(event.target.value)} disabled={loadingSchools} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">{loadingSchools ? "جارٍ تحميل المدارس..." : "اختر المدرسة"}</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="academic-year">العام الدراسي</label>
              <select id="academic-year" value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)} disabled={!schoolId || loadingAcademicYears} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">{loadingAcademicYears ? "جارٍ تحميل الأعوام..." : "اختر العام الدراسي"}</option>
                {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="class">الفصل</label>
              <select id="class" value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!academicYearId || loadingClasses} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">{loadingClasses ? "جارٍ تحميل الفصول..." : "اختر الفصل"}</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
          </div>

          {selectedClass?.gradeLabel ? (
            <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
              المستوى: <span className="font-medium">{selectedClass.gradeLabel}</span>
            </div>
          ) : null}
        </FormSection>

        {loadError ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{loadError}</div> : null}
        {saveError ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</div> : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !!loadError}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "جارٍ الحفظ..." : "حفظ الطالب"}
          </Button>
        </div>
      </form>
    </div>
  );
}
