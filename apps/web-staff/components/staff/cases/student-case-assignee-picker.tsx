"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getStudentCaseReferralOptions,
  type StudentCaseReferralRecipient,
} from "@/lib/student-cases";

type StudentCaseAssigneePickerProps = {
  orgId: string;
  schoolId: string;
  value: StudentCaseReferralRecipient | null;
  onValueChange: (value: StudentCaseReferralRecipient | null) => void;
  excludePersonIds?: string[];
  preferredRoleKey?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ar");
}

export function StudentCaseAssigneePicker({
  orgId,
  schoolId,
  value,
  onValueChange,
  excludePersonIds = [],
  preferredRoleKey,
  disabled = false,
  placeholder = "اختر الموظف المحال إليه",
  className,
}: StudentCaseAssigneePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recipients, setRecipients] = useState<
    StudentCaseReferralRecipient[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSchoolId = useRef(schoolId);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    if (previousSchoolId.current && previousSchoolId.current !== schoolId) {
      onValueChangeRef.current(null);
    }

    previousSchoolId.current = schoolId;
    setIsOpen(false);
    setQuery("");
    setRecipients(null);
    setError(null);
  }, [schoolId]);

  const filteredRecipients = useMemo(() => {
    const excluded = new Set(excludePersonIds.filter(Boolean));
    const search = normalizeSearch(query);

    return (recipients ?? []).filter((recipient) => {
      if (excluded.has(recipient.personId)) return false;
      if (!search) return true;

      return normalizeSearch(
        `${recipient.displayName} ${recipient.roleLabel} ${recipient.roleKey}`,
      ).includes(search);
    });
  }, [excludePersonIds, query, recipients]);

  async function loadRecipients() {
    if (!orgId || !schoolId || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getStudentCaseReferralOptions({ orgId, schoolId });
      setRecipients(result);

      if (!value && preferredRoleKey) {
        const preferredRecipient = result.find(
          (recipient) => recipient.roleKey === preferredRoleKey,
        );
        if (preferredRecipient) onValueChange(preferredRecipient);
      }
    } catch (cause) {
      setRecipients([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تحميل الموظفين المخولين باستلام القضايا.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (disabled || !schoolId) return;

    const nextIsOpen = !isOpen;
    setIsOpen(nextIsOpen);
    if (nextIsOpen && recipients === null) {
      await loadRecipients();
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleToggle()}
        disabled={disabled || !schoolId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="h-11 w-full justify-between px-3 text-right font-normal"
      >
        <span className="min-w-0 truncate">
          {value ? `${value.displayName} — ${value.roleLabel}` : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      {isOpen ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو الدور..."
              className="h-10 w-full rounded-xl border border-input bg-background pr-9 pl-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto" role="listbox">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تحميل الموظفين...
              </div>
            ) : error ? (
              <div className="space-y-3 px-3 py-4 text-sm text-destructive">
                <p>{error}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadRecipients()}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : filteredRecipients.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {recipients?.length
                  ? "لا توجد نتائج مطابقة للبحث."
                  : "لا يوجد موظفون مخولون لاستلام القضايا في هذه المدرسة."}
              </div>
            ) : (
              filteredRecipients.map((recipient) => {
                const isSelected = value?.id === recipient.id;

                return (
                  <button
                    key={recipient.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onValueChange(recipient);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm transition hover:bg-accent"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {recipient.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {recipient.roleLabel}
                      </span>
                    </span>
                    {isSelected ? <Check className="size-4 text-primary" /> : null}
                  </button>
                );
              })
            )}
          </div>

          {value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onValueChange(null)}
              className="mt-2 w-full"
            >
              مسح الاختيار
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
