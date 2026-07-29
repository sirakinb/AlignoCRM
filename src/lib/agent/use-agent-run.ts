"use client";

import { useCallback, useRef, useState } from "react";
import {
  isAgentResult,
  runAgent,
  type AgentContextEntry,
  type AgentResult,
  type AguiEvent,
} from "@/lib/agent/agui-client";

export type ActivityStatus = "running" | "done" | "error";

export interface ActivityItem {
  toolCallId: string;
  toolName: string;
  label: string;
  status: ActivityStatus;
  detail?: string;
}

export interface AgentRunState {
  events: AguiEvent[];
  activity: ActivityItem[];
  text: string;
  result: AgentResult | null;
  isRunning: boolean;
  error: string | null;
}

export interface UseAgentRun extends AgentRunState {
  run: (
    prompt: string,
    context?: AgentContextEntry[]
  ) => Promise<AgentResult | null>;
  cancel: () => void;
  reset: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  get_contact: "Looking up contact",
  add_note: "Adding note to contact",
  create_task: "Creating task",
  render_result: "Preparing result",
  run_agent_task: "Running agent task",
};

export function humanToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Calling ${toolName}`;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

const INITIAL_STATE: AgentRunState = {
  events: [],
  activity: [],
  text: "",
  result: null,
  isRunning: false,
  error: null,
};

function reduceEvent(state: AgentRunState, event: AguiEvent): AgentRunState {
  const next: AgentRunState = { ...state, events: [...state.events, event] };

  switch (event.type) {
    case "TEXT_MESSAGE_CONTENT":
      next.text = state.text + event.delta;
      break;
    case "TOOL_CALL_START":
      next.activity = [
        ...state.activity,
        {
          toolCallId: event.toolCallId,
          toolName: event.toolCallName,
          label: humanToolLabel(event.toolCallName),
          status: "running",
        },
      ];
      break;
    case "TOOL_CALL_RESULT":
      next.activity = state.activity.map((item) =>
        item.toolCallId === event.toolCallId
          ? { ...item, status: "done" as const, detail: event.content }
          : item
      );
      break;
    case "STATE_SNAPSHOT":
      if (event.snapshot && isAgentResult(event.snapshot.result)) {
        next.result = event.snapshot.result;
      }
      break;
    case "RUN_FINISHED": {
      next.isRunning = false;
      next.activity = state.activity.map((item) =>
        item.status === "running" ? { ...item, status: "done" as const } : item
      );
      if (!state.result && isAgentResult(event.result)) {
        next.result = event.result;
      }
      break;
    }
    case "RUN_ERROR":
      next.isRunning = false;
      next.error = event.message;
      next.activity = state.activity.map((item) =>
        item.status === "running" ? { ...item, status: "error" as const } : item
      );
      break;
    default:
      break;
  }

  return next;
}

export function useAgentRun(): UseAgentRun {
  const [state, setState] = useState<AgentRunState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string>(newId("thread"));

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({
      ...prev,
      isRunning: false,
      activity: prev.activity.map((item) =>
        item.status === "running" ? { ...item, status: "error" as const } : item
      ),
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(
    async (
      prompt: string,
      context: AgentContextEntry[] = []
    ): Promise<AgentResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL_STATE, isRunning: true });
      let capturedResult: AgentResult | null = null;

      try {
        const stream = runAgent(
          {
            threadId: threadIdRef.current,
            runId: newId("run"),
            state: {},
            messages: [{ id: newId("msg"), role: "user", content: prompt }],
            tools: [],
            context,
            forwardedProps: {},
          },
          { signal: controller.signal }
        );

        for await (const event of stream) {
          if (event.type === "STATE_SNAPSHOT" && isAgentResult(event.snapshot?.result)) {
            capturedResult = event.snapshot.result;
          } else if (event.type === "RUN_FINISHED" && !capturedResult && isAgentResult(event.result)) {
            capturedResult = event.result;
          }
          setState((prev) => reduceEvent(prev, event));
        }

        // Stream closed without RUN_FINISHED/RUN_ERROR — stop the spinner.
        setState((prev) =>
          prev.isRunning ? { ...prev, isRunning: false } : prev
        );
      } catch (error) {
        if (controller.signal.aborted) return capturedResult;
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: error instanceof Error ? error.message : String(error),
          activity: prev.activity.map((item) =>
            item.status === "running"
              ? { ...item, status: "error" as const }
              : item
          ),
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }

      return capturedResult;
    },
    []
  );

  return { ...state, run, cancel, reset };
}
