"use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";
import type { GuardianPayment } from "@takween/contracts";
import {
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { reverseGuardianPayment } from "@/lib/guardian-finance";

type ReverseGuardianPaymentDialogProps = {
  payment?: GuardianPayment;

  onOpenChange: (open: boolean) => void;
  onReversed: () => Promise<void> | void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatMoney(
  amountMinor: number,
  currency: string,
): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function ReverseGuardianPaymentDialog({
  payment,
  onOpenChange,
  onReversed,
}: ReverseGuardianPaymentDialogProps) {
  const { actor } = useStaffActor();

  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!payment) return;

    setReason("");
    setError("");
  }, [payment]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!payment) return;

    const normalizedReason = reason.trim();

    if (normalizedReason.length < 3) {
      setError("اكتب سبب عكس الدفعة.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await reverseGuardianPayment({
        orgId: actor.orgId,
        paymentId: payment.id,
        reversalReason: normalizedReason,
      });

      onOpenChange(false);
      await onReversed();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-destructive" />
              عكس الدفعة
            </CardTitle>

            <p className="mt-1 text-sm text-muted-foreground">
              ستتم إعادة المبلغ إلى المستحقات وإلغاء الإيصال.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </Button>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                رقم الإيصال
              </p>

              <p className="mt-1 font-semibold">
                {payment.receiptNumber}
              </p>

              <p className="mt-3 text-sm text-muted-foreground">
                قيمة الدفعة
              </p>

              <p className="mt-1 text-xl font-bold">
                {formatMoney(
                  payment.amountMinor,
                  payment.currency,
                )}
              </p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">
                سبب العكس
              </label>

              <textarea
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value)
                }
                placeholder="مثال: تم تسجيل الدفعة على ولي أمر غير صحيح..."
                rows={4}
                disabled={saving}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              لا يتم حذف الدفعة. ستظل محفوظة بحالة
              معكوسة لأغراض المراجعة المالية.
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>

              <Button
                type="submit"
                variant="destructive"
                disabled={saving || reason.trim().length < 3}
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}

                تأكيد عكس الدفعة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}