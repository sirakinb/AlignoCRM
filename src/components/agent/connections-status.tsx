"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Plug } from "lucide-react";
import { getAgentAuthHeaders, getAgentBaseUrl } from "@/lib/agent/agui-client";

interface ConnectionInfo {
  id: string;
  name: string;
  state: string;
  authUrl: string | null;
  error: string | null;
}

/**
 * External MCP connections (Phase C). Renders nothing when there are none;
 * shows a status dot per connection and the one-time OAuth link when a
 * server is waiting on authorization.
 */
export function AgentConnectionsStatus() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getAgentBaseUrl()}/connections`, {
      headers: getAgentAuthHeaders(),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.connections) {
          setConnections(payload.connections as ConnectionInfo[]);
        }
      })
      .catch(() => {
        // Worker offline or connections unavailable — stay hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (connections.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[#f0f0f2] bg-[#fafafa] px-4 py-2">
      <Plug size={11} strokeWidth={1.8} className="text-zinc-400" />
      {connections.map((connection) => (
        <span
          key={connection.id}
          className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connection.state === "ready" || connection.state === "connected"
                ? "bg-[#6c2bd9]"
                : connection.state === "failed"
                  ? "bg-red-400"
                  : "bg-amber-400"
            }`}
          />
          {connection.name}
          {connection.authUrl && connection.state === "authenticating" ? (
            <a
              href={connection.authUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-[#6c2bd9] hover:underline"
            >
              Authorize <ExternalLink size={9} strokeWidth={2} />
            </a>
          ) : null}
          {connection.error ? (
            <span className="text-red-500" title={connection.error}>
              (error)
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
