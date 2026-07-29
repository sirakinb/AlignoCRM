// Aligno agent worker — the single place that holds API keys.
// POST /agui  : AG-UI RunAgentInput in, AG-UI event stream (SSE) out.
// GET/POST /mcp : same app tools exposed as an MCP server.
// POST /realtime/secret|tool : Phase B voice support.
//
// Security posture: CORS is origin-allowlisted (env.ALLOWED_ORIGINS, localhost
// dev defaults). If env.AGENT_AUTH_TOKEN is set, the credential-bearing routes
// require `Authorization: Bearer <token>`. Before any production deploy, put
// real per-user auth in front (e.g. verify the app session JWT here).

import { getAgentByName, routeAgentRequest } from "agents";
import { runAgentLoop, type ExternalToolsBridge } from "./agent";
import { encodeSseFrame, type AguiEvent, type RunAgentInput } from "./agui";
import { handleMcpRequest } from "./mcp";
import { handleRealtimeSecret, handleRealtimeTool } from "./realtime";
import type { Env } from "./tools";

export { ConnectionsAgent } from "./connections";

const DEV_ORIGINS = ["http://localhost:8003", "http://localhost:3000"];

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((entry) => entry.trim())
    : DEV_ORIGINS;

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.AGENT_AUTH_TOKEN) return true; // dev mode: no token configured
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.AGENT_AUTH_TOKEN}`;
}

function withCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

/**
 * Best-effort fetch of external MCP tools from the ConnectionsAgent DO.
 * No connections configured → empty list, near-zero latency. DO errors are
 * swallowed so /agui always works with the built-in tools.
 */
async function getExternalBridge(env: Env): Promise<ExternalToolsBridge | undefined> {
  try {
    const agent = await getAgentByName(env.CONNECTIONS, "default");
    const tools = (await agent.listExternalTools()) as ExternalToolsBridge["tools"];
    if (tools.length === 0) return undefined;
    return {
      tools,
      call: async (serverId, name, args) =>
        (await agent.callExternalTool(serverId, name, args)) as {
          content: string;
          isError: boolean;
        },
    };
  } catch (error) {
    console.error("[connections] external tools unavailable:", error);
    return undefined;
  }
}

function handleAgui(
  input: RunAgentInput,
  env: Env,
  ctx: ExecutionContext,
  cors: Record<string, string>
): Response {
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = (event: AguiEvent) => {
    // Fire-and-forget; write errors surface when the client disconnects.
    writer.write(encoder.encode(encodeSseFrame(event))).catch(() => {});
  };

  ctx.waitUntil(
    (async () => {
      emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
      try {
        const external = await getExternalBridge(env);
        const outcome = await runAgentLoop(input, emit, env, external);
        emit({
          type: "RUN_FINISHED",
          threadId: input.threadId,
          runId: input.runId,
          result: outcome.result ?? { summary: outcome.finalText },
        });
      } catch (error) {
        emit({
          type: "RUN_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await writer.close().catch(() => {});
      }
    })()
  );

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...cors,
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const isProtectedRoute =
      url.pathname === "/agui" ||
      url.pathname.startsWith("/realtime/") ||
      url.pathname === "/connections" ||
      url.pathname.startsWith("/connections/");
    if (isProtectedRoute && !isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401, cors);
    }

    // Agent-internal routes (incl. MCP OAuth callbacks:
    // /agents/connections-agent/default/callback).
    if (url.pathname.startsWith("/agents/")) {
      const routed = await routeAgentRequest(request, env);
      if (routed) return routed;
    }

    if (url.pathname === "/connections" || url.pathname.startsWith("/connections/")) {
      try {
        const agent = await getAgentByName(env.CONNECTIONS, "default");

        if (url.pathname === "/connections" && request.method === "GET") {
          return json({ connections: await agent.listConnections() }, 200, cors);
        }
        if (url.pathname === "/connections" && request.method === "POST") {
          const body = (await request.json()) as {
            name?: string;
            url?: string;
            headers?: Record<string, string>;
          };
          if (!body.name || !body.url) {
            return json({ error: "Body must include name and url" }, 400, cors);
          }
          const result = await agent.addConnection(
            body.name,
            body.url,
            body.headers
          );
          return json(result, 200, cors);
        }
        if (url.pathname.startsWith("/connections/") && request.method === "DELETE") {
          const id = decodeURIComponent(url.pathname.slice("/connections/".length));
          await agent.removeConnection(id);
          return json({ success: true }, 200, cors);
        }
        return json({ error: "Method not allowed" }, 405, cors);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : String(error) },
          500,
          cors
        );
      }
    }

    if (url.pathname === "/agui" && request.method === "POST") {
      let input: RunAgentInput;
      try {
        input = (await request.json()) as RunAgentInput;
      } catch {
        return json({ error: "Invalid JSON body" }, 400, cors);
      }
      if (!input?.threadId || !input?.runId || !Array.isArray(input.messages)) {
        return json(
          { error: "Body must be AG-UI RunAgentInput (threadId, runId, messages[])" },
          400,
          cors
        );
      }
      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500, cors);
      }
      return handleAgui(input, env, ctx, cors);
    }

    if (url.pathname === "/mcp") {
      return handleMcpRequest(request, env, ctx);
    }

    if (url.pathname === "/realtime/secret" && request.method === "POST") {
      const response = await handleRealtimeSecret(request, env);
      return withCors(response, cors);
    }

    if (url.pathname === "/realtime/tool" && request.method === "POST") {
      const response = await handleRealtimeTool(request, env);
      return withCors(response, cors);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "aligno-agent-worker" }, 200, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
