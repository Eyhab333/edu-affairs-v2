"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { PdfResource } from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadPdfResource, isTeacherPdfResourceActor, listMyTeachingPdfResources, viewPdfResource } from "@/lib/pdf-resources";

type TeachingTab = "CURRICULUM_DISTRIBUTION" | "ENRICHMENT_MATERIAL";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

export default function TeachingResourcesPage() {
  const { actor } = useStaffActor();
  const [resources, setResources] = useState<PdfResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TeachingTab>("CURRICULUM_DISTRIBUTION");
  const [gradeFilter, setGradeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setResources(await listMyTeachingPdfResources(actor)); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [actor]);
  useEffect(() => { void load(); }, [load]);

  const gradeOptions = useMemo(() => Array.from(new Set(resources.flatMap((item) => item.audience.gradeIds))).filter(Boolean), [resources]);
  const subjectOptions = useMemo(() => Array.from(new Set(resources.flatMap((item) => item.audience.subjectKeys))).filter(Boolean), [resources]);
  const classesById = useMemo(() => new Map(actor.classes.map((item) => [item.id, item.title || item.sectionLabel || item.id])), [actor.classes]);
  const offeringsById = useMemo(() => new Map(actor.classSubjectOfferings.map((item) => [item.id, item])), [actor.classSubjectOfferings]);
  const schoolNames = useMemo(() => new Map(actor.schools.map((item) => [item.id, item.name || item.id])), [actor.schools]);
  const termsById = useMemo(() => new Map(Object.values(actor.currentTermsByAcademicYear).map((item) => [item.id, item.title || item.shortTitle || item.id])), [actor.currentTermsByAcademicYear]);
  const visibleResources = resources.filter((resource) => resource.kind === tab && (!gradeFilter || resource.audience.gradeIds.includes(gradeFilter)) && (!subjectFilter || resource.audience.subjectKeys.includes(subjectFilter)));

  async function fileAction(resource: PdfResource, action: "view" | "download") {
    setBusyId(`${resource.id}-${action}`);
    try { if (action === "view") await viewPdfResource(resource); else await downloadPdfResource(resource); }
    catch (fileError) { toast.error(errorMessage(fileError)); }
    finally { setBusyId(""); }
  }

  if (!isTeacherPdfResourceActor(actor)) {
    return <Card className="border-destructive/40"><CardHeader><CardTitle>غير مصرح بالوصول</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">هذه الصفحة متاحة للمعلمين أصحاب الإسنادات التعليمية فقط.</CardContent></Card>;
  }

  return <div className="space-y-5">
    <Card><CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center"><div><Badge variant="secondary">المصادر التعليمية</Badge><h1 className="mt-2 text-2xl font-bold">المصادر التعليمية</h1><p className="mt-2 text-sm text-muted-foreground">تظهر المصادر المرتبطة بإسناداتك التعليمية النشطة فقط.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} تحديث</Button></CardContent></Card>
    <Card><CardContent className="space-y-4 p-5"><div className="flex flex-wrap gap-2"><Button size="sm" variant={tab === "CURRICULUM_DISTRIBUTION" ? "default" : "outline"} onClick={() => setTab("CURRICULUM_DISTRIBUTION")}>توزيع المنهج</Button><Button size="sm" variant={tab === "ENRICHMENT_MATERIAL" ? "default" : "outline"} onClick={() => setTab("ENRICHMENT_MATERIAL")}>المذكرات الإثرائية</Button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>الصف</span><select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3"><option value="">كل الصفوف</option>{gradeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-2 text-sm"><span>المادة</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3"><option value="">كل المواد</option>{subjectOptions.map((item) => <option key={item} value={item}>{resources.find((resource) => resource.audience.subjectKeys.includes(item))?.audience.classSubjectOfferingIds.map((id) => offeringsById.get(id)?.subjectTitleSnapshot).find(Boolean) || item}</option>)}</select></label></div></CardContent></Card>
    {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}
    {loading ? <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ تحميل المصادر التعليمية...</CardContent></Card> : visibleResources.length === 0 ? <Card className="border-dashed"><CardContent className="p-8 text-center"><FileText className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">لا توجد مصادر مطابقة</p><p className="mt-2 text-sm text-muted-foreground">ستظهر هنا الموارد المنشورة لإسناداتك التعليمية النشطة.</p></CardContent></Card> : <section className="grid gap-4 xl:grid-cols-2">{visibleResources.map((resource) => {
      const relevantOfferings = resource.audience.classSubjectOfferingIds.map((id) => offeringsById.get(id)).filter((item): item is NonNullable<typeof item> => !!item);
      const relevantClasses = Array.from(new Set(relevantOfferings.map((item) => classesById.get(item.classId) ?? item.classId)));
      const subject = relevantOfferings[0]?.subjectTitleSnapshot || resource.audience.subjectKeys[0] || "—";
      return <Card key={resource.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><FileText className="size-5 shrink-0 text-primary" /><Badge variant="secondary">{resource.kind === "CURRICULUM_DISTRIBUTION" ? "توزيع المنهج" : "مذكرة إثرائية"}</Badge></div><CardTitle className="mt-3">{resource.title}</CardTitle>{resource.description ? <CardDescription className="leading-6">{resource.description}</CardDescription> : null}</CardHeader><CardContent className="mt-auto space-y-4"><div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">المدرسة</p><p className="mt-1 font-medium">{schoolNames.get(resource.audience.schoolIds[0]) ?? resource.audience.schoolIds[0] ?? "—"}</p></div><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">الصف والمادة</p><p className="mt-1 font-medium">{resource.audience.gradeIds[0] ?? "—"} — {subject}</p></div><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">الفصل الدراسي</p><p className="mt-1 font-medium">{termsById.get(resource.audience.termId) ?? resource.audience.termId ?? "—"}</p></div><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">الفصول المستهدفة</p><p className="mt-1 font-medium">{relevantClasses.join("، ") || "—"}</p></div></div><p className="text-sm text-muted-foreground">{resource.file.originalName} · نُشر {formatDate(resource.publishedAt)}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busyId === `${resource.id}-view`} onClick={() => void fileAction(resource, "view")}><Eye className="size-4" /> عرض</Button><Button variant="outline" disabled={busyId === `${resource.id}-download`} onClick={() => void fileAction(resource, "download")}><Download className="size-4" /> تنزيل</Button></div></CardContent></Card>;
    })}</section>}
  </div>;
}
