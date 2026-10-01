"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StaffPdfFile } from "@takween/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  downloadStaffPdfFile,
  formatStaffPdfFileSize,
  getStaffPdfFileErrorMessage,
  viewStaffPdfFile,
} from "@/lib/staff-pdf-files";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(value));
}

function ownerDisplaySchoolIds(file: StaffPdfFile) {
  return file.ownerMembershipSchoolIds.length > 0
    ? file.ownerMembershipSchoolIds
    : file.ownerSchoolIds;
}

export function StaffPdfFileList(props: {
  files: StaffPdfFile[];
  showOwner: boolean;
  schoolNames: Map<string, string>;
  emptyLabel: string;
}) {
  const [busyId, setBusyId] = useState("");
  const fileGroups = useMemo(() => {
    const groups = new Map<string, StaffPdfFile[]>();
    for (const file of props.files) {
      const group = groups.get(file.ownerPersonId) ?? [];
      group.push(file);
      groups.set(file.ownerPersonId, group);
    }
    return Array.from(groups.values()).sort((left, right) => left[0].ownerDisplayName.localeCompare(right[0].ownerDisplayName, "ar"));
  }, [props.files]);

  async function runAction(file: StaffPdfFile, action: "view" | "download") {
    setBusyId(`${action}-${file.id}`);
    try {
      if (action === "view") await viewStaffPdfFile(file);
      else await downloadStaffPdfFile(file);
    } catch (error) {
      toast.error(getStaffPdfFileErrorMessage(error));
    } finally {
      setBusyId("");
    }
  }

  if (props.files.length === 0) return <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">{props.emptyLabel}</CardContent></Card>;

  return <div className="space-y-5">{fileGroups.map((group) => <section key={group[0].ownerPersonId} className="space-y-2"><div className="flex flex-wrap items-center gap-2">{props.showOwner ? <h3 className="font-semibold">{group[0].ownerDisplayName}</h3> : null}{ownerDisplaySchoolIds(group[0]).map((schoolId) => <Badge key={schoolId} variant="outline">{props.schoolNames.get(schoolId) ?? "مدرسة ضمن النطاق"}</Badge>)}</div><div className="space-y-2">{group.map((file) => <Card key={file.id}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><FileText className="size-5 shrink-0 text-primary" /><h4 className="truncate font-semibold">{file.title}</h4></div>{file.description ? <p className="mt-2 text-sm text-muted-foreground">{file.description}</p> : null}<p className="mt-2 text-xs text-muted-foreground">{file.originalFileName} · {formatStaffPdfFileSize(file.sizeBytes)} · رُفع {formatDate(file.createdAt)}</p>{!props.showOwner ? null : <p className="mt-1 text-xs text-muted-foreground">بواسطة: {file.ownerDisplayName}</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busyId === `view-${file.id}`} onClick={() => void runAction(file, "view")}>{busyId === `view-${file.id}` ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />} عرض</Button><Button variant="outline" size="sm" disabled={busyId === `download-${file.id}`} onClick={() => void runAction(file, "download")}>{busyId === `download-${file.id}` ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} تنزيل</Button></div></CardContent></Card>)}</div></section>)}</div>;
}
