import { getFirestore } from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

const REGION = "me-central2";

type DataRow = {
  id: string;
  [key: string]: unknown;
};

type FinanceSummary = {
  currency: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  balanceAmountMinor: number;
  overdueAmountMinor: number;
  chargeCount: number;
};

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError(
      "invalid-argument",
      `Missing or invalid field: ${fieldName}`,
    );
  }

  return value.trim();
}

function readString(
  data: Record<string, unknown> | undefined,
  keys: string[],
): string {
  if (!data) return "";

  for (const key of keys) {
    const value = data[key];

    if (
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      return value.trim();
    }
  }

  return "";
}

function readNumber(
  data: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!data) return undefined;

  for (const key of keys) {
    const value = data[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }
  }

  return undefined;
}

function readBoolean(
  data: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = data?.[key];

  return typeof value === "boolean"
    ? value
    : undefined;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (
      value as {
        toMillis?: unknown;
      }
    ).toMillis === "function"
  ) {
    return (
      value as {
        toMillis: () => number;
      }
    ).toMillis();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      ).map(([key, item]) => [
        key,
        normalizeValue(item),
      ]),
    );
  }

  return value;
}

function toRow(
  id: string,
  data: Record<string, unknown> | undefined,
): DataRow {
  const normalized = normalizeValue(
    data ?? {},
  ) as Record<string, unknown>;

  return {
    ...normalized,
    id,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.filter((value) => value.length > 0)),
  );
}

function chunkArray<T>(
  values: T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function queryRowsByChunks(params: {
  collectionPath: string;
  field: string;
  values: string[];
}): Promise<DataRow[]> {
  const db = getFirestore();

  const values = uniqueStrings(params.values);

  if (values.length === 0) {
    return [];
  }

  const rows: DataRow[] = [];

  for (const chunk of chunkArray(values, 30)) {
    const snapshot = await db
      .collection(params.collectionPath)
      .where(params.field, "in", chunk)
      .get();

    for (const document of snapshot.docs) {
      rows.push(
        toRow(
          document.id,
          document.data() as Record<string, unknown>,
        ),
      );
    }
  }

  return rows;
}

async function loadRowsByIds(params: {
  collectionPath: string;
  ids: string[];
}): Promise<DataRow[]> {
  const db = getFirestore();

  const ids = uniqueStrings(params.ids);

  if (ids.length === 0) {
    return [];
  }

  const snapshots = await db.getAll(
    ...ids.map((id) =>
      db.doc(`${params.collectionPath}/${id}`),
    ),
  );

  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) =>
      toRow(
        snapshot.id,
        snapshot.data() as
          | Record<string, unknown>
          | undefined,
      ),
    );
}

function isGuardianLinkActive(
  link: DataRow,
  now: number,
): boolean {
  if (link.active === false) {
    return false;
  }

  const startsAt = readNumber(link, ["startAt"]);
  const endsAt = readNumber(link, ["endAt"]);

  if (startsAt !== undefined && startsAt > now) {
    return false;
  }

  if (endsAt !== undefined && endsAt < now) {
    return false;
  }

  return true;
}

function isGuardianVisibleCharge(
  charge: DataRow,
): boolean {
  if (
    readBoolean(charge, "isGuardianVisible") === false
  ) {
    return false;
  }

  const status = readString(charge, ["status"]);

  return !["DRAFT", "CANCELLED"].includes(status);
}

function calculateChargeBalance(
  charge: DataRow,
): number {
  const status = readString(charge, ["status"]);

  if (status === "WAIVED") {
    return 0;
  }

  const netAmountMinor =
    readNumber(charge, [
      "netAmountMinor",
      "amountMinor",
    ]) ?? 0;

  const paidAmountMinor =
    readNumber(charge, ["paidAmountMinor"]) ?? 0;

  const storedBalance = readNumber(charge, [
    "balanceAmountMinor",
    "remainingAmountMinor",
  ]);

  return Math.max(
    storedBalance ??
      netAmountMinor - paidAmountMinor,
    0,
  );
}

function buildSummary(params: {
  charges: DataRow[];
  fallbackCurrency: string;
  now: number;
}): FinanceSummary {
  let totalAmountMinor = 0;
  let paidAmountMinor = 0;
  let balanceAmountMinor = 0;
  let overdueAmountMinor = 0;

  let currency = params.fallbackCurrency;

  for (const charge of params.charges) {
    const chargeCurrency = readString(charge, [
      "currency",
    ]);

    if (chargeCurrency) {
      currency = chargeCurrency;
    }

    const netAmount =
      readNumber(charge, [
        "netAmountMinor",
        "amountMinor",
      ]) ?? 0;

    const paidAmount =
      readNumber(charge, ["paidAmountMinor"]) ?? 0;

    const balance = calculateChargeBalance(charge);

    totalAmountMinor += netAmount;
    paidAmountMinor += paidAmount;
    balanceAmountMinor += balance;

    const dueAt = readNumber(charge, ["dueAt"]);
    const status = readString(charge, ["status"]);

    if (
      dueAt !== undefined &&
      dueAt < params.now &&
      balance > 0 &&
      !["PAID", "WAIVED", "CANCELLED"].includes(
        status,
      )
    ) {
      overdueAmountMinor += balance;
    }
  }

  return {
    currency,
    totalAmountMinor,
    paidAmountMinor,
    balanceAmountMinor,
    overdueAmountMinor,
    chargeCount: params.charges.length,
  };
}

function toPublicCharge(charge: DataRow) {
  const netAmountMinor =
    readNumber(charge, [
      "netAmountMinor",
      "amountMinor",
    ]) ?? 0;

  const paidAmountMinor =
    readNumber(charge, ["paidAmountMinor"]) ?? 0;

  return {
    id: charge.id,

    schoolId: readString(charge, ["schoolId"]),
    academicYearId: readString(charge, [
      "academicYearId",
    ]),

    termId: readString(charge, ["termId"]),
    termTitle: readString(charge, ["termTitle"]),
    termShortTitle: readString(charge, [
      "termShortTitle",
    ]),

    studentId: readString(charge, ["studentId"]),
    studentDisplayName: readString(charge, [
      "studentDisplayName",
    ]),

    feeDefinitionId: readString(charge, [
      "feeDefinitionId",
    ]),

    category: readString(charge, ["category"]),
    title: readString(charge, ["title"]),
    description: readString(charge, [
      "description",
    ]),

    currency:
      readString(charge, ["currency"]) || "SAR",

    originalAmountMinor:
      readNumber(charge, [
        "originalAmountMinor",
      ]) ?? netAmountMinor,

    discountAmountMinor:
      readNumber(charge, [
        "discountAmountMinor",
      ]) ?? 0,

    adjustmentAmountMinor:
      readNumber(charge, [
        "adjustmentAmountMinor",
      ]) ?? 0,

    netAmountMinor,
    paidAmountMinor,
    balanceAmountMinor:
      calculateChargeBalance(charge),

    status: readString(charge, ["status"]),

    dueAt: readNumber(charge, ["dueAt"]),
    createdAt: readNumber(charge, ["createdAt"]),
    updatedAt: readNumber(charge, ["updatedAt"]),
  };
}

function toPublicInstallment(
  installment: DataRow,
  studentIdByChargeId: Map<string, string>,
) {
  const chargeId = readString(installment, [
    "chargeId",
  ]);

  const amountMinor =
    readNumber(installment, [
      "amountMinor",
      "netAmountMinor",
    ]) ?? 0;

  const paidAmountMinor =
    readNumber(installment, [
      "paidAmountMinor",
    ]) ?? 0;

  const storedBalance = readNumber(installment, [
    "balanceAmountMinor",
    "remainingAmountMinor",
  ]);

  return {
    id: installment.id,
    chargeId,

    studentId:
      readString(installment, ["studentId"]) ||
      studentIdByChargeId.get(chargeId) ||
      "",

    sequence:
      readNumber(installment, [
        "sequence",
        "installmentNumber",
        "order",
      ]) ?? 0,

    title: readString(installment, ["title"]),

    currency:
      readString(installment, ["currency"]) ||
      "SAR",

    amountMinor,
    paidAmountMinor,

    balanceAmountMinor: Math.max(
      storedBalance ??
        amountMinor - paidAmountMinor,
      0,
    ),

    status: readString(installment, ["status"]),
    dueAt: readNumber(installment, ["dueAt"]),

    createdAt: readNumber(installment, [
      "createdAt",
    ]),

    updatedAt: readNumber(installment, [
      "updatedAt",
    ]),
  };
}

function toPublicAllocation(value: unknown) {
  const allocation =
    value &&
    typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    studentId: readString(allocation, [
      "studentId",
    ]),

    chargeId: readString(allocation, [
      "chargeId",
    ]),

    installmentId: readString(allocation, [
      "installmentId",
    ]),

    amountMinor:
      readNumber(allocation, [
        "amountMinor",
        "allocatedAmountMinor",
      ]) ?? 0,
  };
}

function toPublicPayment(payment: DataRow) {
  const allocations = Array.isArray(
    payment.allocations,
  )
    ? payment.allocations.map(toPublicAllocation)
    : [];

  return {
    id: payment.id,

    receiptNumber: readString(payment, [
      "receiptNumber",
    ]),

    currency:
      readString(payment, ["currency"]) || "SAR",

    amountMinor:
      readNumber(payment, ["amountMinor"]) ?? 0,

    paymentMethod: readString(payment, [
      "paymentMethod",
    ]),

    status: readString(payment, ["status"]),

    paidAt: readNumber(payment, ["paidAt"]),
    postedAt: readNumber(payment, ["postedAt"]),

    reversedAt: readNumber(payment, [
      "reversedAt",
      "voidedAt",
    ]),

    reversalReason: readString(payment, [
      "reversalReason",
      "voidReason",
    ]),

    allocations,
  };
}

function toPublicReceipt(receipt: DataRow) {
  return {
    id: receipt.id,

    paymentId: readString(receipt, [
      "paymentId",
    ]),

    receiptNumber: readString(receipt, [
      "receiptNumber",
    ]),

    status: readString(receipt, ["status"]),

    currency:
      readString(receipt, ["currency"]) || "SAR",

    amountMinor:
      readNumber(receipt, ["amountMinor"]) ?? 0,

    issuedAt: readNumber(receipt, ["issuedAt"]),

    cancelledAt: readNumber(receipt, [
      "cancelledAt",
    ]),

    cancelReason: readString(receipt, [
      "cancelReason",
    ]),
  };
}

function selectActiveEnrollment(
  rows: DataRow[],
): DataRow | undefined {
  return [...rows].sort((left, right) => {
    const leftActive =
      readString(left, ["status"]) === "ACTIVE"
        ? 1
        : 0;

    const rightActive =
      readString(right, ["status"]) === "ACTIVE"
        ? 1
        : 0;

    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    return (
      (readNumber(right, [
        "updatedAt",
        "startAt",
      ]) ?? 0) -
      (readNumber(left, [
        "updatedAt",
        "startAt",
      ]) ?? 0)
    );
  })[0];
}

export const getMyGuardianFinanceOverview =
  onCall(
    {
      region: REGION,
      cors: true,
      invoker: "public",
    },
    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError(
          "unauthenticated",
          "يجب تسجيل الدخول.",
        );
      }

      const input =
        request.data &&
        typeof request.data === "object"
          ? (request.data as Record<
              string,
              unknown
            >)
          : {};

      const orgId = requireNonEmptyString(
        input.orgId,
        "orgId",
      );

      const uid = request.auth.uid;
      const db = getFirestore();
      const now = Date.now();

      const orgRef = db.doc(`orgs/${orgId}`);
      const userRef = db.doc(`users/${uid}`);

      const [orgSnapshot, userSnapshot] =
        await Promise.all([
          orgRef.get(),
          userRef.get(),
        ]);

      if (!orgSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "المؤسسة غير موجودة.",
        );
      }

      if (!userSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "حساب المستخدم غير مرتبط بملف مستخدم.",
        );
      }

      const userData =
        userSnapshot.data() as
          | Record<string, unknown>
          | undefined;

      const personId = readString(userData, [
        "personId",
      ]);

      if (!personId) {
        throw new HttpsError(
          "failed-precondition",
          "حساب ولي الأمر غير مرتبط بسجل شخص.",
        );
      }

      const guardiansSnapshot = await db
        .collection(`orgs/${orgId}/guardians`)
        .where("personId", "==", personId)
        .limit(10)
        .get();

      const guardians = guardiansSnapshot.docs
        .map((document) =>
          toRow(
            document.id,
            document.data() as Record<
              string,
              unknown
            >,
          ),
        )
        .filter(
          (guardian) =>
            guardian.isArchived !== true,
        );

      const guardian = guardians[0];

      if (!guardian) {
        throw new HttpsError(
          "failed-precondition",
          "لم يتم العثور على سجل ولي الأمر.",
        );
      }

      const linksSnapshot = await db
        .collection(`orgs/${orgId}/guardianLinks`)
        .where("guardianId", "==", guardian.id)
        .get();

      const guardianLinks = linksSnapshot.docs
        .map((document) =>
          toRow(
            document.id,
            document.data() as Record<
              string,
              unknown
            >,
          ),
        )
        .filter((link) =>
          isGuardianLinkActive(link, now),
        );

      const linkedStudentIds = uniqueStrings(
        guardianLinks.map((link) =>
          readString(link, ["studentId"]),
        ),
      );

      const studentRows = (
        await loadRowsByIds({
          collectionPath: `orgs/${orgId}/students`,
          ids: linkedStudentIds,
        })
      ).filter(
        (student) =>
          student.isArchived !== true,
      );

      const studentIds = studentRows.map(
        (student) => student.id,
      );

      const studentPersonIds = uniqueStrings(
        studentRows.map((student) =>
          readString(student, ["personId"]),
        ),
      );

      const [
        studentPeople,
        enrollments,
        chargeRows,
      ] = await Promise.all([
        loadRowsByIds({
          collectionPath: `orgs/${orgId}/people`,
          ids: studentPersonIds,
        }),

        queryRowsByChunks({
          collectionPath: `orgs/${orgId}/studentEnrollments`,
          field: "studentId",
          values: studentIds,
        }),

        queryRowsByChunks({
          collectionPath: `orgs/${orgId}/studentFeeCharges`,
          field: "studentId",
          values: studentIds,
        }),
      ]);

      const visibleCharges = chargeRows
        .filter(isGuardianVisibleCharge)
        .sort((left, right) => {
          const leftDue =
            readNumber(left, ["dueAt"]) ??
            Number.MAX_SAFE_INTEGER;

          const rightDue =
            readNumber(right, ["dueAt"]) ??
            Number.MAX_SAFE_INTEGER;

          return leftDue - rightDue;
        });

      const chargeIds = visibleCharges.map(
        (charge) => charge.id,
      );

      const installmentRows =
        await queryRowsByChunks({
          collectionPath: `orgs/${orgId}/studentFeeInstallments`,
          field: "chargeId",
          values: chargeIds,
        });

      const paymentsSnapshot = await db
        .collection(`orgs/${orgId}/guardianPayments`)
        .where("guardianId", "==", guardian.id)
        .get();

      const paymentRows =
        paymentsSnapshot.docs
          .map((document) =>
            toRow(
              document.id,
              document.data() as Record<
                string,
                unknown
              >,
            ),
          )
          .filter((payment) => {
            const status = readString(payment, [
              "status",
            ]);

            return status !== "DRAFT";
          })
          .sort(
            (left, right) =>
              (readNumber(right, [
                "paidAt",
                "postedAt",
                "createdAt",
              ]) ?? 0) -
              (readNumber(left, [
                "paidAt",
                "postedAt",
                "createdAt",
              ]) ?? 0),
          );

      const paymentIds = paymentRows.map(
        (payment) => payment.id,
      );

      const receiptRows =
        await queryRowsByChunks({
          collectionPath: `orgs/${orgId}/guardianFinanceReceipts`,
          field: "paymentId",
          values: paymentIds,
        });

      const peopleById = new Map(
        studentPeople.map((person) => [
          person.id,
          person,
        ]),
      );

      const enrollmentsByStudentId =
        new Map<string, DataRow[]>();

      for (const enrollment of enrollments) {
        const studentId = readString(enrollment, [
          "studentId",
        ]);

        if (!studentId) continue;

        const current =
          enrollmentsByStudentId.get(studentId) ??
          [];

        current.push(enrollment);

        enrollmentsByStudentId.set(
          studentId,
          current,
        );
      }

      const relationByStudentId = new Map<
        string,
        string
      >();

      for (const link of guardianLinks) {
        const studentId = readString(link, [
          "studentId",
        ]);

        if (!studentId) continue;

        relationByStudentId.set(
          studentId,
          readString(link, [
            "relationType",
          ]) || "OTHER",
        );
      }

      const chargesByStudentId = new Map<
        string,
        DataRow[]
      >();

      for (const charge of visibleCharges) {
        const studentId = readString(charge, [
          "studentId",
        ]);

        if (!studentId) continue;

        const current =
          chargesByStudentId.get(studentId) ??
          [];

        current.push(charge);

        chargesByStudentId.set(
          studentId,
          current,
        );
      }

      const installmentsByChargeId = new Map<
        string,
        DataRow[]
      >();

      for (const installment of installmentRows) {
        const chargeId = readString(installment, [
          "chargeId",
        ]);

        if (!chargeId) continue;

        const current =
          installmentsByChargeId.get(chargeId) ??
          [];

        current.push(installment);

        installmentsByChargeId.set(
          chargeId,
          current,
        );
      }

      const orgData =
        orgSnapshot.data() as
          | Record<string, unknown>
          | undefined;

      const locale =
        orgData?.locale &&
        typeof orgData.locale === "object"
          ? (orgData.locale as Record<
              string,
              unknown
            >)
          : undefined;

      const fallbackCurrency =
        readString(locale, ["currency"]) || "SAR";

      const children = studentRows.map(
        (student) => {
          const studentPersonId = readString(
            student,
            ["personId"],
          );

          const person =
            peopleById.get(studentPersonId);

          const enrollment =
            selectActiveEnrollment(
              enrollmentsByStudentId.get(
                student.id,
              ) ?? [],
            );

          const studentCharges =
            chargesByStudentId.get(student.id) ??
            [];

          const studentChargeIds =
            studentCharges.map(
              (charge) => charge.id,
            );

          const studentInstallments =
            studentChargeIds.flatMap(
              (chargeId) =>
                installmentsByChargeId.get(
                  chargeId,
                ) ?? [],
            );

          const studentIdByChargeId = new Map(
            studentCharges.map((charge) => [
              charge.id,
              student.id,
            ]),
          );

          return {
            student: {
              id: student.id,
              personId: studentPersonId,

              displayName:
                readString(person, [
                  "displayName",
                ]) ||
                readString(student, [
                  "studentDisplayName",
                  "displayName",
                ]) ||
                student.id,

              relationType:
                relationByStudentId.get(
                  student.id,
                ) ?? "OTHER",
            },

            enrollment: enrollment
              ? {
                  id: enrollment.id,

                  schoolId: readString(
                    enrollment,
                    ["schoolId"],
                  ),

                  academicYearId: readString(
                    enrollment,
                    ["academicYearId"],
                  ),

                  gradeId: readString(
                    enrollment,
                    ["gradeId"],
                  ),

                  classId: readString(
                    enrollment,
                    ["classId"],
                  ),

                  streamId: readString(
                    enrollment,
                    ["streamId"],
                  ),

                  status: readString(
                    enrollment,
                    ["status"],
                  ),
                }
              : null,

            summary: buildSummary({
              charges: studentCharges,
              fallbackCurrency,
              now,
            }),

            charges:
              studentCharges.map(toPublicCharge),

            installments:
              studentInstallments
                .map((installment) =>
                  toPublicInstallment(
                    installment,
                    studentIdByChargeId,
                  ),
                )
                .sort(
                  (left, right) =>
                    (left.dueAt ??
                      Number.MAX_SAFE_INTEGER) -
                    (right.dueAt ??
                      Number.MAX_SAFE_INTEGER),
                ),
          };
        },
      );

      const guardianPersonSnapshot =
        await db
          .doc(
            `orgs/${orgId}/people/${personId}`,
          )
          .get();

      const guardianPerson =
        guardianPersonSnapshot.exists
          ? toRow(
              guardianPersonSnapshot.id,
              guardianPersonSnapshot.data() as
                | Record<string, unknown>
                | undefined,
            )
          : undefined;

      return {
        ok: true,

        guardian: {
          id: guardian.id,
          personId,

          displayName:
            readString(guardianPerson, [
              "displayName",
            ]) ||
            readString(userData, [
              "displayName",
            ]) ||
            "ولي الأمر",
        },

        summary: buildSummary({
          charges: visibleCharges,
          fallbackCurrency,
          now,
        }),

        children,

        payments: paymentRows.map(
          toPublicPayment,
        ),

        receipts: receiptRows
          .map(toPublicReceipt)
          .sort(
            (left, right) =>
              (right.issuedAt ?? 0) -
              (left.issuedAt ?? 0),
          ),

        generatedAt: now,
      };
    },
  );