"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  loadStaffWorkDocumentationRecord,
  type StaffWorkDocumentationReadOnlyRecord,
} from "@/lib/staff-work";
import { WORK_DOCUMENTATION_TEMPLATES } from "@/lib/work-documentation";

function displayValue(value: string | number | undefined, type?: string) {
  if (value === undefined || value === "") return "غير مسجل";
  if (typeof value === "number") return value.toLocaleString("ar-SA");
  if (type === "date") {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime()))
      return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(parsed);
  }
  return value;
}

function errorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "functions/not-found") return "تعذر العثور على سجل التوثيق.";
  if (code === "functions/permission-denied")
    return "لا تملك صلاحية عرض محتوى هذا السجل.";
  return "تعذر تحميل سجل التوثيق.";
}

export function WorkDocumentationReadOnly({
  orgId,
  staffPersonId,
  sourceEntityId,
}: {
  orgId: string;
  staffPersonId: string;
  sourceEntityId: string;
}) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<StaffWorkDocumentationReadOnlyRecord | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    if (opened) {
      setOpened(false);
      return;
    }
    setOpened(true);
    if (record) return;
    setLoading(true);
    setError("");
    try {
      setRecord(
        await loadStaffWorkDocumentationRecord({
          orgId,
          staffPersonId,
          sourceEntityId,
        }),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }

  const template = record
    ? WORK_DOCUMENTATION_TEMPLATES.find((item) => item.key === record.templateKey)
    : null;
  const values = new Map((record?.values ?? []).map((item) => [item.key, item]));

  return (
    <div className="mt-4 border-t pt-4">
      <Button type="button" variant="outline" size="sm" onClick={() => void toggle()}>
        {opened ? "إغلاق السجل" : "عرض السجل"}
      </Button>

      {opened && loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ تحميل السجل...
        </p>
      ) : null}
      {opened && error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {opened && record?.isSecret ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-foreground">
          هذا النموذج سري، ولا يمكن عرض محتواه من صفحة المتابعة.
        </p>
      ) : null}
      {opened && record?.canViewRecord && !template ? (
        <p className="mt-3 text-sm text-muted-foreground">تعذر العثور على بنية نموذج التوثيق.</p>
      ) : null}
      {opened && record?.canViewRecord && template ? (
        <div className="mt-4 space-y-4">
          {template.sections.map((section) => (
            <section key={section.title} className="rounded-xl border bg-card p-4">
              <h4 className="font-semibold">{section.title}</h4>
              <div className="mt-4 space-y-4">
                {section.fields.map((field) => {
                  const value = values.get(field.key);
                  if (field.type !== "table") {
                    return (
                      <div key={field.key} className="rounded-lg bg-muted/40 p-3 text-sm">
                        <p className="text-xs text-muted-foreground">{field.label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground">
                          {value?.kind === "SCALAR" ? displayValue(value.value, field.type) : "غير مسجل"}
                        </p>
                      </div>
                    );
                  }
                  const rows = value?.kind === "TABLE" ? value.rows : [];
                  const columns = field.columns ?? [];
                  const cell = (row: Array<{ key: string; value: string | number }>, key: string) =>
                    row.find((item) => item.key === key)?.value;
                  return (
                    <div key={field.key} className="space-y-2">
                      <p className="text-sm font-medium">{field.label}</p>
                      {rows.length ? (
                        <div className="overflow-x-auto rounded-xl border">
                          <table className="w-full min-w-max text-right text-sm">
                            <thead className="bg-muted/50"><tr>{columns.map((column) => <th key={column.key} className="px-3 py-2 font-medium">{column.label}</th>)}</tr></thead>
                            <tbody>{rows.map((row, index) => <tr key={index} className="border-t">{columns.map((column) => <td key={column.key} className="px-3 py-2 align-top whitespace-pre-wrap">{displayValue(cell(row, column.key), column.type)}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      ) : <p className="text-sm text-muted-foreground">غير مسجل</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
