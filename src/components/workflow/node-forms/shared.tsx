"use client";

import { useState } from "react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";

const AVAILABLE_VARIABLES = [
  "{{contact.email}}",
  "{{contact.first_name}}",
  "{{contact.last_name}}",
  "{{contact.company}}",
  "{{contact.phone}}",
  "{{deal.name}}",
  "{{deal.value}}",
  "{{deal.stage}}",
];

export const inputClass =
  "w-full rounded-lg border border-[#CFAFF5] bg-white/90 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#6E2ABD] focus:ring-2 focus:ring-[#B97AF6]/20";

export const labelClass = "mb-1 block text-xs font-medium text-gray-700";

interface InsertVariableDropdownProps {
  onInsert: (variable: string) => void;
}

export function InsertVariableDropdown({ onInsert }: InsertVariableDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="text-xs font-medium transition-colors"
        style={{ color: getPurpleScaleColor(4) }}
        onClick={() => setOpen(!open)}
      >
        Insert Variable
      </button>
      {open && (
        <div
          className="aligno-panel absolute right-0 z-10 mt-1 w-48 rounded-lg py-1 shadow-lg"
          style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
        >
          {AVAILABLE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs transition-colors"
              style={{ color: "#43385e" }}
              onClick={() => {
                onInsert(v);
                setOpen(false);
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = withAlpha(
                  getPurpleScaleColor(0),
                  0.1
                );
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
