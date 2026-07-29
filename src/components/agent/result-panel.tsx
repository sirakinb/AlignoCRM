"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import type { AgentResult } from "@/lib/agent/agui-client";

export function AgentResultPanel({ result }: { result: AgentResult }) {
  const [copied, setCopied] = useState(false);

  async function handleCopyDraft() {
    if (!result.draft_message) return;
    const text = result.draft_message.subject
      ? `Subject: ${result.draft_message.subject}\n\n${result.draft_message.body}`
      : result.draft_message.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy draft:", error);
    }
  }

  return (
    <div
      className="rounded-xl border border-[#e7e7ea] bg-white p-4 shadow-[0_1px_2px_rgba(17,17,26,0.05)]"
      data-testid="agent-result-panel"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={13} strokeWidth={1.8} className="text-[#6c2bd9]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Agent result
        </span>
      </div>

      {result.summary ? (
        <p className="text-[13px] leading-relaxed text-zinc-700">
          {result.summary}
        </p>
      ) : null}

      {result.facts.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Key facts
          </p>
          <ul className="space-y-1.5">
            {result.facts.map((fact, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-[13px] text-zinc-700"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#6c2bd9]" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.suggested_actions.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Suggested next actions
          </p>
          <ul className="space-y-1.5">
            {result.suggested_actions.map((action, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-[13px] text-zinc-700"
              >
                <span className="mt-px shrink-0 text-[11px] font-semibold text-[#6c2bd9]">
                  {index + 1}.
                </span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.draft_message ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Drafted message
            </p>
            <button
              onClick={handleCopyDraft}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6c2bd9] transition-colors hover:bg-[#f4eefc]"
            >
              {copied ? (
                <>
                  <Check size={11} strokeWidth={2} /> Copied
                </>
              ) : (
                <>
                  <Copy size={11} strokeWidth={1.8} /> Copy
                </>
              )}
            </button>
          </div>
          <div className="rounded-lg border border-[#e7e7ea] bg-[#fafafa] px-3 py-2.5">
            {result.draft_message.subject ? (
              <p className="mb-1.5 text-[13px] font-semibold text-zinc-900">
                {result.draft_message.subject}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700">
              {result.draft_message.body}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
