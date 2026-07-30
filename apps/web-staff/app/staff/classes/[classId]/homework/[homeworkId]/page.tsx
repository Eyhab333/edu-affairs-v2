"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  StudentHomeworkAssignmentSchema,
  StudentHomeworkSubmissionSchema,
  type StudentHomeworkAssignment,
  type StudentHomeworkSubmission,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import { useStaffActor } from "@/components/staff/staff-actor-provider";

type StaffVisibleClass = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  streamId?: string;
  code?: string;
  title?: string;
  sectionLabel?: string;
  order?: number;
};

type StudentEnrollmentTarget = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  studentId?: string;
  gradeId?: string;
  classId?: string;
  status?: string;
};

function formatNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

function formatDateTime(value?: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getHomeworkStatusLabel(status: StudentHomeworkAssignment["status"]) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "PUBLISHED":
      return "منشور";
    case "CLOSED":
      return "مغلق";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغى";
    default:
      return status;
  }
}

function getSubmissionStatusLabel(status: StudentHomeworkSubmission["status"]) {
  switch (status) {
    case "NOT_STARTED":
      return "لم يبدأ";
    case "IN_PROGRESS":
      return "قيد الحل";
    case "SUBMITTED":
      return "تم التسليم";
    case "LATE_SUBMITTED":
      return "تسليم متأخر";
    case "GRADED":
      return "تم التصحيح";
    case "RETURNED":
      return "معاد للطالب";
    case "CANCELLED":
      return "ملغى";
    default:
      return status;
  }
}

function getSubmissionStatusClass(status: StudentHomeworkSubmission["status"]) {
  switch (status) {
    case "NOT_STARTED":
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "SUBMITTED":
      return "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900";
    case "LATE_SUBMITTED":
      return "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900";
    case "GRADED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
    case "RETURNED":
      return "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
  }
}

function getQuestionTypeLabel(
  type: StudentHomeworkAssignment["questions"][number]["questionType"],
) {
  switch (type) {
    case "TRUE_FALSE":
      return "صح / خطأ";
    case "MULTIPLE_CHOICE":
      return "اختيار من متعدد";
    case "SHORT_ANSWER":
      return "إجابة قصيرة";
    default:
      return type;
  }
}

function getDifficultyLabel(
  difficulty: StudentHomeworkAssignment["questions"][number]["difficulty"],
) {
  switch (difficulty) {
    case "EASY":
      return "سهل";
    case "MEDIUM":
      return "متوسط";
    case "HARD":
      return "صعب";
    case "CHALLENGE":
      return "تحدي";
    default:
      return difficulty;
  }
}

function findVisibleClass(params: {
  classes: StaffVisibleClass[];
  assignment: StudentHomeworkAssignment;
}) {
  const { classes, assignment } = params;

  return (
    classes.find((item) => {
      return (
        item.id === assignment.classId &&
        item.schoolId === assignment.schoolId &&
        item.academicYearId === assignment.academicYearId
      );
    }) ??
    classes.find((item) => {
      return (
        item.id === assignment.classId && item.schoolId === assignment.schoolId
      );
    }) ??
    classes.find((item) => item.id === assignment.classId) ??
    null
  );
}

function buildQuestionBankHref(params: {
  classId: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  subjectKey: string;
  classSubjectOfferingId: string;
}) {
  const queryParams = new URLSearchParams();

  if (params.schoolId) queryParams.set("schoolId", params.schoolId);
  if (params.academicYearId) {
    queryParams.set("academicYearId", params.academicYearId);
  }
  if (params.gradeId) queryParams.set("gradeId", params.gradeId);

  queryParams.set("subjectKey", params.subjectKey);
  queryParams.set("classSubjectOfferingId", params.classSubjectOfferingId);

  const queryString = queryParams.toString();

  return `/staff/classes/${encodeURIComponent(params.classId)}/question-bank${
    queryString ? `?${queryString}` : ""
  }`;
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildHomeworkSubmissionId(params: {
  homeworkId: string;
  studentId: string;
}) {
  return `${params.homeworkId}_${encodeURIComponent(params.studentId)}`;
}

async function loadActiveStudentTargetsForHomework(params: {
  orgId: string;
  assignment: StudentHomeworkAssignment;
}) {
  const { orgId, assignment } = params;

  const enrollmentsRef = collection(db, "orgs", orgId, "studentEnrollments");

  /**
   * نقرأ بالـ classId لتقليل القراءة،
   * ثم نفلتر بالسياق الكامل حتى لا نعتمد على classId وحده.
   */
  const snap = await getDocs(
    query(enrollmentsRef, where("classId", "==", assignment.classId)),
  );

  const rows = snap.docs.map((docSnap) => {
    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as StudentEnrollmentTarget;
  });

  const targetsByStudentId = new Map<
    string,
    {
      studentId: string;
      enrollmentId: string;
    }
  >();

  rows
    .filter((row) => row.schoolId === assignment.schoolId)
    .filter((row) => row.academicYearId === assignment.academicYearId)
    .filter((row) => row.classId === assignment.classId)
    .filter((row) => row.status === "ACTIVE")
    .forEach((row) => {
      const studentId = row.studentId || "";

      if (!studentId || targetsByStudentId.has(studentId)) return;

      targetsByStudentId.set(studentId, {
        studentId,
        enrollmentId: row.id,
      });
    });

  return Array.from(targetsByStudentId.values());
}

export default function StaffHomeworkDetailsPage() {
  const params = useParams<{
    classId: string;
    homeworkId: string;
  }>();

  const { actor } = useStaffActor();

  const classId = String(params.classId || "");
  const homeworkId = String(params.homeworkId || "");

  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadHomework =
    useCallback(async (): Promise<StudentHomeworkAssignment | null> => {
      if (!actor?.orgId || !homeworkId) return null;

      const ref = doc(
        db,
        "orgs",
        actor.orgId,
        "studentHomeworkAssignments",
        homeworkId,
      );

      const snap = await getDoc(ref);

      if (!snap.exists()) return null;

      return StudentHomeworkAssignmentSchema.parse({
        id: snap.id,
        ...snap.data(),
      });
    }, [actor?.orgId, homeworkId]);

  const {
    data: assignment,
    loading,
    error,
    notFound,
    reload,
    setData,
  } = useDocumentLoader<StudentHomeworkAssignment>({
    enabled: Boolean(actor?.orgId && homeworkId),
    loader: loadHomework,
    deps: [actor?.orgId, homeworkId],
  });

  const loadSubmissions = useCallback(async (): Promise<
    StudentHomeworkSubmission[]
  > => {
    if (!actor?.orgId || !homeworkId || !assignment) {
      return [];
    }

    const ref = collection(
      db,
      "orgs",
      actor.orgId,
      "studentHomeworkSubmissions",
    );

    const snap = await getDocs(
      query(
        ref,
        where("homeworkId", "==", homeworkId),
        where("schoolId", "==", assignment.schoolId),
        where("academicYearId", "==", assignment.academicYearId),
        where("termId", "==", assignment.termId),
        where("classId", "==", assignment.classId),
        where("subjectKey", "==", assignment.subjectKey),
        where(
          "classSubjectOfferingId",
          "==",
          assignment.classSubjectOfferingId,
        ),
      ),
    );

    return snap.docs
      .map((docSnap) => {
        return StudentHomeworkSubmissionSchema.parse({
          id: docSnap.id,
          ...docSnap.data(),
        });
      })
      .sort((a, b) => {
        const aTime = a.submittedAt ?? a.updatedAt ?? a.createdAt ?? 0;
        const bTime = b.submittedAt ?? b.updatedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
      });
  }, [
    actor?.orgId,
    homeworkId,
    assignment?.schoolId,
    assignment?.academicYearId,
    assignment?.termId,
    assignment?.classId,
    assignment?.subjectKey,
    assignment?.classSubjectOfferingId,
  ]);

  const {
    data: submissions,
    loading: submissionsLoading,
    error: submissionsError,
    reload: reloadSubmissions,
  } = useDocumentLoader<StudentHomeworkSubmission[]>({
    enabled: Boolean(actor?.orgId && homeworkId && assignment?.id),
    loader: loadSubmissions,
    deps: [actor?.orgId, homeworkId, assignment?.id],
  });

  const submissionStats = useMemo(() => {
    const rows = submissions ?? [];

    const notStartedCount = rows.filter(
      (item) => item.status === "NOT_STARTED",
    ).length;

    const inProgressCount = rows.filter(
      (item) => item.status === "IN_PROGRESS",
    ).length;

    const submittedCount = rows.filter((item) =>
      ["SUBMITTED", "LATE_SUBMITTED"].includes(item.status),
    ).length;

    const gradedCount = rows.filter((item) => item.status === "GRADED").length;

    const returnedCount = rows.filter(
      (item) => item.status === "RETURNED",
    ).length;

    return {
      total: rows.length,
      notStartedCount,
      inProgressCount,
      submittedCount,
      gradedCount,
      returnedCount,
    };
  }, [submissions]);

  const visibleClass = useMemo(() => {
    if (!actor || !assignment) return null;

    return findVisibleClass({
      classes: (actor.visibleClasses ?? []) as StaffVisibleClass[],
      assignment,
    });
  }, [actor, assignment]);

  const questionBankHref = assignment
    ? buildQuestionBankHref({
        classId: assignment.classId,
        schoolId: assignment.schoolId,
        academicYearId: assignment.academicYearId,
        gradeId: assignment.gradeId,
        subjectKey: assignment.subjectKey,
        classSubjectOfferingId: assignment.classSubjectOfferingId,
      })
    : `/staff/classes/${encodeURIComponent(classId)}`;

  const canPublish = assignment?.status === "DRAFT";

  async function handlePublish() {
    if (!actor?.orgId || !assignment) return;

    setActionError(null);

    if (assignment.status !== "DRAFT") {
      setActionError("لا يمكن نشر واجب ليس في حالة مسودة.");
      return;
    }

    if (assignment.questions.length === 0) {
      setActionError("لا يمكن نشر واجب بدون أسئلة.");
      return;
    }

    const now = Date.now();

    setPublishing(true);

    try {
      const studentTargets = await loadActiveStudentTargetsForHomework({
        orgId: actor.orgId,
        assignment,
      });

      if (studentTargets.length === 0) {
        setActionError(
          "لا يمكن نشر الواجب لأن الفصل لا يحتوي على طلاب نشطين مرتبطين به.",
        );
        return;
      }

      const targetStudentIds = studentTargets.map((target) => target.studentId);

      const assignmentRef = doc(
        db,
        "orgs",
        actor.orgId,
        "studentHomeworkAssignments",
        assignment.id,
      );

      const batch = writeBatch(db);

      const nextAssignmentPatch = {
        status: "PUBLISHED",
        publishMode: "PUBLISH_NOW",
        targetStudentIds,
        targetCount: targetStudentIds.length,
        missingCount: targetStudentIds.length,
        submittedCount: 0,
        gradedCount: 0,
        publishedAt: now,
        updatedAt: now,
      } as const;

      batch.update(assignmentRef, nextAssignmentPatch);

      studentTargets.forEach((target) => {
        const submissionId = buildHomeworkSubmissionId({
          homeworkId: assignment.id,
          studentId: target.studentId,
        });

        const submissionRef = doc(
          db,
          "orgs",
          actor.orgId,
          "studentHomeworkSubmissions",
          submissionId,
        );

        const submission = StudentHomeworkSubmissionSchema.parse({
          id: submissionId,

          orgId: assignment.orgId,
          schoolId: assignment.schoolId,
          academicYearId: assignment.academicYearId,

          termId: assignment.termId,
          termTitle: assignment.termTitle,
          termShortTitle: assignment.termShortTitle,

          homeworkId: assignment.id,

          homeworkTitle: assignment.title,
          homeworkDescription: assignment.description,
          homeworkDueAt: assignment.dueAt,
          homeworkPublishedAt: now,
          homeworkQuestions: assignment.questions,

          studentId: target.studentId,
          enrollmentId: target.enrollmentId,

          gradeId: assignment.gradeId,
          classId: assignment.classId,

          subjectKey: assignment.subjectKey,
          classSubjectOfferingId: assignment.classSubjectOfferingId,

          answers: [],

          score: 0,
          maxScore: assignment.maxScore,

          status: "NOT_STARTED",

          gradedByPersonId: "",
          feedback: "",

          isLate: false,
          note: "",

          createdAt: now,
          updatedAt: now,
        });

        batch.set(submissionRef, stripUndefined(submission));
      });

      await batch.commit();

      setData((current) =>
        current
          ? {
              ...current,
              ...nextAssignmentPatch,
            }
          : current,
      );
      void reloadSubmissions();
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : "حدث خطأ أثناء نشر الواجب وإنشاء تسليمات الطلاب.";
      setActionError(message);
    } finally {
      setPublishing(false);
    }
  }

  if (!actor) {
    return (
      <main className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تحميل بيانات المستخدم...
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تحميل الواجب...
          </div>
        </div>
      </main>
    );
  }

  if (error || notFound || !assignment) {
    return (
      <main className="space-y-5">
        <Link
          href={`/staff/classes/${encodeURIComponent(classId)}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للفصل
        </Link>

        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="font-bold">تعذر فتح الواجب</h1>
              <p className="mt-2 text-sm leading-7">
                {error || "لم يتم العثور على الواجب المطلوب."}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!visibleClass) {
    return (
      <main className="space-y-5">
        <Link
          href="/staff/classes"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لفصولي
        </Link>

        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h1 className="font-bold">لا يمكن فتح هذا الواجب</h1>
              <p className="mt-2 text-sm leading-7">
                الواجب لا يرتبط بفصل موجود ضمن نطاق المستخدم الحالي.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={questionBankHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لبffنك الأسئلة
        </Link>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            تحpديث
          </button>

          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={!canPublish || publishing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-black transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            نشر الواجب
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <BookOpenCheck className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                تفاصيل الواجب
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                {assignment.title}
              </h1>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  الفصل: {visibleClass.title || visibleClass.code || classId}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  المادة: {assignment.subjectKey}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  الحالة: {getHomeworkStatusLabel(assignment.status)}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  الفصل الدراسي:{" "}
                  {assignment.termShortTitle ||
                    assignment.termTitle ||
                    assignment.termId}
                </span>
              </div>

              {assignment.description ? (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {assignment.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[34rem]">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الأسئلة
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(assignment.questions.length)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الدرجة
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(assignment.maxScore)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                المستهدفون
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(assignment.targetCount)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                التسليمات
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatNumber(assignment.submittedCount)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {actionError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-bold">تعذر تنفيذ الإجراء</h2>
              <p className="mt-2 text-sm leading-7">{actionError}</p>
            </div>
          </div>
        </section>
      ) : null}

      {assignment.status === "PUBLISHED" ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <div>
              <h2 className="font-bold">تم نشر الواجب</h2>
              <p className="mt-2 text-sm leading-7">
                تاريخ النشر: {formatDateTime(assignment.publishedAt)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold">تسليمات الطلاب</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              تظهر هنا التسليمات التي أُنشئت تلقائيًا عند نشر الواجب.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void reloadSubmissions()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث التسليمات
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              الإجمالي
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.total)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              لم يبدأ
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.notStartedCount)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              قيد الحل
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.inProgressCount)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تم التسليم
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.submittedCount)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تم التصحيح
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.gradedCount)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
            <p className="text-xs text-slate-500 dark:text-slate-400">معاد</p>
            <p className="mt-1 text-2xl font-black">
              {formatNumber(submissionStats.returnedCount)}
            </p>
          </div>
        </div>

        {submissionsError ? (
          <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <h3 className="font-bold">تعذر تحميل التسليمات</h3>
                <p className="mt-2 text-sm leading-7">{submissionsError}</p>
              </div>
            </div>
          </div>
        ) : null}

        {submissionsLoading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : null}

        {!submissionsLoading && (submissions ?? []).length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <h3 className="font-bold">لا توجد تسليمات بعد</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
              إذا كان الواجب ما زال مسودة فهذا طبيعي. عند نشر الواجب سيتم إنشاء
              تسليم مستقل لكل طالب مستهدف.
            </p>
          </div>
        ) : null}

        {!submissionsLoading && (submissions ?? []).length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(submissions ?? []).map((submission) => (
              <article
                key={submission.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                      الطالب
                    </p>

                    <h3 className="mt-2 truncate font-bold text-slate-950 dark:text-white">
                      {submission.studentId}
                    </h3>

                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      enrollmentId: {submission.enrollmentId || "—"}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getSubmissionStatusClass(
                      submission.status,
                    )}`}
                  >
                    {getSubmissionStatusLabel(submission.status)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      الدرجة
                    </span>
                    <span className="font-semibold">
                      {formatNumber(submission.score)} /{" "}
                      {formatNumber(submission.maxScore)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      بدأ في
                    </span>
                    <span className="font-semibold">
                      {formatDateTime(submission.startedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      سلّم في
                    </span>
                    <span className="font-semibold">
                      {formatDateTime(submission.submittedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      صُحح في
                    </span>
                    <span className="font-semibold">
                      {formatDateTime(submission.gradedAt)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <ListChecks className="h-5 w-5 text-violet-700 dark:text-violet-300" />
            <h2 className="font-bold">أسئلة الواجب Snapshot</h2>
          </div>

          <div className="mt-5 space-y-3">
            {assignment.questions.map((question, index) => (
              <article
                key={question.id}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                      السؤال {formatNumber(index + 1)} —{" "}
                      {getQuestionTypeLabel(question.questionType)}
                    </p>

                    <h3 className="mt-2 font-bold leading-7 text-slate-950 dark:text-white">
                      {question.title || question.prompt}
                    </h3>
                  </div>

                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
                    {getDifficultyLabel(question.difficulty)}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  {question.prompt}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    الدرجة: {formatNumber(question.maxScore)}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    التصحيح: {question.gradingMode}
                  </span>
                </div>

                {question.questionType === "MULTIPLE_CHOICE" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                      الاختيارات
                    </p>

                    <div className="space-y-1">
                      {question.choices.map((choice) => {
                        const isCorrect = question.correctChoiceIds.includes(
                          choice.id,
                        );

                        return (
                          <div
                            key={choice.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-slate-600 dark:text-slate-300">
                              {choice.text}
                            </span>

                            {isCorrect ? (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                صحيح
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {question.questionType !== "MULTIPLE_CHOICE" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400">
                      الإجابة الصحيحة:
                    </span>
                    <span className="ms-2 font-semibold text-slate-800 dark:text-slate-100">
                      {question.questionType === "TRUE_FALSE"
                        ? question.correctAnswer === "true"
                          ? "صح"
                          : "خطأ"
                        : question.correctAnswer || "—"}
                    </span>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-violet-700 dark:text-violet-300" />
              <h2 className="font-bold">معلومات النشر</h2>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  الحالة
                </span>
                <span className="font-bold">
                  {getHomeworkStatusLabel(assignment.status)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  تاريخ الإنشاء
                </span>
                <span className="font-bold">
                  {formatDateTime(assignment.createdAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  تاريخ النشر
                </span>
                <span className="font-bold">
                  {formatDateTime(assignment.publishedAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
                <span className="text-slate-500 dark:text-slate-400">
                  موعد التسليم
                </span>
                <span className="font-bold">
                  {formatDateTime(assignment.dueAt)}
                </span>
              </div>
            </div>
          </section>

          {assignment.status === "DRAFT" ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              هذا الواجب ما زال مسودة. عند الضغط على نشر الواجب سيتم تحويله إلى
              PUBLISHED. استهداف الطلاب وإنشاء التسليمات التفصيلية سيأتي في
              الخطوة التالية.
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
