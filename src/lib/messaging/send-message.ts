import { randomBytes } from "node:crypto";
import { insforge } from "@/lib/insforge/server";
import type {
  Conversation,
  Message,
  MessageChannel,
} from "@/types/messaging";
import { getConversationEmailProvider } from "./conversation-email";
import { getSmsProvider } from "./sms-service";
import { normalizeSendableE164 } from "./phone";
import { findSuppression } from "./suppressions";

const EMAIL_DOMAIN = process.env.MESSAGING_EMAIL_DOMAIN ?? "send.alignocrm.com";
const REPLY_DOMAIN = process.env.MESSAGING_REPLY_DOMAIN ?? "reply.alignocrm.com";

export class SendMessageError extends Error {
  code:
    | "no_channel_config"
    | "no_address"
    | "suppressed"
    | "invalid_destination"
    | "provider_error";
  constructor(code: SendMessageError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

interface ChannelConfig {
  from_name?: string;
  from_local_part?: string;
}

interface ContactRow {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface SendConversationMessageInput {
  workspaceId: string;
  contactId: string;
  channel: MessageChannel;
  body: string;
  /** Required for email; ignored for SMS. */
  subject?: string;
  /**
   * Marks a bulk send: the row is logged with campaign_id and NO conversation
   * timeline write/bump. The conversation still exists as a reply-token holder.
   */
  campaignId?: string | null;
}

/**
 * The single send path for the messaging center. Every send — 1:1, campaign,
 * future workflow/agent — goes through here so the suppression gate and the
 * message-logging are impossible to bypass (REQ-SEC-19).
 */
export async function sendConversationMessage(
  input: SendConversationMessageInput
): Promise<Message> {
  const { workspaceId, contactId, channel } = input;
  const isCampaign = !!input.campaignId;

  const contact = await loadContact(workspaceId, contactId);
  const rawAddress = channel === "email" ? contact.email : contact.phone;
  if (!rawAddress) {
    throw new SendMessageError(
      "no_address",
      `Contact has no ${channel === "email" ? "email address" : "phone number"} on file.`
    );
  }

  // Destination normalization + allowlist (SMS). Email is used as-is (trimmed).
  let toAddress: string;
  if (channel === "sms") {
    toAddress = normalizeSendableE164(rawAddress); // throws PhoneError on bad/disallowed
  } else {
    toAddress = rawAddress.trim();
  }

  // ── Suppression gate (the asymmetry, made explicit) ───────────────────────
  const hit = await findSuppression(workspaceId, channel, toAddress);
  if (hit) {
    const blocks =
      channel === "sms"
        ? true // SMS STOP blocks everything, always
        : hit.reason === "bounce" || isCampaign; // email: bounce blocks all; unsub/complaint block campaigns
    if (blocks) {
      // Record the refusal so there's an audit trail — never silently vanish.
      await insforge.database.from("messages").insert({
        workspace_id: workspaceId,
        conversation_id: isCampaign ? null : (await ensureConversation(workspaceId, contactId)).id,
        contact_id: contactId,
        campaign_id: input.campaignId ?? null,
        channel,
        direction: "outbound",
        status: "failed",
        subject: input.subject ?? null,
        body_text: channel === "sms" ? input.body : null,
        body_html: channel === "email" ? input.body : null,
        to_address: toAddress,
        error: `suppressed:${hit.reason}`,
      });
      throw new SendMessageError(
        "suppressed",
        `This contact is on the ${channel} suppression list (${hit.reason}).`
      );
    }
    // Non-blocking (email unsubscribe/complaint on a 1:1 send): proceed; the
    // UI is responsible for having shown a warning before calling us.
  }

  const conversation = await ensureConversation(workspaceId, contactId);

  // ── Insert the queued row ─────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await insforge.database
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      conversation_id: isCampaign ? null : conversation.id,
      contact_id: contactId,
      campaign_id: input.campaignId ?? null,
      channel,
      direction: "outbound",
      status: "queued",
      subject: channel === "email" ? (input.subject ?? null) : null,
      body_text: channel === "sms" ? input.body : null,
      body_html: channel === "email" ? input.body : null,
      to_address: toAddress,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  const message = inserted as Message;

  // ── Send via provider ─────────────────────────────────────────────────────
  try {
    if (channel === "email") {
      const config = await loadChannelConfig(workspaceId, "email");
      const fromName = sanitizeFromName(config.from_name);
      const fromLocal = sanitizeFromLocalPart(config.from_local_part);
      const threading = await lastInboundEmailId(conversation.id);

      const result = await getConversationEmailProvider().send({
        from: `${fromName} <${fromLocal}@${EMAIL_DOMAIN}>`,
        to: toAddress,
        replyTo: `r+${conversation.reply_token}@${REPLY_DOMAIN}`,
        subject: input.subject ?? conversation.subject ?? "(no subject)",
        html: input.body,
        inReplyTo: threading,
        references: threading,
      });
      await markSent(message.id, "resend", result.id);
    } else {
      const result = await getSmsProvider().send({
        to: toAddress,
        body: input.body,
      });
      await markSent(message.id, "twilio", result.id);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await insforge.database
      .from("messages")
      .update({ status: "failed", error: detail })
      .eq("id", message.id);
    throw new SendMessageError("provider_error", detail);
  }

  // ── Bump the conversation (1:1 only; campaigns never touch the timeline) ───
  if (!isCampaign) {
    await bumpConversation(conversation.id, {
      channel,
      preview: previewOf(channel, input.subject, input.body),
      subject: channel === "email" ? (input.subject ?? conversation.subject) : conversation.subject,
    });
  }

  const { data: fresh } = await insforge.database
    .from("messages")
    .select("*")
    .eq("id", message.id)
    .single();
  return (fresh ?? message) as Message;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadContact(
  workspaceId: string,
  contactId: string
): Promise<ContactRow> {
  const { data, error } = await insforge.database
    .from("contacts")
    .select("id, workspace_id, first_name, last_name, email, phone")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data) {
    throw new SendMessageError("no_address", "Contact not found in this workspace.");
  }
  return data as ContactRow;
}

async function loadChannelConfig(
  workspaceId: string,
  channel: MessageChannel
): Promise<ChannelConfig> {
  const { data } = await insforge.database
    .from("workspace_channels")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .limit(1);
  const row = data?.[0] as { config: ChannelConfig } | undefined;
  return row?.config ?? {};
}

/**
 * Find-or-create the contact's conversation. Used by both 1:1 sends (which then
 * bump it) and campaign sends (which use it only as a reply-token holder — the
 * inbox hides rows with last_message_at IS NULL, so token-holders stay invisible
 * until a real message arrives).
 */
export async function ensureConversation(
  workspaceId: string,
  contactId: string
): Promise<Conversation> {
  const { data: existing } = await insforge.database
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .limit(1);
  if (existing?.[0]) return existing[0] as Conversation;

  const { data: created, error } = await insforge.database
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      reply_token: randomBytes(24).toString("base64url"), // ~192 bits, URL-safe
    })
    .select()
    .single();
  // Lost an insert race? Re-read the winner.
  if (error) {
    const { data: retry } = await insforge.database
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .limit(1);
    if (retry?.[0]) return retry[0] as Conversation;
    throw error;
  }
  return created as Conversation;
}

async function lastInboundEmailId(
  conversationId: string
): Promise<string | null> {
  const { data } = await insforge.database
    .from("messages")
    .select("email_message_id")
    .eq("conversation_id", conversationId)
    .eq("channel", "email")
    .eq("direction", "inbound")
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { email_message_id: string } | undefined)?.email_message_id ?? null;
}

async function markSent(
  messageId: string,
  provider: "resend" | "twilio",
  providerId: string
): Promise<void> {
  await insforge.database
    .from("messages")
    .update({
      status: "sent",
      provider,
      provider_id: providerId,
      sent_at: new Date().toISOString(),
    })
    .eq("id", messageId);
}

async function bumpConversation(
  conversationId: string,
  input: { channel: MessageChannel; preview: string; subject: string | null }
): Promise<void> {
  await insforge.database
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: input.preview,
      last_message_channel: input.channel,
      last_message_direction: "outbound",
      subject: input.subject,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/**
 * Sanitize the display name for a From header. Strips CR/LF (header injection)
 * and the address-structural characters `<>";` that could smuggle a second
 * address, then trims to a sane length. Falls back to "Aligno" (REQ-SEC-22).
 */
function sanitizeFromName(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>";]/g, "")
    .trim()
    .slice(0, 64);
  return cleaned || "Aligno";
}

/**
 * Validate the local-part of the From address against a strict allowlist.
 * Anything outside it is rejected outright rather than sanitized, because a
 * bad local-part means a misconfigured sender, not a display quirk.
 */
function sanitizeFromLocalPart(raw: string | undefined): string {
  const candidate = (raw ?? "").trim() || "team";
  if (!/^[a-z0-9][a-z0-9._-]{0,32}$/i.test(candidate)) {
    throw new SendMessageError(
      "invalid_destination",
      "Sender local-part is invalid; check the workspace email settings."
    );
  }
  return candidate;
}

function previewOf(
  channel: MessageChannel,
  subject: string | undefined,
  body: string
): string {
  const source = channel === "email" ? subject || stripHtml(body) : body;
  return source.slice(0, 140);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
