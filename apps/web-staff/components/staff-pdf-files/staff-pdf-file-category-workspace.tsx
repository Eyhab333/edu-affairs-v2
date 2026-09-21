"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { PersonSupervisionScope, StaffPdfFile, StaffPdfFileCategoryKey } from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/error-message";
import { loadPersonSupervisionScopes } from "@/lib/person-supervision-scopes";
import {
  canBrowseStaffPdfFiles,
  filterVisibleStaffPdfFiles,
  listStaffPdfFiles,
} from "@/lib/staff-pdf-files";

import { StaffPdfFileList } from "./staff-pdf-file-list";
import { StaffPdfFileUploadForm } from "./staff-pdf-file-upload-form";

type FileView = "MINE" | "SCOPE";

export function StaffPdfFileCategoryWorkspace(props: {
  category: { key: StaffPdfFileCategoryKey; title: string; description: string };
}) {
  const { actor } = useStaffActor();
  const [files, setFiles] = useState<StaffPdfFile[]>([]);
  const [supervisionScopes, setSupervisionScopes] = useState<PersonSupervisionScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<FileView>("MINE");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextFiles, nextScopes] = await Promise.all([
        listStaffPdfFiles({ orgId: actor.orgId, categoryKey: props.category.key }),
        loadPersonSupervisionScopes({ orgId: actor.orgId, personId: actor.personId }),
      ]);
      setFiles(nextFiles);
      setSupervisionScopes(nextScopes);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actor.orgId, actor.personId, props.category.key]);

  useEffect(() => { void load(); }, [load]);

  const schoolNames = useMemo(() => new Map(actor.schools.map((school) => [school.id, school.name])), [actor.schools]);
  const canBrowseScope = canBrowseStaffPdfFiles({ actor, supervisionScopes });
  const visibleFiles = useMemo(() => filterVisibleStaffPdfFiles({ actor, files, supervisionScopes }), [actor, files, supervisionScopes]);
  const filteredFiles = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    return visibleFiles.filter((file) => {
      const isOwn = file.ownerPersonId === actor.personId || file.ownerUid === actor.uid;
      if (view === "MINE" ? !isOwn : isOwn) return false;
      if (!normalizedSearch) return true;
      return [file.title, file.ownerDisplayName, file.originalFileName].some((value) => value.toLocaleLowerCase("ar").includes(normalizedSearch));
    });
  }, [actor.personId, actor.uid, search, view, visibleFiles]);

  return <div dir="rtl" className="space-y-5"><Card><CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center"><div><Badge variant="secondary">مركز ملفات PDF</Badge><h1 className="mt-2 text-2xl font-bold">{props.category.title}</h1><p className="mt-2 text-sm text-muted-foreground">{props.category.description}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="size-4" /> تحديث</Button><Button onClick={() => setShowUpload((value) => !value)}><Plus className="size-4" /> رفع ملف PDF</Button></div></CardContent></Card>{showUpload ? <StaffPdfFileUploadForm categoryKey={props.category.key} onUploaded={load} onCancel={() => setShowUpload(false)} /> : null}<Card><CardHeader><CardTitle className="text-base">استعراض الملفات</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-2"><Button size="sm" variant={view === "MINE" ? "default" : "outline"} onClick={() => setView("MINE")}>ملفاتي</Button>{canBrowseScope ? <Button size="sm" variant={view === "SCOPE" ? "default" : "outline"} onClick={() => setView("SCOPE")}>ضمن نطاقي</Button> : null}</div><label className="relative block w-full sm:w-72"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الملف أو الموظف" className="h-10 w-full rounded-xl border bg-background pr-10 pl-3 text-sm" /></label></div>{loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ تحميل الملفات...</div> : <StaffPdfFileList files={filteredFiles} showOwner={view === "SCOPE"} schoolNames={schoolNames} emptyLabel={view === "MINE" ? "لم ترفع أي ملفات بعد" : `لا توجد ملفات ${props.category.title} ضمن نطاقك حاليًا`} />}</CardContent></Card></div>;
}
