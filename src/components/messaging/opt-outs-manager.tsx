"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ShieldOff } from "lucide-react";
import { EmptyState } from "./template-manager";

interface Suppression {
  id: string;
  channel: string;
  address: string;
  reason: string;
  created_at: string;
}

/**
 * SMS opt-out list (P4-29/P4-30/P4-31). Lists suppressions, supports manual
 * add/remove; adding an already-suppressed address is a friendly no-op, and
 * removing a `stop` warns about the compliance implication of overriding an
 * opt-out.
 */
export function OptOutsManager({ channel = "sms" }: { channel?: "sms" | "email" }) {
  const [rows, setRows] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppressions?channel=${channel}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setRows(data.suppressions ?? []);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    if (!address.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setAddress("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(row: Suppression) {
    const warn =
      row.reason === "stop"
        ? "This contact texted STOP to opt out. Removing this override may violate TCPA/CASL compliance. Continue?"
        : "Remove this opt-out?";
    if (!confirm(warn)) return;
    const res = await fetch("/api/suppressions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: row.channel, address: row.address }),
    });
    if (res.ok) load();
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-[13px] text-zinc-500">
        Contacts who opted out of {channel === "sms" ? "SMS" : "email"}. Sends to
        these addresses are blocked automatically.
      </p>

      <div className="mb-4 flex gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={channel === "sms" ? "+18005551234" : "person@example.com"}
          className="flex-1 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm outline-none focus:border-[#6E2ABD]"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !address.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b21b6] px-3 py-2 text-[13px] font-medium text-white hover:bg-[#4c1d95] disabled:opacity-50"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-8 text-[13px] text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Loading opt-outs…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldOff size={22} strokeWidth={1.8} className="text-[#5b21b6]" />}
          title="No opt-outs"
          subtitle="Contacts who opt out will appear here automatically."
        />
      ) : (
        <div className="divide-y divide-[#eee] rounded-xl border border-[#e7e7ea] bg-white">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[13px] text-zinc-800">{r.address}</p>
                <p className="text-[11px] capitalize text-zinc-400">{r.reason}</p>
              </div>
              <button
                onClick={() => handleRemove(r)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove opt-out"
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
