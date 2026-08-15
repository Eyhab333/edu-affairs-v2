"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Plus, Save } from "lucide-react";

import { WorkDocumentationForm } from "@/components/work-documentation/work-documentation-form";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getInitialWorkDocumentationData,
  getWorkDocumentationInstanceMode,
  getWorkDocumentationRole,
  getWorkDocumentationTemplate,
  listWorkDocumentationRecords,
  loadWorkDocumentationContext,
  loadWorkDocumentationRecord,
  normalizeWorkDocumentationData,
  resolveWorkDocumentationSchoolId,
  saveWorkDocumentationRecord,
  type WorkDocumentationContext,
  type WorkDocumentationData,
  type WorkDocumentationRecord,
} from "@/lib/work-documentation";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع.";
}

function createInstanceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `wd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUpdatedAt(value: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default function WorkDocumentationFormPage() {
  const { actor } = useStaffActor();
  const params = useParams<{ templateKey: string }>();
  const searchParams = useSearchParams();
  const templateKey = params.templateKey;
  const roleKey = getWorkDocumentationRole(actor.roles);
  const template = roleKey
    ? getWorkDocumentationTemplate(roleKey, templateKey)
    : undefined;
  const instanceMode = template
    ? getWorkDocumentationInstanceMode(template)
    : "SINGLE";
  const schoolIds = useMemo(() => actor.schools.map((school) => school.id), [actor.schools]);
  const scopedSchoolId = actor.memberships.find(
    (membership) => membership.scopeType === "SCHOOL",
  )?.scopeId;
  const schoolId = resolveWorkDocumentationSchoolId({
    schoolIds,
    scopedSchoolId,
    requestedSchoolId: searchParams.get("schoolId"),
  });
  const requestedInstanceId = searchParams.get("instanceId");
  const isLegacyRecord = searchParams.get("legacy") === "1";
  const isMultipleList =
    instanceMode === "MULTIPLE" &&
    !requestedInstanceId &&
    !isLegacyRecord &&
    searchParams.get("new") !== "1";
  const isNewMultiple =
    instanceMode === "MULTIPLE" &&
    !isLegacyRecord &&
    searchParams.get("new") === "1";
  const [newInstanceId] = useState(createInstanceId);
  const instanceId =
    instanceMode === "MULTIPLE" && !isLegacyRecord
      ? (requestedInstanceId ?? newInstanceId)
      : undefined;
  const [context, setContext] = useState<WorkDocumentationContext | null>(null);
  const [data, setData] = useState<WorkDocumentationData | null>(null);
  const [multipleRecords, setMultipleRecords] = useState<
    WorkDocumentationRecord[]
  >([]);
  const [createdAt, setCreatedAt] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setSuccess("");
      setContext(null);
      setData(null);
      setMultipleRecords([]);
      setCreatedAt(undefined);

      if (!template || !roleKey || !actor.personId || !schoolId) {
        if (active) setLoading(false);
        return;
      }

      try {
        const classInSchool = actor.classes.find(
          (classItem) => classItem.schoolId === schoolId,
        );
        const academicYearId = classInSchool?.academicYearId ?? "";
        const currentTerm = academicYearId
          ? actor.currentTermsByAcademicYear[academicYearId] ?? actor.currentTerm
          : actor.currentTerm;
        const nextContext = await loadWorkDocumentationContext({
          orgId: actor.orgId,
          schoolId,
          academicYearId,
          academicYearTitle: academicYearId,
          termId: currentTerm?.id ?? "",
          termTitle: currentTerm?.title ?? currentTerm?.shortTitle ?? "",
        });

        if (!active) return;
        setContext(nextContext);

        if (!nextContext) return;

        if (isMultipleList) {
          const records = await listWorkDocumentationRecords({
            orgId: actor.orgId,
            personId: actor.personId,
            roleKey,
            schoolId: nextContext.schoolId,
            academicYearId: nextContext.academicYearId,
            termId: nextContext.termId,
            templateKey: template.key,
          });

          if (active) setMultipleRecords(records);
          return;
        }

        if (isNewMultiple) {
          setData(getInitialWorkDocumentationData(template));
          return;
        }

        const record =
          instanceMode === "SINGLE"
            ? (
                await listWorkDocumentationRecords({
                  orgId: actor.orgId,
                  personId: actor.personId,
                  roleKey,
                  schoolId: nextContext.schoolId,
                  academicYearId: nextContext.academicYearId,
                  termId: nextContext.termId,
                  templateKey: template.key,
                })
              )[0]
            : await loadWorkDocumentationRecord({
                orgId: actor.orgId,
                personId: actor.personId,
                schoolId: nextContext.schoolId,
                academicYearId: nextContext.academicYearId,
                termId: nextContext.termId,
                templateKey: template.key,
                instanceId,
              });

        if (!active) return;
        setData(getInitialWorkDocumentationData(template, record?.data));
        setCreatedAt(record?.createdAt || undefined);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    actor.classes,
    actor.currentTerm,
    actor.currentTermsByAcademicYear,
    actor.orgId,
    actor.personId,
    instanceId,
    isNewMultiple,
    isMultipleList,
    roleKey,
    schoolId,
    template,
  ]);

  const selectedSchool = actor.schools.find((school) => school.id === schoolId);
  const backHref = `/staff/work-documentation${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!template || !roleKey || !context || !data || !actor.personId) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const saved = await saveWorkDocumentationRecord({
        orgId: actor.orgId,
        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        termId: context.termId,
        personId: actor.personId,
        roleKey,
        template,
        data: normalizeWorkDocumentationData(template, data),
        createdAt,
        instanceId,
        instanceMode: isLegacyRecord ? "SINGLE" : instanceMode,
      });
      setCreatedAt(saved.createdAt);
      setSuccess("تم حفظ التوثيق بنجاح.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!template) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          هذا النموذج غير متاح لدورك الحالي.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">توثيق العمل</Badge>
            {template.isSecret ? <Badge variant="outline">سري</Badge> : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold">{template.title}</h1>
        </div>

        <Button asChild type="button" variant="outline">
          <Link href={backHref}>
            <ArrowRight className="size-4" />
            رجوع للنماذج
          </Link>
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {success ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 text-sm text-primary">{success}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل النموذج...
          </CardContent>
        </Card>
      ) : !actor.personId ? (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            تعذر تحديد ملف الموظف الحالي، لذلك لا يمكن حفظ النموذج.
          </CardContent>
        </Card>
      ) : !context ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            لم يتم العثور على سنة دراسية وفصل دراسي نشطين للمدرسة المختارة.
          </CardContent>
        </Card>
      ) : isMultipleList ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>التوثيقات السابقة</CardTitle>
              <Button asChild>
                <Link
                  href={`/staff/work-documentation/${template.key}?schoolId=${encodeURIComponent(schoolId)}&new=1`}
                >
                  <Plus className="size-4" />
                  توثيق جديد
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!multipleRecords.length ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                لم يبدأ أي توثيق لهذا النموذج بعد.
              </p>
            ) : (
              multipleRecords.map((record) => {
                const recordHref =
                  record.instanceMode === "MULTIPLE" && record.instanceId
                    ? `/staff/work-documentation/${template.key}?schoolId=${encodeURIComponent(schoolId)}&instanceId=${encodeURIComponent(record.instanceId)}`
                    : `/staff/work-documentation/${template.key}?schoolId=${encodeURIComponent(schoolId)}&legacy=1`;

                return (
                  <div
                    key={record.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {record.templateTitle || template.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        آخر تعديل: {formatUpdatedAt(record.updatedAt)}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={recordHref}>فتح وتعديل</Link>
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : data ? (
        <form onSubmit={handleSave} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>سياق الحفظ</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">المدرسة</p>
                <p className="mt-1 font-medium">{selectedSchool?.name || schoolId}</p>
              </div>
              <div>
                <p className="text-muted-foreground">السنة الدراسية</p>
                <p className="mt-1 font-medium">{context.academicYearTitle}</p>
              </div>
              <div>
                <p className="text-muted-foreground">الفصل الدراسي</p>
                <p className="mt-1 font-medium">{context.termTitle}</p>
              </div>
            </CardContent>
          </Card>

          <WorkDocumentationForm template={template} value={data} onChange={setData} />

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
