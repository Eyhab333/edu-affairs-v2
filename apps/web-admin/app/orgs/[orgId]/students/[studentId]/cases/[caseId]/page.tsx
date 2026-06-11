"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Loader2,
  MessageSquareText,
  Save,
  School,
  ShieldAlert,
  Shuffle,
} from "lucide-react";
import {
  CasePriority,
  CaseStatus,
  MembershipRole,
  StudentCaseLogActionType,
  StudentCaseLogEntrySchema,
  StudentCaseRoutingActionType,
  StudentCaseRoutingEventSchema,
  StudentCaseSchema,
} from "@takween/contracts";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
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

type CaseTypeRow = {
  id: string;
  title: string;
};

type CaseRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  caseTypeId: string;
  title: string;
  description?: string;
  status: (typeof CaseStatus.options)[number];
  priority: (typeof CasePriority.options)[number];
  originKind: string;
  currentOwnerRoleKey: string;
  currentAssignedPersonId?: string;
  createdByPersonId: string;
  createdByRoleKey?: string;
  createdAt: number;
  latestNote?: string;
  guardianNotifiedOnCreate?: boolean;
  guardianNotifiedOnForward?: boolean;
  guardianNotifiedOnClose?: boolean;
  resolvedAt?: number;
  resolvedByPersonId?: string;
  closedAt?: number;
  closedByPersonId?: string;
  cancelledAt?: number;
  cancelledByPersonId?: string;
};

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  isActive?: boolean;
};

type RoutingEventRow = {
  id: string;
  caseId: string;
  orgId: string;
  actionType: (typeof StudentCaseRoutingActionType.options)[number];
  fromOwnerRoleKey?: string;
  fromAssignedPersonId?: string;
  toOwnerRoleKey?: string;
  toAssignedPersonId?: string;
  performedByPersonId: string;
  performedByRoleKey?: string;
  performedAt: number;
  note?: string;
  createdAt?: number;
  updatedAt?: number;
};

type LogEntryRow = {
  id: string;
  caseId: string;
  orgId: string;
  actionType: (typeof StudentCaseLogActionType.options)[number];
  createdByPersonId: string;
  createdByRoleKey?: string;
  createdAt: number;
  note?: string;
  attachmentRefId?: string;
  updatedAt?: number;
};

type SchoolRow = {
  id: string;
  name: string;
};

type YearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type PageData = {
  student: StudentRow;
  person: PersonRow;
  school?: SchoolRow | null;
  year?: YearRow | null;
  caseType?: CaseTypeRow | null;
  studentCase: CaseRow;
  memberships: MembershipRow[];
  people: PersonRow[];
  routingEvents: RoutingEventRow[];
  logEntries: LogEntryRow[];
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "OPEN":
      return "مفتوحة";
    case "IN_PROGRESS":
      return "قيد المعالجة";
    case "REFERRED":
      return "محوّلة";
    case "RESOLVED":
      return "محلولة";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status || "—";
  }
}

function getPriorityLabel(priority?: string) {
  switch (priority) {
    case "LOW":
      return "منخفضة";
    case "MEDIUM":
      return "متوسطة";
    case "HIGH":
      return "عالية";
    case "CRITICAL":
      return "حرجة";
    default:
      return priority || "—";
  }
}

function getRoutingActionLabel(action?: string) {
  switch (action) {
    case "CREATE":
      return "إنشاء";
    case "ASSIGN":
      return "إسناد";
    case "FORWARD":
      return "تحويل";
    case "RETURN":
      return "إرجاع";
    case "ESCALATE":
      return "تصعيد";
    case "RESOLVE":
      return "حل";
    case "CLOSE":
      return "إغلاق";
    case "CANCEL":
      return "إلغاء";
    case "REOPEN":
      return "إعادة فتح";
    default:
      return action || "—";
  }
}

function getLogActionLabel(action?: string) {
  switch (action) {
    case "NOTE":
      return "ملاحظة";
    case "MEETING":
      return "اجتماع";
    case "CALL_GUARDIAN":
      return "اتصال بولي الأمر";
    case "NOTIFY_GUARDIAN":
      return "إشعار ولي الأمر";
    case "ATTACHMENT":
      return "مرفق";
    case "STATUS_CHANGE":
      return "تغيير حالة";
    default:
      return action || "—";
  }
}

export default function EditStudentCasePage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string; caseId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;
  const caseId = params.caseId;

  const { user, checkingAuth } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof CasePriority.options)[number]>("MEDIUM");
  const [status, setStatus] = useState<(typeof CaseStatus.options)[number]>("OPEN");
  const [latestNote, setLatestNote] = useState("");
  const [currentOwnerRoleKey, setCurrentOwnerRoleKey] = useState("");
  const [currentAssignedPersonId, setCurrentAssignedPersonId] = useState("");
  const [createdAt, setCreatedAt] = useState<number | undefined>(undefined);
  const [resolvedAt, setResolvedAt] = useState<number | undefined>(undefined);
  const [resolvedByPersonId, setResolvedByPersonId] = useState("");
  const [closedAt, setClosedAt] = useState<number | undefined>(undefined);
  const [closedByPersonId, setClosedByPersonId] = useState("");
  const [cancelledAt, setCancelledAt] = useState<number | undefined>(undefined);
  const [cancelledByPersonId, setCancelledByPersonId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingCore, setSavingCore] = useState(false);

  const [routeActionType, setRouteActionType] =
    useState<(typeof StudentCaseRoutingActionType.options)[number]>("ASSIGN");
  const [routeToOwnerRoleKey, setRouteToOwnerRoleKey] = useState("");
  const [routeToAssignedPersonId, setRouteToAssignedPersonId] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const [routingBusy, setRoutingBusy] = useState(false);

  const [logActionType, setLogActionType] =
    useState<(typeof StudentCaseLogActionType.options)[number]>("NOTE");
  const [logNote, setLogNote] = useState("");
  const [logBusy, setLogBusy] = useState(false);

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const caseRef = doc(db, `orgs/${orgId}/studentCases/${caseId}`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);
    const caseTypesRef = collection(db, `orgs/${orgId}/studentCaseTypes`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const routingRef = collection(db, `orgs/${orgId}/studentCaseRoutingEvents`);
    const logsRef = collection(db, `orgs/${orgId}/studentCaseLogEntries`);

    const [
      studentSnap,
      caseSnap,
      membershipsSnap,
      caseTypesSnap,
      peopleSnap,
      routingSnap,
      logsSnap,
    ] = await Promise.all([
      getDoc(studentRef),
      getDoc(caseRef),
      getDocs(query(membershipsRef)),
      getDocs(query(caseTypesRef)),
      getDocs(query(peopleRef)),
      getDocs(query(routingRef)),
      getDocs(query(logsRef)),
    ]);

    if (!studentSnap.exists() || !caseSnap.exists()) return null;

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<StudentRow, "id">),
    };

    const studentCase = {
      id: caseSnap.id,
      ...(caseSnap.data() as Omit<CaseRow, "id">),
    };

    if (studentCase.studentId !== studentId) return null;

    const personRef = doc(db, `orgs/${orgId}/people/${student.personId}`);
    const schoolRef = doc(db, `orgs/${orgId}/schools/${studentCase.schoolId}`);
    const yearRef = doc(
      db,
      `orgs/${orgId}/schools/${studentCase.schoolId}/academicYears/${studentCase.academicYearId}`
    );

    const [personSnap, schoolSnap, yearSnap] = await Promise.all([
      getDoc(personRef),
      getDoc(schoolRef),
      getDoc(yearRef),
    ]);

    const caseType = caseTypesSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CaseTypeRow, "id">),
      }))
      .find((item) => item.id === studentCase.caseTypeId);

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PersonRow, "id">),
    }));

    const routingEvents = routingSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<RoutingEventRow, "id">),
      }))
      .filter((item) => item.caseId === caseId)
      .sort((a, b) => (b.performedAt ?? 0) - (a.performedAt ?? 0));

    const logEntries = logsSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<LogEntryRow, "id">),
      }))
      .filter((item) => item.caseId === caseId)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

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
      school: schoolSnap.exists()
        ? ({
            id: schoolSnap.id,
            ...(schoolSnap.data() as Omit<SchoolRow, "id">),
          } as SchoolRow)
        : null,
      year: yearSnap.exists()
        ? ({
            id: yearSnap.id,
            schoolId: studentCase.schoolId,
            title: (yearSnap.data() as { title?: string }).title ?? yearSnap.id,
          } as YearRow)
        : null,
      caseType: caseType ?? null,
      studentCase,
      memberships: membershipsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<MembershipRow, "id">),
      })),
      people,
      routingEvents,
      logEntries,
    };
  }, [orgId, studentId, caseId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, studentId, caseId],
  });

  useEffect(() => {
    if (!data) return;

    setTitle(data.studentCase.title);
    setDescription(data.studentCase.description || "");
    setPriority(data.studentCase.priority);
    setStatus(data.studentCase.status);
    setLatestNote(data.studentCase.latestNote || "");
    setCurrentOwnerRoleKey(data.studentCase.currentOwnerRoleKey);
    setCurrentAssignedPersonId(data.studentCase.currentAssignedPersonId || "");
    setCreatedAt(data.studentCase.createdAt);
    setResolvedAt(data.studentCase.resolvedAt);
    setResolvedByPersonId(data.studentCase.resolvedByPersonId || "");
    setClosedAt(data.studentCase.closedAt);
    setClosedByPersonId(data.studentCase.closedByPersonId || "");
    setCancelledAt(data.studentCase.cancelledAt);
    setCancelledByPersonId(data.studentCase.cancelledByPersonId || "");
    setRouteToOwnerRoleKey(data.studentCase.currentOwnerRoleKey || "");
    setRouteToAssignedPersonId(data.studentCase.currentAssignedPersonId || "");
  }, [data]);

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل القضية");
    }
  }, [error]);

  const currentActor = useMemo(() => {
    const membership =
      (data?.memberships ?? []).find(
        (item) => item.uid === user?.uid && item.isActive !== false
      ) ?? null;

    return {
      personId: membership?.personId || user?.uid || "unknown-user",
      roleKey: String(membership?.roleKey || membership?.role || ""),
    };
  }, [data?.memberships, user?.uid]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );

  const roleOptions = useMemo(() => [...MembershipRole.options], []);

  async function saveCore() {
    setSavingCore(true);
    setSaveError(null);

    try {
      if (!data?.studentCase) throw new Error("تعذر تحميل بيانات القضية.");

      const nowMs = Date.now();

      const payload = {
        id: caseId,
        orgId,
        schoolId: data.studentCase.schoolId,
        academicYearId: data.studentCase.academicYearId,
        studentId,
        caseTypeId: data.studentCase.caseTypeId,
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        originKind: data.studentCase.originKind,
        currentOwnerRoleKey: currentOwnerRoleKey || data.studentCase.currentOwnerRoleKey,
        currentAssignedPersonId: currentAssignedPersonId || "",
        createdByPersonId: data.studentCase.createdByPersonId,
        createdByRoleKey: data.studentCase.createdByRoleKey || undefined,
        createdAt: createdAt ?? data.studentCase.createdAt,
        latestNote: latestNote.trim(),
        guardianNotifiedOnCreate: !!data.studentCase.guardianNotifiedOnCreate,
        guardianNotifiedOnForward: !!data.studentCase.guardianNotifiedOnForward,
        guardianNotifiedOnClose: !!data.studentCase.guardianNotifiedOnClose,
        resolvedAt: resolvedAt,
        resolvedByPersonId: resolvedByPersonId,
        closedAt: closedAt,
        closedByPersonId: closedByPersonId,
        cancelledAt: cancelledAt,
        cancelledByPersonId: cancelledByPersonId,
        updatedAt: nowMs,
      };

      const parsed = StudentCaseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/studentCases/${caseId}`), parsed.data, {
        merge: true,
      });

      toast.success("تم حفظ بيانات القضية");
      await reload();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ القضية");
    } finally {
      setSavingCore(false);
    }
  }

  async function executeRoutingAction() {
    setRoutingBusy(true);

    try {
      if (!data?.studentCase) throw new Error("تعذر تحميل بيانات القضية.");

      const nowMs = Date.now();
      const routingId = generateId("case-route");
      const logId = generateId("case-log");

      let nextStatus = data.studentCase.status;
      let nextOwnerRoleKey = data.studentCase.currentOwnerRoleKey;
      let nextAssignedPersonId = data.studentCase.currentAssignedPersonId || "";

      let nextResolvedAt = data.studentCase.resolvedAt;
      let nextResolvedByPersonId = data.studentCase.resolvedByPersonId || "";
      let nextClosedAt = data.studentCase.closedAt;
      let nextClosedByPersonId = data.studentCase.closedByPersonId || "";
      let nextCancelledAt = data.studentCase.cancelledAt;
      let nextCancelledByPersonId = data.studentCase.cancelledByPersonId || "";

      if (routeActionType === "ASSIGN") {
        nextStatus = "IN_PROGRESS";
        nextOwnerRoleKey = routeToOwnerRoleKey || nextOwnerRoleKey;
        nextAssignedPersonId = routeToAssignedPersonId || "";
      } else if (routeActionType === "FORWARD") {
        nextStatus = "REFERRED";
        nextOwnerRoleKey = routeToOwnerRoleKey || nextOwnerRoleKey;
        nextAssignedPersonId = routeToAssignedPersonId || "";
      } else if (routeActionType === "RETURN") {
        nextStatus = "IN_PROGRESS";
        nextOwnerRoleKey = routeToOwnerRoleKey || nextOwnerRoleKey;
        nextAssignedPersonId = routeToAssignedPersonId || "";
      } else if (routeActionType === "ESCALATE") {
        nextStatus = "REFERRED";
        nextOwnerRoleKey = routeToOwnerRoleKey || nextOwnerRoleKey;
        nextAssignedPersonId = routeToAssignedPersonId || "";
      } else if (routeActionType === "RESOLVE") {
        nextStatus = "RESOLVED";
        nextResolvedAt = nowMs;
        nextResolvedByPersonId = currentActor.personId;
      } else if (routeActionType === "CLOSE") {
        nextStatus = "CLOSED";
        nextClosedAt = nowMs;
        nextClosedByPersonId = currentActor.personId;
      } else if (routeActionType === "CANCEL") {
        nextStatus = "CANCELLED";
        nextCancelledAt = nowMs;
        nextCancelledByPersonId = currentActor.personId;
      } else if (routeActionType === "REOPEN") {
        nextStatus = "OPEN";
        nextResolvedAt = undefined;
        nextResolvedByPersonId = "";
        nextClosedAt = undefined;
        nextClosedByPersonId = "";
        nextCancelledAt = undefined;
        nextCancelledByPersonId = "";
      }

      const routingPayload = {
        id: routingId,
        caseId,
        orgId,
        actionType: routeActionType,
        fromOwnerRoleKey: data.studentCase.currentOwnerRoleKey || undefined,
        fromAssignedPersonId: data.studentCase.currentAssignedPersonId || "",
        toOwnerRoleKey: routeToOwnerRoleKey || nextOwnerRoleKey || undefined,
        toAssignedPersonId: routeToAssignedPersonId || nextAssignedPersonId || "",
        performedByPersonId: currentActor.personId,
        performedByRoleKey: currentActor.roleKey || undefined,
        performedAt: nowMs,
        note: routeNote.trim(),
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsedRouting = StudentCaseRoutingEventSchema.safeParse(routingPayload);
      if (!parsedRouting.success) {
        throw new Error(parsedRouting.error.issues.map((i) => i.message).join("\n"));
      }

      const logPayload = {
        id: logId,
        caseId,
        orgId,
        actionType: "STATUS_CHANGE" as const,
        createdByPersonId: currentActor.personId,
        createdByRoleKey: currentActor.roleKey || undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
        note:
          routeNote.trim() ||
          `إجراء: ${getRoutingActionLabel(routeActionType)} — الحالة الجديدة: ${getStatusLabel(nextStatus)}`,
        attachmentRefId: "",
      };

      const parsedLog = StudentCaseLogEntrySchema.safeParse(logPayload);
      if (!parsedLog.success) {
        throw new Error(parsedLog.error.issues.map((i) => i.message).join("\n"));
      }

      const casePayload = {
        ...data.studentCase,
        title: title.trim() || data.studentCase.title,
        description: description.trim(),
        priority,
        status: nextStatus,
        currentOwnerRoleKey: nextOwnerRoleKey,
        currentAssignedPersonId: nextAssignedPersonId,
        latestNote: routeNote.trim() || latestNote.trim() || data.studentCase.latestNote || "",
        resolvedAt: nextResolvedAt,
        resolvedByPersonId: nextResolvedByPersonId,
        closedAt: nextClosedAt,
        closedByPersonId: nextClosedByPersonId,
        cancelledAt: nextCancelledAt,
        cancelledByPersonId: nextCancelledByPersonId,
        updatedAt: nowMs,
      };

      const parsedCase = StudentCaseSchema.safeParse(casePayload);
      if (!parsedCase.success) {
        throw new Error(parsedCase.error.issues.map((i) => i.message).join("\n"));
      }

      await Promise.all([
        setDoc(doc(db, `orgs/${orgId}/studentCases/${caseId}`), parsedCase.data, {
          merge: true,
        }),
        setDoc(
          doc(db, `orgs/${orgId}/studentCaseRoutingEvents/${routingId}`),
          parsedRouting.data
        ),
        setDoc(
          doc(db, `orgs/${orgId}/studentCaseLogEntries/${logId}`),
          parsedLog.data
        ),
      ]);

      toast.success("تم تنفيذ الإجراء");
      setRouteNote("");
      await reload();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setRoutingBusy(false);
    }
  }

  async function addLogEntry() {
    setLogBusy(true);

    try {
      if (!logNote.trim()) {
        throw new Error("أدخل ملاحظة أو محتوى السجل أولًا.");
      }

      const nowMs = Date.now();
      const logId = generateId("case-log");

      const logPayload = {
        id: logId,
        caseId,
        orgId,
        actionType: logActionType,
        createdByPersonId: currentActor.personId,
        createdByRoleKey: currentActor.roleKey || undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
        note: logNote.trim(),
        attachmentRefId: "",
      };

      const parsedLog = StudentCaseLogEntrySchema.safeParse(logPayload);
      if (!parsedLog.success) {
        throw new Error(parsedLog.error.issues.map((i) => i.message).join("\n"));
      }

      await Promise.all([
        setDoc(doc(db, `orgs/${orgId}/studentCaseLogEntries/${logId}`), parsedLog.data),
        setDoc(
          doc(db, `orgs/${orgId}/studentCases/${caseId}`),
          {
            latestNote: logNote.trim(),
            updatedAt: nowMs,
          },
          { merge: true }
        ),
      ]);

      toast.success("تمت إضافة السجل");
      setLogNote("");
      await reload();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setLogBusy(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[920px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="القضية"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title="تعذر العثور على القضية"
        description="قد تكون القضية غير موجودة أو لا تتبع هذا الطالب."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}/cases`}>
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
        badge="القضية"
        badgeIcon={<ShieldAlert className="h-3.5 w-3.5" />}
        title={title || data?.studentCase.title || "القضية"}
        description={`الطالب: ${data?.person.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}/cases`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button onClick={saveCore} disabled={savingCore}>
              {savingCore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ بيانات القضية
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="معلومات مرجعية"
        description="مرجع سريع قبل تعديل الحالة أو تنفيذ الإجراء."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            المدرسة:{" "}
            <span className="font-medium text-foreground">
              {data?.school?.name ?? data?.studentCase.schoolId}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <School className="h-4 w-4" />
            السنة:{" "}
            <span className="font-medium text-foreground">
              {data?.year?.title ?? data?.studentCase.academicYearId}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          النوع:{" "}
          <span className="font-medium text-foreground">
            {data?.caseType?.title ?? data?.studentCase.caseTypeId}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          أُنشئت بتاريخ:{" "}
          <span className="font-medium text-foreground">
            {formatDate(data?.studentCase.createdAt)}
          </span>
        </div>
      </FormSection>

      <FormSection
        title="بيانات القضية"
        description="تحديث العنوان والوصف والأولوية والجهة المالكة الحالية."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {String(error ?? saveError)}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">عنوان القضية</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
                  {getPriorityLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة الحالية</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof CaseStatus.options)[number])}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {CaseStatus.options.map((item) => (
                <option key={item} value={item}>
                  {getStatusLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المالك الحالي</label>
            <select
              value={currentOwnerRoleKey}
              onChange={(e) => setCurrentOwnerRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {roleOptions.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {roleKey}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الشخص المعيّن حاليًا</label>
            <select
              value={currentAssignedPersonId}
              onChange={(e) => setCurrentAssignedPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName ?? person.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الوصف</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">آخر ملخص سريع</label>
          <textarea
            value={latestNote}
            onChange={(e) => setLatestNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
      </FormSection>

      <FormSection
        title="تنفيذ إجراء"
        description="تحويل، إرجاع، تصعيد، حل، إغلاق، إلغاء، أو إعادة فتح."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الإجراء</label>
            <select
              value={routeActionType}
              onChange={(e) =>
                setRouteActionType(
                  e.target.value as (typeof StudentCaseRoutingActionType.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {StudentCaseRoutingActionType.options
                .filter((item) => item !== "CREATE")
                .map((item) => (
                  <option key={item} value={item}>
                    {getRoutingActionLabel(item)}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">إلى الدور</label>
            <select
              value={routeToOwnerRoleKey}
              onChange={(e) => setRouteToOwnerRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون تغيير</option>
              {roleOptions.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {roleKey}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">إلى الشخص</label>
            <select
              value={routeToAssignedPersonId}
              onChange={(e) => setRouteToAssignedPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName ?? person.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ملاحظة الإجراء</label>
          <textarea
            value={routeNote}
            onChange={(e) => setRouteNote(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div>
          <Button onClick={executeRoutingAction} disabled={routingBusy}>
            {routingBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التنفيذ...
              </>
            ) : (
              <>
                <Shuffle className="h-4 w-4" />
                تنفيذ الإجراء
              </>
            )}
          </Button>
        </div>
      </FormSection>

      <FormSection
        title="إضافة سجل / ملاحظة"
        description="أضف إدخالًا جديدًا إلى سجل القضية."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع السجل</label>
            <select
              value={logActionType}
              onChange={(e) =>
                setLogActionType(
                  e.target.value as (typeof StudentCaseLogActionType.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {StudentCaseLogActionType.options.map((item) => (
                <option key={item} value={item}>
                  {getLogActionLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">النص</label>
            <textarea
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div>
          <Button onClick={addLogEntry} disabled={logBusy}>
            {logBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ الإضافة...
              </>
            ) : (
              <>
                <MessageSquareText className="h-4 w-4" />
                إضافة إلى السجل
              </>
            )}
          </Button>
        </div>
      </FormSection>

      <FormSection
        title="سجل التحويلات والإجراءات"
        description="كل إجراءات التحويل والإسناد والحل والإغلاق المرتبطة بالقضية."
        contentClassName="space-y-4"
      >
        {(data?.routingEvents.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد أحداث تحويل حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.routingEvents ?? []).map((event) => (
              <div key={event.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                    {getRoutingActionLabel(event.actionType)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.performedAt)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div>
                    من:{" "}
                    <span className="font-medium text-foreground">
                      {event.fromOwnerRoleKey || "—"}
                    </span>
                    {" "} / الشخص:{" "}
                    <span className="font-medium text-foreground">
                      {peopleMap.get(event.fromAssignedPersonId || "") || "—"}
                    </span>
                  </div>

                  <div>
                    إلى:{" "}
                    <span className="font-medium text-foreground">
                      {event.toOwnerRoleKey || "—"}
                    </span>
                    {" "} / الشخص:{" "}
                    <span className="font-medium text-foreground">
                      {peopleMap.get(event.toAssignedPersonId || "") || "—"}
                    </span>
                  </div>

                  <div>
                    بواسطة:{" "}
                    <span className="font-medium text-foreground">
                      {peopleMap.get(event.performedByPersonId) || event.performedByPersonId}
                    </span>
                    {" "} ({event.performedByRoleKey || "—"})
                  </div>

                  <div>
                    الملاحظة:{" "}
                    <span className="font-medium text-foreground">
                      {event.note || "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="السجل النصي"
        description="الملاحظات والإجراءات النصية المرتبطة بالقضية."
        contentClassName="space-y-4"
      >
        {(data?.logEntries.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد إدخالات سجل حتى الآن.
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.logEntries ?? []).map((entry) => (
              <div key={entry.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {getLogActionLabel(entry.actionType)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div>
                    بواسطة:{" "}
                    <span className="font-medium text-foreground">
                      {peopleMap.get(entry.createdByPersonId) || entry.createdByPersonId}
                    </span>
                    {" "} ({entry.createdByRoleKey || "—"})
                  </div>

                  <div>
                    النص:{" "}
                    <span className="font-medium text-foreground">
                      {entry.note || "—"}
                    </span>
                  </div>

                  {entry.attachmentRefId ? (
                    <div>
                      المرجع المرتبط:{" "}
                      <span className="font-medium text-foreground">
                        {entry.attachmentRefId}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}