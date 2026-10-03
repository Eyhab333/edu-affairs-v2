"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  endStudentEnrollment,
  endStudentEnrollmentErrorMessage,
} from "@/lib/student-management";
import type { ResolvedEnrollment } from "@/lib/student-read-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EndStudentEnrollmentDialogProps = {
  enrollment: ResolvedEnrollment;
  open: boolean;
  orgId: string;
  studentId: string;
  onOpenChange: (open: boolean) => void;
  onSucceeded: () => Promise<void> | void;
};

function createOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `student-end-enrollment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function EndStudentEnrollmentDialog({
  enrollment,
  open,
  orgId,
  studentId,
  onOpenChange,
  onSucceeded,
}: EndStudentEnrollmentDialogProps) {
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setReason("");
    setOperationId(createOperationId());
    setSaveError(null);
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setSaveError("أدخل سبب إنهاء القيد.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const currentOperationId = operationId ?? createOperationId();
      if (!operationId) setOperationId(currentOperationId);
      await endStudentEnrollment({
        orgId,
        studentId,
        academicYearId: enrollment.academicYearId,
        reason: normalizedReason,
        operationId: currentOperationId,
      });
      await onSucceeded();
      onOpenChange(false);
      toast.success("تم إنهاء قيد الطالب بنجاح.");
    } catch (error) {
      const message = endStudentEnrollmentErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const placement = [
    ["المدرسة", enrollment.labels.school],
    ["العام الدراسي", enrollment.labels.academicYear],
    ["المستوى", enrollment.labels.grade],
    ["الفصل", enrollment.labels.className],
  ].filter(([, value]) => value);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>إنهاء القيد</DialogTitle>
          <DialogDescription>
            ينهي هذا الإجراء القيد الحالي فقط ولا يحذف سجل الطالب أو تاريخه الدراسي.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            {placement.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-medium">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-enrollment-reason">سبب إنهاء القيد</Label>
            <Input
              id="end-enrollment-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
              maxLength={1000}
              required
            />
          </div>

          {saveError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تأكيد إنهاء القيد
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
