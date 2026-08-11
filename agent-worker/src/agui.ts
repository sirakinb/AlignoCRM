// AG-UI protocol types (https://docs.ag-ui.com/concepts/events).
// Wire format: camelCase JSON, `type` discriminator, data-only SSE frames.

export interface AguiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AguiMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "developer";
  content?: string;
  name?: string;
  toolCalls?: AguiToolCall[];
  toolCallId?: string;
  error?: string;
}

export interface AguiContext {
  description: string;
  value: string;
}

export interface AguiTool {
  name: string;
  description: string;
  parameters: unknown;
}

export interface RunAgentInput {
  threadId: string;
  runId: string;
  parentRunId?: string;
  state?: unknown;
  messages: AguiMessage[];
  tools?: AguiTool[];
  context?: AguiContext[];
  forwardedProps?: unknown;
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
  | { type: "STATE_SNAPSHOT"; snapshot: unknown };

export type EmitFn = (event: AguiEvent) => void;

export function encodeSseFrame(event: AguiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
