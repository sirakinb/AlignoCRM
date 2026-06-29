"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2, AlertCircle, DollarSign, User } from "lucide-react";
import { createDeal } from "@/lib/api/crm";
import type { Contact, Deal, Pipeline, Stage } from "@/types/crm";

interface CreateDealModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (deal: Deal) => void;
  pipelines: Pipeline[];
  stages: Stage[];
  contacts: Contact[];
  selectedPipelineId: string;
  onPipelineChangeForStages: (pipelineId: string) => Promise<Stage[]>;
}

export function CreateDealModal({
  open,
  onClose,
  onCreated,
  pipelines,
  stages: initialStages,
  contacts,
  selectedPipelineId,
  onPipelineChangeForStages,
}: CreateDealModalProps) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const [pipelineId, setPipelineId] = useState(selectedPipelineId);
  const [stageId, setStageId] = useState(initialStages[0]?.id ?? "");
  const [modalStages, setModalStages] = useState<Stage[]>(initialStages);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModalStages(initialStages);
    if (pipelineId === selectedPipelineId) {
      setStageId(initialStages[0]?.id ?? "");
    }
  }, [initialStages, pipelineId, selectedPipelineId]);

  useEffect(() => {
    setPipelineId(selectedPipelineId);
  }, [selectedPipelineId]);

  const handlePipelineChange = async (newPipelineId: string) => {
    setPipelineId(newPipelineId);
    try {
      const newStages = await onPipelineChangeForStages(newPipelineId);
      setModalStages(newStages);
      setStageId(newStages[0]?.id ?? "");
    } catch {
      // Keep existing stages on error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Deal name is required");
      return;
    }
    if (!stageId) {
      setError("Please select a stage");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const deal = await createDeal({
        title: title.trim(),
        value: parseFloat(value) || 0,
        contact_id: contactId || null,
        pipeline_id: pipelineId,
        stage_id: stageId,
      });
      onCreated(deal);
      setTitle("");
      setValue("");
      setContactId("");
      setStageId(initialStages[0]?.id ?? "");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">New Deal</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Deal Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp - Enterprise License"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Deal Value
            </label>
            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contact
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white pl-9 pr-8 py-2.5 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              >
                <option value="">No contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Pipeline
              </label>
              <select
                value={pipelineId}
                onChange={(e) => handlePipelineChange(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Stage
              </label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              >
                {modalStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#6C2BD9] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5b24b8] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
