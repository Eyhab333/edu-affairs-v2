"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Download, Eye, FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { StaffPortfolioItem, StaffPortfolioItemKind } from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { archiveStaffPortfolioItem, canUseMyStaffPortfolio, deleteStaffPortfolioItem, getStaffPortfolioFileUrl, listMyStaffPortfolioItems, submitStaffPortfolioItem } from "@/lib/staff-portfolio";

const labels: Record<StaffPortfolioItemKind, string> = {
  INITIATIVE: "المبادرات",
  PROFESSIONAL_DEVELOPMENT: "التطوير المهني",
};

function formatDate(value: number) { return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value)); }
function toDateInput(value: number) { return new Date(value).toISOString().slice(0, 10); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "حدث خطأ غير متوقع"; }

export default function MyPortfolioPage() {
  const { actor } = useStaffActor();
  const [items, setItems] = useState<StaffPortfolioItem[]>([]);
  const [tab, setTab] = useState<StaffPortfolioItemKind>("INITIATIVE");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffPortfolioItem | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const deleteInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: "", description: "", occurredAt: toDateInput(Date.now()), academicYearId: actor.currentTerm?.academicYearId ?? "", termId: actor.currentTerm?.id ?? "", providerName: "", trainingHours: "" });

  const terms = useMemo(() => Object.values(actor.currentTermsByAcademicYear), [actor.currentTermsByAcademicYear]);
  const currentItems = useMemo(() => items.filter((item) => item.kind === tab), [items, tab]);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setItems(await listMyStaffPortfolioItems(actor)); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, [actor]);
  useEffect(() => { if (canUseMyStaffPortfolio(actor)) void load(); else setLoading(false); }, [actor, load]);

  async function openFile(item: StaffPortfolioItem, download = false) {
    try { const result = await getStaffPortfolioFileUrl(actor, item.id); const link = document.createElement("a"); link.href = result.url; link.target = "_blank"; link.rel = "noopener"; if (download) link.download = result.originalName; link.click(); } catch (err) { setError(errorMessage(err)); }
  }

  async function archive(item: StaffPortfolioItem) {
    if (!window.confirm("هل تريد أرشفة هذا العنصر؟")) return;
    try { await archiveStaffPortfolioItem(actor, item.id); await load(); } catch (err) { setError(errorMessage(err)); }
  }

  async function deleteItem() {
    const item = deleteTarget;
    if (!item || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteStaffPortfolioItem(actor, item.id);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      deleteInFlight.current = false;
      setDeletingId("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) { setError("يرجى اختيار ملف PDF."); return; }
    setSubmitting(true); setError(null);
    try {
      await submitStaffPortfolioItem({ actor, kind: tab, title: form.title, description: form.description, occurredAt: new Date(`${form.occurredAt}T12:00:00`).getTime(), academicYearId: form.academicYearId, termId: form.termId, providerName: form.providerName, trainingHours: form.trainingHours ? Number(form.trainingHours) : undefined, file });
      setShowForm(false); setFile(null); setForm((previous) => ({ ...previous, title: "", description: "", providerName: "", trainingHours: "" })); await load();
    } catch (err) { setError(errorMessage(err)); } finally { setSubmitting(false); }
  }

  if (!canUseMyStaffPortfolio(actor)) return null;
  const deleteCopy = deleteTarget?.kind === "INITIATIVE"
    ? { title: "حذف المبادرة", body: "هل تريد حذف هذه المبادرة نهائيًا؟ لا يمكن التراجع عن هذا الإجراء." }
    : { title: "حذف التطوير المهني", body: "هل تريد حذف هذا التطوير المهني نهائيًا؟ لا يمكن التراجع عن هذا الإجراء." };

  return <main className="mx-auto max-w-6xl space-y-6 p-6" dir="rtl">
    <section className="rounded-3xl border bg-card p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold">ملف إنجازي</h1><p className="mt-1 text-sm text-muted-foreground">ارفع أدلة المبادرات والتطوير المهني الخاصة بك.</p></div><Button onClick={() => setShowForm((value) => !value)}><FilePlus2 className="size-4" />إضافة {labels[tab]}</Button></div></section>
    <div className="flex gap-2 border-b"><Button variant={tab === "INITIATIVE" ? "default" : "ghost"} onClick={() => setTab("INITIATIVE")}>المبادرات</Button><Button variant={tab === "PROFESSIONAL_DEVELOPMENT" ? "default" : "ghost"} onClick={() => setTab("PROFESSIONAL_DEVELOPMENT")}>التطوير المهني</Button></div>
    {showForm ? <form onSubmit={submit} className="grid gap-4 rounded-3xl border bg-card p-6 shadow-sm md:grid-cols-2"><h2 className="md:col-span-2 text-lg font-bold">إضافة {labels[tab]}</h2><label className="grid gap-1 text-sm">العنوان *<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-xl border bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">تاريخ التنفيذ *<input required type="date" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} className="rounded-xl border bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">العام الدراسي *<select required value={form.academicYearId} onChange={(event) => { const term = terms.find((item) => item.academicYearId === event.target.value); setForm({ ...form, academicYearId: event.target.value, termId: term?.id ?? "" }); }} className="rounded-xl border bg-background px-3 py-2"><option value="">اختر العام</option>{terms.map((term) => <option key={term.academicYearId} value={term.academicYearId}>{term.academicYearId}</option>)}</select></label><label className="grid gap-1 text-sm">الفصل الدراسي *<select required value={form.termId} onChange={(event) => setForm({ ...form, termId: event.target.value })} className="rounded-xl border bg-background px-3 py-2"><option value="">اختر الفصل</option>{terms.filter((term) => term.academicYearId === form.academicYearId).map((term) => <option key={term.id} value={term.id}>{term.title}</option>)}</select></label>{tab === "PROFESSIONAL_DEVELOPMENT" ? <><label className="grid gap-1 text-sm">الجهة المقدمة<input value={form.providerName} onChange={(event) => setForm({ ...form, providerName: event.target.value })} className="rounded-xl border bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm">عدد الساعات<input min="0" step="0.5" type="number" value={form.trainingHours} onChange={(event) => setForm({ ...form, trainingHours: event.target.value })} className="rounded-xl border bg-background px-3 py-2" /></label></> : null}<label className="grid gap-1 text-sm md:col-span-2">الوصف (اختياري)<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 rounded-xl border bg-background px-3 py-2" /></label><label className="grid gap-1 text-sm md:col-span-2">ملف PDF * (25 MB كحد أقصى)<input required type="file" accept="application/pdf,.pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border bg-background px-3 py-2" /></label><div className="flex gap-2 md:col-span-2"><Button disabled={submitting} type="submit">{submitting ? <Loader2 className="size-4 animate-spin" /> : null}رفع وإرسال</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button></div></form> : null}
    {error ? <div className="rounded-2xl border border-destructive/40 bg-card p-4 text-sm text-destructive">{error}</div> : null}
    {loading ? <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">جارٍ تحميل ملف الإنجاز…</div> : currentItems.length === 0 ? <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">لا توجد عناصر في هذا القسم حتى الآن.</div> : <section className="grid gap-4 md:grid-cols-2">{currentItems.map((item) => { const isDeleting = deletingId === item.id; return <article key={item.id} className="rounded-3xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{labels[item.kind]} · {formatDate(item.occurredAt)}</p></div><span className="rounded-full border px-2 py-1 text-xs">{item.status === "ARCHIVED" ? "مؤرشف" : "مُرسل"}</span></div><div className="mt-4 space-y-1 text-sm text-muted-foreground"><p>العام/الفصل: {item.academicYearTitle || item.academicYearId} · {item.termTitle || item.termId}</p>{item.providerName ? <p>الجهة: {item.providerName}{item.trainingHours !== undefined ? ` · ${item.trainingHours} ساعة` : ""}</p> : null}<p className="truncate">الملف: {item.file.originalName}</p></div><div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void openFile(item)}><Eye className="size-4" />عرض</Button><Button size="sm" variant="outline" onClick={() => void openFile(item, true)}><Download className="size-4" />تنزيل</Button>{item.status === "SUBMITTED" ? <Button size="sm" variant="ghost" onClick={() => void archive(item)}><Archive className="size-4" />أرشفة</Button> : null}<Button size="sm" variant="destructive" disabled={isDeleting} onClick={() => setDeleteTarget(item)}>{isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}حذف</Button></div></article>; })}</section>}
    <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deletingId) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleteCopy.title}</AlertDialogTitle><AlertDialogDescription>{deleteCopy.body}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button variant="outline" disabled={Boolean(deletingId)}>إلغاء</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" disabled={Boolean(deletingId)} onClick={() => void deleteItem()}>{deletingId ? <Loader2 className="size-4 animate-spin" /> : null}حذف</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
