"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Banknote, LoaderCircle, ReceiptText, X } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createGuardianPaymentDraft,
  postGuardianPayment,
  type GuardianFinancePaymentMethod,
  type GuardianFinanceWorkspace,
  type PostGuardianPaymentAllocationInput,
} from "@/lib/guardian-finance";

type RecordGuardianPaymentDialogProps = {
  open: boolean;
  workspace: GuardianFinanceWorkspace;

  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

type PaymentTarget = {
  key: string;

  studentId: string;
  studentDisplayName: string;

  chargeId: string;
  installmentId?: string;

  title: string;
  currency: string;

  balanceAmountMinor: number;
  dueAt?: number;

  schoolId: string;
  academicYearId: string;
  termId?: string;
};

type PaymentDistributionRow = {
  target: PaymentTarget;
  amountMinor: number;
};

const PAYMENT_METHOD_LABELS: Record<GuardianFinancePaymentMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CARD: "شبكة / بطاقة",
  CHEQUE: "شيك",
  ONLINE: "دفع إلكتروني",
  OTHER: "أخرى",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value?: number): string {
  if (!value) return "بدون تاريخ";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function readNumber(
  data: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function buildPaymentTargets(
  workspace: GuardianFinanceWorkspace,
): PaymentTarget[] {
  const installmentRowsByChargeId = new Map<
    string,
    Array<Record<string, unknown>>
  >();

  for (const installment of workspace.installments) {
    const row = asRecord(installment);
    const chargeId = readString(row, ["chargeId"]);

    if (!chargeId) continue;

    const current = installmentRowsByChargeId.get(chargeId) ?? [];

    current.push(row);
    installmentRowsByChargeId.set(chargeId, current);
  }

  const targets: PaymentTarget[] = [];

  for (const charge of workspace.charges) {
    if (!["ACTIVE", "PARTIALLY_PAID", "OVERDUE"].includes(charge.status)) {
      continue;
    }

    const chargeBalance = Math.max(
      charge.netAmountMinor - charge.paidAmountMinor,
      0,
    );

    if (chargeBalance <= 0) continue;

    const installmentRows = installmentRowsByChargeId.get(charge.id) ?? [];

    const payableInstallments = installmentRows
      .map((installment): PaymentTarget | null => {
        const status = readString(installment, ["status"]);

        if (["PAID", "CANCELLED", "WAIVED"].includes(status)) {
          return null;
        }

        const amountMinor =
          readNumber(installment, ["amountMinor", "netAmountMinor"]) ?? 0;

        const paidAmountMinor =
          readNumber(installment, ["paidAmountMinor"]) ?? 0;

        const storedBalance = readNumber(installment, [
          "balanceAmountMinor",
          "remainingAmountMinor",
        ]);

        const balanceAmountMinor =
          storedBalance ?? Math.max(amountMinor - paidAmountMinor, 0);

        const installmentId = readString(installment, ["id"]);

        if (!installmentId || balanceAmountMinor <= 0) {
          return null;
        }

        const dueAt = readNumber(installment, ["dueAt"]);

        const target: PaymentTarget = {
          key: `installment-${installmentId}`,

          studentId: charge.studentId,
          studentDisplayName: charge.studentDisplayName || charge.studentId,

          chargeId: charge.id,
          installmentId,

          title: `${charge.title} — قسط`,
          currency: charge.currency,

          balanceAmountMinor,

          schoolId: charge.schoolId,
          academicYearId: charge.academicYearId,
        };

        if (dueAt !== undefined) {
          target.dueAt = dueAt;
        }

        if (charge.termId !== undefined) {
          target.termId = charge.termId;
        }

        return target;
      })
      .filter((target): target is PaymentTarget => target !== null);

    if (payableInstallments.length > 0) {
      targets.push(...payableInstallments);
      continue;
    }

    targets.push({
      key: `charge-${charge.id}`,

      studentId: charge.studentId,
      studentDisplayName: charge.studentDisplayName || charge.studentId,

      chargeId: charge.id,

      title: charge.title,
      currency: charge.currency,

      balanceAmountMinor: chargeBalance,
      dueAt: charge.dueAt,

      schoolId: charge.schoolId,
      academicYearId: charge.academicYearId,
      termId: charge.termId,
    });
  }

  return targets.sort((a, b) => {
    const dateDifference =
      (a.dueAt ?? Number.MAX_SAFE_INTEGER) -
      (b.dueAt ?? Number.MAX_SAFE_INTEGER);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.title.localeCompare(b.title, "ar");
  });
}

function buildDistribution(
  targets: PaymentTarget[],
  amountMinor: number,
): PaymentDistributionRow[] {
  let remainingAmountMinor = amountMinor;
  const rows: PaymentDistributionRow[] = [];

  for (const target of targets) {
    if (remainingAmountMinor <= 0) break;

    const allocatedAmountMinor = Math.min(
      target.balanceAmountMinor,
      remainingAmountMinor,
    );

    if (allocatedAmountMinor <= 0) continue;

    rows.push({
      target,
      amountMinor: allocatedAmountMinor,
    });

    remainingAmountMinor -= allocatedAmountMinor;
  }

  return rows;
}

function currentDateInputValue(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function RecordGuardianPaymentDialog({
  open,
  workspace,
  onOpenChange,
  onCreated,
}: RecordGuardianPaymentDialogProps) {
  const { actor } = useStaffActor();

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<GuardianFinancePaymentMethod>("CASH");

  const [paidDate, setPaidDate] = useState(currentDateInputValue());

  const [currency, setCurrency] = useState("SAR");

  const [referenceNumber, setReferenceNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targets = useMemo(() => buildPaymentTargets(workspace), [workspace]);

  const currencies = useMemo(
    () => uniqueStrings(targets.map((target) => target.currency)),
    [targets],
  );

  useEffect(() => {
    if (!open) return;

    setAmount("");
    setPaymentMethod("CASH");
    setPaidDate(currentDateInputValue());

    setCurrency(currencies[0] ?? "SAR");

    setReferenceNumber("");
    setBankName("");
    setTransferDate("");
    setChequeNumber("");
    setCardLast4("");
    setNote("");

    setError("");
  }, [currencies, open]);

  const currencyTargets = useMemo(
    () => targets.filter((target) => target.currency === currency),
    [currency, targets],
  );

  const totalOutstandingAmountMinor = useMemo(
    () =>
      currencyTargets.reduce(
        (total, target) => total + target.balanceAmountMinor,
        0,
      ),
    [currencyTargets],
  );

  const enteredAmountMinor = useMemo(() => {
    const normalizedAmount = amount.trim().replace(",", ".");

    if (!normalizedAmount) return 0;

    const parsedAmount = Number(normalizedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return 0;
    }

    return Math.round(parsedAmount * 100);
  }, [amount]);

  const distribution = useMemo(
    () => buildDistribution(currencyTargets, enteredAmountMinor),
    [currencyTargets, enteredAmountMinor],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (currencyTargets.length === 0) {
      setError("لا توجد مستحقات قابلة للسداد.");
      return;
    }

    if (enteredAmountMinor <= 0) {
      setError("أدخل قيمة دفعة صحيحة.");
      return;
    }

    if (enteredAmountMinor > totalOutstandingAmountMinor) {
      setError("قيمة الدفعة أكبر من إجمالي المبلغ المتبقي.");
      return;
    }

    if (paymentMethod === "BANK_TRANSFER" && !referenceNumber.trim()) {
      setError("رقم المرجع مطلوب للتحويل البنكي.");
      return;
    }

    if (paymentMethod === "CHEQUE" && !chequeNumber.trim()) {
      setError("رقم الشيك مطلوب.");
      return;
    }

    if (cardLast4.trim() && !/^\d{4}$/.test(cardLast4.trim())) {
      setError("آخر أربعة أرقام يجب أن تكون أربعة أرقام.");
      return;
    }

    const allocations: PostGuardianPaymentAllocationInput[] = distribution.map(
      (row) => ({
        studentId: row.target.studentId,
        chargeId: row.target.chargeId,
        installmentId: row.target.installmentId,
        amountMinor: row.amountMinor,
      }),
    );

    const allocatedAmountMinor = allocations.reduce(
      (total, allocation) => total + allocation.amountMinor,
      0,
    );

    if (allocatedAmountMinor !== enteredAmountMinor) {
      setError("تعذر توزيع قيمة الدفعة بالكامل.");
      return;
    }

    const schoolIds = uniqueStrings(
      distribution.map((row) => row.target.schoolId),
    );

    const academicYearIds = uniqueStrings(
      distribution.map((row) => row.target.academicYearId),
    );

    const termIds = uniqueStrings(distribution.map((row) => row.target.termId));

    setSaving(true);
    setError("");

    let draftReceiptNumber = "";

    try {
      const draft = await createGuardianPaymentDraft({
        orgId: actor.orgId,
        guardianId: workspace.guardian.id,

        amountMinor: enteredAmountMinor,
        paymentMethod,

        paidAt: new Date(`${paidDate}T12:00:00`).getTime(),

        schoolIds,
        academicYearIds,
        termIds,

        referenceNumber: referenceNumber.trim() || undefined,

        bankName: bankName.trim() || undefined,

        transferDate: transferDate
          ? new Date(`${transferDate}T12:00:00`).getTime()
          : undefined,

        chequeNumber: chequeNumber.trim() || undefined,

        cardLast4: cardLast4.trim() || undefined,

        note: note.trim() || undefined,
      });

      draftReceiptNumber = draft.receiptNumber;

      await postGuardianPayment({
        orgId: actor.orgId,
        paymentId: draft.paymentId,
        allocations,
      });

      onOpenChange(false);
      await onCreated();
    } catch (error) {
      const message = getErrorMessage(error);

      setError(
        draftReceiptNumber
          ? `تم إنشاء المسودة ${draftReceiptNumber} لكن تعذر اعتمادها: ${message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" />
              تسجيل دفعة
            </CardTitle>

            <p className="mt-1 text-sm text-muted-foreground">
              سيتم توزيع الدفعة تلقائيًا على أقدم المستحقات أولًا.
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
          {currencyTargets.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              لا توجد مستحقات أو أقساط قابلة للسداد.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">ولي الأمر</p>

                <p className="mt-1 font-semibold">
                  {workspace.guardian.displayName}
                </p>

                <p className="mt-3 text-sm text-muted-foreground">
                  إجمالي المتبقي
                </p>

                <p className="mt-1 text-xl font-bold">
                  {formatMoney(totalOutstandingAmountMinor, currency)}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">قيمة الدفعة</label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={saving}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">العملة</label>

                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    disabled={saving || currencies.length <= 1}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {currencies.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">تاريخ الدفع</label>

                  <input
                    type="date"
                    value={paidDate}
                    onChange={(event) => setPaidDate(event.target.value)}
                    disabled={saving}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">طريقة الدفع</label>

                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(
                      event.target.value as GuardianFinancePaymentMethod,
                    )
                  }
                  disabled={saving}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {paymentMethod === "BANK_TRANSFER" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">رقم المرجع</label>

                    <input
                      value={referenceNumber}
                      onChange={(event) =>
                        setReferenceNumber(event.target.value)
                      }
                      disabled={saving}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">البنك</label>

                    <input
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      disabled={saving}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">تاريخ التحويل</label>

                    <input
                      type="date"
                      value={transferDate}
                      onChange={(event) => setTransferDate(event.target.value)}
                      disabled={saving}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {paymentMethod === "CHEQUE" ? (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">رقم الشيك</label>

                  <input
                    value={chequeNumber}
                    onChange={(event) => setChequeNumber(event.target.value)}
                    disabled={saving}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  />
                </div>
              ) : null}

              {paymentMethod === "CARD" ? (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">آخر أربعة أرقام</label>

                  <input
                    inputMode="numeric"
                    maxLength={4}
                    value={cardLast4}
                    onChange={(event) => setCardLast4(event.target.value)}
                    disabled={saving}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <label className="text-sm font-medium">ملاحظة</label>

                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={saving}
                  rows={3}
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {distribution.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold">توزيع الدفعة</h3>

                    <p className="text-sm text-muted-foreground">
                      معاينة التوزيع قبل الاعتماد.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    {distribution.map((row) => (
                      <div
                        key={row.target.key}
                        className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{row.target.title}</p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.target.studentDisplayName}
                            {" • "}
                            {formatDate(row.target.dueAt)}
                          </p>
                        </div>

                        <p className="shrink-0 font-semibold">
                          {formatMoney(row.amountMinor, currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

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
                  disabled={
                    saving ||
                    enteredAmountMinor <= 0 ||
                    distribution.length === 0
                  }
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Banknote className="size-4" />
                  )}
                  تسجيل واعتماد الدفعة
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
