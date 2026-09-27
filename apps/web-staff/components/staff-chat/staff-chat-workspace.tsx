"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { useStaffChatGroups } from "@/hooks/use-staff-chat-groups";
import { useStaffChatMessages } from "@/hooks/use-staff-chat-messages";
import { useSendStaffChatMessage } from "@/hooks/use-send-staff-chat-message";
import { cn } from "@/lib/utils";

function formatDateTime(timestamp: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function groupKindLabel(groupKind: "SCHOOL" | "SPECIAL") {
  return groupKind === "SCHOOL" ? "مدرسة / روضة" : "مجموعة خاصة";
}

export function StaffChatWorkspace() {
  const { user, actor } = useStaffActor();
  const { groups, loading: groupsLoading, error: groupsError } = useStaffChatGroups();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const { messages, loading: messagesLoading, error: messagesError } =
    useStaffChatMessages(selectedGroup?.id ?? "");
  const { sendMessage, sending, error: sendError, clearError } =
    useSendStaffChatMessage();

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId("");
      return;
    }

    if (!groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !draft.trim() || sending) return;

    const result = await sendMessage({
      orgId: actor.orgId,
      groupId: selectedGroup.id,
      body: draft,
    });
    if (result) setDraft("");
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6">
      <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <MessageSquare className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">تواصل داخلي</p>
            <h1 className="text-2xl font-bold text-foreground">الشات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              مجموعات العمل المصرح لك بها فقط.
            </p>
          </div>
        </div>
      </header>

      {groupsError ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {groupsError}
        </section>
      ) : null}

      <section className="grid min-h-[620px] overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-muted/20 lg:border-b-0 lg:border-l">
          <div className="border-b border-border px-4 py-4">
            <h2 className="font-bold">المجموعات</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {groups.length} مجموعة متاحة
            </p>
          </div>

          {groupsLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ تحميل المجموعات...
            </div>
          ) : null}

          {!groupsLoading && groups.length === 0 ? (
            <div className="p-5 text-sm leading-6 text-muted-foreground">
              لا توجد مجموعات متاحة ضمن نطاقك الحالي.
            </div>
          ) : null}

          <div className="max-h-72 overflow-y-auto p-2 lg:max-h-[540px]">
            {groups.map((group) => {
              const active = group.id === selectedGroup?.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    clearError();
                    setSelectedGroupId(group.id);
                  }}
                  className={cn(
                    "mb-1 w-full rounded-2xl px-3 py-3 text-right transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 font-semibold">{group.displayName}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px]",
                        active ? "text-primary-foreground/75" : "text-muted-foreground",
                      )}
                    >
                      {formatDateTime(group.lastMessageAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 line-clamp-1 text-xs",
                      active ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {group.lastMessageSummary || groupKindLabel(group.groupKind)}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-[460px] min-w-0 flex-col">
          {selectedGroup ? (
            <>
              <header className="border-b border-border px-5 py-4">
                <h2 className="font-bold text-foreground">{selectedGroup.displayName}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {groupKindLabel(selectedGroup.groupKind)}
                </p>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4 sm:p-5">
                {messagesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> جارٍ تحميل الرسائل...
                  </div>
                ) : null}
                {messagesError ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {messagesError}
                  </div>
                ) : null}
                {!messagesLoading && !messagesError && messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    لا توجد رسائل بعد. ابدأ المحادثة.
                  </div>
                ) : null}
                {messages.map((message) => {
                  const mine = message.senderUid === user.uid;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", mine ? "justify-start" : "justify-end")}
                    >
                      <article
                        className={cn(
                          "max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[72%]",
                          mine
                            ? "rounded-tr-sm bg-primary text-primary-foreground"
                            : "rounded-tl-sm border border-border bg-card text-foreground",
                        )}
                      >
                        <p
                          className={cn(
                            "mb-1 text-xs font-bold",
                            mine ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {mine ? "أنت" : message.senderDisplayName}
                        </p>
                        <p className="whitespace-pre-wrap break-words leading-6">{message.body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            mine ? "text-primary-foreground/70" : "text-muted-foreground",
                          )}
                        >
                          {formatDateTime(message.createdAt)}
                        </p>
                      </article>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={(event) => void submit(event)} className="border-t border-border p-3 sm:p-4">
                {sendError ? <p className="mb-2 text-xs text-destructive">{sendError}</p> : null}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => {
                      clearError();
                      setDraft(event.target.value);
                    }}
                    disabled={sending}
                    maxLength={4000}
                    rows={2}
                    placeholder="اكتب رسالة..."
                    className="min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                  <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="إرسال الرسالة">
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              اختر مجموعة لعرض الرسائل.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
