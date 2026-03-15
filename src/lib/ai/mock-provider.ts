import { AiProvider, AiGenerateInput, AiGenerateOutput } from "@/types/ai";

const EMAIL_TEMPLATES: Record<string, string> = {
  follow_up: `Hi {{contact_name}},

I wanted to follow up on our recent conversation about {{deal_name}}. I believe there's a great opportunity for us to work together and help {{company_name}} achieve its goals.

Would you be available for a quick call this week to discuss next steps?

Best regards,
{{sender_name}}`,

  introduction: `Hi {{contact_name}},

My name is {{sender_name}} and I'm reaching out from {{company_name}}. I noticed that your team might benefit from our solution, and I'd love to explore how we can help.

Would you be open to a brief conversation?

Best,
{{sender_name}}`,

  default: `Hi {{contact_name}},

Thank you for your interest. I wanted to reach out regarding {{deal_name}} and discuss how we can move forward together.

Please let me know if you have any questions or would like to schedule a call.

Best regards,
{{sender_name}}`,
};

const SMS_TEMPLATE = `Hi {{contact_name}}, following up on {{deal_name}}. Let me know if you'd like to chat. - {{sender_name}}`;

const NOTE_TEMPLATE = `Draft note for {{contact_name}} ({{company_name}}): Regarding {{deal_name}} - recommend following up within the week to discuss proposal details.`;

function selectTemplate(prompt: string, format: string): string {
  if (format === "sms") return SMS_TEMPLATE;
  if (format === "note") return NOTE_TEMPLATE;

  const lower = prompt.toLowerCase();
  if (lower.includes("follow up") || lower.includes("follow-up")) {
    return EMAIL_TEMPLATES.follow_up;
  }
  if (lower.includes("introduction") || lower.includes("introduce")) {
    return EMAIL_TEMPLATES.introduction;
  }
  return EMAIL_TEMPLATES.default;
}

function fillPlaceholders(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    return value != null ? String(value) : `{{${key}}}`;
  });
}

export class MockAiProvider implements AiProvider {
  async generate(input: AiGenerateInput): Promise<AiGenerateOutput> {
    // Extract format hint from system prompt or default to email
    const format = input.systemPrompt?.includes("sms")
      ? "sms"
      : input.systemPrompt?.includes("note")
        ? "note"
        : "email";

    // Parse context from the prompt (looks for JSON block)
    let context: Record<string, unknown> = {};
    const jsonMatch = input.prompt.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        context = JSON.parse(jsonMatch[0]);
      } catch {
        // If not valid JSON, use empty context
      }
    }

    const template = selectTemplate(input.prompt, format);
    const content = fillPlaceholders(template, context);

    const inputTokens = Math.ceil(input.prompt.length / 4);
    const outputTokens = Math.ceil(content.length / 4);

    return {
      content,
      usage: { inputTokens, outputTokens },
      model: "mock-v1",
    };
  }
}
