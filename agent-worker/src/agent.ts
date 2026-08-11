// The agent loop: Anthropic Messages API (streaming, tool use, server-side
// web search) translated to AG-UI events. Transport-agnostic — any caller
// provides an emit function and receives the structured result.

import type { EmitFn, RunAgentInput } from "./agui";
import {
  APP_TOOLS,
  RENDER_RESULT_TOOL_NAME,
  WEB_SEARCH_TOOL,
  executeAppTool,
  parseRenderResult,
  type Env,
  type RenderResult,
} from "./tools";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 12;

export interface AgentRunOutcome {
  result: RenderResult | null;
  finalText: string;
}

/** External MCP tools merged into the loop (from the ConnectionsAgent DO). */
export interface ExternalToolDef {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ExternalToolsBridge {
  tools: ExternalToolDef[];
  call: (
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ content: string; isError: boolean }>;
}

function exposedToolName(tool: ExternalToolDef): string {
  return `${tool.serverName}__${tool.name}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 128);
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

// Content blocks are echoed back verbatim across turns (including
// encrypted web-search payloads), so they stay loosely typed.
type AnthropicContentBlock = Record<string, unknown> & { type: string };

interface StreamOutcome {
  content: AnthropicContentBlock[];
  stopReason: string | null;
  text: string;
}

function buildSystemPrompt(input: RunAgentInput): string {
  const lines = [
    "You are Aligno, the AI agent embedded inside AlignoCRM. You complete CRM tasks for the user: researching leads, summarizing contacts, adding notes, creating follow-up tasks, and drafting messages.",
    "",
    "Rules:",
    "- Use web_search when the user asks you to research anything — actually search, do not invent facts.",
    "- Use get_contact / add_note / create_task for CRM reads and writes. Only write (add_note, create_task) when the user's request implies it.",
    `- You MUST finish every run by calling ${RENDER_RESULT_TOOL_NAME} exactly once with the structured result. That call is how the user sees your answer — never end without it.`,
    "- Include draft_message only when the user asked for a drafted email/message.",
    "- Before tool calls you may write at most one short sentence of narration. Keep all prose brief.",
  ];

  const context = input.context ?? [];
  if (context.length > 0) {
    lines.push("", "Current context provided by the app:");
    for (const entry of context) {
      lines.push(`- ${entry.description}: ${entry.value}`);
    }
  }

  return lines.join("\n");
}

function toAnthropicMessages(input: RunAgentInput): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];
  for (const message of input.messages ?? []) {
    if (
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.length > 0
    ) {
      messages.push({ role: message.role, content: message.content });
    }
  }
  if (messages.length === 0) {
    throw new Error("RunAgentInput contains no user message");
  }
  return messages;
}

interface BlockState {
  index: number;
  raw: AnthropicContentBlock;
  messageId?: string;
  partialJson: string;
  text: string;
  citations: unknown[];
}

async function streamOnce(
  env: Env,
  system: string,
  messages: AnthropicMessage[],
  emit: EmitFn,
  runId: string,
  turn: number,
  tools: unknown[]
): Promise<StreamOutcome> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      system,
      messages,
      tools,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const blocks = new Map<number, BlockState>();
  let stopReason: string | null = null;
  let turnText = "";

  const handleEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "content_block_start": {
        const index = event.index as number;
        const rawBlock = event.content_block as AnthropicContentBlock;
        const state: BlockState = {
          index,
          raw: { ...rawBlock },
          partialJson: "",
          text: "",
          citations: [],
        };
        blocks.set(index, state);

        if (rawBlock.type === "text") {
          state.messageId = `msg_${runId}_${turn}_${index}`;
          emit({
            type: "TEXT_MESSAGE_START",
            messageId: state.messageId,
            role: "assistant",
          });
        } else if (
          rawBlock.type === "tool_use" ||
          rawBlock.type === "server_tool_use"
        ) {
          emit({
            type: "TOOL_CALL_START",
            toolCallId: rawBlock.id as string,
            toolCallName: rawBlock.name as string,
          });
        } else if (rawBlock.type === "web_search_tool_result") {
          // Arrives complete in the start event. Summarize for the feed;
          // keep the raw block (encrypted content) for the next turn.
          const content = rawBlock.content;
          const summary = Array.isArray(content)
            ? `${content.length} search result(s)`
            : `search error: ${String(
                (content as Record<string, unknown> | undefined)?.error_code ??
                  "unknown"
              )}`;
          emit({
            type: "TOOL_CALL_RESULT",
            messageId: `msg_tr_${rawBlock.tool_use_id as string}`,
            toolCallId: rawBlock.tool_use_id as string,
            content: summary,
            role: "tool",
          });
        }
        break;
      }
      case "content_block_delta": {
        const index = event.index as number;
        const state = blocks.get(index);
        if (!state) break;
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === "text_delta") {
          const text = delta.text as string;
          state.text += text;
          turnText += text;
          if (state.messageId && text) {
            emit({
              type: "TEXT_MESSAGE_CONTENT",
              messageId: state.messageId,
              delta: text,
            });
          }
        } else if (delta.type === "input_json_delta") {
          const fragment = delta.partial_json as string;
          state.partialJson += fragment;
          if (fragment) {
            emit({
              type: "TOOL_CALL_ARGS",
              toolCallId: state.raw.id as string,
              delta: fragment,
            });
          }
        } else if (delta.type === "citations_delta") {
          state.citations.push((delta as { citation?: unknown }).citation);
        }
        break;
      }
      case "content_block_stop": {
        const index = event.index as number;
        const state = blocks.get(index);
        if (!state) break;
        if (state.raw.type === "text") {
          state.raw.text = state.text;
          if (state.citations.length > 0) {
            state.raw.citations = state.citations;
          }
          if (state.messageId) {
            emit({ type: "TEXT_MESSAGE_END", messageId: state.messageId });
          }
        } else if (
          state.raw.type === "tool_use" ||
          state.raw.type === "server_tool_use"
        ) {
          state.raw.input = state.partialJson ? JSON.parse(state.partialJson) : {};
          emit({ type: "TOOL_CALL_END", toolCallId: state.raw.id as string });
        }
        break;
      }
      case "message_delta": {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason as string;
        break;
      }
      case "error": {
        const error = event.error as Record<string, unknown> | undefined;
        throw new Error(`Anthropic stream error: ${String(error?.message ?? "unknown")}`);
      }
      default:
        break; // message_start, message_stop, ping, unknown future events
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd: number;
    while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) {
          handleEvent(JSON.parse(line.slice(5).trim()));
        }
      }
    }
  }

  const content = [...blocks.values()]
    .sort((a, b) => a.index - b.index)
    .map((state) => state.raw);

  return { content, stopReason, text: turnText };
}

export async function runAgentLoop(
  input: RunAgentInput,
  emit: EmitFn,
  env: Env,
  external?: ExternalToolsBridge
): Promise<AgentRunOutcome> {
  const system = buildSystemPrompt(input);
  const messages = toAnthropicMessages(input);
  let finalText = "";

  const externalByName = new Map<string, ExternalToolDef>();
  const externalTools: unknown[] = [];
  for (const tool of external?.tools ?? []) {
    const name = exposedToolName(tool);
    if (externalByName.has(name)) continue;
    externalByName.set(name, tool);
    externalTools.push({
      name,
      description:
        tool.description ?? `Tool ${tool.name} from ${tool.serverName}`,
      input_schema: tool.inputSchema ?? { type: "object" },
    });
  }
  const tools = [WEB_SEARCH_TOOL, ...APP_TOOLS, ...externalTools];

  const executeTool = async (
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> => {
    const externalTool = externalByName.get(name);
    if (externalTool && external) {
      return external.call(externalTool.serverId, externalTool.name, args);
    }
    return executeAppTool(env, name, args);
  };

  for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
    const { content, stopReason, text } = await streamOnce(
      env,
      system,
      messages,
      emit,
      input.runId,
      turn,
      tools
    );
    finalText = text || finalText;
    messages.push({ role: "assistant", content });

    if (stopReason === "pause_turn") {
      continue; // server-side tool still running; resend as-is
    }

    if (stopReason !== "tool_use") {
      return { result: null, finalText };
    }

    const toolUses = content.filter((block) => block.type === "tool_use");
    const renderCall = toolUses.find(
      (block) => block.name === RENDER_RESULT_TOOL_NAME
    );
    const actionCalls = toolUses.filter(
      (block) => block.name !== RENDER_RESULT_TOOL_NAME
    );

    const toolResults: AnthropicContentBlock[] = [];
    for (const call of actionCalls) {
      const execution = await executeTool(
        call.name as string,
        (call.input ?? {}) as Record<string, unknown>
      );
      emit({
        type: "TOOL_CALL_RESULT",
        messageId: `msg_tr_${call.id as string}`,
        toolCallId: call.id as string,
        content: execution.content,
        role: "tool",
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: execution.content,
        ...(execution.isError ? { is_error: true } : {}),
      });
    }

    if (renderCall) {
      const result = parseRenderResult(
        (renderCall.input ?? {}) as Record<string, unknown>
      );
      emit({
        type: "TOOL_CALL_RESULT",
        messageId: `msg_tr_${renderCall.id as string}`,
        toolCallId: renderCall.id as string,
        content: "Result rendered",
        role: "tool",
      });
      emit({ type: "STATE_SNAPSHOT", snapshot: { result } });
      return { result, finalText };
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { result: null, finalText };
}
