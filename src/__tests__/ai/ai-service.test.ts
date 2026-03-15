import { describe, expect, it, beforeEach } from "vitest";
import {
  setAiProvider,
  getAiProvider,
  generateAiContent,
} from "@/lib/ai/ai-service";
import { MockAiProvider } from "@/lib/ai/mock-provider";
import { AiProvider } from "@/types/ai";

describe("AI Service", () => {
  beforeEach(() => {
    // Reset by setting a fresh provider
    setAiProvider(new MockAiProvider());
  });

  describe("setAiProvider / getAiProvider", () => {
    it("sets and retrieves the AI provider", () => {
      const provider = new MockAiProvider();
      setAiProvider(provider);
      expect(getAiProvider()).toBe(provider);
    });
  });

  describe("generateAiContent", () => {
    it("calls the provider and returns content", async () => {
      const result = await generateAiContent({
        prompt: "Write a follow up email",
        systemPrompt: "You are a CRM assistant. Generate a professional email.",
      });

      expect(result.content).toBeTruthy();
      expect(result.model).toBe("mock-v1");
    });

    it("returns usage information", async () => {
      const result = await generateAiContent({
        prompt: "Write an introduction email",
      });

      expect(result.usage).toBeDefined();
      expect(result.usage!.inputTokens).toBeGreaterThan(0);
      expect(result.usage!.outputTokens).toBeGreaterThan(0);
    });

    it("uses a custom provider when set", async () => {
      const customProvider: AiProvider = {
        generate: async () => ({
          content: "Custom response",
          model: "custom-v1",
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      };

      setAiProvider(customProvider);
      const result = await generateAiContent({ prompt: "test" });

      expect(result.content).toBe("Custom response");
      expect(result.model).toBe("custom-v1");
    });
  });
});

describe("MockAiProvider", () => {
  const provider = new MockAiProvider();

  it("returns a follow-up email template when prompt contains follow up", async () => {
    const result = await provider.generate({
      prompt:
        'Write a follow up email. {"contact_name":"Alice","deal_name":"Enterprise Plan","sender_name":"Bob"}',
      systemPrompt: "Generate a professional email.",
    });

    expect(result.content).toContain("Alice");
    expect(result.content).toContain("Enterprise Plan");
    expect(result.content).toContain("Bob");
    expect(result.content).toContain("follow up");
  });

  it("returns an SMS template for sms format", async () => {
    const result = await provider.generate({
      prompt:
        '{"contact_name":"Alice","deal_name":"Deal X","sender_name":"Bob"}',
      systemPrompt: "Generate a professional sms message.",
    });

    expect(result.content).toContain("Alice");
    expect(result.content.length).toBeLessThan(300);
  });

  it("returns a note template for note format", async () => {
    const result = await provider.generate({
      prompt:
        '{"contact_name":"Alice","company_name":"Acme","deal_name":"Deal X"}',
      systemPrompt: "Generate a professional note.",
    });

    expect(result.content).toContain("Alice");
    expect(result.content).toContain("Acme");
    expect(result.content).toContain("Draft note");
  });

  it("returns model name mock-v1", async () => {
    const result = await provider.generate({ prompt: "test" });
    expect(result.model).toBe("mock-v1");
  });
});
