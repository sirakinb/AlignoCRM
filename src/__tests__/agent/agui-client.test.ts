import { describe, expect, it } from "vitest";
import {
  isAgentResult,
  parseAguiSseStream,
  type AguiEvent,
} from "@/lib/agent/agui-client";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<AguiEvent[]> {
  const events: AguiEvent[] = [];
  for await (const event of parseAguiSseStream(stream)) {
    events.push(event);
  }
  return events;
}

describe("parseAguiSseStream", () => {
  it("parses a complete event stream", async () => {
    const frames =
      'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n' +
      'data: {"type":"TEXT_MESSAGE_START","messageId":"m1","role":"assistant"}\n\n' +
      'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"Hello"}\n\n' +
      'data: {"type":"TEXT_MESSAGE_END","messageId":"m1"}\n\n' +
      'data: {"type":"RUN_FINISHED","threadId":"t1","runId":"r1"}\n\n';

    const events = await collect(streamFromChunks([frames]));

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });

  it("handles frames split across arbitrary chunk boundaries", async () => {
    const frame =
      'data: {"type":"TOOL_CALL_START","toolCallId":"tc1","toolCallName":"web_search"}\n\n' +
      'data: {"type":"TOOL_CALL_ARGS","toolCallId":"tc1","delta":"{\\"query\\":\\"acme\\"}"}\n\n';

    // Split mid-JSON and mid-delimiter.
    const chunks = [
      frame.slice(0, 25),
      frame.slice(25, 26),
      frame.slice(26, 90),
      frame.slice(90),
    ];

    const events = await collect(streamFromChunks(chunks));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: "TOOL_CALL_START",
      toolCallId: "tc1",
      toolCallName: "web_search",
    });
    expect(events[1]).toEqual({
      type: "TOOL_CALL_ARGS",
      toolCallId: "tc1",
      delta: '{"query":"acme"}',
    });
  });

  it("parses multiple data lines within a single chunk", async () => {
    const chunk =
      'data: {"type":"TOOL_CALL_END","toolCallId":"a"}\n\ndata: {"type":"TOOL_CALL_END","toolCallId":"b"}\n\n';

    const events = await collect(streamFromChunks([chunk]));

    expect(events.map((e) => (e as { toolCallId: string }).toolCallId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("skips malformed frames and non-data lines without dying", async () => {
    const chunks = [
      ": comment line\n\n",
      "data: {not valid json}\n\n",
      'data: {"type":"RUN_ERROR","message":"boom"}\n\n',
    ];

    const events = await collect(streamFromChunks(chunks));

    expect(events).toEqual([{ type: "RUN_ERROR", message: "boom" }]);
  });

  it("ignores an incomplete trailing frame", async () => {
    const chunks = [
      'data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1"}\n\n',
      'data: {"type":"RUN_FIN', // stream cut mid-frame
    ];

    const events = await collect(streamFromChunks(chunks));

    expect(events).toEqual([
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
    ]);
  });
});

describe("isAgentResult", () => {
  it("accepts a well-formed result", () => {
    expect(
      isAgentResult({
        summary: "Found things",
        facts: ["a"],
        suggested_actions: ["b"],
      })
    ).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isAgentResult(null)).toBe(false);
    expect(isAgentResult("summary")).toBe(false);
    expect(isAgentResult({ summary: "x" })).toBe(false);
    expect(isAgentResult({ summary: "x", facts: "not-array", suggested_actions: [] })).toBe(false);
  });
});
