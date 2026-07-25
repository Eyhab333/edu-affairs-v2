export type UserFacingError = {
  title: string;
  message: string;
  technicalDetails?: string;
};

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const value = (error as { code?: unknown }).code;

  return typeof value === "string"
    ? value
        .replace(/^firestore\//, "")
        .replace(/^auth\//, "")
        .trim()
    : "";
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

function buildTechnicalDetails(
  code: string,
  message: string,
) {
  if (process.env.NODE_ENV !== "development") {
    return undefined;
  }

  return [code, message]
    .filter(Boolean)
    .join(" · ");
}

export function getUserFacingError(
  error: unknown,
): UserFacingError {
  const code = readErrorCode(error);
  const rawMessage = readErrorMessage(error);

  const isPermissionDenied =
    code === "permission-denied" ||
    rawMessage.includes(
      "Missing or insufficient permissions",
    );

  if (isPermissionDenied) {
    return {
      title: "هذه المساحة غير متاحة لحسابك",
      message:
        "لا تملك حاليًا الصلاحية المطلوبة لعرض هذه الصفحة أو البيانات الموجودة بها.",
      technicalDetails: buildTechnicalDetails(
        code,
        rawMessage,
      ),
    };
  }

  if (code === "unauthenticated") {
    return {
      title: "انتهت جلسة الدخول",
      message:
        "سجّل الدخول مرة أخرى للمتابعة.",
      technicalDetails: buildTechnicalDetails(
        code,
        rawMessage,
      ),
    };
  }

  if (
    code === "unavailable" ||
    code === "deadline-exceeded"
  ) {
    return {
      title: "تعذر الاتصال بالخدمة",
      message:
        "تحقق من اتصال الإنترنت ثم أعد المحاولة.",
      technicalDetails: buildTechnicalDetails(
        code,
        rawMessage,
      ),
    };
  }

  if (code === "failed-precondition") {
    return {
      title: "هذه المساحة تحتاج إلى إعداد إضافي",
      message:
        "لم تكتمل متطلبات تشغيل هذه الصفحة في قاعدة البيانات.",
      technicalDetails: buildTechnicalDetails(
        code,
        rawMessage,
      ),
    };
  }

  if (code === "not-found") {
    return {
      title: "لم يتم العثور على البيانات",
      message:
        "قد تكون البيانات المطلوبة حُذفت أو لم تعد متاحة.",
      technicalDetails: buildTechnicalDetails(
        code,
        rawMessage,
      ),
    };
  }

  return {
    title: "تعذر إكمال العملية",
    message:
      "حدث خطأ غير متوقع. أعد المحاولة مرة أخرى.",
    technicalDetails: buildTechnicalDetails(
      code,
      rawMessage,
    ),
  };
}