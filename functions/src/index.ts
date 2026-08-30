import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

setGlobalOptions({ memory: "512MiB" });

initializeApp();

export { onNotificationEventCreated } from "./notifications/on-notification-event-created";
export { sendThreadMessage } from "./messaging/send-thread-message";
export { onThreadMessageCreated } from "./messaging/on-thread-message-created";
export { createOrGetStudentContextThread } from "./messaging/create-or-get-student-context-thread";
export { markThreadRead } from "./messaging/mark-thread-read";
export { getStudentCommunicationTargets } from "./messaging/get-student-communication-targets";
export { createVirtualClassSessionWithMeet } from "./virtual-classes/create-virtual-class-session-with-meet";
export { importGoogleMeetAttendance } from "./virtual-classes/import-google-meet-attendance";
export { registerStudentInActivity } from "./activities/register-student-in-activity";
export { createUrgentStudentRequest } from "./messaging/create-urgent-student-request";
export { createStudentFeeCharge } from "./guardian-finance/create-student-fee-charge";
export { createGuardianPaymentDraft } from "./guardian-finance/create-guardian-payment-draft";
export { postGuardianPayment } from "./guardian-finance/post-guardian-payment";
export { reverseGuardianPayment } from "./guardian-finance/reverse-guardian-payment";
export { getGuardianFinanceWorkspace } from "./guardian-finance/get-guardian-finance-workspace";
export { getMyGuardianFinanceOverview } from "./guardian-finance/get-my-guardian-finance-overview";
export { approveEvaluationSubmission } from "./evaluations/approve-evaluation-submission";
export { createPerformanceImprovementPlan } from "./evaluations/create-performance-improvement-plan";
export { updatePerformanceImprovementPlan } from "./evaluations/update-performance-improvement-plan";
export { dismissPerformanceImprovementSignal } from "./evaluations/dismiss-performance-improvement-signal";
export { updatePerformanceImprovementSettings } from "./evaluations/update-performance-improvement-settings";
export * from "./student-directory";
export { getStudentCaseReferralOptions } from "./student-cases/get-student-case-referral-options";
export { getClassRoster } from "./class-roster/get-class-roster";
export { getVisibleStudents } from "./visible-students/get-visible-students";
export {
  getStudentWorkDetail,
  getStudentWorkOverview,
} from "./student-work/student-work";
export {
  getTeacherWorkDetail,
  getTeacherWorkOverview,
} from "./teacher-work/teacher-work";
export { getPdfResourceAcknowledgementReport } from "./pdf-resources/get-pdf-resource-acknowledgement-report";
export { listMyPdfResources } from "./pdf-resources/list-my-pdf-resources";
export { listMyTeachingPdfResources } from "./pdf-resources/list-my-teaching-pdf-resources";
export { getMyGuardianChildren } from "./guardian/get-my-guardian-children";
export { getMyGuardianAttendance } from "./guardian/get-my-guardian-attendance";
export { getMyGuardianGamification } from "./guardian/get-my-guardian-gamification";
export { getMyGuardianNotes } from "./guardian/get-my-guardian-notes";
export { getMyGuardianVirtualClasses } from "./guardian/get-my-guardian-virtual-classes";
export { markMyGuardianVirtualClassJoin } from "./guardian/mark-my-guardian-virtual-class-join";
export {
  archiveStaffPortfolioItem,
  beginStaffPortfolioItem,
  completeStaffPortfolioUpload,
  getStaffPortfolioFileUrl,
  listMyStaffPortfolioItems,
  listTeacherPortfolioItems,
} from "./staff-portfolio/staff-portfolio";

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
