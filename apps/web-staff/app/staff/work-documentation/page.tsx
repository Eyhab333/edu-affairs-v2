"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilePenLine, Loader2, RefreshCw } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getWorkDocumentationInstanceMode,
  getWorkDocumentationRole,
  getWorkDocumentationSchoolIds,
  getWorkDocumentationTemplates,
  listWorkDocumentationRecords,
  loadWorkDocumentationContext,
  resolveWorkDocumentationSchoolId,
  type WorkDocumentationContext,
  type WorkDocumentationRecord,
} from "@/lib/work-documentation";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع.";
}

export default function WorkDocumentationPage() {
  const { actor } = useStaffActor();
  const searchParams = useSearchParams();
  const roleKey = getWorkDocumentationRole(actor.roles);
  const schoolIds = useMemo(
    () => getWorkDocumentationSchoolIds(roleKey, actor.schools),
    [actor.schools, roleKey],
  );
  const scopedSchoolId = actor.memberships.find(
    (membership) => membership.scopeType === "SCHOOL",
  )?.scopeId;
  const [schoolId, setSchoolId] = useState(() =>
    resolveWorkDocumentationSchoolId({
      schoolIds,
      scopedSchoolId,
      requestedSchoolId: searchParams.get("schoolId"),
    }),
  );
  const templates = useMemo(
    () => (roleKey ? getWorkDocumentationTemplates(roleKey) : []),
    [roleKey],
  );
  const availableSchools = useMemo(
    () => actor.schools.filter((school) => schoolIds.includes(school.id)),
    [actor.schools, schoolIds],
  );
  const [context, setContext] = useState<WorkDocumentationContext | null>(null);
  const [records, setRecords] = useState<Record<string, WorkDocumentationRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!schoolIds.includes(schoolId)) {
      setSchoolId(
        resolveWorkDocumentationSchoolId({
          schoolIds,
          scopedSchoolId,
          requestedSchoolId: searchParams.get("schoolId"),
        }),
      );
    }
  }, [schoolId, schoolIds, scopedSchoolId, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setContext(null);
    setRecords({});

    if (!roleKey || !actor.personId || !schoolId) {
      setLoading(false);
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
      setContext(nextContext);

      if (!nextContext) return;

      const savedRecords = await listWorkDocumentationRecords({
        orgId: actor.orgId,
        personId: actor.personId,
        roleKey,
        schoolId: nextContext.schoolId,
        academicYearId: nextContext.academicYearId,
        termId: nextContext.termId,
      });

      const nextRecords: Record<string, WorkDocumentationRecord[]> = {};
      const templateKeys = new Set(templates.map((item) => item.key));
      savedRecords.forEach((record) => {
        if (!templateKeys.has(record.templateKey)) return;
        nextRecords[record.templateKey] = [
          ...(nextRecords[record.templateKey] ?? []),
          record,
        ];
      });
      setRecords(nextRecords);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [
    actor.classes,
    actor.currentTerm,
    actor.currentTermsByAcademicYear,
    actor.orgId,
    actor.personId,
    roleKey,
    schoolId,
    templates,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSchool = actor.schools.find((school) => school.id === schoolId);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">توثيق العمل</Badge>
              {roleKey ? <Badge variant="outline">{roleKey}</Badge> : null}
            </div>
            <h1 className="text-2xl font-bold">توثيق العمل</h1>
            <p className="text-sm text-muted-foreground">
              احفظ نماذج عملك للفصل الدراسي الحالي وعدّلها عند الحاجة.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            تحديث
          </Button>
        </CardContent>
      </Card>

      {availableSchools.length > 1 ? (
        <Card>
          <CardContent className="grid gap-2 p-5 md:max-w-md">
            <label htmlFor="work-documentation-school" className="text-sm font-medium">
              المدرسة
            </label>
            <select
              id="work-documentation-school"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {availableSchools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name || school.id}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!roleKey ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            لا توجد نماذج توثيق عمل مرتبطة بدورك الحالي.
          </CardContent>
        </Card>
      ) : !actor.personId ? (
        <Card>
          <CardContent className="p-5 text-sm text-destructive">
            تعذر تحديد ملف الموظف الحالي، لذلك لا يمكن حفظ التوثيق.
          </CardContent>
        </Card>
      ) : !schoolId ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            لا توجد مدرسة متاحة ضمن نطاقك.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تجهيز النماذج...
          </CardContent>
        </Card>
      ) : !context ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            لم يتم العثور على سنة دراسية وفصل دراسي نشطين للمدرسة المختارة.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">المدرسة</p>
                <p className="mt-1 font-semibold">{selectedSchool?.name || schoolId}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">السنة الدراسية الحالية</p>
                <p className="mt-1 font-semibold">{context.academicYearTitle}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">الفصل الدراسي الحالي</p>
                <p className="mt-1 font-semibold">{context.termTitle}</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((item) => {
              const templateRecords = records[item.key] ?? [];
              const isMultiple =
                getWorkDocumentationInstanceMode(item) === "MULTIPLE";
              const record = templateRecords[0];
              const href = `/staff/work-documentation/${item.key}?schoolId=${encodeURIComponent(schoolId)}`;

              return (
                <Card key={item.key} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <FilePenLine className="size-5 shrink-0 text-primary" />
                      <Badge variant={templateRecords.length ? "secondary" : "outline"}>
                        {isMultiple
                          ? templateRecords.length
                            ? `${templateRecords.length} توثيقات`
                            : "لم يبدأ"
                          : record
                            ? "محفوظ"
                            : "لم يبدأ"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3 leading-6">{item.title}</CardTitle>
                    {item.isSecret ? (
                      <CardDescription>نموذج سري متاح لصاحب الدور فقط.</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button asChild className="w-full">
                      <Link href={href}>
                        {isMultiple
                          ? "عرض التوثيقات"
                          : record
                            ? "فتح وتعديل"
                            : "فتح النموذج"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
