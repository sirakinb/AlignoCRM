"use client";

import { StepOutcome } from "@/types/enrollment";
import type { ExecutionStep } from "@/types/enrollment";
import { nodeTypeConfigs } from "@/components/workflow/node-types";
import { NodeType } from "@/types/workflow";

const outcomeConfig: Record<
  StepOutcome,
  { label: string; dotClass: string }
> = {
  [StepOutcome.Completed]: {
    label: "Completed",
    dotClass: "bg-green-500",
  },
  [StepOutcome.Failed]: {
    label: "Failed",
    dotClass: "bg-red-500",
  },
  [StepOutcome.Skipped]: {
    label: "Skipped",
    dotClass: "bg-gray-400",
  },
  [StepOutcome.Waiting]: {
    label: "Waiting",
    dotClass: "bg-yellow-500",
  },
  [StepOutcome.Canceled]: {
    label: "Canceled",
    dotClass: "bg-gray-400",
  },
};

interface StepLogProps {
  steps: ExecutionStep[];
}

export function StepLog({ steps }: StepLogProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        No execution steps recorded.
      </div>
    );
  }

  return (
    <div className="space-y-0" data-testid="step-log">
      {steps.map((step, index) => {
        const outcome = outcomeConfig[step.outcome];
        const nodeConfig =
          nodeTypeConfigs[step.node_type as NodeType] ?? null;
        const time = step.completed_at
          ? new Date(step.completed_at).toLocaleTimeString()
          : "In progress";
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <div
                className={`mt-1 h-3 w-3 rounded-full ${outcome.dotClass}`}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-gray-200" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 ${isLast ? "" : "pb-4"}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {nodeConfig?.label ?? step.node_type}
                </span>
                <span
                  className="text-xs text-gray-500"
                  style={{ color: nodeConfig?.color }}
                >
                  {nodeConfig?.typeLabel}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                <span>{outcome.label}</span>
                <span>&middot;</span>
                <span>{time}</span>
              </div>

              {/* Error message for failed steps */}
              {step.error_message && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {step.error_message}
                </div>
              )}

              {/* Provider response */}
              {step.provider_response && (
                <div className="mt-1 text-xs text-gray-400">
                  Provider:{" "}
                  {JSON.stringify(step.provider_response).slice(0, 80)}
                  {JSON.stringify(step.provider_response).length > 80 && "..."}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
