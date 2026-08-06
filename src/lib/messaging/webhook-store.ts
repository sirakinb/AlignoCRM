import { randomUUID } from "node:crypto";
import { insforge } from "@/lib/insforge/server";
import type { MessageChannel, MessageDirection } from "@/types/messaging";
import { phoneMatchCandidates } from "./phone";

/**
 * Data-access layer for the webhook receivers. Every function uses the SERVER
 * InsForge client (RLS-bypassing project key) and derives/filters by workspace
 * from OWNED ROWS only — never from the webhook payload (REQ-SEC-03). Kept as
 * small named functions so the route handlers read as orchestration and the
 * tenancy filters are auditable in one place.
 */

export interface OwnedMessage {
  id: string;
  workspace_id: string;
  status: string;
  campaign_id: string | null;
  to_address: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  provider_response: Record<string, unknown> | null;
}

/**
 * Resolve an OUTBOUND message by provider id for delivery/status events.
 * Constrained to `direction = 'outbound'`: delivery and status callbacks only
 * ever concern messages we sent, so this removes attacker-supplied inbound
 * Message-IDs (which we also store in provider_id) from the lookup space
 * entirely. The per-workspace unique index permits the same provider_id in two
 * workspaces, so order deterministically (oldest first) rather than relying on
 * arbitrary row order. workspace_id is taken from the row (REQ-SEC-03).
 */
export async function findMessageByProviderId(
  provider: "resend" | "twilio",
  providerId: string
): Promise<OwnedMessage | null> {
  const { data } = await insforge.database
    .from("messages")
    .select(
      "id, workspace_id, status, campaign_id, to_address, delivered_at, opened_at, clicked_at, provider_response"
    )
    .eq("provider", provider)
    .eq("provider_id", providerId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as OwnedMessage | undefined) ?? null;
}

export async function updateMessage(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await insforge.database
    .from("messages")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

const COUNTER_STATUSES: Record<"delivered_count" | "failed_count", string[]> = {
  delivered_count: ["delivered"],
  failed_count: ["failed", "bounced"],
};

/**
 * Recompute a campaign counter by AGGREGATING message rows, not by blind +1
 * (REQ-SEC-04). Idempotency dedupes the SAME event, but distinct concurrent
 * events (a delivered and a bounced arriving together) each did a read-modify-
 * write and lost updates. Deriving the count from the messages table is
 * race-free and self-correcting: whatever order events land in, the counter
 * converges to the true number of rows in the target status(es). Call AFTER the
 * message row's status has been updated.
 */
export async function recomputeCampaignCounter(
  campaignId: string,
  field: "delivered_count" | "failed_count"
): Promise<void> {
  const { count, error } = await insforge.database
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", COUNTER_STATUSES[field]);
  if (error) throw error;
  await insforge.database
    .from("campaigns")
    .update({ [field]: count ?? 0 })
    .eq("id", campaignId);
}

export interface OwnedConversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  reply_token: string;
  subject: string | null;
  unread_count: number;
}

export async function findConversationByReplyToken(
  token: string
): Promise<OwnedConversation | null> {
  const { data } = await insforge.database
    .from("conversations")
    .select("id, workspace_id, contact_id, reply_token, subject, unread_count")
    .eq("reply_token", token)
    .limit(1);
  return (data?.[0] as OwnedConversation | undefined) ?? null;
}

/** Contact email for inbound sender verification (REQ-SEC-07). Workspace-scoped. */
export async function getContactEmail(
  workspaceId: string,
  contactId: string
): Promise<string | null> {
  const { data } = await insforge.database
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", workspaceId)
    .eq("id", contactId)
    .limit(1);
  const row = data?.[0] as { email: string | null } | undefined;
  return row?.email ?? null;
}

export interface InboundMessageRow {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  channel: MessageChannel;
  bodyText: string | null;
  bodyHtml: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  provider: "resend" | "twilio";
  providerId: string | null;
  emailMessageId: string | null;
  subject: string | null;
  senderVerified: boolean;
  providerResponse?: Record<string, unknown> | null;
}

export async function insertInboundMessage(row: InboundMessageRow): Promise<void> {
  const { error } = await insforge.database.from("messages").insert({
    workspace_id: row.workspaceId,
    conversation_id: row.conversationId,
    contact_id: row.contactId,
    channel: row.channel,
    direction: "inbound" as MessageDirection,
    status: "received",
    subject: row.subject,
    body_text: row.bodyText,
    body_html: row.bodyHtml,
    from_address: row.fromAddress,
    to_address: row.toAddress,
    provider: row.provider,
    provider_id: row.providerId,
    email_message_id: row.emailMessageId,
    sender_verified: row.senderVerified,
    provider_response: row.providerResponse ?? null,
  });
  if (error) throw error;
}

/**
 * Increment unread and bump the conversation preview for an INBOUND message.
 * `currentUnread` is passed in from the row already fetched, so this is one
 * write; the event claim keeps it idempotent.
 */
export async function bumpConversationInbound(
  conversationId: string,
  input: {
    channel: MessageChannel;
    preview: string;
    subject: string | null;
    currentUnread: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    unread_count: input.currentUnread + 1,
    last_message_at: now,
    last_message_preview: input.preview,
    last_message_channel: input.channel,
    last_message_direction: "inbound",
    updated_at: now,
  };
  if (input.channel === "email" && input.subject) patch.subject = input.subject;
  const { error } = await insforge.database
    .from("conversations")
    .update(patch)
    .eq("id", conversationId);
  if (error) throw error;
}

export interface OwnedSmsChannel {
  workspace_id: string;
  config: Record<string, unknown>;
}

/**
 * Resolve the workspace that owns the Twilio number the SMS was sent TO
 * (REQ-SEC-03). The number is stored in workspace_channels.config.phone_number.
 */
export async function findSmsWorkspaceByNumber(
  toNumber: string
): Promise<OwnedSmsChannel | null> {
  const { data } = await insforge.database
    .from("workspace_channels")
    .select("workspace_id, config")
    .eq("channel", "sms")
    .eq("status", "active") // never route inbound to a disabled channel
    .eq("config->>phone_number", toNumber)
    .limit(1);
  return (data?.[0] as OwnedSmsChannel | undefined) ?? null;
}

export interface MatchedContact {
  id: string;
}

/**
 * Match a contact by phone WITHIN the given workspace, using a single indexed
 * `.in("phone", candidates)` query over the plausible stored representations of
 * the E.164 (P2-17). This replaces the previous full-workspace scan +
 * per-row libphonenumber call, which was an unbounded CPU/spend amplifier on
 * every unrecognized inbound SMS. Legacy formats outside the candidate set fall
 * through to auto-create (documented v1 limitation).
 */
export async function findContactByPhone(
  workspaceId: string,
  e164: string
): Promise<MatchedContact | null> {
  const candidates = phoneMatchCandidates(e164);
  const { data } = await insforge.database
    .from("contacts")
    .select("id, phone")
    .eq("workspace_id", workspaceId)
    .in("phone", candidates)
    .limit(1);
  return (data?.[0] as MatchedContact | undefined) ?? null;
}

/**
 * Auto-create a phone-only contact for an unknown inbound SMS sender (P2-18),
 * tagged `source:sms-inbound`. Names are stored empty (the schema may require
 * NOT NULL). Inbound never mutates existing contacts (REQ-SEC-07) — this only
 * runs when no contact matched.
 */
export async function createInboundSmsContact(
  workspaceId: string,
  e164: string
): Promise<{ id: string }> {
  const contactId = randomUUID();
  const { data, error } = await insforge.database
    .from("contacts")
    .insert({
      id: contactId,
      workspace_id: workspaceId,
      first_name: "",
      last_name: "",
      phone: e164,
    })
    .select()
    .single();

  // Concurrent first-inbound race: two callers both saw "no match" and tried to
  // create. The partial unique index uq_contacts_ws_phone on (workspace_id,
  // phone) makes the loser's insert conflict — we re-select the winner instead
  // of surfacing a 500 or creating a duplicate (same pattern as
  // ensureConversation). This fallback depends on that index existing to raise
  // the unique violation; it is live on prod (see
  // migrations/20260805120000_messaging-center.sql).
  if (error) {
    const { data: existing } = await insforge.database
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", e164)
      .limit(1);
    if (existing?.[0]) return existing[0] as { id: string };
    throw error;
  }
  const created = data as { id: string };

  const tagId = await findOrCreateTag(workspaceId, "source:sms-inbound");
  await insforge.database
    .from("contact_tags")
    .insert({ contact_id: created.id, tag_id: tagId });

  return created;
}

async function findOrCreateTag(
  workspaceId: string,
  name: string
): Promise<string> {
  const { data: existing } = await insforge.database
    .from("tags")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", name)
    .limit(1);
  if (existing?.[0]) return (existing[0] as { id: string }).id;

  const { data: created, error } = await insforge.database
    .from("tags")
    .insert({ id: randomUUID(), workspace_id: workspaceId, name })
    .select()
    .single();
  if (error) throw error;
  return (created as { id: string }).id;
}
