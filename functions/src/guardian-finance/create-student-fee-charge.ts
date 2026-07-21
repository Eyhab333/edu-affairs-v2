import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  FeeDefinitionSchema,
  StudentEnrollmentSchema,
  StudentFeeChargeSchema,
  StudentFeeInstallmentSchema,
  type FeeDefinition,
  type StudentEnrollment,
  type StudentFeeInstallment,
} from "@takween/contracts";

import {
  activateStudentFeeCharge,
  buildStudentFeeChargeDraft,
  buildStudentFeeInstallments,
} from "@takween/domain";

import { requireGuardianFinanceAccess } from "./finance-access";

const REGION = "me-central2";

type CreateStudentFeeChargeInput = {
  orgId?: unknown;
  schoolId?: unknown;
  academicYearId?: unknown;

  termId?: unknown;
  termTitle?: unknown;
  termShortTitle?: unknown;

  studentId?: unknown;
  guardianId?: unknown;

  feeDefinitionId?: unknown;
  chargeId?: unknown;

  title?: unknown;
  description?: unknown;

  originalAmountMinor?: unknown;
  dueAt?: unknown;

  installmentCount?: unknown;
  installmentDueAtList?: unknown;
  installmentTitles?: unknown;

  activateImmediately?: unknown;
  isGuardianVisible?: unknown;
};

type CreateStudentFeeChargeResult = {
  ok: true;
  chargeId: string;
  installmentIds: string[];
  status: string;
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

function optionalNonNegativeInteger(
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
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

function optionalBoolean(
  value: unknown,
  defaultValue: boolean,
): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function readOptionalTimestampList(
  value: unknown,
): Array<number | undefined> {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "installmentDueAtList must be an array.",
    );
  }

  return value.map((item, index) => {
    return optionalTimestamp(
      item,
      `installmentDueAtList[${index}]`,
    );
  });
}

function readOptionalStringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      "installmentTitles must be an array.",
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new HttpsError(
        "invalid-argument",
        `installmentTitles[${index}] must be a non-empty string.`,
      );
    }

    return item.trim();
  });
}

function readDisplayName(
  data: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!data) return fallback;

  const candidateKeys = [
    "displayName",
    "fullName",
    "studentName",
    "guardianName",
    "name",
    "arabicName",
  ];

  for (const key of candidateKeys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function isActiveByDates(
  data: Record<string, unknown>,
  now: number,
): boolean {
  if (data.active === false || data.isActive === false) {
    return false;
  }

  const startAt =
    typeof data.startAt === "number" ? data.startAt : undefined;

  const endAt =
    typeof data.endAt === "number" ? data.endAt : undefined;

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
    return value.map((item) =>
      removeUndefined(item),
    ) as T;
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
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

function validateFeeDefinitionScope(params: {
  feeDefinition: FeeDefinition;
  schoolId: string;
  academicYearId: string;
  enrollment: StudentEnrollment;
}) {
  const {
    feeDefinition,
    schoolId,
    academicYearId,
    enrollment,
  } = params;

  if (
    feeDefinition.academicYearId &&
    feeDefinition.academicYearId !== academicYearId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Fee definition does not match the academic year.",
    );
  }

  if (
    feeDefinition.schoolIds.length > 0 &&
    !feeDefinition.schoolIds.includes(schoolId)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Fee definition does not apply to this school.",
    );
  }

  if (
    feeDefinition.gradeIds.length > 0 &&
    (!enrollment.gradeId ||
      !feeDefinition.gradeIds.includes(enrollment.gradeId))
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Fee definition does not apply to the student's grade.",
    );
  }

  if (
    feeDefinition.classIds.length > 0 &&
    (!enrollment.classId ||
      !feeDefinition.classIds.includes(enrollment.classId))
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Fee definition does not apply to the student's class.",
    );
  }

  switch (feeDefinition.scopeType) {
    case "ORG":
    case "CUSTOM":
      return;

    case "SCHOOL":
      if (
        feeDefinition.scopeId &&
        feeDefinition.scopeId !== schoolId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Fee definition school scope does not match.",
        );
      }
      return;

    case "ACADEMIC_YEAR":
      if (
        feeDefinition.scopeId &&
        feeDefinition.scopeId !== academicYearId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Fee definition academic-year scope does not match.",
        );
      }
      return;

    case "GRADE":
      if (
        feeDefinition.scopeId &&
        feeDefinition.scopeId !== enrollment.gradeId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Fee definition grade scope does not match.",
        );
      }
      return;

    case "CLASS":
      if (
        feeDefinition.scopeId &&
        feeDefinition.scopeId !== enrollment.classId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Fee definition class scope does not match.",
        );
      }
      return;
  }
}

export const createStudentFeeCharge = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<CreateStudentFeeChargeResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input =
      request.data as CreateStudentFeeChargeInput;

    const orgId = requireNonEmptyString(
      input.orgId,
      "orgId",
    );

    const schoolId = requireNonEmptyString(
      input.schoolId,
      "schoolId",
    );

    const academicYearId = requireNonEmptyString(
      input.academicYearId,
      "academicYearId",
    );

    const studentId = requireNonEmptyString(
      input.studentId,
      "studentId",
    );

    const feeDefinitionId = requireNonEmptyString(
      input.feeDefinitionId,
      "feeDefinitionId",
    );

    const guardianId = optionalString(input.guardianId);
    const chargeId = optionalString(input.chargeId);

    if (chargeId?.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "chargeId cannot contain '/'.",
      );
    }

    const originalAmountMinor =
      optionalNonNegativeInteger(
        input.originalAmountMinor,
        "originalAmountMinor",
      );

    const dueAt = optionalTimestamp(
      input.dueAt,
      "dueAt",
    );

    const requestedInstallmentCount =
      optionalNonNegativeInteger(
        input.installmentCount,
        "installmentCount",
      );

    if (
      requestedInstallmentCount !== undefined &&
      requestedInstallmentCount > 60
    ) {
      throw new HttpsError(
        "invalid-argument",
        "installmentCount cannot exceed 60.",
      );
    }

    const installmentDueAtList =
      readOptionalTimestampList(
        input.installmentDueAtList,
      );

    const installmentTitles =
      readOptionalStringList(input.installmentTitles);

    const activateImmediately = optionalBoolean(
      input.activateImmediately,
      true,
    );

    const isGuardianVisible =
      typeof input.isGuardianVisible === "boolean"
        ? input.isGuardianVisible
        : undefined;

    const actor = await requireGuardianFinanceAccess({
      uid,
      orgId,
      schoolId,
      permission: "manageGuardianFinance",
    });

    const db = getFirestore();
    const now = Date.now();

    try {
      return await db.runTransaction(async (transaction) => {
        const schoolRef = db.doc(
          `orgs/${orgId}/schools/${schoolId}`,
        );

        const academicYearRef = db.doc(
          `orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}`,
        );

        const studentRef = db.doc(
          `orgs/${orgId}/students/${studentId}`,
        );

        const feeDefinitionRef = db.doc(
          `orgs/${orgId}/feeDefinitions/${feeDefinitionId}`,
        );

        const [
          schoolSnap,
          academicYearSnap,
          studentSnap,
          feeDefinitionSnap,
        ] = await Promise.all([
          transaction.get(schoolRef),
          transaction.get(academicYearRef),
          transaction.get(studentRef),
          transaction.get(feeDefinitionRef),
        ]);

        if (!schoolSnap.exists) {
          throw new HttpsError(
            "not-found",
            "School not found.",
          );
        }

        if (schoolSnap.data()?.isArchived === true) {
          throw new HttpsError(
            "failed-precondition",
            "School is archived.",
          );
        }

        if (!academicYearSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Academic year not found.",
          );
        }

        if (!studentSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Student not found.",
          );
        }

        const studentData = studentSnap.data() ?? {};

        if (studentData.isArchived === true) {
          throw new HttpsError(
            "failed-precondition",
            "Student is archived.",
          );
        }

        if (!feeDefinitionSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Fee definition not found.",
          );
        }

        const feeDefinition =
          FeeDefinitionSchema.parse({
            ...feeDefinitionSnap.data(),
            id: feeDefinitionSnap.id,
          });

        if (feeDefinition.orgId !== orgId) {
          throw new HttpsError(
            "permission-denied",
            "Fee definition organization mismatch.",
          );
        }

        if (
          feeDefinition.status !== "ACTIVE" ||
          feeDefinition.isArchived
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Fee definition is not active.",
          );
        }

        const enrollmentQuery = db
          .collection(`orgs/${orgId}/studentEnrollments`)
          .where("studentId", "==", studentId);

        const enrollmentSnap =
          await transaction.get(enrollmentQuery);

        const enrollment = enrollmentSnap.docs
          .map((document) => {
            return StudentEnrollmentSchema.safeParse({
              ...document.data(),
              id: document.id,
            });
          })
          .filter((result) => result.success)
          .map((result) => result.data)
          .find((item) => {
            return (
              item.schoolId === schoolId &&
              item.academicYearId === academicYearId &&
              item.status === "ACTIVE"
            );
          });

        if (!enrollment) {
          throw new HttpsError(
            "failed-precondition",
            "Student has no active enrollment in this school and academic year.",
          );
        }

        validateFeeDefinitionScope({
          feeDefinition,
          schoolId,
          academicYearId,
          enrollment,
        });

        const studentPersonId =
          typeof studentData.personId === "string"
            ? studentData.personId.trim()
            : "";

        let studentDisplayName = studentId;

        if (studentPersonId) {
          const studentPersonRef = db.doc(
            `orgs/${orgId}/people/${studentPersonId}`,
          );

          const studentPersonSnap =
            await transaction.get(studentPersonRef);

          studentDisplayName = readDisplayName(
            studentPersonSnap.data(),
            studentId,
          );
        }

        let guardianPersonId: string | undefined;
        let guardianDisplayName: string | undefined;

        if (guardianId) {
          const guardianRef = db.doc(
            `orgs/${orgId}/guardians/${guardianId}`,
          );

          const guardianSnap =
            await transaction.get(guardianRef);

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

          const guardianLinksQuery = db
            .collection(`orgs/${orgId}/guardianLinks`)
            .where("studentId", "==", studentId);

          const guardianLinksSnap =
            await transaction.get(guardianLinksQuery);

          const hasActiveLink = guardianLinksSnap.docs.some(
            (document) => {
              const data = document.data();

              return (
                data.guardianId === guardianId &&
                isActiveByDates(data, now)
              );
            },
          );

          if (!hasActiveLink) {
            throw new HttpsError(
              "failed-precondition",
              "Guardian is not actively linked to this student.",
            );
          }

          guardianPersonId =
            typeof guardianData.personId === "string"
              ? guardianData.personId.trim()
              : undefined;

          guardianDisplayName = guardianId;

          if (guardianPersonId) {
            const guardianPersonRef = db.doc(
              `orgs/${orgId}/people/${guardianPersonId}`,
            );

            const guardianPersonSnap =
              await transaction.get(guardianPersonRef);

            guardianDisplayName = readDisplayName(
              guardianPersonSnap.data(),
              guardianId,
            );
          }
        }

        let charge = buildStudentFeeChargeDraft({
          id: chargeId,

          orgId,
          schoolId,
          academicYearId,

          term: {
            termId: optionalString(input.termId),
            termTitle: optionalString(input.termTitle),
            termShortTitle: optionalString(
              input.termShortTitle,
            ),
          },

          studentId,
          studentPersonId: studentPersonId || undefined,
          studentDisplayName,

          guardianId,
          guardianPersonId,
          guardianDisplayName,

          feeDefinition,

          title: optionalString(input.title),
          description: optionalString(input.description),

          originalAmountMinor,
          dueAt,

          isGuardianVisible,

          createdByPersonId: actor.personId,
          createdByRoleKey: actor.roleKey || undefined,

          now,
        });

        if (activateImmediately) {
          charge = activateStudentFeeCharge(charge, now);
        }

        const installmentCount =
          requestedInstallmentCount ??
          (feeDefinition.defaultInstallmentCount > 1
            ? feeDefinition.defaultInstallmentCount
            : 0);

        let installments: StudentFeeInstallment[] = [];

        if (installmentCount > 0) {
          const installmentResult =
            buildStudentFeeInstallments({
              charge,
              installmentCount,
              dueAtList: installmentDueAtList,
              titles: installmentTitles,

              createdByPersonId: actor.personId,
              createdByRoleKey:
                actor.roleKey || undefined,

              now,
            });

          charge = installmentResult.charge;
          installments = installmentResult.installments;
        }

        const parsedCharge =
          StudentFeeChargeSchema.parse(charge);

        const parsedInstallments = installments.map(
          (installment) =>
            StudentFeeInstallmentSchema.parse(installment),
        );

        const chargeRef = db.doc(
          `orgs/${orgId}/studentFeeCharges/${parsedCharge.id}`,
        );

        const existingChargeSnap =
          await transaction.get(chargeRef);

        if (existingChargeSnap.exists) {
          throw new HttpsError(
            "already-exists",
            "A fee charge with the same id already exists.",
          );
        }

        transaction.create(
          chargeRef,
          removeUndefined(parsedCharge),
        );

        for (const installment of parsedInstallments) {
          const installmentRef = db.doc(
            `orgs/${orgId}/studentFeeInstallments/${installment.id}`,
          );

          transaction.create(
            installmentRef,
            removeUndefined(installment),
          );
        }

        return {
          ok: true,
          chargeId: parsedCharge.id,
          installmentIds: parsedInstallments.map(
            (installment) => installment.id,
          ),
          status: parsedCharge.status,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Failed to create student fee charge.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);