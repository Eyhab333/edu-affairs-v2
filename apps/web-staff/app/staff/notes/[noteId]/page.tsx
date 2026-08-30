"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  School,
  Tag,
  UserPen,
  UserRound,
} from "lucide-react";

import { doc, getDoc, setDoc } from "firebase/firestore";

import type {
  Class as SchoolClass,
  Person,
  Student,
  StudentNote,
} from "@takween/contracts";

import {
  cancelStudentNoteFollowUp,
  markStudentNoteAsResolved,
  markStudentNoteFollowUpInProgress,
} from "@takween/domain";

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
import { getVisibleStudents } from "@/lib/visible-students";

type LoadState = {
  loading: boolean;
  error: string | null;
};

type ActionState = {
  saving: boolean;
  error: string | null;
  savedAt: number | null;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function compactForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatDateTime(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: StudentNote["status"]) {
  switch (status) {
    case "ACTIVE":
      return "نشطة";
    case "NEEDS_FOLLOW_UP":
      return "تحتاج متابعة";
    case "RESOLVED":
      return "محلولة";
    case "ARCHIVED":
      return "مؤرشفة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

function getStatusVariant(status: StudentNote["status"]): BadgeVariant {
  if (status === "ACTIVE") return "default";
  if (status === "NEEDS_FOLLOW_UP") return "secondary";
  if (status === "RESOLVED") return "outline";
  if (status === "CANCELLED") return "destructive";
  return "outline";
}

function getPriorityLabel(priority: StudentNote["priority"]) {
  switch (priority) {
    case "INFO":
      return "معلومة";
    case "FOLLOW_UP":
      return "متابعة";
    case "IMPORTANT":
      return "مهمة";
    case "URGENT":
      return "عاجلة";
    default:
      return priority;
  }
}

function getPriorityVariant(priority: StudentNote["priority"]): BadgeVariant {
  if (priority === "URGENT") return "destructive";
  if (priority === "IMPORTANT") return "secondary";
  if (priority === "FOLLOW_UP") return "outline";
  return "default";
}

function getCategoryLabel(category: StudentNote["category"]) {
  switch (category) {
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
      return "تواصل ولي أمر";
    case "LEARNING_LOSS":
      return "فاقد تعليمي";
    case "POSITIVE":
      return "إيجابية / تحفيزية";
    case "CARE":
      return "رعائية";
    case "FOLLOW_UP":
      return "متابعة";
    case "CUSTOM":
      return "مخصصة";
    default:
      return category;
  }
}

function getVisibilityLabel(visibility: StudentNote["visibility"]) {
  switch (visibility) {
    case "PRIVATE_TO_AUTHOR":
      return "خاص بالكاتب";
    case "STAFF_ONLY":
      return "الطاقم الداخلي";
    case "STAFF_INTERNAL":
      return "داخلي للطاقم";
    case "SCHOOL_LEADERSHIP":
      return "قيادة المدرسة";
    case "ADMIN_ONLY":
      return "الإدارة فقط";
    case "STUDENT_SUPPORT_TEAM":
      return "فريق الدعم الطلابي";
    case "TRANSPORT_TEAM":
      return "فريق النقل";
    case "GUARDIAN_VISIBLE":
      return "ظاهر لولي الأمر لاحقًا";
    case "PARENT_VISIBLE":
      return "ولي الأمر";
    default:
      return visibility;
  }
}

function getFollowUpStatusLabel(status: StudentNote["followUpStatus"]) {
  switch (status) {
    case "NONE":
      return "لا تحتاج متابعة";
    case "NEEDED":
      return "تحتاج متابعة";
    case "IN_PROGRESS":
      return "قيد المتابعة";
    case "DONE":
      return "تمت المتابعة";
    case "CANCELLED":
      return "أُلغيت المتابعة";
    default:
      return status;
  }
}

function getSourceTypeLabel(sourceType: StudentNote["sourceType"]) {
  switch (sourceType) {
    case "MANUAL":
      return "يدوي";
    case "STUDENT_ATTENDANCE_BATCH":
      return "دفعة حضور";
    case "STUDENT_ATTENDANCE_RECORD":
      return "سجل حضور";
    case "STUDENT_MEASUREMENT_BATCH":
      return "دفعة قياس";
    case "STUDENT_ASSESSMENT_RECORD":
      return "سجل قياس";
    case "STUDENT_TRACKER_ENTRY":
      return "متابعة طالب";
    case "STUDENT_LEARNING_LOSS_PLAN":
      return "خطة فاقد";
    case "STUDENT_CASE":
      return "قضية طالب";
    case "TRANSPORT_ATTENDANCE":
      return "حضور نقل";
    case "CUSTOM":
      return "مصدر مخصص";
    default:
      return sourceType;
  }
}

function getClassLabel(classInfo: SchoolClass | null, classId: string) {
  return classInfo?.title || classInfo?.code || classId || "غير محدد";
}

async function loadPersonName(params: {
  orgId: string;
  personId: string;
}): Promise<string> {
  if (!params.personId) return "";

  try {
    const personRef = doc(db, "orgs", params.orgId, "people", params.personId);

    const personSnap = await getDoc(personRef);

    if (!personSnap.exists()) return "";

    const person = {
      id: personSnap.id,
      ...(personSnap.data() as Omit<Person, "id">),
    };

    return person.displayName || "";
  } catch (error) {
    console.warn("Failed to load person name", error);
    return "";
  }
}

async function loadStudentDisplayName(params: {
  orgId: string;
  studentId: string;
}): Promise<string> {
  const roster = await getVisibleStudents({ orgId: params.orgId });

  return (
    roster.rows.find((row) => row.studentId === params.studentId)?.displayName ||
    params.studentId
  );
}

function InfoBox({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>

      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

export default function StudentNoteDetailsPage() {
  const params = useParams<{ noteId: string }>();
  const noteId = params.noteId;

  const { actor } = useStaffActor();

  const [note, setNote] = useState<StudentNote | null>(null);
  const [studentDisplayName, setStudentDisplayName] = useState("");
  const [recordedByName, setRecordedByName] = useState("");

  const [actionState, setActionState] = useState<ActionState>({
    saving: false,
    error: null,
    savedAt: null,
  });

  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });

  const classInfo = useMemo(() => {
    if (!note?.classId) return null;
    return (
      actor.visibleClasses.find((item) => item.id === note.classId) ?? null
    );
  }, [actor.visibleClasses, note?.classId]);

  const canViewNote = useMemo(() => {
    if (!note) return false;
    if (!note.classId) return true;

    return actor.visibleClasses.some((item) => item.id === note.classId);
  }, [actor.visibleClasses, note]);

  const loadNote = useCallback(async () => {
    setLoadState({
      loading: true,
      error: null,
    });

    try {
      const noteRef = doc(db, "orgs", actor.orgId, "studentNotes", noteId);
      const noteSnap = await getDoc(noteRef);

      if (!noteSnap.exists()) {
        setNote(null);
        setLoadState({
          loading: false,
          error: "لم يتم العثور على الملاحظة.",
        });
        return;
      }

      const nextNote = {
        id: noteSnap.id,
        ...(noteSnap.data() as Omit<StudentNote, "id">),
      };

      if (nextNote.orgId !== actor.orgId) {
        setNote(null);
        setLoadState({
          loading: false,
          error: "الملاحظة لا تتبع المؤسسة الحالية.",
        });
        return;
      }

      const [studentName, recorderName] = await Promise.all([
        loadStudentDisplayName({
          orgId: actor.orgId,
          studentId: nextNote.studentId,
        }),
        loadPersonName({
          orgId: actor.orgId,
          personId: nextNote.recordedByPersonId,
        }),
      ]);

      setNote(nextNote);
      setStudentDisplayName(studentName);
      setRecordedByName(recorderName || nextNote.recordedByPersonId);

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      setNote(null);
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, noteId]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  async function saveUpdatedNote(nextNote: StudentNote) {
    setActionState({
      saving: true,
      error: null,
      savedAt: null,
    });

    try {
      const noteRef = doc(db, "orgs", actor.orgId, "studentNotes", nextNote.id);

      await setDoc(noteRef, compactForFirestore(nextNote), {
        merge: true,
      });

      setNote(nextNote);

      setActionState({
        saving: false,
        error: null,
        savedAt: Date.now(),
      });
    } catch (error) {
      setActionState({
        saving: false,
        error: getErrorMessage(error),
        savedAt: null,
      });
    }
  }

  async function handleStartFollowUp() {
    if (!note) return;

    const nextNote = markStudentNoteFollowUpInProgress(note, {
      followUpByPersonId: actor.personId || actor.uid,
      followUpNote: note.followUpNote || "بدأت متابعة الملاحظة.",
      now: Date.now(),
    });

    await saveUpdatedNote(nextNote);
  }

  async function handleResolveFollowUp() {
    if (!note) return;

    const nextNote = markStudentNoteAsResolved(note, {
      followUpByPersonId: actor.personId || actor.uid,
      followUpNote: note.followUpNote || "تمت معالجة الملاحظة.",
      now: Date.now(),
    });

    await saveUpdatedNote(nextNote);
  }

  async function handleCancelFollowUp() {
    if (!note) return;

    const nextNote = cancelStudentNoteFollowUp(note, {
      followUpByPersonId: actor.personId || actor.uid,
      followUpNote: note.followUpNote || "تم إلغاء متابعة الملاحظة.",
      now: Date.now(),
    });

    await saveUpdatedNote(nextNote);
  }

  if (loadState.loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ تحميل تفاصيل الملاحظة...
        </CardContent>
      </Card>
    );
  }

  {
    actionState.error ? (
      <Card className="border-destructive/30 bg-destructive/10">
        <CardContent className="p-4 text-sm text-destructive">
          تعذر تحديث حالة المتابعة: {actionState.error}
        </CardContent>
      </Card>
    ) : actionState.savedAt ? (
      <Card className="border-emerald-500/30 bg-emerald-500/10">
        <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
          تم تحديث حالة المتابعة بنجاح.
        </CardContent>
      </Card>
    ) : null;
  }

  if (loadState.error || !note) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>تعذر عرض الملاحظة</CardTitle>
          <CardDescription>
            {loadState.error ?? "حدث خطأ أثناء تحميل الملاحظة."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button asChild variant="outline">
            <Link href="/staff/notes">
              <ArrowRight className="size-4" />
              العودة إلى مركز الملاحظات
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canViewNote) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>لا يمكنك عرض هذه الملاحظة</CardTitle>
          <CardDescription>
            الملاحظة مرتبطة بفصل غير موجود ضمن نطاقك الحالي.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button asChild variant="outline">
            <Link href="/staff/notes">
              <ArrowRight className="size-4" />
              العودة إلى مركز الملاحظات
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const classLabel = getClassLabel(classInfo, note.classId);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Milestone 10G</Badge>
                <Badge variant={getStatusVariant(note.status)}>
                  {getStatusLabel(note.status)}
                </Badge>
                <Badge variant={getPriorityVariant(note.priority)}>
                  {getPriorityLabel(note.priority)}
                </Badge>
              </div>

              <h1 className="text-2xl font-bold">
                {note.title || "تفاصيل الملاحظة"}
              </h1>

              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                عرض تفصيلي للملاحظة، بيانات الطالب، التصنيف، الظهور، المتابعة،
                والمصدر المرتبط إن وجد.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/staff/notes">
                  <ArrowRight className="size-4" />
                  مركز الملاحظات
                </Link>
              </Button>

              {note.followUpStatus === "NEEDED" ? (
                <Button
                  type="button"
                  onClick={handleStartFollowUp}
                  disabled={actionState.saving}
                >
                  {actionState.saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  بدء المتابعة
                </Button>
              ) : null}

              {note.followUpStatus === "NEEDED" ||
              note.followUpStatus === "IN_PROGRESS" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResolveFollowUp}
                  disabled={actionState.saving}
                >
                  {actionState.saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  إنهاء المتابعة
                </Button>
              ) : null}

              {note.followUpStatus === "NEEDED" ||
              note.followUpStatus === "IN_PROGRESS" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelFollowUp}
                  disabled={actionState.saving}
                >
                  إلغاء المتابعة
                </Button>
              ) : null}

              {note.classId ? (
                <Button asChild variant="outline">
                  <Link href={`/staff/classes/${note.classId}/notes`}>
                    ملاحظات الفصل
                  </Link>
                </Button>
              ) : null}

              {note.classId ? (
                <Button asChild variant="outline">
                  <Link href={`/staff/classes/${note.classId}`}>فتح الفصل</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoBox
          title="الطالب"
          value={
            <div>
              <div>{studentDisplayName || note.studentId}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {note.studentId}
              </div>
            </div>
          }
          icon={<UserRound className="size-4" />}
        />

        <InfoBox
          title="الفصل"
          value={
            <div>
              <div>{classLabel}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {note.classId || "غير محدد"}
              </div>
            </div>
          }
          icon={<School className="size-4" />}
        />

        <InfoBox
          title="سجّلها"
          value={
            <div>
              <div>{recordedByName || note.recordedByPersonId}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {note.recordedByRoleKey || "دور غير محدد"}
              </div>
            </div>
          }
          icon={<UserPen className="size-4" />}
        />

        <InfoBox
          title="وقت التسجيل"
          value={formatDateTime(note.recordedAt)}
          icon={<CalendarDays className="size-4" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-5 text-primary" />
              <CardTitle>نص الملاحظة</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {note.title ? (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground">العنوان</p>
                <p className="mt-2 font-medium">{note.title}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground">النص</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {note.body}
              </p>
            </div>

            {note.tags.length ? (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground">الوسوم</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {note.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      <Tag className="size-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Eye className="size-5 text-primary" />
              <CardTitle>التصنيف والظهور</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3">
            <InfoBox
              title="التصنيف"
              value={
                <Badge variant="outline">
                  {getCategoryLabel(note.category)}
                </Badge>
              }
            />

            <InfoBox
              title="الأولوية"
              value={
                <Badge variant={getPriorityVariant(note.priority)}>
                  {getPriorityLabel(note.priority)}
                </Badge>
              }
            />

            <InfoBox
              title="الحالة"
              value={
                <Badge variant={getStatusVariant(note.status)}>
                  {getStatusLabel(note.status)}
                </Badge>
              }
            />

            <InfoBox
              title="سياسة الظهور"
              value={
                <Badge variant="outline">
                  {getVisibilityLabel(note.visibility)}
                </Badge>
              }
            />

            <InfoBox
              title="المجموعة"
              value={note.groupNoteId || "ملاحظة فردية"}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>المتابعة</CardTitle>
            <CardDescription>
              حالة المتابعة المرتبطة بهذه الملاحظة.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 md:grid-cols-2">
            <InfoBox
              title="حالة المتابعة"
              value={getFollowUpStatusLabel(note.followUpStatus)}
            />

            <InfoBox
              title="تاريخ المتابعة"
              value={formatDateTime(note.followUpAt)}
            />

            <InfoBox
              title="مسؤول المتابعة"
              value={note.followUpByPersonId || "غير محدد"}
            />

            <InfoBox title="ملاحظة المتابعة" value={note.followUpNote || "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المصدر والروابط</CardTitle>
            <CardDescription>
              معلومات الربط مع الحضور أو القياس أو القضية أو الفاقد إن وجدت.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3">
            <InfoBox
              title="نوع المصدر"
              value={getSourceTypeLabel(note.sourceType)}
              icon={<FileText className="size-4" />}
            />

            <InfoBox title="معرّف المصدر" value={note.sourceId || "—"} />

            <InfoBox title="مسار المصدر" value={note.sourcePath || "—"} />

            <div className="grid gap-3 md:grid-cols-2">
              <InfoBox title="قضية مرتبطة" value={note.linkedCaseId || "—"} />
              <InfoBox
                title="دفعة حضور"
                value={note.linkedAttendanceBatchId || "—"}
              />
              <InfoBox
                title="سجل حضور"
                value={note.linkedAttendanceRecordId || "—"}
              />
              <InfoBox
                title="دفعة قياس"
                value={note.linkedMeasurementBatchId || "—"}
              />
              <InfoBox
                title="سجل قياس"
                value={note.linkedAssessmentRecordId || "—"}
              />
              <InfoBox
                title="متابعة"
                value={note.linkedTrackerEntryId || "—"}
              />
              <InfoBox
                title="خطة فاقد"
                value={note.linkedLearningLossPlanId || "—"}
              />
              <InfoBox
                title="سجل نقل"
                value={note.linkedTransportAttendanceRecordId || "—"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>بيانات النظام</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoBox title="معرّف الملاحظة" value={note.id} />
          <InfoBox title="المؤسسة" value={note.orgId} />
          <InfoBox title="المدرسة" value={note.schoolId} />
          <InfoBox title="السنة الدراسية" value={note.academicYearId} />
          <InfoBox
            title="تاريخ الإنشاء"
            value={formatDateTime(note.createdAt)}
          />
          <InfoBox title="آخر تحديث" value={formatDateTime(note.updatedAt)} />
          <InfoBox
            title="الأرشفة"
            value={
              note.archivedAt
                ? `${formatDateTime(note.archivedAt)} — ${note.archivedByPersonId}`
                : "—"
            }
          />
          <InfoBox
            title="الإلغاء"
            value={
              note.cancelledAt
                ? `${formatDateTime(note.cancelledAt)} — ${
                    note.cancelledByPersonId
                  }`
                : "—"
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حالة الخطوة</CardTitle>
          <CardDescription>
            صفحة تفاصيل الملاحظة تعمل الآن للعرض التفصيلي.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">10F مركز الملاحظات ✅</Badge>
          <Badge variant="secondary">10G تفاصيل الملاحظة ✅</Badge>
          <Badge variant="secondary">10H تحديث حالة المتابعة ✅</Badge>
          <Badge variant="outline">Milestone 10 جاهزة للإغلاق التشغيلي</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
