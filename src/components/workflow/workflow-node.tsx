"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { NodeType, type NodeConfig } from "@/types/workflow";
import { nodeTypeConfigs } from "./node-types";
import { Check, X, Clock } from "lucide-react";

export interface WorkflowNodeData {
  nodeType: NodeType;
  title: string;
  subtitle?: string;
  config?: NodeConfig;
  executionStatus?: "completed" | "failed" | "waiting" | "active" | null;
  activeContactCount?: number;
}

function StatusIndicator({
  status,
}: {
  status: "completed" | "failed" | "waiting" | "active";
}) {
  switch (status) {
    case "completed":
      return (
        <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: getPurpleScaleColor(5) }}>
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      );
    case "failed":
      return (
        <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 shadow-sm">
          <X size={12} className="text-white" strokeWidth={3} />
        </div>
      );
    case "waiting":
      return (
        <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: getPurpleScaleColor(1) }}>
          <Clock size={10} className="text-white" strokeWidth={3} />
        </div>
      );
    case "active":
      return (
        <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: getPurpleScaleColor(4) }}>
          <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
        </div>
      );
  }
}

function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps<WorkflowNodeData>) {
  const config = nodeTypeConfigs[data.nodeType];
  const isCondition = data.nodeType === NodeType.Condition;
  const isActive = data.executionStatus === "active";

  return (
    <div
      className={`
        relative min-w-[160px] max-w-[200px] rounded-2xl border-2 px-4 py-3
        shadow-sm transition-all
        ${selected ? "shadow-md" : "shadow-sm hover:shadow-md"}
        ${isActive ? "shadow-md" : ""}
      `}
      style={{
        backgroundColor: config.bgTint,
        borderLeftColor: selected
          ? config.color
          : isActive
            ? getPurpleScaleColor(4)
            : config.borderColor + "40",
        borderRightColor: selected
          ? config.color
          : isActive
            ? getPurpleScaleColor(4)
            : config.borderColor + "40",
        borderBottomColor: selected
          ? config.color
          : isActive
            ? getPurpleScaleColor(4)
            : config.borderColor + "40",
        borderTopColor: config.borderColor,
        borderTopWidth: "3px",
        boxShadow: [
          selected
            ? `0 0 0 2px ${withAlpha(config.color, 0.2)}`
            : isActive
              ? `0 0 0 2px ${withAlpha(getPurpleScaleColor(4), 0.22)}`
              : null,
          isActive
            ? `0 0 12px ${withAlpha(getPurpleScaleColor(4), 0.26)}`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      }}
      data-testid={`workflow-node-${data.nodeType}`}
    >
      {/* Execution status indicator */}
      {data.executionStatus && (
        <StatusIndicator status={data.executionStatus} />
      )}

      {/* Active contact count badge */}
      {data.activeContactCount != null && data.activeContactCount > 0 && (
        <div
          className="absolute -bottom-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: getPurpleScaleColor(5) }}
        >
          {data.activeContactCount}
        </div>
      )}

      {/* Input handle */}
      {data.nodeType !== NodeType.Trigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-white"
          style={{ backgroundColor: getPurpleScaleColor(1) }}
        />
      )}

      {/* Type label */}
      <div className="mb-1 flex items-center gap-1.5">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <span
          className="text-[10px] font-semibold tracking-wider"
          style={{ color: config.color }}
        >
          {config.typeLabel}
        </span>
      </div>

      {/* Title */}
      <div className="text-sm font-semibold text-gray-900">{data.title}</div>

      {/* Subtitle */}
      {data.subtitle && (
        <div className="mt-0.5 text-xs text-gray-500">{data.subtitle}</div>
      )}

      {/* Output handle(s) */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            className="!h-3 !w-3 !rounded-full !border-2 !border-white"
            style={{ top: "35%", backgroundColor: getPurpleScaleColor(4) }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="no"
            className="!h-3 !w-3 !rounded-full !border-2 !border-white"
            style={{ top: "65%", backgroundColor: getPurpleScaleColor(2) }}
          />
        </>
      ) : (
        data.nodeType !== NodeType.StopWorkflow && (
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white"
            style={{ backgroundColor: getPurpleScaleColor(1) }}
          />
        )
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
