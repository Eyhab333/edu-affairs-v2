"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useStaffMessageThreads } from "@/hooks/use-staff-message-threads";

function formatDateTime(timestamp: number) {
  if (!timestamp) return "لا توجد رسائل بعد";

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

function formatUrgentDeadline(timestamp: number) {
  if (!timestamp) return "بدون موعد محدد";

  const formatted = formatDateTime(timestamp);

  if (timestamp < Date.now()) {
    return `تجاوز الموعد: ${formatted}`;
  }

  return `مطلوب الرد قبل: ${formatted}`;
}

type ThreadFilter = "ALL" | "URGENT" | "UNREAD";

export default function StaffMessagesPage() {
  const { threads, unreadCount, loading, error } = useStaffMessageThreads();

  const [filter, setFilter] = useState<ThreadFilter>("ALL");

  const filteredThreads = useMemo(() => {
    if (filter === "URGENT") {
      return threads.filter((thread) => thread.hasActiveUrgentRequest);
    }

    if (filter === "UNREAD") {
      return threads.filter((thread) => thread.unreadCount > 0);
    }

    return threads;
  }, [filter, threads]);

  const urgentCount = useMemo(() => {
    return threads.filter((thread) => thread.hasActiveUrgentRequest).length;
  }, [threads]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">التواصل</p>
            <h1 className="text-2xl font-bold text-foreground">الرسائل</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              قائمة المحادثات التي تشارك فيها داخل المنصة.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            <span className="text-muted-foreground">غير المقروء: </span>
            <span className="font-bold text-foreground">{unreadCount}</span>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={[
            "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
            filter === "ALL"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          الكل ({threads.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("URGENT")}
          className={[
            "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
            filter === "URGENT"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-destructive/30 bg-card text-destructive hover:bg-destructive/10",
          ].join(" ")}
        >
          العاجلة فقط ({urgentCount})
        </button>

        <button
          type="button"
          onClick={() => setFilter("UNREAD")}
          className={[
            "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
            filter === "UNREAD"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          غير المقروءة ({unreadCount})
        </button>
      </section>

      {loading ? (
        <section className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          جاري تحميل المحادثات...
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-destructive/30 bg-card p-5 text-sm text-destructive shadow-sm">
          {error}
        </section>
      ) : null}

      {!loading && !error && filteredThreads.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <p className="font-semibold text-foreground">لا توجد محادثات بعد</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ستظهر هنا المحادثات عند إنشائها من تطبيق ولي الأمر أو من صفحات
            الطلاب لاحقًا.
          </p>
        </section>
      ) : null}

      {filteredThreads.length > 0 ? (
        <section className="grid gap-3">
          {filteredThreads.map((thread) => {
            const href = `/staff/messages/${thread.id}`;
            const hasUnread = thread.unreadCount > 0;
            const isUrgent = thread.hasActiveUrgentRequest;
            return (
              <Link
                key={thread.id}
                href={href}
                className={[
                  "rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5",
                  isUrgent
                    ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
                    : "border-border bg-card hover:bg-accent/30",
                ].join(" ")}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold text-foreground">
                        {thread.otherDisplayName}
                      </h2>

                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        {getThreadTypeLabel(thread.type, thread.isInternal)}
                      </span>

                      {isUrgent ? (
                        <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                          عاجل
                        </span>
                      ) : null}

                      {thread.status !== "ACTIVE" ? (
                        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                          {thread.status}
                        </span>
                      ) : null}

                      {hasUnread ? (
                        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                          {thread.unreadCount} جديد
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {thread.lastMessageSummary || "لم تبدأ المحادثة بعد"}
                    </p>

                    {isUrgent ? (
                      <div className="mt-3 rounded-2xl border border-destructive/30 bg-background/70 px-3 py-2 text-xs leading-6 text-destructive">
                        <span className="font-bold">
                          المستوى الحالي:{" "}
                          {getUrgentLevelLabel(thread.urgentCurrentLevel)}
                        </span>
                        <span className="mx-2">·</span>
                        <span>{getUrgentStatusLabel(thread.urgentStatus)}</span>
                        <span className="mx-2">·</span>
                        <span>
                          {formatUrgentDeadline(thread.urgentCurrentDeadlineAt)}
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {thread.studentId ? (
                        <span>الطالب: {thread.studentId}</span>
                      ) : null}

                      {thread.schoolId ? (
                        <span>المدرسة: {thread.schoolId}</span>
                      ) : null}

                      {thread.classId ? (
                        <span>الفصل: {thread.classId}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm text-muted-foreground">
                    {formatDateTime(thread.lastMessageAt)}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
