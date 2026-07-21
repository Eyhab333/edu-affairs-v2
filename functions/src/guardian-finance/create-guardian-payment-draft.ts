import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GuardianPaymentMethodSchema,
  GuardianPaymentSchema,
  type GuardianPaymentMethod,
} from "@takween/contracts";

import { buildGuardianPaymentDraft } from "@takween/domain";

import { requireGuardianFinanceAccess } from "./finance-access";

const REGION = "me-central2";

type CreateGuardianPaymentDraftInput = {
  orgId?: unknown;
  guardianId?: unknown;
  paymentId?: unknown;

  amountMinor?: unknown;
  paymentMethod?: unknown;
  paidAt?: unknown;

  schoolIds?: unknown;
  academicYearIds?: unknown;
  termIds?: unknown;

  referenceNumber?: unknown;
  bankName?: unknown;
  transferDate?: unknown;
  chequeNumber?: unknown;
  cardLast4?: unknown;

  note?: unknown;
};

type CreateGuardianPaymentDraftResult = {
  ok: true;
  paymentId: string;
  receiptNumber: string;
  status: "DRAFT";
};

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`,
    );
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  return trimmed || undefined;
}

function requirePositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a positive integer.`,
    );
  }

  return value;
}

function optionalTimestamp(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a valid timestamp.`,
    );
  }

  return value;
}

function readStringArray(
  value: unknown,
  fieldName: string,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be an array.`,
    );
  }

  return Array.from(
    new Set(
      value.map((item, index) => {
        if (typeof item !== "string" || !item.trim()) {
          throw new HttpsError(
            "invalid-argument",
            `${fieldName}[${index}] must be a non-empty string.`,
          );
        }

        return item.trim();
      }),
    ),
  );
}

function readPaymentMethod(
  value: unknown,
): GuardianPaymentMethod {
  const result = GuardianPaymentMethodSchema.safeParse(value);

  if (!result.success) {
    throw new HttpsError(
      "invalid-argument",
      "paymentMethod is invalid.",
    );
  }

  return result.data;
}

function readDisplayName(
  data: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!data) return fallback;

  const keys = [
    "displayName",
    "fullName",
    "guardianName",
    "name",
    "arabicName",
  ];

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function readPhone(
  guardianData: Record<string, unknown>,
  personData?: Record<string, unknown>,
): string | undefined {
  const candidates = [
    personData?.phone,
    personData?.mobile,
    personData?.phoneNumber,
    guardianData.phone,
    guardianData.mobile,
    guardianData.phoneNumber,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefined(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (item === undefined) continue;

      result[key] = removeUndefined(item);
    }

    return result as T;
  }

  return value;
}

function resolveYear(
  timestamp: number,
  timezone: string,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).getUTCFullYear().toString();
  }
}

function validatePaymentMethodFields(params: {
  paymentMethod: GuardianPaymentMethod;
  referenceNumber?: string;
  chequeNumber?: string;
  cardLast4?: string;
}) {
  if (
    params.paymentMethod === "BANK_TRANSFER" &&
    !params.referenceNumber
  ) {
    throw new HttpsError(
      "invalid-argument",
      "referenceNumber is required for bank transfers.",
    );
  }

  if (
    params.paymentMethod === "CHEQUE" &&
    !params.chequeNumber
  ) {
    throw new HttpsError(
      "invalid-argument",
      "chequeNumber is required for cheque payments.",
    );
  }

  if (
    params.cardLast4 &&
    !/^\d{4}$/.test(params.cardLast4)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "cardLast4 must contain exactly four digits.",
    );
  }
}

export const createGuardianPaymentDraft = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<CreateGuardianPaymentDraftResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input =
      request.data as CreateGuardianPaymentDraftInput;

    const orgId = requireNonEmptyString(
      input.orgId,
      "orgId",
    );

    const guardianId = requireNonEmptyString(
      input.guardianId,
      "guardianId",
    );

    const requestedPaymentId = optionalString(
      input.paymentId,
    );

    if (requestedPaymentId?.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "paymentId cannot contain '/'.",
      );
    }

    const amountMinor = requirePositiveInteger(
      input.amountMinor,
      "amountMinor",
    );

    const paymentMethod = readPaymentMethod(
      input.paymentMethod,
    );

    const paidAt = optionalTimestamp(
      input.paidAt,
      "paidAt",
    );

    const transferDate = optionalTimestamp(
      input.transferDate,
      "transferDate",
    );

    const schoolIds = readStringArray(
      input.schoolIds,
      "schoolIds",
    );

    const academicYearIds = readStringArray(
      input.academicYearIds,
      "academicYearIds",
    );

    const termIds = readStringArray(
      input.termIds,
      "termIds",
    );

    const referenceNumber = optionalString(
      input.referenceNumber,
    );

    const bankName = optionalString(input.bankName);

    const chequeNumber = optionalString(
      input.chequeNumber,
    );

    const cardLast4 = optionalString(input.cardLast4);

    const note = optionalString(input.note);

    validatePaymentMethodFields({
      paymentMethod,
      referenceNumber,
      chequeNumber,
      cardLast4,
    });

    /**
     * إذا لم تحدد مدرسة، فهذه عملية مؤسسية
     * وتحتاج عضوية ORG أو canAccessAllSchools.
     */
    if (schoolIds.length === 0) {
      await requireGuardianFinanceAccess({
        uid,
        orgId,
        permission: "recordGuardianPayments",
      });
    } else {
      for (const schoolId of schoolIds) {
        await requireGuardianFinanceAccess({
          uid,
          orgId,
          schoolId,
          permission: "recordGuardianPayments",
        });
      }
    }

    const actor = await requireGuardianFinanceAccess({
      uid,
      orgId,
      schoolId: schoolIds[0],
      permission: "recordGuardianPayments",
    });

    const db = getFirestore();
    const now = Date.now();

    const paymentsCollection = db.collection(
      `orgs/${orgId}/guardianPayments`,
    );

    const paymentRef = requestedPaymentId
      ? paymentsCollection.doc(requestedPaymentId)
      : paymentsCollection.doc();

    const orgRef = db.doc(`orgs/${orgId}`);

    const guardianRef = db.doc(
      `orgs/${orgId}/guardians/${guardianId}`,
    );

    const receiptCounterRef = db.doc(
      `orgs/${orgId}/counters/guardianPaymentReceipts`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [
          orgSnap,
          guardianSnap,
          paymentSnap,
          receiptCounterSnap,
        ] = await Promise.all([
          transaction.get(orgRef),
          transaction.get(guardianRef),
          transaction.get(paymentRef),
          transaction.get(receiptCounterRef),
        ]);

        if (!orgSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Organization not found.",
          );
        }

        if (!guardianSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Guardian not found.",
          );
        }

        if (paymentSnap.exists) {
          throw new HttpsError(
            "already-exists",
            "A payment with the same id already exists.",
          );
        }

        const guardianData = guardianSnap.data() ?? {};

        if (guardianData.isArchived === true) {
          throw new HttpsError(
            "failed-precondition",
            "Guardian is archived.",
          );
        }

        const guardianPersonId =
          typeof guardianData.personId === "string" &&
          guardianData.personId.trim()
            ? guardianData.personId.trim()
            : undefined;

        let guardianPersonData:
          | Record<string, unknown>
          | undefined;

        if (guardianPersonId) {
          const guardianPersonRef = db.doc(
            `orgs/${orgId}/people/${guardianPersonId}`,
          );

          const guardianPersonSnap =
            await transaction.get(guardianPersonRef);

          guardianPersonData =
            guardianPersonSnap.data() ?? undefined;
        }

        const orgData = orgSnap.data() ?? {};

        const locale =
          orgData.locale &&
          typeof orgData.locale === "object" &&
          !Array.isArray(orgData.locale)
            ? (orgData.locale as Record<string, unknown>)
            : {};

        const currency =
          typeof locale.currency === "string" &&
          locale.currency.trim()
            ? locale.currency.trim().toUpperCase()
            : "SAR";

        const timezone =
          typeof locale.timezone === "string" &&
          locale.timezone.trim()
            ? locale.timezone.trim()
            : "Asia/Riyadh";

        const currentYear = resolveYear(now, timezone);

        const counterData =
          receiptCounterSnap.data() ?? {};

        const counterYear =
          typeof counterData.year === "string"
            ? counterData.year
            : "";

        const previousNumber =
          counterYear === currentYear &&
          typeof counterData.lastNumber === "number" &&
          Number.isInteger(counterData.lastNumber) &&
          counterData.lastNumber >= 0
            ? counterData.lastNumber
            : 0;

        const nextNumber = previousNumber + 1;

        const receiptNumber = [
          "PAY",
          currentYear,
          String(nextNumber).padStart(6, "0"),
        ].join("-");

        const guardianDisplayName = readDisplayName(
          guardianPersonData,
          readDisplayName(guardianData, guardianId),
        );

        const guardianPhone = readPhone(
          guardianData,
          guardianPersonData,
        );

        const payment = buildGuardianPaymentDraft({
          id: paymentRef.id,
          orgId,

          guardianId,
          guardianPersonId,
          guardianDisplayName,
          guardianPhone,

          receiptNumber,

          currency,
          amountMinor,

          paymentMethod,
          paidAt,

          referenceNumber,
          bankName,
          transferDate,
          chequeNumber,
          cardLast4,

          schoolIds,
          academicYearIds,
          termIds,

          collectedByPersonId: actor.personId,
          collectedByRoleKey:
            actor.roleKey || undefined,

          note,

          now,
        });

        const parsedPayment =
          GuardianPaymentSchema.parse(payment);

        transaction.set(
          receiptCounterRef,
          {
            year: currentYear,
            lastNumber: nextNumber,
            lastReceiptNumber: receiptNumber,
            updatedAt: now,
          },
          {
            merge: true,
          },
        );

        transaction.create(
          paymentRef,
          removeUndefined(parsedPayment),
        );

        return {
          ok: true,
          paymentId: parsedPayment.id,
          receiptNumber: parsedPayment.receiptNumber,
          status: "DRAFT",
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to create guardian payment draft.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);