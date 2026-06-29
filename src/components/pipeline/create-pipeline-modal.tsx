"use client";

import { useState } from "react";
import { Plus, X, Loader2, AlertCircle } from "lucide-react";
import { ALIGNO_PURPLE_SCALE } from "@/lib/design/aligno-theme";
import { createPipeline } from "@/lib/api/crm";
import type { Pipeline, Stage } from "@/types/crm";

const DEFAULT_STAGE_COLORS = [...ALIGNO_PURPLE_SCALE];

interface CreatePipelineModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (pipeline: Pipeline, stages: Stage[]) => void;
}

export function CreatePipelineModal({
  open,
  onClose,
  onCreated,
}: CreatePipelineModalProps) {
  const [name, setName] = useState("");
  const [stageInputs, setStageInputs] = useState([
    { name: "", color: DEFAULT_STAGE_COLORS[0] },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStage = () => {
    const color =
      DEFAULT_STAGE_COLORS[stageInputs.length % DEFAULT_STAGE_COLORS.length];
    setStageInputs((prev) => [...prev, { name: "", color }]);
  };

  const removeStage = (index: number) => {
    if (stageInputs.length <= 1) return;
    setStageInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: "name" | "color", value: string) => {
    setStageInputs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Pipeline name is required");
      return;
    }
    const validStages = stageInputs.filter((s) => s.name.trim());
    if (validStages.length === 0) {
      setError("Add at least one stage");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { pipeline, stages } = await createPipeline({
        name: name.trim(),
        stages: validStages.map((s) => ({
          name: s.name.trim(),
          color: s.color,
        })),
      });
      onCreated(pipeline, stages);
      setName("");
      setStageInputs([{ name: "", color: DEFAULT_STAGE_COLORS[0] }]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pipeline");
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
          <h2 className="text-lg font-semibold text-gray-900">New Pipeline</h2>
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
              Pipeline Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Pipeline"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stages <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {stageInputs.map((stage, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => updateStage(i, "color", e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-gray-300 p-0.5"
                  />
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => updateStage(i, "name", e.target.value)}
                    placeholder={`Stage ${i + 1}`}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-1 focus:ring-[#6C2BD9] transition-colors"
                  />
                  {stageInputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStage(i)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStage}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#6C2BD9] hover:text-[#5b24b8] transition-colors"
            >
              <Plus size={12} />
              Add stage
            </button>
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
                  Create Pipeline
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
