"use client";

import { Check, Loader2, XCircle } from "lucide-react";
import type { ActivityItem } from "@/lib/agent/use-agent-run";

export function AgentActivityFeed({
  activity,
  text,
  isRunning,
}: {
  activity: ActivityItem[];
  text?: string;
  isRunning?: boolean;
}) {
  if (activity.length === 0 && !text && !isRunning) return null;

  return (
    <div className="space-y-2" data-testid="agent-activity-feed">
      {text ? (
        <p className="text-[12.5px] leading-relaxed text-zinc-500">{text}</p>
      ) : null}

      {activity.map((item) => (
        <div
          key={item.toolCallId}
          className="flex items-center gap-2 text-[13px] text-zinc-700"
        >
          {item.status === "running" ? (
            <Loader2
              size={13}
              strokeWidth={1.8}
              className="shrink-0 animate-spin text-[#6c2bd9]"
            />
          ) : item.status === "error" ? (
            <XCircle size={13} strokeWidth={1.8} className="shrink-0 text-red-500" />
          ) : (
            <Check size={13} strokeWidth={2} className="shrink-0 text-[#6c2bd9]" />
          )}
          <span className={item.status === "running" ? "text-zinc-900" : ""}>
            {item.label}
            {item.status === "running" ? "…" : ""}
          </span>
        </div>
      ))}

      {isRunning && activity.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-zinc-700">
          <Loader2
            size={13}
            strokeWidth={1.8}
            className="shrink-0 animate-spin text-[#6c2bd9]"
          />
          <span>Thinking…</span>
        </div>
      ) : null}
    </div>
  );
}
