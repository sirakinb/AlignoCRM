// Hand-rolled AG-UI client: POST RunAgentInput to the agent worker, parse the
// SSE response (data-only frames, `type` discriminator) into typed events.

export interface AgentContextEntry {
  description: string;
  value: string;
}

export interface AgentUserMessage {
  id: string;
  role: "user";
  content: string;
}

export interface RunAgentInput {
  threadId: string;
  runId: string;
  state: Record<string, unknown>;
  messages: AgentUserMessage[];
  tools: unknown[];
  context: AgentContextEntry[];
  forwardedProps: Record<string, unknown>;
}

export interface AgentDraftMessage {
  subject?: string;
  body: string;
}

export interface AgentResult {
  summary: string;
  facts: string[];
  suggested_actions: string[];
  draft_message?: AgentDraftMessage;
}

export type AguiEvent =
  | { type: "RUN_STARTED"; threadId: string; runId: string }
  | { type: "RUN_FINISHED"; threadId: string; runId: string; result?: unknown }
  | { type: "RUN_ERROR"; message: string; code?: string }
  | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | {
      type: "TOOL_CALL_START";
      toolCallId: string;
      toolCallName: string;
      parentMessageId?: string;
    }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string }
  | {
      type: "TOOL_CALL_RESULT";
      messageId: string;
      toolCallId: string;
      content: string;
      role?: "tool";
    }
  | { type: "STATE_SNAPSHOT"; snapshot: { result?: AgentResult } };

export function getAgentBaseUrl(): string {
  return process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8788";
}

/**
 * Optional bearer token matching the worker's AGENT_AUTH_TOKEN. Note this is
 * a NEXT_PUBLIC_ value (visible to the browser) — it deters drive-by use of a
 * deployed worker URL, not a substitute for per-user auth.
 */
export function getAgentAuthHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_AGENT_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Parse an SSE byte stream of AG-UI events (`data: {json}\n\n` frames).
 * Safe across arbitrary chunk boundaries; ignores non-data lines.
 */
export async function* parseAguiSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<AguiEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let frameEnd: number;
      while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            yield JSON.parse(payload) as AguiEvent;
          } catch {
            // Skip malformed frames rather than killing the stream.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Run the agent and yield AG-UI events as they stream in.
 * Abort via the provided signal to cancel the run.
 */
export async function* runAgent(
  input: RunAgentInput,
  options?: { signal?: AbortSignal; baseUrl?: string }
): AsyncGenerator<AguiEvent> {
  const baseUrl = options?.baseUrl ?? getAgentBaseUrl();
  const response = await fetch(`${baseUrl}/agui`, {
    method: "POST",
    headers: { "content-type": "application/json", ...getAgentAuthHeaders() },
    body: JSON.stringify(input),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error ?? "";
    } catch {
      // ignore body parse failures
    }
    throw new Error(detail || `Agent request failed (${response.status})`);
  }

  yield* parseAguiSseStream(response.body);
}

export function isAgentResult(value: unknown): value is AgentResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.facts) &&
    Array.isArray(candidate.suggested_actions)
  );
}
