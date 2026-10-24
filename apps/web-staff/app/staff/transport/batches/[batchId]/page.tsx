"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowRight, Bus, Loader2, MapPin, Users } from "lucide-react";

import type { TransportAttendanceBatch, TransportRoute } from "@takween/contracts";
import {
  calculateTransportBatchSummary,
  TRANSPORT_ATTENDANCE_STATUS_LABEL_AR,
  TRANSPORT_TRIP_KIND_LABEL_AR,
} from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { buildStaffTransportBatchWorkspace } from "@/lib/staff-transport";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function batchStatus(status: string) {
  switch (status) {
    case "DRAFT": return "مسودة";
    case "IN_PROGRESS": return "قيد التسجيل";
    case "SUBMITTED": return "مرسلة";
    case "REVIEWED": return "تمت المراجعة";
    case "LOCKED": return "مقفلة";
    case "CANCELLED": return "ملغاة";
    default: return status;
  }
}

export default function TransportBatchDetailPage() {
  const batchId = param(useParams().batchId);
  const { actor } = useStaffActor();
  const [batch, setBatch] = useState<TransportAttendanceBatch | null>(null);
  const [route, setRoute] = useState<TransportRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!batchId || !actor.orgId) return;
    setLoading(true);
    setError(null);
    try {
      const workspace = await buildStaffTransportBatchWorkspace({
        orgId: actor.orgId,
        batchId,
      });
      setBatch(workspace?.batch ?? null);
      setRoute(workspace?.route ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل الرحلة.");
    } finally {
      setLoading(false);
    }
  }, [actor.orgId, batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => calculateTransportBatchSummary(batch?.studentRows ?? []),
    [batch?.studentRows],
  );

  if (loading) {
    return <main className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></main>;
  }

  if (error || !batch || !route) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <div className="flex items-center gap-2 font-bold"><AlertCircle className="h-5 w-5" />تعذر فتح سجل الرحلة</div>
          <p className="mt-2 text-sm">{error ?? "السجل غير موجود أو خارج نطاق صلاحيتك."}</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/staff/transport">العودة إلى النقل</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      <Button asChild variant="ghost" className="px-2">
        <Link href={`/staff/transport/routes/${route.id}`}><ArrowRight className="ml-2 h-4 w-4" />العودة إلى الخط</Link>
      </Button>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary"><Bus className="h-4 w-4" />{TRANSPORT_TRIP_KIND_LABEL_AR[batch.tripKind]}</div>
            <h1 className="mt-1 text-2xl font-bold">{batch.routeTitle ?? route.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{batch.serviceDate}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{batchStatus(batch.status)}</span>
        </div>
        {batch.status === "DRAFT" || batch.status === "IN_PROGRESS" ? (
          <Button asChild className="mt-4">
            <Link href={`/staff/transport/routes/${route.id}/trips/${batch.tripKind}/new?date=${batch.serviceDate}`}>
              متابعة تسجيل المسودة
            </Link>
          </Button>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["إجمالي الطلاب", summary.targetCount],
          ["تم تسجيلهم", summary.completedCount],
          ["غير مكتمل", summary.missingCount],
          ["تحتاج متابعة", summary.issueCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        {batch.studentRows.map((row, index) => (
          <article key={row.studentId} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</span>
                  <h2 className="truncate font-bold">{row.studentDisplayName}</h2>
                </div>
                {row.stopTitle ? <p className="mr-9 mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{row.stopTitle}</p> : null}
              </div>
              <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold">{TRANSPORT_ATTENDANCE_STATUS_LABEL_AR[row.status]}</span>
            </div>
            {row.note ? <p className="mt-3 rounded-xl bg-muted p-3 text-sm">{row.note}</p> : null}
          </article>
        ))}
      </section>

      {!batch.studentRows.length ? (
        <section className="rounded-2xl border border-dashed p-8 text-center"><Users className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-2 font-bold">لا توجد صفوف طلاب في هذا السجل</p></section>
      ) : null}
    </main>
  );
}
