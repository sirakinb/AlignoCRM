"use client";

import { Sparkles } from "lucide-react";
import {
  AGENT_ENABLED,
  useOptionalAgentContext,
} from "@/components/agent/agent-provider";

/** Small command-bar trigger for dashboard page headers. */
export function AgentTrigger() {
  const agentContext = useOptionalAgentContext();
  if (!AGENT_ENABLED || !agentContext) return null;

  return (
    <button
      type="button"
      onClick={agentContext.open}
      className="flex items-center gap-1.5 rounded-lg border border-[#e7e7ea] bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-colors hover:bg-zinc-50"
    >
      <Sparkles size={13} strokeWidth={1.8} className="text-[#6c2bd9]" />
      Ask Aligno
      <kbd className="rounded border border-[#e7e7ea] bg-[#fafafa] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
        ⌘K
      </kbd>
    </button>
  );
}
