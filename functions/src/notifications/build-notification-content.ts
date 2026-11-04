import { BuiltNotificationContent, NotificationEventData } from "./types";

function stringFromPayload(
  payload: Record<string, unknown> | undefined,
  key: string,
  fallback = "",
) {
  const value = payload?.[key];
  return typeof value === "string" ? value : fallback;
}

export function buildNotificationContent(
  eventData: NotificationEventData,
): BuiltNotificationContent {
  const payload = eventData.payload ?? {};

  if (eventData.type === "VIRTUAL_CLASS_SCHEDULED") {
    return {
      title: "تمت جدولة حصة افتراضية",
      body: "لديك حصة افتراضية جديدة.",
      targetRoute: "VIRTUAL_CLASS_SESSION",
      targetParams: {
        sessionId: eventData.sourceId ?? "",
        classId: eventData.targetClassId ?? "",
        studentId: eventData.targetStudentId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "VIRTUAL_CLASS_SESSION",
        studentId: eventData.targetStudentId ?? "",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (eventData.type === "CHAT_MESSAGE_CREATED") {
    return {
      title: "رسالة جديدة",
      body: "لديك رسالة جديدة من المدرسة.",
      targetRoute: "CHAT_CONVERSATION",
      targetParams: {
        conversationId:
          eventData.targetConversationId ||
          stringFromPayload(payload, "conversationId"),
        threadId: eventData.targetThreadId ?? "",
        messageId: eventData.sourceId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        conversationId:
          eventData.targetConversationId ||
          stringFromPayload(payload, "conversationId"),
        threadId: eventData.targetThreadId ?? "",
        targetRoute: "CHAT_CONVERSATION",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (eventData.type === "STUDENT_TRANSPORT_ATTENDANCE_RECORDED") {
    const studentName = stringFromPayload(payload, "studentName", "الطالب");
    const tripKind = stringFromPayload(payload, "tripKind");
    const status = stringFromPayload(payload, "status");
    const studentId = eventData.targetStudentId ?? "";
    const serviceDate = stringFromPayload(payload, "serviceDate");

    return {
      title: "تحديث النقل المدرسي",
      body: transportAttendanceBody({ studentName, tripKind, status }),
      targetRoute: "STUDENT_TRANSPORT",
      targetParams: { studentId, serviceDate },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "STUDENT_TRANSPORT",
        studentId,
        serviceDate,
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (eventData.type === "HOMEWORK_PUBLISHED") {
    return {
      title: "واجب جديد",
      body: "تم نشر واجب جديد.",
      targetRoute: "HOMEWORK_ASSIGNMENT",
      targetParams: {
        homeworkId: eventData.sourceId ?? "",
        classId: eventData.targetClassId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "HOMEWORK_ASSIGNMENT",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (eventData.type === "GENERAL_ANNOUNCEMENT_PUBLISHED") {
    return {
      title: stringFromPayload(payload, "title", "تعميم جديد"),
      body: stringFromPayload(payload, "body", "لديك تعميم جديد من المدرسة."),
      targetRoute: "ANNOUNCEMENT",
      targetParams: {
        announcementId: eventData.sourceId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "ANNOUNCEMENT",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (
    eventData.type === "FINANCE_INVOICE_ISSUED" ||
    eventData.type === "FINANCE_PAYMENT_DUE" ||
    eventData.type === "FINANCE_PAYMENT_REMINDER" ||
    eventData.type === "FINANCE_BALANCE_UPDATED"
  ) {
    return {
      title: "إشعار مالي",
      body: "لديك تحديث مالي من المدرسة.",
      targetRoute: "FINANCE",
      targetParams: {
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        studentId: eventData.targetStudentId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "FINANCE",
        studentId: eventData.targetStudentId ?? "",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  if (eventData.type === "FINANCE_PAYMENT_RECEIVED") {
    return {
      title: "تم تسجيل دفعة",
      body: "تم تحديث السجل المالي.",
      targetRoute: "FINANCE",
      targetParams: {
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        studentId: eventData.targetStudentId ?? "",
      },
      data: {
        type: eventData.type,
        sourceType: eventData.sourceType ?? "",
        sourceId: eventData.sourceId ?? "",
        targetRoute: "FINANCE",
        studentId: eventData.targetStudentId ?? "",
      },
      channels: ["IN_APP", "PUSH"],
    };
  }

  return {
    title: "إشعار جديد",
    body: "لديك تحديث جديد في المنصة.",
    targetRoute: "NOTIFICATION_DETAILS",
    targetParams: {
      sourceType: eventData.sourceType ?? "",
      sourceId: eventData.sourceId ?? "",
    },
    data: {
      type: eventData.type ?? "CUSTOM",
      sourceType: eventData.sourceType ?? "",
      sourceId: eventData.sourceId ?? "",
      targetRoute: "NOTIFICATION_DETAILS",
    },
    channels: ["IN_APP", "PUSH"],
  };
}

function transportAttendanceBody(params: {
  studentName: string;
  tripKind: string;
  status: string;
}): string {
  const tripLabel = transportTripLabel(params.tripKind);

  switch (params.status) {
    case "BOARDED":
      return `تم تسجيل صعود ${params.studentName} في ${tripLabel}.`;
    case "NOT_BOARDED":
      return `تم تسجيل أن ${params.studentName} لم يصعد في ${tripLabel}.`;
    case "ARRIVED":
      return `تم تسجيل وصول ${params.studentName} إلى المدرسة.`;
    case "DROPPED_OFF":
      return `تم تسجيل نزول ${params.studentName} عند المنزل.`;
    case "ABSENT":
      return `تم تسجيل ${params.studentName} غائبًا في ${tripLabel}.`;
    case "EXCUSED":
      return `تم تسجيل ${params.studentName} بعذر في ${tripLabel}.`;
    case "LATE":
      return `تم تسجيل ${params.studentName} متأخرًا في ${tripLabel}.`;
    case "ISSUE":
      return `تم تسجيل ملاحظة على رحلة ${params.studentName} في ${tripLabel}.`;
    default:
      return `تم تحديث حالة نقل ${params.studentName} في ${tripLabel}.`;
  }
}

function transportTripLabel(tripKind: string): string {
  switch (tripKind) {
    case "MORNING_PICKUP":
      return "الصعود الصباحي";
    case "MORNING_ARRIVAL":
      return "الوصول إلى المدرسة";
    case "AFTERNOON_BOARDING":
      return "الصعود وقت الانصراف";
    case "AFTERNOON_DROPOFF":
      return "النزول عند المنزل";
    default:
      return "رحلة النقل";
  }
}
