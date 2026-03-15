"use client";

import { useState, useEffect } from "react";
import type { TriggerConfig } from "@/types/workflow";
import type { Pipeline, Stage } from "@/types/crm";
import { inputClass, labelClass } from "./shared";

interface TriggerFormProps {
  config: TriggerConfig;
  onChange: (config: TriggerConfig) => void;
}

const TRIGGER_TYPES = [
  { value: "contact_created", label: "Contact Created" },
  { value: "tag_added", label: "Tag Added" },
  { value: "deal_stage_changed", label: "Deal Stage Changed" },
];

export function TriggerForm({ config, onChange }: TriggerFormProps) {
  const triggerType = config.triggerType || "contact_created";

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  // Load pipelines when deal_stage_changed is selected
  useEffect(() => {
    if (triggerType !== "deal_stage_changed") return;
    fetch("/api/pipelines?workspaceId=default")
      .then((res) => res.json())
      .then((json) => setPipelines(json.pipelines ?? []))
      .catch(() => {});
  }, [triggerType]);

  // Load stages when pipeline changes
  const selectedPipelineId = (config.filters?.pipelineId as string) ?? "";
  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      return;
    }
    fetch(`/api/pipelines?pipelineId=${selectedPipelineId}`)
      .then((res) => res.json())
      .then((json) => setStages(json.stages ?? []))
      .catch(() => {});
  }, [selectedPipelineId]);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Trigger Type</label>
        <select
          className={inputClass}
          value={triggerType}
          data-testid="trigger-type-select"
          onChange={(e) =>
            onChange({ ...config, triggerType: e.target.value, filters: {} })
          }
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {triggerType === "tag_added" && (
        <div>
          <label className={labelClass}>Tag Name</label>
          <input
            type="text"
            className={inputClass}
            placeholder="e.g. VIP"
            value={(config.filters?.tagName as string) ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                filters: { ...config.filters, tagName: e.target.value },
              })
            }
          />
        </div>
      )}

      {triggerType === "deal_stage_changed" && (
        <>
          <div>
            <label className={labelClass}>Pipeline</label>
            <select
              className={inputClass}
              value={selectedPipelineId}
              onChange={(e) =>
                onChange({
                  ...config,
                  filters: { ...config.filters, pipelineId: e.target.value, stageId: "" },
                })
              }
            >
              <option value="">Select a pipeline</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Stage</label>
            <select
              className={inputClass}
              value={(config.filters?.stageId as string) ?? ""}
              onChange={(e) =>
                onChange({
                  ...config,
                  filters: { ...config.filters, stageId: e.target.value },
                })
              }
            >
              <option value="">Any stage</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
