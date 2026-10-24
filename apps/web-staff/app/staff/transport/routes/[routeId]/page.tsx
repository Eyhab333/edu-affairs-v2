"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bus,
  CalendarDays,
  ClipboardList,
  Loader2,
  MapPin,
  PlayCircle,
  Route,
  User,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  buildStaffTransportRouteWorkspace,
  getRiyadhServiceDate,
  type StaffTransportRouteWorkspace,
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

function formatTripKind(tripKind: string) {
  switch (tripKind) {
    case "MORNING_PICKUP":
      return "صعود صباحي";
    case "MORNING_ARRIVAL":
      return "وصول للمدرسة";
    case "AFTERNOON_BOARDING":
      return "صعود الانصراف";
    case "AFTERNOON_DROPOFF":
      return "نزول عند المنزل";
    default:
      return tripKind;
  }
}

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function StaffTransportRoutePage() {
  const params = useParams();
  const routeId = getParamValue(params.routeId);

  const { actor } = useStaffActor();

  const [workspace, setWorkspace] =
    useState<StaffTransportRouteWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!actor.orgId || !routeId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await buildStaffTransportRouteWorkspace(
        {
          orgId: actor.orgId,
          actorPersonId: actor.personId,
          assignments: actor.operationalAssignments,
        },
        routeId
      );

      setWorkspace(result);
    } catch (error) {
      setWorkspace(null);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actor.operationalAssignments, actor.orgId, actor.personId, routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          جار تحميل خط النقل...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-5 w-5" />
            تعذر تحميل خط النقل
          </div>
          <p className="mt-2 text-sm">{error}</p>

          <Button className="mt-4" variant="outline" onClick={load}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Bus className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-bold">لم يتم العثور على خط النقل</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            قد لا يكون الخط موجودًا أو لا تملك صلاحية الوصول إليه.
          </p>

          <Button className="mt-5" asChild variant="outline">
            <Link href="/staff/transport">العودة للنقل</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { route, enrollments, batches, tripOptions } = workspace;
  const todayServiceDate = getRiyadhServiceDate();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <Button asChild variant="ghost" className="mb-3">
          <Link href="/staff/transport">
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة لخطوط النقل
          </Link>
        </Button>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                <Route className="h-4 w-4" />
                {route.code || route.shortTitle || "خط نقل"}
              </div>

              <h1 className="text-2xl font-bold md:text-3xl">
                {route.title}
              </h1>

              {route.description ? (
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  {route.description}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
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

            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Bus className="h-8 w-8" />
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            طلاب الخط
          </div>
          <div className="mt-1 text-3xl font-bold">{enrollments.length}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            دفعات النقل
          </div>
          <div className="mt-1 text-3xl font-bold">{batches.length}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            الحالة
          </div>
          <div className="mt-1 text-lg font-bold">
            {route.status === "ACTIVE" ? "نشط" : route.status}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-bold">بدء رحلة جديدة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر نوع الرحلة. في الخطوة التالية سننشئ صفحة إدخال الصعود والنزول.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tripOptions.map((option) => {
            const existing = batches.find(
              (batch) =>
                batch.serviceDate === todayServiceDate &&
                batch.tripKind === option.tripKind,
            );
            return (
              <Button
                key={option.tripKind}
                asChild
                variant="outline"
                className="h-auto justify-between rounded-2xl p-4"
              >
                <Link href={`/staff/transport/routes/${route.id}/trips/${option.tripKind}/new`}>
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    {existing ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {existing.status === "DRAFT" || existing.status === "IN_PROGRESS"
                          ? "متابعة مسودة اليوم"
                          : "عرض رحلة اليوم"}
                      </span>
                    ) : null}
                  </span>
                  <PlayCircle className="h-5 w-5" />
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-bold">طلاب الخط</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الطلاب الذين لديهم اشتراك نقل نشط على هذا الخط.
            </p>
          </div>

          {enrollments.length ? (
            <div className="space-y-3">
              {enrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="rounded-2xl border border-border bg-background p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-bold">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {enrollment.studentDisplayName ??
                          enrollment.studentId}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {enrollment.pickupStopTitle ? (
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            صعود: {enrollment.pickupStopTitle}
                          </span>
                        ) : null}

                        {enrollment.dropoffStopTitle ? (
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            نزول: {enrollment.dropoffStopTitle}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {enrollment.status === "ACTIVE"
                        ? "مشترك نشط"
                        : enrollment.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <Users className="mx-auto h-9 w-9 text-muted-foreground" />
              <h3 className="mt-3 font-bold">لا يوجد طلاب على هذا الخط</h3>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-bold">آخر الدفعات</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              آخر دفعات تسجيل النقل لهذا الخط.
            </p>
          </div>

          {batches.length ? (
            <div className="space-y-3">
              {batches.slice(0, 8).map((batch) => (
                <Link
                  key={batch.id}
                  href={
                    batch.status === "DRAFT" || batch.status === "IN_PROGRESS"
                      ? `/staff/transport/routes/${route.id}/trips/${batch.tripKind}/new?date=${batch.serviceDate}`
                      : `/staff/transport/batches/${batch.id}`
                  }
                  className="rounded-2xl border border-border bg-background p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold">
                        {formatTripKind(batch.tripKind)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {batch.serviceDate}
                      </div>
                    </div>

                    <div className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                      {formatBatchStatus(batch.status)}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-muted p-2">
                      <div className="text-muted-foreground">المستهدف</div>
                      <div className="font-bold">{batch.targetCount}</div>
                    </div>

                    <div className="rounded-xl bg-muted p-2">
                      <div className="text-muted-foreground">المكتمل</div>
                      <div className="font-bold">{batch.completedCount}</div>
                    </div>

                    <div className="rounded-xl bg-muted p-2">
                      <div className="text-muted-foreground">الناقص</div>
                      <div className="font-bold">{batch.missingCount}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground" />
              <h3 className="mt-3 font-bold">لا توجد دفعات بعد</h3>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
