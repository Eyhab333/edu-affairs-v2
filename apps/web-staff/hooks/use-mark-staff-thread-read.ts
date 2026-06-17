"use client";

import { useCallback, useState } from "react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

type MarkThreadReadInput = {
  orgId: string;
  threadId: string;
};

type MarkThreadReadResult = {
  ok: true;
  threadId: string;
  unreadCount: 0;
  lastReadAt: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "تعذر تعليم المحادثة كمقروءة";
}

export function useMarkStaffThreadRead() {
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  const markThreadRead = useCallback(async (input: MarkThreadReadInput) => {
    if (!input.orgId || !input.threadId) {
      return null;
    }

    setMarking(true);
    setError("");

    try {
      const callable = httpsCallable<
        MarkThreadReadInput,
        MarkThreadReadResult
      >(functions, "markThreadRead");

      const result = await callable({
        orgId: input.orgId,
        threadId: input.threadId,
      });

      return result.data;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Failed to mark thread as read", error);
      setError(message);
      return null;
    } finally {
      setMarking(false);
    }
  }, []);

  return {
    markThreadRead,
    marking,
    error,
  };
}