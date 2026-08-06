"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, Send, Loader2, AlertTriangle, Ban } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";
import type { ChannelAvailability } from "@/lib/data/conversations";

interface ComposerProps {
  channels: { email: ChannelAvailability; sms: ChannelAvailability };
  sending: boolean;
  error: string | null;
  /**
   * Returns true when the send succeeded. The composer clears its draft ONLY on
   * a confirmed success, so a failed send retains the user's text (P5-09). A
   * `void` return (e.g. a test stub) is treated as "not confirmed" — the draft
   * stays put.
   */
  onSend: (
    channel: MessageChannel,
    subject: string | undefined,
    body: string
  ) => void | Promise<boolean>;
}

export function Composer({ channels, sending, error, onSend }: ComposerProps) {
  // Default to the first enabled channel so the composer opens usable when possible.
  const defaultChannel: MessageChannel = channels.email.enabled ? "email" : "sms";
  const [channel, setChannel] = useState<MessageChannel>(defaultChannel);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // If the contact's capability changes (thread switch), re-pick a valid channel.
  useEffect(() => {
    setChannel(channels.email.enabled ? "email" : channels.sms.enabled ? "sms" : "email");
  }, [channels.email.enabled, channels.sms.enabled]);

  const active = channels[channel];
  const canSend = active.enabled && body.trim().length > 0 && !sending;
  const neitherEnabled = !channels.email.enabled && !channels.sms.enabled;

  const disabledReason = useMemo(() => active.disabledReason, [active]);

  async function handleSend() {
    if (!canSend) return;
    const result = await onSend(
      channel,
      channel === "email" ? subject.trim() || undefined : undefined,
      body
    );
    // Clear only on a confirmed success — otherwise the draft is retained so a
    // failed send doesn't wipe the user's message (P5-09).
    if (result === true) {
      setBody("");
      if (channel === "email") setSubject("");
    }
  }

  return (
    <div className="border-t border-[#e7e7ea] bg-white p-3">
      {/* Channel toggle */}
      <div className="mb-2 flex items-center gap-1.5">
        <ChannelTab
          channel="email"
          label="Email"
          icon={<Mail size={13} strokeWidth={1.8} />}
          active={channel === "email"}
          availability={channels.email}
          onSelect={() => setChannel("email")}
        />
        <ChannelTab
          channel="sms"
          label="SMS"
          icon={<MessageSquare size={13} strokeWidth={1.8} />}
          active={channel === "sms"}
          availability={channels.sms}
          onSelect={() => setChannel("sms")}
        />
      </div>

      {/* Warning (channel enabled but flagged, e.g. email unsubscribe/complaint) */}
      {active.enabled && active.warning && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-700 ring-1 ring-amber-200">
          <AlertTriangle size={13} strokeWidth={1.8} className="shrink-0" />
          {active.warning}
        </div>
      )}

      {/* Disabled explanation (contract d / P3-14: every disabled state names its reason) */}
      {!active.enabled && disabledReason && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-500 ring-1 ring-[#e7e7ea]">
          <Ban size={13} strokeWidth={1.8} className="shrink-0" />
          {disabledReason}
        </div>
      )}

      {/* Subject (email only, P3-15) */}
      {channel === "email" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          disabled={!active.enabled || sending}
          className="mb-2 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:bg-zinc-50"
        />
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            neitherEnabled
              ? "This contact has no reachable channel."
              : active.enabled
                ? `Write a ${channel === "email" ? "message" : "text"}…`
                : "This channel is unavailable."
          }
          rows={2}
          disabled={!active.enabled || sending}
          className="flex-1 resize-none rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:bg-zinc-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-40"
        >
          {sending ? (
            <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
          ) : (
            <Send size={15} strokeWidth={1.8} />
          )}
          Send
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}

function ChannelTab({
  label,
  icon,
  active,
  availability,
  onSelect,
}: {
  channel: MessageChannel;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  availability: ChannelAvailability;
  onSelect: () => void;
}) {
  // The tab stays clickable even when disabled so the reason can be shown; the
  // send button and inputs are what actually gate the send.
  return (
    <button
      type="button"
      onClick={onSelect}
      title={availability.disabledReason ?? undefined}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active
          ? "bg-[#efe7fb] text-[#5b21b6]"
          : "text-zinc-500 hover:bg-black/[0.045]"
      } ${!availability.enabled ? "opacity-60" : ""}`}
    >
      {icon}
      {label}
      {!availability.enabled && <Ban size={11} strokeWidth={1.8} className="text-zinc-400" />}
    </button>
  );
}
