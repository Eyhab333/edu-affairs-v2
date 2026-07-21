import type {
  FeeDefinition,
  GuardianFinancialAdjustment,
  GuardianFinanceSummary,
  GuardianFinanceStudentSummary,
  GuardianPayment,
  GuardianPaymentAllocation,
  GuardianPaymentMethod,
  StudentFeeCharge,
  StudentFeeChargeStatus,
  StudentFeeInstallment,
  StudentFeeInstallmentStatus,
  StudentFinanceSummary,
} from "@takween/contracts";

export type GuardianFinanceTermContext = {
  termId?: string;
  termTitle?: string;
  termShortTitle?: string;
};

export type BuildStudentFeeChargeDraftParams = {
  id?: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  term?: GuardianFinanceTermContext;

  studentId: string;
  studentPersonId?: string;
  studentDisplayName?: string;

  guardianId?: string;
  guardianPersonId?: string;
  guardianDisplayName?: string;

  feeDefinition: FeeDefinition;

  title?: string;
  description?: string;

  originalAmountMinor?: number;
  dueAt?: number;

  isGuardianVisible?: boolean;

  createdByPersonId: string;
  createdByRoleKey?: string;

  now?: number;
};

export type BuildStudentFeeInstallmentsParams = {
  charge: StudentFeeCharge;

  installmentCount: number;

  /**
   * قائمة تواريخ الاستحقاق بنفس ترتيب الأقساط.
   * يمكن ترك بعض العناصر undefined.
   */
  dueAtList?: Array<number | undefined>;

  /**
   * عناوين مخصصة للأقساط.
   */
  titles?: string[];

  createdByPersonId?: string;
  createdByRoleKey?: string;

  now?: number;
};

export type BuildStudentFeeInstallmentsResult = {
  charge: StudentFeeCharge;
  installments: StudentFeeInstallment[];
};

export type BuildGuardianPaymentDraftParams = {
  id: string;
  orgId: string;

  guardianId: string;
  guardianPersonId?: string;
  guardianDisplayName?: string;
  guardianPhone?: string;

  receiptNumber: string;

  currency?: string;
  amountMinor: number;

  paymentMethod: GuardianPaymentMethod;
  paidAt?: number;

  referenceNumber?: string;
  bankName?: string;
  transferDate?: number;
  chequeNumber?: string;
  cardLast4?: string;

  schoolIds?: string[];
  academicYearIds?: string[];
  termIds?: string[];

  collectedByPersonId: string;
  collectedByRoleKey?: string;
  collectorDisplayName?: string;

  note?: string;

  now?: number;
};

export type UpdateGuardianPaymentAllocationsParams = {
  payment: GuardianPayment;
  allocations: GuardianPaymentAllocation[];
  now?: number;
};

export type GuardianPaymentAllocationSummary = {
  amountMinor: number;
  allocatedAmountMinor: number;
  unallocatedAmountMinor: number;
  allocationCount: number;
};

export type PostGuardianPaymentParams = {
  payment: GuardianPayment;
  charges: StudentFeeCharge[];
  installments?: StudentFeeInstallment[];
  now?: number;
};

export type PostGuardianPaymentResult = {
  payment: GuardianPayment;
  charges: StudentFeeCharge[];
  installments: StudentFeeInstallment[];
};

export type ReverseGuardianPaymentParams = {
  payment: GuardianPayment;
  charges: StudentFeeCharge[];
  installments?: StudentFeeInstallment[];

  reversedByPersonId: string;
  reversalReason: string;
  reversalPaymentId?: string;

  now?: number;
};

export type ApplyGuardianFinancialAdjustmentParams = {
  adjustment: GuardianFinancialAdjustment;
  charge: StudentFeeCharge;
  installment?: StudentFeeInstallment;
  now?: number;
};

export type ApplyGuardianFinancialAdjustmentResult = {
  adjustment: GuardianFinancialAdjustment;
  charge: StudentFeeCharge;
  installment?: StudentFeeInstallment;
};

export type BuildStudentFinanceSummaryParams = {
  id?: string;

  orgId: string;
  schoolId: string;
  academicYearId: string;
  term?: GuardianFinanceTermContext;

  studentId: string;
  studentPersonId?: string;
  studentDisplayName?: string;

  currency?: string;

  charges: StudentFeeCharge[];
  installments?: StudentFeeInstallment[];
  payments?: GuardianPayment[];

  now?: number;
};

export type BuildGuardianFinanceSummaryParams = {
  id?: string;

  orgId: string;

  guardianId: string;
  guardianPersonId?: string;
  guardianDisplayName?: string;
  guardianPhone?: string;

  currency?: string;

  studentSummaries: StudentFinanceSummary[];
  payments?: GuardianPayment[];

  now?: number;
};

export const GUARDIAN_FINANCE_OPERATION_KIND = "GUARDIAN_FINANCE";

export const STUDENT_FEE_CHARGE_STATUS_LABEL_AR: Record<
  StudentFeeChargeStatus,
  string
> = {
  DRAFT: "مسودة",
  ACTIVE: "مستحق",
  PARTIALLY_PAID: "مسدد جزئيًا",
  PAID: "مسدد",
  OVERDUE: "متأخر",
  WAIVED: "معفى",
  CANCELLED: "ملغي",
};

export const STUDENT_FEE_INSTALLMENT_STATUS_LABEL_AR: Record<
  StudentFeeInstallmentStatus,
  string
> = {
  PENDING: "مستحق",
  PARTIALLY_PAID: "مسدد جزئيًا",
  PAID: "مسدد",
  OVERDUE: "متأخر",
  WAIVED: "معفى",
  CANCELLED: "ملغي",
};

function assertNonNegativeInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function assertSameCurrency(params: {
  expectedCurrency: string;
  actualCurrency: string;
  entityName: string;
}) {
  if (params.expectedCurrency !== params.actualCurrency) {
    throw new Error(
      `${params.entityName} currency does not match the payment currency.`,
    );
  }
}

export function splitMoneyMinorEqually(
  amountMinor: number,
  itemCount: number,
): number[] {
  assertNonNegativeInteger(amountMinor, "amountMinor");
  assertPositiveInteger(itemCount, "itemCount");

  const baseAmount = Math.floor(amountMinor / itemCount);
  const remainder = amountMinor % itemCount;

  return Array.from({ length: itemCount }, (_, index) => {
    return baseAmount + (index < remainder ? 1 : 0);
  });
}

export function calculateStudentFeeChargeAmounts(params: {
  originalAmountMinor: number;
  discountAmountMinor?: number;
  surchargeAmountMinor?: number;
  paidAmountMinor?: number;
}) {
  const originalAmountMinor = params.originalAmountMinor;
  const discountAmountMinor = params.discountAmountMinor ?? 0;
  const surchargeAmountMinor = params.surchargeAmountMinor ?? 0;
  const paidAmountMinor = params.paidAmountMinor ?? 0;

  assertNonNegativeInteger(originalAmountMinor, "originalAmountMinor");
  assertNonNegativeInteger(discountAmountMinor, "discountAmountMinor");
  assertNonNegativeInteger(surchargeAmountMinor, "surchargeAmountMinor");
  assertNonNegativeInteger(paidAmountMinor, "paidAmountMinor");

  const netAmountMinor =
    originalAmountMinor + surchargeAmountMinor - discountAmountMinor;

  if (netAmountMinor < 0) {
    throw new Error(
      "The total discount cannot exceed the original amount plus surcharges.",
    );
  }

  if (paidAmountMinor > netAmountMinor) {
    throw new Error("Paid amount cannot exceed the net charge amount.");
  }

  return {
    originalAmountMinor,
    discountAmountMinor,
    surchargeAmountMinor,
    netAmountMinor,
    paidAmountMinor,
    outstandingAmountMinor: netAmountMinor - paidAmountMinor,
  };
}

export function resolveStudentFeeChargeStatus(params: {
  currentStatus?: StudentFeeChargeStatus;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  dueAt?: number;
  now?: number;
}): StudentFeeChargeStatus {
  const now = params.now ?? Date.now();
  const currentStatus = params.currentStatus;

  if (currentStatus === "CANCELLED" || currentStatus === "WAIVED") {
    return currentStatus;
  }

  if (currentStatus === "DRAFT") {
    return "DRAFT";
  }

  if (params.outstandingAmountMinor <= 0) {
    return "PAID";
  }

  if (
    typeof params.dueAt === "number" &&
    params.dueAt < now &&
    params.outstandingAmountMinor > 0
  ) {
    return "OVERDUE";
  }

  if (params.paidAmountMinor > 0) {
    return "PARTIALLY_PAID";
  }

  return "ACTIVE";
}

export function resolveStudentFeeInstallmentStatus(params: {
  currentStatus?: StudentFeeInstallmentStatus;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  dueAt?: number;
  now?: number;
}): StudentFeeInstallmentStatus {
  const now = params.now ?? Date.now();
  const currentStatus = params.currentStatus;

  if (currentStatus === "CANCELLED" || currentStatus === "WAIVED") {
    return currentStatus;
  }

  if (params.outstandingAmountMinor <= 0) {
    return "PAID";
  }

  if (
    typeof params.dueAt === "number" &&
    params.dueAt < now &&
    params.outstandingAmountMinor > 0
  ) {
    return "OVERDUE";
  }

  if (params.paidAmountMinor > 0) {
    return "PARTIALLY_PAID";
  }

  return "PENDING";
}

export function buildStudentFeeChargeId(params: {
  studentId: string;
  feeDefinitionId: string;
  academicYearId: string;
  termId?: string;
}) {
  return [
    "student-fee-charge",
    params.studentId,
    params.feeDefinitionId,
    params.academicYearId,
    params.termId ?? "all",
  ].join("_");
}

export function buildStudentFeeChargeDraft({
  id,
  orgId,
  schoolId,
  academicYearId,
  term,
  studentId,
  studentPersonId,
  studentDisplayName,
  guardianId,
  guardianPersonId,
  guardianDisplayName,
  feeDefinition,
  title,
  description,
  originalAmountMinor,
  dueAt,
  isGuardianVisible,
  createdByPersonId,
  createdByRoleKey,
  now = Date.now(),
}: BuildStudentFeeChargeDraftParams): StudentFeeCharge {
  if (feeDefinition.orgId !== orgId) {
    throw new Error("Fee definition does not belong to the same organization.");
  }

  if (
    feeDefinition.academicYearId &&
    feeDefinition.academicYearId !== academicYearId
  ) {
    throw new Error(
      "Fee definition does not belong to the selected academic year.",
    );
  }

  const amountMinor =
    originalAmountMinor ?? feeDefinition.defaultAmountMinor;

  const amounts = calculateStudentFeeChargeAmounts({
    originalAmountMinor: amountMinor,
  });

  return {
    id:
      id ??
      buildStudentFeeChargeId({
        studentId,
        feeDefinitionId: feeDefinition.id,
        academicYearId,
        termId: term?.termId,
      }),

    orgId,
    schoolId,
    academicYearId,

    termId: term?.termId,
    termTitle: term?.termTitle,
    termShortTitle: term?.termShortTitle,

    studentId,
    studentPersonId,
    studentDisplayName,

    guardianId,
    guardianPersonId,
    guardianDisplayName,

    feeDefinitionId: feeDefinition.id,
    feeDefinitionTitle: feeDefinition.title,
    feeCategory: feeDefinition.category,

    title: title ?? feeDefinition.title,
    description: description ?? feeDefinition.description,

    currency: feeDefinition.currency,

    originalAmountMinor: amounts.originalAmountMinor,
    discountAmountMinor: amounts.discountAmountMinor,
    surchargeAmountMinor: amounts.surchargeAmountMinor,
    netAmountMinor: amounts.netAmountMinor,
    paidAmountMinor: amounts.paidAmountMinor,
    outstandingAmountMinor: amounts.outstandingAmountMinor,

    status: "DRAFT",

    dueAt,

    installmentIds: [],

    isGuardianVisible:
      isGuardianVisible ?? feeDefinition.isGuardianVisible,

    createdByPersonId,
    createdByRoleKey,

    createdAt: now,
    updatedAt: now,
  };
}

export function activateStudentFeeCharge(
  charge: StudentFeeCharge,
  now = Date.now(),
): StudentFeeCharge {
  if (charge.status !== "DRAFT") {
    throw new Error("Only a draft charge can be activated.");
  }

  const status = resolveStudentFeeChargeStatus({
    currentStatus: "ACTIVE",
    paidAmountMinor: charge.paidAmountMinor,
    outstandingAmountMinor: charge.outstandingAmountMinor,
    dueAt: charge.dueAt,
    now,
  });

  return {
    ...charge,
    status,
    chargedAt: charge.chargedAt ?? now,
    activatedAt: charge.activatedAt ?? now,
    updatedAt: now,
  };
}

export function refreshStudentFeeChargeStatus(
  charge: StudentFeeCharge,
  now = Date.now(),
): StudentFeeCharge {
  return {
    ...charge,
    status: resolveStudentFeeChargeStatus({
      currentStatus: charge.status,
      paidAmountMinor: charge.paidAmountMinor,
      outstandingAmountMinor: charge.outstandingAmountMinor,
      dueAt: charge.dueAt,
      now,
    }),
    updatedAt: now,
  };
}

export function refreshStudentFeeInstallmentStatus(
  installment: StudentFeeInstallment,
  now = Date.now(),
): StudentFeeInstallment {
  return {
    ...installment,
    status: resolveStudentFeeInstallmentStatus({
      currentStatus: installment.status,
      paidAmountMinor: installment.paidAmountMinor,
      outstandingAmountMinor: installment.outstandingAmountMinor,
      dueAt: installment.dueAt,
      now,
    }),
    updatedAt: now,
  };
}

export function buildStudentFeeInstallments({
  charge,
  installmentCount,
  dueAtList = [],
  titles = [],
  createdByPersonId,
  createdByRoleKey,
  now = Date.now(),
}: BuildStudentFeeInstallmentsParams): BuildStudentFeeInstallmentsResult {
  assertPositiveInteger(installmentCount, "installmentCount");

  if (charge.installmentIds.length > 0) {
    throw new Error("Installments already exist for this charge.");
  }

  if (charge.status === "CANCELLED" || charge.status === "WAIVED") {
    throw new Error(
      "Cannot create installments for a cancelled or waived charge.",
    );
  }

  const installmentAmounts = splitMoneyMinorEqually(
    charge.netAmountMinor,
    installmentCount,
  );

  const installments: StudentFeeInstallment[] = installmentAmounts.map(
    (amountMinor, index) => {
      const installmentNumber = index + 1;
      const dueAt = dueAtList[index];

      const status =
        charge.status === "DRAFT"
          ? "PENDING"
          : resolveStudentFeeInstallmentStatus({
              currentStatus: "PENDING",
              paidAmountMinor: 0,
              outstandingAmountMinor: amountMinor,
              dueAt,
              now,
            });

      return {
        id: `${charge.id}_installment_${String(installmentNumber).padStart(
          2,
          "0",
        )}`,

        orgId: charge.orgId,
        schoolId: charge.schoolId,
        academicYearId: charge.academicYearId,

        termId: charge.termId,
        termTitle: charge.termTitle,
        termShortTitle: charge.termShortTitle,

        chargeId: charge.id,
        feeDefinitionId: charge.feeDefinitionId,

        studentId: charge.studentId,
        studentPersonId: charge.studentPersonId,
        studentDisplayName: charge.studentDisplayName,

        guardianId: charge.guardianId,
        guardianPersonId: charge.guardianPersonId,
        guardianDisplayName: charge.guardianDisplayName,

        installmentNumber,
        title:
          titles[index] ??
          `${charge.title} - القسط ${installmentNumber}`,
        description: charge.description,

        currency: charge.currency,

        amountMinor,
        paidAmountMinor: 0,
        outstandingAmountMinor: amountMinor,

        status,

        dueAt,

        createdByPersonId:
          createdByPersonId ?? charge.createdByPersonId,
        createdByRoleKey:
          createdByRoleKey ?? charge.createdByRoleKey,

        createdAt: now,
        updatedAt: now,
      };
    },
  );

  return {
    charge: {
      ...charge,
      installmentIds: installments.map((installment) => installment.id),
      updatedAt: now,
    },
    installments,
  };
}

export function buildGuardianPaymentDraft({
  id,
  orgId,
  guardianId,
  guardianPersonId,
  guardianDisplayName,
  guardianPhone,
  receiptNumber,
  currency = "SAR",
  amountMinor,
  paymentMethod,
  paidAt,
  referenceNumber,
  bankName,
  transferDate,
  chequeNumber,
  cardLast4,
  schoolIds = [],
  academicYearIds = [],
  termIds = [],
  collectedByPersonId,
  collectedByRoleKey,
  collectorDisplayName,
  note,
  now = Date.now(),
}: BuildGuardianPaymentDraftParams): GuardianPayment {
  assertPositiveInteger(amountMinor, "amountMinor");

  if (!receiptNumber.trim()) {
    throw new Error("receiptNumber is required.");
  }

  return {
    id,
    orgId,

    schoolIds: uniqueStrings(schoolIds),
    academicYearIds: uniqueStrings(academicYearIds),
    termIds: uniqueStrings(termIds),

    guardianId,
    guardianPersonId,
    guardianDisplayName,
    guardianPhone,

    receiptNumber,

    currency,

    amountMinor,
    allocatedAmountMinor: 0,
    unallocatedAmountMinor: amountMinor,

    paymentMethod,
    status: "DRAFT",

    paidAt: paidAt ?? now,

    referenceNumber,
    bankName,
    transferDate,
    chequeNumber,
    cardLast4,

    allocations: [],

    collectedByPersonId,
    collectedByRoleKey,
    collectorDisplayName,

    note,

    createdAt: now,
    updatedAt: now,
  };
}

export function calculateGuardianPaymentAllocationSummary(params: {
  amountMinor: number;
  allocations: GuardianPaymentAllocation[];
}): GuardianPaymentAllocationSummary {
  assertPositiveInteger(params.amountMinor, "amountMinor");

  let allocatedAmountMinor = 0;

  for (const allocation of params.allocations) {
    assertPositiveInteger(
      allocation.amountMinor,
      `allocation ${allocation.id} amountMinor`,
    );

    allocatedAmountMinor += allocation.amountMinor;
  }

  if (allocatedAmountMinor > params.amountMinor) {
    throw new Error(
      "Payment allocations cannot exceed the payment amount.",
    );
  }

  return {
    amountMinor: params.amountMinor,
    allocatedAmountMinor,
    unallocatedAmountMinor:
      params.amountMinor - allocatedAmountMinor,
    allocationCount: params.allocations.length,
  };
}

export function updateGuardianPaymentAllocations({
  payment,
  allocations,
  now = Date.now(),
}: UpdateGuardianPaymentAllocationsParams): GuardianPayment {
  if (payment.status !== "DRAFT") {
    throw new Error(
      "Allocations can only be changed while the payment is a draft.",
    );
  }

  const allocationIds = new Set<string>();

  for (const allocation of allocations) {
    if (allocationIds.has(allocation.id)) {
      throw new Error(
        `Duplicate payment allocation id: ${allocation.id}`,
      );
    }

    allocationIds.add(allocation.id);
  }

  const summary = calculateGuardianPaymentAllocationSummary({
    amountMinor: payment.amountMinor,
    allocations,
  });

  return {
    ...payment,
    allocations,
    allocatedAmountMinor: summary.allocatedAmountMinor,
    unallocatedAmountMinor: summary.unallocatedAmountMinor,
    updatedAt: now,
  };
}

export function voidGuardianPaymentDraft(params: {
  payment: GuardianPayment;
  voidedByPersonId: string;
  voidReason: string;
  now?: number;
}): GuardianPayment {
  const now = params.now ?? Date.now();

  if (params.payment.status !== "DRAFT") {
    throw new Error(
      "Only draft payments can be voided directly. Posted payments must be reversed.",
    );
  }

  if (!params.voidReason.trim()) {
    throw new Error("A void reason is required.");
  }

  return {
    ...params.payment,
    status: "VOIDED",
    voidedAt: now,
    voidedByPersonId: params.voidedByPersonId,
    voidReason: params.voidReason,
    updatedAt: now,
  };
}

export function postGuardianPayment({
  payment,
  charges,
  installments = [],
  now = Date.now(),
}: PostGuardianPaymentParams): PostGuardianPaymentResult {
  if (payment.status !== "DRAFT") {
    throw new Error("Only draft payments can be posted.");
  }

  const allocationSummary =
    calculateGuardianPaymentAllocationSummary({
      amountMinor: payment.amountMinor,
      allocations: payment.allocations,
    });

  if (allocationSummary.allocatedAmountMinor !== payment.amountMinor) {
    throw new Error(
      "The full payment amount must be allocated before posting.",
    );
  }

  if (payment.allocations.length === 0) {
    throw new Error(
      "At least one payment allocation is required.",
    );
  }

  const chargeMap = new Map(
    charges.map((charge) => [charge.id, { ...charge }]),
  );

  const installmentMap = new Map(
    installments.map((installment) => [
      installment.id,
      { ...installment },
    ]),
  );

  const touchedCharges = new Set<string>();

  for (const allocation of payment.allocations) {
    const charge = chargeMap.get(allocation.chargeId);

    if (!charge) {
      throw new Error(
        `Charge not found for allocation: ${allocation.id}`,
      );
    }

    if (charge.orgId !== payment.orgId) {
      throw new Error(
        `Charge ${charge.id} belongs to another organization.`,
      );
    }

    if (charge.studentId !== allocation.studentId) {
      throw new Error(
        `Allocation ${allocation.id} student does not match its charge.`,
      );
    }

    assertSameCurrency({
      expectedCurrency: payment.currency,
      actualCurrency: charge.currency,
      entityName: `Charge ${charge.id}`,
    });

    if (
      charge.status === "DRAFT" ||
      charge.status === "CANCELLED" ||
      charge.status === "WAIVED"
    ) {
      throw new Error(
        `Charge ${charge.id} cannot receive payments in its current status.`,
      );
    }

    if (allocation.amountMinor > charge.outstandingAmountMinor) {
      throw new Error(
        `Allocation ${allocation.id} exceeds the charge outstanding amount.`,
      );
    }

    if (allocation.installmentId) {
      const installment = installmentMap.get(
        allocation.installmentId,
      );

      if (!installment) {
        throw new Error(
          `Installment not found for allocation: ${allocation.id}`,
        );
      }

      if (installment.chargeId !== charge.id) {
        throw new Error(
          `Installment ${installment.id} does not belong to charge ${charge.id}.`,
        );
      }

      if (installment.studentId !== allocation.studentId) {
        throw new Error(
          `Allocation ${allocation.id} student does not match its installment.`,
        );
      }

      assertSameCurrency({
        expectedCurrency: payment.currency,
        actualCurrency: installment.currency,
        entityName: `Installment ${installment.id}`,
      });

      if (
        installment.status === "CANCELLED" ||
        installment.status === "WAIVED"
      ) {
        throw new Error(
          `Installment ${installment.id} cannot receive payments.`,
        );
      }

      if (
        allocation.amountMinor >
        installment.outstandingAmountMinor
      ) {
        throw new Error(
          `Allocation ${allocation.id} exceeds the installment outstanding amount.`,
        );
      }

      const installmentPaidAmountMinor =
        installment.paidAmountMinor + allocation.amountMinor;

      const installmentOutstandingAmountMinor =
        installment.amountMinor -
        installmentPaidAmountMinor;

      installmentMap.set(installment.id, {
        ...installment,
        paidAmountMinor: installmentPaidAmountMinor,
        outstandingAmountMinor:
          installmentOutstandingAmountMinor,
        status: resolveStudentFeeInstallmentStatus({
          currentStatus: installment.status,
          paidAmountMinor: installmentPaidAmountMinor,
          outstandingAmountMinor:
            installmentOutstandingAmountMinor,
          dueAt: installment.dueAt,
          now,
        }),
        paidAt:
          installmentOutstandingAmountMinor === 0
            ? now
            : installment.paidAt,
        updatedAt: now,
      });
    }

    const chargePaidAmountMinor =
      charge.paidAmountMinor + allocation.amountMinor;

    const chargeOutstandingAmountMinor =
      charge.netAmountMinor - chargePaidAmountMinor;

    chargeMap.set(charge.id, {
      ...charge,
      paidAmountMinor: chargePaidAmountMinor,
      outstandingAmountMinor: chargeOutstandingAmountMinor,
      status: resolveStudentFeeChargeStatus({
        currentStatus: charge.status,
        paidAmountMinor: chargePaidAmountMinor,
        outstandingAmountMinor: chargeOutstandingAmountMinor,
        dueAt: charge.dueAt,
        now,
      }),
      paidAt:
        chargeOutstandingAmountMinor === 0
          ? now
          : charge.paidAt,
      updatedAt: now,
    });

    touchedCharges.add(charge.id);
  }

  const touchedChargeItems = Array.from(touchedCharges)
    .map((chargeId) => chargeMap.get(chargeId))
    .filter(
      (charge): charge is StudentFeeCharge => Boolean(charge),
    );

  const postedPayment: GuardianPayment = {
    ...payment,

    schoolIds: uniqueStrings([
      ...payment.schoolIds,
      ...touchedChargeItems.map((charge) => charge.schoolId),
    ]),

    academicYearIds: uniqueStrings([
      ...payment.academicYearIds,
      ...touchedChargeItems.map(
        (charge) => charge.academicYearId,
      ),
    ]),

    termIds: uniqueStrings([
      ...payment.termIds,
      ...touchedChargeItems.map((charge) => charge.termId),
    ]),

    allocatedAmountMinor:
      allocationSummary.allocatedAmountMinor,
    unallocatedAmountMinor: 0,

    status: "POSTED",
    postedAt: now,

    updatedAt: now,
  };

  return {
    payment: postedPayment,
    charges: charges.map(
      (charge) => chargeMap.get(charge.id) ?? charge,
    ),
    installments: installments.map(
      (installment) =>
        installmentMap.get(installment.id) ?? installment,
    ),
  };
}

export function reverseGuardianPayment({
  payment,
  charges,
  installments = [],
  reversedByPersonId,
  reversalReason,
  reversalPaymentId,
  now = Date.now(),
}: ReverseGuardianPaymentParams): PostGuardianPaymentResult {
  if (payment.status !== "POSTED") {
    throw new Error("Only posted payments can be reversed.");
  }

  if (!reversalReason.trim()) {
    throw new Error("A reversal reason is required.");
  }

  const chargeMap = new Map(
    charges.map((charge) => [charge.id, { ...charge }]),
  );

  const installmentMap = new Map(
    installments.map((installment) => [
      installment.id,
      { ...installment },
    ]),
  );

  for (const allocation of payment.allocations) {
    const charge = chargeMap.get(allocation.chargeId);

    if (!charge) {
      throw new Error(
        `Charge not found while reversing allocation ${allocation.id}.`,
      );
    }

    if (charge.paidAmountMinor < allocation.amountMinor) {
      throw new Error(
        `Charge ${charge.id} does not contain enough paid balance to reverse.`,
      );
    }

    if (allocation.installmentId) {
      const installment = installmentMap.get(
        allocation.installmentId,
      );

      if (!installment) {
        throw new Error(
          `Installment not found while reversing allocation ${allocation.id}.`,
        );
      }

      if (
        installment.paidAmountMinor < allocation.amountMinor
      ) {
        throw new Error(
          `Installment ${installment.id} does not contain enough paid balance to reverse.`,
        );
      }

      const installmentPaidAmountMinor =
        installment.paidAmountMinor - allocation.amountMinor;

      const installmentOutstandingAmountMinor =
        installment.amountMinor -
        installmentPaidAmountMinor;

      installmentMap.set(installment.id, {
        ...installment,
        paidAmountMinor: installmentPaidAmountMinor,
        outstandingAmountMinor:
          installmentOutstandingAmountMinor,
        status: resolveStudentFeeInstallmentStatus({
          currentStatus: "PENDING",
          paidAmountMinor: installmentPaidAmountMinor,
          outstandingAmountMinor:
            installmentOutstandingAmountMinor,
          dueAt: installment.dueAt,
          now,
        }),
        paidAt:
          installmentOutstandingAmountMinor === 0
            ? installment.paidAt
            : undefined,
        updatedAt: now,
      });
    }

    const chargePaidAmountMinor =
      charge.paidAmountMinor - allocation.amountMinor;

    const chargeOutstandingAmountMinor =
      charge.netAmountMinor - chargePaidAmountMinor;

    chargeMap.set(charge.id, {
      ...charge,
      paidAmountMinor: chargePaidAmountMinor,
      outstandingAmountMinor: chargeOutstandingAmountMinor,
      status: resolveStudentFeeChargeStatus({
        currentStatus: "ACTIVE",
        paidAmountMinor: chargePaidAmountMinor,
        outstandingAmountMinor: chargeOutstandingAmountMinor,
        dueAt: charge.dueAt,
        now,
      }),
      paidAt:
        chargeOutstandingAmountMinor === 0
          ? charge.paidAt
          : undefined,
      updatedAt: now,
    });
  }

  return {
    payment: {
      ...payment,
      status: "REVERSED",
      reversedAt: now,
      reversedByPersonId,
      reversalReason,
      reversalPaymentId,
      updatedAt: now,
    },

    charges: charges.map(
      (charge) => chargeMap.get(charge.id) ?? charge,
    ),

    installments: installments.map(
      (installment) =>
        installmentMap.get(installment.id) ?? installment,
    ),
  };
}

export function applyGuardianFinancialAdjustment({
  adjustment,
  charge,
  installment,
  now = Date.now(),
}: ApplyGuardianFinancialAdjustmentParams): ApplyGuardianFinancialAdjustmentResult {
  if (adjustment.status !== "DRAFT") {
    throw new Error("Only draft adjustments can be applied.");
  }

  if (adjustment.chargeId !== charge.id) {
    throw new Error(
      "The adjustment does not belong to the supplied charge.",
    );
  }

  if (adjustment.studentId !== charge.studentId) {
    throw new Error(
      "The adjustment student does not match the supplied charge.",
    );
  }

  assertSameCurrency({
    expectedCurrency: charge.currency,
    actualCurrency: adjustment.currency,
    entityName: `Adjustment ${adjustment.id}`,
  });

  if (charge.status === "CANCELLED") {
    throw new Error(
      "Adjustments cannot be applied to a cancelled charge.",
    );
  }

  assertPositiveInteger(
    adjustment.amountMinor,
    "adjustment amountMinor",
  );

  const nextDiscountAmountMinor =
    adjustment.direction === "CREDIT"
      ? charge.discountAmountMinor + adjustment.amountMinor
      : charge.discountAmountMinor;

  const nextSurchargeAmountMinor =
    adjustment.direction === "DEBIT"
      ? charge.surchargeAmountMinor + adjustment.amountMinor
      : charge.surchargeAmountMinor;

  const chargeAmounts = calculateStudentFeeChargeAmounts({
    originalAmountMinor: charge.originalAmountMinor,
    discountAmountMinor: nextDiscountAmountMinor,
    surchargeAmountMinor: nextSurchargeAmountMinor,
    paidAmountMinor: charge.paidAmountMinor,
  });

  let nextChargeStatus = resolveStudentFeeChargeStatus({
    currentStatus: charge.status,
    paidAmountMinor: chargeAmounts.paidAmountMinor,
    outstandingAmountMinor:
      chargeAmounts.outstandingAmountMinor,
    dueAt: charge.dueAt,
    now,
  });

  if (
    adjustment.kind === "WAIVER" &&
    chargeAmounts.netAmountMinor === 0 &&
    chargeAmounts.paidAmountMinor === 0
  ) {
    nextChargeStatus = "WAIVED";
  }

  const nextCharge: StudentFeeCharge = {
    ...charge,

    discountAmountMinor:
      chargeAmounts.discountAmountMinor,

    surchargeAmountMinor:
      chargeAmounts.surchargeAmountMinor,

    netAmountMinor: chargeAmounts.netAmountMinor,
    paidAmountMinor: chargeAmounts.paidAmountMinor,
    outstandingAmountMinor:
      chargeAmounts.outstandingAmountMinor,

    status: nextChargeStatus,

    updatedByPersonId: adjustment.createdByPersonId,
    updatedByRoleKey: adjustment.createdByRoleKey,

    updatedAt: now,
  };

  let nextInstallment: StudentFeeInstallment | undefined =
    installment;

  if (adjustment.installmentId) {
    if (!installment) {
      throw new Error(
        "The adjustment targets an installment, but no installment was supplied.",
      );
    }

    if (installment.id !== adjustment.installmentId) {
      throw new Error(
        "The supplied installment does not match the adjustment.",
      );
    }

    if (installment.chargeId !== charge.id) {
      throw new Error(
        "The supplied installment does not belong to the charge.",
      );
    }

    assertSameCurrency({
      expectedCurrency: charge.currency,
      actualCurrency: installment.currency,
      entityName: `Installment ${installment.id}`,
    });

    const nextInstallmentAmountMinor =
      adjustment.direction === "CREDIT"
        ? installment.amountMinor - adjustment.amountMinor
        : installment.amountMinor + adjustment.amountMinor;

    if (nextInstallmentAmountMinor < 0) {
      throw new Error(
        "The credit adjustment exceeds the installment amount.",
      );
    }

    if (
      nextInstallmentAmountMinor <
      installment.paidAmountMinor
    ) {
      throw new Error(
        "The adjusted installment amount cannot be less than the amount already paid.",
      );
    }

    const nextInstallmentOutstandingAmountMinor =
      nextInstallmentAmountMinor -
      installment.paidAmountMinor;

    let nextInstallmentStatus =
      resolveStudentFeeInstallmentStatus({
        currentStatus: installment.status,
        paidAmountMinor: installment.paidAmountMinor,
        outstandingAmountMinor:
          nextInstallmentOutstandingAmountMinor,
        dueAt: installment.dueAt,
        now,
      });

    if (
      adjustment.kind === "WAIVER" &&
      nextInstallmentAmountMinor === 0 &&
      installment.paidAmountMinor === 0
    ) {
      nextInstallmentStatus = "WAIVED";
    }

    nextInstallment = {
      ...installment,
      amountMinor: nextInstallmentAmountMinor,
      outstandingAmountMinor:
        nextInstallmentOutstandingAmountMinor,
      status: nextInstallmentStatus,
      waivedAt:
        nextInstallmentStatus === "WAIVED"
          ? now
          : installment.waivedAt,
      waivedByPersonId:
        nextInstallmentStatus === "WAIVED"
          ? adjustment.createdByPersonId
          : installment.waivedByPersonId,
      waiverReason:
        nextInstallmentStatus === "WAIVED"
          ? adjustment.reason
          : installment.waiverReason,
      updatedAt: now,
    };
  }

  return {
    adjustment: {
      ...adjustment,
      status: "APPLIED",
      appliedAt: now,
      updatedAt: now,
    },

    charge: nextCharge,
    installment: nextInstallment,
  };
}

export function buildStudentFinanceSummary({
  id,
  orgId,
  schoolId,
  academicYearId,
  term,
  studentId,
  studentPersonId,
  studentDisplayName,
  currency = "SAR",
  charges,
  installments = [],
  payments = [],
  now = Date.now(),
}: BuildStudentFinanceSummaryParams): StudentFinanceSummary {
  const visibleCharges = charges
    .filter((charge) => charge.orgId === orgId)
    .filter((charge) => charge.schoolId === schoolId)
    .filter(
      (charge) => charge.academicYearId === academicYearId,
    )
    .filter((charge) => charge.studentId === studentId)
    .filter((charge) => charge.currency === currency)
    .filter(
      (charge) =>
        !term?.termId || charge.termId === term.termId,
    )
    .filter(
      (charge) =>
        charge.status !== "DRAFT" &&
        charge.status !== "CANCELLED",
    );

  const chargeIds = new Set(
    visibleCharges.map((charge) => charge.id),
  );

  const visibleInstallments = installments
    .filter((installment) =>
      chargeIds.has(installment.chargeId),
    )
    .filter((installment) => installment.currency === currency)
    .filter(
      (installment) =>
        installment.status !== "CANCELLED" &&
        installment.status !== "WAIVED",
    );

  const originalAmountMinor = visibleCharges.reduce(
    (total, charge) => total + charge.originalAmountMinor,
    0,
  );

  const discountAmountMinor = visibleCharges.reduce(
    (total, charge) => total + charge.discountAmountMinor,
    0,
  );

  const surchargeAmountMinor = visibleCharges.reduce(
    (total, charge) => total + charge.surchargeAmountMinor,
    0,
  );

  const netAmountMinor = visibleCharges.reduce(
    (total, charge) => total + charge.netAmountMinor,
    0,
  );

  const paidAmountMinor = visibleCharges.reduce(
    (total, charge) => total + charge.paidAmountMinor,
    0,
  );

  const outstandingAmountMinor = visibleCharges.reduce(
    (total, charge) =>
      total + charge.outstandingAmountMinor,
    0,
  );

  const overdueAmountMinor =
    visibleInstallments.length > 0
      ? visibleInstallments
          .filter(
            (installment) => installment.status === "OVERDUE",
          )
          .reduce(
            (total, installment) =>
              total + installment.outstandingAmountMinor,
            0,
          )
      : visibleCharges
          .filter((charge) => charge.status === "OVERDUE")
          .reduce(
            (total, charge) =>
              total + charge.outstandingAmountMinor,
            0,
          );

  const nextInstallment = visibleInstallments
    .filter(
      (installment) =>
        installment.outstandingAmountMinor > 0,
    )
    .sort((a, b) => {
      const aDueAt = a.dueAt ?? Number.MAX_SAFE_INTEGER;
      const bDueAt = b.dueAt ?? Number.MAX_SAFE_INTEGER;

      if (aDueAt !== bDueAt) {
        return aDueAt - bDueAt;
      }

      return a.installmentNumber - b.installmentNumber;
    })[0];

  const studentPayments = payments
    .filter((payment) => payment.orgId === orgId)
    .filter((payment) => payment.status === "POSTED")
    .filter((payment) => payment.currency === currency)
    .map((payment) => {
      const allocatedToStudentMinor =
        payment.allocations
          .filter(
            (allocation) =>
              allocation.studentId === studentId &&
              chargeIds.has(allocation.chargeId),
          )
          .reduce(
            (total, allocation) =>
              total + allocation.amountMinor,
            0,
          );

      return {
        payment,
        allocatedToStudentMinor,
      };
    })
    .filter((item) => item.allocatedToStudentMinor > 0)
    .sort((a, b) => b.payment.paidAt - a.payment.paidAt);

  const lastPayment = studentPayments[0];

  return {
    id:
      id ??
      [
        "student-finance-summary",
        studentId,
        academicYearId,
        term?.termId ?? "all",
      ].join("_"),

    orgId,

    schoolId,
    academicYearId,

    termId: term?.termId,
    termTitle: term?.termTitle,
    termShortTitle: term?.termShortTitle,

    studentId,
    studentPersonId,
    studentDisplayName,

    currency,

    originalAmountMinor,
    discountAmountMinor,
    surchargeAmountMinor,

    netAmountMinor,
    paidAmountMinor,
    outstandingAmountMinor,
    overdueAmountMinor,

    chargeCount: visibleCharges.length,

    openChargeCount: visibleCharges.filter((charge) =>
      ["ACTIVE", "PARTIALLY_PAID", "OVERDUE"].includes(
        charge.status,
      ),
    ).length,

    paidChargeCount: visibleCharges.filter(
      (charge) => charge.status === "PAID",
    ).length,

    overdueChargeCount: visibleCharges.filter(
      (charge) => charge.status === "OVERDUE",
    ).length,

    nextInstallmentId: nextInstallment?.id,
    nextInstallmentTitle: nextInstallment?.title,
    nextInstallmentDueAt: nextInstallment?.dueAt,
    nextInstallmentAmountMinor:
      nextInstallment?.outstandingAmountMinor,

    lastPaymentId: lastPayment?.payment.id,
    lastPaymentAt: lastPayment?.payment.paidAt,
    lastPaymentAmountMinor:
      lastPayment?.allocatedToStudentMinor,

    updatedAt: now,
  };
}

export function buildGuardianFinanceSummary({
  id,
  orgId,
  guardianId,
  guardianPersonId,
  guardianDisplayName,
  guardianPhone,
  currency,
  studentSummaries,
  payments = [],
  now = Date.now(),
}: BuildGuardianFinanceSummaryParams): GuardianFinanceSummary {
  const resolvedCurrency =
    currency ?? studentSummaries[0]?.currency ?? "SAR";

  const visibleStudentSummaries = studentSummaries
    .filter((summary) => summary.orgId === orgId)
    .filter(
      (summary) => summary.currency === resolvedCurrency,
    );

  const students: GuardianFinanceStudentSummary[] =
    visibleStudentSummaries.map((summary) => {
      const {
        id: _id,
        orgId: _orgId,
        updatedAt: _updatedAt,
        ...studentSummary
      } = summary;

      return studentSummary;
    });

  const guardianPayments = payments
    .filter((payment) => payment.orgId === orgId)
    .filter((payment) => payment.guardianId === guardianId)
    .filter((payment) => payment.status === "POSTED")
    .filter(
      (payment) => payment.currency === resolvedCurrency,
    )
    .sort((a, b) => b.paidAt - a.paidAt);

  const lastPayment = guardianPayments[0];

  return {
    id:
      id ??
      [
        "guardian-finance-summary",
        guardianId,
        resolvedCurrency,
      ].join("_"),

    orgId,

    guardianId,
    guardianPersonId,
    guardianDisplayName,
    guardianPhone,

    currency: resolvedCurrency,

    originalAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.originalAmountMinor,
      0,
    ),

    discountAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.discountAmountMinor,
      0,
    ),

    surchargeAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.surchargeAmountMinor,
      0,
    ),

    netAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) => total + summary.netAmountMinor,
      0,
    ),

    paidAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) => total + summary.paidAmountMinor,
      0,
    ),

    outstandingAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.outstandingAmountMinor,
      0,
    ),

    overdueAmountMinor: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.overdueAmountMinor,
      0,
    ),

    studentCount: new Set(
      visibleStudentSummaries.map(
        (summary) => summary.studentId,
      ),
    ).size,

    chargeCount: visibleStudentSummaries.reduce(
      (total, summary) => total + summary.chargeCount,
      0,
    ),

    openChargeCount: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.openChargeCount,
      0,
    ),

    overdueChargeCount: visibleStudentSummaries.reduce(
      (total, summary) =>
        total + summary.overdueChargeCount,
      0,
    ),

    students,

    lastPaymentId: lastPayment?.id,
    lastPaymentAt: lastPayment?.paidAt,
    lastPaymentAmountMinor: lastPayment?.amountMinor,

    updatedAt: now,
  };
}