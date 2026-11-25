"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  FileText,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react";
import type {
  SchoolAnnouncementAudienceScope,
  SchoolAnnouncementPriority,
  SchoolAnnouncementStatus,
} from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementFiles } from "./announcement-files";
import {
  archiveSchoolAnnouncement,
  createSchoolAnnouncement,
  getAnnouncementAudienceOptions,
  listAnnouncementSchools,
  listSchoolAnnouncements,
  publishSchoolAnnouncement,
  updateSchoolAnnouncement,
  type AnnouncementAudienceOptions,
  type SchoolAnnouncement,
  type SchoolAnnouncementDraftInput,
} from "@/lib/staff-announcements";

const statusLabels: Record<SchoolAnnouncementStatus, string> = {
  DRAFT: "مسودة",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
};
const priorityLabels: Record<SchoolAnnouncementPriority, string> = {
  NORMAL: "عادي",
  IMPORTANT: "مهم",
  URGENT: "عاجل",
};
const audienceLabels: Record<SchoolAnnouncementAudienceScope, string> = {
  SCHOOL: "جميع المدرسة",
  GRADES: "صفوف محددة",
  CLASSES: "فصول محددة",
  STUDENTS: "طلاب محددون",
};

function emptyDraft(): SchoolAnnouncementDraftInput {
  return {
    title: "",
    content: "",
    priority: "NORMAL",
    imageUrl: "",
    attachments: [],
    audience: { scope: "SCHOOL", schoolIds: [], gradeIds: [], classIds: [], studentIds: [] },
  };
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function inputDate(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateValue(value: string) {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "تعذر إتمام العملية. حاول مرة أخرى.";
}

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toDraft(item: SchoolAnnouncement): SchoolAnnouncementDraftInput {
  return {
    title: item.title,
    content: item.content,
    priority: item.priority,
    imageUrl: item.imageUrl ?? "",
    attachments: item.attachments,
    audience: {
      ...item.audience,
      schoolIds: item.audience.schoolIds.length ? item.audience.schoolIds : [item.schoolId],
    },
    publicationStartsAt: item.publicationStartsAt,
    publicationEndsAt: item.publicationEndsAt,
    academicYearId: item.academicYearId,
    termId: item.termId,
  };
}

export default function StaffAnnouncementsPage() {
  const { actor } = useStaffActor();
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [schoolId, setSchoolId] = useState("");
  const [targetSchoolIds, setTargetSchoolIds] = useState<string[]>([]);
  const [items, setItems] = useState<SchoolAnnouncement[]>([]);
  const [status, setStatus] = useState<SchoolAnnouncementStatus | "">("");
  const [audienceOptions, setAudienceOptions] = useState<AnnouncementAudienceOptions>({
    grades: [], classes: [], students: [], nextCursor: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<SchoolAnnouncementDraftInput>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isPlatformOwner = actor.roles.includes("platform_owner");

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadAnnouncements = useCallback(async () => {
    if (!isPlatformOwner) return;
    setLoading(true);
    setError(null);
    try {
      const nextItems = await listSchoolAnnouncements({ orgId: actor.orgId, schoolId: schoolId || undefined, status });
      setItems(nextItems);
      setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : null);
    } catch (nextError) {
      setItems([]);
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [actor.orgId, isPlatformOwner, schoolId, status]);

  const loadAudienceOptions = useCallback(async () => {
    if (!isPlatformOwner || targetSchoolIds.length === 0) {
      setAudienceOptions({ grades: [], classes: [], students: [], nextCursor: null });
      return;
    }
    try {
      setAudienceOptions(await getAnnouncementAudienceOptions({
        orgId: actor.orgId,
        schoolIds: targetSchoolIds,
      }));
    } catch (nextError) {
      setError(nextError);
    }
  }, [actor.orgId, isPlatformOwner, targetSchoolIds]);

  useEffect(() => {
    let active = true;
    async function loadSchools() {
      if (!isPlatformOwner) return;
      setLoading(true);
      setError(null);
      try {
        const nextSchools = await listAnnouncementSchools(actor.orgId);
        if (!active) return;
        setSchools(nextSchools);
      } catch (nextError) {
        if (active) setError(nextError);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSchools();
    return () => { active = false; };
  }, [actor.orgId, isPlatformOwner]);

  useEffect(() => { void loadAnnouncements(); }, [loadAnnouncements]);
  useEffect(() => { void loadAudienceOptions(); }, [loadAudienceOptions]);

  function beginNew() {
    setSelectedId(null);
    setDraft(emptyDraft());
    setTargetSchoolIds([]);
  }

  function beginEdit(item: SchoolAnnouncement) {
    setFormOpen(true);
    setSelectedId(item.id);
    const nextDraft = toDraft(item);
    setDraft(nextDraft);
    setTargetSchoolIds(nextDraft.audience.schoolIds ?? []);
  }

  async function saveDraft() {
    if (!targetSchoolIds.length) throw new Error("اختر مدرسة واحدة على الأقل.");
    const item = {
      ...draft,
      audience: { ...draft.audience, schoolIds: targetSchoolIds },
    };
    const saved = selectedId
      ? await updateSchoolAnnouncement({ orgId: actor.orgId, announcementId: selectedId, item })
      : await createSchoolAnnouncement({ orgId: actor.orgId, item });
    setSelectedId(saved.id);
    return saved;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveDraft();
      setFormOpen(false);
      await loadAnnouncements();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setSaving(true);
    setError(null);
    try {
      const item = await saveDraft();
      await publishSchoolAnnouncement({ orgId: actor.orgId, announcementId: item.id });
      setFormOpen(false);
      await loadAnnouncements();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!selectedId || !window.confirm("هل تريد أرشفة هذا الإعلان؟")) return;
    setSaving(true);
    setError(null);
    try {
      await archiveSchoolAnnouncement({ orgId: actor.orgId, announcementId: selectedId });
      await loadAnnouncements();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  async function loadMoreAudienceOptions() {
    if (!targetSchoolIds.length || !audienceOptions.nextCursor) return;
    try {
      const next = await getAnnouncementAudienceOptions({
        orgId: actor.orgId, schoolIds: targetSchoolIds,
      });
      setAudienceOptions((current) => ({
        grades: [...new Map([...current.grades, ...next.grades].map((item) => [item.id, item])).values()],
        classes: [...new Map([...current.classes, ...next.classes].map((item) => [item.id, item])).values()],
        students: [...new Map([...current.students, ...next.students].map((item) => [item.id, item])).values()],
        nextCursor: next.nextCursor,
      }));
    } catch (nextError) {
      setError(nextError);
    }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Megaphone className="size-6" /></div><div><h1 className="text-2xl font-bold">الإعلانات المدرسية</h1><p className="mt-1 text-sm text-muted-foreground">إعلانات مستقلة موجهة حسب المدرسة أو الصف أو الفصل أو الطالب.</p></div></div>
        <Button type="button" onClick={() => { beginNew(); setFormOpen(true); }}><Plus className="size-4" /> إنشاء إعلان جديد</Button>
      </section>

      {error && !formOpen ? <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{errorMessage(error)}</div> : null}

      <Card><CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-end"><label className="grid gap-2 text-sm md:min-w-64"><span>المدرسة</span><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)} className="h-10 rounded-lg border bg-background px-3"><option value="">جميع المدارس</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label className="grid gap-2 text-sm md:min-w-48"><span>الحالة</span><select value={status} onChange={(event) => setStatus(event.target.value as SchoolAnnouncementStatus | "")} className="h-10 rounded-lg border bg-background px-3"><option value="">كل الحالات</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button type="button" variant="outline" onClick={() => void loadAnnouncements()} disabled={loading}>تحديث</Button></CardContent></Card>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-label={selectedId ? "تعديل الإعلان" : "إعلان جديد"} className="relative max-h-[90dvh] w-full max-w-5xl space-y-4 overflow-y-auto rounded-2xl bg-background p-4 shadow-xl sm:p-6">
            <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" disabled={saving} onClick={() => { setFormOpen(false); beginNew(); }} className="absolute left-3 top-3 z-10"><X className="size-5" /></Button>
            {error ? <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{errorMessage(error)}</div> : null}
        <Card>
        <CardHeader><CardTitle>المدارس المستهدفة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">اختر مدرسة واحدة أو عدة مدارس، أو حدّد جميع المدارس النشطة والروضات. يُحفظ إعلان واحد بالمستهدفات المختارة.</p>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={schools.length > 0 && targetSchoolIds.length === schools.length}
              onChange={(event) => {
                const nextIds = event.target.checked ? schools.map((school) => school.id) : [];
                setTargetSchoolIds(nextIds);
                setDraft((current) => ({ ...current, audience: { ...current.audience, schoolIds: nextIds } }));
              }}
            />
            تحديد جميع المدارس والروضات
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {schools.map((school) => (
              <label key={school.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={targetSchoolIds.includes(school.id)}
                  onChange={() => {
                    const nextIds = toggle(targetSchoolIds, school.id);
                    setTargetSchoolIds(nextIds);
                    setDraft((current) => ({ ...current, audience: { ...current.audience, schoolIds: nextIds } }));
                  }}
                />
                {school.name}
              </label>
            ))}
          </div>
        </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>{selectedId ? "تعديل الإعلان" : "إعلان جديد"}</CardTitle></CardHeader><CardContent><div className="grid gap-4"><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>العنوان</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="h-10 rounded-lg border bg-background px-3" /></label><label className="grid gap-2 text-sm"><span>الأولوية</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as SchoolAnnouncementPriority }))} className="h-10 rounded-lg border bg-background px-3">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="grid gap-2 text-sm"><span>المحتوى</span><textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} className="min-h-32 rounded-lg border bg-background p-3" /></label><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>رابط صورة HTTPS (اختياري)</span><input type="url" value={draft.imageUrl ?? ""} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} className="h-10 rounded-lg border bg-background px-3" /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm"><span>بداية الظهور</span><input type="datetime-local" value={inputDate(draft.publicationStartsAt)} onChange={(event) => setDraft((current) => ({ ...current, publicationStartsAt: dateValue(event.target.value) }))} className="h-10 rounded-lg border bg-background px-3" /></label><label className="grid gap-2 text-sm"><span>نهاية الظهور</span><input type="datetime-local" value={inputDate(draft.publicationEndsAt)} onChange={(event) => setDraft((current) => ({ ...current, publicationEndsAt: dateValue(event.target.value) }))} className="h-10 rounded-lg border bg-background px-3" /></label></div></div>

        <section className="space-y-3 rounded-xl border p-4"><div><h2 className="font-semibold">الجمهور المستهدف</h2><p className="mt-1 text-xs text-muted-foreground">تُتحقق حدود المدرسة والأهداف المختارة على الخادم عند الحفظ والنشر.</p></div><div className="flex flex-wrap gap-2">{Object.entries(audienceLabels).map(([value, label]) => <Button key={value} type="button" size="sm" variant={draft.audience.scope === value ? "default" : "outline"} onClick={() => setDraft((current) => ({ ...current, audience: { scope: value as SchoolAnnouncementAudienceScope, gradeIds: [], classIds: [], studentIds: [] } }))}>{label}</Button>)}</div>{draft.audience.scope === "GRADES" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{audienceOptions.grades.map((grade) => <label key={grade.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={draft.audience.gradeIds.includes(grade.id)} onChange={() => setDraft((current) => ({ ...current, audience: { ...current.audience, gradeIds: toggle(current.audience.gradeIds, grade.id) } }))} />{grade.name}</label>)}</div> : null}{draft.audience.scope === "CLASSES" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{audienceOptions.classes.map((classItem) => <label key={classItem.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={draft.audience.classIds.includes(classItem.id)} onChange={() => setDraft((current) => ({ ...current, audience: { ...current.audience, classIds: toggle(current.audience.classIds, classItem.id) } }))} />{classItem.label}</label>)}</div> : null}{draft.audience.scope === "STUDENTS" ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{audienceOptions.students.map((student) => <label key={student.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={draft.audience.studentIds.includes(student.id)} onChange={() => setDraft((current) => ({ ...current, audience: { ...current.audience, studentIds: toggle(current.audience.studentIds, student.id) } }))} />{student.name}</label>)}</div> : null}{audienceOptions.nextCursor ? <Button type="button" size="sm" variant="outline" onClick={() => void loadMoreAudienceOptions()}>تحميل المزيد من المستهدفين</Button> : null}</section>

        {selected ? <AnnouncementFiles orgId={actor.orgId} announcement={selected} onChanged={loadAnnouncements} /> : <p className="text-sm text-muted-foreground">احفظ الإعلان مسودة أولاً لتتمكن من رفع الملفات.</p>}
        <section className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">روابط HTTPS السابقة</h2></div><Button type="button" size="sm" variant="outline" disabled={!!selected && selected.status !== "DRAFT"} onClick={() => setDraft((current) => ({ ...current, attachments: [...current.attachments, { title: "", url: "" }] }))}><Plus className="size-4" /> إضافة</Button></div>{draft.attachments.map((attachment, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]"><input placeholder="عنوان المرفق" value={attachment.title} onChange={(event) => setDraft((current) => ({ ...current, attachments: current.attachments.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} className="h-10 rounded-lg border bg-background px-3 text-sm" /><input type="url" placeholder="https://..." value={attachment.url} onChange={(event) => setDraft((current) => ({ ...current, attachments: current.attachments.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) }))} className="h-10 rounded-lg border bg-background px-3 text-sm" /><Button type="button" size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))}>إزالة</Button></div>)}</section>

        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void handleSave()} disabled={saving || (!!selected && selected.status !== "DRAFT")}>{saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} حفظ مسودة</Button>{(!selected || selected.status === "DRAFT") ? <Button type="button" variant="secondary" onClick={() => void handlePublish()} disabled={saving}><Send className="size-4" /> نشر</Button> : null}{selected && selected.status !== "ARCHIVED" ? <Button type="button" variant="outline" onClick={() => void handleArchive()} disabled={saving}><Archive className="size-4" /> أرشفة</Button> : null}</div>
        <div><Button type="button" variant="outline" disabled={saving} onClick={() => { setFormOpen(false); beginNew(); }}>إلغاء</Button></div>
      </div></CardContent></Card>
          </div>
        </div>
      ) : null}

      <section className="space-y-3"><h2 className="text-lg font-bold">الإعلانات</h2>{loading ? <Card><CardContent className="pt-6 text-sm text-muted-foreground"><Loader2 className="ml-2 inline size-4 animate-spin" /> جارٍ التحميل…</CardContent></Card> : null}{!loading && items.length === 0 ? <Card><CardContent className="pt-6 text-sm text-muted-foreground">لا توجد إعلانات ضمن هذا الفلتر.</CardContent></Card> : null}{items.map((item) => <Card key={item.id} className={selectedId === item.id ? "border-primary/50" : ""}><CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title}</h3><span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabels[item.status]}</span><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{priorityLabels[item.priority]}</span></div><p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p><p className="text-xs text-muted-foreground">{audienceLabels[item.audience.scope]} • آخر تحديث {formatDate(item.updatedAt)} • الظهور: {formatDate(item.publicationStartsAt)} — {formatDate(item.publicationEndsAt)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => beginEdit(item)} disabled={item.status === "ARCHIVED"}><Pencil className="size-4" /> تعديل</Button></CardContent></Card>)}</section>
    </main>
  );
}
