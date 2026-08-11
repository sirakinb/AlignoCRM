"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  Send,
  Megaphone,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type {
  Campaign,
  CampaignRecipient,
  MessageChannel,
  MessageTemplate,
} from "@/types/messaging";
import { InsertVariableDropdown } from "@/components/workflow/node-forms/shared";
import { AudiencePicker, type Audience } from "./audience-picker";
import { EmptyState } from "./template-manager";

type View =
  | { kind: "list" }
  | { kind: "compose" }
  | { kind: "detail"; id: string };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export function CampaignManager({ channel }: { channel: MessageChannel }) {
  const [view, setView] = useState<View>({ kind: "list" });

  if (view.kind === "compose") {
    return (
      <CampaignComposer
        channel={channel}
        onClose={() => setView({ kind: "list" })}
        onCreated={(id) => setView({ kind: "detail", id })}
      />
    );
  }
  if (view.kind === "detail") {
    return (
      <CampaignDetail
        id={view.id}
        onBack={() => setView({ kind: "list" })}
      />
    );
  }
  return (
    <CampaignList
      channel={channel}
      onNew={() => setView({ kind: "compose" })}
      onOpen={(id) => setView({ kind: "detail", id })}
    />
  );
}

function CampaignList({
  channel,
  onNew,
  onOpen,
}: {
  channel: MessageChannel;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const data = await res.json();
      setCampaigns(
        ((data.campaigns as Campaign[]) ?? []).filter((c) => c.channel === channel)
      );
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-zinc-500">
          Bulk {channel === "email" ? "email" : "SMS"} campaigns with per-recipient status.
        </p>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#4c1d95]"
        >
          <Plus size={15} strokeWidth={2} /> New campaign
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-8 text-[13px] text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={22} strokeWidth={1.8} className="text-[#5b21b6]" />}
          title="No campaigns yet"
          subtitle="Create a campaign to send to a tagged or filtered audience."
        />
      ) : (
        <div className="divide-y divide-[#eee] rounded-xl border border-[#e7e7ea] bg-white">
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#faf8fe]"
            >
              <div>
                <p className="text-[14px] font-medium text-zinc-900">{c.name}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  {c.total_count} recipients · {c.sent_count} sent · {c.delivered_count} delivered
                  {c.failed_count > 0 && ` · ${c.failed_count} failed`}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                  STATUS_STYLES[c.status] ?? "bg-zinc-100 text-zinc-600"
                }`}
              >
                {c.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignComposer({
  channel,
  onClose,
  onCreated,
}: {
  channel: MessageChannel;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>({ all: false, tagIds: [], statuses: [] });
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [testContactId, setTestContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/templates?channel=${channel}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
    fetch("/api/contacts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setContacts(
          ((d.contacts as Array<{ id: string; first_name?: string; last_name?: string; email?: string }>) ?? [])
            .map((c) => ({
              id: c.id,
              name:
                `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                c.email ||
                "Unnamed",
            }))
            .slice(0, 500)
        )
      )
      .catch(() => {});
  }, [channel]);

  async function handleTestSend() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const id = await saveDraft();
      if (!id) throw new Error("Could not save campaign");
      const res = await fetch(`/api/campaigns/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: testContactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test send failed");
      setTestResult("Test sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setTesting(false);
    }
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body);
    if (channel === "email" && t.subject) setSubject(t.subject);
  }

  async function saveDraft(): Promise<string | null> {
    const res = await fetch(campaignId ? `/api/campaigns/${campaignId}` : "/api/campaigns", {
      method: campaignId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        name,
        subject: channel === "email" ? subject : null,
        body,
        audience,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save campaign");
    const id = data.campaign.id as string;
    setCampaignId(id);
    return id;
  }

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    try {
      await saveDraft();
      setTestResult("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!confirm("Send this campaign now? This cannot be undone.")) return;
    setSending(true);
    setError(null);
    try {
      const id = await saveDraft();
      if (!id) throw new Error("Could not save campaign");
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setSending(false);
    }
  }

  const canSend =
    name.trim() &&
    body.trim() &&
    (channel !== "email" || subject.trim()) &&
    (audience.all || (audience.tagIds?.length ?? 0) > 0 || (audience.statuses?.length ?? 0) > 0);

  return (
    <div className="max-w-2xl">
      <button
        onClick={onClose}
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </button>
      <h3 className="mb-4 text-[15px] font-semibold text-zinc-900">New campaign</h3>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {testResult && !error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          <CheckCircle2 size={15} /> {testResult}
        </div>
      )}

      <label className="mb-1 block text-xs font-medium text-gray-700">Campaign name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
        placeholder="e.g. October newsletter"
      />

      {templates.length > 0 && (
        <>
          <label className="mb-1 block text-xs font-medium text-gray-700">Start from template</label>
          <select
            onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
            defaultValue=""
          >
            <option value="">— None —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}

      <label className="mb-1 block text-xs font-medium text-gray-700">Audience</label>
      <div className="mb-3">
        <AudiencePicker channel={channel} value={audience} onChange={setAudience} />
      </div>

      {channel === "email" && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-700">Subject</label>
            <InsertVariableDropdown onInsert={(v) => setSubject((s) => s + v)} />
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
            placeholder="Subject line"
          />
        </>
      )}

      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700">
          {channel === "email" ? "Body (HTML allowed)" : "Message"}
        </label>
        <InsertVariableDropdown onInsert={(v) => setBody((b) => b + v)} />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={channel === "email" ? 10 : 4}
        className="mb-4 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-[#6E2ABD]"
        placeholder="Hi {{contact.first_name}}, …"
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#eee] bg-[#faf9fc] px-3 py-2">
        <span className="text-[12px] text-zinc-500">Test to:</span>
        <select
          value={testContactId}
          onChange={(e) => setTestContactId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[#e0e0e5] bg-white px-2 py-1 text-[13px] outline-none focus:border-[#6E2ABD]"
        >
          <option value="">Select a contact…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleTestSend}
          disabled={testing || !testContactId || !body.trim() || !name.trim()}
          className="shrink-0 rounded-md border border-[#cbb6ec] px-2.5 py-1 text-[12px] font-medium text-[#5b21b6] hover:bg-[#efe7fb] disabled:opacity-50"
        >
          {testing ? "Sending…" : "Send test"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4c1d95] disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send campaign
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={saving || !name.trim()}
          className="rounded-lg border border-[#e0e0e5] px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
      </div>
    </div>
  );
}

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/recipients`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setCampaign(data.campaign);
        setRecipients(data.recipients ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    // Poll while sending so the recipient table + counters settle live.
    const t = setInterval(() => {
      setCampaign((c) => {
        if (c && c.status === "sending") load();
        return c;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-8 text-[13px] text-zinc-400">
        <Loader2 size={16} className="animate-spin" /> Loading campaign…
      </div>
    );
  }
  if (!campaign) {
    return (
      <div>
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-800">
          <ArrowLeft size={14} /> Back
        </button>
        <p className="text-[13px] text-zinc-500">Campaign not found.</p>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-800">
        <ArrowLeft size={14} /> Back to campaigns
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-zinc-900">{campaign.name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
            STATUS_STYLES[campaign.status] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {campaign.status}
        </span>
      </div>

      {campaign.status === "failed" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertCircle size={15} /> This campaign did not finish sending. Some recipients may not have received it.
        </div>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Recipients" value={campaign.total_count} />
        <Stat label="Sent" value={campaign.sent_count} />
        <Stat label="Delivered" value={campaign.delivered_count} />
        <Stat label="Failed" value={campaign.failed_count} tone={campaign.failed_count ? "red" : undefined} />
        <Stat label="Opted out" value={campaign.suppressed_count} />
        <Stat label="No address" value={campaign.no_address_count} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#e7e7ea] bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-[#eee] text-[11px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Address</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f2f4]">
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  No recipients materialized yet.
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.message_id}>
                  <td className="px-4 py-2 text-zinc-800">{r.contact_name}</td>
                  <td className="px-4 py-2 text-zinc-500">{r.address}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                        r.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : r.status === "delivered"
                            ? "bg-emerald-100 text-emerald-700"
                            : r.status === "queued"
                              ? "bg-zinc-100 text-zinc-500"
                              : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{r.error ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red";
}) {
  return (
    <div className="rounded-lg border border-[#e7e7ea] bg-white px-3 py-2">
      <p className={`text-[18px] font-semibold ${tone === "red" ? "text-red-600" : "text-zinc-900"}`}>
        {value}
      </p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
