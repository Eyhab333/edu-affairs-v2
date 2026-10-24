"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bus,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  MessageSquareText,
  Save,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import type {
  StudentTransportAttendanceStatus,
  TransportAttendanceBatch,
  TransportTripKind,
} from "@takween/contracts";
import {
  calculateTransportBatchSummary,
  getAllowedStatusesForTransportTrip,
  getDefaultStatusForTrip,
  TRANSPORT_ATTENDANCE_STATUS_LABEL_AR,
  TRANSPORT_TRIP_KIND_LABEL_AR,
  updateTransportAttendanceBatchRow,
} from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import {
  buildStaffTransportBatchDraft,
  getRiyadhServiceDate,
  saveStaffTransportDraft,
  submitStaffTransportBatch,
} from "@/lib/staff-transport";

const TRIP_KINDS = new Set<TransportTripKind>([
  "MORNING_PICKUP",
  "MORNING_ARRIVAL",
  "AFTERNOON_BOARDING",
  "AFTERNOON_DROPOFF",
]);

const ISSUE_STATUSES = new Set<StudentTransportAttendanceStatus>([
  "NOT_BOARDED",
  "ABSENT",
  "EXCUSED",
  "LATE",
  "ISSUE",
]);

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "تعذر إكمال العملية. حاول مرة أخرى.";
}

function statusButtonClass(
  status: StudentTransportAttendanceStatus,
  selected: boolean,
) {
  if (!selected) return "border-border bg-background text-foreground";
  if (ISSUE_STATUSES.has(status)) {
    return "border-amber-500 bg-amber-500 text-white hover:bg-amber-600";
  }
  return "border-primary bg-primary text-primary-foreground hover:bg-primary/90";
}

export default function NewTransportTripPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const routeId = param(params.routeId);
  const rawTripKind = param(params.tripKind);
  const tripKind = TRIP_KINDS.has(rawTripKind as TransportTripKind)
    ? (rawTripKind as TransportTripKind)
    : null;
  const { actor } = useStaffActor();
  const [batch, setBatch] = useState<TransportAttendanceBatch | null>(null);
  const [persistedUpdatedAt, setPersistedUpdatedAt] = useState<number>();
  const requestedDate = searchParams.get("date") ?? "";
  const serviceDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : getRiyadhServiceDate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!routeId || !tripKind || !actor.orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const term = actor.currentTermsByAcademicYear[actor.currentTerm?.academicYearId ?? ""];
      const result = await buildStaffTransportBatchDraft({
        context: {
          orgId: actor.orgId,
          actorPersonId: actor.personId,
          assignments: actor.operationalAssignments,
        },
        routeId,
        tripKind,
        serviceDate,
        term: term
          ? {
              termId: term.id,
              termTitle: term.title,
              termShortTitle: term.shortTitle,
            }
          : undefined,
        createdByRoleKey: actor.roles[0],
      });
      setBatch(result?.batch ?? null);
      setPersistedUpdatedAt(result?.isPersisted ? result.batch.updatedAt : undefined);
    } catch (loadError) {
      setBatch(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [actor, routeId, serviceDate, tripKind]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => calculateTransportBatchSummary(batch?.studentRows ?? []),
    [batch?.studentRows],
  );
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
  }> = [
    { label: "إجمالي الطلاب", value: summary.targetCount, icon: Users },
    { label: "تم تسجيلهم", value: summary.completedCount, icon: ClipboardCheck },
    { label: "بانتظار التسجيل", value: summary.missingCount, icon: Loader2 },
    { label: "حالات تحتاج متابعة", value: summary.issueCount, icon: AlertCircle },
  ];
  const editable = !!batch && ["DRAFT", "IN_PROGRESS"].includes(batch.status);
  const allowedStatuses = tripKind
    ? getAllowedStatusesForTransportTrip(tripKind, false)
    : [];
  const normalStatus = tripKind ? getDefaultStatusForTrip(tripKind) : "PENDING";

  function updateRow(
    studentId: string,
    status: StudentTransportAttendanceStatus,
    note?: string,
  ) {
    setBatch((current) =>
      current
        ? updateTransportAttendanceBatchRow({
            batch: current,
            studentId,
            status,
            note,
            recordedByPersonId: actor.personId,
          })
        : current,
    );
  }

  function markAllPending() {
    setBatch((current) => {
      if (!current) return current;
      return current.studentRows.reduce(
        (next, row) =>
          row.status === "PENDING"
            ? updateTransportAttendanceBatchRow({
                batch: next,
                studentId: row.studentId,
                status: normalStatus,
                recordedByPersonId: actor.personId,
              })
            : next,
        current,
      );
    });
  }

  async function saveDraft(showToast = true) {
    if (!batch || !editable) return null;
    setSaving(true);
    try {
      const saved = await saveStaffTransportDraft({
        orgId: actor.orgId,
        batch,
        expectedUpdatedAt: persistedUpdatedAt,
      });
      setBatch(saved);
      setPersistedUpdatedAt(saved.updatedAt);
      if (showToast) toast.success("تم حفظ مسودة الرحلة");
      return saved;
    } catch (saveError) {
      toast.error(errorMessage(saveError));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitTrip() {
    if (!batch || !editable) return;
    if (!batch.studentRows.length) {
      toast.error("لا يوجد طلاب مسجلون في هذا الخط");
      return;
    }
    if (summary.missingCount > 0) {
      toast.error("يجب تسجيل حالة جميع الطلاب قبل إرسال الرحلة");
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveDraft(false);
      if (!saved) return;
      const submitted = await submitStaffTransportBatch({
        orgId: actor.orgId,
        batchId: saved.id,
        expectedUpdatedAt: saved.updatedAt,
      });
      setBatch(submitted);
      setPersistedUpdatedAt(submitted.updatedAt);
      toast.success("تم إرسال الرحلة وحفظ سجلات الطلاب");
    } catch (submitError) {
      toast.error(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!tripKind || error || !batch) {
    return (
      <main className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-destructive">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-5 w-5" />
            تعذر فتح رحلة النقل
          </div>
          <p className="mt-2 text-sm">{error ?? "نوع الرحلة غير صالح أو لا تملك صلاحية الوصول."}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/staff/transport/routes/${routeId}`}>العودة إلى الخط</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      <Button asChild variant="ghost" className="px-2">
        <Link href={`/staff/transport/routes/${routeId}`}>
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة إلى الخط
        </Link>
      </Button>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-primary">
              <Bus className="h-4 w-4" />
              {TRANSPORT_TRIP_KIND_LABEL_AR[batch.tripKind]}
            </div>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">{batch.routeTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">تاريخ الخدمة: {batch.serviceDate}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {batch.status === "DRAFT"
              ? "مسودة"
              : batch.status === "IN_PROGRESS"
                ? "قيد التسجيل"
                : batch.status === "SUBMITTED"
                  ? "مرسلة"
                  : "للقراءة فقط"}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </section>

      {editable && batch.studentRows.length ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <Button type="button" variant="outline" size="sm" onClick={markAllPending} disabled={!summary.missingCount}>
            <CheckCheck className="ml-2 h-4 w-4" />
            تسجيل كل المعلق: {TRANSPORT_ATTENDANCE_STATUS_LABEL_AR[normalStatus]}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void saveDraft()} disabled={saving || submitting}>
              {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              حفظ المسودة
            </Button>
            <Button type="button" size="sm" onClick={() => void submitTrip()} disabled={saving || submitting || summary.missingCount > 0}>
              {submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
              إرسال الرحلة
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        {batch.studentRows.map((row, index) => {
          const noteOpen = openNotes.has(row.studentId) || !!row.note;
          return (
            <article key={row.studentId} className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</span>
                    <h2 className="truncate font-bold">{row.studentDisplayName}</h2>
                  </div>
                  {row.stopTitle ? <p className="mr-9 mt-1 text-xs text-muted-foreground">المحطة: {row.stopTitle}</p> : null}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  {TRANSPORT_ATTENDANCE_STATUS_LABEL_AR[row.status]}
                </span>
              </div>

              {editable ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {allowedStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateRow(row.studentId, status, row.note)}
                      className={`min-h-9 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${statusButtonClass(status, row.status === status)}`}
                    >
                      {TRANSPORT_ATTENDANCE_STATUS_LABEL_AR[status]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenNotes((current) => {
                        const next = new Set(current);
                        next.has(row.studentId) ? next.delete(row.studentId) : next.add(row.studentId);
                        return next;
                      })
                    }
                    className="min-h-9 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    <MessageSquareText className="ml-1 inline h-3.5 w-3.5" />
                    ملاحظة
                  </button>
                </div>
              ) : null}

              {noteOpen ? (
                editable ? (
                  <textarea
                    value={row.note ?? ""}
                    maxLength={1000}
                    rows={2}
                    onChange={(event) => updateRow(row.studentId, row.status, event.target.value)}
                    placeholder="ملاحظة اختيارية عن الطالب..."
                    className="mt-3 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <p className="mt-3 rounded-xl bg-muted p-3 text-sm">{row.note}</p>
                )
              ) : null}
            </article>
          );
        })}
      </section>

      {!batch.studentRows.length ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Users className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-3 font-bold">لا يوجد طلاب نقل نشطون لهذا الخط</h2>
        </section>
      ) : null}
    </main>
  );
}
