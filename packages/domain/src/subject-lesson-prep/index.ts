import type {
  LessonPrepReviewMode,
  MembershipRole,
  SubjectLessonPrep,
  SubjectLessonPrepStatus,
} from "@takween/contracts";

export type SubjectLessonPrepActionKey =
  | "EDIT"
  | "SUBMIT"
  | "APPROVE"
  | "RETURN"
  | "LOCK"
  | "CANCEL"
  | "VIEW";

export type SubjectLessonPrepActorContext = {
  uid?: string;
  personId?: string;
  roleKeys?: MembershipRole[];
  roles?: MembershipRole[];
  isOrgAdmin?: boolean;
  permissions?: {
    manageOrg?: boolean;
    manageSchools?: boolean;
    manageSubjects?: boolean;
  };
};

export type SubjectLessonPrepAction = {
  key: SubjectLessonPrepActionKey;
  label: string;
  enabled: boolean;
  reason?: string;
};

export type SubjectLessonPrepPermissionResult = {
  allowed: boolean;
  reason?: string;
};

export type SubjectLessonPrepSubmitPatch = {
  status: "SUBMITTED";
  submittedAt: number;
  updatedAt: number;
  returnedAt: null;
  returnedByPersonId: "";
  returnReason: "";
};

export type SubjectLessonPrepApprovePatch = {
  status: "APPROVED";
  approvedAt: number;
  approvedByPersonId: string;
  approvalNote: string;
  updatedAt: number;
};

export type SubjectLessonPrepReturnPatch = {
  status: "RETURNED";
  returnedAt: number;
  returnedByPersonId: string;
  returnReason: string;
  updatedAt: number;
};

export type SubjectLessonPrepEditPatch = {
  lessonTitle: string;
  unitTitle: string;
  weekLabel: string;
  lessonDate: string;
  durationMinutes: string;
  lessonNumber: string;
  objectives: string;
  learningOutcomes: string;
  warmup: string;
  lessonSteps: string;
  strategies: string;
  resources: string;
  assessment: string;
  homeworkNote: string;
  updatedAt: number;
};

const LESSON_PREP_REVIEW_ROLES = new Set<MembershipRole>([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
  "school_admin",
  "school_manager",
  "BOYS_PRINCIPAL",
  "BOYS_EDU_VP",
  "BOYS_EDU_SUPERVISOR",
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "GIRLS_EDU_SUPERVISOR",
  "KG_PRINCIPAL",
  "KG_VP",
  "KG_EDU_SUPERVISOR",
]);

export function getSubjectLessonPrepStatusLabel(
  status: SubjectLessonPrepStatus,
) {
  switch (status) {
    case "DRAFT":
      return "مسودة";

    case "SUBMITTED":
      return "مرسل";

    case "APPROVED":
      return "معتمد";

    case "RETURNED":
      return "معاد للتعديل";

    case "LOCKED":
      return "مقفل";

    case "CANCELLED":
      return "ملغي";

    default:
      return status;
  }
}

export function getLessonPrepReviewModeLabel(mode: LessonPrepReviewMode) {
  switch (mode) {
    case "NONE":
      return "بدون إرسال أو اعتماد";

    case "SUBMIT_ONLY":
      return "إرسال فقط";

    case "APPROVAL_REQUIRED":
      return "يتطلب اعتمادًا";

    default:
      return mode;
  }
}

export function resolveSubjectLessonPrepReviewMode(
  prep: Pick<SubjectLessonPrep, "reviewMode"> | null | undefined,
): LessonPrepReviewMode {
  return prep?.reviewMode || "APPROVAL_REQUIRED";
}

export function resolveSubjectLessonPrepApprovalRequired(
  prep:
    | Pick<SubjectLessonPrep, "reviewMode" | "approvalRequired">
    | null
    | undefined,
) {
  const reviewMode = resolveSubjectLessonPrepReviewMode(prep);

  if (reviewMode === "APPROVAL_REQUIRED") return true;
  if (reviewMode === "NONE") return false;
  if (reviewMode === "SUBMIT_ONLY") return false;

  return prep?.approvalRequired ?? true;
}

export function isSubjectLessonPrepEditableStatus(
  status: SubjectLessonPrepStatus,
) {
  return status === "DRAFT" || status === "RETURNED";
}

export function isSubjectLessonPrepSubmittableStatus(
  status: SubjectLessonPrepStatus,
) {
  return status === "DRAFT" || status === "RETURNED";
}

export function isSubjectLessonPrepReviewableStatus(
  status: SubjectLessonPrepStatus,
) {
  return status === "SUBMITTED";
}

export function isSubjectLessonPrepFinalStatus(
  status: SubjectLessonPrepStatus,
) {
  return status === "APPROVED" || status === "LOCKED" || status === "CANCELLED";
}

export function isSubjectLessonPrepCompleted(
  prep: Pick<SubjectLessonPrep, "status" | "reviewMode" | "approvalRequired">,
) {
  if (prep.status === "APPROVED" || prep.status === "LOCKED") return true;

  const reviewMode = resolveSubjectLessonPrepReviewMode(prep);

  if (reviewMode === "NONE") {
    return prep.status === "DRAFT" || prep.status === "SUBMITTED";
  }

  if (reviewMode === "SUBMIT_ONLY") {
    return prep.status === "SUBMITTED";
  }

  return false;
}

export function getSubjectLessonPrepStatusTone(status: SubjectLessonPrepStatus) {
  switch (status) {
    case "DRAFT":
      return "neutral";

    case "SUBMITTED":
      return "info";

    case "APPROVED":
      return "success";

    case "RETURNED":
      return "warning";

    case "LOCKED":
      return "purple";

    case "CANCELLED":
      return "danger";

    default:
      return "neutral";
  }
}

export function getSubjectLessonPrepActorPersonId(
  actor: SubjectLessonPrepActorContext | null | undefined,
) {
  return actor?.personId || actor?.uid || "";
}

export function getSubjectLessonPrepActorRoleKeys(
  actor: SubjectLessonPrepActorContext | null | undefined,
): MembershipRole[] {
  return [...(actor?.roleKeys ?? []), ...(actor?.roles ?? [])];
}

export function isSubjectLessonPrepAdminReviewer(
  actor: SubjectLessonPrepActorContext | null | undefined,
) {
  if (!actor) return false;

  if (actor.isOrgAdmin) return true;
  if (actor.permissions?.manageOrg) return true;
  if (actor.permissions?.manageSchools) return true;
  if (actor.permissions?.manageSubjects) return true;

  const roles = getSubjectLessonPrepActorRoleKeys(actor);

  return roles.some((role) => LESSON_PREP_REVIEW_ROLES.has(role));
}

export function isSubjectLessonPrepOwner(
  prep: Pick<SubjectLessonPrep, "teacherPersonId">,
  actor: SubjectLessonPrepActorContext | null | undefined,
) {
  const actorPersonId = getSubjectLessonPrepActorPersonId(actor);

  return !!actorPersonId && prep.teacherPersonId === actorPersonId;
}

export function isSubjectLessonPrepReviewer(
  prep: Pick<SubjectLessonPrep, "reviewerPersonId"> | Partial<SubjectLessonPrep>,
  actor: SubjectLessonPrepActorContext | null | undefined,
) {
  const actorPersonId = getSubjectLessonPrepActorPersonId(actor);

  if (!actorPersonId) return false;

  return prep.reviewerPersonId === actorPersonId;
}

export function canEditSubjectLessonPrep(
  prep: Pick<SubjectLessonPrep, "status" | "teacherPersonId">,
  actor?: SubjectLessonPrepActorContext | null,
): SubjectLessonPrepPermissionResult {
  if (!isSubjectLessonPrepEditableStatus(prep.status)) {
    return {
      allowed: false,
      reason: `لا يمكن تعديل التحضير لأن حالته الحالية: ${getSubjectLessonPrepStatusLabel(
        prep.status,
      )}.`,
    };
  }

  if (actor && !isSubjectLessonPrepOwner(prep, actor)) {
    return {
      allowed: false,
      reason: "لا يمكن تعديل هذا التحضير إلا بواسطة المعلم صاحب التحضير.",
    };
  }

  return { allowed: true };
}

export function canSubmitSubjectLessonPrep(
  prep: Pick<SubjectLessonPrep, "status" | "teacherPersonId">,
  actor?: SubjectLessonPrepActorContext | null,
): SubjectLessonPrepPermissionResult {
  if (!isSubjectLessonPrepSubmittableStatus(prep.status)) {
    return {
      allowed: false,
      reason: "لا يمكن إرسال التحضير إلا إذا كان مسودة أو معادًا للتعديل.",
    };
  }

  if (actor && !isSubjectLessonPrepOwner(prep, actor)) {
    return {
      allowed: false,
      reason: "لا يمكن إرسال هذا التحضير إلا بواسطة المعلم صاحب التحضير.",
    };
  }

  return { allowed: true };
}

export function canReviewSubjectLessonPrep(
  prep: Pick<
    SubjectLessonPrep,
    "status" | "reviewMode" | "approvalRequired" | "reviewerPersonId"
  > &
    Partial<SubjectLessonPrep>,
  actor?: SubjectLessonPrepActorContext | null,
): SubjectLessonPrepPermissionResult {
  const reviewMode = resolveSubjectLessonPrepReviewMode(prep);

  if (reviewMode !== "APPROVAL_REQUIRED") {
    return {
      allowed: false,
      reason: "سياسة هذه المادة لا تتطلب اعتماد التحضير.",
    };
  }

  if (!isSubjectLessonPrepReviewableStatus(prep.status)) {
    return {
      allowed: false,
      reason: "لا يمكن مراجعة التحضير إلا إذا كان في حالة مرسل.",
    };
  }

  if (!actor) {
    return {
      allowed: false,
      reason: "لا يمكن مراجعة التحضير بدون بيانات المستخدم.",
    };
  }

  if (isSubjectLessonPrepReviewer(prep, actor)) {
    return { allowed: true };
  }

  if (isSubjectLessonPrepAdminReviewer(actor)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "لا تملك صلاحية مراجعة هذا التحضير.",
  };
}

export function canApproveSubjectLessonPrep(
  prep: Pick<
    SubjectLessonPrep,
    "status" | "reviewMode" | "approvalRequired" | "reviewerPersonId"
  > &
    Partial<SubjectLessonPrep>,
  actor?: SubjectLessonPrepActorContext | null,
) {
  return canReviewSubjectLessonPrep(prep, actor);
}

export function canReturnSubjectLessonPrep(
  prep: Pick<
    SubjectLessonPrep,
    "status" | "reviewMode" | "approvalRequired" | "reviewerPersonId"
  > &
    Partial<SubjectLessonPrep>,
  actor?: SubjectLessonPrepActorContext | null,
) {
  return canReviewSubjectLessonPrep(prep, actor);
}

export function getSubjectLessonPrepAvailableActions(
  prep: SubjectLessonPrep,
  actor?: SubjectLessonPrepActorContext | null,
): SubjectLessonPrepAction[] {
  const canEdit = canEditSubjectLessonPrep(prep, actor);
  const canSubmit = canSubmitSubjectLessonPrep(prep, actor);
  const canApprove = canApproveSubjectLessonPrep(prep, actor);
  const canReturn = canReturnSubjectLessonPrep(prep, actor);

  return [
    {
      key: "VIEW",
      label: "عرض التحضير",
      enabled: true,
    },
    {
      key: "EDIT",
      label: "تعديل التحضير",
      enabled: canEdit.allowed,
      reason: canEdit.reason,
    },
    {
      key: "SUBMIT",
      label: prep.status === "RETURNED" ? "إعادة إرسال التحضير" : "إرسال التحضير",
      enabled: canSubmit.allowed,
      reason: canSubmit.reason,
    },
    {
      key: "APPROVE",
      label: "اعتماد التحضير",
      enabled: canApprove.allowed,
      reason: canApprove.reason,
    },
    {
      key: "RETURN",
      label: "إعادة للتعديل",
      enabled: canReturn.allowed,
      reason: canReturn.reason,
    },
  ];
}

export function buildSubjectLessonPrepSubmitPatch(
  now = Date.now(),
): SubjectLessonPrepSubmitPatch {
  return {
    status: "SUBMITTED",
    submittedAt: now,
    updatedAt: now,
    returnedAt: null,
    returnedByPersonId: "",
    returnReason: "",
  };
}

export function buildSubjectLessonPrepApprovePatch(params: {
  actorPersonId: string;
  approvalNote?: string;
  now?: number;
}): SubjectLessonPrepApprovePatch {
  return {
    status: "APPROVED",
    approvedAt: params.now ?? Date.now(),
    approvedByPersonId: params.actorPersonId,
    approvalNote: params.approvalNote?.trim() || "",
    updatedAt: params.now ?? Date.now(),
  };
}

export function buildSubjectLessonPrepReturnPatch(params: {
  actorPersonId: string;
  returnReason?: string;
  now?: number;
}): SubjectLessonPrepReturnPatch {
  const now = params.now ?? Date.now();

  return {
    status: "RETURNED",
    returnedAt: now,
    returnedByPersonId: params.actorPersonId,
    returnReason:
      params.returnReason?.trim() ||
      "يرجى مراجعة التحضير وإجراء التعديلات المطلوبة.",
    updatedAt: now,
  };
}

export function buildSubjectLessonPrepEditPatch(
  data: {
    lessonTitle: string;
    unitTitle?: string;
    weekLabel?: string;
    lessonDate?: string;
    durationMinutes?: string;
    lessonNumber?: string;
    objectives?: string;
    learningOutcomes?: string;
    warmup?: string;
    lessonSteps?: string;
    strategies?: string;
    resources?: string;
    assessment?: string;
    homeworkNote?: string;
  },
  now = Date.now(),
): SubjectLessonPrepEditPatch {
  return {
    lessonTitle: data.lessonTitle.trim(),
    unitTitle: data.unitTitle?.trim() ?? "",
    weekLabel: data.weekLabel?.trim() ?? "",
    lessonDate: data.lessonDate?.trim() ?? "",
    durationMinutes: data.durationMinutes?.trim() ?? "",
    lessonNumber: data.lessonNumber?.trim() ?? "",
    objectives: data.objectives?.trim() ?? "",
    learningOutcomes: data.learningOutcomes?.trim() ?? "",
    warmup: data.warmup?.trim() ?? "",
    lessonSteps: data.lessonSteps?.trim() ?? "",
    strategies: data.strategies?.trim() ?? "",
    resources: data.resources?.trim() ?? "",
    assessment: data.assessment?.trim() ?? "",
    homeworkNote: data.homeworkNote?.trim() ?? "",
    updatedAt: now,
  };
}

export function validateSubjectLessonPrepDraftInput(data: {
  lessonTitle?: string;
}) {
  const lessonTitle = data.lessonTitle?.trim() ?? "";

  if (!lessonTitle) {
    return {
      valid: false,
      message: "عنوان الدرس مطلوب.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}

export function assertSubjectLessonPrepDraftInput(data: {
  lessonTitle?: string;
}) {
  const result = validateSubjectLessonPrepDraftInput(data);

  if (!result.valid) {
    throw new Error(result.message);
  }
}
