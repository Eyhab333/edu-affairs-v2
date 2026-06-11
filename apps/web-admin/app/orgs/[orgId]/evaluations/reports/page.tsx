"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, Building2 } from "lucide-react";
import { collection, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import { getSubmissionTargetPersonId } from "@/lib/evaluation-read-model";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";

type SchoolRow = {
  id: string;
  name: string;
};

type PlanRow = {
  id: string;
  title: string;
};

type CycleRow = {
  id: string;
  label: string;
  planId?: string;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type SubmissionRow = {
  id: string;
  planId: string;
  cycleId?: string;
  cycleLabel?: string;
  schoolId: string;
  academicYearId: string;
  evaluatorPersonId: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
  targetRoleKey?: string;
  status: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  summary?: string;
  recommendations?: string;
  submittedAt?: number;
  approvedAt?: number;
  reviewedAt?: number;
  lockedAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

type PageData = {
  schools: SchoolRow[];
  plans: PlanRow[];
  cycles: CycleRow[];
  people: PersonRow[];
  submissions: SubmissionRow[];
};

type AggregateRow = {
  key: string;
  label: string;
  submissionsCount: number;
  targetsCount: number;
  approvedCount: number;
  averagePercentage: number;
};

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[640px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function getStatusLabel(status?: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مُرسل";
    case "UNDER_REVIEW":
      return "قيد المراجعة";
    case "APPROVED":
      return "معتمد";
    case "RETURNED":
      return "معاد";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغى";
    default:
      return status || "—";
  }
}

function getActivityAt(row: SubmissionRow) {
  return (
    row.updatedAt ??
    row.approvedAt ??
    row.reviewedAt ??
    row.submittedAt ??
    row.createdAt ??
    0
  );
}

function getPercentage(row: SubmissionRow) {
  const total = Number(row.totalScore || 0);
  const max = Number(row.maxScore || 0);
  if (max <= 0) return 0;
  return (total / max) * 100;
}

function buildAggregateRows(
  rows: SubmissionRow[],
  getKey: (row: SubmissionRow) => string,
  getLabel: (key: string) => string
) {
  const grouped = new Map<string, SubmissionRow[]>();

  for (const row of rows) {
    const key = getKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const results: AggregateRow[] = [];

  for (const [key, group] of grouped.entries()) {
    const targets = new Set(
      group.map((row) => getSubmissionTargetPersonId(row)).filter(Boolean)
    );

    const approvedCount = group.filter((row) =>
      ["APPROVED", "LOCKED"].includes(row.status)
    ).length;

    const averagePercentage =
      group.length > 0
        ? round2(
            group.reduce((sum, row) => sum + getPercentage(row), 0) / group.length
          )
        : 0;

    results.push({
      key,
      label: getLabel(key),
      submissionsCount: group.length,
      targetsCount: targets.size,
      approvedCount,
      averagePercentage,
    });
  }

  return results.sort((a, b) => {
    if (b.averagePercentage !== a.averagePercentage) {
      return b.averagePercentage - a.averagePercentage;
    }
    return b.submissionsCount - a.submissionsCount;
  });
}

export default function EvaluationReportsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { user, checkingAuth } = useRequireAuth();

  const [schoolId, setSchoolId] = useState("");
  const [planId, setPlanId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [targetRoleKey, setTargetRoleKey] = useState("");

  const loadPage = useCallback(async (): Promise<PageData> => {
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const cyclesRef = collection(db, `orgs/${orgId}/evaluationCycles`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const submissionsRef = collection(db, `orgs/${orgId}/evaluationSubmissions`);

    const [schoolsSnap, plansSnap, cyclesSnap, peopleSnap, submissionsSnap] =
      await Promise.all([
        getDocs(query(schoolsRef)),
        getDocs(query(plansRef)),
        getDocs(query(cyclesRef)),
        getDocs(query(peopleRef)),
        getDocs(query(submissionsRef)),
      ]);

    return {
      schools: schoolsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolRow, "id">),
      })),
      plans: plansSnap.docs.map((item) => ({
        id: item.id,
        title: (item.data() as { title?: string }).title ?? item.id,
      })),
      cycles: cyclesSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<CycleRow, "id">),
      })),
      people: peopleSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      })),
      submissions: submissionsSnap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<SubmissionRow, "id">),
        }))
        .sort((a, b) => getActivityAt(b) - getActivityAt(a)),
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل التقارير");
  }, [error]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );
  const planMap = useMemo(
    () => new Map((data?.plans ?? []).map((item) => [item.id, item.title])),
    [data?.plans]
  );
  const cycleMap = useMemo(
    () => new Map((data?.cycles ?? []).map((item) => [item.id, item.label])),
    [data?.cycles]
  );
  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );

  const cycleOptions = useMemo(() => {
    if (!planId) return data?.cycles ?? [];
    return (data?.cycles ?? []).filter((item) => item.planId === planId);
  }, [data?.cycles, planId]);

  useEffect(() => {
    if (cycleId && !cycleOptions.some((item) => item.id === cycleId)) {
      setCycleId("");
    }
  }, [cycleId, cycleOptions]);

  const filteredSubmissions = useMemo(() => {
    return (data?.submissions ?? []).filter((row) => {
      if (schoolId && row.schoolId !== schoolId) return false;
      if (planId && row.planId !== planId) return false;
      if (cycleId && row.cycleId !== cycleId) return false;
      if (targetRoleKey && (row.targetRoleKey || "") !== targetRoleKey) return false;
      return true;
    });
  }, [data?.submissions, schoolId, planId, cycleId, targetRoleKey]);

  const uniqueTargets = useMemo(
    () =>
      new Set(
        filteredSubmissions.map((row) => getSubmissionTargetPersonId(row)).filter(Boolean)
      ).size,
    [filteredSubmissions]
  );

  const approvedCount = useMemo(
    () =>
      filteredSubmissions.filter((row) =>
        ["APPROVED", "LOCKED"].includes(row.status)
      ).length,
    [filteredSubmissions]
  );

  const averagePercentage = useMemo(
    () =>
      filteredSubmissions.length > 0
        ? round2(
            filteredSubmissions.reduce((sum, row) => sum + getPercentage(row), 0) /
              filteredSubmissions.length
          )
        : 0,
    [filteredSubmissions]
  );

  const bySchool = useMemo(
    () =>
      buildAggregateRows(
        filteredSubmissions,
        (row) => row.schoolId || "—",
        (key) => schoolMap.get(key) ?? key
      ),
    [filteredSubmissions, schoolMap]
  );

  const byPlan = useMemo(
    () =>
      buildAggregateRows(
        filteredSubmissions,
        (row) => row.planId || "—",
        (key) => planMap.get(key) ?? key
      ),
    [filteredSubmissions, planMap]
  );

  const byCycle = useMemo(
    () =>
      buildAggregateRows(
        filteredSubmissions,
        (row) => row.cycleId || row.cycleLabel || "—",
        (key) => cycleMap.get(key) ?? key
      ),
    [filteredSubmissions, cycleMap]
  );

  const byTargetRole = useMemo(
    () =>
      buildAggregateRows(
        filteredSubmissions,
        (row) => row.targetRoleKey || "—",
        (key) => key
      ),
    [filteredSubmissions]
  );

  const latestRows = useMemo(
    () => filteredSubmissions.slice(0, 10),
    [filteredSubmissions]
  );

  if (checkingAuth || loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHero
        badge="التقارير"
        badgeIcon={<BarChart3 className="h-3.5 w-3.5" />}
        title="تقارير التقييمات"
        description="مقارنات حسب المدرسة والخطة والدورة والدور المستهدف."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/evaluations`}>
              <ArrowLeft className="h-4 w-4" />
              العودة إلى التقييمات
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="الإدخالات" value={filteredSubmissions.length} hint="بعد تطبيق الفلاتر" />
        <InfoCard label="المستهدفون" value={uniqueTargets} hint="Unique targets" />
        <InfoCard label="المعتمدة/المقفلة" value={approvedCount} hint="APPROVED + LOCKED" />
        <InfoCard label="متوسط النسبة %" value={averagePercentage} hint="Average submission %" />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل البيانات."
          contentClassName="space-y-4"
        >
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="الفلاتر"
        description="يمكنك تضييق المقارنة حسب أي بعد تريد."
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">المدرسة</label>
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">الكل</option>
            {(data?.schools ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الخطة</label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">الكل</option>
            {(data?.plans ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الدورة</label>
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">الكل</option>
            {cycleOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الدور المستهدف</label>
          <input
            value={targetRoleKey}
            onChange={(e) => setTargetRoleKey(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
            placeholder="مثال: teacher"
          />
        </div>
      </FormSection>

      <FormSection
        title="مقارنة حسب المدرسة"
        description="أداء المدارس ضمن الفلاتر الحالية."
        contentClassName="space-y-4"
      >
        {bySchool.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد بيانات مطابقة.
          </div>
        ) : (
          <div className="grid gap-4">
            {bySchool.map((row) => (
              <div key={row.key} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-bold">{row.label}</h3>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <div>
                        الإدخالات:{" "}
                        <span className="font-medium text-foreground">{row.submissionsCount}</span>
                      </div>
                      <div>
                        المستهدفون:{" "}
                        <span className="font-medium text-foreground">{row.targetsCount}</span>
                      </div>
                      <div>
                        المعتمدة/المقفلة:{" "}
                        <span className="font-medium text-foreground">{row.approvedCount}</span>
                      </div>
                      <div>
                        متوسط النسبة:{" "}
                        <span className="font-medium text-foreground">{row.averagePercentage}%</span>
                      </div>
                    </div>
                  </div>

                  {row.key !== "—" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orgs/${orgId}/evaluations/reports/schools/${row.key}`}>
                          فتح لوحة المدرسة
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <FormSection
          title="مقارنة حسب الخطة"
          description="مقارنة سريعة بين الخطط."
          contentClassName="space-y-4"
        >
          {byPlan.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              لا توجد بيانات مطابقة.
            </div>
          ) : (
            <div className="grid gap-3">
              {byPlan.map((row) => (
                <div key={row.key} className="rounded-2xl border bg-card px-4 py-4">
                  <div className="font-medium">{row.label}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    الإدخالات: <span className="font-medium text-foreground">{row.submissionsCount}</span>
                    {" "}— المستهدفون: <span className="font-medium text-foreground">{row.targetsCount}</span>
                    {" "}— المتوسط: <span className="font-medium text-foreground">{row.averagePercentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>

        <FormSection
          title="مقارنة حسب الدورة"
          description="مقارنة سريعة بين الدورات."
          contentClassName="space-y-4"
        >
          {byCycle.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              لا توجد بيانات مطابقة.
            </div>
          ) : (
            <div className="grid gap-3">
              {byCycle.map((row) => (
                <div key={row.key} className="rounded-2xl border bg-card px-4 py-4">
                  <div className="font-medium">{row.label}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    الإدخالات: <span className="font-medium text-foreground">{row.submissionsCount}</span>
                    {" "}— المستهدفون: <span className="font-medium text-foreground">{row.targetsCount}</span>
                    {" "}— المتوسط: <span className="font-medium text-foreground">{row.averagePercentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

      <FormSection
        title="مقارنة حسب الدور المستهدف"
        description="كيف يتغير الأداء بين الأدوار المستهدفة."
        contentClassName="space-y-4"
      >
        {byTargetRole.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد بيانات مطابقة.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {byTargetRole.map((row) => (
              <div key={row.key} className="rounded-2xl border bg-card px-4 py-4">
                <div className="font-medium">{row.label}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  الإدخالات: <span className="font-medium text-foreground">{row.submissionsCount}</span>
                  <br />
                  المستهدفون: <span className="font-medium text-foreground">{row.targetsCount}</span>
                  <br />
                  المتوسط: <span className="font-medium text-foreground">{row.averagePercentage}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="أحدث الإدخالات"
        description="آخر الإدخالات ضمن الفلاتر الحالية."
        contentClassName="space-y-4"
      >
        {latestRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد إدخالات مطابقة.
          </div>
        ) : (
          <div className="grid gap-4">
            {latestRows.map((row) => {
              const targetId = getSubmissionTargetPersonId(row);
              return (
                <div key={row.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">
                          {peopleMap.get(targetId) || targetId || "—"}
                        </h3>

                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                          {getStatusLabel(row.status)}
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground">
                        <div>
                          الخطة:{" "}
                          <span className="font-medium text-foreground">
                            {planMap.get(row.planId) ?? row.planId}
                          </span>
                        </div>
                        <div>
                          الدورة:{" "}
                          <span className="font-medium text-foreground">
                            {cycleMap.get(row.cycleId || "") || row.cycleLabel || "—"}
                          </span>
                        </div>
                        <div>
                          المدرسة:{" "}
                          <span className="font-medium text-foreground">
                            {schoolMap.get(row.schoolId) ?? row.schoolId}
                          </span>
                        </div>
                        <div>
                          النسبة:{" "}
                          <span className="font-medium text-foreground">
                            {round2(getPercentage(row))}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {targetId ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/orgs/${orgId}/evaluations/summary/${targetId}`}>
                            فتح Summary
                          </Link>
                        </Button>
                      ) : null}

                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orgs/${orgId}/evaluations/submissions/${row.id}`}>
                          فتح الإدخال
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FormSection>
    </div>
  );
}