import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GuardianPaymentAllocationSchema,
  GuardianPaymentReceiptSchema,
  GuardianPaymentSchema,
  StudentFeeChargeSchema,
  StudentFeeInstallmentSchema,
  type GuardianPaymentAllocation,
  type StudentFeeCharge,
  type StudentFeeInstallment,
} from "@takween/contracts";

import {
  postGuardianPayment as postGuardianPaymentDomain,
  updateGuardianPaymentAllocations,
} from "@takween/domain";

import { requireGuardianFinanceAccess } from "./finance-access";

const REGION = "me-central2";

type PostGuardianPaymentAllocationInput = {
  id?: unknown;
  studentId?: unknown;
  chargeId?: unknown;
  installmentId?: unknown;
  amountMinor?: unknown;
  note?: unknown;
};

type PostGuardianPaymentInput = {
  orgId?: unknown;
  paymentId?: unknown;
  allocations?: unknown;
};

type PostGuardianPaymentResult = {
  ok: true;
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  status: "POSTED";
  allocatedAmountMinor: number;
  chargeIds: string[];
  installmentIds: string[];
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

function readAllocations(params: {
  value: unknown;
  paymentId: string;
}): GuardianPaymentAllocation[] {
  if (!Array.isArray(params.value)) {
    throw new HttpsError(
      "invalid-argument",
      "allocations must be an array.",
    );
  }

  if (params.value.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one allocation is required.",
    );
  }

  if (params.value.length > 200) {
    throw new HttpsError(
      "invalid-argument",
      "allocations cannot exceed 200 items.",
    );
  }

  const allocationIds = new Set<string>();

  return params.value.map((rawItem, index) => {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      throw new HttpsError(
        "invalid-argument",
        `allocations[${index}] is invalid.`,
      );
    }

    const item =
      rawItem as PostGuardianPaymentAllocationInput;

    const studentId = requireNonEmptyString(
      item.studentId,
      `allocations[${index}].studentId`,
    );

    const chargeId = requireNonEmptyString(
      item.chargeId,
      `allocations[${index}].chargeId`,
    );

    const installmentId = optionalString(
      item.installmentId,
    );

    const amountMinor = requirePositiveInteger(
      item.amountMinor,
      `allocations[${index}].amountMinor`,
    );

    const allocationId =
      optionalString(item.id) ??
      `${params.paymentId}_allocation_${String(
        index + 1,
      ).padStart(3, "0")}`;

    if (allocationId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        `allocations[${index}].id cannot contain '/'.`,
      );
    }

    if (allocationIds.has(allocationId)) {
      throw new HttpsError(
        "invalid-argument",
        `Duplicate allocation id: ${allocationId}`,
      );
    }

    allocationIds.add(allocationId);

    const parsed =
      GuardianPaymentAllocationSchema.safeParse({
        id: allocationId,
        studentId,
        chargeId,
        installmentId,
        amountMinor,
        note: optionalString(item.note),
      });

    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        parsed.error.issues[0]?.message ??
          `allocations[${index}] is invalid.`,
      );
    }

    return parsed.data;
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalTimestamp(
  value: unknown,
): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function isGuardianLinkActive(
  data: Record<string, unknown>,
  now: number,
): boolean {
  if (data.active === false || data.isActive === false) {
    return false;
  }

  const startAt = readOptionalTimestamp(data.startAt);
  const endAt = readOptionalTimestamp(data.endAt);

  if (startAt !== undefined && startAt > now) {
    return false;
  }

  if (endAt !== undefined && endAt < now) {
    return false;
  }

  return true;
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export const postGuardianPayment = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<PostGuardianPaymentResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input = request.data as PostGuardianPaymentInput;

    const orgId = requireNonEmptyString(
      input.orgId,
      "orgId",
    );

    const paymentId = requireNonEmptyString(
      input.paymentId,
      "paymentId",
    );

    if (paymentId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "paymentId cannot contain '/'.",
      );
    }

    const allocations = readAllocations({
      value: input.allocations,
      paymentId,
    });

    const db = getFirestore();

    const paymentRef = db.doc(
      `orgs/${orgId}/guardianPayments/${paymentId}`,
    );

    /*
     * قراءة تمهيدية لمعرفة المدارس المطلوبة
     * والتحقق من صلاحيات المحصل قبل بدء Transaction.
     */
    const preflightPaymentSnap = await paymentRef.get();

    if (!preflightPaymentSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Payment draft not found.",
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
        "Payment draft data is invalid.",
      );
    }

    const preflightPayment = preflightPaymentResult.data;

    if (preflightPayment.orgId !== orgId) {
      throw new HttpsError(
        "permission-denied",
        "Payment organization mismatch.",
      );
    }

    if (preflightPayment.status !== "DRAFT") {
      throw new HttpsError(
        "failed-precondition",
        "Only draft payments can be posted.",
      );
    }

    const chargeIds = uniqueStrings(
      allocations.map((allocation) => allocation.chargeId),
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

    const now = Date.now();

    try {
      return await db.runTransaction(async (transaction) => {
        const chargeRefs = chargeIds.map((chargeId) =>
          db.doc(
            `orgs/${orgId}/studentFeeCharges/${chargeId}`,
          ),
        );

        const installmentIds = uniqueStrings(
          allocations
            .map(
              (allocation) => allocation.installmentId ?? "",
            )
            .filter(Boolean),
        );

        const installmentRefs = installmentIds.map(
          (installmentId) =>
            db.doc(
              `orgs/${orgId}/studentFeeInstallments/${installmentId}`,
            ),
        );

        const guardianLinksQuery = db
          .collection(`orgs/${orgId}/guardianLinks`)
          .where(
            "guardianId",
            "==",
            preflightPayment.guardianId,
          );

        /*
         * جميع القراءات تتم قبل أي كتابة.
         */
        const [
          paymentSnap,
          chargeSnaps,
          installmentSnaps,
          guardianLinksSnap,
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
          transaction.get(guardianLinksQuery),
        ]);

        if (!paymentSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Payment draft not found.",
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
            "Payment draft data is invalid.",
          );
        }

        const payment = paymentResult.data;

        if (payment.orgId !== orgId) {
          throw new HttpsError(
            "permission-denied",
            "Payment organization mismatch.",
          );
        }

        if (payment.status !== "DRAFT") {
          throw new HttpsError(
            "failed-precondition",
            "Only draft payments can be posted.",
          );
        }

        const charges = chargeSnaps.map((snapshot) => {
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

        const chargeMap = new Map(
          charges.map((charge) => [charge.id, charge]),
        );

        const installmentMap = new Map(
          installments.map((installment) => [
            installment.id,
            installment,
          ]),
        );

        const linkedStudentIds = new Set(
          guardianLinksSnap.docs
            .filter((document) =>
              isGuardianLinkActive(document.data(), now),
            )
            .map((document) =>
              readString(document.data().studentId),
            )
            .filter(Boolean),
        );

        const enrichedAllocations =
          allocations.map((allocation) => {
            const charge = chargeMap.get(
              allocation.chargeId,
            );

            if (!charge) {
              throw new HttpsError(
                "not-found",
                `Fee charge not found: ${allocation.chargeId}`,
              );
            }

            if (charge.orgId !== orgId) {
              throw new HttpsError(
                "permission-denied",
                "Fee charge organization mismatch.",
              );
            }

            if (
              charge.studentId !== allocation.studentId
            ) {
              throw new HttpsError(
                "failed-precondition",
                `Allocation ${allocation.id} student does not match its fee charge.`,
              );
            }

            if (
              !linkedStudentIds.has(allocation.studentId)
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Guardian is not actively linked to one of the allocated students.",
              );
            }

            if (
              charge.currency !== payment.currency
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Payment and fee charge currencies do not match.",
              );
            }

            if (allocation.installmentId) {
              const installment = installmentMap.get(
                allocation.installmentId,
              );

              if (!installment) {
                throw new HttpsError(
                  "not-found",
                  `Fee installment not found: ${allocation.installmentId}`,
                );
              }

              if (installment.chargeId !== charge.id) {
                throw new HttpsError(
                  "failed-precondition",
                  "The installment does not belong to the selected fee charge.",
                );
              }

              if (
                installment.studentId !==
                allocation.studentId
              ) {
                throw new HttpsError(
                  "failed-precondition",
                  "The installment student does not match the allocation student.",
                );
              }
            }

            return GuardianPaymentAllocationSchema.parse({
              ...allocation,
              studentPersonId:
                allocation.studentPersonId ??
                charge.studentPersonId,
              studentDisplayName:
                allocation.studentDisplayName ??
                charge.studentDisplayName,
            });
          });

        const paymentWithAllocations =
          updateGuardianPaymentAllocations({
            payment,
            allocations: enrichedAllocations,
            now,
          });

        const postingResult =
          postGuardianPaymentDomain({
            payment: paymentWithAllocations,
            charges,
            installments,
            now,
          });

        const postedPayment =
          GuardianPaymentSchema.parse({
            ...postingResult.payment,
            collectedByPersonId:
              postingResult.payment
                .collectedByPersonId ||
              actor.personId,
            collectedByRoleKey:
              postingResult.payment
                .collectedByRoleKey ||
              actor.roleKey ||
              undefined,
          });

        const postedCharges =
          postingResult.charges.map((charge) =>
            StudentFeeChargeSchema.parse(charge),
          );

        const postedInstallments =
          postingResult.installments.map(
            (installment) =>
              StudentFeeInstallmentSchema.parse(
                installment,
              ),
          );

        const receiptId = payment.id;
        const receiptRef = db.doc(
          `orgs/${orgId}/guardianPaymentReceipts/${receiptId}`,
        );

        const existingReceiptSnap =
          await transaction.get(receiptRef);

        if (existingReceiptSnap.exists) {
          throw new HttpsError(
            "already-exists",
            "A receipt already exists for this payment.",
          );
        }

        const receipt =
          GuardianPaymentReceiptSchema.parse({
            id: receiptId,
            orgId,

            paymentId: postedPayment.id,

            guardianId: postedPayment.guardianId,
            guardianPersonId:
              postedPayment.guardianPersonId,
            guardianDisplayName:
              postedPayment.guardianDisplayName,

            receiptNumber:
              postedPayment.receiptNumber,

            status: "ISSUED",

            currency: postedPayment.currency,
            amountMinor: postedPayment.amountMinor,

            issuedAt: now,
            issuedByPersonId: actor.personId,
            issuedByRoleKey:
              actor.roleKey || undefined,

            createdAt: now,
            updatedAt: now,
          });

        /*
         * الكتابات تبدأ بعد انتهاء كل القراءات.
         */
        transaction.set(
          paymentRef,
          removeUndefined(postedPayment),
        );

        for (const charge of postedCharges) {
          const chargeRef = db.doc(
            `orgs/${orgId}/studentFeeCharges/${charge.id}`,
          );

          transaction.set(
            chargeRef,
            removeUndefined(charge),
          );
        }

        for (const installment of postedInstallments) {
          const installmentRef = db.doc(
            `orgs/${orgId}/studentFeeInstallments/${installment.id}`,
          );

          transaction.set(
            installmentRef,
            removeUndefined(installment),
          );
        }

        transaction.create(
          receiptRef,
          removeUndefined(receipt),
        );

        return {
          ok: true,
          paymentId: postedPayment.id,
          receiptId: receipt.id,
          receiptNumber: receipt.receiptNumber,
          status: "POSTED",
          allocatedAmountMinor:
            postedPayment.allocatedAmountMinor,
          chargeIds: postedCharges.map(
            (charge) => charge.id,
          ),
          installmentIds: postedInstallments.map(
            (installment) => installment.id,
          ),
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to post guardian payment.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);