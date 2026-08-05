import { insforge } from "@/lib/insforge/server";
import { Resend } from "resend";
import type { MessageLog, SendEmailInput } from "@/types/messaging";
import { findSuppression } from "./suppressions";

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
    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new Error("EMAIL_FROM environment variable is not set");
    }
    const { data, error } = await this.getClient().emails.send({
      from,
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
  // Suppression gate — this is a second send path (the workflow engine), so it
  // must enforce suppression too or REQ-SEC-19 is false. Automated workflow
  // email is blocked on ANY email suppression reason (unsubscribe / complaint /
  // bounce): none of them should keep receiving automated sends.
  const suppression = await findSuppression(workspaceId, "email", input.to);
  if (suppression) {
    const { data: blocked, error: blockErr } = await insforge.database
      .from("message_logs")
      .insert({
        workspace_id: workspaceId,
        template_id: input.templateId ?? null,
        contact_id: input.contactId,
        channel: "email",
        to_address: input.to,
        subject: input.subject,
        body: input.body,
        status: "failed",
        provider_response: { error: `suppressed:${suppression.reason}` },
        enrollment_id: input.enrollmentId ?? null,
      })
      .select()
      .single();
    if (blockErr) throw blockErr;
    return blocked as MessageLog;
  }

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
