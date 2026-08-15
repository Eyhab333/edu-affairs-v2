"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createWorkDocumentationTableRow,
  type WorkDocumentationColumn,
  type WorkDocumentationData,
  type WorkDocumentationField,
  type WorkDocumentationTemplate,
} from "@/lib/work-documentation";

type WorkDocumentationFormProps = {
  template: WorkDocumentationTemplate;
  value: WorkDocumentationData;
  onChange: (value: WorkDocumentationData) => void;
};

const inputClassName =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: WorkDocumentationField;
  value: string | number;
  onChange: (value: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className={inputClassName}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      >
        <option value="">اختر</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="flex flex-wrap gap-3 pt-1">
        {(field.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={field.key}
              value={option}
              checked={value === option}
              onChange={(event) => onChange(event.target.value)}
              className="size-4"
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      type={field.type === "number" || field.type === "date" ? field.type : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClassName}
    />
  );
}

function TableCellInput({
  column,
  value,
  onChange,
}: {
  column: WorkDocumentationColumn;
  value: string | number;
  onChange: (value: string) => void;
}) {
  if (column.type === "select") {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
      >
        <option value="">اختر</option>
        {(column.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={column.type === "number" || column.type === "date" ? column.type : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
    />
  );
}

export function WorkDocumentationForm({
  template,
  value,
  onChange,
}: WorkDocumentationFormProps) {
  function updateField(key: string, nextValue: string | number) {
    onChange({ ...value, [key]: nextValue });
  }

  function updateTableRow(
    field: WorkDocumentationField,
    rowIndex: number,
    columnKey: string,
    nextValue: string,
  ) {
    const currentValue = value[field.key];
    const rows = Array.isArray(currentValue) ? [...currentValue] : [];
    rows[rowIndex] = { ...rows[rowIndex], [columnKey]: nextValue };
    onChange({ ...value, [field.key]: rows });
  }

  function addTableRow(field: WorkDocumentationField) {
    const currentValue = value[field.key];
    const rows = Array.isArray(currentValue) ? [...currentValue] : [];
    onChange({
      ...value,
      [field.key]: [...rows, createWorkDocumentationTableRow(field)],
    });
  }

  function removeTableRow(field: WorkDocumentationField, rowIndex: number) {
    const currentValue = value[field.key];
    const rows = Array.isArray(currentValue) ? [...currentValue] : [];
    onChange({
      ...value,
      [field.key]: rows.filter((_, index) => index !== rowIndex),
    });
  }

  return (
    <div className="space-y-5">
      {template.sections.map((itemSection) => (
        <Card key={itemSection.title}>
          <CardHeader>
            <CardTitle>{itemSection.title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            {itemSection.fields.map((field) => {
              if (field.type === "table") {
                const currentValue = value[field.key];
                const rows = Array.isArray(currentValue)
                  ? currentValue
                  : [];

                return (
                  <div key={field.key} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium">{field.label}</label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addTableRow(field)}
                      >
                        <Plus className="size-4" />
                        إضافة صف
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-max text-sm">
                        <thead className="bg-muted/50">
                          <tr className="text-right">
                            {(field.columns ?? []).map((column) => (
                              <th key={column.key} className="px-3 py-2 font-medium">
                                {column.label}
                              </th>
                            ))}
                            <th className="px-3 py-2 font-medium">إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-t border-border">
                              {(field.columns ?? []).map((column) => (
                                <td key={column.key} className="p-2 align-top">
                                  <TableCellInput
                                    column={column}
                                    value={row[column.key] ?? ""}
                                    onChange={(nextValue) =>
                                      updateTableRow(field, rowIndex, column.key, nextValue)
                                    }
                                  />
                                </td>
                              ))}
                              <td className="p-2 align-top">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="حذف الصف"
                                  onClick={() => removeTableRow(field, rowIndex)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {!rows.length ? (
                      <p className="text-sm text-muted-foreground">
                        أضف صفًا لبدء إدخال البيانات.
                      </p>
                    ) : null}
                  </div>
                );
              }

              return (
                <label key={field.key} className="grid gap-2">
                  <span className="text-sm font-medium">{field.label}</span>
                  <FieldInput
                    field={field}
                    value={(value[field.key] as string | number | undefined) ?? ""}
                    onChange={(nextValue) => updateField(field.key, nextValue)}
                  />
                </label>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
