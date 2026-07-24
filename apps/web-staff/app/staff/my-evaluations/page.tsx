"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  buildMyEvaluationsView,
  MyEvaluationsView,
} from "@/lib/staff-evaluations";

import { useStaffActor } from "@/components/staff/staff-actor-provider";

function SummaryCard({
  title,
  value,
  suffix,
}: {
  title: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-bold">
        {value}
        {suffix ? (
          <span className="text-base font-medium"> {suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function MyEvaluationsPage() {
  const { user, checkingAuth } = useRequireAuth();
  const { actor } = useStaffActor();

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        (actor?.visibleClasses ?? [])
          .map((item) => item.schoolId)
          .filter(
            (schoolId): schoolId is string =>
              typeof schoolId === "string" && schoolId.trim().length > 0,
          ),
      ),
    );
  }, [actor?.visibleClasses]);

  const [view, setView] = useState<MyEvaluationsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadView = useCallback(async () => {
    if (!user || !actor) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildMyEvaluationsView({
        uid: user.uid,
        orgId: actor.orgId,
        schoolIds: visibleSchoolIds,
      });

      setView(result);
    } catch (error) {
      console.error(error);

      setError(error instanceof Error ? error.message : "تعذر تحميل تقييماتي");
    } finally {
      setLoading(false);
    }
  }, [actor, user, visibleSchoolIds]);

  useEffect(() => {
    if (checkingAuth) return;

    if (!user) {
      setLoading(false);
      return;
    }

    if (!actor) {
      return;
    }

    void loadView();
  }, [actor, checkingAuth, user, loadView]);

  if (checkingAuth || loading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          جاري تحميل تقييماتي...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border border-destructive/40 bg-card p-6">
          <h1 className="text-xl font-bold">تعذر تحميل تقييماتي</h1>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {error}
          </p>
          <Button className="mt-4" onClick={() => void loadView()}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  const summary = view?.summary;
  const results = view?.results ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">تقييماتي المعتمدة</h1>
          <p className="text-sm text-muted-foreground">
            النتائج الرسمية المعتمدة التي ظهرت لك بعد اعتماد الإدارة.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="المتوسط المعتمد"
          value={formatScore(summary?.approvedAverageScore ?? 0)}
          suffix="%"
        />

        <SummaryCard
          title="عدد التقييمات المعتمدة"
          value={summary?.approvedCyclesCount ?? 0}
        />

        <SummaryCard
          title="آخر نتيجة معتمدة"
          value={formatScore(summary?.lastApprovedScore ?? 0)}
          suffix="%"
        />

        <SummaryCard title="النتائج الظاهرة" value={results.length} />
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">سجل التقييمات</h2>
            <p className="text-sm text-muted-foreground">
              لا تظهر هنا إلا التقييمات المعتمدة فقط.
            </p>
          </div>

          <Button variant="outline" onClick={() => void loadView()}>
            تحديث
          </Button>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            لا توجد تقييمات معتمدة ظاهرة لك حاليًا.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <div key={result.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="font-bold">
                      {result.frameworkTitle || "تقييم"}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {result.planTitle} — {result.cycleTitle}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      تاريخ الاعتماد: {formatDate(result.approvedAt)}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      الحالة: معتمد
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:items-end">
                    <div className="rounded-2xl border bg-background px-5 py-4 text-center">
                      <div className="text-xs text-muted-foreground">
                        النتيجة
                      </div>
                      <div className="mt-1 text-2xl font-bold">
                        {formatScore(result.finalScore)}%
                      </div>
                    </div>

                    <Button asChild variant="outline">
                      <Link href={result.detailsHref}>عرض التفاصيل</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
