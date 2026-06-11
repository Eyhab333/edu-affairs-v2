"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, Save } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
} from "firebase/firestore";
import {
  EnrollmentStatus,
  SchoolType,
  StudentEnrollmentSchema,
} from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = "PRIMARY" | "KG";

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: SchoolTypeValue;
  };
};

type YearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type LabelRow = {
  id: string;
  schoolId: string;
  yearId: string;
  title: string;
  gradeId?: string;
  streamId?: string;
};

type PageData = {
  student: {
    id: string;
    personId: string;
  };
  person: {
    id: string;
    displayName?: string;
  };
  schools: SchoolRow[];
  years: YearRow[];
  grades: LabelRow[];
  streams: LabelRow[];
  classes: LabelRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewEnrollmentPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] =
    useState<(typeof EnrollmentStatus.options)[number]>("ACTIVE");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);

    const [studentSnap, schoolsSnap] = await Promise.all([
      getDoc(studentRef),
      getDocs(query(schoolsRef)),
    ]);

    if (!studentSnap.exists()) {
      return null;
    }

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as { personId: string }),
    };

    const personRef = doc(db, `orgs/${orgId}/people/${student.personId}`);
    const personSnap = await getDoc(personRef);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(
          db,
          `orgs/${orgId}/schools/${school.id}/academicYears`
        );

        const yearsSnap = await getDocs(yearsRef);

        return yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));
      })
    );

    const years = yearsNested.flat();

    const labelsNested = await Promise.all(
      years.map(async (year) => {
        const gradesRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/grades`
        );

        const streamsRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/streams`
        );

        const classesRef = collection(
          db,
          `orgs/${orgId}/schools/${year.schoolId}/academicYears/${year.id}/classes`
        );

        const [gradesSnap, streamsSnap, classesSnap] = await Promise.all([
          getDocs(gradesRef),
          getDocs(streamsRef),
          getDocs(classesRef),
        ]);

        return {
          grades: gradesSnap.docs.map((item) => ({
            id: item.id,
            schoolId: year.schoolId,
            yearId: year.id,
            title: (item.data() as { title?: string }).title ?? item.id,
          })),
          streams: streamsSnap.docs.map((item) => ({
            id: item.id,
            schoolId: year.schoolId,
            yearId: year.id,
            title: (item.data() as { title?: string }).title ?? item.id,
          })),
          classes: classesSnap.docs.map((item) => {
            const classRow = item.data() as {
              title?: string;
              gradeId?: string;
              streamId?: string;
            };

            return {
              id: item.id,
              schoolId: year.schoolId,
              yearId: year.id,
              title: classRow.title ?? item.id,
              gradeId: classRow.gradeId ?? "",
              streamId: classRow.streamId ?? "",
            };
          }),
        };
      })
    );

    return {
      student,
      person: personSnap.exists()
        ? ({
            id: personSnap.id,
            ...(personSnap.data() as { displayName?: string }),
          } as PageData["person"])
        : {
            id: student.personId,
            displayName: student.personId,
          },
      schools,
      years,
      grades: labelsNested.flatMap((item) => item.grades),
      streams: labelsNested.flatMap((item) => item.streams),
      classes: labelsNested.flatMap((item) => item.classes),
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadSummary,
    deps: [orgId, studentId],
  });

  const selectedSchoolType = useMemo<SchoolTypeValue>(() => {
    const school = (data?.schools ?? []).find((item) => item.id === schoolId);
    const parsed = SchoolType.safeParse(school?.profile?.schoolType);

    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.schools, schoolId]);

  const yearOptions = useMemo(() => {
    return (data?.years ?? []).filter((item) => item.schoolId === schoolId);
  }, [data?.years, schoolId]);

  const gradeOptions = useMemo(() => {
    return (data?.grades ?? []).filter((item) => {
      if (item.schoolId !== schoolId) return false;
      if (item.yearId !== academicYearId) return false;

      return true;
    });
  }, [data?.grades, schoolId, academicYearId]);

  const streamOptions = useMemo(() => {
    return (data?.streams ?? []).filter((item) => {
      if (item.schoolId !== schoolId) return false;
      if (item.yearId !== academicYearId) return false;

      return true;
    });
  }, [data?.streams, schoolId, academicYearId]);

  const classOptions = useMemo(() => {
    return (data?.classes ?? []).filter((item) => {
      if (item.schoolId !== schoolId) return false;
      if (item.yearId !== academicYearId) return false;
      if (gradeId && item.gradeId !== gradeId) return false;

      if (
        selectedSchoolType === "PRIMARY" &&
        streamId &&
        item.streamId !== streamId
      ) {
        return false;
      }

      return true;
    });
  }, [
    data?.classes,
    schoolId,
    academicYearId,
    gradeId,
    streamId,
    selectedSchoolType,
  ]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("enrollment");
      const nowMs = Date.now();

      const payload = {
        id,
        orgId,
        schoolId,
        academicYearId,
        studentId,
        gradeId: gradeId || undefined,
        streamId: selectedSchoolType === "PRIMARY" ? streamId || "" : "",
        classId: classId || undefined,
        status,
        startAt: new Date(startAt).getTime(),
        endAt: endAt ? new Date(endAt).getTime() : undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = StudentEnrollmentSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(
        doc(
          db,
          `orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}/studentEnrollments/${id}`
        ),
        parsed.data
      );

      toast.success("تم إنشاء القيد الدراسي بنجاح");
      router.push(`/orgs/${orgId}/students/${studentId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء القيد الدراسي");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="إضافة قيد"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="تعذر العثور على الطالب"
        description="قد يكون الطالب غير موجود."
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
        badge="إضافة قيد"
        badgeIcon={<BookOpen className="h-3.5 w-3.5" />}
        title="إضافة قيد دراسي"
        description={`الطالب: ${data?.person.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="بيانات القيد"
        description="اختر المدرسة والسنة ثم الصف/المسار/الفصل."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">المدرسة</label>
            <select
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setAcademicYearId("");
                setGradeId("");
                setStreamId("");
                setClassId("");
              }}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {(data?.schools ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">السنة الدراسية</label>
            <select
              value={academicYearId}
              onChange={(e) => {
                setAcademicYearId(e.target.value);
                setGradeId("");
                setStreamId("");
                setClassId("");
              }}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {yearOptions.map((item) => (
                <option key={`${item.schoolId}:${item.id}`} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {selectedSchoolType === "PRIMARY" ? "الصف" : "المستوى"}
            </label>
            <select
              value={gradeId}
              onChange={(e) => {
                setGradeId(e.target.value);
                setClassId("");
              }}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {gradeOptions.map((item) => (
                <option
                  key={`${item.schoolId}:${item.yearId}:grade:${item.id}`}
                  value={item.id}
                >
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {selectedSchoolType === "PRIMARY" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">المسار</label>
              <select
                value={streamId}
                onChange={(e) => {
                  setStreamId(e.target.value);
                  setClassId("");
                }}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">بدون</option>
                {streamOptions.map((item) => (
                  <option
                    key={`${item.schoolId}:${item.yearId}:stream:${item.id}`}
                    value={item.id}
                  >
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">الفصل</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {classOptions.map((item) => (
                <option
                  key={`${item.schoolId}:${item.yearId}:class:${item.id}`}
                  value={item.id}
                >
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as (typeof EnrollmentStatus.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {EnrollmentStatus.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">تاريخ البداية</label>
            <Input
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">تاريخ النهاية</label>
            <Input
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
      </FormSection>
    </div>
  );
}