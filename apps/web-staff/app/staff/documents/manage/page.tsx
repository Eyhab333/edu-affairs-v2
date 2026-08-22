"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Archive, BarChart3, FilePlus2, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { MembershipRole, type MembershipRole as MembershipRoleType, type PdfResource, type PdfResourceAcknowledgementReport, type PdfResourceKind } from "@takween/contracts";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { archivePdfResource, canManagePdfResources, getPdfResourceAcknowledgementReport, getSelectedTeachingOfferings, listManagedPdfResources, publishPdfResource, publishTeachingPdfResource } from "@/lib/pdf-resources";
import { getArabicRoleLabel } from "@/lib/role-labels";

const TEACHER_ROLES: MembershipRoleType[] = ["teacher", "BOYS_TEACHER", "GIRLS_TEACHER", "KG_TEACHER"];
const RESOURCE_TYPE_LABELS: Record<PdfResourceKind, string> = {
  JOB_TASKS: "مهام وظيفية",
  ENRICHMENT_MATERIAL: "مذكرة إثرائية",
  CURRICULUM_DISTRIBUTION: "توزيع المنهج",
};

function formatDate(value?: number) {
  return value ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "—";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

function ReportPanel({ report, schoolNames }: { report: PdfResourceAcknowledgementReport; schoolNames: Map<string, string> }) {
  return <div className="mt-4 space-y-4 rounded-2xl border bg-muted/20 p-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">تقرير الإقرارات</h3><p className="text-sm text-muted-foreground">{report.resourceTitle}</p></div><Badge variant="secondary">{report.summary.completionPercentage}% مكتمل</Badge></div>
    <div className="grid gap-2 sm:grid-cols-4">{[["إجمالي المستهدفين", report.summary.totalTargeted], ["تم الإقرار", report.summary.acknowledgedCount], ["قيد الانتظار", report.summary.pendingCount], ["نسبة الإنجاز", `${report.summary.completionPercentage}%`]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div>
    <div className="overflow-x-auto rounded-xl border bg-background"><table className="min-w-full text-right text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr><th className="p-3 font-medium">الموظف</th><th className="p-3 font-medium">الدور</th><th className="p-3 font-medium">المدرسة</th><th className="p-3 font-medium">الحالة</th><th className="p-3 font-medium">تاريخ الإقرار</th></tr></thead><tbody>{report.items.map((item) => <tr key={item.actorId} className="border-b last:border-0"><td className="p-3 font-medium">{item.displayName}</td><td className="p-3">{getArabicRoleLabel(item.roleKey)}</td><td className="p-3">{schoolNames.get(item.schoolId) ?? item.schoolId ?? "—"}</td><td className="p-3"><Badge variant={item.acknowledgementStatus === "ACKNOWLEDGED" ? "secondary" : "outline"}>{item.acknowledgementStatus === "ACKNOWLEDGED" ? "تم الإقرار" : "بانتظار الإقرار"}</Badge></td><td className="p-3">{formatDate(item.acknowledgedAt)}</td></tr>)}</tbody></table></div>
  </div>;
}

export default function ManageDocumentsPage() {
  const { actor } = useStaffActor();
  const canManage = canManagePdfResources(actor.roles);
  const [resources, setResources] = useState<PdfResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [report, setReport] = useState<PdfResourceAcknowledgementReport | null>(null);
  const [kind, setKind] = useState<PdfResourceKind>("JOB_TASKS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetRoles, setTargetRoles] = useState<MembershipRoleType[]>([]);
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [terms, setTerms] = useState<Array<{ id: string; title: string }>>([]);
  const [gradeNames, setGradeNames] = useState<Map<string, string>>(new Map());
  const [selectedOfferingIds, setSelectedOfferingIds] = useState<string[]>([]);
  const schoolNames = useMemo(() => new Map(actor.schools.map((school) => [school.id, school.name])), [actor.schools]);
  const isTeaching = kind !== "JOB_TASKS";

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true); setError("");
    try { setResources(await listManagedPdfResources(actor.orgId)); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }, [actor.orgId, canManage]);
  useEffect(() => { void load(); }, [load]);

  const scopedTeachingOfferings = useMemo(() => actor.classSubjectOfferings.filter((item) => item.status === "ACTIVE" && item.isArchived !== true && selectedSchoolIds.includes(item.schoolId)), [actor.classSubjectOfferings, selectedSchoolIds]);
  const academicYearIds = useMemo(() => Array.from(new Set(scopedTeachingOfferings.map((item) => item.academicYearId))), [scopedTeachingOfferings]);
  const gradeIds = useMemo(() => Array.from(new Set(scopedTeachingOfferings.filter((item) => item.academicYearId === academicYearId).map((item) => item.gradeId).filter(Boolean))), [scopedTeachingOfferings, academicYearId]);
  const subjectKeys = useMemo(() => Array.from(new Set(scopedTeachingOfferings.filter((item) => item.academicYearId === academicYearId && item.gradeId === gradeId).map((item) => item.subjectKey).filter(Boolean))), [scopedTeachingOfferings, academicYearId, gradeId]);
  const matchingOfferings = useMemo(() => getSelectedTeachingOfferings({ offerings: actor.classSubjectOfferings, schoolIds: selectedSchoolIds, academicYearId, gradeId, subjectKey }), [actor.classSubjectOfferings, selectedSchoolIds, academicYearId, gradeId, subjectKey]);
  const matchingOfferingsBySchool = useMemo(() => selectedSchoolIds.map((id) => ({
    schoolId: id,
    offerings: matchingOfferings.filter((offering) => offering.schoolId === id),
  })), [matchingOfferings, selectedSchoolIds]);
  const classNames = useMemo(() => new Map(actor.classes.map((item) => [item.id, item.title || item.sectionLabel || item.id])), [actor.classes]);

  useEffect(() => {
    if (academicYearId && !academicYearIds.includes(academicYearId)) {
      setAcademicYearId(""); setTermId(""); setGradeId(""); setSubjectKey("");
    }
  }, [academicYearId, academicYearIds]);
  useEffect(() => {
    if (gradeId && !gradeIds.includes(gradeId)) {
      setGradeId("");
      setSubjectKey("");
    }
  }, [gradeId, gradeIds]);
  useEffect(() => {
    if (subjectKey && !subjectKeys.includes(subjectKey)) setSubjectKey("");
  }, [subjectKey, subjectKeys]);
  useEffect(() => {
    const matchingIds = matchingOfferings.map((item) => item.id);
    const matchingIdSet = new Set(matchingIds);
    setSelectedOfferingIds((current) => Array.from(new Set([
      ...current.filter((item) => matchingIdSet.has(item)),
      ...matchingIds,
    ])));
  }, [matchingOfferings]);
  useEffect(() => {
    let active = true;
    async function loadTermsAndGrades() {
      if (selectedSchoolIds.length === 0 || !academicYearId) { if (active) { setTerms([]); setGradeNames(new Map()); } return; }
      try {
        const [termsSnapshot, gradesSnapshot] = await Promise.all([
          getDocs(collection(db, "orgs", actor.orgId, "academicYears", academicYearId, "terms")),
          Promise.all(selectedSchoolIds.map((schoolId) => getDocs(collection(db, "orgs", actor.orgId, "schools", schoolId, "academicYears", academicYearId, "grades")))),
        ]);
        if (!active) return;
        setTerms(termsSnapshot.docs.map((item) => ({ id: item.id, title: String(item.data().title || item.data().shortTitle || item.id) })));
        setGradeNames(new Map(gradesSnapshot.flatMap((snapshot) => snapshot.docs.map((item) => [item.id, String(item.data().title || item.id)] as const))));
      } catch (loadError) { if (active) toast.error(errorMessage(loadError)); }
    }
    void loadTermsAndGrades();
    return () => { active = false; };
  }, [actor.orgId, academicYearId, selectedSchoolIds]);

  function resetForm() {
    setKind("JOB_TASKS"); setTitle(""); setDescription(""); setTargetRoles([]); setSchoolIds([]); setRequiresAcknowledgement(false); setFile(null);
    setSelectedSchoolIds([]); setAcademicYearId(""); setTermId(""); setGradeId(""); setSubjectKey(""); setSelectedOfferingIds([]); setShowForm(false);
  }
  function changeKind(nextKind: PdfResourceKind) {
    setKind(nextKind);
    if (nextKind !== "JOB_TASKS") { setTargetRoles(TEACHER_ROLES); setRequiresAcknowledgement(false); setSchoolIds([]); }
  }
  async function publish() {
    if (!title.trim() || !file) { toast.error("أدخل العنوان واختر ملف PDF."); return; }
    if (!isTeaching && targetRoles.length === 0) { toast.error("حدد دوراً واحداً على الأقل."); return; }
    if (isTeaching && (selectedSchoolIds.length === 0 || !academicYearId || !termId || !gradeId || !subjectKey || selectedOfferingIds.length === 0)) {
      toast.error("أكمل استهداف المدرسة والسنة والفصل والصف والمادة، ثم اختر فصلاً واحداً على الأقل."); return;
    }
    setBusyId("publish");
    try {
      if (isTeaching) {
        const selectedOfferings = matchingOfferings.filter((item) => selectedOfferingIds.includes(item.id));
        await publishTeachingPdfResource({ actor, kind: kind as "ENRICHMENT_MATERIAL" | "CURRICULUM_DISTRIBUTION", title, description, targetRoleKeys: TEACHER_ROLES, schoolIds: selectedSchoolIds, academicYearId, termId, gradeId, subjectKey, classIds: selectedOfferings.map((item) => item.classId), classSubjectOfferingIds: selectedOfferings.map((item) => item.id), file });
      } else {
        await publishPdfResource({ actor, title, description, targetRoleKeys: targetRoles, schoolIds, requiresAcknowledgement, file });
      }
      toast.success("تم نشر المستند."); resetForm(); await load();
    } catch (publishError) { toast.error(errorMessage(publishError)); }
    finally { setBusyId(""); }
  }
  async function archive(resource: PdfResource) {
    if (!window.confirm(`أرشفة المستند «${resource.title}»؟ سيبقى السجل محفوظاً ولن يعود ظاهراً للمستهدفين.`)) return;
    setBusyId(`archive-${resource.id}`);
    try { await archivePdfResource({ actor, resourceId: resource.id }); toast.success("تمت أرشفة المستند."); await load(); }
    catch (archiveError) { toast.error(errorMessage(archiveError)); }
    finally { setBusyId(""); }
  }
  async function loadReport(resource: PdfResource) {
    setBusyId(`report-${resource.id}`);
    try { setReport(await getPdfResourceAcknowledgementReport({ orgId: actor.orgId, resourceId: resource.id })); }
    catch (reportError) { toast.error(errorMessage(reportError)); }
    finally { setBusyId(""); }
  }

  if (!canManage) return <Card className="border-destructive/40"><CardHeader><CardTitle>غير مصرح بالوصول</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">هذه الصفحة متاحة لإدارة المؤسسة فقط.</CardContent></Card>;

  return <div className="space-y-5">
    <Card><CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center"><div><Badge variant="secondary">مكتبة المستندات</Badge><h1 className="mt-2 text-2xl font-bold">إدارة المستندات</h1><p className="mt-2 text-sm text-muted-foreground">انشر مستندات وظيفية أو مصادر تعليمية موجهة إلى إسنادات تدريس حقيقية.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" /> تحديث</Button><Button onClick={() => setShowForm((value) => !value)}><FilePlus2 className="size-4" /> نشر مستند</Button></div></CardContent></Card>
    {showForm ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>نشر مستند</CardTitle><CardDescription>الملف المنشور ثابت؛ تنشئ المراجعات اللاحقة مورداً جديداً.</CardDescription></div><Button size="icon" variant="ghost" onClick={resetForm}><X className="size-4" /></Button></div></CardHeader><CardContent className="space-y-5">
      <label className="block space-y-2 text-sm"><span className="font-medium">نوع المورد</span><select value={kind} onChange={(event) => changeKind(event.target.value as PdfResourceKind)} className="h-11 w-full rounded-xl border bg-background px-3 md:max-w-md">{(Object.keys(RESOURCE_TYPE_LABELS) as PdfResourceKind[]).map((item) => <option key={item} value={item}>{RESOURCE_TYPE_LABELS[item]}</option>)}</select></label>
      <div className="grid gap-4 md:grid-cols-2"><label className="space-y-2 text-sm"><span className="font-medium">العنوان</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3" /></label><label className="space-y-2 text-sm"><span className="font-medium">ملف PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-sm" /><span className="text-xs text-muted-foreground">PDF فقط، بحد أقصى 25 ميجابايت.</span></label></div>
      <label className="block space-y-2 text-sm"><span className="font-medium">الوصف</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-xl border bg-background p-3" /></label>
      {isTeaching ? <section className="space-y-4 rounded-2xl border bg-muted/20 p-4"><div><h3 className="font-semibold">استهداف الإسنادات التعليمية</h3><p className="mt-1 text-sm text-muted-foreground">اختر مدرسة واحدة أو أكثر؛ سيستهدف المورد الـ offerings المطابقة المختارة فقط، دون تكرار ملف PDF.</p></div><fieldset className="space-y-2"><legend className="text-sm font-medium">المدارس المستهدفة <span className="font-normal text-muted-foreground">(اختر مدرسة واحدة على الأقل)</span></legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{actor.schools.map((school) => <label key={school.id} className="flex items-center gap-2 rounded-xl border bg-background p-3 text-sm"><input type="checkbox" checked={selectedSchoolIds.includes(school.id)} onChange={(event) => setSelectedSchoolIds((current) => event.target.checked ? Array.from(new Set([...current, school.id])) : current.filter((item) => item !== school.id))} /> {school.name}</label>)}</div></fieldset><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="space-y-2 text-sm"><span>السنة الدراسية</span><select value={academicYearId} disabled={selectedSchoolIds.length === 0} onChange={(event) => setAcademicYearId(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3"><option value="">اختر السنة</option>{academicYearIds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="space-y-2 text-sm"><span>الفصل الدراسي</span><select value={termId} disabled={!academicYearId} onChange={(event) => setTermId(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3"><option value="">اختر الفصل</option>{terms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label className="space-y-2 text-sm"><span>الصف</span><select value={gradeId} disabled={!academicYearId} onChange={(event) => setGradeId(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3"><option value="">اختر الصف</option>{gradeIds.map((item) => <option key={item} value={item}>{gradeNames.get(item) ?? item}</option>)}</select></label><label className="space-y-2 text-sm"><span>المادة</span><select value={subjectKey} disabled={!gradeId} onChange={(event) => setSubjectKey(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3"><option value="">اختر المادة</option>{subjectKeys.map((item) => <option key={item} value={item}>{actor.classSubjectOfferings.find((offering) => offering.subjectKey === item)?.subjectTitleSnapshot || item}</option>)}</select></label></div>{subjectKey ? <div className="space-y-3"><p className="text-sm font-medium">الفصول / الـ offerings المطابقة حسب المدرسة</p>{matchingOfferingsBySchool.map(({ schoolId, offerings }) => <div key={schoolId} className="rounded-xl border bg-background p-3"><p className="font-semibold">{schoolNames.get(schoolId) ?? schoolId}</p>{offerings.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">لا توجد offerings فعالة مطابقة لهذه المدرسة.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{offerings.map((offering) => <label key={offering.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={selectedOfferingIds.includes(offering.id)} onChange={(event) => setSelectedOfferingIds((current) => event.target.checked ? Array.from(new Set([...current, offering.id])) : current.filter((item) => item !== offering.id))} /><span><span className="block font-medium">{classNames.get(offering.classId) ?? offering.classId}</span><span className="text-muted-foreground">{gradeNames.get(offering.gradeId) ?? offering.gradeId} — {offering.subjectTitleSnapshot || offering.subjectKey}</span></span></label>)}</div>}</div>)}</div> : null}</section> : <><fieldset className="space-y-2"><legend className="text-sm font-medium">الأدوار المستهدفة</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{MembershipRole.options.map((role) => <label key={role} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={targetRoles.includes(role)} onChange={(event) => setTargetRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))} /> {getArabicRoleLabel(role)}</label>)}</div></fieldset>{actor.schools.length > 0 ? <fieldset className="space-y-2"><legend className="text-sm font-medium">استهداف المدارس <span className="font-normal text-muted-foreground">(اختياري — اتركه فارغاً لجميع المدارس)</span></legend><div className="flex flex-wrap gap-2">{actor.schools.map((school) => <label key={school.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={schoolIds.includes(school.id)} onChange={(event) => setSchoolIds((current) => event.target.checked ? [...current, school.id] : current.filter((item) => item !== school.id))} /> {school.name}</label>)}</div></fieldset> : null}<label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={requiresAcknowledgement} onChange={(event) => setRequiresAcknowledgement(event.target.checked)} /> يتطلب إقرار الموظف بالاطلاع</label></>}
      <Button disabled={busyId === "publish"} onClick={() => void publish()}>{busyId === "publish" ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} نشر المستند</Button>
    </CardContent></Card> : null}
    {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}
    {report ? <Card><CardContent className="p-5"><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setReport(null)}><X className="size-4" /> إغلاق التقرير</Button></div><ReportPanel report={report} schoolNames={schoolNames} /></CardContent></Card> : null}
    {loading ? <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ تحميل المستندات...</CardContent></Card> : resources.length === 0 ? <Card className="border-dashed"><CardContent className="p-8 text-center"><FileText className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">لا توجد مستندات منشورة</p></CardContent></Card> : <section className="space-y-3">{resources.map((resource) => { const isTeachingResource = resource.kind !== "JOB_TASKS"; return <Card key={resource.id}><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{resource.title}</h2><Badge variant={resource.status === "PUBLISHED" ? "secondary" : "outline"}>{resource.status === "PUBLISHED" ? "منشور" : "مؤرشف"}</Badge><Badge variant="outline">{RESOURCE_TYPE_LABELS[resource.kind]}</Badge>{resource.requiresAcknowledgement ? <Badge variant="outline">يتطلب إقراراً</Badge> : null}</div><p className="mt-2 text-sm text-muted-foreground">{resource.description || "بدون وصف"}</p><p className="mt-2 text-xs text-muted-foreground">{resource.file.originalName} · نُشر {formatDate(resource.publishedAt)} · {resource.audience.targetRoleKeys.map(getArabicRoleLabel).join("، ")}</p></div><div className="flex flex-wrap gap-2">{!isTeachingResource && resource.requiresAcknowledgement ? <Button variant="outline" disabled={busyId === `report-${resource.id}`} onClick={() => void loadReport(resource)}><BarChart3 className="size-4" /> تقرير الإقرارات</Button> : null}{resource.status === "PUBLISHED" ? <Button variant="outline" disabled={busyId === `archive-${resource.id}`} onClick={() => void archive(resource)}><Archive className="size-4" /> أرشفة</Button> : null}</div></CardContent></Card>; })}</section>}
  </div>;
}
