"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db } from "@/lib/firebase";
import { getErrorMessage } from "@/lib/error-message";

export type StaffChatMessage = {
  id: string;
  senderUid: string;
  senderPersonId: string;
  senderRoleKey: string;
  senderDisplayName: string;
  body: string;
  createdAt: number;
};

function readString(data: Record<string, unknown>, field: string, fallback = "") {
  const value = data[field];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(data: Record<string, unknown>, field: string) {
  const value = data[field];
  return typeof value === "number" ? value : 0;
}

export function useStaffChatMessages(groupId: string) {
  const { actor } = useStaffActor();
  const orgId = actor.orgId;
  const [messages, setMessages] = useState<StaffChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId || !groupId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const messagesRef = collection(
      db,
      `orgs/${orgId}/staffChatGroups/${groupId}/messages`,
    );
    const unsubscribe = onSnapshot(
      query(messagesRef, orderBy("createdAt", "asc")),
      (snapshot) => {
        setMessages(
          snapshot.docs.map((message) => {
            const data = message.data() as Record<string, unknown>;
            return {
              id: message.id,
              senderUid: readString(data, "senderUid"),
              senderPersonId: readString(data, "senderPersonId"),
              senderRoleKey: readString(data, "senderRoleKey"),
              senderDisplayName: readString(data, "senderDisplayName", "موظف"),
              body: readString(data, "body"),
              createdAt: readNumber(data, "createdAt"),
            };
          }),
        );
        setLoading(false);
      },
      (snapshotError) => {
        setMessages([]);
        setError(getErrorMessage(snapshotError));
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [groupId, orgId]);

  return { messages, loading, error };
}
