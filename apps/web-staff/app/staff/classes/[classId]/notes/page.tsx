"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Save,
  School,
  Tag,
  Users,
} from "lucide-react";
import { doc, getDoc, writeBatch } from "firebase/firestore";

import type {
  Class as SchoolClass,
  MembershipRole,
  StudentNote,
} from "@takween/contracts";
import { buildGroupStudentNotes } from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { getClassRoster } from "@/lib/class-roster";
import { getStaffActorPrimaryRole } from "@/lib/staff-actor";

type NoteStudentInput = {
  studentId: string;
  studentDisplayName: string;
  enrollmentId?: string;
};

type LoadState = {
  loading: boolean;
  error: string | null;
};

type SaveState = {
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  savedCount: number;
};

type CategoryOption = {
  value: StudentNote["category"];
  label: string;
};

type PriorityOption = {
  value: StudentNote["priority"];
  label: string;
};

type VisibilityOption = {
  value: StudentNote["visibility"];
  label: string;
};

type FollowUpStatusOption = {
  value: StudentNote["followUpStatus"];
  label: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: "GENERAL", label: "عامة" },
  { value: "EDUCATIONAL", label: "تعليمية" },
  { value: "BEHAVIORAL", label: "سلوكية" },
  { value: "ADMINISTRATIVE", label: "إدارية" },
  { value: "ATTENDANCE", label: "حضور" },
  { value: "TRANSPORT", label: "نقل" },
  { value: "GUARDIAN_COMMUNICATION", label: "تواصل ولي أمر" },
  { value: "LEARNING_LOSS", label: "فاقد تعليمي" },
  { value: "POSITIVE", label: "إيجابية / تحفيزية" },
  { value: "CARE", label: "رعائية" },
  { value: "FOLLOW_UP", label: "متابعة" },
  { value: "CUSTOM", label: "مخصصة" },
];

const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: "INFO", label: "معلومة" },
  { value: "FOLLOW_UP", label: "تحتاج متابعة" },
  { value: "IMPORTANT", label: "مهمة" },
  { value: "URGENT", label: "عاجلة" },
];

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { value: "PRIVATE_TO_AUTHOR", label: "لكاتب الملاحظة فقط" },
  { value: "STAFF_ONLY", label: "الطاقم الداخلي" },
  { value: "STAFF_INTERNAL", label: "داخلي للطاقم" },
  { value: "SCHOOL_LEADERSHIP", label: "قيادة المدرسة" },
  { value: "ADMIN_ONLY", label: "الإدارة فقط" },
  { value: "STUDENT_SUPPORT_TEAM", label: "فريق الدعم الطلابي" },
  { value: "TRANSPORT_TEAM", label: "فريق النقل" },
  { value: "GUARDIAN_VISIBLE", label: "ظاهر لولي الأمر لاحقًا" },
  { value: "PARENT_VISIBLE", label: "ولي الأمر" },
];

const FOLLOW_UP_STATUS_OPTIONS: FollowUpStatusOption[] = [
  { value: "NONE", label: "لا تحتاج متابعة" },
  { value: "NEEDED", label: "تحتاج متابعة" },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function compactForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toFollowUpTimestamp(dateInput: string) {
  if (!dateInput) return undefined;
  return new Date(`${dateInput}T09:00:00`).getTime();
}

function getClassLabel(classInfo: SchoolClass | null, classId: string) {
  return classInfo?.title || classInfo?.code || classId;
}

async function loadClassStudents(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}): Promise<NoteStudentInput[]> {
  const roster = await getClassRoster(params);

  return roster.rows.map((row) => ({
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    studentDisplayName: row.displayName || row.studentId,
  })).sort((a, b) =>
    a.studentDisplayName.localeCompare(b.studentDisplayName, "ar"),
  );
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>

        {icon ? (
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ClassNotesPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;

  const { actor } = useStaffActor();

  const [students, setStudents] = useState<NoteStudentInput[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [category, setCategory] = useState<StudentNote["category"]>("GENERAL");
  const [priority, setPriority] = useState<StudentNote["priority"]>("INFO");
  const [visibility, setVisibility] =
    useState<StudentNote["visibility"]>("STAFF_ONLY");
  const [followUpStatus, setFollowUpStatus] =
    useState<StudentNote["followUpStatus"]>("NONE");

  const [followUpDate, setFollowUpDate] = useState(() =>
    formatDateInput(new Date()),
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });

  const [saveState, setSaveState] = useState<SaveState>({
    saving: false,
    error: null,
    savedAt: null,
    savedCount: 0,
  });

  const classInfo =
    actor.visibleClasses.find((item) => item.id === classId) ?? null;

  const classTitle = getClassLabel(classInfo, classId);

  const roleKey = (getStaffActorPrimaryRole(actor) ||
    actor.roles[0] ||
    "staff") as MembershipRole;

  const selectedStudents = useMemo(() => {
    return students.filter((student) =>
      selectedStudentIds.has(student.studentId),
    );
  }, [selectedStudentIds, students]);

  const canSave =
    !!classInfo &&
    selectedStudents.length > 0 &&
    body.trim().length > 0 &&
    !saveState.saving &&
    (followUpStatus !== "NEEDED" || !!followUpDate);

  const loadPage = useCallback(async () => {
    if (!classInfo) {
      setLoadState({
        loading: false,
        error:
          "لا يمكنك فتح ملاحظات هذا الفصل أو أن الفصل غير موجود ضمن نطاقك.",
      });
      return;
    }

    setLoadState({
      loading: true,
      error: null,
    });

    try {
      const loadedStudents = await loadClassStudents({
        orgId: actor.orgId,
        schoolId: classInfo.schoolId,
        academicYearId: classInfo.academicYearId,
        classId,
      });

      setStudents(loadedStudents);
      setSelectedStudentIds(new Set());

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, classId, classInfo]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) => {
      const next = new Set(current);

      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }

      return next;
    });
  }

  function selectAllStudents() {
    setSelectedStudentIds(
      new Set(students.map((student) => student.studentId)),
    );
  }

  function clearSelection() {
    setSelectedStudentIds(new Set());
  }

  async function handleSaveNotes() {
    if (!classInfo || !canSave) return;

    setSaveState({
      saving: true,
      error: null,
      savedAt: null,
      savedCount: 0,
    });

    try {
      const now = Date.now();
      const idPrefix = `student_note_${classId}_${now}`;

      const currentTerm =
        actor.currentTermsByAcademicYear[classInfo.academicYearId];

      const termContext = currentTerm
        ? {
            termId: currentTerm.id,
            termTitle: currentTerm.title,
            termShortTitle: currentTerm.shortTitle,
          }
        : undefined;

      const notes = buildGroupStudentNotes({
        idPrefix,

        orgId: actor.orgId,
        schoolId: classInfo.schoolId,
        academicYearId: classInfo.academicYearId,

        termContext,

        students: selectedStudents.map((student) => ({
          studentId: student.studentId,
          studentDisplayName: student.studentDisplayName,
          enrollmentId: student.enrollmentId ?? "",
          gradeId: classInfo.gradeId ?? "",
          classId,
        })),

        category,
        priority,
        visibility,

        title,
        body,

        recordedByPersonId: actor.personId || actor.uid,
        recordedByRoleKey: roleKey,
        recordedAt: now,

        followUpStatus,
        followUpAt:
          followUpStatus === "NEEDED"
            ? toFollowUpTimestamp(followUpDate)
            : undefined,

        sourceType: "MANUAL",

        tags: splitTags(tagsText),

        now,
      });

      const firestoreBatch = writeBatch(db);

      for (const note of notes) {
        const noteRef = doc(db, "orgs", actor.orgId, "studentNotes", note.id);

        firestoreBatch.set(noteRef, compactForFirestore(note), {
          merge: true,
        });
      }

      await firestoreBatch.commit();

      setSaveState({
        saving: false,
        error: null,
        savedAt: now,
        savedCount: notes.length,
      });

      setBody("");
      setTitle("");
      setTagsText("");
      setFollowUpStatus("NONE");
      clearSelection();
    } catch (error) {
      setSaveState({
        saving: false,
        error: getErrorMessage(error),
        savedAt: null,
        savedCount: 0,
      });
    }
  }

  if (!classInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>لا يمكن فتح ملاحظات هذا الفصل</CardTitle>
          <CardDescription>
            الفصل غير موجود ضمن الفصول المرئية لهذا المستخدم.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button asChild variant="outline">
            <Link href="/staff/classes">
              <ArrowRight className="size-4" />
              العودة إلى فصولي
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Milestone 10</Badge>
                <Badge variant="outline">ملاحظات الفصل</Badge>
              </div>

              <h1 className="text-2xl font-bold">ملاحظات {classTitle}</h1>

              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                أضف ملاحظة لطالب واحد أو عدة طلاب. عند اختيار عدة طلاب سيتم
                إنشاء StudentNote مستقل لكل طالب مع ربطهم بنفس groupNoteId.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/staff/classes/${classId}`}>
                  <ArrowRight className="size-4" />
                  الرجوع للفصل
                </Link>
              </Button>

              <Button
                type="button"
                onClick={handleSaveNotes}
                disabled={!canSave}
              >
                {saveState.saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                حفظ الملاحظات
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          title="طلاب الفصل"
          value={students.length}
          icon={<Users className="size-5" />}
        />

        <SummaryCard
          title="المحددون"
          value={selectedStudents.length}
          icon={<CheckCircle2 className="size-5" />}
        />

        <SummaryCard
          title="آخر حفظ"
          value={saveState.savedCount}
          icon={<MessageSquarePlus className="size-5" />}
        />
      </section>

      {saveState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            تعذر حفظ الملاحظات: {saveState.error}
          </CardContent>
        </Card>
      ) : saveState.savedAt ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
            تم حفظ {saveState.savedCount} ملاحظة بنجاح.
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <CardTitle>اختر الطلاب</CardTitle>
            </div>

            <CardDescription>
              يمكنك اختيار طالب واحد أو عدة طلاب من نفس الفصل.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectAllStudents}
              >
                تحديد الجميع
              </Button>

              <Button type="button" variant="outline" onClick={clearSelection}>
                إلغاء التحديد
              </Button>

              <Button type="button" variant="outline" onClick={loadPage}>
                {loadState.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <School className="size-4" />
                )}
                تحديث الطلاب
              </Button>
            </div>

            {loadState.loading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تحميل طلاب الفصل...
              </div>
            ) : loadState.error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {loadState.error}
              </div>
            ) : !students.length ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                لا توجد بيانات طلاب لهذا الفصل حتى الآن.
              </div>
            ) : (
              <div className="max-h-[560px] overflow-auto rounded-2xl border border-border">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                    <tr className="text-right">
                      <th className="px-3 py-3 font-medium">اختيار</th>
                      <th className="px-3 py-3 font-medium">الطالب</th>
                      <th className="px-3 py-3 font-medium">المعرّف</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => {
                      const checked = selectedStudentIds.has(student.studentId);

                      return (
                        <tr
                          key={student.studentId}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudent(student.studentId)}
                              className="size-4"
                            />
                          </td>

                          <td className="px-3 py-3 font-medium">
                            {student.studentDisplayName || student.studentId}
                          </td>

                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {student.studentId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-primary" />
              <CardTitle>بيانات الملاحظة</CardTitle>
            </div>

            <CardDescription>
              اختر التصنيف، الأولوية، الظهور، ونص الملاحظة.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">التصنيف</span>
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as StudentNote["category"])
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium">الأولوية</span>
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as StudentNote["priority"])
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {PRIORITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-sm font-medium">سياسة الظهور</span>
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as StudentNote["visibility"])
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {VISIBILITY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">المتابعة</span>
                <select
                  value={followUpStatus}
                  onChange={(event) =>
                    setFollowUpStatus(
                      event.target.value as StudentNote["followUpStatus"],
                    )
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {FOLLOW_UP_STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium">تاريخ المتابعة</span>
                <input
                  type="date"
                  value={followUpDate}
                  disabled={followUpStatus !== "NEEDED"}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none disabled:opacity-40 focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-sm font-medium">العنوان</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="عنوان اختياري"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">نص الملاحظة</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="اكتب الملاحظة هنا..."
                rows={7}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">وسوم</span>
              <input
                type="text"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="مثال: قراءة, متابعة, ولي أمر"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">
                افصل الوسوم بفاصلة.
              </span>
            </label>

            <Button
              type="button"
              className="w-full"
              onClick={handleSaveNotes}
              disabled={!canSave}
            >
              {saveState.saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="size-4" />
              )}
              حفظ الملاحظات
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>حالة الخطوة</CardTitle>
          <CardDescription>
            صفحة ملاحظات الفصل تدعم الآن اختيار طالب أو عدة طلاب وحفظ
            StudentNote لكل طالب.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">10C صفحة ملاحظات الفصل ✅</Badge>
          <Badge variant="secondary">10D اختيار طالب/عدة طلاب ✅</Badge>
          <Badge variant="secondary">10E حفظ الملاحظات ✅</Badge>
          <Badge variant="outline">التالي: 10F مركز عام للملاحظات</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
