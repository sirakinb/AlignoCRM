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
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
    >
      {pipelines.map((pipeline) => (
        <option key={pipeline.id} value={pipeline.id}>
          {pipeline.name}
        </option>
      ))}
    </select>
  );
}
