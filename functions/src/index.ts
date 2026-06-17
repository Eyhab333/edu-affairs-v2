import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";

initializeApp();

export { onNotificationEventCreated } from "./notifications/on-notification-event-created";
export { sendThreadMessage } from "./messaging/send-thread-message";
export { onThreadMessageCreated } from "./messaging/on-thread-message-created";
export { createOrGetStudentContextThread } from "./messaging/create-or-get-student-context-thread";
export { markThreadRead } from "./messaging/mark-thread-read";
export { getStudentCommunicationTargets } from "./messaging/get-student-communication-targets";

export const functionsHealth = onRequest(
  {
    region: "me-central2",
    cors: true,
  },
  (_request, response) => {
    response.json({
      ok: true,
      service: "edu-affairs-functions",
      region: "me-central2",
      timestamp: Date.now(),
    });
  },
);