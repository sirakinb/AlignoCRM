import { Resend } from "resend";

export interface ConversationEmailInput {
  from: string; // "Name <local@send.alignocrm.com>"
  to: string;
  replyTo: string; // r+<token>@reply.alignocrm.com
  subject: string;
  html: string;
  /** Message-IDs to thread against (last inbound), if any. */
  inReplyTo?: string | null;
  references?: string | null;
  /**
   * Extra RFC 5322 headers (campaign path only): List-Unsubscribe and
   * List-Unsubscribe-Post for RFC 8058 one-click. 1:1 sends never set these
   * (P4-24). Values MUST already be CR/LF-safe.
   */
  extraHeaders?: Record<string, string>;
}

export interface ConversationEmailResult {
  id: string; // Resend email id
  success: boolean;
}

export interface ConversationEmailProvider {
  send(input: ConversationEmailInput): Promise<ConversationEmailResult>;
}

/**
 * Resend provider for two-way conversation email. Unlike the workflow
 * email-service, this sets Reply-To (per-conversation reply token) and RFC 5322
 * threading headers so replies route back and thread in the recipient's client.
 */
export class ResendConversationEmailProvider
  implements ConversationEmailProvider
{
  private resend: Resend | null = null;

  private getClient(): Resend {
    if (!this.resend) {
      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY environment variable is not set");
      }
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
    return this.resend;
  }

  async send(input: ConversationEmailInput): Promise<ConversationEmailResult> {
    const headers: Record<string, string> = { ...(input.extraHeaders ?? {}) };
    if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
    if (input.references) headers["References"] = input.references;

    const { data, error } = await this.getClient().emails.send({
      from: input.from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      ...(Object.keys(headers).length ? { headers } : {}),
    });

    if (error) throw new Error(error.message);
    return { id: data!.id, success: true };
  }
}

let provider: ConversationEmailProvider = new ResendConversationEmailProvider();

export function setConversationEmailProvider(p: ConversationEmailProvider) {
  provider = p;
}

export function getConversationEmailProvider(): ConversationEmailProvider {
  return provider;
}
