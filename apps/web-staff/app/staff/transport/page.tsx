"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bus,
  ClipboardList,
  Loader2,
  MapPin,
  Route,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  buildStaffTransportWorkspace,
  type StaffTransportRouteCard,
  type StaffTransportWorkspace,
} from "@/lib/staff-transport";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatBatchStatus(status: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "IN_PROGRESS":
      return "قيد الإدخال";
    case "SUBMITTED":
      return "مرسلة";
    case "REVIEWED":
      return "مراجعة";
    case "LOCKED":
      return "مقفلة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

function TransportRouteCard({ card }: { card: StaffTransportRouteCard }) {
  const { route, latestBatch } = card;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Route className="h-4 w-4" />
            <span>{route.code || route.shortTitle || "خط نقل"}</span>
          </div>

          <h2 className="text-xl font-bold text-foreground">{route.title}</h2>

          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {route.areaLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
                <MapPin className="h-3.5 w-3.5" />
                {route.areaLabel}
              </span>
            ) : null}

            {route.startsFromLabel ? (
              <span className="rounded-full bg-muted px-3 py-1">
                من: {route.startsFromLabel}
              </span>
            ) : null}

            {route.endsAtLabel ? (
              <span className="rounded-full bg-muted px-3 py-1">
                إلى: {route.endsAtLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Bus className="h-6 w-6" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            الطلاب
          </div>
          <div className="mt-1 text-2xl font-bold">{card.studentsCount}</div>
        </div>

        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            دفعات نشطة
          </div>
          <div className="mt-1 text-2xl font-bold">
            {card.activeBatchesCount}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-sm text-muted-foreground">آخر دفعة</div>
          <div className="mt-1 text-sm font-semibold">
            {latestBatch
              ? `${latestBatch.serviceDate} — ${formatBatchStatus(
                  latestBatch.status
                )}`
              : "لا توجد"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button asChild>
          <Link href={`/staff/transport/routes/${route.id}`}>
            فتح الخط
            <ArrowLeft className="mr-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function StaffTransportPage() {
  const { actor } = useStaffActor();

  const [workspace, setWorkspace] = useState<StaffTransportWorkspace | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!actor.orgId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildStaffTransportWorkspace({
        orgId: actor.orgId,
        actorPersonId: actor.personId,
        assignments: actor.operationalAssignments,
      });

      setWorkspace(result);
    } catch (error) {
      setWorkspace(null);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actor.operationalAssignments, actor.orgId, actor.personId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          جار تحميل النقل...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-5 w-5" />
            تعذر تحميل بيانات النقل
          </div>
          <p className="mt-2 text-sm">{error}</p>

          <Button className="mt-4" variant="outline" onClick={load}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  const routeCards = workspace?.routeCards ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              <Bus className="h-4 w-4" />
              النقل المدرسي
            </div>

            <h1 className="text-2xl font-bold md:text-3xl">
              خطوط النقل والباصات
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              متابعة خطوط النقل، أعداد الطلاب، وآخر دفعات الصعود والنزول.
            </p>
          </div>

          <Button variant="outline" onClick={load}>
            تحديث
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">عدد الخطوط</div>
          <div className="mt-1 text-3xl font-bold">{routeCards.length}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">طلاب النقل</div>
          <div className="mt-1 text-3xl font-bold">
            {routeCards.reduce((sum, item) => sum + item.studentsCount, 0)}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">دفعات نشطة</div>
          <div className="mt-1 text-3xl font-bold">
            {routeCards.reduce(
              (sum, item) => sum + item.activeBatchesCount,
              0
            )}
          </div>
        </div>
      </section>

      {routeCards.length ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {routeCards.map((card) => (
            <TransportRouteCard key={card.route.id} card={card} />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Bus className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-bold">لا توجد خطوط نقل ظاهرة</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            تأكد من وجود بيانات النقل أو من ربط المستخدم بخط نقل.
          </p>
        </section>
      )}
    </main>
  );
}
