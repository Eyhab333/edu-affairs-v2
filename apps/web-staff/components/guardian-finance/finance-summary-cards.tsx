"use client";

import type {
  GuardianPayment,
  StudentFeeCharge,
} from "@takween/contracts";
import {
  BadgeDollarSign,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FinanceSummaryCardsProps = {
  charges: StudentFeeCharge[];
  payments: GuardianPayment[];
};

function formatMoney(
  amountMinor: number,
  currency = "SAR",
): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function FinanceSummaryCards({
  charges,
  payments,
}: FinanceSummaryCardsProps) {
  const activeCharges = charges.filter(
  (charge) => charge.status !== "CANCELLED",
);

  const currency =
    activeCharges[0]?.currency ??
    payments[0]?.currency ??
    "SAR";

  const totalNetAmountMinor = activeCharges.reduce(
    (total, charge) => total + charge.netAmountMinor,
    0,
  );

  const totalPaidAmountMinor = activeCharges.reduce(
    (total, charge) => total + charge.paidAmountMinor,
    0,
  );

  const totalBalanceAmountMinor = activeCharges.reduce(
  (total, charge) =>
    total +
    Math.max(
      charge.netAmountMinor - charge.paidAmountMinor,
      0,
    ),
  0,
);

  const postedPaymentsAmountMinor = payments
    .filter((payment) => payment.status === "POSTED")
    .reduce(
      (total, payment) => total + payment.amountMinor,
      0,
    );

  const cards = [
    {
      title: "إجمالي المستحق",
      value: formatMoney(totalNetAmountMinor, currency),
      icon: CircleDollarSign,
    },
    {
      title: "المسدّد على المستحقات",
      value: formatMoney(totalPaidAmountMinor, currency),
      icon: BadgeDollarSign,
    },
    {
      title: "المتبقي",
      value: formatMoney(totalBalanceAmountMinor, currency),
      icon: WalletCards,
    },
    {
      title: "الدفعات المعتمدة",
      value: formatMoney(postedPaymentsAmountMinor, currency),
      icon: ReceiptText,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>

              <Icon className="size-4 text-primary" />
            </CardHeader>

            <CardContent>
              <div className="text-xl font-bold">
                {card.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}