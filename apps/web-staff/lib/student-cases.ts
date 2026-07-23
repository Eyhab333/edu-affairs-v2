import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import type {
  StudentCase,
  StudentCaseEvent,
  StudentCaseEventType,
  StudentCaseParentVisibility,
  StudentCasePriority,
  StudentCaseStatus,
} from "@takween/contracts";
import { StudentCaseEventSchema, StudentCaseSchema } from "@takween/contracts";

import { db } from "@/lib/firebase";

export type StudentCaseActorInput = {
  personId: string;
  roleKey?: string;
  displayName?: string;
};

export type StudentCaseAssigneeInput = {
  personId: string;
  roleKey?: string;
  displayName?: string;
};

export type StudentCaseStudentInput = {
  studentId: string;
  studentPersonId?: string;
  studentDisplayName: string;

  gradeId?: string;
  gradeTitle?: string;

  classId?: string;
  classTitle?: string;
};

export type CreateStudentCaseReferralInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;

  termId?: string;
  termTitle?: string;
  termShortTitle?: string;

  student: StudentCaseStudentInput;

  title: string;
  description: string;

  caseTypeKey: string;
  caseTypeTitle?: string;

  priority?: StudentCasePriority;

  createdBy: StudentCaseActorInput;
  assignee?: StudentCaseAssigneeInput;

  parentVisibility?: StudentCaseParentVisibility;
  parentVisibleSummary?: string;
};

export type AddStudentCaseActionInput = {
  orgId: string;
  caseId: string;

  actor: StudentCaseActorInput;

  eventType?: Extract<
    StudentCaseEventType,
    | "COMMENT_ADDED"
    | "ACTION_ADDED"
    | "PARENT_CONTACTED"
    | "RESOLVED"
    | "CLOSED"
    | "REOPENED"
    | "CANCELLED"
    | "VISIBILITY_CHANGED"
  >;

  note?: string;
  internalNote?: string;
  parentVisibleNote?: string;

  statusAfter?: StudentCaseStatus;
  parentVisibility?: StudentCaseParentVisibility;
  parentVisibleSummary?: string;
};

export type TransferStudentCaseInput = {
  orgId: string;
  caseId: string;

  actor: StudentCaseActorInput;
  toAssignee: StudentCaseAssigneeInput;

  note?: string;
  internalNote?: string;

  eventType?: Extract<StudentCaseEventType, "TRANSFERRED" | "ESCALATED" | "RETURNED">;
  statusAfter?: StudentCaseStatus;
};

function nowMs() {
  return Date.now();
}

function studentCasesCollectionPath(orgId: string) {
  return `orgs/${orgId}/studentCases`;
}

function studentCaseDocPath(orgId: string, caseId: string) {
  return `orgs/${orgId}/studentCases/${caseId}`;
}

function studentCaseEventsCollectionPath(orgId: string, caseId: string) {
  return `orgs/${orgId}/studentCases/${caseId}/events`;
}

function cleanForFirestore<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function buildStatusTimestampPatch(status?: StudentCaseStatus, at = nowMs()) {
  if (status === "RESOLVED") {
    return { resolvedAt: at };
  }

  if (status === "CLOSED") {
    return { closedAt: at };
  }

  if (status === "CANCELLED") {
    return { cancelledAt: at };
  }

  return {};
}

function parseStudentCase(id: string, data: unknown): StudentCase {
  return StudentCaseSchema.parse({
    id,
    ...(data as Record<string, unknown>),
  });
}

function parseStudentCaseEvent(id: string, data: unknown): StudentCaseEvent {
  return StudentCaseEventSchema.parse({
    id,
    ...(data as Record<string, unknown>),
  });
}

export async function createStudentCaseReferral(
  input: CreateStudentCaseReferralInput
): Promise<StudentCase> {
  const at = nowMs();

  const caseRef = doc(collection(db, studentCasesCollectionPath(input.orgId)));
  const eventCreatedRef = doc(
    collection(db, studentCaseEventsCollectionPath(input.orgId, caseRef.id))
  );

  const eventReferredRef = input.assignee
    ? doc(collection(db, studentCaseEventsCollectionPath(input.orgId, caseRef.id)))
    : null;

  const studentCase: StudentCase = StudentCaseSchema.parse(
    cleanForFirestore({
      id: caseRef.id,

      orgId: input.orgId,
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,

      termId: input.termId,
      termTitle: input.termTitle,
      termShortTitle: input.termShortTitle,

      studentId: input.student.studentId,
      studentPersonId: input.student.studentPersonId,
      studentDisplayName: input.student.studentDisplayName,

      gradeId: input.student.gradeId,
      gradeTitle: input.student.gradeTitle,

      classId: input.student.classId,
      classTitle: input.student.classTitle,

      title: input.title,
      description: input.description,

      caseTypeKey: input.caseTypeKey,
      caseTypeTitle: input.caseTypeTitle,

      priority: input.priority ?? "NORMAL",
      status: "OPEN",

      currentAssigneePersonId: input.assignee?.personId,
      currentAssigneeRoleKey: input.assignee?.roleKey,
      currentAssigneeDisplayName: input.assignee?.displayName,

      createdByPersonId: input.createdBy.personId,
      createdByRoleKey: input.createdBy.roleKey,
      createdByDisplayName: input.createdBy.displayName,

      parentVisibility: input.parentVisibility ?? "INTERNAL_ONLY",
      parentVisibleSummary: input.parentVisibleSummary,

      isArchived: false,

      createdAt: at,
      updatedAt: at,
    })
  );

  const createdEvent: StudentCaseEvent = StudentCaseEventSchema.parse(
    cleanForFirestore({
      id: eventCreatedRef.id,

      caseId: caseRef.id,

      orgId: input.orgId,
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,

      eventType: "CREATED",

      createdByPersonId: input.createdBy.personId,
      createdByRoleKey: input.createdBy.roleKey,
      createdByDisplayName: input.createdBy.displayName,

      statusAfter: "OPEN",

      note: input.description,

      createdAt: at,
    })
  );

  const batch = writeBatch(db);

  batch.set(caseRef, cleanForFirestore(studentCase));
  batch.set(eventCreatedRef, cleanForFirestore(createdEvent));

  if (input.assignee && eventReferredRef) {
    const referredEvent: StudentCaseEvent = StudentCaseEventSchema.parse(
      cleanForFirestore({
        id: eventReferredRef.id,

        caseId: caseRef.id,

        orgId: input.orgId,
        schoolId: input.schoolId,
        academicYearId: input.academicYearId,

        eventType: "REFERRED",

        createdByPersonId: input.createdBy.personId,
        createdByRoleKey: input.createdBy.roleKey,
        createdByDisplayName: input.createdBy.displayName,

        toAssigneePersonId: input.assignee.personId,
        toAssigneeRoleKey: input.assignee.roleKey,
        toAssigneeDisplayName: input.assignee.displayName,

        statusBefore: "OPEN",
        statusAfter: "OPEN",

        createdAt: at,
      })
    );

    batch.set(eventReferredRef, cleanForFirestore(referredEvent));
  }

  await batch.commit();

  return studentCase;
}

export async function getStudentCase(params: {
  orgId: string;
  caseId: string;
}): Promise<StudentCase | null> {
  const ref = doc(db, studentCaseDocPath(params.orgId, params.caseId));
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return parseStudentCase(snap.id, snap.data());
}

export async function getStudentCaseEvents(params: {
  orgId: string;
  caseId: string;
}): Promise<StudentCaseEvent[]> {
  const eventsRef = collection(
    db,
    studentCaseEventsCollectionPath(params.orgId, params.caseId)
  );

  const snap = await getDocs(query(eventsRef, orderBy("createdAt", "asc")));

  return snap.docs.map((item) => parseStudentCaseEvent(item.id, item.data()));
}

export async function getCasesAssignedToMe(params: {
  orgId: string;
  personId: string;
  schoolIds: string[];
  maxResults?: number;
}): Promise<StudentCase[]> {
  const allowedSchoolIds = Array.from(
    new Set(
      params.schoolIds
        .map((schoolId) => schoolId.trim())
        .filter(Boolean),
    ),
  );

  if (allowedSchoolIds.length === 0) {
    return [];
  }

  const casesRef = collection(
    db,
    studentCasesCollectionPath(params.orgId),
  );

  const snapshots = await Promise.all(
    allowedSchoolIds.map((schoolId) =>
      getDocs(
        query(
          casesRef,
          where("schoolId", "==", schoolId),
          where(
            "currentAssigneePersonId",
            "==",
            params.personId,
          ),
        ),
      ),
    ),
  );

  const byCaseId = new Map<string, StudentCase>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      const studentCase = parseStudentCase(
        item.id,
        item.data(),
      );

      if (studentCase.isArchived !== true) {
        byCaseId.set(studentCase.id, studentCase);
      }
    }
  }

  return Array.from(byCaseId.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, params.maxResults ?? 50);
}

export async function getCasesCreatedByMe(params: {
  orgId: string;
  personId: string;
  schoolIds: string[];
  maxResults?: number;
}): Promise<StudentCase[]> {
  const allowedSchoolIds = Array.from(
    new Set(
      params.schoolIds
        .map((schoolId) => schoolId.trim())
        .filter(Boolean),
    ),
  );

  if (allowedSchoolIds.length === 0) {
    return [];
  }

  const casesRef = collection(
    db,
    studentCasesCollectionPath(params.orgId),
  );

  const snapshots = await Promise.all(
    allowedSchoolIds.map((schoolId) =>
      getDocs(
        query(
          casesRef,
          where("schoolId", "==", schoolId),
          where(
            "createdByPersonId",
            "==",
            params.personId,
          ),
        ),
      ),
    ),
  );

  const byCaseId = new Map<string, StudentCase>();

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      const studentCase = parseStudentCase(
        item.id,
        item.data(),
      );

      if (studentCase.isArchived !== true) {
        byCaseId.set(studentCase.id, studentCase);
      }
    }
  }

  return Array.from(byCaseId.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, params.maxResults ?? 50);
}

export async function addStudentCaseAction(
  input: AddStudentCaseActionInput
): Promise<void> {
  const at = nowMs();

  const caseRef = doc(db, studentCaseDocPath(input.orgId, input.caseId));
  const caseSnap = await getDoc(caseRef);

  if (!caseSnap.exists()) {
    throw new Error("لم يتم العثور على القضية");
  }

  const studentCase = parseStudentCase(caseSnap.id, caseSnap.data());
  const statusAfter = input.statusAfter ?? studentCase.status;

  const eventRef = doc(
    collection(db, studentCaseEventsCollectionPath(input.orgId, input.caseId))
  );

  const event: StudentCaseEvent = StudentCaseEventSchema.parse(
    cleanForFirestore({
      id: eventRef.id,

      caseId: input.caseId,

      orgId: studentCase.orgId,
      schoolId: studentCase.schoolId,
      academicYearId: studentCase.academicYearId,

      eventType: input.eventType ?? "ACTION_ADDED",

      createdByPersonId: input.actor.personId,
      createdByRoleKey: input.actor.roleKey,
      createdByDisplayName: input.actor.displayName,

      statusBefore: studentCase.status,
      statusAfter,

      note: input.note,
      internalNote: input.internalNote,
      parentVisibleNote: input.parentVisibleNote,

      createdAt: at,
    })
  );

  const updatePatch = cleanForFirestore({
    status: statusAfter,
    parentVisibility: input.parentVisibility,
    parentVisibleSummary: input.parentVisibleSummary,
    updatedAt: at,
    ...buildStatusTimestampPatch(statusAfter, at),
  });

  const batch = writeBatch(db);

  batch.update(caseRef, updatePatch);
  batch.set(eventRef, cleanForFirestore(event));

  await batch.commit();
}

export async function transferStudentCase(
  input: TransferStudentCaseInput
): Promise<void> {
  const at = nowMs();

  const caseRef = doc(db, studentCaseDocPath(input.orgId, input.caseId));
  const caseSnap = await getDoc(caseRef);

  if (!caseSnap.exists()) {
    throw new Error("لم يتم العثور على القضية");
  }

  const studentCase = parseStudentCase(caseSnap.id, caseSnap.data());
  const statusAfter = input.statusAfter ?? studentCase.status;

  const eventRef = doc(
    collection(db, studentCaseEventsCollectionPath(input.orgId, input.caseId))
  );

  const event: StudentCaseEvent = StudentCaseEventSchema.parse(
    cleanForFirestore({
      id: eventRef.id,

      caseId: input.caseId,

      orgId: studentCase.orgId,
      schoolId: studentCase.schoolId,
      academicYearId: studentCase.academicYearId,

      eventType: input.eventType ?? "TRANSFERRED",

      createdByPersonId: input.actor.personId,
      createdByRoleKey: input.actor.roleKey,
      createdByDisplayName: input.actor.displayName,

      fromAssigneePersonId: studentCase.currentAssigneePersonId,
      fromAssigneeRoleKey: studentCase.currentAssigneeRoleKey,
      fromAssigneeDisplayName: studentCase.currentAssigneeDisplayName,

      toAssigneePersonId: input.toAssignee.personId,
      toAssigneeRoleKey: input.toAssignee.roleKey,
      toAssigneeDisplayName: input.toAssignee.displayName,

      statusBefore: studentCase.status,
      statusAfter,

      note: input.note,
      internalNote: input.internalNote,

      createdAt: at,
    })
  );

  const updatePatch = cleanForFirestore({
    currentAssigneePersonId: input.toAssignee.personId,
    currentAssigneeRoleKey: input.toAssignee.roleKey,
    currentAssigneeDisplayName: input.toAssignee.displayName,
    status: statusAfter,
    updatedAt: at,
    ...buildStatusTimestampPatch(statusAfter, at),
  });

  const batch = writeBatch(db);

  batch.update(caseRef, updatePatch);
  batch.set(eventRef, cleanForFirestore(event));

  await batch.commit();
}