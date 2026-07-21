"use client";

import { useState } from "react";
import {
  CreditCard,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { GuardianPayment, StudentFeeCharge } from "@takween/contracts";
import { AddStudentFeeChargeDialog } from "./add-student-fee-charge-dialog";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGuardianFinanceWorkspace,
  type GuardianFinanceSearchResult,
  type GuardianFinanceWorkspace as GuardianFinanceWorkspaceData,
} from "@/lib/guardian-finance";

import { FinanceSearch } from "./finance-search";
import { FinanceSummaryCards } from "./finance-summary-cards";

import { RecordGuardianPaymentDialog } from "./record-guardian-payment-dialog";

import { ReverseGuardianPaymentDialog } from "./reverse-guardian-payment-dialog";

const CHARGE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "مستحق",
  PARTIALLY_PAID: "مسدد جزئيًا",
  PAID: "مسدد",
  OVERDUE: "متأخر",
  CANCELLED: "ملغي",
  WAIVED: "معفى",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  POSTED: "معتمدة",
  VOIDED: "ملغاة",
  REVERSED: "معكوسة",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
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

function formatMoney(amountMinor: number, currency = "SAR"): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(value?: number): string {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ChargeRow({ charge }: { charge: StudentFeeCharge }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{charge.title}</h3>

            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {CHARGE_STATUS_LABELS[charge.status] ?? charge.status}
            </span>
          </div>

          {charge.description ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {charge.description}
            </p>
          ) : null}

          <p className="mt-2 text-xs text-muted-foreground">
            الطالب: {charge.studentDisplayName}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            تاريخ الاستحقاق: {formatDate(charge.dueAt)}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-4 text-sm md:text-left">
          <div>
            <p className="text-xs text-muted-foreground">المستحق</p>
            <p className="mt-1 font-semibold">
              {formatMoney(charge.netAmountMinor, charge.currency)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">المسدد</p>
            <p className="mt-1 font-semibold">
              {formatMoney(charge.paidAmountMinor, charge.currency)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className="mt-1 font-semibold text-primary">
              {formatMoney(
                Math.max(charge.netAmountMinor - charge.paidAmountMinor, 0),
                charge.currency,
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentRow({
  payment,
  onReverse,
}: {
  payment: GuardianPayment;
  onReverse: (payment: GuardianPayment) => void;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{payment.receiptNumber}</h3>

            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
            </span>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {PAYMENT_METHOD_LABELS[payment.paymentMethod] ??
              payment.paymentMethod}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(payment.paidAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-left">
            <p className="text-xs text-muted-foreground">قيمة الدفعة</p>

            <p className="mt-1 text-lg font-bold">
              {formatMoney(payment.amountMinor, payment.currency)}
            </p>
          </div>

          {payment.status === "POSTED" ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="عكس الدفعة"
              className="text-destructive hover:text-destructive"
              onClick={() => onReverse(payment)}
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GuardianFinanceWorkspace() {
  const { actor } = useStaffActor();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuardianFinanceSearchResult[]>([]);

  const [workspace, setWorkspace] = useState<GuardianFinanceWorkspaceData>();

  const [searching, setSearching] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [addChargeOpen, setAddChargeOpen] = useState(false);

  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);

  const [paymentToReverse, setPaymentToReverse] = useState<GuardianPayment>();

  async function handleSearch() {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) return;

    setSearching(true);
    setError("");
    setWorkspace(undefined);

    try {
      const response = await getGuardianFinanceWorkspace({
        orgId: actor.orgId,
        query: normalizedQuery,
        limit: 20,
      });

      setResults(response.searchResults);
      setHasSearched(true);
    } catch (error) {
      setResults([]);
      setHasSearched(true);
      setError(getErrorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(result: GuardianFinanceSearchResult) {
    setLoadingWorkspace(true);
    setError("");

    try {
      const response = await getGuardianFinanceWorkspace({
        orgId: actor.orgId,

        guardianId: result.kind === "GUARDIAN" ? result.id : undefined,

        studentId: result.kind === "STUDENT" ? result.id : undefined,
      });

      if (!response.workspace) {
        throw new Error("لم يتم العثور على الملف المالي المطلوب.");
      }

      setWorkspace(response.workspace);
      setResults([]);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function reloadCurrentWorkspace() {
    if (!workspace) return;

    setLoadingWorkspace(true);
    setError("");

    try {
      const response = await getGuardianFinanceWorkspace({
        orgId: actor.orgId,
        guardianId: workspace.guardian.id,
      });

      if (!response.workspace) {
        throw new Error("تعذر إعادة تحميل الملف المالي.");
      }

      setWorkspace(response.workspace);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function resetWorkspace() {
    setWorkspace(undefined);
    setResults([]);
    setHasSearched(false);
    setQuery("");
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <WalletCards className="size-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">الرسوم والمدفوعات</h1>

            <p className="text-sm text-muted-foreground">
              إدارة مستحقات الطلاب ودفعات أولياء الأمور.
            </p>
          </div>
        </div>

        {workspace ? (
          <Button type="button" variant="outline" onClick={resetWorkspace}>
            بحث جديد
          </Button>
        ) : null}
      </div>

      {!workspace ? (
        <FinanceSearch
          query={query}
          loading={searching}
          hasSearched={hasSearched}
          results={results}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          onSelect={handleSelect}
        />
      ) : null}

      {!workspace && !searching && results.length === 0 && !hasSearched ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UsersRound className="size-5" />
              </div>

              <h2 className="mt-4 font-semibold">ابحث عن الملف المالي</h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                ابحث باسم الطالب أو ولي الأمر أو السجل المدني أو رقم الجوال.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CreditCard className="size-5" />
              </div>

              <h2 className="mt-4 font-semibold">إدارة المستحقات</h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                بعد فتح الملف يمكنك إضافة الرسوم والأقساط ومتابعة المسدد
                والمتبقي.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ReceiptText className="size-5" />
              </div>

              <h2 className="mt-4 font-semibold">تسجيل الدفعات</h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                سجل دفعة ولي الأمر ووزعها تلقائيًا على أقدم المستحقات وأصدر
                الإيصال.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loadingWorkspace ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            جاري تحميل الملف المالي...
          </CardContent>
        </Card>
      ) : null}

      {workspace && !loadingWorkspace ? (
        <>
          <Card>
            <CardContent className="flex flex-col gap-5 pt-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UsersRound className="size-6" />
                </div>

                <div>
                  <h2 className="text-xl font-bold">
                    {workspace.guardian.displayName}
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    ولي الأمر
                    {workspace.guardian.nationalId
                      ? ` • ${workspace.guardian.nationalId}`
                      : ""}
                    {workspace.guardian.phone
                      ? ` • ${workspace.guardian.phone}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {workspace.students.map((student) => (
                  <span
                    key={student.id}
                    className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-2 text-sm"
                  >
                    <UserRound className="size-4 text-primary" />
                    {student.displayName}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <FinanceSummaryCards
            charges={workspace.charges}
            payments={workspace.payments}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" />
                    المستحقات
                  </CardTitle>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {workspace.charges.length} مستحق
                  </p>
                </div>

                <Button type="button" onClick={() => setAddChargeOpen(true)}>
                  إضافة مستحق
                </Button>
              </CardHeader>

              <CardContent>
                {workspace.charges.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    لا توجد مستحقات مسجلة.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {workspace.charges.map((charge) => (
                      <ChargeRow key={charge.id} charge={charge} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ReceiptText className="size-5 text-primary" />
                    الدفعات
                  </CardTitle>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {workspace.payments.length} دفعة
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={() => setRecordPaymentOpen(true)}
                >
                  تسجيل دفعة
                </Button>
              </CardHeader>

              <CardContent>
                {workspace.payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    لا توجد دفعات مسجلة.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {workspace.payments.map((payment) => (
                      <PaymentRow
                        key={payment.id}
                        payment={payment}
                        onReverse={setPaymentToReverse}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {workspace ? (
        <AddStudentFeeChargeDialog
          open={addChargeOpen}
          guardianId={workspace.guardian.id}
          students={workspace.students}
          onOpenChange={setAddChargeOpen}
          onCreated={reloadCurrentWorkspace}
        />
      ) : null}

      {workspace ? (
        <RecordGuardianPaymentDialog
          open={recordPaymentOpen}
          workspace={workspace}
          onOpenChange={setRecordPaymentOpen}
          onCreated={reloadCurrentWorkspace}
        />
      ) : null}

      <ReverseGuardianPaymentDialog
        payment={paymentToReverse}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentToReverse(undefined);
          }
        }}
        onReversed={reloadCurrentWorkspace}
      />

      {!workspace && !searching && results.length === 0 && !hasSearched ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <WalletCards className="size-10 text-muted-foreground/50" />

            <h2 className="mt-4 text-lg font-semibold">
              ابدأ بالبحث عن ولي الأمر أو الطالب
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              عند اختيار نتيجة البحث سيظهر الملف المالي كاملًا، بما فيه الأبناء
              والمستحقات والأقساط والدفعات والإيصالات.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
