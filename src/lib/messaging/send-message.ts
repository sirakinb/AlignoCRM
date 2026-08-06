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
import { escapeHtml } from "@/lib/html";
import { signUnsubToken } from "./token";
import { messagingPublicBaseUrl } from "./urls";

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
  /**
   * When true (email only), `body` is already sanitized, rendered HTML — used it
   * as-is instead of escaping it as plain text. The campaign test-send passes
   * this so the operator previews the real email, not its escaped source. The
   * caller MUST have sanitized it (sanitizeOutboundHtml) first.
   */
  bodyIsHtml?: boolean;
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

  // Body rendering. For a 1:1 conversation email the composer sends PLAIN TEXT,
  // so escape it into HTML (so "profit < cost" and newlines survive) and keep the
  // raw as body_text for the plain-text fallback (REQ-SEC-11 outbound clause).
  // Campaign email bodies are pre-rendered HTML that Phase 4 sanitizes at its own
  // boundary, so they pass through unchanged.
  const preRendered = isCampaign || !!input.bodyIsHtml;
  const emailText = channel === "email" && !preRendered ? input.body : null;
  const emailHtml =
    channel === "email"
      ? preRendered
        ? input.body
        : escapeHtml(input.body).replace(/\n/g, "<br>")
      : null;

  // ── Suppression gate (the asymmetry, made explicit) ───────────────────────
  const hit = await findSuppression(workspaceId, channel, toAddress);
  if (hit) {
    const blocks =
      channel === "sms"
        ? true // SMS STOP blocks everything, always
        // email: bounce (undeliverable) and manual (operator's explicit block)
        // hard-block every path incl. 1:1 (§1.5, matches the UI's disabled
        // composer in conversations.ts); unsubscribe/complaint block campaigns
        // only and are warn-allow on 1:1.
        : hit.reason === "bounce" || hit.reason === "manual" || isCampaign;
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
        body_text: channel === "sms" ? input.body : emailText,
        body_html: emailHtml,
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
      body_text: channel === "sms" ? input.body : emailText,
      body_html: emailHtml,
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
        from: `"${fromName}" <${fromLocal}@${EMAIL_DOMAIN}>`,
        to: toAddress,
        replyTo: formatReplyTo(fromName, conversation.reply_token),
        subject: input.subject ?? conversation.subject ?? "(no subject)",
        html: emailHtml ?? "",
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
    await bumpConversation(workspaceId, conversation.id, {
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

// ── campaign send (existing materialized rows) ────────────────────────────────

/** A materialized campaign `messages` row, ready to hand to a provider. */
export interface CampaignMessageRow {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: MessageChannel;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  to_address: string | null;
  campaign_id: string | null;
}

/**
 * Send ONE already-materialized campaign row (Phase 4 bulk path). Unlike
 * `sendConversationMessage`, this does not insert a row — the processor already
 * created the `queued` row at materialization; here we send it and settle its
 * status. The suppression gate still runs (defense in depth, REQ-SEC-19: the
 * campaign path also inherits the block), and campaign email carries the RFC 8058
 * unsubscribe headers + a per-conversation Reply-To so replies route back
 * (P4-20, P4-23). Returns the terminal status; never throws for a per-recipient
 * failure — one bad recipient must not abort the chunk.
 */
export async function sendCampaignMessageRow(
  row: CampaignMessageRow
): Promise<"sent" | "failed"> {
  const workspaceId = row.workspace_id;
  const to = row.to_address;
  if (!to) {
    await markFailed(row.id, "no_address");
    return "failed";
  }

  // Belt-and-suspenders suppression check (materialize already dropped these).
  // For a campaign, ANY suppression on the channel is a hard block.
  const hit = await findSuppression(workspaceId, row.channel, to);
  if (hit) {
    await markFailed(row.id, `suppressed:${hit.reason}`);
    return "failed";
  }

  try {
    if (row.channel === "email") {
      const config = await loadChannelConfig(workspaceId, "email");
      const fromName = sanitizeFromName(config.from_name);
      const fromLocal = sanitizeFromLocalPart(config.from_local_part);
      // Find-or-create the token-holder conversation for reply routing (P4-19b):
      // no message write, no last_message_* bump — ensureConversation only ever
      // creates the row, never touches an existing one's timeline fields.
      const conversation = await ensureConversation(workspaceId, row.contact_id);
      const unsubHeaders = campaignUnsubHeaders(workspaceId, to, row.campaign_id);

      const result = await getConversationEmailProvider().send({
        from: `"${fromName}" <${fromLocal}@${EMAIL_DOMAIN}>`,
        to,
        replyTo: formatReplyTo(fromName, conversation.reply_token),
        subject: row.subject ?? "(no subject)",
        html: row.body_html ?? "",
        extraHeaders: unsubHeaders,
      });
      await markSent(row.id, "resend", result.id);
    } else {
      const result = await getSmsProvider().send({
        to,
        body: row.body_text ?? "",
      });
      await markSent(row.id, "twilio", result.id);
    }
    return "sent";
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await markFailed(row.id, detail);
    return "failed";
  }
}

/**
 * Build the RFC 8058 one-click unsubscribe headers for a campaign email. The
 * token is per-recipient, HMAC-signed (REQ-SEC-08); the URL is pinned to the
 * public base. Returns {} when no base URL is configured (so a misconfigured
 * env degrades to "no header" rather than a broken relative link).
 */
export function campaignUnsubHeaders(
  workspaceId: string,
  address: string,
  campaignId: string | null
): Record<string, string> {
  const base = messagingPublicBaseUrl() ?? "";
  if (!base) return {};
  const token = signUnsubToken({
    workspaceId,
    channel: "email",
    address: address.trim().toLowerCase(),
    campaignId: campaignId ?? undefined,
  });
  const url = `${base.replace(/\/$/, "")}/api/unsubscribe/${token}`;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** The per-recipient unsubscribe URL for the email footer link (P4-23). */
export function campaignUnsubUrl(
  workspaceId: string,
  address: string,
  campaignId: string | null
): string | null {
  const base = messagingPublicBaseUrl() ?? "";
  if (!base) return null;
  const token = signUnsubToken({
    workspaceId,
    channel: "email",
    address: address.trim().toLowerCase(),
    campaignId: campaignId ?? undefined,
  });
  return `${base.replace(/\/$/, "")}/api/unsubscribe/${token}`;
}

async function markFailed(messageId: string, error: string): Promise<void> {
  await insforge.database
    .from("messages")
    .update({ status: "failed", error })
    .eq("id", messageId);
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
  workspaceId: string,
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
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId); // defense-in-depth (REQ-SEC-15.4)
}

/**
 * Sanitize the display name for a From header. Strips CR/LF (header injection)
 * and the address-structural characters `<>";` that could smuggle a second
 * address, then trims to a sane length. Falls back to "Aligno" (REQ-SEC-22).
 */
/**
 * Reply-To with a friendly display name so recipients see the sender name
 * ("Pentridge Media") in their mail client instead of the raw routing token.
 * The token still travels in the address for inbound routing. `fromName` is
 * already sanitized (no newlines or <>";), so it is safe inside the quoted
 * display phrase — no header injection.
 */
function formatReplyTo(fromName: string, replyToken: string): string {
  return `"${fromName}" <r+${replyToken}@${REPLY_DOMAIN}>`;
}

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
