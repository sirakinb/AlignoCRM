"use client";

import { useState } from "react";
import {
  Mail,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { Message } from "@/types/messaging";
import { HtmlFrame } from "./html-frame";
import { formatTimestamp } from "./format";

interface MessageBubbleProps {
  message: Message;
}

/**
 * One message in the thread timeline. Inbound sits left, outbound right. SMS is
 * rendered as plain React text (auto-escaped — body_text is attacker-controlled
 * plain text, contract b). Email shows the subject and a collapsed body that
 * expands into the sandboxed HtmlFrame (contract a). An inbound message whose
 * sender did not match the contact carries an explicit warning (contract d).
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isInbound = message.direction === "inbound";
  const isEmail = message.channel === "email";
  // contract d: only warn on INBOUND unverified senders; outbound is always ours.
  const showSenderWarning = isInbound && !message.sender_verified;
  const failed = message.status === "failed" || message.status === "bounced";
  const pending = message.status === "queued";

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] ${isInbound ? "items-start" : "items-end"} flex flex-col gap-1`}>
        {/* Channel + status meta */}
        <div
          className={`flex items-center gap-1.5 px-1 text-[11px] text-zinc-400 ${
            isInbound ? "" : "flex-row-reverse"
          }`}
        >
          {isEmail ? (
            <Mail size={11} strokeWidth={1.8} />
          ) : (
            <MessageSquare size={11} strokeWidth={1.8} />
          )}
          <span>{formatTimestamp(message.created_at)}</span>
          {pending && <Clock size={11} strokeWidth={1.8} className="text-zinc-400" />}
          {failed && (
            <span className="flex items-center gap-1 text-red-500">
              <AlertCircle size={11} strokeWidth={1.8} />
              {message.status === "bounced" ? "Bounced" : "Failed"}
            </span>
          )}
        </div>

        {showSenderWarning && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 ring-1 ring-amber-200">
            <ShieldAlert size={12} strokeWidth={1.8} className="shrink-0" />
            The sender&apos;s address didn&apos;t match this contact.
          </div>
        )}

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
            isInbound
              ? "rounded-tl-sm bg-white text-zinc-800 ring-1 ring-[#e7e7ea]"
              : "rounded-tr-sm bg-[#6c2bd9] text-white"
          }`}
        >
          {isEmail ? (
            <div className="min-w-[220px]">
              {message.subject && (
                <p
                  className={`mb-1 text-[13px] font-semibold ${
                    isInbound ? "text-zinc-900" : "text-white"
                  }`}
                >
                  {message.subject}
                </p>
              )}
              {message.body_html ? (
                <>
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className={`flex items-center gap-1 text-[12px] font-medium ${
                      isInbound ? "text-[#6c2bd9]" : "text-white/90"
                    }`}
                  >
                    {expanded ? (
                      <ChevronDown size={13} strokeWidth={1.8} />
                    ) : (
                      <ChevronRight size={13} strokeWidth={1.8} />
                    )}
                    {expanded ? "Hide message" : "Show message"}
                  </button>
                  {expanded && (
                    <div className="mt-2">
                      <HtmlFrame html={message.body_html} />
                    </div>
                  )}
                </>
              ) : (
                // Fallback: plain-text email with no HTML body — render as text.
                <p className="whitespace-pre-wrap">{message.body_text}</p>
              )}
            </div>
          ) : (
            // SMS: plain text, auto-escaped by React (contract b).
            <p className="whitespace-pre-wrap">{message.body_text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
