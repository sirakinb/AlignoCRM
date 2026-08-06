"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, FileText } from "lucide-react";
import type { MessageChannel, MessageTemplate } from "@/types/messaging";
import { InsertVariableDropdown } from "@/components/workflow/node-forms/shared";

/**
 * Templates CRUD for one channel (P4-01/P4-03). The list is filtered to the
 * section's channel; the editor reuses the workflow InsertVariableDropdown for
 * merge tags rather than a parallel implementation (P4-04).
 */
export function TemplateManager({ channel }: { channel: MessageChannel }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates?channel=${channel}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load templates");
      setTemplates(payload.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  if (editing) {
    return (
      <TemplateEditor
        channel={channel}
        template={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-zinc-500">
          Reusable {channel === "email" ? "email" : "SMS"} templates with merge tags.
        </p>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#4c1d95]"
        >
          <Plus size={15} strokeWidth={2} /> New template
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-8 text-[13px] text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText size={22} strokeWidth={1.8} className="text-[#5b21b6]" />}
          title="No templates yet"
          subtitle="Create a reusable template to speed up campaigns and replies."
        />
      ) : (
        <div className="divide-y divide-[#eee] rounded-xl border border-[#e7e7ea] bg-white">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-[#faf8fe]"
            >
              <button
                onClick={() => setEditing(t)}
                className="flex-1 text-left"
              >
                <p className="text-[14px] font-medium text-zinc-900">{t.name}</p>
                {t.subject && (
                  <p className="mt-0.5 text-[12px] text-zinc-500">{t.subject}</p>
                )}
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                className="ml-3 rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete template"
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  channel,
  template,
  onClose,
  onSaved,
}: {
  channel: MessageChannel;
  template: MessageTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = { name, subject: channel === "email" ? subject : null, body, channel };
      const res = await fetch(
        template ? `/api/templates/${template.id}` : "/api/templates",
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save template");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h3 className="mb-4 text-[15px] font-semibold text-zinc-900">
        {template ? "Edit template" : "New template"}
      </h3>
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}
      <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
        placeholder="e.g. Welcome email"
      />
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
        <label className="text-xs font-medium text-gray-700">Body</label>
        <InsertVariableDropdown onInsert={(v) => setBody((b) => b + v)} />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={channel === "email" ? 10 : 4}
        className="mb-4 w-full rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-[#6E2ABD]"
        placeholder={
          channel === "email"
            ? "Hi {{contact.first_name}}, …"
            : "Hi {{contact.first_name}} — quick note…"
        }
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name || !body}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4c1d95] disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {template ? "Save changes" : "Create template"}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#e0e0e5] bg-white px-6 py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#efe7fb]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{subtitle}</p>
    </div>
  );
}
