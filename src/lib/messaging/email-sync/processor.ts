import "server-only";
import { ensureConversation } from "@/lib/messaging/send-message";
import {
  findContactByEmail,
  createInboundEmailContact,
  insertInboundMessage,
  bumpConversationInbound,
} from "@/lib/messaging/webhook-store";
import { sanitizeInboundHtml } from "@/lib/messaging/sanitize-html";
import { stripQuotedReply } from "@/lib/messaging/quote-strip";
import { sanitizeHeaderValue, HEADER_LIMITS } from "@/lib/messaging/header-safety";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { redactAddress, redactProviderError } from "@/lib/messaging/redact";

const MAX_HTML_BYTES = 512 * 1024;
const MAX_TEXT_BYTES = 128 * 1024;

export interface SyncedInboundEmail {
  workspaceId: string;
  /** Connected mailbox address — used to skip self-sent mail. */
  connectionEmail: string;
  provider: "google" | "microsoft";
  /** Provider-native message id (Gmail id / Graph id). */
  providerMessageId: string;
  /** RFC Message-ID header when present. */
  emailMessageId: string | null;
  fromAddress: string;
  toAddress: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
}

export type ProcessSyncedResult = "stored" | "skipped_self" | "skipped_no_from" | "skipped_rate_limit" | "duplicate" | "error";

/**
 * Match/create contact, ensure conversation, insert inbound message for a
 * mailbox-synced email. Tenant scope comes from the connection row only.
 */
export async function processSyncedInboundEmail(
  input: SyncedInboundEmail
): Promise<ProcessSyncedResult> {
  try {
    const fromRaw = sanitizeHeaderValue(input.fromAddress, HEADER_LIMITS.address);
    if (!fromRaw) return "skipped_no_from";

    const fromEmail = bareEmail(fromRaw);
    if (!fromEmail) return "skipped_no_from";

    if (fromEmail === input.connectionEmail.trim().toLowerCase()) {
      return "skipped_self";
    }

    let contact = await findContactByEmail(input.workspaceId, fromEmail);
    if (!contact) {
      const { limit, windowMs } = RATE_LIMITS.emailAutoCreatePerWorkspace;
      if (!(await checkRateLimit(`email-autocreate:${input.workspaceId}`, limit, windowMs))) {
        console.warn("[email-sync] auto-create rate limit hit", {
          workspaceId: input.workspaceId,
          from: redactAddress(fromEmail),
        });
        return "skipped_rate_limit";
      }
      contact = await createInboundEmailContact(input.workspaceId, fromEmail);
    }

    const conversation = await ensureConversation(input.workspaceId, contact.id);

    const subject = sanitizeHeaderValue(input.subject, HEADER_LIMITS.subject);
    const emailMessageId = sanitizeHeaderValue(
      input.emailMessageId,
      HEADER_LIMITS.messageId
    );
    const toAddress = sanitizeHeaderValue(input.toAddress, HEADER_LIMITS.address);

    const rawHtml = (input.bodyHtml ?? "").slice(0, MAX_HTML_BYTES);
    const bodyHtml = sanitizeInboundHtml(rawHtml) || null;
    const rawText = input.bodyText ?? "";
    const bodyText = stripQuotedReply(rawText).slice(0, MAX_TEXT_BYTES) || null;

    try {
      await insertInboundMessage({
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        contactId: contact.id,
        channel: "email",
        bodyText,
        bodyHtml,
        fromAddress: fromEmail,
        toAddress,
        provider: input.provider,
        providerId: input.providerMessageId,
        emailMessageId,
        subject,
        senderVerified: true,
      });
    } catch (err) {
      // Unique (workspace_id, provider, provider_id) → already synced.
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique|23505/i.test(message)) {
        return "duplicate";
      }
      throw err;
    }

    await bumpConversationInbound(conversation.id, {
      channel: "email",
      preview: (bodyText ?? subject ?? "").slice(0, 140),
      subject,
      currentUnread: conversation.unread_count ?? 0,
    });

    return "stored";
  } catch (err) {
    console.error("[email-sync] process failed", redactProviderError(err));
    return "error";
  }
}

/** Extract bare address from `Name <addr@host>` or plain `addr@host`. */
function bareEmail(raw: string): string | null {
  const match = raw.match(/<([^>]+)>/);
  const address = (match?.[1] ?? raw).trim().toLowerCase();
  return address.includes("@") ? address : null;
}
