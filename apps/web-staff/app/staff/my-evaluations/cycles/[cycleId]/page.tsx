"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  buildMyEvaluationDetailView,
  MyEvaluationDetailView,
} from "@/lib/staff-evaluations";

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

export default function MyEvaluationDetailPage() {
  const params = useParams<{ cycleId: string }>();
  const { user, checkingAuth } = useRequireAuth();

  const [view, setView] = useState<MyEvaluationDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cycleId = params.cycleId;

  const loadView = useCallback(async () => {
    if (!user || !cycleId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildMyEvaluationDetailView({
        uid: user.uid,
        orgId: "takween",
        cycleId,
      });

      setView(result);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "تعذر تحميل تفاصيل التقييم",
      );
    } finally {
      setLoading(false);
    }
  }, [user, cycleId]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadView();
    }

    if (!checkingAuth && !user) {
      setLoading(false);
    }
  }, [checkingAuth, user, loadView]);

  const totalItems = useMemo(() => {
    return (
      view?.sections.reduce((sum, section) => {
        return sum + section.items.length;
      }, 0) ?? 0
    );
  }, [view]);

  if (checkingAuth || loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          جاري تحميل تفاصيل التقييم...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border border-destructive/40 bg-card p-6">
          <h1 className="text-xl font-bold">تعذر تحميل تفاصيل التقييم</h1>
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

  if (!view) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-bold">التقييم غير متاح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لا يمكن عرض هذا التقييم، إما لأنه غير معتمد أو لا يخص حسابك.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/staff/my-evaluations">الرجوع إلى التقييمات</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {view.frameworkTitle}
            </div>

            <h1 className="text-2xl font-bold">تفاصيل التقييم المعتمد</h1>

            <div className="text-sm text-muted-foreground">
              {view.planTitle} — {view.cycleTitle}
            </div>

            <div className="text-sm text-muted-foreground">
              تاريخ الاعتماد: {formatDate(view.approvedAt)}
            </div>
          </div>

          <Button asChild variant="outline">
            <Link href="/staff/my-evaluations">الرجوع</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">النتيجة النهائية</div>
          <div className="mt-2 text-2xl font-bold">
            {formatScore(view.finalScore)}%
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">عدد المحاور</div>
          <div className="mt-2 text-2xl font-bold">{view.sections.length}</div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">عدد البنود</div>
          <div className="mt-2 text-2xl font-bold">{totalItems}</div>
        </div>
      </section>

      {view.generalNote ? (
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">الملاحظة العامة</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">
            {view.generalNote}
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        {view.sections.map((section) => {
          const sectionPercentage =
            section.maxScore > 0
              ? (section.rawScore / section.maxScore) * 100
              : 0;

          return (
            <div
              key={section.sectionId}
              className="rounded-3xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{section.sectionTitle}</h2>
                  <div className="text-sm text-muted-foreground">
                    {section.rawScore}/{section.maxScore} —{" "}
                    {formatScore(sectionPercentage)}%
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.itemId}
                    className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium">{item.itemTitle}</div>
                      {item.note ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.note}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border bg-background px-4 py-2 text-center">
                      <div className="text-xs text-muted-foreground">
                        الدرجة
                      </div>
                      <div className="font-bold">
                        {item.score}/{item.maxScore}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
