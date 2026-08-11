"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";
import type { Tag } from "@/types/crm";

export interface Audience {
  all?: boolean;
  tagIds?: string[];
  statuses?: string[];
}

interface PreviewCounts {
  totalCount: number;
  suppressedCount: number;
  noAddressCount: number;
  audienceCount: number;
}

const CONTACT_STATUSES = ["active", "archived"];

/**
 * Audience selector with a live recipient-count preview (P4-08, P4-11). `all` is
 * a radio against tags/statuses so it can't be combined (A-12b / P4-08b). The
 * preview calls the same resolver the send uses, so the shown "N recipients"
 * equals total + suppressed + no_address at send time.
 */
export function AudiencePicker({
  channel,
  value,
  onChange,
}: {
  channel: MessageChannel;
  value: Audience;
  onChange: (a: Audience) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [preview, setPreview] = useState<PreviewCounts | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const mode: "all" | "filters" = value.all ? "all" : "filters";

  useEffect(() => {
    fetch("/api/tags", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  const runPreview = useCallback(async () => {
    const hasSelection =
      value.all || (value.tagIds?.length ?? 0) > 0 || (value.statuses?.length ?? 0) > 0;
    if (!hasSelection) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, audience: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [channel, value]);

  useEffect(() => {
    const t = setTimeout(runPreview, 250);
    return () => clearTimeout(t);
  }, [runPreview]);

  function toggleTag(id: string) {
    const current = new Set(value.tagIds ?? []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    onChange({ ...value, all: false, tagIds: Array.from(current) });
  }
  function toggleStatus(s: string) {
    const current = new Set(value.statuses ?? []);
    if (current.has(s)) current.delete(s);
    else current.add(s);
    onChange({ ...value, all: false, statuses: Array.from(current) });
  }

  return (
    <div className="rounded-xl border border-[#e7e7ea] bg-white p-4">
      <div className="mb-3 flex gap-4">
        <label className="flex items-center gap-2 text-[13px] text-zinc-700">
          <input
            type="radio"
            checked={mode === "all"}
            onChange={() => onChange({ all: true, tagIds: [], statuses: [] })}
          />
          All contacts
        </label>
        <label className="flex items-center gap-2 text-[13px] text-zinc-700">
          <input
            type="radio"
            checked={mode === "filters"}
            onChange={() => onChange({ all: false, tagIds: value.tagIds ?? [], statuses: value.statuses ?? [] })}
          />
          By tags / status
        </label>
      </div>

      {mode === "filters" && (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-zinc-500">Tags (any of)</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && (
                <span className="text-[12px] text-zinc-400">No tags in this workspace.</span>
              )}
              {tags.map((t) => {
                const active = (value.tagIds ?? []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] ${
                      active
                        ? "border-[#5b21b6] bg-[#efe7fb] text-[#5b21b6]"
                        : "border-[#e0e0e5] bg-white text-zinc-600 hover:border-[#cbb6ec]"
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-zinc-500">Status (any of)</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_STATUSES.map((s) => {
                const active = (value.statuses ?? []).includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] capitalize ${
                      active
                        ? "border-[#5b21b6] bg-[#efe7fb] text-[#5b21b6]"
                        : "border-[#e0e0e5] bg-white text-zinc-600 hover:border-[#cbb6ec]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-[#f0f0f2] pt-3 text-[13px]">
        <Users size={15} strokeWidth={1.8} className="text-zinc-400" />
        {previewLoading ? (
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Loader2 size={13} className="animate-spin" /> Counting…
          </span>
        ) : previewError ? (
          <span className="text-red-600">{previewError}</span>
        ) : preview ? (
          <span className="text-zinc-700">
            <strong className="text-zinc-900">{preview.totalCount}</strong> will receive ·{" "}
            {preview.suppressedCount} opted out · {preview.noAddressCount} no{" "}
            {channel === "email" ? "email" : "phone"}
          </span>
        ) : (
          <span className="text-zinc-400">Select an audience to preview the count.</span>
        )}
      </div>
    </div>
  );
}
