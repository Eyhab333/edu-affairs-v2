"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  Inbox,
  Loader2,
  Plus,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import type { StudentCase } from "@takween/contracts";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { db } from "@/lib/firebase";
import { ensureSelectedOrgId } from "@/lib/org";
import { getStaffOrgDisplayName } from "@/lib/staff-actor-helpers";
import { getCasesAssignedToMe, getCasesCreatedByMe } from "@/lib/student-cases";

type CasesTab = "assigned" | "created";

type StaffIdentity = {
  personId: string;
  displayName?: string;
  roleKey?: string;
};

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

const PRIORITY_LABEL: Record<StudentCase["priority"], string> = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
};

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
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "IN_REVIEW":
    case "IN_PROGRESS":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "WAITING_PARENT":
      return "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300";
    case "ESCALATED":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "RESOLVED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "CLOSED":
      return "border-border bg-muted text-muted-foreground";
    case "CANCELLED":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getPriorityClass(priority: StudentCase["priority"]) {
  switch (priority) {
    case "URGENT":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "HIGH":
      return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "NORMAL":
      return "border-border bg-muted text-muted-foreground";
    case "LOW":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
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

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function CaseCard({ item }: { item: StudentCase }) {
  return (
    <Link
      href={`/staff/cases/${item.id}`}
      className="block rounded-2xl border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={getStatusClass(item.status)}>
              {STATUS_LABEL[item.status]}
            </Badge>
            <Badge className={getPriorityClass(item.priority)}>
              {PRIORITY_LABEL[item.priority]}
            </Badge>
          </div>

          <h3 className="line-clamp-1 text-base font-semibold text-foreground">
            {item.title}
          </h3>

          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <p>
              الطالب:{" "}
              <span className="font-medium text-foreground">
                {item.studentDisplayName}
              </span>
            </p>

            <p>
              الفصل:{" "}
              <span className="text-foreground">
                {item.classTitle ?? item.classId ?? "—"}
              </span>
            </p>

            <p>
              المسؤول الحالي:{" "}
              <span className="text-foreground">
                {item.currentAssigneeDisplayName ?? "غير محدد"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 md:flex-col md:items-end">
          <span className="text-xs text-muted-foreground">
            آخر تحديث: {formatDateTime(item.updatedAt)}
          </span>

          <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            فتح التفاصيل
            <ArrowLeft className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
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

export default function StaffCasesPage() {
  const { user, checkingAuth } = useRequireAuth();

  const [activeTab, setActiveTab] = useState<CasesTab>("assigned");
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [assignedCases, setAssignedCases] = useState<StudentCase[]>([]);
  const [createdCases, setCreatedCases] = useState<StudentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeCases = useMemo(() => {
    return activeTab === "assigned" ? assignedCases : createdCases;
  }, [activeTab, assignedCases, createdCases]);

  const { actor } = useStaffActor();

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        actor.visibleClasses
          .map((item) => item.schoolId)
          .filter(
            (schoolId): schoolId is string =>
              typeof schoolId === "string" && schoolId.trim().length > 0,
          ),
      ),
    );
  }, [actor.visibleClasses]);

  const loadCases = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const nextOrgId = await ensureSelectedOrgId(user.uid);

      if (!nextOrgId) {
        setIdentity(null);
        setAssignedCases([]);
        setCreatedCases([]);
        setError("لم يتم العثور على مؤسسة مرتبطة بهذا المستخدم.");
        return;
      }

      const nextIdentity = await loadStaffIdentity(user.uid);
      const [assigned, created] = await Promise.all([
        getCasesAssignedToMe({
          orgId: nextOrgId,
          personId: nextIdentity.personId,
          schoolIds: visibleSchoolIds,
        }),

        getCasesCreatedByMe({
          orgId: nextOrgId,
          personId: nextIdentity.personId,
          schoolIds: visibleSchoolIds,
        }),
      ]);
      setIdentity(nextIdentity);
      setAssignedCases(assigned);
      setCreatedCases(created);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "تعذر تحميل القضايا.");
    } finally {
      setLoading(false);
    }
  }, [user, visibleSchoolIds]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadCases();
    }
  }, [checkingAuth, user, loadCases]);

  if (checkingAuth || loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-center py-24">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري تحميل القضايا...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
              <FileText className="h-4 w-4" />
              قضايا وإحالات الطلاب
            </div>

            <h1 className="text-2xl font-bold text-foreground">
              القضايا والإحالات
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              تابع القضايا المحالة إليك والقضايا التي أنشأتها.
            </p>

            {identity?.displayName ? (
              <p className="mt-1 text-xs text-muted-foreground">
                المستخدم: {identity.displayName}
              </p>
            ) : null}
          </div>

          <Link
            href="/staff/cases/new"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            إحالة جديدة
          </Link>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">تعذر تحميل البيانات</p>
              <p className="mt-1 opacity-80">{error}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">محالة لي</p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {assignedCases.length}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">أنشأتها</p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {createdCases.length}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">المؤسسة الحالية</p>
            <p className="mt-2 truncate text-lg font-semibold text-foreground">
              {getStaffOrgDisplayName(actor)}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("assigned")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "assigned"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              محالة لي
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("created")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "created"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              أنشأتها
            </button>

            <button
              type="button"
              onClick={() => void loadCases()}
              className="me-auto rounded-2xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              تحديث
            </button>
          </div>

          {activeCases.length ? (
            <div className="space-y-3">
              {activeCases.map((item) => (
                <CaseCard key={item.id} item={item} />
              ))}
            </div>
          ) : activeTab === "assigned" ? (
            <EmptyState
              title="لا توجد قضايا محالة إليك"
              description="عند تحويل قضية إليك ستظهر هنا مباشرة."
            />
          ) : (
            <EmptyState
              title="لم تنشئ قضايا بعد"
              description="القضايا التي تنشئها للطلاب ستظهر هنا لمتابعة حالتها."
            />
          )}
        </section>
      </div>
    </main>
  );
}
