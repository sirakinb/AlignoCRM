import { insforge } from "@/lib/insforge/client";
import { Resend } from "resend";
import type { MessageLog, SendEmailInput } from "@/types/messaging";

export interface EmailSendResult {
  id: string;
  success: boolean;
}

export interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<EmailSendResult>;
}

/**
 * Real Resend provider — sends email via Resend API.
 * Lazily initializes the Resend client on first send.
 */
export class ResendEmailProvider implements EmailProvider {
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

  async send(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<EmailSendResult> {
    const { data, error } = await this.getClient().emails.send({
      from: process.env.EMAIL_FROM ?? "aki.b@pentridgemedia.com",
      to: input.to,
      subject: input.subject,
      html: input.body,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { id: data!.id, success: true };
  }
}

let provider: EmailProvider = new ResendEmailProvider();

export function setEmailProvider(p: EmailProvider) {
  provider = p;
}

export async function sendEmail(
  workspaceId: string,
  input: SendEmailInput
): Promise<MessageLog> {
  // Create initial log entry with pending status
  const { data: logEntry, error: insertError } = await insforge.database
    .from("message_logs")
    .insert({
      workspace_id: workspaceId,
      template_id: input.templateId ?? null,
      contact_id: input.contactId,
      channel: "email",
      to_address: input.to,
      subject: input.subject,
      body: input.body,
      status: "pending",
      enrollment_id: input.enrollmentId ?? null,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  const log = logEntry as MessageLog;

  try {
    const result = await provider.send({
      to: input.to,
      subject: input.subject,
      body: input.body,
    });

    const { data: updated, error: updateError } = await insforge.database
      .from("message_logs")
      .update({
        status: result.success ? "sent" : "failed",
        provider_id: result.id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", log.id)
      .select()
      .single();

    if (updateError) throw updateError;
    return updated as MessageLog;
  } catch (err) {
    const { data: updated, error: updateError } = await insforge.database
      .from("message_logs")
      .update({
        status: "failed",
        provider_response: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .eq("id", log.id)
      .select()
      .single();

    if (updateError) throw updateError;
    return updated as MessageLog;
  }
}
