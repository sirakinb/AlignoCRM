"use client";

import { useEffect, useRef } from "react";
import { Loader2, Mail, MessageSquare, MessagesSquare } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";
import type { ConversationDetail } from "@/lib/data/conversations";
import { MessageBubble } from "./message-bubble";
import { Composer } from "./composer";
import { initialsFromName } from "./format";

interface ThreadViewProps {
  detail: ConversationDetail | null;
  loading: boolean;
  sending: boolean;
  sendError: string | null;
  onSend: (
    channel: MessageChannel,
    subject: string | undefined,
    body: string
  ) => void | Promise<boolean>;
}

export function ThreadView({ detail, loading, sending, sendError, onSend }: ThreadViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[#f7f7f8]">
        <Loader2 size={24} strokeWidth={1.8} className="animate-spin text-[#6c2bd9]" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-6 text-center">
        <MessagesSquare size={34} strokeWidth={1.5} className="mb-3 text-zinc-300" />
        <p className="text-[14px] font-medium text-zinc-600">Select a conversation</p>
        <p className="mt-1 text-[12px] text-zinc-400">
          Choose a thread on the left to read and reply.
        </p>
      </div>
    );
  }

  const { contact, messages, channels } = detail;

  return (
    <div className="flex h-full flex-1 flex-col bg-[#f7f7f8]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#e7e7ea] bg-white px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6c2bd9]/10 text-[12px] font-semibold text-[#5b21b6]">
          {initialsFromName(contact.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-zinc-900">{contact.name}</p>
          <div className="flex items-center gap-3 text-[12px] text-zinc-400">
            {contact.email && (
              <span className="flex items-center gap-1 truncate">
                <Mail size={11} strokeWidth={1.8} />
                {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="flex items-center gap-1 tabular-nums">
                <MessageSquare size={11} strokeWidth={1.8} />
                {contact.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[13px] text-zinc-400">No messages yet — say hello.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <Composer channels={channels} sending={sending} error={sendError} onSend={onSend} />
    </div>
  );
}
