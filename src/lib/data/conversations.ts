import "server-only";
import { insforge } from "@/lib/insforge/server";
import type {
  Conversation,
  Message,
  MessageChannel,
} from "@/types/messaging";
import { findSuppression, type SuppressionReason } from "@/lib/messaging/suppressions";
import { ensureConversation } from "@/lib/messaging/send-message";

/**
 * Data-access layer for the Conversations inbox (Phase 3). Every function is
 * workspace-scoped: it takes `workspaceId` from the caller's `requireTenantContext()`
 * and filters every query by it. Fetch-by-id is always fetch-by-id-AND-workspace
 * (never fetch-then-compare) so a cross-tenant id resolves to "not found", not a
 * leaked row (REQ-SEC-15.2). `organization_id` is never used as a query filter
 * (A-11) — `workspace_id` alone is the tenancy boundary.
 */

/** A conversation joined with the minimal contact identity the list UI needs. */
export interface ConversationListItem {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_channel: MessageChannel | null;
  last_message_direction: "inbound" | "outbound" | null;
  unread_count: number;
  status: "open" | "closed";
}

export interface ListConversationsOptions {
  /** email | sms — filters on last_message_channel. */
  channel?: MessageChannel;
  /** only conversations with unread_count > 0. */
  unread?: boolean;
  /** search contact name/email/phone + last_message_preview (A-10). */
  q?: string;
  limit?: number;
}

interface ContactSummaryRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

function contactDisplayName(row: ContactSummaryRow | undefined): string {
  if (!row) return "Unknown contact";
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return name || row.email || row.phone || "Unnamed contact";
}

/**
 * List threads for the inbox. Only rows with `last_message_at IS NOT NULL` are
 * returned, so campaign token-holder conversations stay invisible until a real
 * message arrives (P3-04b / A-2/A-3). Sorted newest-first. The `q` search runs
 * over the joined contact fields + the stored preview only (A-10) — never over
 * message bodies.
 */
export async function listConversations(
  workspaceId: string,
  options: ListConversationsOptions = {}
): Promise<ConversationListItem[]> {
  let query = insforge.database
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("last_message_at", "is", null);

  if (options.channel) {
    query = query.eq("last_message_channel", options.channel);
  }
  if (options.unread) {
    query = query.gt("unread_count", 0);
  }

  const { data, error } = await query
    .order("last_message_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (error) throw error;

  const conversations = (data ?? []) as Conversation[];
  if (conversations.length === 0) return [];

  // Join contact identity in a single indexed lookup (no FK-embed: the live DB
  // keys tenancy on TEXT workspace_id and carries no FK constraints).
  const contactIds = Array.from(new Set(conversations.map((c) => c.contact_id)));
  const { data: contactRows } = await insforge.database
    .from("contacts")
    .select("id, first_name, last_name, email, phone")
    .eq("workspace_id", workspaceId)
    .in("id", contactIds);
  const contactsById = new Map<string, ContactSummaryRow>();
  for (const row of (contactRows ?? []) as ContactSummaryRow[]) {
    contactsById.set(row.id, row);
  }

  const items: ConversationListItem[] = conversations.map((c) => {
    const contact = contactsById.get(c.contact_id);
    return {
      id: c.id,
      contact_id: c.contact_id,
      contact_name: contactDisplayName(contact),
      contact_email: contact?.email ?? null,
      contact_phone: contact?.phone ?? null,
      subject: c.subject,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview,
      last_message_channel: c.last_message_channel,
      last_message_direction: c.last_message_direction,
      unread_count: c.unread_count,
      status: c.status,
    };
  });

  // v1 limitation (flag for Phase 5): `q` filters in-memory over the joined
  // contact fields + preview, so it only searches within the most-recent page
  // (limit above). A PostgREST-side filter is deliberately NOT used: the search
  // spans two tables (contacts + conversations) and a concatenated name, so it
  // would require hand-building an `or=(...)` string from the user's term — an
  // injection surface the security review explicitly ruled out. Revisit in Phase 5
  // with a proper indexed/search-column approach.
  const q = options.q?.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystacks = [
      item.contact_name,
      item.contact_email,
      item.contact_phone,
      item.last_message_preview,
    ];
    return haystacks.some((h) => h?.toLowerCase().includes(q));
  });
}

/**
 * Count of conversations with unread_count > 0 — a CONVERSATION count for the
 * nav badge, not a message count (P3-06).
 */
export async function countUnreadConversations(
  workspaceId: string
): Promise<number> {
  const { count, error } = await insforge.database
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gt("unread_count", 0);
  if (error) throw error;
  return count ?? 0;
}

/** Per-channel send availability for the composer (P3-14). */
export interface ChannelAvailability {
  /** true when the contact has an address AND is not hard-blocked. */
  enabled: boolean;
  /** true when the contact has an address for this channel at all. */
  hasAddress: boolean;
  /** suppression reason on this channel, if any. */
  suppressed: SuppressionReason | null;
  /** human-readable reason the channel is unavailable, or null when enabled. */
  disabledReason: string | null;
  /** a non-blocking warning to show even though the channel is enabled. */
  warning: string | null;
}

export interface ConversationDetail {
  conversation: Conversation;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  messages: Message[];
  channels: {
    email: ChannelAvailability;
    sms: ChannelAvailability;
  };
}

/**
 * Fetch a thread by id AND workspace, its paginated messages (oldest first),
 * the contact identity, and the per-channel composer availability. Returns null
 * when the id does not belong to the workspace — the route turns that into a 404
 * (REQ-SEC-15.2, P3-02).
 */
export async function getConversationDetail(
  workspaceId: string,
  conversationId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ConversationDetail | null> {
  const { data: convRows } = await insforge.database
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .limit(1);
  const conversation = (convRows?.[0] as Conversation | undefined) ?? null;
  if (!conversation) return null;

  const { data: contactRows } = await insforge.database
    .from("contacts")
    .select("id, first_name, last_name, email, phone")
    .eq("workspace_id", workspaceId)
    .eq("id", conversation.contact_id)
    .limit(1);
  const contactRow = (contactRows?.[0] as ContactSummaryRow | undefined) ?? undefined;

  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const { data: messageRows, error: msgError } = await insforge.database
    .from("messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (msgError) throw msgError;

  const email = contactRow?.email ?? null;
  const phone = contactRow?.phone ?? null;
  const [emailSupp, smsSupp] = await Promise.all([
    email ? findSuppression(workspaceId, "email", email) : Promise.resolve(null),
    phone ? findSuppression(workspaceId, "sms", phone) : Promise.resolve(null),
  ]);

  return {
    conversation,
    contact: {
      id: conversation.contact_id,
      name: contactDisplayName(contactRow),
      email,
      phone,
    },
    messages: (messageRows ?? []) as Message[],
    channels: {
      email: emailAvailability(email, emailSupp?.reason ?? null),
      sms: smsAvailability(phone, smsSupp?.reason ?? null),
    },
  };
}

/**
 * Email composer policy (mirrors send-message.ts, P1-29/P1-30/P3-14):
 * - no address        → disabled
 * - bounce            → disabled (undeliverable is undeliverable)
 * - unsubscribe/complaint → ENABLED with a non-blocking warning
 * - manual            → disabled
 */
function emailAvailability(
  address: string | null,
  reason: SuppressionReason | null
): ChannelAvailability {
  if (!address) {
    return {
      enabled: false,
      hasAddress: false,
      suppressed: null,
      disabledReason: "No email address on this contact.",
      warning: null,
    };
  }
  if (reason === "bounce") {
    return {
      enabled: false,
      hasAddress: true,
      suppressed: reason,
      disabledReason: "This email address hard-bounced and is undeliverable.",
      warning: null,
    };
  }
  if (reason === "manual") {
    return {
      enabled: false,
      hasAddress: true,
      suppressed: reason,
      disabledReason: "This contact was manually blocked from email.",
      warning: null,
    };
  }
  if (reason === "unsubscribe" || reason === "complaint") {
    return {
      enabled: true,
      hasAddress: true,
      suppressed: reason,
      disabledReason: null,
      warning:
        reason === "unsubscribe"
          ? "This contact unsubscribed from marketing. A 1:1 reply is allowed."
          : "This contact reported a previous email as spam. Send with care.",
    };
  }
  return {
    enabled: true,
    hasAddress: true,
    suppressed: null,
    disabledReason: null,
    warning: null,
  };
}

/** SMS composer policy: STOP (or any suppression) hard-blocks all sends (P1-28). */
function smsAvailability(
  address: string | null,
  reason: SuppressionReason | null
): ChannelAvailability {
  if (!address) {
    return {
      enabled: false,
      hasAddress: false,
      suppressed: null,
      disabledReason: "No phone number on this contact.",
      warning: null,
    };
  }
  if (reason) {
    return {
      enabled: false,
      hasAddress: true,
      suppressed: reason,
      disabledReason:
        reason === "stop"
          ? "This contact texted STOP and opted out of SMS."
          : "This contact is on the SMS opt-out list.",
      warning: null,
    };
  }
  return {
    enabled: true,
    hasAddress: true,
    suppressed: null,
    disabledReason: null,
    warning: null,
  };
}

/**
 * Zero a conversation's unread_count (P3-08). Fetch-by-id-AND-workspace first so
 * a cross-tenant id returns `false` (→ 404) rather than mutating nothing and
 * lying with a 200. Idempotent: an already-read thread stays at 0 (P3-09).
 */
export async function markConversationRead(
  workspaceId: string,
  conversationId: string
): Promise<boolean> {
  const { data } = await insforge.database
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (!data?.[0]) return false;

  const { error } = await insforge.database
    .from("conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return true;
}

/**
 * Resolve the conversation id for a contact, creating a token-holder row if none
 * exists (P3-20 deep-link "opens or creates"). The contact is verified to belong
 * to the workspace first, so a foreign contactId returns null (→ 404) rather than
 * minting a dangling conversation (REQ-SEC-15.5). A freshly-created row has
 * last_message_at NULL, so it stays hidden from the inbox until the first send.
 */
export async function resolveConversationForContact(
  workspaceId: string,
  contactId: string
): Promise<string | null> {
  const { data } = await insforge.database
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (!data?.[0]) return null;

  const conversation = await ensureConversation(workspaceId, contactId);
  return conversation.id;
}

/** Load a thread's contact_id, scoped to the workspace (for the in-thread send route). */
export async function getConversationContactId(
  workspaceId: string,
  conversationId: string
): Promise<string | null> {
  const { data } = await insforge.database
    .from("conversations")
    .select("contact_id")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .limit(1);
  return (data?.[0] as { contact_id: string } | undefined)?.contact_id ?? null;
}
