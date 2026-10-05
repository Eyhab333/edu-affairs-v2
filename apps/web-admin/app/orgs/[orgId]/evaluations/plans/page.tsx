"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, GitBranch, RefreshCcw, Settings2 } from "lucide-react";
import { collection, getDocs, query } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FirestoreRow = { id: string; [key: string]: unknown };

type PageData = {
  schools: FirestoreRow[];
  frameworks: FirestoreRow[];
  people: FirestoreRow[];
  plans: FirestoreRow[];
  cycles: FirestoreRow[];
  targetAssignments: FirestoreRow[];
  evaluatorAssignments: FirestoreRow[];
  submissions: FirestoreRow[];
};

type Filters = {
  schoolId: string;
  academicYearId: string;
  termId: string;
  frameworkId: string;
  evaluatorPersonId: string;
  targetRoleKey: string;
  status: string;
};

const EMPTY_FILTERS: Filters = {
  schoolId: "",
  academicYearId: "",
  termId: "",
  frameworkId: "",
  evaluatorPersonId: "",
  targetRoleKey: "",
  status: "",
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function statusOf(row: FirestoreRow) {
  const status = text(row.status).toUpperCase();
  if (status) return status;
  return row.isActive === false ? "PAUSED" : "ACTIVE";
}

function isActive(row: FirestoreRow) {
  return statusOf(row) === "ACTIVE";
}

function displayName(row: FirestoreRow | undefined, fallback: string) {
  return (
    text(row?.displayName) ||
    text(row?.fullName) ||
    text(row?.name) ||
    fallback
  );
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "ACTIVE" || status === "OPEN") return "default";
  if (status === "ARCHIVED" || status === "COMPLETED") return "secondary";
  return "outline";
}

function optionPairs(values: string[]): Array<[string, string]> {
  return values.map((value) => [value, value]);
}

function PlanSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function EvaluationPlansPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { user, checkingAuth } = useRequireAuth();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const loadPage = useCallback(async (): Promise<PageData> => {
    const basePath = `orgs/${orgId}`;
    const names = [
      "schools",
      "evaluationFrameworks",
      "people",
      "evaluationPlans",
      "evaluationCycles",
      "evaluationTargetAssignments",
      "evaluationEvaluatorAssignments",
      "evaluationSubmissions",
    ] as const;
    const snapshots = await Promise.all(
      names.map((name) => getDocs(query(collection(db, `${basePath}/${name}`)))),
    );
    const rows = snapshots.map((snapshot) =>
      snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    );

    return {
      schools: rows[0],
      frameworks: rows[1],
      people: rows[2],
      plans: rows[3],
      cycles: rows[4],
      targetAssignments: rows[5],
      evaluatorAssignments: rows[6],
      submissions: rows[7],
    };
  }, [orgId]);

  const { data, loading, error, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل خطط التقييم.");
  }, [error]);

  const schoolMap = useMemo(
    () =>
      new Map(
        (data?.schools ?? []).map((school) => [
          school.id,
          text(school.name) || text(school.nameAr) || school.id,
        ]),
      ),
    [data?.schools],
  );
  const frameworkMap = useMemo(
    () =>
      new Map(
        (data?.frameworks ?? []).map((framework) => [
          framework.id,
          text(framework.title, framework.id),
        ]),
      ),
    [data?.frameworks],
  );
  const peopleMap = useMemo(
    () =>
      new Map(
        (data?.people ?? []).map((person) => [
          person.id,
          displayName(person, person.id),
        ]),
      ),
    [data?.people],
  );

  const visiblePlans = useMemo(() => {
    const plans = data?.plans ?? [];
    const targetAssignments = data?.targetAssignments ?? [];
    const evaluatorAssignments = data?.evaluatorAssignments ?? [];

    return plans
      .filter((plan) => {
        if (filters.schoolId && text(plan.schoolId) !== filters.schoolId) return false;
        if (filters.academicYearId && text(plan.academicYearId) !== filters.academicYearId) return false;
        if (filters.termId && text(plan.termId) !== filters.termId) return false;
        if (filters.frameworkId && text(plan.frameworkId) !== filters.frameworkId) return false;
        if (filters.status && statusOf(plan) !== filters.status) return false;

        const activeTargets = targetAssignments.filter(
          (row) => text(row.planId) === plan.id && isActive(row),
        );
        if (
          filters.targetRoleKey &&
          !activeTargets.some(
            (target) => text(target.targetRoleKey) === filters.targetRoleKey,
          )
        ) {
          return false;
        }

        if (
          filters.evaluatorPersonId &&
          !evaluatorAssignments.some(
            (assignment) =>
              text(assignment.planId) === plan.id &&
              isActive(assignment) &&
              text(assignment.evaluatorPersonId) === filters.evaluatorPersonId,
          )
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        text(left.title, left.id).localeCompare(text(right.title, right.id), "ar"),
      );
  }, [data?.evaluatorAssignments, data?.plans, data?.targetAssignments, filters]);

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.plans ?? [])
            .map((plan) => text(plan.academicYearId))
            .filter(Boolean),
        ),
      ).sort(),
    [data?.plans],
  );
  const terms = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.plans ?? []).map((plan) => text(plan.termId)).filter(Boolean),
        ),
      ).sort(),
    [data?.plans],
  );
  const targetRoles = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.targetAssignments ?? [])
            .filter(isActive)
            .map((target) => text(target.targetRoleKey))
            .filter(Boolean),
        ),
      ).sort(),
    [data?.targetAssignments],
  );
  const evaluators = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.evaluatorAssignments ?? [])
            .filter(isActive)
            .map((assignment) => text(assignment.evaluatorPersonId))
            .filter(Boolean),
        ),
      ).sort((left, right) =>
        (peopleMap.get(left) ?? left).localeCompare(
          peopleMap.get(right) ?? right,
          "ar",
        ),
      ),
    [data?.evaluatorAssignments, peopleMap],
  );

  if (checkingAuth || loading) return <PlanSkeleton />;

  const activePlans = (data?.plans ?? []).filter(isActive).length;
  const totalTargets = (data?.targetAssignments ?? []).filter(isActive).length;
  const totalAssignments = (data?.evaluatorAssignments ?? []).filter(isActive).length;
  const filterOptions: Array<[
    keyof Filters,
    string,
    Array<[string, string]>,
  ]> = [
    ["schoolId", "المدرسة", Array.from(schoolMap.entries())],
    ["academicYearId", "السنة الدراسية", optionPairs(years)],
    ["termId", "الفصل", optionPairs(terms)],
    ["frameworkId", "الإطار", Array.from(frameworkMap.entries())],
    [
      "evaluatorPersonId",
      "المقيّم",
      evaluators.map((id): [string, string] => [
        id,
        `${peopleMap.get(id) ?? id} — ${id}`,
      ]),
    ],
    ["targetRoleKey", "دور المستهدف", optionPairs(targetRoles)],
    [
      "status",
      "حالة الخطة",
      optionPairs(["ACTIVE", "DRAFT", "PAUSED", "COMPLETED", "ARCHIVED"]),
    ],
  ];

  return (
    <div className="space-y-6">
      <PageHero
        badge="إدارة التقييمات"
        badgeIcon={<GitBranch className="h-3.5 w-3.5" />}
        title="خطط التقييمات"
        description="استعراض وتشخيص خطط التقييم قبل تنفيذ أي تغيير تشغيلي آمن."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations`}>
                <ArrowLeft className="h-4 w-4" />
                العودة إلى التقييمات
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void reload()}>
              <RefreshCcw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          label="إجمالي الخطط"
          value={data?.plans.length ?? 0}
          hint={`النشطة: ${activePlans}`}
        />
        <InfoCard
          label="المستهدفون النشطون"
          value={totalTargets}
          hint="ضمن جميع الخطط"
        />
        <InfoCard
          label="إسنادات المقيمين النشطة"
          value={totalAssignments}
          hint="لا يُشترط أن مجموع الأوزان = 100"
        />
      </div>

      {error ? (
        <FormSection
          title="حدث خطأ"
          description="تعذر تحميل بيانات الخطط."
          contentClassName="space-y-4"
        >
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
          <Button variant="outline" onClick={() => void reload()}>
            إعادة المحاولة
          </Button>
        </FormSection>
      ) : null}

      <FormSection
        title="الفلاتر"
        description="تُطبّق على البيانات المحمّلة للمنظمة فقط."
        contentClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {filterOptions.map(([key, label, options]) => (
          <label key={key} className="grid gap-1.5 text-sm font-medium">
            {label}
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={filters[key]}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            >
              <option value="">الكل</option>
              {options.map(([value, optionLabel]) => (
                <option key={value} value={value}>
                  {optionLabel}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex items-end">
          <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            مسح الفلاتر
          </Button>
        </div>
      </FormSection>

      <FormSection
        title="الخطط"
        description={`النتائج: ${visiblePlans.length}`}
        contentClassName="overflow-x-auto"
      >
        <table className="w-full min-w-[1100px] text-right text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">الخطة</th>
              <th className="px-3 py-3 font-medium">الإطار</th>
              <th className="px-3 py-3 font-medium">المدرسة / السياق</th>
              <th className="px-3 py-3 font-medium">النوع / الدور</th>
              <th className="px-3 py-3 font-medium">الدورات</th>
              <th className="px-3 py-3 font-medium">المستهدفون</th>
              <th className="px-3 py-3 font-medium">إسنادات المقيمين</th>
              <th className="px-3 py-3 font-medium">الإرسالات</th>
              <th className="px-3 py-3 font-medium">الحالة</th>
              <th className="px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visiblePlans.map((plan) => {
              const planCycles = (data?.cycles ?? []).filter(
                (cycle) => text(cycle.planId) === plan.id,
              );
              const activeTargets = (data?.targetAssignments ?? []).filter(
                (target) => text(target.planId) === plan.id && isActive(target),
              );
              const activeAssignments = (data?.evaluatorAssignments ?? []).filter(
                (assignment) =>
                  text(assignment.planId) === plan.id && isActive(assignment),
              );
              const submissions = (data?.submissions ?? []).filter(
                (submission) => text(submission.planId) === plan.id,
              );
              const planStatus = statusOf(plan);

              return (
                <tr
                  key={plan.id}
                  className="border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-4 align-top">
                    <div className="font-semibold">{text(plan.title, plan.id)}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {plan.id}
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <div>
                      {frameworkMap.get(text(plan.frameworkId)) ??
                        text(plan.frameworkId, "—")}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {text(plan.frameworkId, "—")}
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <div>
                      {schoolMap.get(text(plan.schoolId)) ??
                        text(plan.schoolId, "—")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {text(plan.academicYearId, "—")} / {text(plan.termId, "—")}
                    </div>
                  </td>
                  <td className="px-3 py-4 align-top">
                    <div>
                      {text(plan.targetKind, "—")} / {text(plan.planKind) || text(plan.frequencyType, "—")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Array.from(
                        new Set(
                          activeTargets
                            .map((target) => text(target.targetRoleKey))
                            .filter(Boolean),
                        ),
                      ).join("، ") || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-4">{planCycles.length}</td>
                  <td className="px-3 py-4">{activeTargets.length}</td>
                  <td className="px-3 py-4">{activeAssignments.length}</td>
                  <td className="px-3 py-4">{submissions.length}</td>
                  <td className="px-3 py-4">
                    <Badge variant={statusVariant(planStatus)}>{planStatus}</Badge>
                  </td>
                  <td className="px-3 py-4">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/orgs/${orgId}/evaluations/plans/${plan.id}`}>
                        <Settings2 className="h-4 w-4" />
                        عرض التشخيص
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visiblePlans.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            لا توجد خطط تطابق الفلاتر الحالية.
          </div>
        ) : null}
      </FormSection>
    </div>
  );
}
