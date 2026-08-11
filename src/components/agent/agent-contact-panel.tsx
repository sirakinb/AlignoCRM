"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import type { Contact } from "@/types/crm";
import {
  AGENT_ENABLED,
  useOptionalAgentContext,
} from "@/components/agent/agent-provider";
import { AgentActivityFeed } from "@/components/agent/activity-feed";
import { AgentResultPanel } from "@/components/agent/result-panel";

/**
 * Mounted inside the contact drawer. Registers the open contact as agent
 * context and renders the live activity feed + result panel for the current
 * run. Renders nothing when no AgentProvider is present or nothing has run.
 */
export function AgentContactPanel({ contact }: { contact: Contact | null }) {
  const agentContext = useOptionalAgentContext();
  const setActiveContact = agentContext?.setActiveContact;

  useEffect(() => {
    if (!setActiveContact) return;
    setActiveContact(contact);
    return () => setActiveContact(null);
  }, [contact, setActiveContact]);

  if (!AGENT_ENABLED || !agentContext) return null;
  const { agent, open } = agentContext;

  const hasRunState =
    agent.isRunning || agent.activity.length > 0 || agent.result || agent.error;

  return (
    <div className="border-t border-[#f0f0f2] pt-5">
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Agent
        </label>
        <button
          type="button"
          onClick={open}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6c2bd9] transition-colors hover:bg-[#f4eefc]"
        >
          <Sparkles size={11} strokeWidth={1.8} />
          Ask Aligno
          <kbd className="ml-0.5 rounded border border-[#e7e7ea] bg-white px-1 text-[9.5px] text-zinc-400">
            ⌘K
          </kbd>
        </button>
      </div>

      {hasRunState ? (
        <div className="space-y-3">
          {agent.isRunning || agent.activity.length > 0 ? (
            <AgentActivityFeed
              activity={agent.activity}
              isRunning={agent.isRunning}
            />
          ) : null}
          {agent.error ? (
            <p className="text-[12.5px] text-red-600">{agent.error}</p>
          ) : null}
          {agent.result ? <AgentResultPanel result={agent.result} /> : null}
        </div>
      ) : (
        <p className="text-[12.5px] text-zinc-400">
          Ask the agent to research this contact, draft a follow-up, add a note,
          or create a task.
        </p>
      )}
    </div>
  );
}
