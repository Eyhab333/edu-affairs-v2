"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Eye, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { PdfResource, PdfResourceAcknowledgement } from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acknowledgePdfResource, downloadPdfResource, listMyPdfResources, viewPdfResource } from "@/lib/pdf-resources";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

export default function MyDocumentsPage() {
  const { actor } = useStaffActor();
  const [resources, setResources] = useState<PdfResource[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<Record<string, PdfResourceAcknowledgement>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listMyPdfResources(actor);
      setResources(result.resources); setAcknowledgements(result.acknowledgementsByResourceId);
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [actor]);

  useEffect(() => { void load(); }, [load]);

  async function acknowledge(resource: PdfResource) {
    if (acknowledgements[resource.id]) return;
    setBusyId(resource.id);
    try {
      const acknowledgement = await acknowledgePdfResource({ actor, resource });
      setAcknowledgements((current) => ({ ...current, [resource.id]: acknowledgement }));
      toast.success("تم تسجيل إقرار الاطلاع على المستند.");
    } catch (acknowledgementError) { toast.error(errorMessage(acknowledgementError)); }
    finally { setBusyId(""); }
  }

  async function fileAction(resource: PdfResource, action: "view" | "download") {
    setBusyId(`${resource.id}-${action}`);
    try {
      if (action === "view") await viewPdfResource(resource);
      else await downloadPdfResource(resource);
    } catch (fileError) { toast.error(errorMessage(fileError)); }
    finally { setBusyId(""); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
          <div><Badge variant="secondary">مهام وظيفتي</Badge><h1 className="mt-2 text-2xl font-bold">مستندات العمل</h1><p className="mt-2 text-sm text-muted-foreground">المستندات المنشورة والموجهة إلى دورك الوظيفي.</p></div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} تحديث</Button>
        </CardContent>
      </Card>

      {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}
      {loading ? <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ تحميل المستندات...</CardContent></Card> : resources.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center"><FileText className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">لا توجد مستندات موجهة إليك حالياً</p><p className="mt-2 text-sm text-muted-foreground">ستظهر هنا مهام ووثائق دورك الوظيفي عند نشرها.</p></CardContent></Card>
      ) : <section className="grid gap-4 xl:grid-cols-2">{resources.map((resource) => {
        const acknowledgement = acknowledgements[resource.id];
        const needsAcknowledgement = resource.requiresAcknowledgement && !acknowledgement;
        return <Card key={resource.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><FileText className="size-5 shrink-0 text-primary" /><div className="flex flex-wrap justify-end gap-2"><Badge variant={resource.requiresAcknowledgement ? "secondary" : "outline"}>{resource.requiresAcknowledgement ? "يتطلب إقراراً" : "لا يتطلب إقراراً"}</Badge>{resource.requiresAcknowledgement ? <Badge variant={acknowledgement ? "secondary" : "outline"}>{acknowledgement ? "تم الإقرار" : "بانتظار الإقرار"}</Badge> : null}</div></div><CardTitle className="mt-3">{resource.title}</CardTitle>{resource.description ? <CardDescription className="leading-6">{resource.description}</CardDescription> : null}</CardHeader><CardContent className="mt-auto space-y-4"><div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs">اسم الملف</p><p className="mt-1 truncate font-medium text-foreground">{resource.file.originalName}</p></div><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs">تاريخ النشر</p><p className="mt-1 font-medium text-foreground">{formatDate(resource.publishedAt)}</p></div></div>{acknowledgement ? <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" /> تم الإقرار في {formatDate(acknowledgement.acknowledgedAt)}</p> : null}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busyId === `${resource.id}-view`} onClick={() => void fileAction(resource, "view")}><Eye className="size-4" /> عرض الملف</Button><Button variant="outline" disabled={busyId === `${resource.id}-download`} onClick={() => void fileAction(resource, "download")}><Download className="size-4" /> تنزيل</Button>{needsAcknowledgement ? <Button disabled={busyId === resource.id} onClick={() => void acknowledge(resource)}>{busyId === resource.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} أقر بأنني اطلعت على المستند</Button> : null}</div></CardContent></Card>;
      })}</section>}
    </div>
  );
}
