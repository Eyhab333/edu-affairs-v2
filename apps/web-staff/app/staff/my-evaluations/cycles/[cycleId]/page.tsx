"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  buildMyEvaluationDetailView,
  type MyEvaluationDetailView,
} from "@/lib/staff-evaluations";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";

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

export default function MyEvaluationCycleDetailsPage() {
  const params = useParams<{ cycleId: string }>();
  const cycleId = params.cycleId;

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

  const [view, setView] = useState<MyEvaluationDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadView = useCallback(async () => {
    if (!user || !actor || !cycleId) return;

    setLoading(true);
    setError("");

    try {
      const result = await buildMyEvaluationDetailView({
        uid: user.uid,
        orgId: actor.orgId,
        cycleId,
        schoolIds: visibleSchoolIds,
      });

      if (!result) {
        setView(null);
        setError("لم يتم العثور على تفاصيل هذا التقييم.");
        return;
      }

      setView(result);
    } catch (error) {
      console.error(error);

      setView(null);
      setError(
        error instanceof Error ? error.message : "تعذر تحميل تفاصيل التقييم",
      );
    } finally {
      setLoading(false);
    }
  }, [actor, cycleId, user, visibleSchoolIds]);

  useEffect(() => {
    if (checkingAuth || !user || !actor) return;

    void loadView();
  }, [actor, checkingAuth, loadView, user]);

  if (checkingAuth || loading) {
    return (
      <div className="rounded-2xl border bg-card p-6">
        جاري تحميل تفاصيل التقييم...
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/40 bg-card p-6">
        <h1 className="text-xl font-bold">تعذر تحميل التقييم</h1>

        <p className="text-sm text-muted-foreground">
          {error || "لم يتم العثور على التقييم."}
        </p>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/staff/my-evaluations">العودة إلى تقييماتي</Link>
          </Button>

          <Button onClick={() => void loadView()}>إعادة المحاولة</Button>
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{view.frameworkTitle}</h1>

            <p className="mt-2 text-sm text-muted-foreground">
              {view.planTitle} — {view.cycleTitle}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              تاريخ الاعتماد: {formatDate(view.approvedAt)}
            </p>
          </div>

          <div className="rounded-2xl border bg-background px-6 py-4 text-center">
            <div className="text-xs text-muted-foreground">النتيجة</div>

            <div className="mt-1 text-3xl font-bold">
              {formatScore(view.finalScore)}%
            </div>
          </div>
        </div>
      </section>

      {view.generalNote ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-bold">الملاحظة العامة</h2>

          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {view.generalNote}
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        {view.sections.map((section) => (
          <div
            key={section.sectionId}
            className="rounded-2xl border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-bold">{section.sectionTitle}</h2>

              <div className="text-sm font-semibold">
                {formatScore(section.rawScore)} /{" "}
                {formatScore(section.maxScore)}
              </div>
            </div>

            <div className="space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.itemId}
                  className="rounded-xl border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{item.itemTitle}</div>

                      {item.note ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.note}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 font-bold">
                      {formatScore(item.score)} / {formatScore(item.maxScore)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <Button asChild variant="outline">
        <Link href="/staff/my-evaluations">العودة إلى تقييماتي</Link>
      </Button>
    </main>
  );
}
