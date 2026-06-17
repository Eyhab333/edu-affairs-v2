// import type {
//   Message,
//   MessageParticipantKind,
//   MessageType,
//   Thread,
//   ThreadScopeType,
//   ThreadStatus,
//   ThreadType,
// } from "@takween/contracts";

// export type {
//   Message,
//   MessageParticipantKind,
//   MessageType,
//   Thread,
//   ThreadScopeType,
//   ThreadStatus,
//   ThreadType,
// };

// export type CreateOrGetStudentContextThreadInput = {
//   orgId: string;
//   schoolId: string;
//   academicYearId: string;

//   studentId: string;

//   guardianUid: string;
//   guardianPersonId?: string;
//   guardianDisplayName?: string;

//   targetPersonId?: string;
//   targetUid?: string;
//   targetRoleKey?: string;
//   targetDisplayName?: string;

//   classId?: string;
//   gradeId?: string;
//   termId?: string;

//   subjectKey?: string;
//   classSubjectOfferingId?: string;
// };

// export type SendThreadMessageInput = {
//   orgId: string;
//   threadId: string;
//   body: string;
// };

// export type SendThreadMessageResult = {
//   ok: true;
//   threadId: string;
//   messageId: string;
// };

export type ThreadType =
  | "DIRECT"
  | "GROUP"
  | "STUDENT_CONTEXT"
  | "CASE_CONTEXT";

export type ThreadStatus = "ACTIVE" | "CLOSED" | "ARCHIVED";

export type ThreadScopeType =
  | "ORG"
  | "SCHOOL"
  | "CLASS"
  | "STUDENT"
  | "CASE"
  | "SUBJECT";

export type ThreadParticipantKind = "GUARDIAN" | "STAFF" | "STUDENT" | "SYSTEM";

export type MessageType =
  | "TEXT"
  | "SYSTEM"
  | "ATTACHMENT"
  | "IMAGE"
  | "FILE"
  | "VOICE";

export type MessageStatus = "SENT" | "DELETED" | "FAILED";

export type ThreadParticipantSummary = {
  uid: string;
  personId: string;
  kind: ThreadParticipantKind;
  roleKey: string;
  displayName: string;

  unreadCount: number;
  muted: boolean;

  lastReadAt?: number;
  archivedAt?: number;
};

export type Thread = {
  id: string;
  orgId: string;

  type: ThreadType;
  status: ThreadStatus;

  isInternal: boolean;

  scopeType: ThreadScopeType;
  scopeId: string;

  schoolId: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  classId: string;

  subjectKey: string;
  classSubjectOfferingId: string;

  studentId: string;
  caseId: string;

  createdByUid: string;
  createdByPersonId: string;
  createdByRoleKey: string;

  allowedRoleKeys: string[];

  participantPersonIds: string[];
  participantUids: string[];
  participants: ThreadParticipantSummary[];

  lastMessageSummary: string;
  lastMessageSenderUid: string;
  lastMessageSenderPersonId: string;
  lastMessageType: MessageType;
  lastMessageAt?: number;

  createdAt: number;
  updatedAt: number;

  [key: string]: unknown;
};

export type Message = {
  id: string;
  orgId: string;
  threadId: string;

  type: MessageType;
  status: MessageStatus;

  senderUid: string;
  senderPersonId: string;
  senderRoleKey: string;
  senderDisplayName: string;

  body: string;

  createdAt: number;
  updatedAt: number;

  editedAt?: number;
  deletedAt?: number;

  [key: string]: unknown;
};

export type SendThreadMessageInput = {
  orgId: string;
  threadId: string;
  body: string;
  type?: MessageType;
};

export type SendThreadMessageResult = {
  ok: true;
  messageId: string;
  threadId?: string;
  createdAt?: number;
};

export type CreateOrGetStudentContextThreadInput = {
  orgId: string;

  schoolId: string;
  academicYearId: string;
  termId?: string;
  gradeId?: string;
  classId?: string;

  subjectKey?: string;
  classSubjectOfferingId?: string;

  studentId: string;

  guardianUid?: string;
  guardianPersonId?: string;
  guardianDisplayName?: string;

  targetUid: string;
  targetPersonId?: string;
  targetRoleKey?: string;
  targetDisplayName?: string;
};
