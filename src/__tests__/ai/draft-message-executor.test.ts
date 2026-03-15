import { describe, expect, it, vi, beforeEach } from "vitest";
import { AiDraftMessageConfig } from "@/types/workflow";
import { DraftMessageContext } from "@/types/ai";

// Mock the AI service
const mockGenerate = vi.fn();
vi.mock("@/lib/ai/ai-service", () => ({
  generateAiContent: (...args: unknown[]) => mockGenerate(...args),
}));

// Mock the AI logger
const mockLogAiOutput = vi.fn();
vi.mock("@/lib/ai/ai-logger", () => ({
  logAiOutput: (...args: unknown[]) => mockLogAiOutput(...args),
}));

import { executeDraftMessage } from "@/lib/ai/draft-message-executor";

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock returns
  mockGenerate.mockResolvedValue({
    content: "Generated draft content",
    model: "mock-v1",
    usage: { inputTokens: 50, outputTokens: 30 },
  });

  mockLogAiOutput.mockResolvedValue({
    id: "ai-output-123",
    workspace_id: "ws-1",
    status: "success",
  });
});

const baseConfig: AiDraftMessageConfig = {
  promptTemplate: "Write a follow-up email to {{contact_name}} about {{deal_name}}",
  contextFields: ["contact_name", "deal_name", "company_name"],
  outputFormat: "email",
  requireApproval: false,
};

const baseContext: DraftMessageContext = {
  contact_name: "Alice Johnson",
  contact_email: "alice@example.com",
  company_name: "Acme Corp",
  deal_name: "Enterprise Plan",
  deal_value: 50000,
  deal_stage: "Proposal",
  sender_name: "Bob Smith",
};

describe("executeDraftMessage", () => {
  it("builds prompt from template and context, calls AI provider", async () => {
    await executeDraftMessage({
      config: baseConfig,
      context: baseContext,
      workspaceId: "ws-1",
      enrollmentId: "enroll-1",
      nodeId: "node-1",
    });

    expect(mockGenerate).toHaveBeenCalledOnce();
    const callArgs = mockGenerate.mock.calls[0][0];

    // Prompt should have interpolated template
    expect(callArgs.prompt).toContain("Alice Johnson");
    expect(callArgs.prompt).toContain("Enterprise Plan");

    // System prompt should mention the output format
    expect(callArgs.systemPrompt).toContain("email");
  });

  it("only includes contextFields in the context block", async () => {
    await executeDraftMessage({
      config: baseConfig,
      context: baseContext,
      workspaceId: "ws-1",
    });

    const callArgs = mockGenerate.mock.calls[0][0];
    const promptText: string = callArgs.prompt;

    // Context JSON should include specified fields
    expect(promptText).toContain("contact_name");
    expect(promptText).toContain("deal_name");
    expect(promptText).toContain("company_name");

    // Should not include fields not in contextFields
    expect(promptText).not.toContain("deal_value");
    expect(promptText).not.toContain("sender_name");
  });

  it("logs AI output on success", async () => {
    await executeDraftMessage({
      config: baseConfig,
      context: baseContext,
      workspaceId: "ws-1",
      enrollmentId: "enroll-1",
      nodeId: "node-1",
    });

    expect(mockLogAiOutput).toHaveBeenCalledOnce();
    const logArgs = mockLogAiOutput.mock.calls[0][0];

    expect(logArgs.workspace_id).toBe("ws-1");
    expect(logArgs.enrollment_id).toBe("enroll-1");
    expect(logArgs.node_id).toBe("node-1");
    expect(logArgs.response).toBe("Generated draft content");
    expect(logArgs.model).toBe("mock-v1");
    expect(logArgs.status).toBe("success");
  });

  it("returns draft content and aiOutputId", async () => {
    const result = await executeDraftMessage({
      config: baseConfig,
      context: baseContext,
      workspaceId: "ws-1",
    });

    expect(result.draftContent).toBe("Generated draft content");
    expect(result.aiOutputId).toBe("ai-output-123");
  });

  it("returns requiresApproval false when config says false", async () => {
    const result = await executeDraftMessage({
      config: { ...baseConfig, requireApproval: false },
      context: baseContext,
      workspaceId: "ws-1",
    });

    expect(result.requiresApproval).toBe(false);
  });

  it("returns requiresApproval true when config says true", async () => {
    const result = await executeDraftMessage({
      config: { ...baseConfig, requireApproval: true },
      context: baseContext,
      workspaceId: "ws-1",
    });

    expect(result.requiresApproval).toBe(true);
  });

  it("logs error and rethrows when AI provider fails", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("Provider timeout"));

    await expect(
      executeDraftMessage({
        config: baseConfig,
        context: baseContext,
        workspaceId: "ws-1",
        enrollmentId: "enroll-1",
        nodeId: "node-1",
      })
    ).rejects.toThrow("Provider timeout");

    expect(mockLogAiOutput).toHaveBeenCalledOnce();
    const logArgs = mockLogAiOutput.mock.calls[0][0];
    expect(logArgs.status).toBe("error");
    expect(logArgs.error_message).toBe("Provider timeout");
  });

  it("uses sms system prompt for sms output format", async () => {
    await executeDraftMessage({
      config: { ...baseConfig, outputFormat: "sms" },
      context: baseContext,
      workspaceId: "ws-1",
    });

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain("sms");
  });
});
