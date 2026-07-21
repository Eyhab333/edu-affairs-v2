import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GuardianPaymentReceiptSchema,
  GuardianPaymentSchema,
  StudentFeeChargeSchema,
  StudentFeeInstallmentSchema,
  type StudentFeeCharge,
} from "@takween/contracts";

import {
  reverseGuardianPayment as reverseGuardianPaymentDomain,
} from "@takween/domain";

import { requireGuardianFinanceAccess } from "./finance-access";

const REGION = "me-central2";

type ReverseGuardianPaymentInput = {
  orgId?: unknown;
  paymentId?: unknown;
  reversalReason?: unknown;
};

type ReverseGuardianPaymentResult = {
  ok: true;
  paymentId: string;
  status: "REVERSED";
  chargeIds: string[];
  installmentIds: string[];
  receiptCancelled: boolean;
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

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value),
      ),
    ),
  );
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

export const reverseGuardianPayment = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<ReverseGuardianPaymentResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input =
      request.data as ReverseGuardianPaymentInput;

    const orgId = requireNonEmptyString(
      input.orgId,
      "orgId",
    );

    const paymentId = requireNonEmptyString(
      input.paymentId,
      "paymentId",
    );

    const reversalReason = requireNonEmptyString(
      input.reversalReason,
      "reversalReason",
    );

    if (paymentId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "paymentId cannot contain '/'.",
      );
    }

    const db = getFirestore();

    const paymentRef = db.doc(
      `orgs/${orgId}/guardianPayments/${paymentId}`,
    );

    /*
     * قراءة تمهيدية لتحديد المستحقات والمدارس
     * المطلوبة للتحقق من صلاحيات المستخدم.
     */
    const preflightPaymentSnap = await paymentRef.get();

    if (!preflightPaymentSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Payment not found.",
      );
    }

    const preflightPaymentResult =
      GuardianPaymentSchema.safeParse({
        ...preflightPaymentSnap.data(),
        id: preflightPaymentSnap.id,
      });

    if (!preflightPaymentResult.success) {
      throw new HttpsError(
        "failed-precondition",
        "Payment data is invalid.",
      );
    }

    const preflightPayment = preflightPaymentResult.data;

    if (preflightPayment.orgId !== orgId) {
      throw new HttpsError(
        "permission-denied",
        "Payment organization mismatch.",
      );
    }

    if (preflightPayment.status !== "POSTED") {
      throw new HttpsError(
        "failed-precondition",
        "Only posted payments can be reversed.",
      );
    }

    const chargeIds = uniqueStrings(
      preflightPayment.allocations.map(
        (allocation) => allocation.chargeId,
      ),
    );

    const installmentIds = uniqueStrings(
      preflightPayment.allocations.map(
        (allocation) => allocation.installmentId,
      ),
    );

    const preflightChargeRefs = chargeIds.map((chargeId) =>
      db.doc(
        `orgs/${orgId}/studentFeeCharges/${chargeId}`,
      ),
    );

    const preflightChargeSnaps =
      preflightChargeRefs.length > 0
        ? await db.getAll(...preflightChargeRefs)
        : [];

    const preflightCharges: StudentFeeCharge[] =
      preflightChargeSnaps.map((snapshot) => {
        if (!snapshot.exists) {
          throw new HttpsError(
            "not-found",
            `Fee charge not found: ${snapshot.id}`,
          );
        }

        const result = StudentFeeChargeSchema.safeParse({
          ...snapshot.data(),
          id: snapshot.id,
        });

        if (!result.success) {
          throw new HttpsError(
            "failed-precondition",
            `Fee charge data is invalid: ${snapshot.id}`,
          );
        }

        return result.data;
      });

    const schoolIds = uniqueStrings(
      preflightCharges.map((charge) => charge.schoolId),
    );

    if (schoolIds.length === 0) {
      await requireGuardianFinanceAccess({
        uid,
        orgId,
        permission: "voidGuardianPayments",
      });
    } else {
      for (const schoolId of schoolIds) {
        await requireGuardianFinanceAccess({
          uid,
          orgId,
          schoolId,
          permission: "voidGuardianPayments",
        });
      }
    }

    const actor = await requireGuardianFinanceAccess({
      uid,
      orgId,
      schoolId: schoolIds[0],
      permission: "voidGuardianPayments",
    });

    const chargeRefs = chargeIds.map((chargeId) =>
      db.doc(
        `orgs/${orgId}/studentFeeCharges/${chargeId}`,
      ),
    );

    const installmentRefs = installmentIds.map(
      (installmentId) =>
        db.doc(
          `orgs/${orgId}/studentFeeInstallments/${installmentId}`,
        ),
    );

    const receiptRef = db.doc(
      `orgs/${orgId}/guardianPaymentReceipts/${paymentId}`,
    );

    const now = Date.now();

    try {
      return await db.runTransaction(async (transaction) => {
        /*
         * جميع القراءات تسبق أي كتابة.
         */
        const [
          paymentSnap,
          chargeSnaps,
          installmentSnaps,
          receiptSnap,
        ] = await Promise.all([
          transaction.get(paymentRef),

          Promise.all(
            chargeRefs.map((reference) =>
              transaction.get(reference),
            ),
          ),

          Promise.all(
            installmentRefs.map((reference) =>
              transaction.get(reference),
            ),
          ),

          transaction.get(receiptRef),
        ]);

        if (!paymentSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Payment not found.",
          );
        }

        const paymentResult =
          GuardianPaymentSchema.safeParse({
            ...paymentSnap.data(),
            id: paymentSnap.id,
          });

        if (!paymentResult.success) {
          throw new HttpsError(
            "failed-precondition",
            "Payment data is invalid.",
          );
        }

        const payment = paymentResult.data;

        if (payment.orgId !== orgId) {
          throw new HttpsError(
            "permission-denied",
            "Payment organization mismatch.",
          );
        }

        if (payment.status !== "POSTED") {
          throw new HttpsError(
            "failed-precondition",
            "Only posted payments can be reversed.",
          );
        }

        const charges = chargeSnaps.map((snapshot) => {
          if (!snapshot.exists) {
            throw new HttpsError(
              "not-found",
              `Fee charge not found: ${snapshot.id}`,
            );
          }

          const result =
            StudentFeeChargeSchema.safeParse({
              ...snapshot.data(),
              id: snapshot.id,
            });

          if (!result.success) {
            throw new HttpsError(
              "failed-precondition",
              `Fee charge data is invalid: ${snapshot.id}`,
            );
          }

          return result.data;
        });

        const installments = installmentSnaps.map(
          (snapshot) => {
            if (!snapshot.exists) {
              throw new HttpsError(
                "not-found",
                `Fee installment not found: ${snapshot.id}`,
              );
            }

            const result =
              StudentFeeInstallmentSchema.safeParse({
                ...snapshot.data(),
                id: snapshot.id,
              });

            if (!result.success) {
              throw new HttpsError(
                "failed-precondition",
                `Fee installment data is invalid: ${snapshot.id}`,
              );
            }

            return result.data;
          },
        );

        const reversalResult =
          reverseGuardianPaymentDomain({
            payment,
            charges,
            installments,

            reversedByPersonId: actor.personId,
            reversalReason,

            now,
          });

        const reversedPayment =
          GuardianPaymentSchema.parse(
            reversalResult.payment,
          );

        const reversedCharges =
          reversalResult.charges.map((charge) =>
            StudentFeeChargeSchema.parse(charge),
          );

        const reversedInstallments =
          reversalResult.installments.map(
            (installment) =>
              StudentFeeInstallmentSchema.parse(
                installment,
              ),
          );

        let receiptCancelled = false;

        if (receiptSnap.exists) {
          const receiptResult =
            GuardianPaymentReceiptSchema.safeParse({
              ...receiptSnap.data(),
              id: receiptSnap.id,
            });

          if (!receiptResult.success) {
            throw new HttpsError(
              "failed-precondition",
              "Payment receipt data is invalid.",
            );
          }

          const receipt = receiptResult.data;

          transaction.set(
            receiptRef,
            removeUndefined({
              ...receipt,
              status: "CANCELLED",
              cancelledAt: now,
              cancelledByPersonId: actor.personId,
              cancellationReason: reversalReason,
              updatedAt: now,
            }),
          );

          receiptCancelled = true;
        }

        transaction.set(
          paymentRef,
          removeUndefined(reversedPayment),
        );

        for (const charge of reversedCharges) {
          const chargeRef = db.doc(
            `orgs/${orgId}/studentFeeCharges/${charge.id}`,
          );

          transaction.set(
            chargeRef,
            removeUndefined(charge),
          );
        }

        for (const installment of reversedInstallments) {
          const installmentRef = db.doc(
            `orgs/${orgId}/studentFeeInstallments/${installment.id}`,
          );

          transaction.set(
            installmentRef,
            removeUndefined(installment),
          );
        }

        return {
          ok: true,
          paymentId: reversedPayment.id,
          status: "REVERSED",
          chargeIds: reversedCharges.map(
            (charge) => charge.id,
          ),
          installmentIds: reversedInstallments.map(
            (installment) => installment.id,
          ),
          receiptCancelled,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to reverse guardian payment.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);