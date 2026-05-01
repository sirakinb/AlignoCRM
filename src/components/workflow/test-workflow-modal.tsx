"use client";

import { useState, useEffect } from "react";
import { X, Play, Loader2 } from "lucide-react";
import type { Contact } from "@/types/crm";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

interface TestWorkflowModalProps {
  workflowId: string;
  onClose: () => void;
  onComplete: (enrollmentId: string) => void;
}

export function TestWorkflowModal({
  workflowId,
  onClose,
  onComplete,
}: TestWorkflowModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((json) => {
        const data: Contact[] = json.contacts ?? [];
        setContacts(data);
        if (data.length > 0) setSelectedContactId(data[0].id);
      })
      .catch((err) => setError("Failed to load contacts: " + err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRun = async () => {
    if (!selectedContactId) return;
    setRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/workflows/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, contactId: selectedContactId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test failed");
      onComplete(json.enrollmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221536]/35 px-4 backdrop-blur-sm">
      <div
        className="aligno-panel w-full max-w-md rounded-2xl p-6 shadow-xl"
        style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Test Workflow</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1"
            style={{ color: getPurpleScaleColor(1) }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: getPurpleScaleColor(3) }}
            />
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">
            No contacts found. Create a contact first.
          </p>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select a contact
            </label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              disabled={running}
              className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 outline-none disabled:opacity-50"
              style={{
                borderColor: withAlpha(getPurpleScaleColor(4), 0.18),
                backgroundColor: "rgba(255, 255, 255, 0.92)",
              }}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </>
        )}

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ color: getPurpleScaleColor(5) }}
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={running || !selectedContactId || contacts.length === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${getPurpleScaleColor(4)}, ${getPurpleScaleColor(3)})`,
              boxShadow: `0 12px 24px ${withAlpha(getPurpleScaleColor(4), 0.2)}`,
            }}
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play size={14} />
                Run Test
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
