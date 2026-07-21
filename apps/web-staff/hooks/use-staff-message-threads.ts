"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
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

export type StaffMessageThread = {
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

  unreadCount: number;

  hasActiveUrgentRequest: boolean;
  activeUrgentRequestId: string;
  urgentStatus: string;
  urgentCurrentLevel: string;
  urgentCurrentAssigneeUid: string;
  urgentCurrentDeadlineAt: number;
  activeUrgentTemporalWorkflowId: string;

  createdAt: number;
  updatedAt: number;
};

function readString(data: Record<string, unknown>, key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "number" ? value : 0;
}

function readBoolean(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "boolean" ? value : false;
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

function threadFromDoc(
  snapshot: QueryDocumentSnapshot,
  currentUid: string,
): StaffMessageThread {
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

    unreadCount: currentParticipant?.unreadCount ?? 0,

    hasActiveUrgentRequest: readBoolean(data, "hasActiveUrgentRequest"),
    activeUrgentRequestId: readString(data, "activeUrgentRequestId"),
    urgentStatus: readString(data, "urgentStatus"),
    urgentCurrentLevel: readString(data, "urgentCurrentLevel"),
    urgentCurrentAssigneeUid: readString(data, "urgentCurrentAssigneeUid"),
    urgentCurrentDeadlineAt: readNumber(data, "urgentCurrentDeadlineAt"),
    activeUrgentTemporalWorkflowId: readString(
      data,
      "activeUrgentTemporalWorkflowId",
    ),

    createdAt: readNumber(data, "createdAt"),
    updatedAt: readNumber(data, "updatedAt"),
  };
}

export function useStaffMessageThreads() {
  const { actor, user } = useStaffActor();

  const uid = user.uid;
  const orgId = actor.orgId || "takween";

  const [threads, setThreads] = useState<StaffMessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid || !orgId) {
      setThreads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const threadsRef = collection(db, `orgs/${orgId}/threads`);
    const threadsQuery = query(
      threadsRef,
      where("participantUids", "array-contains", uid),
    );

    const unsubscribe = onSnapshot(
      threadsQuery,
      (snapshot) => {
        const nextThreads = snapshot.docs
          .map((doc) => threadFromDoc(doc, uid))
          .sort((a, b) => {
            if (a.hasActiveUrgentRequest !== b.hasActiveUrgentRequest) {
              return a.hasActiveUrgentRequest ? -1 : 1;
            }

            const aTime = a.lastMessageAt || a.updatedAt || a.createdAt || 0;
            const bTime = b.lastMessageAt || b.updatedAt || b.createdAt || 0;
            return bTime - aTime;
          });

        setThreads(nextThreads);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load staff message threads", err);
        setError(err.message || "تعذر تحميل المحادثات");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [uid, orgId]);

  const unreadCount = useMemo(() => {
    return threads.reduce((total, thread) => total + thread.unreadCount, 0);
  }, [threads]);

  return {
    threads,
    unreadCount,
    loading,
    error,
  };
}
