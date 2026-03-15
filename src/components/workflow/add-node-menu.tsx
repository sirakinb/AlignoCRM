"use client";

import { useEffect, useRef } from "react";
import { NodeType } from "@/types/workflow";
import { nodeCategories, nodeTypeConfigs } from "./node-types";

interface AddNodeMenuProps {
  position: { x: number; y: number };
  onAddNode: (nodeType: NodeType, title: string, subtitle?: string) => void;
  onClose: () => void;
}

const COMING_SOON_NODES = new Set<NodeType>([
  NodeType.SendSms,
  NodeType.CreateTask,
  NodeType.Webhook,
  NodeType.AiAnalyze,
  NodeType.AiRoute,
  NodeType.AiDraftMessage,
]);

export function AddNodeMenu({ position, onAddNode, onClose }: AddNodeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
      style={{ left: position.x, top: position.y }}
      data-testid="add-node-menu"
    >
      <div className="mb-2 px-2 text-xs font-semibold text-gray-400">
        ADD NODE
      </div>
      {nodeCategories.map((category) => (
        <div key={category.label} className="mb-2">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {category.label}
          </div>
          {category.types.map((nodeType) => {
            const config = nodeTypeConfigs[nodeType];
            const isDisabled = COMING_SOON_NODES.has(nodeType);
            return (
              <button
                key={nodeType}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                  isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-50"
                }`}
                onClick={isDisabled ? undefined : () => onAddNode(nodeType, config.label)}
                disabled={isDisabled}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className={isDisabled ? "text-gray-400" : "text-gray-700"}>{config.label}</span>
                {isDisabled && (
                  <span className="ml-auto text-[10px] text-gray-400">Coming Soon</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
