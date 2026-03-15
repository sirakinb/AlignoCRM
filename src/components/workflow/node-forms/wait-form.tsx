"use client";

import type { WaitConfig } from "@/types/workflow";
import { inputClass, labelClass } from "./shared";

interface WaitFormProps {
  config: WaitConfig;
  onChange: (config: WaitConfig) => void;
}

export function WaitForm({ config, onChange }: WaitFormProps) {
  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className={labelClass}>Duration</label>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={config.duration ?? 1}
          onChange={(e) =>
            onChange({ ...config, duration: Math.max(1, parseInt(e.target.value) || 1) })
          }
        />
      </div>
      <div className="flex-1">
        <label className={labelClass}>Unit</label>
        <select
          className={inputClass}
          value={config.unit ?? "minutes"}
          onChange={(e) =>
            onChange({ ...config, unit: e.target.value as WaitConfig["unit"] })
          }
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </div>
  );
}
