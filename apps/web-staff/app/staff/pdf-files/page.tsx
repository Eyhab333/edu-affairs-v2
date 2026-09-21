"use client";

import Link from "next/link";
import { FolderOpen, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { getVisibleStaffPdfFileCategories } from "@/lib/staff-pdf-files";

export default function StaffPdfFilesPage() {
  const { actor } = useStaffActor();
  const visibleCategories = getVisibleStaffPdfFileCategories(actor);

  return <main dir="rtl" className="space-y-5"><section><Badge variant="secondary">مركز ملفات PDF</Badge><h1 className="mt-2 text-2xl font-bold">رفع ملفات PDF</h1><p className="mt-2 text-sm text-muted-foreground">اختر فئة لرفع ملفات PDF وحفظها واستعراض الملفات المتاحة ضمن نطاقك.</p></section><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleCategories.map((category) => <Link key={category.key} href={category.href} className="group block"><Card className="h-full transition group-hover:border-primary/50 group-hover:shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="size-5" /></div><FolderOpen className="size-5 text-muted-foreground transition group-hover:text-primary" /></div><h2 className="mt-5 font-semibold">{category.title}</h2><p className="mt-2 text-sm text-muted-foreground">{category.description}</p></CardContent></Card></Link>)}</section></main>;
}
