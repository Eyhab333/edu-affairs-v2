"use client";

import { useCallback, useState } from "react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

type SendThreadMessageInput = {
  orgId: string;
  threadId: string;
  body: string;
};

type SendThreadMessageResult = {
  ok: true;
  messageId: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "تعذر إرسال الرسالة";
}

export function useSendStaffThreadMessage() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const sendMessage = useCallback(
    async (input: SendThreadMessageInput) => {
      const body = input.body.trim();

      if (!input.orgId || !input.threadId || !body) {
        setError("اكتب رسالة قبل الإرسال");
        return null;
      }

      setSending(true);
      setError("");

      try {
        const callable = httpsCallable<
          SendThreadMessageInput,
          SendThreadMessageResult
        >(functions, "sendThreadMessage");

        const result = await callable({
          orgId: input.orgId,
          threadId: input.threadId,
          body,
        });

        return result.data;
      } catch (error) {
        const message = getErrorMessage(error);
        setError(message);
        return null;
      } finally {
        setSending(false);
      }
    },
    [],
  );

  return {
    sendMessage,
    sending,
    error,
    clearError: () => setError(""),
  };
}