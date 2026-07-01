"use client";

import type { Pipeline } from "@/types/crm";

interface PipelineSelectorProps {
  pipelines: Pipeline[];
  selectedId: string;
  onChange: (pipelineId: string) => void;
}

export function PipelineSelector({
  pipelines,
  selectedId,
  onChange,
}: PipelineSelectorProps) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-colors hover:bg-zinc-50 focus:outline-none"
    >
      {pipelines.map((pipeline) => (
        <option key={pipeline.id} value={pipeline.id}>
          {pipeline.name}
        </option>
      ))}
    </select>
  );
}
