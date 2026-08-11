"use client";

import { useEffect, useRef, useState } from "react";
import {
  CornerDownLeft,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useAgentContext } from "@/components/agent/agent-provider";
import { AgentActivityFeed } from "@/components/agent/activity-feed";
import { AgentConnectionsStatus } from "@/components/agent/connections-status";
import { AgentResultPanel } from "@/components/agent/result-panel";

export function AgentCommandBar() {
  const { isOpen, close, activeContact, agent, runPrompt, voice, startVoice } =
    useAgentContext();
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const contactName = activeContact
    ? `${activeContact.first_name} ${activeContact.last_name}`.trim()
    : null;

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed || agent.isRunning) return;
    void runPrompt(trimmed);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/25 transition-opacity"
        onClick={close}
      />

      <div className="fixed left-1/2 top-[14%] z-[80] w-full max-w-xl -translate-x-1/2 px-4">
        <div className="overflow-hidden rounded-xl border border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_16px_48px_rgba(17,17,26,0.14)]">
          {/* Input row */}
          <div className="flex items-center gap-2.5 border-b border-[#f0f0f2] px-4 py-3">
            <Sparkles
              size={15}
              strokeWidth={1.8}
              className="shrink-0 text-[#6c2bd9]"
            />
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                contactName
                  ? `Ask Aligno about ${contactName}…`
                  : "Ask Aligno anything…"
              }
              className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
            {voice.status === "idle" || voice.status === "error" ? (
              <button
                onClick={() => void startVoice()}
                title="Start voice mode"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-[#f4eefc] hover:text-[#6c2bd9]"
              >
                <Mic size={15} strokeWidth={1.8} />
              </button>
            ) : voice.status === "connecting" ? (
              <span className="p-1.5">
                <Loader2
                  size={15}
                  strokeWidth={1.8}
                  className="animate-spin text-[#6c2bd9]"
                />
              </span>
            ) : (
              <button
                onClick={voice.stop}
                title="End voice mode"
                className="flex items-center gap-1.5 rounded-lg bg-[#f4eefc] px-2 py-1.5 text-[12px] font-medium text-[#6c2bd9] transition-colors hover:bg-[#ead9fb]"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6c2bd9] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#6c2bd9]" />
                </span>
                <MicOff size={13} strokeWidth={1.8} />
                End
              </button>
            )}
            {agent.isRunning ? (
              <button
                onClick={agent.cancel}
                className="flex items-center gap-1.5 rounded-lg border border-[#e7e7ea] px-2.5 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                <Square size={10} strokeWidth={2} />
                Stop
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-[#6c2bd9] px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#5b21b6] disabled:opacity-40"
              >
                <CornerDownLeft size={11} strokeWidth={2} />
                Run
              </button>
            )}
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </div>

          {/* Voice status / errors */}
          {voice.status === "live" ? (
            <div className="flex items-center gap-1.5 border-b border-[#f0f0f2] bg-[#f4eefc] px-4 py-2">
              <Mic size={11} strokeWidth={1.8} className="text-[#6c2bd9]" />
              <span className="text-[11.5px] text-[#6c2bd9]">
                Voice mode is live — just talk. Tools and results appear here as
                you go.
              </span>
            </div>
          ) : null}
          {voice.error ? (
            <div className="border-b border-[#f0f0f2] px-4 py-2">
              <p className="text-[11.5px] text-red-600">{voice.error}</p>
            </div>
          ) : null}

          {/* Contact context chip */}
          {contactName ? (
            <div className="flex items-center gap-1.5 border-b border-[#f0f0f2] bg-[#fafafa] px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6c2bd9]" />
              <span className="text-[11.5px] text-zinc-500">
                Using open contact as context:{" "}
                <span className="font-medium text-zinc-700">{contactName}</span>
                {activeContact?.company ? ` · ${activeContact.company}` : ""}
              </span>
            </div>
          ) : null}

          {/* Live activity + errors + result */}
          {agent.isRunning || agent.activity.length > 0 || agent.error ? (
            <div className="max-h-72 overflow-y-auto px-4 py-3">
              <AgentActivityFeed
                activity={agent.activity}
                text={agent.text}
                isRunning={agent.isRunning}
              />
              {agent.error ? (
                <p className="mt-2 text-[12.5px] text-red-600">{agent.error}</p>
              ) : null}
            </div>
          ) : null}

          {agent.result && !activeContact ? (
            <div className="max-h-96 overflow-y-auto border-t border-[#f0f0f2] bg-[#fafafa] px-4 py-3">
              <AgentResultPanel result={agent.result} />
            </div>
          ) : null}

          {agent.result && activeContact ? (
            <div className="border-t border-[#f0f0f2] bg-[#fafafa] px-4 py-2.5">
              <p className="text-[11.5px] text-zinc-500">
                Result is shown in the contact panel →
              </p>
            </div>
          ) : null}

          <AgentConnectionsStatus />
        </div>
      </div>
    </>
  );
}
