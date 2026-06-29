"use client";

import { useEffect, useState } from "react";
import type {
  AddTagConfig,
  RemoveTagConfig,
  MoveDealStageConfig,
  CreateTaskConfig,
  WebhookConfig,
  StopWorkflowConfig,
} from "@/types/workflow";
import { fetchPipelines, fetchStages, fetchTags } from "@/lib/api/crm";
import { inputClass, labelClass } from "./shared";
import type { Tag, Pipeline, Stage } from "@/types/crm";

// Add Tag
interface AddTagFormProps {
  config: AddTagConfig;
  onChange: (config: AddTagConfig) => void;
}

export function AddTagForm({ config, onChange }: AddTagFormProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Tag</label>
        {loading ? (
          <p className="text-xs text-gray-400">Loading tags...</p>
        ) : tags.length === 0 ? (
          <p className="text-xs text-gray-400">No tags found. Create tags in Contacts first.</p>
        ) : (
          <select
            className={inputClass}
            value={config.tagId ?? ""}
            onChange={(e) => {
              const tag = tags.find((t) => t.id === e.target.value);
              onChange({
                ...config,
                tagId: e.target.value,
                tagName: tag?.name ?? "",
              });
            }}
          >
            <option value="">Select a tag...</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Remove Tag
interface RemoveTagFormProps {
  config: RemoveTagConfig;
  onChange: (config: RemoveTagConfig) => void;
}

export function RemoveTagForm({ config, onChange }: RemoveTagFormProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Tag</label>
        {loading ? (
          <p className="text-xs text-gray-400">Loading tags...</p>
        ) : tags.length === 0 ? (
          <p className="text-xs text-gray-400">No tags found.</p>
        ) : (
          <select
            className={inputClass}
            value={config.tagId ?? ""}
            onChange={(e) => {
              const tag = tags.find((t) => t.id === e.target.value);
              onChange({
                ...config,
                tagId: e.target.value,
                tagName: tag?.name ?? "",
              });
            }}
          >
            <option value="">Select a tag...</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Move Deal Stage
interface MoveDealStageFormProps {
  config: MoveDealStageConfig;
  onChange: (config: MoveDealStageConfig) => void;
}

export function MoveDealStageForm({ config, onChange }: MoveDealStageFormProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [loadingStages, setLoadingStages] = useState(false);

  useEffect(() => {
    fetchPipelines()
      .then(setPipelines)
      .catch(console.error)
      .finally(() => setLoadingPipelines(false));
  }, []);

  useEffect(() => {
    if (!config.pipelineId) {
      setStages([]);
      return;
    }
    setLoadingStages(true);
    fetchStages(config.pipelineId)
      .then(setStages)
      .catch(console.error)
      .finally(() => setLoadingStages(false));
  }, [config.pipelineId]);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Pipeline</label>
        {loadingPipelines ? (
          <p className="text-xs text-gray-400">Loading pipelines...</p>
        ) : (
          <select
            className={inputClass}
            value={config.pipelineId ?? ""}
            onChange={(e) =>
              onChange({ ...config, pipelineId: e.target.value, stageId: "" })
            }
          >
            <option value="">Select a pipeline...</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className={labelClass}>Stage</label>
        {loadingStages ? (
          <p className="text-xs text-gray-400">Loading stages...</p>
        ) : !config.pipelineId ? (
          <p className="text-xs text-gray-400">Select a pipeline first.</p>
        ) : stages.length === 0 ? (
          <p className="text-xs text-gray-400">No stages found.</p>
        ) : (
          <select
            className={inputClass}
            value={config.stageId ?? ""}
            onChange={(e) => onChange({ ...config, stageId: e.target.value })}
          >
            <option value="">Select a stage...</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Create Task
interface CreateTaskFormProps {
  config: CreateTaskConfig;
  onChange: (config: CreateTaskConfig) => void;
}

export function CreateTaskForm({ config, onChange }: CreateTaskFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Task Title</label>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. Follow up with contact"
          value={config.title ?? ""}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
        />
      </div>
      <div>
        <label className={labelClass}>Description (optional)</label>
        <textarea
          rows={2}
          className={inputClass}
          placeholder="Task description..."
          value={config.description ?? ""}
          onChange={(e) =>
            onChange({ ...config, description: e.target.value || undefined })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Assignee ID (optional)</label>
        <input
          type="text"
          className={inputClass}
          placeholder="Assignee ID"
          value={config.assigneeId ?? ""}
          onChange={(e) =>
            onChange({ ...config, assigneeId: e.target.value || undefined })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Due In (days)</label>
        <input
          type="number"
          min={0}
          className={inputClass}
          placeholder="e.g. 3"
          value={config.dueInDays ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              dueInDays: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
        />
      </div>
    </div>
  );
}

// Webhook
interface WebhookFormProps {
  config: WebhookConfig;
  onChange: (config: WebhookConfig) => void;
}

export function WebhookForm({ config, onChange }: WebhookFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>URL</label>
        <input
          type="url"
          className={inputClass}
          placeholder="https://example.com/webhook"
          value={config.url ?? ""}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
        />
      </div>
      <div>
        <label className={labelClass}>Method</label>
        <select
          className={inputClass}
          value={config.method ?? "POST"}
          onChange={(e) =>
            onChange({
              ...config,
              method: e.target.value as WebhookConfig["method"],
            })
          }
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>
    </div>
  );
}

// Stop Workflow
interface StopWorkflowFormProps {
  config: StopWorkflowConfig;
  onChange: (config: StopWorkflowConfig) => void;
}

export function StopWorkflowForm({ config, onChange }: StopWorkflowFormProps) {
  return (
    <div>
      <label className={labelClass}>Reason (optional)</label>
      <textarea
        rows={2}
        className={inputClass}
        placeholder="Reason for stopping the workflow..."
        value={config.reason ?? ""}
        onChange={(e) =>
          onChange({ ...config, reason: e.target.value || undefined })
        }
      />
    </div>
  );
}
