"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";

interface ChannelRow {
  id: string;
  channel: MessageChannel;
  config: Record<string, string>;
}

// Display-only. The authoritative sending domain is enforced server-side in
// send-message.ts; this is just the suffix shown next to the local-part field.
const EMAIL_DOMAIN = "send.alignocrm.com";

/**
 * Sender-identity settings for one channel (P5-02/P5-03). Email: from name +
 * local part (domain fixed). SMS: toll-free number + Messaging Service SID +
 * verification status. Writes through PUT /api/messaging/settings (owner/admin).
 */
export function ChannelSettings({ channel }: { channel: MessageChannel }) {
  const [row, setRow] = useState<ChannelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/messaging/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const r = d.channels?.[channel] as ChannelRow | undefined;
        if (r) {
          setRow(r);
          setConfig(r.config ?? {});
        }
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [channel]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/messaging/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-8 text-[13px] text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {saved && !error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          <CheckCircle2 size={15} /> Settings saved.
        </div>
      )}

      {channel === "email" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Sender name</label>
            <input
              value={config.from_name ?? ""}
              onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
              className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
              placeholder="Aligno Team"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Sending address</label>
            <div className="flex items-center rounded-lg border border-[#e7e7ea] bg-white">
              <input
                value={config.from_local_part ?? ""}
                onChange={(e) => setConfig({ ...config, from_local_part: e.target.value })}
                className="flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="team"
              />
              <span className="px-3 py-2 text-sm text-zinc-400">@{EMAIL_DOMAIN}</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Domain status is managed in your DNS / Resend configuration.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Toll-free number</label>
            <input
              value={config.phone_number ?? ""}
              onChange={(e) => setConfig({ ...config, phone_number: e.target.value })}
              className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
              placeholder="+18005551234"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Messaging Service SID</label>
            <input
              value={config.messaging_service_sid ?? ""}
              onChange={(e) => setConfig({ ...config, messaging_service_sid: e.target.value })}
              className="w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-[#6E2ABD]"
              placeholder="MG…"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[#f7f7f8] px-3 py-2 text-[12px] text-zinc-600">
            <span className="font-medium">Verification:</span>
            <span className="capitalize">
              {config.verification_status || "not submitted"}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4c1d95] disabled:opacity-50"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save settings
      </button>
      {!row && (
        <p className="mt-2 text-[11px] text-zinc-400">Defaults will be created when you save.</p>
      )}
    </div>
  );
}
