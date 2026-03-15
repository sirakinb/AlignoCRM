"use client";

import type { SendEmailConfig } from "@/types/workflow";
import { inputClass, labelClass, InsertVariableDropdown } from "./shared";

interface SendEmailFormProps {
  config: SendEmailConfig;
  onChange: (config: SendEmailConfig) => void;
}

export function SendEmailForm({ config, onChange }: SendEmailFormProps) {
  const insertVariable = (field: keyof SendEmailConfig, variable: string) => {
    const current = (config[field] as string) ?? "";
    onChange({ ...config, [field]: current + variable });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">To</label>
          <InsertVariableDropdown onInsert={(v) => insertVariable("to", v)} />
        </div>
        <input
          type="text"
          className={inputClass}
          placeholder="{{contact.email}}"
          value={config.to ?? ""}
          onChange={(e) => onChange({ ...config, to: e.target.value })}
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Subject</label>
          <InsertVariableDropdown onInsert={(v) => insertVariable("subject", v)} />
        </div>
        <input
          type="text"
          className={inputClass}
          placeholder="Email subject"
          value={config.subject ?? ""}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Body</label>
          <InsertVariableDropdown onInsert={(v) => insertVariable("body", v)} />
        </div>
        <textarea
          rows={4}
          className={inputClass}
          placeholder="Email body content..."
          value={config.body ?? ""}
          onChange={(e) => onChange({ ...config, body: e.target.value })}
        />
      </div>
    </div>
  );
}
