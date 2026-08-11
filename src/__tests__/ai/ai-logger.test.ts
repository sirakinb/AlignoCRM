import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock InsForge client
const mockSingle = vi.fn();
const mockInsert = vi.fn(() => ({ single: mockSingle }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = vi.fn((_table?: any) => ({
  insert: mockInsert,
}));

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: (table: string) => mockFrom(table),
    },
  },
}));

import { logAiOutput } from "@/lib/ai/ai-logger";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAiOutput", () => {
  it("inserts a success record into ai_outputs table", async () => {
    const mockRecord = {
      id: "ai-output-1",
      workspace_id: "ws-1",
      enrollment_id: "enroll-1",
      node_id: "node-1",
      prompt: "Write an email",
      response: "Hi there...",
      model: "mock-v1",
      usage: { inputTokens: 10, outputTokens: 20 },
      status: "success",
      error_message: null,
      created_at: "2026-01-01T00:00:00Z",
    };

    mockSingle.mockResolvedValueOnce({ data: mockRecord, error: null });

    const result = await logAiOutput({
      workspace_id: "ws-1",
      enrollment_id: "enroll-1",
      node_id: "node-1",
      prompt: "Write an email",
      response: "Hi there...",
      model: "mock-v1",
      usage: { inputTokens: 10, outputTokens: 20 },
      status: "success",
    });

    expect(mockFrom).toHaveBeenCalledWith("ai_outputs");
    expect(mockInsert).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      enrollment_id: "enroll-1",
      node_id: "node-1",
      prompt: "Write an email",
      response: "Hi there...",
      model: "mock-v1",
      usage: { inputTokens: 10, outputTokens: 20 },
      status: "success",
      error_message: null,
    });
    expect(result).toEqual(mockRecord);
  });

  it("inserts an error record with error_message", async () => {
    const mockRecord = {
      id: "ai-output-2",
      workspace_id: "ws-1",
      enrollment_id: null,
      node_id: null,
      prompt: "bad prompt",
      response: "",
      model: "unknown",
      usage: null,
      status: "error",
      error_message: "Provider timeout",
      created_at: "2026-01-01T00:00:00Z",
    };

    mockSingle.mockResolvedValueOnce({ data: mockRecord, error: null });

    const result = await logAiOutput({
      workspace_id: "ws-1",
      prompt: "bad prompt",
      response: "",
      model: "unknown",
      status: "error",
      error_message: "Provider timeout",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      enrollment_id: null,
      node_id: null,
      prompt: "bad prompt",
      response: "",
      model: "unknown",
      usage: null,
      status: "error",
      error_message: "Provider timeout",
    });
    expect(result.status).toBe("error");
    expect(result.error_message).toBe("Provider timeout");
  });

  it("throws when database insert fails", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB connection failed"),
    });

    await expect(
      logAiOutput({
        workspace_id: "ws-1",
        prompt: "test",
        response: "test",
        model: "mock-v1",
        status: "success",
      })
    ).rejects.toThrow("DB connection failed");
  });
});
