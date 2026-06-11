"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  DoorOpen,
  Filter,
  GraduationCap,
  Milestone,
  Plus,
  Shapes,
  ShieldCheck,
  UserSquare2,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { SchoolType, TeacherAssignmentKind } from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildAssignmentPersonOptions,
  type AssignmentPersonRow,
  type OperationalMembershipRow,
  type SchoolTrackValue,
} from "@/lib/assignment-people";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolTypeValue = "PRIMARY" | "KG";
type AssignmentKindValue =
  | "CLASS_TEACHER"
  | "SUBJECT_TEACHER"
  | "VALUES_TEACHER"
  | "CORNERS_TEACHER"
  | "QURAN_TEACHER"
  | "SUPPORT_TEACHER"
  | "ACTIVITY_TEACHER"
  | "CUSTOM";

type OptionRow = {
  id: string;
  title: string;
  key?: string;
  code?: string;
};

type AssignmentRow = {
  id: string;
  teacherPersonId: string;
  supervisorPersonId?: string;
  assignmentKind: AssignmentKindValue;
  targetScopeType: "SCHOOL" | "GRADE" | "CLASS" | "STREAM";
  targetScopeId: string;
  coverageMode: "EXPLICIT_CLASSES" | "ALL_CLASSES_IN_SCOPE";
  subjectKey?: string;
  subjectId?: string;
  gradeId?: string;
  streamId?: string;
  isHomeroom?: boolean;
  roleInAssignment?: "MAIN" | "ASSISTANT" | "SUPPORT" | "SUBSTITUTE";
  status?: "ACTIVE" | "ENDED" | "PENDING";
  note?: string;
  startAt?: number;
  endAt?: number;
};

type AssignmentClassLinkRow = {
  id: string;
  assignmentId: string;
  classId: string;
};

type PageData = {
  school: {
    id: string;
    name: string;
    profile?: {
      schoolType?: SchoolTypeValue;
      track?: SchoolTrackValue;
    };
  };
  year: {
    id: string;
    title: string;
  };
  people: AssignmentPersonRow[];
  memberships: OperationalMembershipRow[];
  subjects: OptionRow[];
  grades: OptionRow[];
  streams: OptionRow[];
  classes: OptionRow[];
  assignments: AssignmentRow[];
  assignmentClassLinks: AssignmentClassLinkRow[];
};

function AssignmentsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
      <div className="h-[220px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function getSchoolTypeLabel(type: SchoolTypeValue) {
  return type === "PRIMARY" ? "ابتدائي" : "روضة";
}

function getAssignmentKindLabel(kind?: AssignmentKindValue) {
  switch (kind) {
    case "CLASS_TEACHER":
      return "معلم/ـة فصل";
    case "SUBJECT_TEACHER":
      return "معلم/ـة مادة";
    case "VALUES_TEACHER":
      return "معلم/ـة قيم";
    case "CORNERS_TEACHER":
      return "معلم/ـة أركان";
    case "QURAN_TEACHER":
      return "معلم/ـة قرآن";
    case "SUPPORT_TEACHER":
      return "معلم/ـة دعم";
    case "ACTIVITY_TEACHER":
      return "معلم/ـة نشاط";
    case "CUSTOM":
      return "إسناد مخصص";
    default:
      return "—";
  }
}

function getTargetScopeLabel(
  row: AssignmentRow,
  schoolName: string,
  gradeMap: Map<string, string>,
  streamMap: Map<string, string>,
  classMap: Map<string, string>,
) {
  switch (row.targetScopeType) {
    case "SCHOOL":
      return schoolName;
    case "GRADE":
      return gradeMap.get(row.targetScopeId) ?? row.targetScopeId;
    case "CLASS":
      return classMap.get(row.targetScopeId) ?? row.targetScopeId;
    case "STREAM":
      return streamMap.get(row.targetScopeId) ?? row.targetScopeId;
    default:
      return row.targetScopeId;
  }
}

export default function AssignmentsPage() {
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
  }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [selectedKind, setSelectedKind] = useState("");

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const schoolRef = doc(db, `orgs/${orgId}/schools/${schoolId}`);
    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}`,
    );

    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);
    const subjectsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/subjects`,
    );
    const gradesRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/grades`,
    );
    const streamsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/streams`,
    );
    const classesRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/classes`,
    );
    const assignmentsRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/teacherAssignments`,
    );
    const linksRef = collection(
      db,
      `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/teacherAssignmentClassLinks`,
    );

    const [
      schoolSnap,
      yearSnap,
      peopleSnap,
      membershipsSnap,
      subjectsSnap,
      gradesSnap,
      streamsSnap,
      classesSnap,
      assignmentsSnap,
      linksSnap,
    ] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDocs(query(peopleRef, orderBy("displayName", "asc"))),
      getDocs(membershipsRef),
      getDocs(query(subjectsRef, orderBy("order", "asc"))),
      getDocs(query(gradesRef, orderBy("order", "asc"))),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
      getDocs(query(classesRef, orderBy("order", "asc"))),
      getDocs(query(assignmentsRef, orderBy("startAt", "desc"))),
      getDocs(linksRef),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists()) {
      return null;
    }

    return {
      school: {
        id: schoolSnap.id,
        ...(schoolSnap.data() as Omit<PageData["school"], "id">),
      },
      year: {
        id: yearSnap.id,
        ...(yearSnap.data() as Omit<PageData["year"], "id">),
      },
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        displayName:
          (item.data() as { displayName?: string }).displayName ?? item.id,
      })),
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<OperationalMembershipRow, "id">),
      })),
      subjects: subjectsSnap.docs.map((item) => {
        const subject = item.data() as {
          title?: string;
          key?: string;
          code?: string;
        };
        return {
          id: item.id,
          title: subject.title ?? item.id,
          key: subject.key ?? "",
          code: subject.code ?? "",
        };
      }),
      grades: gradesSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      streams: streamsSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      classes: classesSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      assignments: assignmentsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AssignmentRow, "id">),
      })),
      assignmentClassLinks: linksSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AssignmentClassLinkRow, "id">),
      })),
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound, reload } =
    useDocumentLoader<PageData>({
      enabled: !!user,
      loader: loadPageData,
      deps: [orgId, schoolId, yearId],
    });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل الإسنادات التعليمية");
    }
  }, [error]);

  const schoolType = useMemo<SchoolTypeValue>(() => {
    const parsed = SchoolType.safeParse(data?.school.profile?.schoolType);
    return parsed.success ? parsed.data : "PRIMARY";
  }, [data?.school.profile?.schoolType]);

  const schoolTrack = data?.school.profile?.track;
  const { teacherOptions } = useMemo(
    () =>
      buildAssignmentPersonOptions({
        people: data?.people ?? [],
        memberships: data?.memberships ?? [],
        schoolType,
        schoolTrack,
        schoolId,
      }),
    [data?.people, data?.memberships, schoolType, schoolTrack, schoolId],
  );

  const peopleMap = useMemo(
    () =>
      new Map((data?.people ?? []).map((item) => [item.id, item.displayName])),
    [data?.people],
  );
  const subjectMap = useMemo(
    () => new Map((data?.subjects ?? []).map((item) => [item.id, item.title])),
    [data?.subjects],
  );
  const gradeMap = useMemo(
    () => new Map((data?.grades ?? []).map((item) => [item.id, item.title])),
    [data?.grades],
  );
  const streamMap = useMemo(
    () => new Map((data?.streams ?? []).map((item) => [item.id, item.title])),
    [data?.streams],
  );
  const classMap = useMemo(
    () => new Map((data?.classes ?? []).map((item) => [item.id, item.title])),
    [data?.classes],
  );
  const classLinksCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.assignmentClassLinks ?? []) {
      map.set(item.assignmentId, (map.get(item.assignmentId) ?? 0) + 1);
    }
    return map;
  }, [data?.assignmentClassLinks]);

  const filteredAssignments = useMemo(() => {
    return (data?.assignments ?? []).filter((item) => {
      if (selectedTeacherId && item.teacherPersonId !== selectedTeacherId)
        return false;
      if (selectedSubjectId && item.subjectId !== selectedSubjectId)
        return false;
      if (selectedGradeId && item.gradeId !== selectedGradeId) return false;
      if (
        schoolType === "PRIMARY" &&
        selectedStreamId &&
        item.streamId !== selectedStreamId
      )
        return false;
      if (selectedKind && item.assignmentKind !== selectedKind) return false;
      return true;
    });
  }, [
    data?.assignments,
    schoolType,
    selectedTeacherId,
    selectedSubjectId,
    selectedGradeId,
    selectedStreamId,
    selectedKind,
  ]);

  const totalAssignments = data?.assignments.length ?? 0;
  const activeAssignments =
    data?.assignments.filter((item) => item.status !== "ENDED").length ?? 0;
  const explicitAssignments =
    data?.assignments.filter((item) => item.coverageMode === "EXPLICIT_CLASSES")
      .length ?? 0;

  function clearFilters() {
    setSelectedTeacherId("");
    setSelectedSubjectId("");
    setSelectedGradeId("");
    setSelectedStreamId("");
    setSelectedKind("");
  }

  if (checkingAuth || loading) {
    return <AssignmentsPageSkeleton />;
  }

  if (notFound) {
    return (
      <PageHero
        badge="الإسنادات التعليمية"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى السنة
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="الإسنادات التعليمية"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title={`الإسنادات التعليمية - ${data?.school.name ?? "المدرسة"}`}
        description={
          schoolType === "PRIMARY"
            ? "ربط المعلمين بالمواد والصفوف والمسارات والفصول داخل المدرسة الابتدائية."
            : "ربط المعلمات بالفصول أو المواد المشتركة مثل القيم والأركان والقرآن داخل الروضة."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى السنة
              </Link>
            </Button>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments/new`}
              >
                <Plus className="h-4 w-4" />
                إضافة إسناد
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          label="نوع المدرسة"
          value={getSchoolTypeLabel(schoolType)}
          hint="يؤثر على شكل الإسناد"
        />
        <InfoCard
          label="إجمالي الإسنادات"
          value={totalAssignments}
          hint="كل الإسنادات المسجلة"
        />
        <InfoCard
          label="الإسنادات النشطة"
          value={activeAssignments}
          hint="كل ما ليس بحالة منتهية"
        />
        <InfoCard
          label="إسنادات الفصول الصريحة"
          value={explicitAssignments}
          hint="الإسنادات المرتبطة بفصول محددة"
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
          <div>
            <Button variant="outline" onClick={() => void reload()}>
              إعادة المحاولة
            </Button>
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="تصفية الإسنادات"
        description="يمكنك حصر الإسنادات حسب المعلم أو المادة أو الصف أو المسار."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">المعلم/ـة</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {teacherOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المادة</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {(data?.subjects ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {schoolType === "PRIMARY" ? "الصف" : "المستوى"}
            </label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {(data?.grades ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {schoolType === "PRIMARY" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">المسار</label>
              <select
                value={selectedStreamId}
                onChange={(e) => setSelectedStreamId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">الكل</option>
                {(data?.streams ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الإسناد</label>
            <select
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">الكل</option>
              {TeacherAssignmentKind.options.map((item) => (
                <option key={item} value={item}>
                  {getAssignmentKindLabel(item as AssignmentKindValue)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearFilters}>
            <X className="h-4 w-4" />
            مسح التصفية
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          المعروض الآن:{" "}
          <span className="font-medium text-foreground">
            {filteredAssignments.length}
          </span>{" "}
          من أصل{" "}
          <span className="font-medium text-foreground">
            {totalAssignments}
          </span>{" "}
          إسنادًا.
        </div>
      </FormSection>

      <FormSection
        title="قائمة الإسنادات"
        description="عرض الإسنادات التعليمية الحالية داخل هذه السنة الدراسية."
        contentClassName="space-y-4"
      >
        {filteredAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="rounded-2xl bg-muted p-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">
                {totalAssignments === 0
                  ? "لا توجد إسنادات تعليمية حتى الآن"
                  : "لا توجد نتائج مطابقة للتصفية"}
              </p>
              <p className="text-sm text-muted-foreground">
                {totalAssignments === 0
                  ? "ابدأ بإضافة أول إسناد تعليمي لهذه السنة الدراسية."
                  : "جرّب تغيير التصفية أو مسحها."}
              </p>
            </div>

            <Button asChild>
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments/new`}
              >
                <Plus className="h-4 w-4" />
                إضافة إسناد
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAssignments.map((row) => (
              <div key={row.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/orgs/${orgId}/people/${row.teacherPersonId}`}
                        className="text-base font-bold hover:underline"
                      >
                        {peopleMap.get(row.teacherPersonId) ??
                          row.teacherPersonId}
                      </Link>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {getAssignmentKindLabel(row.assignmentKind)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="h-4 w-4" />
                        المادة:{" "}
                        {row.subjectId
                          ? (subjectMap.get(row.subjectId) ?? row.subjectId)
                          : row.subjectKey || "GENERAL"}
                      </span>

                      {row.supervisorPersonId ? (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" />
                          المشرف:{" "}
                          <Link
                            href={`/orgs/${orgId}/people/${row.supervisorPersonId}`}
                            className="hover:underline"
                          >
                            {peopleMap.get(row.supervisorPersonId) ??
                              row.supervisorPersonId}
                          </Link>
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1">
                        {row.targetScopeType === "GRADE" ? (
                          schoolType === "PRIMARY" ? (
                            <GraduationCap className="h-4 w-4" />
                          ) : (
                            <Shapes className="h-4 w-4" />
                          )
                        ) : row.targetScopeType === "STREAM" ? (
                          <Milestone className="h-4 w-4" />
                        ) : row.targetScopeType === "CLASS" ? (
                          <DoorOpen className="h-4 w-4" />
                        ) : (
                          <UserSquare2 className="h-4 w-4" />
                        )}
                        النطاق:{" "}
                        {getTargetScopeLabel(
                          row,
                          data?.school.name ?? "المدرسة",
                          gradeMap,
                          streamMap,
                          classMap,
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <Filter className="h-4 w-4" />
                        التغطية:{" "}
                        {row.coverageMode === "ALL_CLASSES_IN_SCOPE"
                          ? "كل الفصول ضمن النطاق"
                          : "فصول محددة"}
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <DoorOpen className="h-4 w-4" />
                        الفصول المرتبطة: {classLinksCountMap.get(row.id) ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments/${row.id}`}
                      >
                        تعديل
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  {schoolType === "PRIMARY"
                    ? "هذا الإسناد يربط المعلم بالمادة والصف أو المسار أو الفصل، ويمكن أن يغطي فصولًا متعددة عند الحاجة."
                    : "هذا الإسناد يربط المعلمة بالفصل أو بالمادة المشتركة داخل الروضة، مثل القيم أو الأركان أو القرآن."}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}
