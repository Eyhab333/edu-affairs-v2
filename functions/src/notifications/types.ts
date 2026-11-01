export type NotificationEventStatus =
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "PARTIALLY_PROCESSED"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export type NotificationEventType =
  | "VIRTUAL_CLASS_SCHEDULED"
  | "VIRTUAL_CLASS_REMINDER"
  | "CHAT_MESSAGE_CREATED"
  | "STUDENT_ABSENCE_RECORDED"
  | "STUDENT_LATE_RECORDED"
  | "STUDENT_NOTE_PUBLISHED"
  | "STUDENT_CASE_CREATED"
  | "STUDENT_CASE_UPDATED"
  | "HOMEWORK_PUBLISHED"
  | "HOMEWORK_DUE_REMINDER"
  | "STUDENT_GAMIFICATION_AWARDED"
  | "LEARNING_LOSS_PLAN_CREATED"
  | "LEARNING_LOSS_FOLLOWUP_DUE"
  | "STAFF_EVALUATION_ASSIGNED"
  | "TRANSPORT_ALERT_CREATED"
  | "STUDENT_TRANSPORT_ATTENDANCE_RECORDED"
  | "GENERAL_ANNOUNCEMENT_PUBLISHED"
  | "FINANCE_INVOICE_ISSUED"
  | "FINANCE_PAYMENT_DUE"
  | "FINANCE_PAYMENT_REMINDER"
  | "FINANCE_PAYMENT_RECEIVED"
  | "FINANCE_BALANCE_UPDATED"
  | "CUSTOM";

export type NotificationSourceType =
  | "VIRTUAL_CLASS_SESSION"
  | "CHAT_THREAD"
  | "CHAT_MESSAGE"
  | "STUDENT_ATTENDANCE_BATCH"
  | "STUDENT_ATTENDANCE_RECORD"
  | "STUDENT_NOTE"
  | "STUDENT_CASE"
  | "STUDENT_HOMEWORK_ASSIGNMENT"
  | "STUDENT_HOMEWORK_SUBMISSION"
  | "STUDENT_GAMIFICATION_EVENT"
  | "STUDENT_LEARNING_LOSS_PLAN"
  | "TRANSPORT_ATTENDANCE_BATCH"
  | "TRANSPORT_ATTENDANCE_RECORD"
  | "EVALUATION_CYCLE"
  | "EVALUATION_SUBMISSION"
  | "ANNOUNCEMENT"
  | "FINANCE_ACCOUNT"
  | "FINANCE_INVOICE"
  | "FINANCE_PAYMENT"
  | "FINANCE_RECEIPT"
  | "MANUAL"
  | "CUSTOM";

export type NotificationRecipientKind =
  | "USER"
  | "PERSON"
  | "GUARDIAN"
  | "STAFF"
  | "STUDENT";

export type NotificationChannel = "PUSH" | "EMAIL" | "SMS" | "IN_APP";

export type NotificationAudienceKind =
  | "DIRECT_RECIPIENTS"
  | "ALL_GUARDIANS"
  | "ALL_STAFF"
  | "ALL_STUDENTS"
  | "SCHOOL_GUARDIANS"
  | "GRADE_GUARDIANS"
  | "CLASS_GUARDIANS"
  | "ROUTE_GUARDIANS"
  | "CUSTOM_QUERY";

export type NotificationAudienceScopeType =
  | "ORG"
  | "SCHOOL"
  | "ACADEMIC_YEAR"
  | "TERM"
  | "GRADE"
  | "CLASS"
  | "ROUTE"
  | "STUDENT"
  | "CUSTOM";

export type NotificationEventData = {
  id?: string;
  orgId?: string;

  schoolId?: string;
  academicYearId?: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  gradeId?: string;
  classId?: string;
  subjectKey?: string;
  classSubjectOfferingId?: string;

  type?: NotificationEventType;

  sourceType?: NotificationSourceType;
  sourceId?: string;
  sourcePath?: string;

  actorUid?: string;
  actorPersonId?: string;
  actorRoleKey?: string;

  targetSchoolId?: string;
  targetClassId?: string;
  targetStudentId?: string;
  targetGuardianId?: string;
  targetStaffPersonId?: string;
  targetPersonId?: string;
  targetRouteId?: string;
  targetThreadId?: string;
  targetConversationId?: string;

  audienceKind?: NotificationAudienceKind;
  audienceScopeType?: NotificationAudienceScopeType;
  audienceScopeId?: string;
  recipientFilter?: Record<string, unknown>;

  payload?: Record<string, unknown>;

  status?: NotificationEventStatus;

  createdAt?: number;
};

export type ResolvedNotificationRecipient = {
  recipientKind: NotificationRecipientKind;
  recipientUid?: string;
  recipientPersonId?: string;
  guardianId?: string;
  staffPersonId?: string;
  studentId?: string;
};

export type BuiltNotificationContent = {
  title: string;
  body: string;
  targetRoute: string;
  targetParams: Record<string, unknown>;
  data: Record<string, string>;
  channels: NotificationChannel[];
};
