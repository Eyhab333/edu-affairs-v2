"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { db, functions } from "@/lib/firebase";
import { getErrorMessage } from "@/lib/error-message";

export type StaffChatGroup = {
  id: string;
  displayName: string;
  groupKind: "SCHOOL" | "SPECIAL";
  schoolId: string;
  status: "ACTIVE" | "ARCHIVED";
  lastMessageSummary: string;
  lastMessageAt: number;
  lastMessageSenderUid: string;
  updatedAt: number;
};

type GetStaffChatGroupsInput = { orgId: string };
type GetStaffChatGroupsResult = { groups: Array<Record<string, unknown>> };

function readString(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  return typeof value === "number" ? value : 0;
}

function toGroup(id: string, data: Record<string, unknown>): StaffChatGroup {
  return {
    id,
    displayName: readString(data, "displayName") || "مجموعة الموظفين",
    groupKind: readString(data, "groupKind") === "SCHOOL" ? "SCHOOL" : "SPECIAL",
    schoolId: readString(data, "schoolId"),
    status: readString(data, "status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    lastMessageSummary: readString(data, "lastMessageSummary"),
    lastMessageAt: readNumber(data, "lastMessageAt"),
    lastMessageSenderUid: readString(data, "lastMessageSenderUid"),
    updatedAt: readNumber(data, "updatedAt"),
  };
}

function sortGroups(groups: StaffChatGroup[]) {
  return [...groups].sort((left, right) => {
    const leftTime = left.lastMessageAt || left.updatedAt;
    const rightTime = right.lastMessageAt || right.updatedAt;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.displayName.localeCompare(right.displayName, "ar");
  });
}

export function useStaffChatGroups() {
  const { actor } = useStaffActor();
  const orgId = actor.orgId;
  const [groups, setGroups] = useState<StaffChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribes: Array<() => void> = [];

    async function load() {
      if (!orgId) {
        setGroups([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const callable = httpsCallable<
          GetStaffChatGroupsInput,
          GetStaffChatGroupsResult
        >(functions, "getStaffChatGroups");
        const result = await callable({ orgId });
        if (!active) return;

        const initialGroups = result.data.groups
          .filter((item): item is Record<string, unknown> => !!item)
          .map((item) => toGroup(readString(item, "id"), item))
          .filter((group) => !!group.id && group.status === "ACTIVE");

        setGroups(sortGroups(initialGroups));
        setLoading(false);

        for (const initialGroup of initialGroups) {
          const unsubscribe = onSnapshot(
            doc(db, `orgs/${orgId}/staffChatGroups/${initialGroup.id}`),
            (snapshot) => {
              if (!active || !snapshot.exists()) return;

              const group = toGroup(snapshot.id, snapshot.data());
              setGroups((current) =>
                sortGroups(
                  current
                    .filter((item) => item.id !== group.id)
                    .concat(group.status === "ACTIVE" ? [group] : []),
                ),
              );
            },
            (snapshotError) => {
              if (!active) return;
              setError(getErrorMessage(snapshotError));
            },
          );
          unsubscribes.push(unsubscribe);
        }
      } catch (loadError) {
        if (!active) return;
        setGroups([]);
        setError(getErrorMessage(loadError));
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [orgId]);

  return { groups, loading, error };
}
