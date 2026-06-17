"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc as firestoreDoc,
  onSnapshot,
  query,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db } from "@/lib/firebase";

type ThreadParticipantKind = "GUARDIAN" | "STAFF" | "STUDENT" | "SYSTEM";

type ThreadParticipantSummary = {
  uid: string;
  personId: string;
  kind: ThreadParticipantKind;
  roleKey: string;
  displayName: string;
  lastReadAt?: number;
  unreadCount: number;
  muted: boolean;
  archivedAt?: number;
};

export type StaffMessageThreadDetails = {
  id: string;
  orgId: string;

  type: string;
  status: string;
  isInternal: boolean;

  schoolId: string;
  academicYearId: string;
  classId: string;
  studentId: string;
  caseId: string;

  participantUids: string[];
  participants: ThreadParticipantSummary[];

  currentParticipant: ThreadParticipantSummary | null;
  otherParticipants: ThreadParticipantSummary[];
  otherDisplayName: string;

  lastMessageSummary: string;
  lastMessageAt: number;
  lastMessageSenderUid: string;
  lastMessageType: string;

  createdAt: number;
  updatedAt: number;
};

export type StaffThreadMessage = {
  id: string;
  orgId: string;
  threadId: string;

  type: string;
  status: string;

  senderUid: string;
  senderPersonId: string;
  senderRoleKey: string;
  senderDisplayName: string;

  body: string;

  createdAt: number;
  updatedAt: number;
};

function readString(data: Record<string, unknown>, key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(data: Record<string, unknown>, key: string) {
  return readMillis(data[key]);
}

function readBoolean(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "boolean" ? value : false;
}

function readMillis(value: unknown) {
  if (typeof value === "number") return value;

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }

  return 0;
}

function readStringArray(data: Record<string, unknown>, key: string) {
  const value = data[key];

  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function readParticipants(
  data: Record<string, unknown>,
): ThreadParticipantSummary[] {
  const value = data.participants;

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => {
      return !!item && typeof item === "object" && !Array.isArray(item);
    })
    .map((item) => ({
      uid: readString(item, "uid"),
      personId: readString(item, "personId"),
      kind: readString(item, "kind", "STAFF") as ThreadParticipantKind,
      roleKey: readString(item, "roleKey"),
      displayName: readString(item, "displayName", "مشارك"),
      lastReadAt: readNumber(item, "lastReadAt") || undefined,
      unreadCount: readNumber(item, "unreadCount"),
      muted: readBoolean(item, "muted"),
      archivedAt: readNumber(item, "archivedAt") || undefined,
    }));
}

function threadFromSnapshot(
  snapshot: DocumentSnapshot,
  currentUid: string,
): StaffMessageThreadDetails | null {
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as Record<string, unknown>;

  const participants = readParticipants(data);
  const currentParticipant =
    participants.find((participant) => participant.uid === currentUid) ?? null;

  const otherParticipants = participants.filter(
    (participant) => participant.uid !== currentUid,
  );

  const otherDisplayName =
    otherParticipants
      .map((participant) => participant.displayName)
      .filter(Boolean)
      .join("، ") || "محادثة";

  return {
    id: snapshot.id,
    orgId: readString(data, "orgId"),

    type: readString(data, "type", "DIRECT"),
    status: readString(data, "status", "ACTIVE"),
    isInternal: readBoolean(data, "isInternal"),

    schoolId: readString(data, "schoolId"),
    academicYearId: readString(data, "academicYearId"),
    classId: readString(data, "classId"),
    studentId: readString(data, "studentId"),
    caseId: readString(data, "caseId"),

    participantUids: readStringArray(data, "participantUids"),
    participants,

    currentParticipant,
    otherParticipants,
    otherDisplayName,

    lastMessageSummary: readString(data, "lastMessageSummary"),
    lastMessageAt: readNumber(data, "lastMessageAt"),
    lastMessageSenderUid: readString(data, "lastMessageSenderUid"),
    lastMessageType: readString(data, "lastMessageType", "TEXT"),

    createdAt: readNumber(data, "createdAt"),
    updatedAt: readNumber(data, "updatedAt"),
  };
}

function messageFromDoc(snapshot: QueryDocumentSnapshot): StaffThreadMessage {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    orgId: readString(data, "orgId"),
    threadId: readString(data, "threadId"),

    type: readString(data, "type", "TEXT"),
    status: readString(data, "status", "SENT"),

    senderUid: readString(data, "senderUid"),
    senderPersonId: readString(data, "senderPersonId"),
    senderRoleKey: readString(data, "senderRoleKey"),
    senderDisplayName: readString(data, "senderDisplayName", "مشارك"),

    body:
      readString(data, "body") ||
      readString(data, "text") ||
      readString(data, "content") ||
      readString(data, "message"),

    createdAt: readNumber(data, "createdAt"),
    updatedAt: readNumber(data, "updatedAt"),
  };
}

export function useStaffThreadMessages(threadId: string) {
  const { actor, user } = useStaffActor();

  const uid = user.uid;
  const orgId = actor.orgId || "takween";

  const [thread, setThread] = useState<StaffMessageThreadDetails | null>(null);
  const [messages, setMessages] = useState<StaffThreadMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid || !orgId || !threadId) {
      setThread(null);
      setMessages([]);
      setLoadingThread(false);
      setLoadingMessages(false);
      return;
    }

    setError("");
    setLoadingThread(true);
    setLoadingMessages(true);

    const threadRef = firestoreDoc(db, `orgs/${orgId}/threads/${threadId}`);
    const messagesRef = collection(
      db,
      `orgs/${orgId}/threads/${threadId}/messages`,
    );

    const messagesQuery = query(messagesRef);

    const unsubscribeThread = onSnapshot(
      threadRef,
      (snapshot) => {
        const nextThread = threadFromSnapshot(snapshot, uid);

        if (!nextThread) {
          setThread(null);
          setError("المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها");
        } else {
          setThread(nextThread);
        }

        setLoadingThread(false);
      },
      (err) => {
        console.error("Failed to load staff message thread", err);
        setError(err.message || "تعذر تحميل المحادثة");
        setLoadingThread(false);
      },
    );

    const unsubscribeMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const nextMessages = snapshot.docs
          .map(messageFromDoc)
          .sort((a, b) => {
            const aTime = a.createdAt || a.updatedAt || 0;
            const bTime = b.createdAt || b.updatedAt || 0;
            return aTime - bTime;
          });

        setMessages(nextMessages);
        setLoadingMessages(false);
      },
      (err) => {
        console.error("Failed to load staff thread messages", err);
        setError(err.message || "تعذر تحميل رسائل المحادثة");
        setLoadingMessages(false);
      },
    );

    return () => {
      unsubscribeThread();
      unsubscribeMessages();
    };
  }, [uid, orgId, threadId]);

  const loading = loadingThread || loadingMessages;

  const currentParticipant = useMemo(() => {
    return thread?.participants.find((participant) => participant.uid === uid) ?? null;
  }, [thread, uid]);

  const otherParticipants = useMemo(() => {
    return thread?.participants.filter((participant) => participant.uid !== uid) ?? [];
  }, [thread, uid]);

  return {
    uid,
    orgId,
    thread,
    messages,
    currentParticipant,
    otherParticipants,
    loading,
    error,
  };
}