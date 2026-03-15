"use client";

import type { ConditionConfig, ConditionRule } from "@/types/workflow";
import { inputClass, labelClass } from "./shared";

interface ConditionFormProps {
  config: ConditionConfig;
  onChange: (config: ConditionConfig) => void;
}

const FIELD_OPTIONS = [
  { value: "contact.email", label: "Contact Email" },
  { value: "contact.first_name", label: "First Name" },
  { value: "contact.last_name", label: "Last Name" },
  { value: "contact.company", label: "Company" },
  { value: "deal.value", label: "Deal Value" },
  { value: "deal.stage", label: "Deal Stage" },
  { value: "contact.tag", label: "Tag" },
];

const OPERATOR_OPTIONS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
];

function emptyRule(): ConditionRule {
  return { field: "contact.email", operator: "equals", value: "" };
}

export function ConditionForm({ config, onChange }: ConditionFormProps) {
  const rules = config.rules?.length ? config.rules : [emptyRule()];

  const updateRule = (index: number, patch: Partial<ConditionRule>) => {
    const updated = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({ ...config, rules: updated });
  };

  const addRule = () => {
    onChange({ ...config, rules: [...rules, emptyRule()] });
  };

  const removeRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    onChange({ ...config, rules: updated.length ? updated : [emptyRule()] });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Condition Name</label>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. Has Email"
          value={config.conditionName ?? ""}
          onChange={(e) => onChange({ ...config, conditionName: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass}>Logic Operator</label>
        <select
          className={inputClass}
          value={config.logicOperator ?? "AND"}
          onChange={(e) =>
            onChange({
              ...config,
              logicOperator: e.target.value as ConditionConfig["logicOperator"],
            })
          }
        >
          <option value="AND">Match All (AND)</option>
          <option value="OR">Match Any (OR)</option>
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Rules</label>
          <button
            type="button"
            className="text-xs font-medium text-purple-600 hover:text-purple-700"
            onClick={addRule}
          >
            + Add Rule
          </button>
        </div>

        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-200 p-3"
              data-testid={`condition-rule-${index}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium text-gray-400">
                  Rule {index + 1}
                </span>
                {rules.length > 1 && (
                  <button
                    type="button"
                    className="text-[10px] text-red-500 hover:text-red-700"
                    onClick={() => removeRule(index)}
                    data-testid={`remove-rule-${index}`}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <select
                  className={inputClass}
                  value={rule.field}
                  onChange={(e) => updateRule(index, { field: e.target.value })}
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={rule.operator}
                  onChange={(e) => updateRule(index, { operator: e.target.value })}
                >
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Value"
                  value={(rule.value as string) ?? ""}
                  onChange={(e) => updateRule(index, { value: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
