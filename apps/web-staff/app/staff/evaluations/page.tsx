"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  buildStaffEvaluationWorkspace,
  getEvaluationTaskStatusLabel,
  StaffEvaluationWorkspace,
} from "@/lib/staff-evaluations";

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function StaffEvaluationsPage() {
  const { user, checkingAuth } = useRequireAuth();

  const [workspace, setWorkspace] = useState<StaffEvaluationWorkspace | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildStaffEvaluationWorkspace({
        uid: user.uid,
        orgId: "takween",
      });

      setWorkspace(result);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "تعذر تحميل تقييماتي"
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadWorkspace();
    }

    if (!checkingAuth && !user) {
      setLoading(false);
    }
  }, [checkingAuth, user, loadWorkspace]);

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
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={() => void loadWorkspace()}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  const tasks = workspace?.tasks ?? [];
  const summary = workspace?.summary ?? {
    total: 0,
    pending: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">تقييماتي</h1>
          <p className="text-sm text-muted-foreground">
            التقييمات المطلوبة منك حسب الخطط والدورات المفتوحة.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard title="الإجمالي" value={summary.total} />
        <SummaryCard title="لم يبدأ" value={summary.pending} />
        <SummaryCard title="مسودات" value={summary.draft} />
        <SummaryCard title="مرسل" value={summary.submitted} />
        <SummaryCard title="معتمد" value={summary.approved} />
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">المطلوب مني</h2>
            <p className="text-sm text-muted-foreground">
              قائمة التقييمات المسندة إليك.
            </p>
          </div>

          <Button variant="outline" onClick={() => void loadWorkspace()}>
            تحديث
          </Button>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            لا توجد تقييمات مطلوبة منك حاليًا.
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-4 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="font-bold">
                    تقييم المعلم: {task.targetDisplayName}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {task.frameworkTitle} — {task.cycleTitle}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    الحالة: {getEvaluationTaskStatusLabel(task.status)}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    الوزن: {task.weight}%
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button asChild>
                    <Link href={task.actionHref}>فتح التقييم</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}