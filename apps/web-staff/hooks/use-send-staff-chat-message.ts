"use client";

import { useCallback, useState } from "react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";
import { getErrorMessage } from "@/lib/error-message";

type SendStaffChatMessageInput = {
  orgId: string;
  groupId: string;
  body: string;
};

type SendStaffChatMessageResult = {
  ok: true;
  groupId: string;
  messageId: string;
};

export function useSendStaffChatMessage() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const sendMessage = useCallback(async (input: SendStaffChatMessageInput) => {
    const body = input.body.trim();
    if (!input.orgId || !input.groupId || !body) {
      setError("اكتب رسالة قبل الإرسال.");
      return null;
    }

    setSending(true);
    setError("");
    try {
      const callable = httpsCallable<
        SendStaffChatMessageInput,
        SendStaffChatMessageResult
      >(functions, "sendStaffChatMessage");
      const result = await callable({ ...input, body });
      return result.data;
    } catch (sendError) {
      setError(getErrorMessage(sendError));
      return null;
    } finally {
      setSending(false);
    }
  }, []);

  return { sendMessage, sending, error, clearError: () => setError("") };
}
