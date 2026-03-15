"use client";

import { useState } from "react";

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
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500";

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
        className="text-xs font-medium text-purple-600 hover:text-purple-700"
        onClick={() => setOpen(!open)}
      >
        Insert Variable
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {AVAILABLE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-purple-50"
              onClick={() => {
                onInsert(v);
                setOpen(false);
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
