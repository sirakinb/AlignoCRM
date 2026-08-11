"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Contact } from "@/types/crm";
import { useAgentRun, type UseAgentRun } from "@/lib/agent/use-agent-run";
import { useVoice, type UseVoice } from "@/lib/agent/use-voice";
import type { AgentContextEntry, AgentResult } from "@/lib/agent/agui-client";
import { AgentCommandBar } from "@/components/agent/command-bar";

export interface AgentContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  activeContact: Contact | null;
  setActiveContact: (contact: Contact | null) => void;
  agent: UseAgentRun;
  runPrompt: (prompt: string) => Promise<AgentResult | null>;
  voice: UseVoice;
  startVoice: () => Promise<void>;
}

// The embedded agent only renders where a worker URL is explicitly configured.
// Unset (e.g. production today, where the worker isn't deployed) → no command
// bar, no Cmd+K, no trigger — so prod never shows a feature that would no-op.
// Build-time NEXT_PUBLIC_* constant, so this dead-code-eliminates in the bundle.
export const AGENT_ENABLED = Boolean(process.env.NEXT_PUBLIC_AGENT_URL);

const AgentContext = createContext<AgentContextValue | null>(null);

export function useOptionalAgentContext(): AgentContextValue | null {
  return useContext(AgentContext);
}

export function useAgentContext(): AgentContextValue {
  const value = useContext(AgentContext);
  if (!value) {
    throw new Error("useAgentContext must be used within <AgentProvider>");
  }
  return value;
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const agent = useAgentRun();
  const voice = useVoice();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!AGENT_ENABLED) return;
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const runPrompt = useCallback(
    async (prompt: string) => {
      const context: AgentContextEntry[] = activeContact
        ? [
            {
              description:
                "The CRM contact currently open in the dashboard (JSON)",
              value: JSON.stringify(activeContact),
            },
          ]
        : [];
      return agent.run(prompt, context);
    },
    [activeContact, agent]
  );

  const startVoice = useCallback(
    () => voice.start({ contact: activeContact, runTask: runPrompt }),
    [voice, activeContact, runPrompt]
  );

  const value = useMemo<AgentContextValue>(
    () => ({
      isOpen,
      open,
      close,
      activeContact,
      setActiveContact,
      agent,
      runPrompt,
      voice,
      startVoice,
    }),
    [isOpen, open, close, activeContact, agent, runPrompt, voice, startVoice]
  );

  return (
    <AgentContext.Provider value={value}>
      {children}
      {AGENT_ENABLED && <AgentCommandBar />}
    </AgentContext.Provider>
  );
}
