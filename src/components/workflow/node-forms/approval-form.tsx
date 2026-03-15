"use client";

import type { ApprovalConfig } from "@/types/workflow";
import { inputClass, labelClass } from "./shared";

interface ApprovalFormProps {
  config: ApprovalConfig;
  onChange: (config: ApprovalConfig) => void;
}

export function ApprovalForm({ config, onChange }: ApprovalFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          rows={3}
          className={inputClass}
          placeholder="Describe what needs to be approved..."
          value={config.description ?? ""}
          onChange={(e) => onChange({ ...config, description: e.target.value })}
        />
      </div>
      <div>
        <label className={labelClass}>Assignee (optional)</label>
        <input
          type="text"
          className={inputClass}
          placeholder="Assignee ID"
          value={config.assigneeId ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              assigneeId: e.target.value || undefined,
            })
          }
        />
      </div>
    </div>
  );
}
