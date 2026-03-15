"use client";

import { useState } from "react";
import type { AiDraftMessageConfig } from "@/types/workflow";
import { inputClass, labelClass, InsertVariableDropdown } from "./shared";

interface AiDraftFormProps {
  config: AiDraftMessageConfig;
  onChange: (config: AiDraftMessageConfig) => void;
}

export function AiDraftForm({ config, onChange }: AiDraftFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const insertVariable = (variable: string) => {
    const current = config.promptTemplate ?? "";
    onChange({ ...config, promptTemplate: current + variable });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">
            Prompt Template
          </label>
          <InsertVariableDropdown onInsert={insertVariable} />
        </div>
        <textarea
          rows={5}
          className="w-full rounded-lg border border-l-4 border-gray-200 border-l-purple-400 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          placeholder="Write a brief, warm welcome email to {{contact.first_name}} at {{contact.company}}."
          value={config.promptTemplate ?? ""}
          onChange={(e) =>
            onChange({ ...config, promptTemplate: e.target.value })
          }
        />
        <p className="mt-1 text-[10px] text-gray-400">
          Use {"{{ }}"} to reference data from previous nodes.
        </p>
      </div>

      <div>
        <label className={labelClass}>Output Format</label>
        <select
          className={inputClass}
          value={config.outputFormat ?? "email"}
          onChange={(e) =>
            onChange({
              ...config,
              outputFormat: e.target.value as AiDraftMessageConfig["outputFormat"],
            })
          }
        >
          <option value="email">Email Draft (HTML)</option>
          <option value="sms">SMS Message</option>
          <option value="note">Internal Note</option>
        </select>
      </div>

      <div>
        <button
          type="button"
          className="w-full rounded-lg border border-gray-200 p-3 text-left"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          data-testid="advanced-settings-toggle"
        >
          <span className="text-xs font-medium text-gray-500">
            Advanced Model Settings {advancedOpen ? "−" : "+"}
          </span>
        </button>
        {advancedOpen && (
          <div className="mt-2 space-y-3 rounded-lg border border-gray-100 p-3">
            <div>
              <label className={labelClass}>Context Fields</label>
              <input
                type="text"
                className={inputClass}
                placeholder="contact.email, deal.name"
                value={(config.contextFields ?? []).join(", ")}
                onChange={(e) =>
                  onChange({
                    ...config,
                    contextFields: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Comma-separated list of fields to include as context.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">
            Require Human Approval
          </div>
          <div className="text-xs text-gray-500">
            Pause workflow until reviewed
          </div>
        </div>
        <button
          type="button"
          className={`h-6 w-11 rounded-full p-0.5 ${
            config.requireApproval ? "bg-purple-600" : "bg-gray-300"
          }`}
          role="switch"
          aria-checked={config.requireApproval ?? true}
          data-testid="require-approval-toggle"
          onClick={() =>
            onChange({
              ...config,
              requireApproval: !(config.requireApproval ?? true),
            })
          }
        >
          <span
            className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              config.requireApproval ?? true ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
