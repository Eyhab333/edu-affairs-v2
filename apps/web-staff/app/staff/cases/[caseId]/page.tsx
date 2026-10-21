"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
  User,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import type {
  StudentCase,
  StudentCaseEvent,
  StudentCaseStatus,
} from "@takween/contracts";
import { buildStudentCaseTimeline } from "@takween/domain";

import { StudentCaseAssigneePicker } from "@/components/staff/cases/student-case-assignee-picker";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { db } from "@/lib/firebase";
import { ensureSelectedOrgId } from "@/lib/org";
import {
  addStudentCaseAction,
  getStudentCase,
  getStudentCaseEvents,
  transferStudentCase,
  type StudentCaseReferralRecipient,
} from "@/lib/student-cases";

type TimelineItem = ReturnType<typeof buildStudentCaseTimeline>[number];

type StaffIdentity = {
  personId: string;
  displayName?: string;
  roleKey?: string;
};

type ActionEventType = Extract<
  StudentCaseEvent["eventType"],
  | "COMMENT_ADDED"
  | "ACTION_ADDED"
  | "PARENT_CONTACTED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED"
  | "VISIBILITY_CHANGED"
>;

type TransferEventType = Extract<
  StudentCaseEvent["eventType"],
  "TRANSFERRED" | "ESCALATED" | "RETURNED"
>;

const STATUS_LABEL: Record<StudentCase["status"], string> = {
  OPEN: "مفتوحة",
  IN_REVIEW: "قيد المراجعة",
  IN_PROGRESS: "قيد المعالجة",
  WAITING_PARENT: "بانتظار ولي الأمر",
  ESCALATED: "مصعّدة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
};

const STATUS_OPTIONS: { value: StudentCaseStatus; label: string }[] = [
  { value: "OPEN", label: "مفتوحة" },
  { value: "IN_REVIEW", label: "قيد المراجعة" },
  { value: "IN_PROGRESS", label: "قيد المعالجة" },
  { value: "WAITING_PARENT", label: "بانتظار ولي الأمر" },
  { value: "ESCALATED", label: "مصعّدة" },
  { value: "RESOLVED", label: "تم الحل" },
  { value: "CLOSED", label: "مغلقة" },
  { value: "CANCELLED", label: "ملغاة" },
];

const ACTION_EVENT_TYPE_OPTIONS: { value: ActionEventType; label: string }[] = [
  { value: "ACTION_ADDED", label: "إضافة إجراء" },
  { value: "COMMENT_ADDED", label: "إضافة تعليق" },
  { value: "PARENT_CONTACTED", label: "تواصل مع ولي الأمر" },
  { value: "RESOLVED", label: "تم الحل" },
  { value: "CLOSED", label: "إغلاق القضية" },
  { value: "REOPENED", label: "إعادة فتح" },
  { value: "CANCELLED", label: "إلغاء القضية" },
  { value: "VISIBILITY_CHANGED", label: "تغيير ظهور ولي الأمر" },
];

const TRANSFER_EVENT_TYPE_OPTIONS: {
  value: TransferEventType;
  label: string;
}[] = [
  { value: "TRANSFERRED", label: "تحويل" },
  { value: "ESCALATED", label: "تصعيد" },
  { value: "RETURNED", label: "إعادة" },
];

const PRIORITY_LABEL: Record<StudentCase["priority"], string> = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
};

const PARENT_VISIBILITY_LABEL: Record<StudentCase["parentVisibility"], string> = {
  INTERNAL_ONLY: "داخلي فقط",
  SUMMARY_VISIBLE: "ملخص لولي الأمر",
  FULL_VISIBLE: "ظاهر بالكامل لولي الأمر",
};

const EVENT_TYPE_LABEL: Record<StudentCaseEvent["eventType"], string> = {
  CREATED: "إنشاء",
  REFERRED: "إحالة",
  COMMENT_ADDED: "تعليق",
  ACTION_ADDED: "إجراء",
  TRANSFERRED: "تحويل",
  ESCALATED: "تصعيد",
  RETURNED: "إعادة",
  PARENT_CONTACTED: "تواصل مع ولي الأمر",
  RESOLVED: "تم الحل",
  CLOSED: "إغلاق",
  REOPENED: "إعادة فتح",
  CANCELLED: "إلغاء",
  VISIBILITY_CHANGED: "تغيير الظهور",
};

function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDateTime(value?: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClass(status: StudentCase["status"]) {
  switch (status) {
    case "OPEN":
      return "border-blue-500/30 bg-blue-500/10 text-blue-200";
    case "IN_REVIEW":
    case "IN_PROGRESS":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "WAITING_PARENT":
      return "border-purple-500/30 bg-purple-500/10 text-purple-200";
    case "ESCALATED":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "RESOLVED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "CLOSED":
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
    case "CANCELLED":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function getPriorityClass(priority: StudentCase["priority"]) {
  switch (priority) {
    case "URGENT":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "HIGH":
      return "border-orange-500/30 bg-orange-500/10 text-orange-200";
    case "NORMAL":
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
    case "LOW":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function resolveActionStatusAfter(params: {
  eventType: ActionEventType;
  selectedStatus: StudentCaseStatus | "";
}) {
  if (params.selectedStatus) return params.selectedStatus;

  if (params.eventType === "RESOLVED") return "RESOLVED";
  if (params.eventType === "CLOSED") return "CLOSED";
  if (params.eventType === "CANCELLED") return "CANCELLED";
  if (params.eventType === "REOPENED") return "OPEN";

  return undefined;
}

async function loadStaffIdentity(uid: string): Promise<StaffIdentity> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return {
      personId: uid,
    };
  }

  const data = userSnap.data() as {
    personId?: string;
    displayName?: string;
    name?: string;
    roleKey?: string;
    role?: string;
  };

  return {
    personId: data.personId ?? uid,
    displayName: data.displayName ?? data.name,
    roleKey: data.roleKey ?? data.role,
  };
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
        <span className="text-emerald-300">{icon}</span>
        {label}
      </div>

      <div className="text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

function TimelineNote({ event }: { event: StudentCaseEvent }) {
  const hasNotes = event.note || event.internalNote || event.parentVisibleNote;

  if (!hasNotes) return null;

  return (
    <div className="mt-3 space-y-2">
      {event.note ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm leading-6 text-slate-300">
          {event.note}
        </p>
      ) : null}

      {event.internalNote ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
          <span className="font-semibold">ملاحظة داخلية: </span>
          {event.internalNote}
        </p>
      ) : null}

      {event.parentVisibleNote ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100">
          <span className="font-semibold">ملاحظة لولي الأمر: </span>
          {event.parentVisibleNote}
        </p>
      ) : null}
    </div>
  );
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const event = item.event;

  return (
    <div className="relative border-s-2 border-slate-800 pb-6 ps-5 last:pb-0">
      <span className="absolute -start-[9px] top-1 flex h-4 w-4 rounded-full border border-emerald-400 bg-slate-950" />

      <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                {EVENT_TYPE_LABEL[event.eventType]}
              </Badge>

              {event.statusAfter ? (
                <Badge className={getStatusClass(event.statusAfter)}>
                  {STATUS_LABEL[event.statusAfter]}
                </Badge>
              ) : null}
            </div>

            <h3 className="text-sm font-semibold text-slate-50">{item.label}</h3>

            <p className="mt-1 text-xs text-slate-500">
              بواسطة: {event.createdByDisplayName ?? event.createdByPersonId}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarClock className="h-4 w-4" />
            {formatDateTime(event.createdAt)}
          </div>
        </div>

        {(event.fromAssigneeDisplayName || event.toAssigneeDisplayName) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-500">من</p>
              <p className="mt-1 text-sm text-slate-200">
                {event.fromAssigneeDisplayName ?? "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-500">إلى</p>
              <p className="mt-1 text-sm text-slate-200">
                {event.toAssigneeDisplayName ?? "—"}
              </p>
            </div>
          </div>
        ) : null}

        <TimelineNote event={event} />
      </article>
    </div>
  );
}

export default function StaffCaseDetailsPage() {
  const params = useParams();
  const caseId = getRouteParam(params?.caseId);

  const { user, checkingAuth } = useRequireAuth();

  const [studentCase, setStudentCase] = useState<StudentCase | null>(null);
  const [events, setEvents] = useState<StudentCaseEvent[]>([]);
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionEventType, setActionEventType] =
    useState<ActionEventType>("ACTION_ADDED");
  const [actionStatusAfter, setActionStatusAfter] = useState<
    StudentCaseStatus | ""
  >("");
  const [actionNote, setActionNote] = useState("");
  const [actionInternalNote, setActionInternalNote] = useState("");
  const [actionParentVisibleNote, setActionParentVisibleNote] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const [transferEventType, setTransferEventType] =
    useState<TransferEventType>("TRANSFERRED");
  const [transferStatusAfter, setTransferStatusAfter] = useState<
    StudentCaseStatus | ""
  >("");
  const [transferRecipient, setTransferRecipient] =
    useState<StudentCaseReferralRecipient | null>(null);
  const [transferNote, setTransferNote] = useState("");
  const [transferInternalNote, setTransferInternalNote] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);

  const timeline = useMemo(() => buildStudentCaseTimeline(events), [events]);

  const loadCase = useCallback(async () => {
    if (!user || !caseId) return;

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const nextOrgId = await ensureSelectedOrgId(user.uid);

      if (!nextOrgId) {
        setOrgId(null);
        setStudentCase(null);
        setEvents([]);
        setIdentity(null);
        setError("لم يتم العثور على مؤسسة مرتبطة بهذا المستخدم.");
        return;
      }

      const [nextIdentity, nextCase, nextEvents] = await Promise.all([
        loadStaffIdentity(user.uid),
        getStudentCase({
          orgId: nextOrgId,
          caseId,
        }),
        getStudentCaseEvents({
          orgId: nextOrgId,
          caseId,
        }),
      ]);

      if (!nextCase) {
        setNotFound(true);
        setStudentCase(null);
        setEvents([]);
        setIdentity(nextIdentity);
        return;
      }

      setOrgId(nextOrgId);
      setIdentity(nextIdentity);
      setStudentCase(nextCase);
      setEvents(nextEvents);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "تعذر تحميل تفاصيل القضية.");
    } finally {
      setLoading(false);
    }
  }, [user, caseId]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadCase();
    }
  }, [checkingAuth, user, loadCase]);

  async function handleAddAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!orgId || !studentCase || !identity) return;

    const hasAnyNote =
      actionNote.trim() ||
      actionInternalNote.trim() ||
      actionParentVisibleNote.trim();

    if (!hasAnyNote && !actionStatusAfter) {
      setError("اكتب ملاحظة أو اختر حالة جديدة قبل حفظ الإجراء.");
      return;
    }

    setSavingAction(true);
    setError(null);

    try {
      await addStudentCaseAction({
        orgId,
        caseId: studentCase.id,
        actor: {
          personId: identity.personId,
          displayName: identity.displayName,
          roleKey: identity.roleKey,
        },
        eventType: actionEventType,
        statusAfter: resolveActionStatusAfter({
          eventType: actionEventType,
          selectedStatus: actionStatusAfter,
        }),
        note: actionNote.trim() || undefined,
        internalNote: actionInternalNote.trim() || undefined,
        parentVisibleNote: actionParentVisibleNote.trim() || undefined,
      });

      setActionEventType("ACTION_ADDED");
      setActionStatusAfter("");
      setActionNote("");
      setActionInternalNote("");
      setActionParentVisibleNote("");

      await loadCase();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "تعذر حفظ الإجراء.");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!orgId || !studentCase || !identity) return;

    if (!transferRecipient) {
      setError("اختر الموظف المحال إليه قبل تحويل القضية.");
      return;
    }

    setSavingTransfer(true);
    setError(null);

    try {
      await transferStudentCase({
        orgId,
        caseId: studentCase.id,
        actor: {
          personId: identity.personId,
          displayName: identity.displayName,
          roleKey: identity.roleKey,
        },
        toAssignee: {
          personId: transferRecipient.personId,
          displayName: transferRecipient.displayName,
          roleKey: transferRecipient.roleKey,
        },
        eventType: transferEventType,
        statusAfter: transferStatusAfter || undefined,
        note: transferNote.trim() || undefined,
        internalNote: transferInternalNote.trim() || undefined,
      });

      setTransferEventType("TRANSFERRED");
      setTransferStatusAfter("");
      setTransferRecipient(null);
      setTransferNote("");
      setTransferInternalNote("");

      await loadCase();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "تعذر تحويل القضية.");
    } finally {
      setSavingTransfer(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-center py-24">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري تحميل تفاصيل القضية...
          </div>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link
            href="/staff/cases"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع للقضايا
          </Link>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-amber-300" />
            <h1 className="text-xl font-bold text-slate-50">
              لم يتم العثور على القضية
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              ربما تم حذفها أو لا تملك صلاحية الوصول إليها.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!studentCase) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link
            href="/staff/cases"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع للقضايا
          </Link>

          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-100">
            تعذر تحميل القضية.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href="/staff/cases"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع للقضايا
          </Link>

          <button
            type="button"
            onClick={() => void loadCase()}
            className="w-fit rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900"
          >
            تحديث
          </button>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">تعذر تنفيذ العملية</p>
              <p className="mt-1 text-red-100/80">{error}</p>
            </div>
          </div>
        ) : null}

        <header className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className={getStatusClass(studentCase.status)}>
              {STATUS_LABEL[studentCase.status]}
            </Badge>

            <Badge className={getPriorityClass(studentCase.priority)}>
              {PRIORITY_LABEL[studentCase.priority]}
            </Badge>

            <Badge className="border-slate-500/30 bg-slate-500/10 text-slate-200">
              {PARENT_VISIBILITY_LABEL[studentCase.parentVisibility]}
            </Badge>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                <FileText className="h-4 w-4" />
                تفاصيل قضية طالب
              </div>

              <h1 className="text-2xl font-bold text-slate-50">
                {studentCase.title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                {studentCase.description}
              </p>
            </div>

            <div className="shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              <p>رقم القضية</p>
              <p className="mt-1 max-w-[220px] truncate font-mono text-xs text-slate-200">
                {studentCase.id}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={<User className="h-4 w-4" />}
            label="الطالب"
            value={
              <div className="space-y-1">
                <p>{studentCase.studentDisplayName}</p>
                <p className="text-xs text-slate-500">{studentCase.studentId}</p>
              </div>
            }
          />

          <InfoCard
            icon={<FileText className="h-4 w-4" />}
            label="الفصل"
            value={studentCase.classTitle ?? studentCase.classId ?? "—"}
          />

          <InfoCard
            icon={<UserCheck className="h-4 w-4" />}
            label="المسؤول الحالي"
            value={
              studentCase.currentAssigneeDisplayName ??
              studentCase.currentAssigneePersonId ??
              "غير محدد"
            }
          />

          <InfoCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="آخر تحديث"
            value={formatDateTime(studentCase.updatedAt)}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-5 flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-emerald-300" />
              <h2 className="text-lg font-bold text-slate-50">
                تاريخ الإحالات والإجراءات
              </h2>
            </div>

            {timeline.length ? (
              <div>
                {timeline.map((item) => (
                  <TimelineCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
                <p className="text-sm text-slate-400">
                  لا توجد أحداث مسجلة لهذه القضية حتى الآن.
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <form
              onSubmit={handleAddAction}
              className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <div className="mb-4 flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-300" />
                <h2 className="text-base font-bold text-slate-50">
                  إضافة إجراء
                </h2>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    نوع الإجراء
                  </span>
                  <select
                    value={actionEventType}
                    onChange={(event) =>
                      setActionEventType(event.target.value as ActionEventType)
                    }
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  >
                    {ACTION_EVENT_TYPE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    تغيير الحالة — اختياري
                  </span>
                  <select
                    value={actionStatusAfter}
                    onChange={(event) =>
                      setActionStatusAfter(
                        event.target.value as StudentCaseStatus | ""
                      )
                    }
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  >
                    <option value="">بدون تغيير</option>
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    ملاحظة عامة
                  </span>
                  <textarea
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="اكتب الإجراء أو التعليق..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    ملاحظة داخلية — اختياري
                  </span>
                  <textarea
                    value={actionInternalNote}
                    onChange={(event) =>
                      setActionInternalNote(event.target.value)
                    }
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="ملاحظة لا تظهر لولي الأمر..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    ملاحظة ظاهرة لولي الأمر — اختياري
                  </span>
                  <textarea
                    value={actionParentVisibleNote}
                    onChange={(event) =>
                      setActionParentVisibleNote(event.target.value)
                    }
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="اكتب ما يمكن أن يظهر لولي الأمر..."
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingAction}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAction ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  حفظ الإجراء
                </button>
              </div>
            </form>

            <form
              onSubmit={handleTransfer}
              className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <div className="mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-300" />
                <h2 className="text-base font-bold text-slate-50">
                  تحويل القضية
                </h2>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    نوع التحويل
                  </span>
                  <select
                    value={transferEventType}
                    onChange={(event) =>
                      setTransferEventType(
                        event.target.value as TransferEventType
                      )
                    }
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  >
                    {TRANSFER_EVENT_TYPE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    حالة القضية بعد التحويل — اختياري
                  </span>
                  <select
                    value={transferStatusAfter}
                    onChange={(event) =>
                      setTransferStatusAfter(
                        event.target.value as StudentCaseStatus | ""
                      )
                    }
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  >
                    <option value="">بدون تغيير</option>
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-1 block text-xs text-slate-400">
                    المحال إليه
                  </span>
                  <StudentCaseAssigneePicker
                    orgId={orgId ?? ""}
                    schoolId={studentCase.schoolId}
                    value={transferRecipient}
                    onValueChange={setTransferRecipient}
                    excludePersonIds={[
                      studentCase.currentAssigneePersonId ?? "",
                    ]}
                    disabled={!orgId || savingTransfer}
                    placeholder="ابحث عن موظف مخول لاستلام القضية"
                  />
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    سبب التحويل — اختياري
                  </span>
                  <textarea
                    value={transferNote}
                    onChange={(event) => setTransferNote(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="سبب أو ملاحظة التحويل..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">
                    ملاحظة داخلية — اختياري
                  </span>
                  <textarea
                    value={transferInternalNote}
                    onChange={(event) =>
                      setTransferInternalNote(event.target.value)
                    }
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    placeholder="ملاحظة داخلية مع التحويل..."
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingTransfer ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  تحويل القضية
                </button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5">
              <h2 className="text-base font-bold text-slate-50">
                معلومات القضية
              </h2>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">نوع القضية</dt>
                  <dd className="mt-1 text-slate-200">
                    {studentCase.caseTypeTitle ?? studentCase.caseTypeKey}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">أنشأها</dt>
                  <dd className="mt-1 text-slate-200">
                    {studentCase.createdByDisplayName ??
                      studentCase.createdByPersonId}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">تاريخ الإنشاء</dt>
                  <dd className="mt-1 text-slate-200">
                    {formatDateTime(studentCase.createdAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">المؤسسة</dt>
                  <dd className="mt-1 text-slate-200">{orgId ?? "—"}</dd>
                </div>

                <div>
                  <dt className="text-slate-500">المدرسة</dt>
                  <dd className="mt-1 text-slate-200">{studentCase.schoolId}</dd>
                </div>

                <div>
                  <dt className="text-slate-500">السنة الدراسية</dt>
                  <dd className="mt-1 text-slate-200">
                    {studentCase.academicYearId}
                  </dd>
                </div>

                {studentCase.termTitle || studentCase.termId ? (
                  <div>
                    <dt className="text-slate-500">الفصل الدراسي</dt>
                    <dd className="mt-1 text-slate-200">
                      {studentCase.termTitle ?? studentCase.termId}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {studentCase.parentVisibleSummary ? (
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <h2 className="text-base font-bold text-emerald-100">
                  ملخص ولي الأمر
                </h2>

                <p className="mt-3 text-sm leading-7 text-emerald-50/90">
                  {studentCase.parentVisibleSummary}
                </p>
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
