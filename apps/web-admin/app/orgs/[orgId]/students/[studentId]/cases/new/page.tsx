"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  ShieldAlert,
} from "lucide-react";
import {
  CasePriority,
  StudentCaseLogEntrySchema,
  StudentCaseOriginKind,
  StudentCaseRoutingEventSchema,
  StudentCaseSchema,
} from "@takween/contracts";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PersonRow = {
  id: string;
  displayName?: string;
};

type StudentRow = {
  id: string;
  personId: string;
};

type EnrollmentRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId?: string;
  classId?: string;
  status: string;
  startAt: number;
};

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: "PRIMARY" | "KG";
  };
};

type YearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type ClassRow = {
  id: string;
  title: string;
};

type CaseTypeRow = {
  id: string;
  title: string;
  schoolType: "PRIMARY" | "KG";
  defaultOwnerRoleKey: string;
  isActive?: boolean;
};

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  scopeType?: string;
  scopeId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };
  isActive?: boolean;
};

type PageData = {
  student: StudentRow;
  person: PersonRow;
  schools: SchoolRow[];
  years: YearRow[];
  classes: ClassRow[];
  enrollments: EnrollmentRow[];
  caseTypes: CaseTypeRow[];
  memberships: MembershipRow[];
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatEnrollmentLabel(args: {
  enrollment: EnrollmentRow;
  schoolMap: Map<string, string>;
  yearMap: Map<string, string>;
  classMap: Map<string, string>;
}) {
  return [
    args.schoolMap.get(args.enrollment.schoolId) ?? args.enrollment.schoolId,
    args.yearMap.get(args.enrollment.academicYearId) ?? args.enrollment.academicYearId,
    args.enrollment.classId
      ? args.classMap.get(args.enrollment.classId) ?? args.enrollment.classId
      : "",
    args.enrollment.status,
  ]
    .filter(Boolean)
    .join(" — ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function membershipMatchesSchool(row: MembershipRow, schoolId: string) {
  const scopeType = String(row.scopeType || "").trim();
  const scopeId = String(row.scopeId || "").trim();
  const schoolIds = Array.isArray(row.scopes?.schoolIds) ? row.scopes?.schoolIds : [];

  if (row.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

export default function NewStudentCasePage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;

  const { user, checkingAuth } = useRequireAuth();

  const [enrollmentId, setEnrollmentId] = useState("");
  const [caseTypeId, setCaseTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof CasePriority.options)[number]>("MEDIUM");
  const [originKind, setOriginKind] =
    useState<(typeof StudentCaseOriginKind.options)[number]>("MANUAL");
  const [latestNote, setLatestNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const caseTypesRef = collection(db, `orgs/${orgId}/studentCaseTypes`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);

    const [studentSnap, schoolsSnap, caseTypesSnap, membershipsSnap] = await Promise.all([
      getDoc(studentRef),
      getDocs(query(schoolsRef)),
      getDocs(query(caseTypesRef)),
      getDocs(query(membershipsRef)),
    ]);

    if (!studentSnap.exists()) return null;

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const personRef = doc(db, `orgs/${orgId}/people/${student.personId}`);
    const personSnap = await getDoc(personRef);

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
        const yearsRef = collection(db, `orgs/${orgId}/schools/${school.id}/academicYears`);
        const classesByYearRef = async (yearId: string) =>
          collection(db, `orgs/${orgId}/schools/${school.id}/academicYears/${yearId}/classes`);

        const yearsSnap = await getDocs(query(yearsRef));

        const years = yearsSnap.docs.map((item) => ({
          id: item.id,
          schoolId: school.id,
          title: (item.data() as { title?: string }).title ?? item.id,
        }));

        const classesNested = await Promise.all(
          years.map(async (year) => {
            const classesSnap = await getDocs(query(await classesByYearRef(year.id)));
            return classesSnap.docs.map((item) => ({
              id: item.id,
              title: (item.data() as { title?: string }).title ?? item.id,
            }));
          })
        );

        return {
          years,
          classes: classesNested.flat(),
        };
      })
    );

    const enrollmentsSnap = await getDocs(
      query(
        collectionGroup(db, "studentEnrollments"),
        where("studentId", "==", studentId)
      )
    );

    const enrollments = enrollmentsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EnrollmentRow, "id">),
      }))
      .filter((item) => item.orgId === orgId)
      .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));

    const caseTypes = caseTypesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CaseTypeRow, "id">),
      }))
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));

    const memberships = membershipsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<MembershipRow, "id">),
    }));

    return {
      student,
      person: personSnap.exists()
        ? ({
            id: personSnap.id,
            ...(personSnap.data() as Omit<PersonRow, "id">),
          } as PersonRow)
        : {
            id: student.personId,
            displayName: student.personId,
          },
      schools,
      years: yearsNested.flatMap((item) => item.years),
      classes: yearsNested.flatMap((item) => item.classes),
      enrollments,
      caseTypes,
      memberships,
    };
  }, [orgId, studentId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId],
  });

  useEffect(() => {
    if (!enrollmentId && (data?.enrollments.length ?? 0) > 0) {
      const activeEnrollment =
        data?.enrollments.find((item) => item.status === "ACTIVE") ?? data?.enrollments[0];
      setEnrollmentId(activeEnrollment?.id ?? "");
    }
  }, [data?.enrollments, enrollmentId]);

  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years]
  );
  const classMap = useMemo(
    () => new Map((data?.classes ?? []).map((item) => [item.id, item.title])),
    [data?.classes]
  );

  const selectedEnrollment = useMemo(
    () => (data?.enrollments ?? []).find((item) => item.id === enrollmentId),
    [data?.enrollments, enrollmentId]
  );

  const selectedSchool = useMemo(
    () => (data?.schools ?? []).find((item) => item.id === selectedEnrollment?.schoolId),
    [data?.schools, selectedEnrollment?.schoolId]
  );

  const filteredCaseTypes = useMemo(() => {
    const schoolType = selectedSchool?.profile?.schoolType;
    if (!schoolType) return data?.caseTypes ?? [];
    return (data?.caseTypes ?? []).filter((item) => item.schoolType === schoolType);
  }, [data?.caseTypes, selectedSchool?.profile?.schoolType]);

  useEffect(() => {
    if (caseTypeId && !filteredCaseTypes.some((item) => item.id === caseTypeId)) {
      setCaseTypeId("");
    }
  }, [filteredCaseTypes, caseTypeId]);

  function resolveCreator() {
    const memberships = (data?.memberships ?? []).filter(
      (item) => item.uid === user?.uid && item.isActive !== false
    );

    if (!selectedEnrollment) {
      const first = memberships[0];
      return {
        personId: first?.personId || user?.uid || "unknown-user",
        roleKey: String(first?.roleKey || first?.role || ""),
      };
    }

    const schoolScoped =
      memberships.find((item) => membershipMatchesSchool(item, selectedEnrollment.schoolId)) ??
      memberships[0];

    return {
      personId: schoolScoped?.personId || user?.uid || "unknown-user",
      roleKey: String(schoolScoped?.roleKey || schoolScoped?.role || ""),
    };
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!selectedEnrollment) {
        throw new Error("يجب اختيار قيد دراسي أولًا.");
      }

      const selectedCaseType = filteredCaseTypes.find((item) => item.id === caseTypeId);
      if (!selectedCaseType) {
        throw new Error("يجب اختيار نوع قضية صالح.");
      }

      const creator = resolveCreator();
      const nowMs = Date.now();
      const id = generateId("student-case");
      const routingEventId = generateId("case-route");
      const logEntryId = generateId("case-log");

      const casePayload = {
        id,
        orgId,
        schoolId: selectedEnrollment.schoolId,
        academicYearId: selectedEnrollment.academicYearId,
        studentId,
        caseTypeId,
        title: title.trim(),
        description: description.trim(),
        status: "OPEN" as const,
        priority,
        originKind,
        currentOwnerRoleKey: selectedCaseType.defaultOwnerRoleKey,
        currentAssignedPersonId: "",
        createdByPersonId: creator.personId,
        createdByRoleKey: creator.roleKey || undefined,
        createdAt: nowMs,
        latestNote: latestNote.trim(),
        guardianNotifiedOnCreate: false,
        guardianNotifiedOnForward: false,
        guardianNotifiedOnClose: false,
      };

      const parsedCase = StudentCaseSchema.safeParse(casePayload);
      if (!parsedCase.success) {
        throw new Error(parsedCase.error.issues.map((i) => i.message).join("\n"));
      }

      const routingPayload = {
        id: routingEventId,
        caseId: id,
        orgId,
        actionType: "CREATE" as const,
        fromOwnerRoleKey: undefined,
        fromAssignedPersonId: "",
        toOwnerRoleKey: selectedCaseType.defaultOwnerRoleKey,
        toAssignedPersonId: "",
        performedByPersonId: creator.personId,
        performedByRoleKey: creator.roleKey || undefined,
        performedAt: nowMs,
        note: latestNote.trim() || "تم إنشاء القضية",
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsedRouting = StudentCaseRoutingEventSchema.safeParse(routingPayload);
      if (!parsedRouting.success) {
        throw new Error(parsedRouting.error.issues.map((i) => i.message).join("\n"));
      }

      const logPayload = {
        id: logEntryId,
        caseId: id,
        orgId,
        actionType: "STATUS_CHANGE" as const,
        createdByPersonId: creator.personId,
        createdByRoleKey: creator.roleKey || undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
        note: latestNote.trim() || "تم إنشاء القضية",
        attachmentRefId: "",
      };

      const parsedLog = StudentCaseLogEntrySchema.safeParse(logPayload);
      if (!parsedLog.success) {
        throw new Error(parsedLog.error.issues.map((i) => i.message).join("\n"));
      }

      await Promise.all([
        setDoc(doc(db, `orgs/${orgId}/studentCases/${id}`), parsedCase.data),
        setDoc(
          doc(db, `orgs/${orgId}/studentCaseRoutingEvents/${routingEventId}`),
          parsedRouting.data
        ),
        setDoc(
          doc(db, `orgs/${orgId}/studentCaseLogEntries/${logEntryId}`),
          parsedLog.data
        ),
      ]);

      toast.success("تم إنشاء القضية بنجاح");
      router.push(`/orgs/${orgId}/students/${studentId}/cases/${id}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء القضية");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[720px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="إضافة قضية"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
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
        badge="إضافة قضية"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="إضافة قضية طالب"
        description={`الطالب: ${data?.person.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}/cases`}>
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
        title="بيانات القضية"
        description="اختر القيد الدراسي ونوع القضية ثم أكمل البيانات الأساسية."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {String(error ?? saveError)}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">القيد الدراسي</label>
          <select
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">اختر</option>
            {(data?.enrollments ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {formatEnrollmentLabel({
                  enrollment: item,
                  schoolMap,
                  yearMap,
                  classMap,
                })}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">نوع القضية</label>
            <select
              value={caseTypeId}
              onChange={(e) => setCaseTypeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {filteredCaseTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الأولوية</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as (typeof CasePriority.options)[number])}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {CasePriority.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان القضية</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">منشأ القضية</label>
            <select
              value={originKind}
              onChange={(e) =>
                setOriginKind(e.target.value as (typeof StudentCaseOriginKind.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {StudentCaseOriginKind.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">وصف مختصر</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملخص أولي / ملاحظة البداية</label>
          <textarea
            value={latestNote}
            onChange={(e) => setLatestNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
      </FormSection>
    </div>
  );
}