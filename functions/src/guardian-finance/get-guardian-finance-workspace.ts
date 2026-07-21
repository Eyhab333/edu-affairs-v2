import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  GuardianLinkSchema,
  GuardianPaymentReceiptSchema,
  GuardianPaymentSchema,
  StudentFeeChargeSchema,
  StudentFeeInstallmentSchema,
  type GuardianLink,
  type GuardianPayment,
  type StudentFeeCharge,
  type StudentFeeInstallment,
  type StudentFinanceSummary,
} from "@takween/contracts";

import {
  buildGuardianFinanceSummary,
  buildStudentFinanceSummary,
} from "@takween/domain";

import { requireGuardianFinanceAccess } from "./finance-access";

const REGION = "me-central2";

type GetGuardianFinanceWorkspaceInput = {
  orgId?: unknown;

  query?: unknown;
  guardianId?: unknown;
  studentId?: unknown;

  schoolId?: unknown;
  academicYearId?: unknown;
  termId?: unknown;

  limit?: unknown;
};

type FinanceSearchResult = {
  kind: "GUARDIAN" | "STUDENT";
  id: string;
  personId: string;
  displayName: string;
  nationalId: string;
  phone: string;
};

type GuardianFinanceWorkspaceResult = {
  ok: true;

  searchResults: FinanceSearchResult[];

  workspace?: {
    guardian: {
      id: string;
      personId: string;
      displayName: string;
      nationalId: string;
      phone: string;
    };

    guardianLinks: GuardianLink[];

    students: Array<{
      id: string;
      personId: string;
      displayName: string;
      nationalId: string;
    }>;

    charges: StudentFeeCharge[];
    installments: StudentFeeInstallment[];
    payments: GuardianPayment[];
    receipts: Array<
      ReturnType<typeof GuardianPaymentReceiptSchema.parse>
    >;

    studentSummaries: StudentFinanceSummary[];
    summary: ReturnType<
      typeof buildGuardianFinanceSummary
    >;
  };
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

function readLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return 15;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "limit must be a positive integer.",
    );
  }

  return Math.min(value, 30);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readTimestamp(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function readPersonFields(
  data: Record<string, unknown> | undefined,
  fallback: string,
) {
  return {
    displayName:
      readString(data?.displayName) ||
      readString(data?.fullName) ||
      readString(data?.name) ||
      fallback,

    nationalId: readString(data?.nationalId),

    phone:
      readString(data?.phone) ||
      readString(data?.mobile) ||
      readString(data?.phoneNumber),
  };
}

function isGuardianLinkActive(
  link: GuardianLink,
  now: number,
): boolean {
  if (link.active === false) return false;

  if (
    typeof link.startAt === "number" &&
    link.startAt > now
  ) {
    return false;
  }

  if (
    typeof link.endAt === "number" &&
    link.endAt < now
  ) {
    return false;
  }

  return true;
}

function uniqueStrings(
  values: Array<string | undefined>,
): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value),
      ),
    ),
  );
}

function chunkArray<T>(
  items: T[],
  chunkSize = 30,
): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function toJsonSafe<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (item === undefined) continue;

      result[key] = toJsonSafe(item);
    }

    return result as T;
  }

  return value;
}

async function searchFinanceDirectory(params: {
  orgId: string;
  query?: string;
  limit: number;
}): Promise<FinanceSearchResult[]> {
  if (!params.query || params.query.length < 2) {
    return [];
  }

  const db = getFirestore();

  const peopleRef = db.collection(
    `orgs/${params.orgId}/people`,
  );

  const queryText = params.query;

  const querySnapshots = await Promise.all([
    peopleRef
      .where("nationalId", "==", queryText)
      .limit(params.limit)
      .get(),

    peopleRef
      .where("phone", "==", queryText)
      .limit(params.limit)
      .get(),

    peopleRef
      .orderBy("displayName")
      .startAt(queryText)
      .endAt(`${queryText}\uf8ff`)
      .limit(params.limit)
      .get(),
  ]);

  const peopleMap = new Map<
    string,
    Record<string, unknown>
  >();

  for (const snapshot of querySnapshots) {
    for (const document of snapshot.docs) {
      peopleMap.set(document.id, {
        ...document.data(),
        id: document.id,
      });
    }
  }

  const personIds = Array.from(peopleMap.keys()).slice(
    0,
    params.limit,
  );

  if (personIds.length === 0) {
    return [];
  }

  const studentDocs = [];
  const guardianDocs = [];

  for (const personIdChunk of chunkArray(personIds)) {
    const [studentsSnap, guardiansSnap] =
      await Promise.all([
        db
          .collection(`orgs/${params.orgId}/students`)
          .where("personId", "in", personIdChunk)
          .get(),

        db
          .collection(`orgs/${params.orgId}/guardians`)
          .where("personId", "in", personIdChunk)
          .get(),
      ]);

    studentDocs.push(...studentsSnap.docs);
    guardianDocs.push(...guardiansSnap.docs);
  }

  const results: FinanceSearchResult[] = [];

  for (const guardianDoc of guardianDocs) {
    const guardianData = guardianDoc.data();

    if (guardianData.isArchived === true) continue;

    const personId = readString(guardianData.personId);
    const personData = peopleMap.get(personId);
    const person = readPersonFields(
      personData,
      guardianDoc.id,
    );

    results.push({
      kind: "GUARDIAN",
      id: guardianDoc.id,
      personId,
      displayName: person.displayName,
      nationalId: person.nationalId,
      phone: person.phone,
    });
  }

  for (const studentDoc of studentDocs) {
    const studentData = studentDoc.data();

    if (studentData.isArchived === true) continue;

    const personId = readString(studentData.personId);
    const personData = peopleMap.get(personId);
    const person = readPersonFields(
      personData,
      studentDoc.id,
    );

    results.push({
      kind: "STUDENT",
      id: studentDoc.id,
      personId,
      displayName: person.displayName,
      nationalId: person.nationalId,
      phone: person.phone,
    });
  }

  return results
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "GUARDIAN" ? -1 : 1;
      }

      return a.displayName.localeCompare(
        b.displayName,
        "ar",
      );
    })
    .slice(0, params.limit);
}

export const getGuardianFinanceWorkspace = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<GuardianFinanceWorkspaceResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input =
      request.data as GetGuardianFinanceWorkspaceInput;

    const orgId = requireNonEmptyString(
      input.orgId,
      "orgId",
    );

    const query = optionalString(input.query);
    const requestedGuardianId = optionalString(
      input.guardianId,
    );
    const requestedStudentId = optionalString(
      input.studentId,
    );

    const schoolId = optionalString(input.schoolId);
    const academicYearId = optionalString(
      input.academicYearId,
    );
    const termId = optionalString(input.termId);

    const limit = readLimit(input.limit);

    await requireGuardianFinanceAccess({
      uid,
      orgId,
      schoolId,
      permission: "viewGuardianFinance",
    });

    const searchResults = await searchFinanceDirectory({
      orgId,
      query,
      limit,
    });

    if (!requestedGuardianId && !requestedStudentId) {
      return {
        ok: true,
        searchResults,
      };
    }

    const db = getFirestore();
    const now = Date.now();

    let guardianId = requestedGuardianId;

    /*
     * عند فتح الطالب مباشرة، نحدد ولي الأمر
     * من الروابط الفعالة.
     */
    if (!guardianId && requestedStudentId) {
      const linksSnap = await db
        .collection(`orgs/${orgId}/guardianLinks`)
        .where("studentId", "==", requestedStudentId)
        .get();

      const activeLinks = linksSnap.docs
        .map((document) => {
          return GuardianLinkSchema.safeParse({
            ...document.data(),
            id: document.id,
          });
        })
        .filter((result) => result.success)
        .map((result) => result.data)
        .filter((link) =>
          isGuardianLinkActive(link, now),
        )
        .sort((a, b) => {
          const relationOrder = {
            FATHER: 0,
            MOTHER: 1,
            OTHER: 2,
          };

          return (
            relationOrder[a.relationType] -
            relationOrder[b.relationType]
          );
        });

      guardianId = activeLinks[0]?.guardianId;
    }

    if (!guardianId) {
      throw new HttpsError(
        "failed-precondition",
        "No active guardian link was found for this student.",
      );
    }

    const guardianRef = db.doc(
      `orgs/${orgId}/guardians/${guardianId}`,
    );

    const [guardianSnap, guardianLinksSnap, orgSnap] =
      await Promise.all([
        guardianRef.get(),

        db
          .collection(`orgs/${orgId}/guardianLinks`)
          .where("guardianId", "==", guardianId)
          .get(),

        db.doc(`orgs/${orgId}`).get(),
      ]);

    if (!guardianSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Guardian not found.",
      );
    }

    const guardianData = guardianSnap.data() ?? {};

    if (guardianData.isArchived === true) {
      throw new HttpsError(
        "failed-precondition",
        "Guardian is archived.",
      );
    }

    const guardianLinks = guardianLinksSnap.docs
      .map((document) => {
        return GuardianLinkSchema.safeParse({
          ...document.data(),
          id: document.id,
        });
      })
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((link) =>
        isGuardianLinkActive(link, now),
      );

    let studentIds = uniqueStrings(
      guardianLinks.map((link) => link.studentId),
    );

    if (requestedStudentId) {
      if (!studentIds.includes(requestedStudentId)) {
        throw new HttpsError(
          "failed-precondition",
          "Guardian is not actively linked to the selected student.",
        );
      }

      studentIds = [requestedStudentId];
    }

    const studentRefs = studentIds.map((studentId) =>
      db.doc(`orgs/${orgId}/students/${studentId}`),
    );

    const studentSnaps =
      studentRefs.length > 0
        ? await db.getAll(...studentRefs)
        : [];

    const studentRecords = studentSnaps
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data() ?? {};

        return {
          id: snapshot.id,
          personId: readString(data.personId),
          isArchived: data.isArchived === true,
        };
      })
      .filter((student) => !student.isArchived);

    const guardianPersonId = readString(
      guardianData.personId,
    );

    const personIds = uniqueStrings([
      guardianPersonId,
      ...studentRecords.map(
        (student) => student.personId,
      ),
    ]);

    const personRefs = personIds.map((personId) =>
      db.doc(`orgs/${orgId}/people/${personId}`),
    );

    const personSnaps =
      personRefs.length > 0
        ? await db.getAll(...personRefs)
        : [];

    const peopleMap = new Map(
      personSnaps
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => [
          snapshot.id,
          snapshot.data() ?? {},
        ]),
    );

    const guardianPerson = readPersonFields(
      peopleMap.get(guardianPersonId),
      guardianId,
    );

    const students = studentRecords.map((student) => {
      const person = readPersonFields(
        peopleMap.get(student.personId),
        student.id,
      );

      return {
        id: student.id,
        personId: student.personId,
        displayName: person.displayName,
        nationalId: person.nationalId,
      };
    });

    const charges: StudentFeeCharge[] = [];

    for (const studentIdChunk of chunkArray(
      students.map((student) => student.id),
    )) {
      const chargesSnap = await db
        .collection(`orgs/${orgId}/studentFeeCharges`)
        .where("studentId", "in", studentIdChunk)
        .get();

      for (const document of chargesSnap.docs) {
        const result = StudentFeeChargeSchema.safeParse({
          ...document.data(),
          id: document.id,
        });

        if (!result.success) continue;

        const charge = result.data;

        if (schoolId && charge.schoolId !== schoolId) {
          continue;
        }

        if (
          academicYearId &&
          charge.academicYearId !== academicYearId
        ) {
          continue;
        }

        if (termId && charge.termId !== termId) {
          continue;
        }

        charges.push(charge);
      }
    }

    const chargeIds = charges.map((charge) => charge.id);

    const installments: StudentFeeInstallment[] = [];

    for (const chargeIdChunk of chunkArray(chargeIds)) {
      if (chargeIdChunk.length === 0) continue;

      const installmentsSnap = await db
        .collection(
          `orgs/${orgId}/studentFeeInstallments`,
        )
        .where("chargeId", "in", chargeIdChunk)
        .get();

      for (const document of installmentsSnap.docs) {
        const result =
          StudentFeeInstallmentSchema.safeParse({
            ...document.data(),
            id: document.id,
          });

        if (result.success) {
          installments.push(result.data);
        }
      }
    }

    const paymentsSnap = await db
      .collection(`orgs/${orgId}/guardianPayments`)
      .where("guardianId", "==", guardianId)
      .get();

    const payments = paymentsSnap.docs
      .map((document) => {
        return GuardianPaymentSchema.safeParse({
          ...document.data(),
          id: document.id,
        });
      })
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter((payment) => {
        if (schoolId && payment.schoolIds.length > 0) {
          return payment.schoolIds.includes(schoolId);
        }

        return true;
      })
      .filter((payment) => {
        if (
          academicYearId &&
          payment.academicYearIds.length > 0
        ) {
          return payment.academicYearIds.includes(
            academicYearId,
          );
        }

        return true;
      })
      .sort((a, b) => b.paidAt - a.paidAt);

    const paymentIds = payments.map(
      (payment) => payment.id,
    );

    const receipts = [];

    for (const paymentIdChunk of chunkArray(paymentIds)) {
      if (paymentIdChunk.length === 0) continue;

      const receiptsSnap = await db
        .collection(
          `orgs/${orgId}/guardianPaymentReceipts`,
        )
        .where("paymentId", "in", paymentIdChunk)
        .get();

      for (const document of receiptsSnap.docs) {
        const result =
          GuardianPaymentReceiptSchema.safeParse({
            ...document.data(),
            id: document.id,
          });

        if (result.success) {
          receipts.push(result.data);
        }
      }
    }

    const orgData = orgSnap.data() ?? {};

    const locale =
      orgData.locale &&
      typeof orgData.locale === "object" &&
      !Array.isArray(orgData.locale)
        ? (orgData.locale as Record<string, unknown>)
        : {};

    const currency =
      readString(locale.currency).toUpperCase() || "SAR";

    const studentSummaries: StudentFinanceSummary[] = [];

    for (const student of students) {
      const studentCharges = charges.filter(
        (charge) =>
          charge.studentId === student.id &&
          charge.currency === currency,
      );

      const groupingKeys = uniqueStrings(
        studentCharges.map((charge) =>
          [
            charge.schoolId,
            charge.academicYearId,
          ].join("|"),
        ),
      );

      for (const groupingKey of groupingKeys) {
        const [summarySchoolId, summaryAcademicYearId] =
          groupingKey.split("|");

        if (!summarySchoolId || !summaryAcademicYearId) {
          continue;
        }

        const groupedCharges = studentCharges.filter(
          (charge) =>
            charge.schoolId === summarySchoolId &&
            charge.academicYearId ===
              summaryAcademicYearId,
        );

        const groupedChargeIds = new Set(
          groupedCharges.map((charge) => charge.id),
        );

        const groupedInstallments =
          installments.filter((installment) =>
            groupedChargeIds.has(installment.chargeId),
          );

        studentSummaries.push(
          buildStudentFinanceSummary({
            orgId,
            schoolId: summarySchoolId,
            academicYearId: summaryAcademicYearId,

            term: termId
              ? {
                  termId,
                }
              : undefined,

            studentId: student.id,
            studentPersonId: student.personId,
            studentDisplayName: student.displayName,

            currency,

            charges: groupedCharges,
            installments: groupedInstallments,
            payments,

            now,
          }),
        );
      }
    }

    const summary = buildGuardianFinanceSummary({
      orgId,

      guardianId,
      guardianPersonId,
      guardianDisplayName:
        guardianPerson.displayName,
      guardianPhone: guardianPerson.phone,

      currency,

      studentSummaries,
      payments,

      now,
    });

    return toJsonSafe({
      ok: true,

      searchResults,

      workspace: {
        guardian: {
          id: guardianId,
          personId: guardianPersonId,
          displayName:
            guardianPerson.displayName,
          nationalId:
            guardianPerson.nationalId,
          phone: guardianPerson.phone,
        },

        guardianLinks,
        students,

        charges: charges.sort(
          (a, b) =>
            (b.chargedAt ?? b.createdAt) -
            (a.chargedAt ?? a.createdAt),
        ),

        installments: installments.sort(
          (a, b) =>
            (a.dueAt ?? Number.MAX_SAFE_INTEGER) -
            (b.dueAt ?? Number.MAX_SAFE_INTEGER),
        ),

        payments,
        receipts,

        studentSummaries,
        summary,
      },
    });
  },
);