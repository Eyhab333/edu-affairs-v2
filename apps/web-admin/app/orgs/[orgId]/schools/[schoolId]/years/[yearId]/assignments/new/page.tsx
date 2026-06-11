"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  TeacherAssignmentSchema,
  TeacherAssignmentClassLinkSchema,
  SchoolType,
} from "@takween/contracts";
import { ArrowLeft, Loader2, Save, UserRound, Users } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
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
type AssignmentScopeValue = "SCHOOL" | "GRADE" | "CLASS" | "STREAM";
type CoverageModeValue = "EXPLICIT_CLASSES" | "ALL_CLASSES_IN_SCOPE";
type RoleInAssignmentValue = "MAIN" | "ASSISTANT" | "SUPPORT" | "SUBSTITUTE";
type AssignmentStatusValue = "ACTIVE" | "ENDED" | "PENDING";

type OptionRow = {
  id: string;
  title: string;
  key?: string;
  code?: string;
  gradeId?: string;
  streamId?: string;
};

type SummaryData = {
  schoolName: string;
  schoolType: SchoolTypeValue;
  schoolTrack?: SchoolTrackValue;
  yearTitle: string;
  people: AssignmentPersonRow[];
  memberships: OperationalMembershipRow[];
  subjects: OptionRow[];
  grades: OptionRow[];
  streams: OptionRow[];
  classes: OptionRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewAssignmentPage() {
  const router = useRouter();
  const params = useParams<{
    orgId: string;
    schoolId: string;
    yearId: string;
  }>();
  const orgId = params.orgId;
  const schoolId = params.schoolId;
  const yearId = params.yearId;

  const { user, checkingAuth } = useRequireAuth();

  const [teacherPersonId, setTeacherPersonId] = useState("");
  const [supervisorPersonId, setSupervisorPersonId] = useState("");
  const [assignmentKind, setAssignmentKind] =
    useState<AssignmentKindValue>("SUBJECT_TEACHER");
  const [targetScopeType, setTargetScopeType] =
    useState<AssignmentScopeValue>("SCHOOL");
  const [targetScopeId, setTargetScopeId] = useState("");
  const [coverageMode, setCoverageMode] =
    useState<CoverageModeValue>("EXPLICIT_CLASSES");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [isHomeroom, setIsHomeroom] = useState(false);
  const [roleInAssignment, setRoleInAssignment] =
    useState<RoleInAssignmentValue>("MAIN");
  const [status, setStatus] = useState<AssignmentStatusValue>("ACTIVE");
  const [note, setNote] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<SummaryData | null> => {
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

    const [
      schoolSnap,
      yearSnap,
      peopleSnap,
      membershipsSnap,
      subjectsSnap,
      gradesSnap,
      streamsSnap,
      classesSnap,
    ] = await Promise.all([
      getDoc(schoolRef),
      getDoc(yearRef),
      getDocs(query(peopleRef, orderBy("displayName", "asc"))),
      getDocs(membershipsRef),
      getDocs(query(subjectsRef, orderBy("order", "asc"))),
      getDocs(query(gradesRef, orderBy("order", "asc"))),
      getDocs(query(streamsRef, orderBy("order", "asc"))),
      getDocs(query(classesRef, orderBy("order", "asc"))),
    ]);

    if (!schoolSnap.exists() || !yearSnap.exists()) {
      return null;
    }

    const schoolData = schoolSnap.data() as {
      name?: string;
      profile?: {
        schoolType?: SchoolTypeValue;
        track?: SchoolTrackValue;
      };
    };

    return {
      schoolName: schoolData.name ?? "المدرسة",
      schoolType: SchoolType.safeParse(schoolData.profile?.schoolType).success
        ? (schoolData.profile?.schoolType as SchoolTypeValue)
        : "PRIMARY",
      schoolTrack: schoolData.profile?.track,
      yearTitle:
        (yearSnap.data() as { title?: string }).title ?? "السنة الدراسية",
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
      classes: classesSnap.docs.map((item) => {
        const classItem = item.data() as {
          title?: string;
          gradeId?: string;
          streamId?: string;
        };
        return {
          id: item.id,
          title: classItem.title ?? item.id,
          gradeId: classItem.gradeId ?? "",
          streamId: classItem.streamId ?? "",
        };
      }),
    };
  }, [orgId, schoolId, yearId]);

  const { data, loading, error, notFound } = useDocumentLoader<SummaryData>({
    enabled: !!user,
    loader: loadSummary,
    deps: [orgId, schoolId, yearId],
  });

  const schoolType = useMemo<SchoolTypeValue>(
    () => data?.schoolType ?? "PRIMARY",
    [data?.schoolType],
  );

  const { teacherOptions, supervisorOptions } = useMemo(
    () =>
      buildAssignmentPersonOptions({
        people: data?.people ?? [],
        memberships: data?.memberships ?? [],
        schoolType,
        schoolTrack: data?.schoolTrack,
        schoolId,
      }),
    [data?.people, data?.memberships, schoolType, data?.schoolTrack, schoolId],
  );

  useEffect(() => {
    setTargetScopeId(schoolId);
  }, [schoolId]);

  useEffect(() => {
    if (targetScopeType === "SCHOOL") {
      setTargetScopeId(schoolId);
    } else {
      setTargetScopeId("");
    }
  }, [targetScopeType, schoolId]);

  const targetOptions = useMemo(() => {
    if (!data) return [];

    switch (targetScopeType) {
      case "GRADE":
        return data.grades;
      case "CLASS":
        return data.classes;
      case "STREAM":
        return schoolType === "PRIMARY" ? data.streams : [];
      case "SCHOOL":
      default:
        return [{ id: schoolId, title: data.schoolName }];
    }
  }, [data, targetScopeType, schoolId, schoolType]);

  const filteredClassOptions = useMemo(() => {
    return (data?.classes ?? []).filter((item) => {
      if (gradeId && item.gradeId !== gradeId) return false;
      if (schoolType === "PRIMARY" && streamId && item.streamId !== streamId)
        return false;
      return true;
    });
  }, [data?.classes, gradeId, streamId, schoolType]);

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((item) => item !== classId)
        : [...prev, classId],
    );
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const assignmentId = generateId("assignment");
      const nowMs = Date.now();

      const selectedSubject = (data?.subjects ?? []).find(
        (item) => item.id === subjectId,
      );

      const payload = {
        id: assignmentId,
        orgId,
        schoolId,
        academicYearId: yearId,
        teacherPersonId,
        supervisorPersonId: supervisorPersonId || "",
        assignmentKind,
        targetScopeType,
        targetScopeId: targetScopeType === "SCHOOL" ? schoolId : targetScopeId,
        coverageMode,
        subjectKey:
          selectedSubject?.key ||
          selectedSubject?.code ||
          selectedSubject?.title ||
          "GENERAL",
        subjectId: subjectId || "",
        gradeId: gradeId || "",
        streamId: schoolType === "PRIMARY" ? streamId || "" : "",
        isHomeroom,
        roleInAssignment,
        status,
        startAt: nowMs,
        note: note.trim(),
      };

      const parsed = TeacherAssignmentSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n"),
        );
      }

      const assignmentRef = doc(
        db,
        `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/teacherAssignments/${assignmentId}`,
      );

      await setDoc(assignmentRef, parsed.data);

      if (coverageMode === "EXPLICIT_CLASSES") {
        for (const classId of selectedClassIds) {
          const classItem = (data?.classes ?? []).find(
            (item) => item.id === classId,
          );
          if (!classItem) continue;

          const linkId = `${assignmentId}__${classId}`;
          const linkPayload = {
            id: linkId,
            assignmentId,
            orgId,
            schoolId,
            academicYearId: yearId,
            classId,
            gradeId: classItem.gradeId || "",
            streamId: classItem.streamId || "",
            order: 0,
            isPrimaryClass: false,
            createdAt: nowMs,
            updatedAt: nowMs,
          };

          const parsedLink =
            TeacherAssignmentClassLinkSchema.safeParse(linkPayload);
          if (!parsedLink.success) {
            throw new Error(
              parsedLink.error.issues.map((issue) => issue.message).join("\n"),
            );
          }

          const linkRef = doc(
            db,
            `orgs/${orgId}/schools/${schoolId}/academicYears/${yearId}/teacherAssignmentClassLinks/${linkId}`,
          );

          await setDoc(linkRef, parsedLink.data);
        }
      }

      toast.success("تم إنشاء الإسناد التعليمي بنجاح");
      router.push(
        `/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments`,
      );
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء الإسناد التعليمي");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[820px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="إضافة إسناد"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="تعذر العثور على السجل المطلوب"
        description="قد تكون المدرسة أو السنة الدراسية غير موجودة."
        actions={
          <Button asChild variant="outline">
            <Link
              href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments`}
            >
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
        badge="إضافة إسناد"
        badgeIcon={<Users className="h-3.5 w-3.5" />}
        title="إضافة إسناد تعليمي"
        description={`إضافة إسناد جديد داخل ${data?.yearTitle ?? ""} — ${data?.schoolName ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link
                href={`/orgs/${orgId}/schools/${schoolId}/years/${yearId}/assignments`}
              >
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
          </>
        }
      />

      <FormSection
        title="بيانات الإسناد"
        description="اختر المعلم والمادة والنطاق وطريقة تغطية الفصول."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">المعلم/ـة</label>
            <select
              value={teacherPersonId}
              onChange={(e) => setTeacherPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {teacherOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المشرف المباشر</label>
            <select
              value={supervisorPersonId}
              onChange={(e) => setSupervisorPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {supervisorOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {teacherPersonId ? (
              <Button asChild variant="outline" className="justify-between">
                <Link href={`/orgs/${orgId}/people/${teacherPersonId}`}>
                  <span className="flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    فتح ملف المعلم/ـة
                  </span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <div />
            )}

            {supervisorPersonId ? (
              <Button asChild variant="outline" className="justify-between">
                <Link href={`/orgs/${orgId}/people/${supervisorPersonId}`}>
                  <span className="flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    فتح ملف المشرف
                  </span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <div />
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الإسناد</label>
            <select
              value={assignmentKind}
              onChange={(e) =>
                setAssignmentKind(e.target.value as AssignmentKindValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {schoolType === "PRIMARY" ? (
                <>
                  <option value="SUBJECT_TEACHER">معلم/ـة مادة</option>
                  <option value="CLASS_TEACHER">معلم/ـة فصل</option>
                  <option value="QURAN_TEACHER">معلم/ـة قرآن</option>
                  <option value="SUPPORT_TEACHER">معلم/ـة دعم</option>
                  <option value="ACTIVITY_TEACHER">معلم/ـة نشاط</option>
                  <option value="CUSTOM">مخصص</option>
                </>
              ) : (
                <>
                  <option value="CLASS_TEACHER">معلم/ـة فصل</option>
                  <option value="VALUES_TEACHER">معلم/ـة قيم</option>
                  <option value="CORNERS_TEACHER">معلم/ـة أركان</option>
                  <option value="QURAN_TEACHER">معلم/ـة قرآن</option>
                  <option value="SUPPORT_TEACHER">معلم/ـة دعم</option>
                  <option value="CUSTOM">مخصص</option>
                </>
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المادة</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">GENERAL / غير محددة</option>
              {(data?.subjects ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as AssignmentStatusValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="ACTIVE">نشط</option>
              <option value="PENDING">معلّق</option>
              <option value="ENDED">منتهٍ</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع النطاق</label>
            <select
              value={targetScopeType}
              onChange={(e) =>
                setTargetScopeType(e.target.value as AssignmentScopeValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="SCHOOL">المدرسة</option>
              <option value="GRADE">
                {schoolType === "PRIMARY" ? "الصف" : "المستوى"}
              </option>
              <option value="CLASS">الفصل</option>
              {schoolType === "PRIMARY" ? (
                <option value="STREAM">المسار</option>
              ) : null}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">النطاق</label>
            <select
              value={targetScopeId}
              onChange={(e) => setTargetScopeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              disabled={targetScopeType === "SCHOOL"}
            >
              {targetScopeType === "SCHOOL" ? (
                <option value={schoolId}>
                  {data?.schoolName ?? "المدرسة"}
                </option>
              ) : (
                <>
                  <option value="">اختر</option>
                  {targetOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {schoolType === "PRIMARY" ? "الصف" : "المستوى"}
            </label>
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
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
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">بدون</option>
                {(data?.streams ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">نمط التغطية</label>
            <select
              value={coverageMode}
              onChange={(e) =>
                setCoverageMode(e.target.value as CoverageModeValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="EXPLICIT_CLASSES">فصول محددة</option>
              <option value="ALL_CLASSES_IN_SCOPE">كل الفصول ضمن النطاق</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              دور المعلم داخل الإسناد
            </label>
            <select
              value={roleInAssignment}
              onChange={(e) =>
                setRoleInAssignment(e.target.value as RoleInAssignmentValue)
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="MAIN">رئيسي</option>
              <option value="ASSISTANT">مساعد</option>
              <option value="SUPPORT">دعم</option>
              <option value="SUBSTITUTE">بديل</option>
            </select>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">معلم/ـة فصل أساسي</div>
                <div className="text-xs text-muted-foreground">
                  يفيد خصوصًا في إسنادات الروضات أو معلم الفصل.
                </div>
              </div>

              <input
                type="checkbox"
                checked={isHomeroom}
                onChange={(e) => setIsHomeroom(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملاحظات</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            placeholder="أي ملاحظات إضافية على الإسناد"
          />
        </div>
      </FormSection>

      <FormSection
        title="الفصول المرتبطة بالإسناد"
        description="يُستخدم هذا القسم فقط عند اختيار التغطية بفصول محددة."
        contentClassName="space-y-4"
      >
        {coverageMode !== "EXPLICIT_CLASSES" ? (
          <div className="rounded-2xl border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            هذا الإسناد سيغطي كل الفصول ضمن النطاق المختار، لذلك لا حاجة لاختيار
            فصول محددة.
          </div>
        ) : filteredClassOptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد فصول مطابقة للصف/المستوى أو المسار الحالي.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredClassOptions.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {schoolType === "PRIMARY"
                      ? `صف: ${item.gradeId || "—"} / مسار: ${item.streamId || "—"}`
                      : `المستوى: ${item.gradeId || "—"}`}
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={selectedClassIds.includes(item.id)}
                  onChange={() => toggleClass(item.id)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}
