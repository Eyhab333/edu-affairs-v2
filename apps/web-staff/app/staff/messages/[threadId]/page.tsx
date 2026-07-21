"use client";

import { SyntheticEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useSendStaffThreadMessage } from "@/hooks/use-send-staff-thread-message";
import { useStaffThreadMessages } from "@/hooks/use-staff-thread-messages";
import { useMarkStaffThreadRead } from "@/hooks/use-mark-staff-thread-read";

function formatDateTime(timestamp: number) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getThreadTypeLabel(type: string, isInternal: boolean) {
  if (isInternal) return "داخلي";

  if (type === "STUDENT_CONTEXT") return "مرتبطة بطالب";
  if (type === "CASE_CONTEXT") return "مرتبطة بقضية";
  if (type === "GROUP") return "مجموعة";

  return "مباشرة";
}

function getUrgentLevelLabel(level: string) {
  if (level === "TEACHER") return "المعلم";
  if (level === "COUNSELOR") return "المرشد";
  if (level === "PRINCIPAL") return "المدير";
  if (level === "SUPERVISION_HEAD") return "رئيس الإشراف";

  return level || "غير محدد";
}

function getUrgentStatusLabel(status: string) {
  if (status === "ACTIVE") return "نشط";
  if (status === "RESPONDED") return "تم الرد";
  if (status === "ESCALATED") return "تم التصعيد";
  if (status === "CLOSED") return "مغلق";
  if (status === "CANCELLED") return "ملغي";

  return status || "نشط";
}

function getTimelineEventTypeLabel(type: string) {
  if (type === "URGENT_REQUEST_CREATED") return "إنشاء الطلب";
  if (type === "SLA_STARTED") return "بدء المهلة";
  if (type === "ASSIGNED") return "تعيين المسؤول";
  if (type === "MESSAGE_SENT") return "رسالة";
  if (type === "RESPONSIBLE_REPLIED") return "تم الرد";
  if (type === "DEADLINE_MISSED") return "انتهت المهلة";
  if (type === "ESCALATED") return "تصعيد";
  if (type === "CLOSED") return "إغلاق";
  if (type === "CANCELLED") return "إلغاء";
  if (type === "SYSTEM_NOTE") return "ملاحظة نظام";

  return type || "حدث";
}

function formatUrgentDeadline(timestamp: number) {
  if (!timestamp) return "بدون موعد محدد";

  const formatted = formatDateTime(timestamp);

  if (timestamp < Date.now()) {
    return `تجاوز الموعد: ${formatted}`;
  }

  return `مطلوب الرد قبل: ${formatted}`;
}

export default function StaffMessageThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = typeof params.threadId === "string" ? params.threadId : "";

  const {
    uid,
    orgId,
    thread,
    messages,
    urgentTimelineEvents,
    currentParticipant,
    loading,
    error,
    otherParticipants,
  } = useStaffThreadMessages(threadId);

  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastMarkedReadKeyRef = useRef("");

  const { markThreadRead } = useMarkStaffThreadRead();

  const {
    sendMessage,
    sending,
    error: sendError,
    clearError,
  } = useSendStaffThreadMessage();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!thread || !orgId || !threadId) return;

    const unreadCount = currentParticipant?.unreadCount ?? 0;

    if (unreadCount <= 0) return;

    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : null;

    const latestMessageAt =
      lastMessage?.createdAt || thread.lastMessageAt || thread.updatedAt || 0;

    const markKey = `${threadId}:${unreadCount}:${latestMessageAt}`;

    if (lastMarkedReadKeyRef.current === markKey) {
      return;
    }

    lastMarkedReadKeyRef.current = markKey;

    void markThreadRead({
      orgId,
      threadId,
    });
  }, [
    currentParticipant?.unreadCount,
    markThreadRead,
    messages,
    orgId,
    thread,
    threadId,
  ]);

  async function handleSendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();

    if (!body || sending || !thread) return;

    const result = await sendMessage({
      orgId,
      threadId,
      body,
    });

    if (result?.ok) {
      setDraft("");
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/staff/messages"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              ← العودة إلى الرسائل
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-foreground">
              {thread?.otherDisplayName || "المحادثة"}
            </h1>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {thread ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  {getThreadTypeLabel(thread.type, thread.isInternal)}
                </span>
              ) : null}

              {thread?.hasActiveUrgentRequest ? (
                <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-bold text-destructive">
                  عاجل
                </span>
              ) : null}

              {thread?.studentId ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  الطالب: {thread.studentId}
                </span>
              ) : null}

              {thread?.schoolId ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  المدرسة: {thread.schoolId}
                </span>
              ) : null}

              {thread?.classId ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1">
                  الفصل: {thread.classId}
                </span>
              ) : null}
            </div>
          </div>

          {thread ? (
            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              <p>المشاركون الآخرون</p>
              <p className="mt-1 font-semibold text-foreground">
                {otherParticipants
                  .map((participant) => participant.displayName)
                  .filter(Boolean)
                  .join("، ") || "غير محدد"}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      {thread?.hasActiveUrgentRequest ? (
        <section className="rounded-3xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold text-destructive">طلب عاجل نشط</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">
                الرد داخل هذه المحادثة يعتبر استجابة للطلب العاجل
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                المستوى الحالي:{" "}
                <span className="font-semibold text-foreground">
                  {getUrgentLevelLabel(thread.urgentCurrentLevel)}
                </span>
                {" · "}
                الحالة:{" "}
                <span className="font-semibold text-foreground">
                  {getUrgentStatusLabel(thread.urgentStatus)}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-destructive/30 bg-background px-4 py-3 text-sm font-semibold text-destructive">
              {formatUrgentDeadline(thread.urgentCurrentDeadlineAt)}
            </div>
          </div>
        </section>
      ) : null}

      {thread?.hasActiveUrgentRequest ? (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">سجل الطلب العاجل</p>
            <h2 className="text-lg font-bold text-foreground">خط الأحداث</h2>
          </div>

          {urgentTimelineEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              لا توجد أحداث مسجلة بعد.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {urgentTimelineEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-border bg-background px-4 py-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                          {getTimelineEventTypeLabel(event.type)}
                        </span>

                        {event.level ? (
                          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                            {getUrgentLevelLabel(event.level)}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {event.title || getTimelineEventTypeLabel(event.type)}
                      </p>

                      {event.actorDisplayName ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          بواسطة: {event.actorDisplayName}
                        </p>
                      ) : null}
                    </div>

                    {event.createdAt ? (
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          جاري تحميل المحادثة...
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-destructive/30 bg-card p-5 text-sm text-destructive shadow-sm">
          {error}
        </section>
      ) : null}

      {!loading && !error && thread ? (
        <section className="flex min-h-[520px] flex-1 flex-col rounded-3xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
            {messages.length > 0
              ? `عدد الرسائل: ${messages.length}`
              : "لا توجد رسائل بعد"}
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="m-auto max-w-md text-center">
                <p className="font-semibold text-foreground">
                  لم تبدأ المحادثة بعد
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  ستظهر الرسائل هنا فور إرسالها من أحد أطراف المحادثة.
                </p>
              </div>
            ) : null}

            {messages.map((message) => {
              const isMine = message.senderUid === uid;

              return (
                <article
                  key={message.id}
                  className={[
                    "max-w-[82%] rounded-3xl border px-4 py-3 shadow-sm",
                    isMine
                      ? "self-end border-primary/20 bg-primary text-primary-foreground"
                      : "self-start border-border bg-background text-foreground",
                  ].join(" ")}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                    <span className="font-semibold">
                      {isMine ? "أنت" : message.senderDisplayName || "مشارك"}
                    </span>

                    {message.createdAt ? (
                      <span>{formatDateTime(message.createdAt)}</span>
                    ) : null}
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {message.body || "رسالة بدون نص"}
                  </p>
                </article>
              );
            })}
          </div>

          <div ref={messagesEndRef} />

          <form
            onSubmit={handleSendMessage}
            className="border-t border-border px-5 py-4"
          >
            {sendError ? (
              <div className="mb-3 rounded-2xl border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive">
                {sendError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex-1">
                <span className="sr-only">نص الرسالة</span>

                <textarea
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);

                    if (sendError) {
                      clearError();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  disabled={sending || thread?.status !== "ACTIVE"}
                  placeholder="اكتب رسالتك هنا..."
                  className="min-h-24 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <button
                type="submit"
                disabled={
                  sending ||
                  thread?.status !== "ACTIVE" ||
                  draft.trim().length === 0
                }
                className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "جاري الإرسال..." : "إرسال"}
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              اضغط Enter للإرسال، و Shift + Enter لسطر جديد.
            </p>
          </form>
        </section>
      ) : null}
    </main>
  );
}
