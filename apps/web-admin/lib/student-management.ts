import { httpsCallable } from "firebase/functions";

import type {
  CreateStudentIdentity,
  CreateStudentPlacement,
  CreateStudentResult,
  EndStudentEnrollmentResult,
  ReEnrollStudentResult,
  TransferStudentResult,
  UpdateStudentIdentityChanges,
  UpdateStudentIdentityResult,
} from "@takween/contracts";

import { functions } from "@/lib/firebase";

export type UpdateStudentIdentityInput = {
  orgId: string;
  studentId: string;
  changes: UpdateStudentIdentityChanges;
  operationId?: string;
  reason?: string;
};

export type CreateStudentInput = {
  orgId: string;
  identity: CreateStudentIdentity;
  placement: CreateStudentPlacement;
  operationId: string;
  reason?: string;
};

export type TransferStudentInput = {
  orgId: string;
  studentId: string;
  target: {
    schoolId: string;
    academicYearId: string;
    classId: string;
  };
  transferReason: string;
  operationId: string;
};

export type EndStudentEnrollmentInput = {
  orgId: string;
  studentId: string;
  academicYearId: string;
  reason: string;
  operationId: string;
};

export type ReEnrollStudentInput = {
  orgId: string;
  studentId: string;
  target: {
    schoolId: string;
    academicYearId: string;
    classId: string;
  };
  reason: string;
  operationId: string;
};

export async function createStudent(
  input: CreateStudentInput,
): Promise<CreateStudentResult> {
  const call = httpsCallable<CreateStudentInput, CreateStudentResult>(
    functions,
    "createStudent",
  );

  const response = await call(input);
  return response.data;
}

export async function transferStudent(
  input: TransferStudentInput,
): Promise<TransferStudentResult> {
  const call = httpsCallable<TransferStudentInput, TransferStudentResult>(
    functions,
    "transferStudent",
  );

  const response = await call(input);
  return response.data;
}

export async function endStudentEnrollment(
  input: EndStudentEnrollmentInput,
): Promise<EndStudentEnrollmentResult> {
  const call = httpsCallable<
    EndStudentEnrollmentInput,
    EndStudentEnrollmentResult
  >(functions, "endStudentEnrollment");

  const response = await call(input);
  return response.data;
}

export async function reEnrollStudent(
  input: ReEnrollStudentInput,
): Promise<ReEnrollStudentResult> {
  const call = httpsCallable<ReEnrollStudentInput, ReEnrollStudentResult>(
    functions,
    "reEnrollStudent",
  );

  const response = await call(input);
  return response.data;
}

export async function updateStudentIdentity(
  input: UpdateStudentIdentityInput,
): Promise<UpdateStudentIdentityResult> {
  const call = httpsCallable<
    UpdateStudentIdentityInput,
    UpdateStudentIdentityResult
  >(functions, "updateStudentIdentity");

  const response = await call(input);
  return response.data;
}

export function studentIdentityUpdateErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const reason =
    details && typeof details === "object" && "reason" in details
      ? String(details.reason)
      : "";

  if (reason === "NATIONAL_ID_CONFLICT") {
    return "رقم الهوية مستخدم بالفعل لطالب أو شخص آخر.";
  }

  if (code === "functions/permission-denied") {
    return "ليس لديك صلاحية تعديل بيانات هوية الطالب.";
  }

  if (code === "functions/not-found") {
    return "تعذر العثور على سجل الطالب المطلوب.";
  }

  if (code === "functions/failed-precondition") {
    return "لا يمكن تعديل هوية هذا الطالب في حالته الحالية.";
  }

  if (code === "functions/invalid-argument") {
    return "تحقق من البيانات المدخلة ثم حاول مرة أخرى.";
  }

  return "تعذر حفظ بيانات هوية الطالب. حاول مرة أخرى.";
}

export function transferStudentErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const reason =
    details && typeof details === "object" && "reason" in details
      ? String(details.reason)
      : "";

  if (reason === "NO_ACTIVE_ENROLLMENT") {
    return "لا يوجد قيد نشط للطالب في العام الدراسي المحدد.";
  }
  if (reason === "MULTIPLE_ACTIVE_ENROLLMENTS") {
    return "يوجد أكثر من قيد نشط ويجب مراجعة البيانات.";
  }
  if (reason === "CROSS_SCHOOL_TYPE_MISMATCH") {
    return "لا يمكن النقل بين نوعي مدارس مختلفين.";
  }
  if (reason === "INVALID_TARGET_PLACEMENT") {
    return "الفصل المستهدف غير صالح حاليًا.";
  }
  if (reason === "TARGET_ENROLLMENT_EXISTS") {
    return "تعذر إنشاء حلقة قيد جديدة لهذه العملية.";
  }
  if (reason === "OPERATION_ID_REUSED") {
    return "تعذر إعادة استخدام عملية النقل مع بيانات مختلفة.";
  }
  if (code === "functions/permission-denied") {
    return "ليس لديك صلاحية نقل الطالب.";
  }
  if (code === "functions/not-found") {
    return "تعذر العثور على سجل الطالب.";
  }
  if (code === "functions/invalid-argument") {
    return "أكمل بيانات النقل المطلوبة.";
  }

  return "تعذر نقل الطالب. حاول مرة أخرى.";
}

export function endStudentEnrollmentErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const reason =
    details && typeof details === "object" && "reason" in details
      ? String(details.reason)
      : "";

  if (reason === "NO_ACTIVE_ENROLLMENT") {
    return "لا يوجد قيد نشط للطالب في العام الدراسي المحدد.";
  }
  if (reason === "MULTIPLE_ACTIVE_ENROLLMENTS") {
    return "يوجد أكثر من قيد نشط ويجب مراجعة البيانات.";
  }
  if (reason === "OPERATION_ID_REUSED") {
    return "تعذر إعادة استخدام عملية إنهاء القيد مع بيانات مختلفة.";
  }
  if (code === "functions/permission-denied") {
    return "ليس لديك صلاحية إنهاء قيد الطالب.";
  }
  if (code === "functions/not-found") {
    return "تعذر العثور على سجل الطالب.";
  }
  if (code === "functions/invalid-argument") {
    return "أدخل سبب إنهاء القيد.";
  }

  return "تعذر إنهاء قيد الطالب. حاول مرة أخرى.";
}

export function reEnrollStudentErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const reason =
    details && typeof details === "object" && "reason" in details
      ? String(details.reason)
      : "";

  if (reason === "ACTIVE_ENROLLMENT_EXISTS") {
    return "لدى الطالب قيد نشط بالفعل في العام الدراسي المحدد.";
  }
  if (reason === "INVALID_TARGET_PLACEMENT") {
    return "الفصل المستهدف غير صالح حاليًا.";
  }
  if (reason === "TARGET_ENROLLMENT_EXISTS") {
    return "تعذر إنشاء حلقة قيد جديدة لهذه العملية.";
  }
  if (reason === "OPERATION_ID_REUSED") {
    return "تعذر إعادة استخدام عملية إعادة القيد مع بيانات مختلفة.";
  }
  if (code === "functions/permission-denied") {
    return "ليس لديك صلاحية إعادة قيد الطالب.";
  }
  if (code === "functions/not-found") {
    return "تعذر العثور على سجل الطالب.";
  }
  if (code === "functions/invalid-argument") {
    return "أكمل بيانات إعادة القيد المطلوبة.";
  }

  return "تعذر إعادة قيد الطالب. حاول مرة أخرى.";
}

export function createStudentErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const details =
    error && typeof error === "object" && "details" in error
      ? error.details
      : undefined;
  const reason =
    details && typeof details === "object" && "reason" in details
      ? String(details.reason)
      : "";

  if (reason === "NATIONAL_ID_CONFLICT") {
    return "رقم الهوية مسجل مسبقًا.";
  }
  if (reason === "OPERATION_ID_REUSED") {
    return "تعذر إعادة استخدام عملية الحفظ مع بيانات مختلفة.";
  }
  if (reason === "INVALID_PLACEMENT") {
    return "المدرسة أو العام الدراسي أو الفصل المحدد غير صالح حاليًا.";
  }
  if (code === "functions/permission-denied") {
    return "ليس لديك صلاحية إنشاء طالب جديد.";
  }
  if (code === "functions/invalid-argument") {
    return "تحقق من البيانات المدخلة ثم حاول مرة أخرى.";
  }

  return "تعذر إنشاء الطالب. حاول مرة أخرى.";
}
