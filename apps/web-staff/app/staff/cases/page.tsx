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
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-400">
        <Inbox className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function CaseCard({ item }: { item: StudentCase }) {
  return (
    <Link
      href={`/staff/cases/${item.id}`}
      className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-slate-700 hover:bg-slate-900/70"
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

          <h3 className="line-clamp-1 text-base font-semibold text-slate-50">
            {item.title}
          </h3>

          <div className="mt-2 grid gap-1 text-sm text-slate-400">
            <p>
              الطالب:{" "}
              <span className="font-medium text-slate-200">
                {item.studentDisplayName}
              </span>
            </p>

            <p>
              الفصل:{" "}
              <span className="text-slate-300">
                {item.classTitle ?? item.classId ?? "—"}
              </span>
            </p>

            <p>
              المسؤول الحالي:{" "}
              <span className="text-slate-300">
                {item.currentAssigneeDisplayName ?? "غير محدد"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 md:flex-col md:items-end">
          <span className="text-xs text-slate-500">
            آخر تحديث: {formatDateTime(item.updatedAt)}
          </span>

          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300">
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
  const [orgId, setOrgId] = useState<string | null>(null);
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
        setOrgId(null);
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
      setOrgId(nextOrgId);
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
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-center py-24">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري تحميل القضايا...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/50 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <FileText className="h-4 w-4" />
              قضايا وإحالات الطلاب
            </div>

            <h1 className="text-2xl font-bold text-slate-50">
              القضايا والإحالات
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              تابع القضايا المحالة إليك والقضايا التي أنشأتها.
            </p>

            {identity?.displayName ? (
              <p className="mt-1 text-xs text-slate-500">
                المستخدم: {identity.displayName}
              </p>
            ) : null}
          </div>

          <Link
            href="/staff/cases/new"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            إحالة جديدة
          </Link>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">تعذر تحميل البيانات</p>
              <p className="mt-1 text-red-100/80">{error}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-400">محالة لي</p>
            <p className="mt-2 text-3xl font-bold text-slate-50">
              {assignedCases.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-400">أنشأتها</p>
            <p className="mt-2 text-3xl font-bold text-slate-50">
              {createdCases.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-400">المؤسسة الحالية</p>
            <p className="mt-2 truncate text-lg font-semibold text-slate-50">
              {orgId ?? "—"}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("assigned")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "assigned"
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-950 text-slate-300 hover:bg-slate-900"
              }`}
            >
              محالة لي
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("created")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "created"
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-950 text-slate-300 hover:bg-slate-900"
              }`}
            >
              أنشأتها
            </button>

            <button
              type="button"
              onClick={() => void loadCases()}
              className="me-auto rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900"
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
