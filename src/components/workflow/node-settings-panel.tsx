"use client";

import { useState } from "react";
import { NodeType, type NodeConfig } from "@/types/workflow";
import type {
  TriggerConfig,
  SendEmailConfig,
  WaitConfig,
  ConditionConfig,
  AiDraftMessageConfig,
  AddTagConfig,
  RemoveTagConfig,
  MoveDealStageConfig,
  CreateTaskConfig,
  WebhookConfig,
  StopWorkflowConfig,
} from "@/types/workflow";
import { nodeTypeConfigs } from "./node-types";
import type { WorkflowNodeData } from "./workflow-node";
import { getDefaultNodeConfig } from "./node-defaults";
import { X } from "lucide-react";
import {
  TriggerForm,
  SendEmailForm,
  WaitForm,
  ConditionForm,
  AiDraftForm,
  AddTagForm,
  RemoveTagForm,
  MoveDealStageForm,
  CreateTaskForm,
  WebhookForm,
  StopWorkflowForm,
} from "./node-forms";

interface NodeSettingsPanelProps {
  nodeData: WorkflowNodeData;
  onClose: () => void;
  onSave: (data: WorkflowNodeData) => void;
}

const getDefaultConfig = getDefaultNodeConfig;

export function NodeSettingsPanel({
  nodeData,
  onClose,
  onSave,
}: NodeSettingsPanelProps) {
  const typeConfig = nodeTypeConfigs[nodeData.nodeType];
  const [title, setTitle] = useState(nodeData.title);
  const [config, setConfig] = useState<NodeConfig>(
    nodeData.config ?? getDefaultConfig(nodeData.nodeType)
  );

  const handleSave = () => {
    onSave({ ...nodeData, title, config });
  };

  return (
    <div
      className="flex h-full w-[340px] flex-col border-l border-gray-200 bg-white"
      data-testid="node-settings-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: typeConfig.bgTint }}
          >
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: typeConfig.color }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-900">
            Node Settings
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Node Title */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Node Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Type-specific form */}
        {renderNodeForm(nodeData.nodeType, config, setConfig)}
      </div>

      {/* Footer */}
      <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 rounded-lg bg-[#6C2BD9] py-2 text-sm font-medium text-white hover:bg-[#5b24b8]"
        >
          Save Node
        </button>
      </div>
    </div>
  );
}

function renderNodeForm(
  nodeType: NodeType,
  config: NodeConfig,
  onChange: (config: NodeConfig) => void
) {
  switch (nodeType) {
    case NodeType.Trigger:
      return (
        <TriggerForm
          config={config as TriggerConfig}
          onChange={onChange}
        />
      );
    case NodeType.SendEmail:
      return (
        <SendEmailForm
          config={config as SendEmailConfig}
          onChange={onChange}
        />
      );
    case NodeType.Wait:
      return (
        <WaitForm config={config as WaitConfig} onChange={onChange} />
      );
    case NodeType.Condition:
      return (
        <ConditionForm
          config={config as ConditionConfig}
          onChange={onChange}
        />
      );
    case NodeType.AiDraftMessage:
      return (
        <AiDraftForm
          config={config as AiDraftMessageConfig}
          onChange={onChange}
        />
      );
    case NodeType.AddTag:
      return (
        <AddTagForm config={config as AddTagConfig} onChange={onChange} />
      );
    case NodeType.RemoveTag:
      return (
        <RemoveTagForm
          config={config as RemoveTagConfig}
          onChange={onChange}
        />
      );
    case NodeType.MoveDealStage:
      return (
        <MoveDealStageForm
          config={config as MoveDealStageConfig}
          onChange={onChange}
        />
      );
    case NodeType.CreateTask:
      return (
        <CreateTaskForm
          config={config as CreateTaskConfig}
          onChange={onChange}
        />
      );
    case NodeType.Webhook:
      return (
        <WebhookForm
          config={config as WebhookConfig}
          onChange={onChange}
        />
      );
    case NodeType.StopWorkflow:
      return (
        <StopWorkflowForm
          config={config as StopWorkflowConfig}
          onChange={onChange}
        />
      );
    default:
      return (
        <p className="text-sm text-gray-500">
          Configure this {nodeTypeConfigs[nodeType].label} node.
        </p>
      );
  }
}
